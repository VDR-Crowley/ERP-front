import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { Dashboard } from './dashboard';
import { Products } from '../products/products';
import { flushAllPendingGets } from '@core/testing/http-settle';
import { dedupeGetInterceptor } from '@core/api/dedupe-get.interceptor';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { environment } from '../../../../environments/environment';

// jsdom (ambiente de teste) não implementa ResizeObserver, usado pelo ApexCharts
// para redimensionar o gráfico ao montar o componente.
/* eslint-disable @typescript-eslint/no-empty-function */
if (typeof ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
/* eslint-enable @typescript-eslint/no-empty-function */

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    await flushAllPendingGets(httpMock);
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/**
 * Bug relatado: `GET /products` disparava 3x ao montar o Dashboard —
 * productsStore, salesStore e vendorStockStore cada um resolve nome<->id de
 * produto com seu próprio fetch independente (ver `_shared.ts`), todos ao
 * mesmo tempo. `dedupeGetInterceptor` coalesce as chamadas concorrentes pra
 * mesma URL em 1 única requisição real.
 */
describe('Dashboard — GET /products dispara só 1x ao montar (com dedupeGetInterceptor)', () => {
  const productsUrl = `${environment.apiUrl}/products`;

  it('só 1 requisição real pra /products mesmo com 3 stores pedindo ao mesmo tempo', async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [
        provideRouter([]),
        provideHttpClient(withInterceptors([dedupeGetInterceptor])),
        provideHttpClientTesting(),
      ],
    }).compileComponents();

    const fixture = TestBed.createComponent(Dashboard);
    const httpMock = TestBed.inject(HttpTestingController);

    // productsStore, salesStore e vendorStockStore chamam http.get(productsUrl)
    // de forma síncrona na construção (dentro de Promise.all antes do 1º
    // await) — nesse ponto já deve haver só 1 requisição pendente, não 3.
    const pendingProducts = httpMock.match(productsUrl);
    expect(pendingProducts.length).toBe(1);
    pendingProducts.forEach((req) => req.flush([]));

    await flushAllPendingGets(httpMock);
    await fixture.whenStable();
  });
});

/**
 * Pedido do Ytallo: o card "Valor em estoque" do Dashboard calculava do
 * módulo antigo Estoque de Ovos (só 2 produtos) e divergia do módulo
 * Produtos (5 produtos, Plantel + vendedores). Invariante: os dois números
 * têm que bater sempre, porque agora vêm da mesma função (totalStockValue).
 */
describe('Dashboard.valorEstoque() — invariante com Products.valorEstoque()', () => {
  let dashboardFixture: ComponentFixture<Dashboard>;
  let productsFixture: ComponentFixture<Products>;

  const productsUrl = `${environment.apiUrl}/products`;
  const vendorStockUrl = `${environment.apiUrl}/vendor-stock`;

  const PRODUCTS_API = [
    { id: 1, name: '50 ovos de codorna', unit: 'pack', unit_price: '15.00', stock: 40, eggs_per_unit: 50 },
    { id: 2, name: '1 Bandeja de ovos de galinha', unit: 'un', unit_price: '20.00', stock: 12, eggs_per_unit: 30 },
    { id: 3, name: 'Ração extra', unit: 'kg', unit_price: '4.00', stock: 25, eggs_per_unit: 0 },
    { id: 4, name: 'Kit misto', unit: 'un', unit_price: '30.00', stock: 6, eggs_per_unit: 0 },
    { id: 5, name: 'Carne de codorna', unit: 'kg', unit_price: '18.00', stock: 9, eggs_per_unit: 0 },
  ];
  // "karol"/"bruno" (ids antigos do IDB) viram vendedor_id 10/20 — não precisam existir de
  // verdade em /vendedores pra esse teste, só reflete no cálculo de valor por produto/id.
  const VENDOR_STOCK_API = [
    { id: 1, product_id: 1, vendedor_id: 10, quantity: 8 },
    { id: 2, product_id: 4, vendedor_id: 20, quantity: 3 },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    dashboardFixture = TestBed.createComponent(Dashboard);
    let httpMock = TestBed.inject(HttpTestingController);
    await flushAllPendingGets(httpMock, { [productsUrl]: PRODUCTS_API, [vendorStockUrl]: VENDOR_STOCK_API });
    await dashboardFixture.whenStable();

    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Products],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    productsFixture = TestBed.createComponent(Products);
    httpMock = TestBed.inject(HttpTestingController);
    await flushAllPendingGets(httpMock, { [productsUrl]: PRODUCTS_API, [vendorStockUrl]: VENDOR_STOCK_API });
    await productsFixture.whenStable();
  });

  it('Dashboard.valorEstoque() bate exatamente com Products.valorEstoque() pro mesmo estoque', () => {
    const dashboardValor = (dashboardFixture.componentInstance as unknown as { valorEstoque: () => number })
      .valorEstoque();
    const productsValor = (productsFixture.componentInstance as unknown as { valorEstoque: () => number })
      .valorEstoque();

    expect(dashboardValor).toBeGreaterThan(0);
    expect(dashboardValor).toBe(productsValor);
    // Confirma que NÃO é o valor antigo do Estoque de Ovos (150+100=250, só 2 produtos).
    expect(dashboardValor).not.toBe(250);
  });
});

