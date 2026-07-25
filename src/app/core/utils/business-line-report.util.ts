import { Venda } from '@core/interfaces/venda.interface';
import { Expense } from '@core/interfaces/expense.interface';
import { Plantel } from '@core/interfaces/plantel.interface';
import { Product } from '@core/interfaces/product.interface';
import {
  BusinessLineReport,
  ProductLineResult,
  Species,
  SpeciesAmounts,
  SpeciesMonthlyPoint,
  SpeciesTotals,
} from '@core/interfaces/business-line-report.interface';

/**
 * Cálculos de rateio para o relatório "Análise por Linha de Negócio"
 * (codorna x galinha, por espécie e por produto).
 *
 * Critério validado em planilha com o usuário:
 * - Despesa cuja descrição/categoria menciona "codorna" ou "galinha" -> 100% daquela espécie.
 * - Despesa compartilhada (sem menção, ou mencionando as duas) -> rateada pelo tamanho do
 *   plantel de cada espécie (dado real de `flock`, nunca um percentual fixo).
 * - Produto "misto" (ex.: kit com ovo de codorna + galinha) -> receita dividida pelo valor
 *   implícito de cada tipo de ovo dentro do kit (proporção de preço/quantidade por tipo).
 *
 * Todas as funções aqui são puras (sem Angular, sem IndexedDB) para poderem ser testadas
 * isoladamente — quem monta os dados de entrada (services/componentes) fica responsável só
 * por buscar os stores e chamar essas funções.
 */

/**
 * Detecta menções explícitas de espécie num texto livre (nome de produto, descrição/categoria
 * de despesa). Ordenadas pela posição em que cada palavra aparece no texto (não uma ordem fixa)
 * — importante pra quem depender de qual espécie vem "primeiro" no texto (ex.: nome de kit misto).
 */
export function detectSpeciesMentions(text: string): Species[] {
  const lower = text.toLowerCase();
  const indices: { species: Species; index: number }[] = [];
  const codornaIndex = lower.indexOf('codorna');
  const galinhaIndex = lower.indexOf('galinha');
  if (codornaIndex !== -1) indices.push({ species: 'codorna', index: codornaIndex });
  if (galinhaIndex !== -1) indices.push({ species: 'galinha', index: galinhaIndex });
  return indices.sort((a, b) => a.index - b.index).map((i) => i.species);
}

/** Classifica o `species` de um registro de `flock`/Plantel numa das duas espécies, ou `null` se ambíguo/não identificado. */
export function classifyFlockSpecies(speciesLabel: string): Species | null {
  const mentions = detectSpeciesMentions(speciesLabel);
  return mentions.length === 1 ? mentions[0] : null;
}

/**
 * Proporção do plantel (tamanho real, não percentual fixo) entre as duas espécies —
 * usada para ratear despesas compartilhadas. Sem dados de plantel, cai num rateio
 * neutro 50/50 (não há como inferir proporção real).
 */
export function computeFlockRatio(flock: Pick<Plantel, 'species' | 'quantity'>[]): SpeciesAmounts {
  const totals: SpeciesAmounts = { codorna: 0, galinha: 0 };
  for (const item of flock) {
    const species = classifyFlockSpecies(item.species);
    if (species) totals[species] += item.quantity;
  }
  const sum = totals.codorna + totals.galinha;
  if (sum <= 0) {
    return { codorna: 0.5, galinha: 0.5 };
  }
  return { codorna: totals.codorna / sum, galinha: totals.galinha / sum };
}

/**
 * Rateia uma despesa entre as espécies: 100% pra espécie mencionada explicitamente na
 * descrição/categoria, ou proporcional ao plantel quando é compartilhada (sem menção, ou
 * mencionando as duas ao mesmo tempo — ex.: "Ração codornas e galinhas").
 */
