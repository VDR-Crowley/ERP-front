import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Products } from './products';
import { environment } from '../../../../environments/environment';

interface ProductApiRow {
  id: number;
  name: string;
  unit: string;
  unit_price: string;
  stock: number;
  eggs_per_unit: number;
}

/**
 * Reproduz e depois cobre a correção do bug relatado em produção: editar o
 * campo "Estoque" de um produto e clicar Salvar não persistia pra produtos
 * ligados a ovo (a coluna exibida ignorava o valor recém-salvo e recalculava
 * do Estoque de Ovos — ver histórico do commit pra detalhe do bug).
 */
describe('Products — edição de estoque (bug reportado em produção)', () => {
  let component: Products;
  let fixture: ComponentFixture<Products>;
  let httpMock: HttpTestingController;
  const productsUrl = `${environment.apiUrl}/products`;
  const vendorStockUrl = `${environment.apiUrl}/vendor-stock`;

  function apiProduct(overrides: Partial<ProductApiRow> & { id: number }): ProductApiRow {
    return { name: 'Produto', unit: 'un', unit_price: '10.00', stock: 0, eggs_per_unit: 0, ...overrides };
  }

  let productsInApi: ProductApiRow[];

  beforeEach(async () => {
    // 5 produtos, igual ao relato: 2 ligados a ovo (nome batia com o antigo
    // override de estoqueReal, hoje removido) e 3 "normais".
    productsInApi = [
      apiProduct({ id: 1, name: '50 ovos de codorna', eggs_per_unit: 50, stock: 20 }),
      apiProduct({ id: 2, name: '1 Bandeja de ovos de galinha', eggs_per_unit: 30, stock: 15 }),
      apiProduct({ id: 3, name: 'Ração extra', stock: 5 }),
      apiProduct({ id: 4, name: 'Kit misto', stock: 8 }),
      apiProduct({ id: 5, name: 'Carne de codorna', stock: 3 }),
    ];

    await TestBed.configureTestingModule({
      imports: [Products],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Products);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    // productsStore faz 1 GET /products; vendorStockStore faz 1 GET /vendor-stock
    // + 1 GET /products (pra resolver product_id -> nome, ver vendor-stock.adapter.ts).
    for (const req of httpMock.match(productsUrl)) req.flush(productsInApi);
    httpMock.expectOne(vendorStockUrl).flush([]);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it.each(['1', '2', '3', '4', '5'])(
    'edita o estoque do produto %s e a coluna Estoque no Plantel (p.stock) reflete o novo valor',
    async (id) => {
      const target = component['rows']().find((p) => p.id === id)!;
      expect(target).toBeTruthy();

      component['openEdit'](target);
      component['draft']['stock'] = 777;
      const promise = component['saveForm']();

      const req = httpMock.expectOne(`${productsUrl}/${id}`);
      req.flush({ ...productsInApi.find((p) => p.id === Number(id))!, stock: 777 });
      await promise;

      const updated = component['rows']().find((p) => p.id === id)!;
      expect(updated.stock).toBe(777);
      // Estoque total (Plantel + vendedores) também reflete, sem vendorStock = igual ao Plantel.
      expect(component['estoqueTotal'](updated)).toBe(777);
    },
  );

  it('cria um produto novo e depois consegue editar o estoque dele', async () => {
    component['openNew']();
    component['draft'] = { name: 'Produto Novo', unit: 'un', unitPrice: 1, stock: 50, eggsPerUnit: 0 };
    const createPromise = component['saveForm']();

    httpMock
      .expectOne(productsUrl)
      .flush({ id: 6, name: 'Produto Novo', unit: 'un', unit_price: '1.00', stock: 50, eggs_per_unit: 0 });
    await createPromise;

    const created = component['rows']().find((p) => p.name === 'Produto Novo');
    expect(created).toBeTruthy();
    expect(created!.stock).toBe(50);

    component['openEdit'](created!);
    component['draft']['stock'] = 999;
    const updatePromise = component['saveForm']();

    httpMock
      .expectOne(`${productsUrl}/6`)
      .flush({ id: 6, name: 'Produto Novo', unit: 'un', unit_price: '1.00', stock: 999, eggs_per_unit: 0 });
    await updatePromise;

    const updated = component['rows']().find((p) => p.name === 'Produto Novo');
    expect(updated!.stock).toBe(999);
  });
});
