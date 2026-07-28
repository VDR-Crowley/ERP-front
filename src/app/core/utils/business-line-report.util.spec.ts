import { Venda } from '@core/interfaces/venda.interface';
import { Expense } from '@core/interfaces/expense.interface';
import { Plantel } from '@core/interfaces/plantel.interface';
import { Product } from '@core/interfaces/product.interface';
import {
  allocateExpenseAmount,
  allocateSaleAmount,
  buildBusinessLineReport,
  buildProductReport,
  buildSpeciesRevenueSeries,
  classifyFlockSpecies,
  computeEggUnitPrices,
  computeFlockRatio,
  detectSpeciesMentions,
  excludeSalesByIds,
  parseProductComposition,
  resolveProductComposition,
} from './business-line-report.util';

function venda(overrides: Partial<Venda>): Venda {
  return {
    date: '2026-07-01',
    product: '50 ovos de codorna',
    quantity: 1,
    unitPrice: 15,
    total: 15,
    paymentPending: false,
    buyer: 'Comprador',
    seller: 'Vendedor',
    deliveryPending: false,
    deliveryDate: null,
    ...overrides,
  };
}

function expense(overrides: Partial<Expense>): Expense {
  return {
    date: '2026-07-01',
    description: '',
    category: '',
    amount: 0,
    paid: true,
    ...overrides,
  };
}

const PRODUTOS_MOCK: Product[] = [
  { name: '1 Bandeja de ovos de galinha', unit: 'Bandeja (30 ovos)', unitPrice: 20, stock: 12, eggsPerUnit: 30 },
  { name: '50 ovos de codorna', unit: 'Bandeja (50 ovos)', unitPrice: 15, stock: 26, eggsPerUnit: 50 },
  { name: '30 ovos galinha', unit: 'Bandeja (30 ovos)', unitPrice: 25, stock: 9, eggsPerUnit: 30 },
  { name: '5 ovos Galinha + 50 Codorna', unit: 'Kit misto', unitPrice: 30, stock: 15, eggsPerUnit: 55 },
];

const PLANTEL_MOCK: Plantel[] = [
  { species: 'Codornas', quantity: 130, feedBagsPerMonth: 3, bagPrice: 106, monthlyTotal: 318 },
  { species: 'Galinhas Embrapa 051', quantity: 32, feedBagsPerMonth: 4, bagPrice: 100, monthlyTotal: 400 },
];

describe('detectSpeciesMentions', () => {
  it('detecta menção única de cada espécie, plural e case-insensitive', () => {
    expect(detectSpeciesMentions('Ração CODORNAS')).toEqual(['codorna']);
    expect(detectSpeciesMentions('Galinhas Embrapa 051')).toEqual(['galinha']);
  });

  it('detecta as duas espécies quando ambas aparecem no texto', () => {
    expect(detectSpeciesMentions('5 ovos Galinha + 50 Codorna')).toEqual(['galinha', 'codorna']);
  });

  it('retorna vazio quando não há menção', () => {
    expect(detectSpeciesMentions('Conta de energia')).toEqual([]);
  });
});

describe('classifyFlockSpecies', () => {
  it('classifica plantel de espécie única', () => {
    expect(classifyFlockSpecies('Codornas')).toBe('codorna');
    expect(classifyFlockSpecies('Galinhas Embrapa 051')).toBe('galinha');
  });

  it('retorna null quando não identifica a espécie', () => {
    expect(classifyFlockSpecies('Aves')).toBeNull();
  });
});

describe('computeFlockRatio', () => {
  it('rateia proporcional ao tamanho real do plantel (130 codorna / 32 galinha)', () => {
    const ratio = computeFlockRatio(PLANTEL_MOCK);
    expect(ratio.codorna).toBeCloseTo(130 / 162, 5);
    expect(ratio.galinha).toBeCloseTo(32 / 162, 5);
  });

  it('cai em 50/50 quando não há plantel classificável', () => {
    expect(computeFlockRatio([])).toEqual({ codorna: 0.5, galinha: 0.5 });
  });
});