export function allocateExpenseAmount(
  expense: Pick<Expense, 'description' | 'category' | 'amount'>,
  flockRatio: SpeciesAmounts,
): SpeciesAmounts {
  const mentions = new Set<Species>([
    ...detectSpeciesMentions(expense.description ?? ''),
    ...detectSpeciesMentions(expense.category ?? ''),
  ]);

  if (mentions.size === 1) {
    const [species] = mentions;
    return species === 'codorna'
      ? { codorna: expense.amount, galinha: 0 }
      : { codorna: 0, galinha: expense.amount };
  }

  return {
    codorna: expense.amount * flockRatio.codorna,
    galinha: expense.amount * flockRatio.galinha,
  };
}

export interface ProductComposition {
  codorna: number;
  galinha: number;
}

// Casa "50 ovos de codorna", "5 ovos Galinha + 50 Codorna" etc.: um número seguido,
// a até 12 caracteres de distância, pela palavra da espécie. A janela curta evita
// casar dígitos que não são contagem de ovos (ex.: "1 Bandeja de ovos de galinha",
// onde "1" é a bandeja, não o ovo — nesse caso cai no fallback por eggsPerUnit).
const COMPOSITION_REGEX = /(\d+(?:[.,]\d+)?)[^\d]{0,12}?(codorna|galinha)/gi;

/** Extrai do nome do produto quantas unidades de cada espécie o texto menciona explicitamente (ex.: kits mistos). */
export function parseProductComposition(productName: string): ProductComposition {
  const result: ProductComposition = { codorna: 0, galinha: 0 };
  const regex = new RegExp(COMPOSITION_REGEX);
  let match: RegExpExecArray | null;
  while ((match = regex.exec(productName)) !== null) {
    const quantity = Number(match[1].replace(',', '.'));
    const species: Species = match[2].toLowerCase().startsWith('codorna') ? 'codorna' : 'galinha';
    result[species] += quantity;
  }
  return result;
}

/**
 * Composição em ovos de um produto, por espécie. Usa a contagem explícita no nome quando
 * dá pra parsear (kits mistos); produto de espécie única sem número parseável (ex.: "1
 * Bandeja de ovos de galinha") cai no `eggsPerUnit` cadastrado no catálogo inteiro pra
 * aquela espécie.
 */
export function resolveProductComposition(
  product: Pick<Product, 'name' | 'eggsPerUnit'>,
): ProductComposition {
  const parsed = parseProductComposition(product.name);
  if (parsed.codorna > 0 || parsed.galinha > 0) {
    return parsed;
  }
  const mentions = detectSpeciesMentions(product.name);
  if (mentions.length === 1) {
    return mentions[0] === 'codorna'
      ? { codorna: product.eggsPerUnit, galinha: 0 }
      : { codorna: 0, galinha: product.eggsPerUnit };
  }
  return { codorna: 0, galinha: 0 };
}

/**
 * Preço médio implícito por ovo de cada espécie, calculado a partir dos produtos de
 * espécie única do catálogo (ex.: "50 ovos de codorna" a R$15 -> R$0,30/ovo). Usado só
 * pra ratear a receita de produtos mistos (kits) entre as duas espécies. `null` quando o
 * catálogo não tem nenhum produto de espécie única pra servir de referência.
 */
export function computeEggUnitPrices(
  products: Pick<Product, 'name' | 'unitPrice' | 'eggsPerUnit'>[],
): Record<Species, number | null> {
  const totals: Record<Species, { value: number; eggs: number }> = {
    codorna: { value: 0, eggs: 0 },
    galinha: { value: 0, eggs: 0 },
  };
  for (const product of products) {
    const mentions = detectSpeciesMentions(product.name);
    if (mentions.length !== 1 || product.eggsPerUnit <= 0) continue;
    const [species] = mentions;
    totals[species].value += product.unitPrice;
    totals[species].eggs += product.eggsPerUnit;
  }
  return {
    codorna: totals.codorna.eggs > 0 ? totals.codorna.value / totals.codorna.eggs : null,
    galinha: totals.galinha.eggs > 0 ? totals.galinha.value / totals.galinha.eggs : null,
  };
}

