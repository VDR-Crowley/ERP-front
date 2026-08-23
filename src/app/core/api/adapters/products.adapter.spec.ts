import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createProductsStore } from './products.adapter';
import { environment } from '../../../../environments/environment';

describe('createProductsStore', () => {
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/products`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('carrega a lista mapeando snake_case -> camelCase e decimal-string -> number', () => {
    const store = TestBed.runInInjectionContext(() => createProductsStore());
    httpMock
      .expectOne(base)
      .flush([{ id: 1, name: 'Bandeja', unit: 'bandeja', unit_price: '12.50', stock: 100, eggs_per_unit: 30 }]);

    expect(store.items()).toEqual([
      { id: '1', name: 'Bandeja', unit: 'bandeja', unitPrice: 12.5, stock: 100, eggsPerUnit: 30 },
    ]);
  });

  it('add() envia snake_case e adiciona o item com o id retornado', async () => {
    const store = TestBed.runInInjectionContext(() => createProductsStore());
    httpMock.expectOne(base).flush([]);

    const promise = store.add({ name: 'Novo', unit: 'un', unitPrice: 5, stock: 10, eggsPerUnit: 0 });
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Novo', unit: 'un', unit_price: 5, stock: 10, eggs_per_unit: 0 });
    req.flush({ id: 9, name: 'Novo', unit: 'un', unit_price: '5.00', stock: 10, eggs_per_unit: 0 });
    await promise;

    expect(store.items()).toEqual([{ id: '9', name: 'Novo', unit: 'un', unitPrice: 5, stock: 10, eggsPerUnit: 0 }]);
  });

  it('remove() chama DELETE /products/{id} e tira o item da lista', async () => {
    const store = TestBed.runInInjectionContext(() => createProductsStore());
    httpMock
      .expectOne(base)
      .flush([{ id: 1, name: 'Bandeja', unit: 'bandeja', unit_price: '12.50', stock: 100, eggs_per_unit: 30 }]);

    const promise = store.remove('1');
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;

    expect(store.items()).toEqual([]);
  });
});
