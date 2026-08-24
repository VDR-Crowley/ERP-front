import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createEggLossesStore } from './egg-loss.adapter';
import { environment } from '../../../../environments/environment';

describe('createEggLossesStore', () => {
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/egg-losses`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('carrega a lista mapeando snake_case -> camelCase e reason nulo -> undefined', () => {
    const store = TestBed.runInInjectionContext(() => createEggLossesStore());
    httpMock
      .expectOne(base)
      .flush([{ id: 1, date: '2026-08-20', species: 'quail', quantity: 10, reason: null }]);

    expect(store.items()).toEqual([
      { id: '1', date: '2026-08-20', species: 'quail', quantity: 10, reason: undefined },
    ]);
  });

  it('add() envia snake_case (reason vazio -> null) e adiciona o item com o id retornado', async () => {
    const store = TestBed.runInInjectionContext(() => createEggLossesStore());
    httpMock.expectOne(base).flush([]);

    const promise = store.add({ date: '2026-08-20', species: 'chicken', quantity: 3, reason: undefined });
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ date: '2026-08-20', species: 'chicken', quantity: 3, reason: null });
    req.flush({ id: 9, date: '2026-08-20', species: 'chicken', quantity: 3, reason: null });
    await promise;

    expect(store.items()).toEqual([
      { id: '9', date: '2026-08-20', species: 'chicken', quantity: 3, reason: undefined },
    ]);
  });

  it('update() chama PUT /egg-losses/{id} com o corpo em snake_case', async () => {
    const store = TestBed.runInInjectionContext(() => createEggLossesStore());
    httpMock
      .expectOne(base)
      .flush([{ id: 1, date: '2026-08-20', species: 'quail', quantity: 10, reason: 'Quebrado' }]);

    const promise = store.update('1', { date: '2026-08-21', species: 'quail', quantity: 12, reason: 'Quebrado' });
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ date: '2026-08-21', species: 'quail', quantity: 12, reason: 'Quebrado' });
    req.flush({ id: 1, date: '2026-08-21', species: 'quail', quantity: 12, reason: 'Quebrado' });
    await promise;

    expect(store.items()).toEqual([
      { id: '1', date: '2026-08-21', species: 'quail', quantity: 12, reason: 'Quebrado' },
    ]);
  });

  it('remove() chama DELETE /egg-losses/{id} e tira o item da lista', async () => {
    const store = TestBed.runInInjectionContext(() => createEggLossesStore());
    httpMock
      .expectOne(base)
      .flush([{ id: 1, date: '2026-08-20', species: 'quail', quantity: 10, reason: null }]);

    const promise = store.remove('1');
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;

    expect(store.items()).toEqual([]);
  });
});