/**
 * Bug relatado: em "Tudo", o card "Produção de hoje" do Dashboard (~10000)
 * não batia com "Ovos vendidos" de Relatórios (~8000). Não é bug de cálculo —
 * são métricas diferentes por definição: ovos COLETADOS (daily_productions,
 * sempre >= vendidos) vs. ovos VENDIDOS (vendas × eggsPerUnit). Este teste
 * trava a distinção (renomeado pra "Produção coletada" no template) e confirma
 * que `totalOvosVendidos` — a métrica que de fato bate com Relatórios — usa a
 * mesma fórmula de `resumo().eggsSold` em reports.ts.
 */
describe('Dashboard — ovos coletados (produção) vs. ovos vendidos são métricas distintas', () => {
  const productsUrl = `${environment.apiUrl}/products`;
  const salesUrl = `${environment.apiUrl}/sales`;
  const dailyProductionsUrl = `${environment.apiUrl}/daily-productions`;

  const PRODUCTS_API = [
    { id: 1, name: '50 ovos de codorna', unit: 'pack', unit_price: '15.00', stock: 40, eggs_per_unit: 50 },
    { id: 2, name: '1 Bandeja de ovos de galinha', unit: 'un', unit_price: '20.00', stock: 12, eggs_per_unit: 30 },
  ];
  const DAILY_PRODUCTIONS_API = [
    { id: 1, date: '2026-08-01', quail_eggs: 300, chicken_eggs: 200 },
    { id: 2, date: '2026-08-02', quail_eggs: 250, chicken_eggs: 150 },
  ];
  // Total coletado = 300+200+250+150 = 900. Total vendido = 4×50 + 2×30 = 260.
  // Coletado > vendido de propósito (nem todo ovo do período virou venda ainda).
  const SALES_API = [
    {
      id: 1, date: '2026-08-01', product_id: 1, quantity: 4, unit_price: '15.00', total: '60.00',
      payment_pending: false, buyer: 'Maria', seller_id: 1, delivery_pending: false,
      delivery_date: null, stock_location_type: 'plantel', stock_location_vendedor_id: null,
    },
    {
      id: 2, date: '2026-08-02', product_id: 2, quantity: 2, unit_price: '20.00', total: '40.00',
      payment_pending: false, buyer: 'João', seller_id: 1, delivery_pending: false,
      delivery_date: null, stock_location_type: 'plantel', stock_location_vendedor_id: null,
    },
  ];

  it('producaoHojeTotal soma ovos coletados; totalOvosVendidos soma ovos vendidos; não são o mesmo número', async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(Dashboard);
    TestBed.inject(PeriodFilterService).clear(); // "Tudo" — sem filtro de período
    const httpMock = TestBed.inject(HttpTestingController);
    await flushAllPendingGets(httpMock, {
      [productsUrl]: PRODUCTS_API,
      [salesUrl]: SALES_API,
      [dailyProductionsUrl]: DAILY_PRODUCTIONS_API,
    });
    await fixture.whenStable();

    const dashboard = fixture.componentInstance as unknown as {
      producaoHojeTotal: () => number;
      totalOvosVendidos: () => number;
    };

    expect(dashboard.producaoHojeTotal()).toBe(900);
    expect(dashboard.totalOvosVendidos()).toBe(260);
    expect(dashboard.producaoHojeTotal()).not.toBe(dashboard.totalOvosVendidos());
  });
});

