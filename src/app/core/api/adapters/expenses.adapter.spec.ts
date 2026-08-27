import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createExpensesStore } from './expenses.adapter';
import { environment } from '../../../../environments/environment';

describe('createExpensesStore', () => {
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/expenses`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // Regressão: mesmo bug do daily-productions/feed-stocks/sales — a API manda
  // datetime ISO completo (Carbon/Laravel) e o `<input type="date">` só aceita
  // 'YYYY-MM-DD' exato, então o campo "Data" ficava vazio ao editar.
  it('normaliza datetime ISO completo do backend pra YYYY-MM-DD', () => {
    const store = TestBed.runInInjectionContext(() => createExpensesStore());
    httpMock.expectOne(base).flush([
      {
        id: 1,
        date: '2026-08-19T00:00:00.000000Z',
        description: 'Ração',
        category: 'insumos',
        quantity: null,
        unit_price: null,
        amount: '150.00',
        paid: true,
      },
    ]);

    expect(store.items()[0].date).toBe('2026-08-19');
  });

  it('update() envia date puro (yyyy-MM-dd) de volta pra API', async () => {
    const store = TestBed.runInInjectionContext(() => createExpensesStore());
    httpMock.expectOne(base).flush([
      {
        id: 1,
        date: '2026-08-19T00:00:00.000000Z',
        description: 'Ração',
        category: 'insumos',
        quantity: null,
        unit_price: null,
        amount: '150.00',
        paid: true,
      },
    ]);

    const promise = store.update('1', {
      date: '2026-08-20',
      description: 'Ração',
      category: 'insumos',
      amount: 150,
      paid: true,
    });
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.body.date).toBe('2026-08-20');
    req.flush({
      id: 1,
      date: '2026-08-20T00:00:00.000000Z',
      description: 'Ração',
      category: 'insumos',
      quantity: null,
      unit_price: null,
      amount: '150.00',
      paid: true,
    });
    await promise;

    expect(store.items()[0].date).toBe('2026-08-20');
  });
});
