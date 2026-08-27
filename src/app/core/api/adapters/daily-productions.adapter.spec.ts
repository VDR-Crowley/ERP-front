import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createDailyProductionsStore } from './daily-productions.adapter';
import { environment } from '../../../../environments/environment';

describe('createDailyProductionsStore', () => {
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/daily-productions`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  // Regressão: campo "Data" vazio ao abrir "Editar registro" em produção diária —
  // a API manda datetime ISO completo (Carbon/Laravel) e o `<input type="date">`
  // só aceita 'YYYY-MM-DD' exato, então o binding falhava em silêncio. Mesmo bug
  // já corrigido em feed-stocks e sales.
  it('normaliza datetime ISO completo do backend pra YYYY-MM-DD', () => {
    const store = TestBed.runInInjectionContext(() => createDailyProductionsStore());
    httpMock.expectOne(base).flush([
      { id: 1, date: '2026-08-19T00:00:00.000000Z', quail_eggs: 30, chicken_eggs: 12 },
    ]);

    expect(store.items()).toEqual([{ id: '1', date: '2026-08-19', quailEggs: 30, chickenEggs: 12 }]);
  });

  it('update() envia date puro (yyyy-MM-dd) de volta pra API', async () => {
    const store = TestBed.runInInjectionContext(() => createDailyProductionsStore());
    httpMock.expectOne(base).flush([
      { id: 1, date: '2026-08-19T00:00:00.000000Z', quail_eggs: 30, chicken_eggs: 12 },
    ]);

    const promise = store.update('1', { date: '2026-08-20', quailEggs: 31, chickenEggs: 13 });
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ date: '2026-08-20', quail_eggs: 31, chicken_eggs: 13 });
    req.flush({ id: 1, date: '2026-08-20T00:00:00.000000Z', quail_eggs: 31, chicken_eggs: 13 });
    await promise;

    expect(store.items()).toEqual([{ id: '1', date: '2026-08-20', quailEggs: 31, chickenEggs: 13 }]);
  });
});