/**
 * Regressão do botão "Tudo" (546dc03/2f456c3): o `MonthTabs` novo mostrava o
 * mês corrente pré-marcado no popup mesmo com o filtro limpo — reabrir o
 * popup e clicar no mês (já em verde) reativava o filtro em silêncio,
 * fazendo "Tudo" parecer que "não filtra nada". Aqui a garantia é a ponta
 * final: `PeriodFilterService.clear()` (efeito de "Tudo") tem que mostrar
 * dados de todos os períodos, não só o mês corrente.
 */
describe('Dashboard — "Tudo" (filtro limpo) mostra vendas de todos os meses, não só o atual', () => {
  const productsUrl = `${environment.apiUrl}/products`;
  const salesUrl = `${environment.apiUrl}/sales`;
  const dailyProductionsUrl = `${environment.apiUrl}/daily-productions`;

  const PAST_SALE_DATE = '2020-01-15';
  const now = new Date();
  const CURRENT_MONTH_SALE_DATE = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-05`;

  it('vendasNoPeriodo/faturamento incluem venda de um mês passado e do mês atual', async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(Dashboard);
    TestBed.inject(PeriodFilterService).clear(); // "Tudo"
    const httpMock = TestBed.inject(HttpTestingController);
    await flushAllPendingGets(httpMock, {
      [productsUrl]: [],
      [salesUrl]: [
        {
          id: 1, date: PAST_SALE_DATE, product_id: 1, quantity: 1, unit_price: '100.00', total: '100.00',
          payment_pending: false, buyer: 'Ana', seller_id: 1, delivery_pending: false,
          delivery_date: null, stock_location_type: 'plantel', stock_location_vendedor_id: null,
        },
        {
          id: 2, date: CURRENT_MONTH_SALE_DATE, product_id: 1, quantity: 1, unit_price: '200.00', total: '200.00',
          payment_pending: false, buyer: 'Bia', seller_id: 1, delivery_pending: false,
          delivery_date: null, stock_location_type: 'plantel', stock_location_vendedor_id: null,
        },
      ],
      [dailyProductionsUrl]: [],
    });
    await fixture.whenStable();

    const dashboard = fixture.componentInstance as unknown as {
      vendasNoPeriodo: () => { date: string }[];
      faturamento: () => number;
    };

    expect(dashboard.vendasNoPeriodo().length).toBe(2);
    expect(dashboard.faturamento()).toBe(300);
  });
});

/**
 * Decisão do usuário (mesma linha da revert do estoque calculado): "Prontas
 * para venda" tem que ler de Product.stock (fonte única, igual Produtos e
 * Transferência de Estoque), nunca de daily_productions. Antes esse card
 * pegava a ÚLTIMA linha de daily_productions e dividia por eggsPerUnit —
 * produção bruta, nunca descontava venda, desconectada do estoque real.
 * `stock` já é bandeja/pacote (mesma unidade usada em stock-transfers.ts:
 * quantity: p.stock, sem dividir por eggsPerUnit) — não em ovos crus.
 */
describe('Dashboard.bandejasProntasCodorna()/bandejasProntasGalinha() — lêem de Product.stock, não de daily_productions', () => {
  const productsUrl = `${environment.apiUrl}/products`;
  const dailyProductionsUrl = `${environment.apiUrl}/daily-productions`;

  const PRODUCTS_API = [
    { id: 1, name: '50 ovos de codorna', unit: 'pack', unit_price: '15.00', stock: 40, eggs_per_unit: 50 },
    { id: 2, name: '30 ovos galinha', unit: 'un', unit_price: '25.00', stock: 9, eggs_per_unit: 30 },
  ];
  // Se o card ainda lesse de daily_productions, a última linha (2026-08-02)
  // daria floor(500/50)=10 codorna e floor(600/30)=20 galinha — bem diferente
  // do stock cadastrado (40/9). O teste trava que o resultado é o stock puro.
  const DAILY_PRODUCTIONS_API = [
    { id: 1, date: '2026-08-01', quail_eggs: 300, chicken_eggs: 200 },
    { id: 2, date: '2026-08-02', quail_eggs: 500, chicken_eggs: 600 },
  ];

  it('bandejasProntasCodorna/Galinha = product.stock, ignora daily_productions', async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(Dashboard);
    const httpMock = TestBed.inject(HttpTestingController);
    await flushAllPendingGets(httpMock, {
      [productsUrl]: PRODUCTS_API,
      [dailyProductionsUrl]: DAILY_PRODUCTIONS_API,
    });
    await fixture.whenStable();

    const dashboard = fixture.componentInstance as unknown as {
      bandejasProntasCodorna: () => number;
      bandejasProntasGalinha: () => number;
      prontasParaVendaTotal: () => number;
    };

    expect(dashboard.bandejasProntasCodorna()).toBe(40);
    expect(dashboard.bandejasProntasGalinha()).toBe(9);
    expect(dashboard.prontasParaVendaTotal()).toBe(49);
  });
});

/**
 * Card "Vendas por dia": calendário de agosto/2026 (mês fechado selecionado
 * via MonthTabs) sempre mostra o mês inteiro, mesmo com vendas de fora dele
 * na store — a grade/estatísticas só devem contar o que cai dentro do mês
 * exibido.
 */
describe('Dashboard — card "Vendas por dia" (calendário do mês exibido)', () => {
  const productsUrl = `${environment.apiUrl}/products`;
  const salesUrl = `${environment.apiUrl}/sales`;

  const PRODUCTS_API = [
    { id: 1, name: '50 ovos de codorna', unit: 'pack', unit_price: '15.00', stock: 40, eggs_per_unit: 50 },
  ];
  const SALES_API = [
    {
      id: 1, date: '2026-08-01', product_id: 1, quantity: 4, unit_price: '15.00', total: '60.00',
      payment_pending: false, buyer: 'Maria', seller_id: 1, delivery_pending: false,
      delivery_date: null, stock_location_type: 'plantel', stock_location_vendedor_id: null,
    },
    // Mesmo dia, segunda venda — deve somar com a de cima em vez de sobrescrever.
    {
      id: 2, date: '2026-08-01', product_id: 1, quantity: 2, unit_price: '15.00', total: '30.00',
      payment_pending: false, buyer: 'João', seller_id: 1, delivery_pending: false,
      delivery_date: null, stock_location_type: 'plantel', stock_location_vendedor_id: null,
    },
    {
      id: 3, date: '2026-08-15', product_id: 1, quantity: 1, unit_price: '15.00', total: '15.00',
      payment_pending: false, buyer: 'Ana', seller_id: 1, delivery_pending: false,
      delivery_date: null, stock_location_type: 'plantel', stock_location_vendedor_id: null,
    },
    // Venda de setembro — fora do mês exibido (agosto), não pode entrar na conta.
    {
      id: 4, date: '2026-09-03', product_id: 1, quantity: 10, unit_price: '15.00', total: '150.00',
      payment_pending: false, buyer: 'Carlos', seller_id: 1, delivery_pending: false,
      delivery_date: null, stock_location_type: 'plantel', stock_location_vendedor_id: null,
    },
  ];

  it('mesExibidoCalendario/grade/mapa/estatísticas refletem só o mês selecionado (agosto/2026)', async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(Dashboard);
    TestBed.inject(PeriodFilterService).setRange([new Date(2026, 7, 1), new Date(2026, 7, 31, 23, 59, 59, 999)]);
    const httpMock = TestBed.inject(HttpTestingController);
    await flushAllPendingGets(httpMock, { [productsUrl]: PRODUCTS_API, [salesUrl]: SALES_API });
    await fixture.whenStable();

    const dashboard = fixture.componentInstance as unknown as {
      mesExibidoCalendario: () => Date;
      calendarioVendas: () => ({ date: string; day: number } | null)[];
      vendasPorDiaMapa: () => Map<string, number>;
      estatisticasVendasPorDia: () => {
        mediaPorDia: number;
        maiorDia: { date: string; total: number } | null;
        diasSemVenda: number;
      };
    };

    expect(dashboard.mesExibidoCalendario().getMonth()).toBe(7); // agosto (0-indexed)
    expect(dashboard.mesExibidoCalendario().getFullYear()).toBe(2026);

    // Agosto/2026: 1º cai num sábado -> 6 células em branco antes do dia 1, 31 dias, 42 células (6 semanas).
    const grid = dashboard.calendarioVendas();
    expect(grid.length).toBe(42);
    expect(grid.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(grid[6]).toEqual({ date: '2026-08-01', day: 1 });

    const porDia = dashboard.vendasPorDiaMapa();
    expect(porDia.get('2026-08-01')).toBe(90); // 60+30, duas vendas do mesmo dia somadas
    expect(porDia.get('2026-08-15')).toBe(15);
    expect(porDia.has('2026-09-03')).toBe(false); // venda de setembro não entra no mês exibido

    // Assume que "hoje" (relógio real da máquina rodando o teste) já passou de
    // 31/08/2026 — mesma convenção do resto da suíte, que trata 2026 como o
    // "agora" fictício do app. Se isso um dia deixar de ser verdade, agosto/2026
    // vira mês corrente/futuro e estas 3 asserções (que dependem do mês inteiro
    // já ter "acontecido") precisam ser revistas.
    const stats = dashboard.estatisticasVendasPorDia();
    expect(stats.mediaPorDia).toBeCloseTo(105 / 31, 5); // (90+15) / 31 dias de agosto
    expect(stats.maiorDia).toEqual({ date: '2026-08-01', total: 90 });
    expect(stats.diasSemVenda).toBe(29); // 31 dias - 2 dias com venda
  });
});

/**
 * Bug relatado: o calendário sombreava/contava dias FUTUROS (depois de hoje)
 * como se já tivessem tido a chance de vender — média divide por dias que
 * ainda não aconteceram, e "Dias sem venda" contava dia futuro como "sem
 * venda". Usa datas relativas a `new Date()` (não hardcoded) pra não depender
 * de qual mês é "hoje" quando o teste roda de verdade.
 */
describe('Dashboard — card "Vendas por dia" não trata dia futuro como dia com dado', () => {
  const productsUrl = `${environment.apiUrl}/products`;
  const salesUrl = `${environment.apiUrl}/sales`;

  const PRODUCTS_API = [
    { id: 1, name: '50 ovos de codorna', unit: 'pack', unit_price: '15.00', stock: 40, eggs_per_unit: 50 },
  ];

  it('diaEhFuturo() marca amanhã como futuro e hoje como não-futuro', async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(Dashboard);
    const httpMock = TestBed.inject(HttpTestingController);
    await flushAllPendingGets(httpMock, { [productsUrl]: PRODUCTS_API });
    await fixture.whenStable();

    const dashboard = fixture.componentInstance as unknown as {
      diaEhFuturo: (date: string) => boolean;
    };

    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const ontem = new Date(hoje);
    ontem.setDate(ontem.getDate() - 1);

    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    expect(dashboard.diaEhFuturo(iso(amanha))).toBe(true);
    expect(dashboard.diaEhFuturo(iso(hoje))).toBe(false);
    expect(dashboard.diaEhFuturo(iso(ontem))).toBe(false);
  });

  it('venda cadastrada com data futura (erro de digitação) não vira "maior dia" nem entra na média', async () => {
    const hoje = new Date();
    const amanha = new Date(hoje);
    amanha.setDate(amanha.getDate() + 1);
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

    // Se "amanhã" cair no mês seguinte, o teste ainda funciona: a venda futura
    // fica de fora do mês exibido de qualquer forma (não é sobre isso que
    // este teste garante especificamente, mas não quebra a asserção principal).
    const SALES_API = [
      {
        id: 1, date: iso(hoje), product_id: 1, quantity: 1, unit_price: '15.00', total: '15.00',
        payment_pending: false, buyer: 'Hoje', seller_id: 1, delivery_pending: false,
        delivery_date: null, stock_location_type: 'plantel', stock_location_vendedor_id: null,
      },
      {
        id: 2, date: iso(amanha), product_id: 1, quantity: 1, unit_price: '15.00', total: '999999.00',
        payment_pending: false, buyer: 'Futuro', seller_id: 1, delivery_pending: false,
        delivery_date: null, stock_location_type: 'plantel', stock_location_vendedor_id: null,
      },
    ];

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    const fixture = TestBed.createComponent(Dashboard);
    // Filtro "Tudo" -> mesExibidoCalendario cai no mês corrente real, que contém tanto hoje quanto amanhã (a menos que hoje seja o último dia do mês).
    TestBed.inject(PeriodFilterService).clear();
    const httpMock = TestBed.inject(HttpTestingController);
    await flushAllPendingGets(httpMock, { [productsUrl]: PRODUCTS_API, [salesUrl]: SALES_API });
    await fixture.whenStable();

    const dashboard = fixture.componentInstance as unknown as {
      estatisticasVendasPorDia: () => { mediaPorDia: number; maiorDia: { date: string; total: number } | null };
    };

    const stats = dashboard.estatisticasVendasPorDia();
    // O valor absurdo (999999) da venda de amanhã nunca pode aparecer como maior dia.
    expect(stats.maiorDia?.total).not.toBe(999999);
    expect(stats.mediaPorDia).toBeLessThan(999999);
  });
});