/**
 * Rateia o valor de uma venda entre as espécies: 100% pra espécie única do produto, ou
 * dividido pelo valor implícito de cada tipo de ovo quando o produto é misto (menciona as
 * duas espécies no nome). Produto sem nenhuma menção reconhecível (não dá pra classificar)
 * não entra no rateio por espécie.
 */
export function allocateSaleAmount(
  sale: Pick<Venda, 'product' | 'total'>,
  product: Pick<Product, 'name' | 'eggsPerUnit'> | undefined,
  eggUnitPrices: Record<Species, number | null>,
): SpeciesAmounts {
  const productName = product?.name ?? sale.product;
  const mentions = detectSpeciesMentions(productName);

  if (mentions.length === 1) {
    const [species] = mentions;
    return species === 'codorna'
      ? { codorna: sale.total, galinha: 0 }
      : { codorna: 0, galinha: sale.total };
  }

  if (mentions.length === 2) {
    const composition = resolveProductComposition(product ?? { name: productName, eggsPerUnit: 0 });
    const impliedCodorna = composition.codorna * (eggUnitPrices.codorna ?? 0);
    const impliedGalinha = composition.galinha * (eggUnitPrices.galinha ?? 0);
    const impliedTotal = impliedCodorna + impliedGalinha;
    if (impliedTotal > 0) {
      return {
        codorna: sale.total * (impliedCodorna / impliedTotal),
        galinha: sale.total * (impliedGalinha / impliedTotal),
      };
    }
  }

  return { codorna: 0, galinha: 0 };
}

function toSpeciesTotals(revenue: number, cost: number): SpeciesTotals {
  const profit = revenue - cost;
  return {
    revenue,
    cost,
    profit,
    marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
  };
}

/** Monta o relatório agregado por espécie (codorna x galinha) pro período já filtrado pelo chamador. */
export function buildBusinessLineReport(
  sales: Venda[],
  expenses: Expense[],
  flock: Plantel[],
  products: Product[],
): BusinessLineReport {
  const flockRatio = computeFlockRatio(flock);
  const eggUnitPrices = computeEggUnitPrices(products);
  const productByName = new Map(products.map((p) => [p.name, p]));

  const revenue: SpeciesAmounts = { codorna: 0, galinha: 0 };
  for (const sale of sales) {
    const alloc = allocateSaleAmount(sale, productByName.get(sale.product), eggUnitPrices);
    revenue.codorna += alloc.codorna;
    revenue.galinha += alloc.galinha;
  }

  const cost: SpeciesAmounts = { codorna: 0, galinha: 0 };
  for (const expense of expenses) {
    const alloc = allocateExpenseAmount(expense, flockRatio);
    cost.codorna += alloc.codorna;
    cost.galinha += alloc.galinha;
  }

  const codorna = toSpeciesTotals(revenue.codorna, cost.codorna);
  const galinha = toSpeciesTotals(revenue.galinha, cost.galinha);
  const galinhaCobreCustos = galinha.profit >= 0;

  return {
    codorna,
    galinha,
    galinhaCobreCustos,
    diferencaCobertaPelaCodorna: galinhaCobreCustos ? 0 : Math.abs(galinha.profit),
  };
}

/**
 * Monta o relatório por produto: receita e volume vêm direto das vendas do produto; o
 * custo é obtido aplicando a "taxa de custo" de cada espécie (custo da espécie / receita
 * da espécie, no rateio por espécie acima) sobre a fatia de receita do produto naquela
 * espécie — assim a margem por produto soma de volta pra margem por espécie. Ordenado por
 * margem (pior primeiro).
 */
