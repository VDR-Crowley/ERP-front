import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createFlockIncubationsStore } from './flock-incubations.adapter';
import { waitForRequest } from '@core/testing/http-settle';
import { NovoLotePlantel } from '@core/interfaces/novo-lote-plantel.interface';
import { environment } from '../../../../environments/environment';

const LOTE_API = {
  id: 1,
  start_date: '2026-08-01',
  species: 'quail' as const,
  egg_count: 50,
  expected_hatch_date: '2026-08-19',
  status: 'incubando' as const,
  egg_cost: '25.00',
  feed_cost: '10.00',
  notes: null,
  hatch_events: [
    { id: 10, flock_incubation_id: 1, date: '2026-08-19', count: 20, notes: null },
    { id: 11, flock_incubation_id: 1, date: '2026-08-20', count: 10, notes: 'contagem parcial' },
  ],
};

describe('createFlockIncubationsStore — diff de hatchEvents[]', () => {
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/flock-incubations`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('remover um evento do array (DELETE) chama DELETE .../hatch-events/{id} pro que sumiu, e mais nada', async () => {
    const store = TestBed.runInInjectionContext(() => createFlockIncubationsStore());
    httpMock.expectOne(base).flush([LOTE_API]);

    const lote = store.items()[0];
    const semSegundoEvento: NovoLotePlantel = {
      ...lote,
      hatchEvents: lote.hatchEvents.filter((e) => e.id !== '11'),
    };

    const promise = store.update('1', semSegundoEvento);

    const deleteReq = await waitForRequest(httpMock, `${base}/1/hatch-events/11`);
    expect(deleteReq.request.method).toBe('DELETE');
    deleteReq.flush(null, { status: 204, statusText: 'No Content' });

    const putReq = await waitForRequest(httpMock, `${base}/1`);
    expect(putReq.request.method).toBe('PUT');
    putReq.flush({ ...LOTE_API, hatch_events: [LOTE_API.hatch_events[0]] });

    const getReq = await waitForRequest(httpMock, `${base}/1`);
    getReq.flush({ ...LOTE_API, hatch_events: [LOTE_API.hatch_events[0]] });
    await promise;

    expect(store.items()[0].hatchEvents.map((e) => e.id)).toEqual(['10']);
  });

  it('evento inalterado não gera PUT/POST em .../hatch-events — só o PUT de topo', async () => {
    const store = TestBed.runInInjectionContext(() => createFlockIncubationsStore());
    httpMock.expectOne(base).flush([LOTE_API]);

    const lote = store.items()[0];
    const mesmoConteudo: NovoLotePlantel = { ...lote, notes: 'nota nova' };

    const promise = store.update('1', mesmoConteudo);

    // Nenhuma requisição pra .../hatch-events[/{id}] deveria existir — só o PUT de topo.
    const putReq = await waitForRequest(httpMock, `${base}/1`);
    expect(putReq.request.method).toBe('PUT');
    expect(putReq.request.body).toEqual({
      start_date: '2026-08-01',
      species: 'quail',
      egg_count: 50,
      expected_hatch_date: '2026-08-19',
      status: 'incubando',
      egg_cost: 25,
      feed_cost: 10,
      notes: 'nota nova',
    });
    putReq.flush({ ...LOTE_API, notes: 'nota nova' });

    const getReq = await waitForRequest(httpMock, `${base}/1`);
    getReq.flush({ ...LOTE_API, notes: 'nota nova' });
    await promise;

    expect(httpMock.match(`${base}/1/hatch-events`)).toHaveLength(0);
    expect(httpMock.match(`${base}/1/hatch-events/10`)).toHaveLength(0);
    expect(httpMock.match(`${base}/1/hatch-events/11`)).toHaveLength(0);
  });
});
