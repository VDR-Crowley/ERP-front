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
