import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createCashFlowsStore } from './cash-flows.adapter';
import { environment } from '../../../../environments/environment';

describe('createCashFlowsStore', () => {
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/cash-flows`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // Regressão: mesmo bug do daily-productions/feed-stocks/sales — a API manda
  // datetime ISO completo (Carbon/Laravel) e o `<input type="date">` só aceita
  // 'YYYY-MM-DD' exato, então o campo "Data" ficava vazio ao editar.
  it('normaliza datetime ISO completo do backend pra YYYY-MM-DD', () => {
    const store = TestBed.runInInjectionContext(() => createCashFlowsStore());
    httpMock
      .expectOne(base)
      .flush([{ id: 1, date: '2026-08-19T00:00:00.000000Z', description: 'Venda', inflow: true, amount: '500.00' }]);

    expect(store.items()[0].date).toBe('2026-08-19');
  });

  it('update() envia date puro (yyyy-MM-dd) de volta pra API', async () => {
    const store = TestBed.runInInjectionContext(() => createCashFlowsStore());
    httpMock
      .expectOne(base)
      .flush([{ id: 1, date: '2026-08-19T00:00:00.000000Z', description: 'Venda', inflow: true, amount: '500.00' }]);

    const promise = store.update('1', { date: '2026-08-20', description: 'Venda', inflow: true, amount: 500 });
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.body.date).toBe('2026-08-20');
    req.flush({ id: 1, date: '2026-08-20T00:00:00.000000Z', description: 'Venda', inflow: true, amount: '500.00' });
    await promise;

    expect(store.items()[0].date).toBe('2026-08-20');
  });
});
