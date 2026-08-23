import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { StockTransfers } from './stock-transfers';
import { totalStockValue } from '@core/utils/stock-location';
import { environment } from '../../../../environments/environment';

/**
 * Pedido do Ytallo: a tabela "Estoque por local" mostra o valor em R$ de
 * cada linha, calculado do preço cadastrado em Produtos — e bate com o total
 * que a tela Produtos mostra (mesma função, ver stock-location.ts).
 */
describe('StockTransfers — coluna Valor (preço vem de Produtos)', () => {
  let component: StockTransfers;
  let fixture: ComponentFixture<StockTransfers>;
  let httpMock: HttpTestingController;

  const productsUrl = `${environment.apiUrl}/products`;
  const vendedoresUrl = `${environment.apiUrl}/vendedores`;
  const vendorStockUrl = `${environment.apiUrl}/vendor-stock`;
  const transfersUrl = `${environment.apiUrl}/stock-transfers`;

  const PRODUCTS_API = [
    { id: 1, name: '50 ovos de codorna', unit: 'pack', unit_price: '15.00', stock: 40, eggs_per_unit: 50 },
    { id: 2, name: 'Ração extra', unit: 'kg', unit_price: '4.00', stock: 10, eggs_per_unit: 0 },
  ];
  const VENDEDORES_API = [{ id: 1, name: 'Karol', contact: '', active: true }];
  const VENDOR_STOCK_API = [{ id: 1, product_id: 1, vendedor_id: 1, quantity: 8 }];

  // Front (WithId, id string) equivalente aos fixtures acima — usado em totalStockValue() pra
  // comparar com o mesmo cálculo que o componente faz a partir do que a API devolveu.
  const productsFront = [
    { id: '1', name: '50 ovos de codorna', unit: 'pack', unitPrice: 15, stock: 40, eggsPerUnit: 50 },
    { id: '2', name: 'Ração extra', unit: 'kg', unitPrice: 4, stock: 10, eggsPerUnit: 0 },
  ];
  const vendorStockFront = [{ id: '1', product: '50 ovos de codorna', vendedorId: '1', quantity: 8 }];

  function flushAll(url: string, body: unknown): void {
    for (const req of httpMock.match(url)) req.flush(body as never);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StockTransfers],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(StockTransfers);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    // productsStore, vendedoresStore: 1 GET cada. vendorStockStore: GET /vendor-stock +
    // GET /products (resolve product_id->nome). transferStore: GET /stock-transfers + GET
    // /products (resolve product_id->nome) — ver stock-transfers.adapter.ts.
    flushAll(productsUrl, PRODUCTS_API);
    flushAll(vendedoresUrl, VENDEDORES_API);
    flushAll(vendorStockUrl, VENDOR_STOCK_API);
    flushAll(transfersUrl, []);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('calcula o valor de cada linha (quantidade × preço do produto em Produtos)', () => {
    const rows = component['overviewRows']();

    const plantelOvos = rows.find((r) => r.product === '50 ovos de codorna' && r.location === 'plantel')!;
    expect(plantelOvos.value).toBe(600); // 40 * 15

    const karolOvos = rows.find((r) => r.product === '50 ovos de codorna' && r.location === 'vendedor:1')!;
    expect(karolOvos.value).toBe(120); // 8 * 15

    const plantelRacao = rows.find((r) => r.product === 'Ração extra' && r.location === 'plantel')!;
    expect(plantelRacao.value).toBe(40); // 10 * 4
  });

  it('a soma das linhas bate com valorTotalEstoque() e com totalStockValue() — mesma fonte que Produtos.valorEstoque', () => {
    const rows = component['overviewRows']();
    const somaLinhas = rows.reduce((s, r) => s + r.value, 0);

    expect(somaLinhas).toBe(component['valorTotalEstoque']());
    expect(somaLinhas).toBe(totalStockValue(productsFront, vendorStockFront));
  });
});