describe('allocateExpenseAmount', () => {
  const flockRatio = computeFlockRatio(PLANTEL_MOCK);

  it('aloca 100% pra espécie mencionada explicitamente na descrição', () => {
    const result = allocateExpenseAmount(
      expense({ description: 'Ração codornas', category: 'Ração', amount: 106 }),
      flockRatio,
    );
    expect(result).toEqual({ codorna: 106, galinha: 0 });
  });

  it('aloca 100% pra espécie mencionada na categoria quando a descrição não menciona', () => {
    const result = allocateExpenseAmount(
      expense({ description: 'Compra de insumo', category: 'Galinha', amount: 50 }),
      flockRatio,
    );
    expect(result).toEqual({ codorna: 0, galinha: 50 });
  });

  it('rateia despesa compartilhada (sem menção) pelo tamanho do plantel', () => {
    const result = allocateExpenseAmount(expense({ description: 'Feno', category: 'Insumo geral', amount: 100 }), flockRatio);
    expect(result.codorna).toBeCloseTo(100 * (130 / 162), 5);
    expect(result.galinha).toBeCloseTo(100 * (32 / 162), 5);
    expect(result.codorna + result.galinha).toBeCloseTo(100, 5);
  });

  it('rateia pelo plantel quando o texto menciona as duas espécies ao mesmo tempo', () => {
    const result = allocateExpenseAmount(
      expense({ description: 'Ração codornas e galinhas', category: 'Ração', amount: 200 }),
      flockRatio,
    );
    expect(result.codorna).toBeCloseTo(200 * (130 / 162), 5);
    expect(result.galinha).toBeCloseTo(200 * (32 / 162), 5);
  });

  it('categoria explícita de espécie tem prioridade sobre a descrição quando as duas divergem (caso real: saco de ração de galinha recategorizado manualmente pra codorna)', () => {
    // Caso real reportado: despesa comprada como "Ração galinhas Embrapa" (descrição menciona
    // galinha) mas o usuário recategorizou manualmente pra "Codornas" porque o saco foi de fato
    // usado pras codornas (não achou ração de codorna no comércio). A categoria é o campo que o
    // usuário edita deliberadamente pra corrigir a classificação — tem que vencer a descrição.
    const result = allocateExpenseAmount(
      expense({ description: 'Ração galinhas Embrapa', category: 'Codornas', amount: 106 }),
      flockRatio,
    );
    expect(result).toEqual({ codorna: 106, galinha: 0 });
  });
});

describe('allocateExpenseAmount com override manual de espécie', () => {
  const flockRatio = computeFlockRatio(PLANTEL_MOCK);

  it('override "codorna" tem prioridade sobre a detecção por texto (categoria/descrição de galinha)', () => {
    const result = allocateExpenseAmount(
      expense({ description: 'Saco de ração de galinha aberto pras codornas', category: 'Ração Galinha', amount: 106 }),
      flockRatio,
      'codorna',
    );
    expect(result).toEqual({ codorna: 106, galinha: 0 });
  });

  it('sem override, mantém a detecção automática por texto (comportamento atual)', () => {
    const result = allocateExpenseAmount(
      expense({ description: 'Compra de insumo', category: 'Galinha', amount: 50 }),
      flockRatio,
    );
    expect(result).toEqual({ codorna: 0, galinha: 50 });
  });

  it('override null força rateio pelo plantel mesmo quando o texto identificaria espécie única', () => {
    const result = allocateExpenseAmount(
      expense({ description: 'Ração codornas', category: 'Ração', amount: 100 }),
      flockRatio,
      null,
    );
    expect(result.codorna).toBeCloseTo(100 * (130 / 162), 5);
    expect(result.galinha).toBeCloseTo(100 * (32 / 162), 5);
  });
});

describe('parseProductComposition', () => {
  it('extrai a composição de um kit misto', () => {
    expect(parseProductComposition('5 ovos Galinha + 50 Codorna')).toEqual({ codorna: 50, galinha: 5 });
  });

  it('extrai a composição de um produto de espécie única com número explícito', () => {
    expect(parseProductComposition('50 ovos de codorna')).toEqual({ codorna: 50, galinha: 0 });
  });

  it('não confunde a contagem de embalagem com contagem de ovos', () => {
    // "1" aqui é a bandeja, não o ovo — não deve virar {galinha: 1}.
    expect(parseProductComposition('1 Bandeja de ovos de galinha')).toEqual({ codorna: 0, galinha: 0 });
  });
});

describe('resolveProductComposition', () => {
  it('usa a composição parseada do nome quando disponível (kit misto)', () => {
    const kit = PRODUTOS_MOCK.find((p) => p.name === '5 ovos Galinha + 50 Codorna')!;
    expect(resolveProductComposition(kit)).toEqual({ codorna: 50, galinha: 5 });
  });

  it('cai no eggsPerUnit do catálogo quando o nome não tem número parseável', () => {
    const bandeja = PRODUTOS_MOCK.find((p) => p.name === '1 Bandeja de ovos de galinha')!;
    expect(resolveProductComposition(bandeja)).toEqual({ codorna: 0, galinha: 30 });
  });
});