export function buildProductReport(
  sales: Venda[],
  expenses: Expense[],
  flock: Plantel[],
  products: Product[],
): ProductLineResult[] {
  const flockRatio = computeFlockRatio(flock);
  const eggUnitPrices = computeEggUnitPrices(products);
  const productByName = new Map(products.map((p) => [p.name, p]));

  const revenueByProduct = new Map<string, number>();
  const quantityByProduct = new Map<string, number>();
  const speciesRevenueByProduct = new Map<string, SpeciesAmounts>();
  const speciesRevenue: SpeciesAmounts = { codorna: 0, galinha: 0 };

  for (const sale of sales) {
    revenueByProduct.set(sale.product, (revenueByProduct.get(sale.product) ?? 0) + sale.total);
    quantityByProduct.set(sale.product, (quantityByProduct.get(sale.product) ?? 0) + sale.quantity);

    const alloc = allocateSaleAmount(sale, productByName.get(sale.product), eggUnitPrices);
    const prev = speciesRevenueByProduct.get(sale.product) ?? { codorna: 0, galinha: 0 };
    prev.codorna += alloc.codorna;
    prev.galinha += alloc.galinha;
    speciesRevenueByProduct.set(sale.product, prev);
    speciesRevenue.codorna += alloc.codorna;
    speciesRevenue.galinha += alloc.galinha;
  }

  const speciesCost: SpeciesAmounts = { codorna: 0, galinha: 0 };
  for (const expense of expenses) {
    const alloc = allocateExpenseAmount(expense, flockRatio);
    speciesCost.codorna += alloc.codorna;
    speciesCost.galinha += alloc.galinha;
  }

  const costRate: SpeciesAmounts = {
    codorna: speciesRevenue.codorna > 0 ? speciesCost.codorna / speciesRevenue.codorna : 0,
    galinha: speciesRevenue.galinha > 0 ? speciesCost.galinha / speciesRevenue.galinha : 0,
  };

  const results: ProductLineResult[] = [];
  for (const [name, revenue] of revenueByProduct) {
    const perSpecies = speciesRevenueByProduct.get(name) ?? { codorna: 0, galinha: 0 };
    const cost = perSpecies.codorna * costRate.codorna + perSpecies.galinha * costRate.galinha;
    const profit = revenue - cost;
    results.push({
      name,
      revenue,
      cost,
      profit,
      marginPct: revenue > 0 ? (profit / revenue) * 100 : 0,
      quantitySold: quantityByProduct.get(name) ?? 0,
    });
  }

  return results.sort((a, b) => a.marginPct - b.marginPct);
}

/**
 * Remove da lista as vendas cujo `id` esteja marcado como "evento isolado" (`SaleExclusion`).
 * Função genérica (não amarrada a nenhum produto/espécie específica) pra generalizar: qualquer
 * venda pode ser desconsiderada da análise no futuro, sem apagar o registro original de `sales`.
 */
export function excludeSalesByIds<T extends { id: string }>(
  sales: T[],
  excludedSaleIds: ReadonlySet<string>,
): T[] {
  if (excludedSaleIds.size === 0) {
    return sales;
  }
  return sales.filter((sale) => !excludedSaleIds.has(sale.id));
}

/** Série mensal de receita por espécie (pro gráfico comparativo ao longo do tempo). Só meses com venda real aparecem. */
export function buildSpeciesRevenueSeries(sales: Venda[], products: Product[]): SpeciesMonthlyPoint[] {
  const eggUnitPrices = computeEggUnitPrices(products);
  const productByName = new Map(products.map((p) => [p.name, p]));
  const byMonth = new Map<string, SpeciesAmounts>();

  for (const sale of sales) {
    const month = sale.date.slice(0, 7);
    const alloc = allocateSaleAmount(sale, productByName.get(sale.product), eggUnitPrices);
    const entry = byMonth.get(month) ?? { codorna: 0, galinha: 0 };
    entry.codorna += alloc.codorna;
    entry.galinha += alloc.galinha;
    byMonth.set(month, entry);
  }

  return [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, totals]) => ({
      month,
      codornaRevenue: totals.codorna,
      galinhaRevenue: totals.galinha,
    }));
}
