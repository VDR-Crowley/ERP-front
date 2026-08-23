import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Sales } from './sales';
import { vendedorLocation } from '@core/utils/stock-location';
import { settleHttp } from '@core/testing/http-settle';
import { environment } from '../../../../environments/environment';

/**
 * Bug 3 (validação, não bug): confirma que dá pra escolher "Estoque com
 * Karol" ao vender e que o saldo dela cai — sem mexer no Plantel. Desde a
 * migração pra API real, quem baixa/devolve o estoque é o backend (ver
 * `sales.adapter.ts`); esses testes simulam a resposta já ajustada do
 * backend nos GETs de reload, em vez de recalcular no front.
 */
describe('Sales — venda baixando do estoque de um vendedor', () => {
  let component: Sales;
  let fixture: ComponentFixture<Sales>;
  let httpMock: HttpTestingController;

  const salesUrl = `${environment.apiUrl}/sales`;
  const productsUrl = `${environment.apiUrl}/products`;
  const vendedoresUrl = `${environment.apiUrl}/vendedores`;
  const vendorStockUrl = `${environment.apiUrl}/vendor-stock`;

  const PRODUCT_API = { id: 1, name: '50 ovos de codorna', unit: 'pack', unit_price: '15.00', stock: 40, eggs_per_unit: 50 };
  const VENDEDOR_API = { id: 1, name: 'Karol', contact: '', active: true };

  function flushAll(url: string, body: object | null): void {
    for (const req of httpMock.match(url)) req.flush(body);
  }

  const settle = (url: string, body: unknown) => settleHttp(httpMock, url, body);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Sales],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Sales);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    // Construção da tela dispara: salesStore (GET /sales + refs /products+/vendedores),
    // productsStore (GET /products), vendedoresStore (GET /vendedores), vendorStockStore
    // (GET /vendor-stock + GET /products) — cada store busca sua própria referência.
    httpMock.expectOne(salesUrl).flush([]);
    flushAll(productsUrl, [PRODUCT_API]);
    flushAll(vendedoresUrl, [VENDEDOR_API]);
    httpMock.expectOne(vendorStockUrl).flush([{ id: 1, product_id: 1, vendedor_id: 1, quantity: 12 }]);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('oferece "Vendedor: Karol" como opção de local do estoque', () => {
    const stockLocationField = component['fields']().find((f) => f.key === 'stockLocation')!;
    expect(stockLocationField).toBeTruthy();
    const options = stockLocationField.optionsFor!({});
    expect(options).toEqual([
      { value: 'plantel', label: 'Plantel' },
      { value: 'vendedor:1', label: 'Vendedor: Karol' },
    ]);
  });

  it('vender escolhendo "Estoque com Karol" baixa o saldo dela e NÃO mexe no Plantel', async () => {
    component['openNew']();
    component['draft']['product'] = '50 ovos de codorna';
    component['draft']['quantity'] = 5;
    component['draft']['unitPrice'] = 15;
    component['draft']['stockLocation'] = vendedorLocation('1');
    component['draft']['buyer'] = 'Cliente Teste';
    component['draft']['seller'] = 'Karol';

    const promise = component['saveForm']();

    // add() resolve nome->id buscando /products e /vendedores de novo antes do POST.
    await settle(productsUrl, [PRODUCT_API]);
    await settle(vendedoresUrl, [VENDEDOR_API]);

    const postReq = httpMock.expectOne(salesUrl);
    expect(postReq.request.body).toEqual({
      date: postReq.request.body.date,
      product_id: 1,
      quantity: 5,
      unit_price: 15,
      total: 75,
      payment_pending: true,
      buyer: 'Cliente Teste',
      seller_id: 1,
      delivery_pending: true,
      delivery_date: null,
      stock_location_type: 'vendedor',
      stock_location_vendedor_id: 1,
    });
    postReq.flush({
      id: 10,
      date: postReq.request.body.date,
      product_id: 1,
      quantity: 5,
      unit_price: '15.00',
      total: '75.00',
      payment_pending: true,
      buyer: 'Cliente Teste',
      seller_id: 1,
      delivery_pending: true,
      delivery_date: null,
      stock_location_type: 'vendedor',
      stock_location_vendedor_id: 1,
    });

    // reloadStock() dispara reload de productsStore/vendorStockStore — simula o
    // backend já com o saldo ajustado (Plantel intocado, vendedora -5). O
    // reload do vendorStockStore também refaz /products (fetchNameIdMaps),
    // por isso "settle" de novo em vez de expectOne.
    await settle(productsUrl, [PRODUCT_API]);
    await settle(vendorStockUrl, [{ id: 1, product_id: 1, vendedor_id: 1, quantity: 7 }]);
    await promise;

    const vendorStockAfter = (component as unknown as { vendorStockStore: { items: () => { vendedorId: string; product: string; quantity: number }[] } })
      .vendorStockStore.items()
      .find((v) => v.vendedorId === '1' && v.product === '50 ovos de codorna');
    expect(vendorStockAfter?.quantity).toBe(7); // 12 - 5

    const productAfter = (component as unknown as { productsStore: { items: () => { name: string; stock: number }[] } })
      .productsStore.items()
      .find((p) => p.name === '50 ovos de codorna');
    expect(productAfter?.stock).toBe(40); // Plantel intocado
  });

  it('excluir a venda devolve a quantidade pro saldo da vendedora', async () => {
    // Cria a tela de novo com uma venda pré-existente já no primeiro load (mais simples
    // que criar pela UI e depois recarregar).
    fixture = TestBed.createComponent(Sales);
    component = fixture.componentInstance;
    httpMock.expectOne(salesUrl).flush([
      {
        id: 10,
        date: '2026-08-20',
        product_id: 1,
        quantity: 5,
        unit_price: '15.00',
        total: '75.00',
        payment_pending: true,
        buyer: 'Cliente Teste',
        seller_id: 1,
        delivery_pending: true,
        delivery_date: null,
        stock_location_type: 'vendedor',
        stock_location_vendedor_id: 1,
      },
    ]);
    flushAll(productsUrl, [PRODUCT_API]);
    flushAll(vendedoresUrl, [VENDEDOR_API]);
    httpMock.expectOne(vendorStockUrl).flush([{ id: 1, product_id: 1, vendedor_id: 1, quantity: 7 }]);
    await fixture.whenStable();

    const venda = component['rows']().find((v) => v.buyer === 'Cliente Teste')!;
    expect(venda).toBeTruthy();
    component['askDelete'](venda);
    const promise = component['confirmDelete']();

    httpMock.expectOne(`${salesUrl}/${venda.id}`).flush(null, { status: 204, statusText: 'No Content' });

    await settle(productsUrl, [PRODUCT_API]);
    await settle(vendorStockUrl, [{ id: 1, product_id: 1, vendedor_id: 1, quantity: 12 }]);
    await promise;

    const vendorStockAfter = (component as unknown as { vendorStockStore: { items: () => { vendedorId: string; product: string; quantity: number }[] } })
      .vendorStockStore.items()
      .find((v) => v.vendedorId === '1' && v.product === '50 ovos de codorna');
    expect(vendorStockAfter?.quantity).toBe(12); // devolveu ao original
  });
});