describe('computeEggUnitPrices', () => {
  it('calcula o preço médio por ovo de cada espécie a partir dos produtos de espécie única', () => {
    const prices = computeEggUnitPrices(PRODUTOS_MOCK);
    // codorna: só "50 ovos de codorna" (R$15 / 50 ovos)
    expect(prices.codorna).toBeCloseTo(15 / 50, 5);
    // galinha: (20 + 25) / (30 + 30)
    expect(prices.galinha).toBeCloseTo(45 / 60, 5);
  });

  it('retorna null quando não há produto de referência pra espécie', () => {
    expect(computeEggUnitPrices([]).codorna).toBeNull();
  });
});

describe('allocateSaleAmount', () => {
  const eggUnitPrices = computeEggUnitPrices(PRODUTOS_MOCK);
  const productByName = new Map(PRODUTOS_MOCK.map((p) => [p.name, p]));

  it('aloca 100% pra espécie de um produto de espécie única', () => {
    const v = venda({ product: '50 ovos de codorna', total: 15 });
    expect(allocateSaleAmount(v, productByName.get(v.product), eggUnitPrices)).toEqual({
      codorna: 15,
      galinha: 0,
    });
  });

  it('divide a receita do kit misto pelo valor implícito de cada tipo de ovo', () => {
    const v = venda({ product: '5 ovos Galinha + 50 Codorna', total: 30 });
    const result = allocateSaleAmount(v, productByName.get(v.product), eggUnitPrices);
    // implied codorna = 50 * (15/50) = 15; implied galinha = 5 * (45/60) = 3.75
    const impliedCodorna = 50 * (15 / 50);
    const impliedGalinha = 5 * (45 / 60);
    const total = impliedCodorna + impliedGalinha;
    expect(result.codorna).toBeCloseTo(30 * (impliedCodorna / total), 5);
    expect(result.galinha).toBeCloseTo(30 * (impliedGalinha / total), 5);
    expect(result.codorna + result.galinha).toBeCloseTo(30, 5);
  });

  it('não classifica produto sem nenhuma menção de espécie', () => {
    const v = venda({ product: 'Produto genérico', total: 10 });
    expect(allocateSaleAmount(v, undefined, eggUnitPrices)).toEqual({ codorna: 0, galinha: 0 });
  });
});

describe('buildBusinessLineReport', () => {
  it('agrega receita/custo/lucro/margem por espécie e sinaliza se a galinha cobre os próprios custos', () => {
    const sales: Venda[] = [
      venda({ product: '50 ovos de codorna', total: 150, quantity: 10 }),
      venda({ product: '1 Bandeja de ovos de galinha', total: 40, quantity: 2 }),
    ];
    const expenses: Expense[] = [
      expense({ description: 'Ração codornas', category: 'Ração', amount: 106 }),
      expense({ description: 'Ração galinhas', category: 'Ração', amount: 200 }),
    ];

    const report = buildBusinessLineReport(sales, expenses, PLANTEL_MOCK, PRODUTOS_MOCK);

    expect(report.codorna.revenue).toBe(150);
    expect(report.codorna.cost).toBe(106);
    expect(report.codorna.profit).toBe(44);

    expect(report.galinha.revenue).toBe(40);
    expect(report.galinha.cost).toBe(200);
    expect(report.galinha.profit).toBe(-160);

    expect(report.galinhaCobreCustos).toBe(false);
    expect(report.diferencaCobertaPelaCodorna).toBe(160);
  });

  it('marca galinhaCobreCustos true quando o lucro da galinha é >= 0', () => {
    const sales: Venda[] = [venda({ product: '1 Bandeja de ovos de galinha', total: 500, quantity: 25 })];
    const expenses: Expense[] = [expense({ description: 'Ração galinhas', category: 'Ração', amount: 100 })];

    const report = buildBusinessLineReport(sales, expenses, PLANTEL_MOCK, PRODUTOS_MOCK);

    expect(report.galinhaCobreCustos).toBe(true);
    expect(report.diferencaCobertaPelaCodorna).toBe(0);
  });
});

