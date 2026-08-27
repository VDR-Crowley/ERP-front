import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createStockTransfersStore } from './stock-transfers.adapter';
import { flushAllPendingGets } from '@core/testing/http-settle';
import { environment } from '../../../../environments/environment';

describe('createStockTransfersStore', () => {
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/stock-transfers`;
  const productsUrl = `${environment.apiUrl}/products`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // Regressão: mesmo bug do daily-productions/feed-stocks/sales — a API manda
  // datetime ISO completo (Carbon/Laravel) e o `<input type="date">` só aceita
  // 'YYYY-MM-DD' exato, então o campo "Data" ficava vazio ao editar.
  it('normaliza datetime ISO completo do backend pra YYYY-MM-DD', async () => {
    const store = TestBed.runInInjectionContext(() => createStockTransfersStore());

    await flushAllPendingGets(httpMock, {
      [base]: [
        {
          id: 1,
          date: '2026-08-19T00:00:00.000000Z',
          product_id: 1,
          quantity: 10,
          from_location_type: 'plantel',
          from_vendedor_id: null,
          to_location_type: 'vendedor',
          to_vendedor_id: 2,
          note: null,
        },
      ],
      [productsUrl]: [{ id: 1, name: 'Bandeja' }],
    });

    expect(store.items()[0].date).toBe('2026-08-19');
  });
});