describe('buildBusinessLineReport com override de despesa (expenseSpeciesOverrides)', () => {
  it('usa o override manual no lugar da detecção por texto pra despesa marcada', () => {
    const sales: Venda[] = [venda({ product: '50 ovos de codorna', total: 150, quantity: 10 })];
    const expenses = [
      { ...expense({ description: 'Saco de ração de galinha usado pras codornas', category: 'Ração Galinha', amount: 106 }), id: 'exp-1' },
    ];
    const overrides = new Map<string, 'codorna' | 'galinha' | null>([['exp-1', 'codorna']]);

    const report = buildBusinessLineReport(sales, expenses, PLANTEL_MOCK, PRODUTOS_MOCK, overrides);

    expect(report.codorna.cost).toBe(106);
    expect(report.galinha.cost).toBe(0);
  });

  it('despesa sem entrada no mapa de overrides mantém a detecção automática', () => {
    const sales: Venda[] = [venda({ product: '50 ovos de codorna', total: 150, quantity: 10 })];
    const expenses = [
      { ...expense({ description: 'Ração galinhas', category: 'Ração', amount: 200 }), id: 'exp-2' },
    ];
    const overrides = new Map<string, 'codorna' | 'galinha' | null>([['exp-outro', 'codorna']]);

    const report = buildBusinessLineReport(sales, expenses, PLANTEL_MOCK, PRODUTOS_MOCK, overrides);

    expect(report.galinha.cost).toBe(200);
    expect(report.codorna.cost).toBe(0);
  });
});

describe('buildProductReport', () => {
  it('calcula receita, custo, margem e volume por produto, ordenado por margem crescente', () => {
    const sales: Venda[] = [
      venda({ product: '50 ovos de codorna', total: 150, quantity: 10 }),
      venda({ product: '1 Bandeja de ovos de galinha', total: 40, quantity: 2 }),
    ];
    const expenses: Expense[] = [
      expense({ description: 'Ração codornas', category: 'Ração', amount: 106 }),
      expense({ description: 'Ração galinhas', category: 'Ração', amount: 200 }),
    ];

    const results = buildProductReport(sales, expenses, PLANTEL_MOCK, PRODUTOS_MOCK);

    expect(results).toHaveLength(2);
    const codornaLine = results.find((r) => r.name === '50 ovos de codorna')!;
    const galinhaLine = results.find((r) => r.name === '1 Bandeja de ovos de galinha')!;

    expect(codornaLine.revenue).toBe(150);
    expect(codornaLine.cost).toBe(106);
    expect(codornaLine.quantitySold).toBe(10);

    expect(galinhaLine.revenue).toBe(40);
    expect(galinhaLine.cost).toBe(200);
    expect(galinhaLine.quantitySold).toBe(2);

    // Pior margem (galinha, negativa) vem primeiro.
    expect(results[0].name).toBe('1 Bandeja de ovos de galinha');
  });

  it('mantém custo por espécie independente entre produtos, com plantel diferente, várias despesas com categoria genérica ("Ração"/"Tela"/"Feno") e vários produtos por espécie', () => {
    // Cenário calcado no relato real: Categoria muitas vezes é o TIPO de despesa (Ração, Tela,
    // Feno), não a espécie — só a Descrição indica a espécie nesses casos. Reproduz múltiplos
    // produtos por espécie pra garantir que o costRate de uma espécie não vaza/duplica pra outra.
    const flock: Plantel[] = [
      { species: 'Codornas', quantity: 100, feedBagsPerMonth: 2, bagPrice: 100, monthlyTotal: 200 },
      { species: 'Galinhas Embrapa 051', quantity: 50, feedBagsPerMonth: 2, bagPrice: 100, monthlyTotal: 200 },
    ];
    const products: Product[] = [
      { name: 'Ovos de codorna A', unit: 'Bandeja', unitPrice: 10, stock: 10, eggsPerUnit: 10 },
      { name: 'Ovos de codorna B', unit: 'Bandeja', unitPrice: 10, stock: 10, eggsPerUnit: 10 },
      { name: 'Ovos de galinha A', unit: 'Bandeja', unitPrice: 10, stock: 10, eggsPerUnit: 10 },
      { name: 'Ovos de galinha B', unit: 'Bandeja', unitPrice: 10, stock: 10, eggsPerUnit: 10 },
    ];
    const sales: Venda[] = [
      venda({ date: '2026-06-01', product: 'Ovos de codorna A', total: 100 }),
      venda({ date: '2026-07-01', product: 'Ovos de codorna B', total: 200 }),
      venda({ date: '2026-06-15', product: 'Ovos de galinha A', total: 300 }),
      venda({ date: '2026-07-15', product: 'Ovos de galinha B', total: 400 }),
    ];
    const expenses: Expense[] = [
      // Categoria genérica ("Ração" = tipo de despesa, não espécie) — só a descrição indica a espécie.
      expense({ description: 'Ração galinhas Embrapa', category: 'Ração', amount: 150 }),
      expense({ description: 'Ração codornas', category: 'Ração', amount: 60 }),
      // Espécie só na categoria, descrição genérica.
      expense({ description: 'Compra de insumo mensal', category: 'Galinha', amount: 40 }),
      // Nenhuma menção em lugar nenhum — cai no rateio por plantel (2/3 codorna, 1/3 galinha).
      expense({ description: 'Tela de proteção', category: 'Tela', amount: 90 }),
      expense({ description: 'Feno', category: 'Feno', amount: 30 }),
    ];

    const results = buildProductReport(sales, expenses, flock, products);

    const custoPorEspecie = (prefixo: string) =>
      results.filter((r) => r.name.startsWith(prefixo)).reduce((soma, r) => soma + r.cost, 0);

    const custoCodorna = custoPorEspecie('Ovos de codorna');
    const custoGalinha = custoPorEspecie('Ovos de galinha');

    // codorna: 60 (Ração codornas) + 2/3 de (90 + 30) = 60 + 80 = 140
    // galinha: 150 (Ração galinhas) + 40 (categoria) + 1/3 de (90 + 30) = 150 + 40 + 40 = 230
    expect(custoCodorna).toBeCloseTo(140, 5);
    expect(custoGalinha).toBeCloseTo(230, 5);
    // Guarda de regressão direta: os totais por espécie não podem ser iguais nem vazar um pro outro.
    expect(custoGalinha).not.toBeCloseTo(custoCodorna, 2);

    const galinhaA = results.find((r) => r.name === 'Ovos de galinha A')!;
    const galinhaB = results.find((r) => r.name === 'Ovos de galinha B')!;
    const codornaA = results.find((r) => r.name === 'Ovos de codorna A')!;
    const codornaB = results.find((r) => r.name === 'Ovos de codorna B')!;

    // Custo por produto proporcional à receita, com o costRate da própria espécie — nenhum dos
    // quatro produtos pode compartilhar custo com um produto de outra espécie.
    expect(galinhaA.cost).toBeCloseTo(300 * (230 / 700), 5);
    expect(galinhaB.cost).toBeCloseTo(400 * (230 / 700), 5);
    expect(codornaA.cost).toBeCloseTo(100 * (140 / 300), 5);
    expect(codornaB.cost).toBeCloseTo(200 * (140 / 300), 5);
  });
});

describe('excludeSalesByIds', () => {
  const withId = (id: string, overrides: Partial<Venda> = {}) => ({ ...venda(overrides), id });

  it('remove só as vendas cujo id está no conjunto de excluídos', () => {
    const sales = [withId('a'), withId('b'), withId('c')];
    const result = excludeSalesByIds(sales, new Set(['b']));
    expect(result.map((s) => s.id)).toEqual(['a', 'c']);
  });

  it('retorna a mesma lista (sem cópia desnecessária) quando não há exclusões', () => {
    const sales = [withId('a'), withId('b')];
    const result = excludeSalesByIds(sales, new Set());
    expect(result).toBe(sales);
  });

  it('retorna lista vazia quando todas as vendas estão excluídas', () => {
    const sales = [withId('a'), withId('b')];
    const result = excludeSalesByIds(sales, new Set(['a', 'b']));
    expect(result).toEqual([]);
  });
});

describe('buildSpeciesRevenueSeries', () => {
  it('agrega receita por mês e por espécie, só com meses que têm venda', () => {
    const sales: Venda[] = [
      venda({ date: '2026-06-15', product: '50 ovos de codorna', total: 15 }),
      venda({ date: '2026-07-01', product: '50 ovos de codorna', total: 30 }),
      venda({ date: '2026-07-02', product: '1 Bandeja de ovos de galinha', total: 20 }),
    ];

    const series = buildSpeciesRevenueSeries(sales, PRODUTOS_MOCK);

    expect(series).toEqual([
      { month: '2026-06', codornaRevenue: 15, galinhaRevenue: 0 },
      { month: '2026-07', codornaRevenue: 30, galinhaRevenue: 20 },
    ]);
  });
});
