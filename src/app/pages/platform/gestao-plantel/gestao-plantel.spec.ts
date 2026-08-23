import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { GestaoPlantel } from './gestao-plantel';
import { waitForRequest } from '@core/testing/http-settle';
import { environment } from '../../../../environments/environment';

/**
 * Cobre o mesmo comportamento de antes (registrar/editar nascimento
 * preserva a observação digitada), agora verificando as chamadas reais aos
 * endpoints dedicados de `hatch_events` (ver `flock-incubations.adapter.ts`
 * — `update()` faz diff do `hatchEvents[]` contra o último estado carregado
 * e traduz em POST/PUT/DELETE em `.../hatch-events[/{id}]`, seguido de PUT
 * dos campos de topo e um GET final pro estado autoritativo do servidor).
 */
describe('GestaoPlantel — observação de evento de nascimento (registro incremental)', () => {
  let component: GestaoPlantel;
  let fixture: ComponentFixture<GestaoPlantel>;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/flock-incubations`;

  const LOTE_API = {
    id: 1,
    start_date: '2026-08-01',
    species: 'quail' as const,
    egg_count: 10,
    expected_hatch_date: '2026-08-19',
    status: 'incubando' as const,
    egg_cost: '0.00',
    feed_cost: '0.00',
    notes: null,
    hatch_events: [
      { id: 1, flock_incubation_id: 1, date: '2026-08-02', count: 3, notes: 'Primeiro lote' },
    ],
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestaoPlantel],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(GestaoPlantel);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    httpMock.expectOne(base).flush([LOTE_API]);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('grava a observação digitada ao registrar um nascimento novo', async () => {
    const lote = component['rows']()[0];
    component['openAddHatchEvent'](lote);
    component['hatchDraft']['count'] = 6;
    component['hatchDraft']['notes'] = 'Observação de teste';

    const promise = component['saveHatchForm']();

    const postReq = await waitForRequest(httpMock, `${base}/1/hatch-events`);
    expect(postReq.request.method).toBe('POST');
    expect(postReq.request.body).toEqual({ date: postReq.request.body.date, count: 6, notes: 'Observação de teste' });
    postReq.flush({
      id: 2,
      flock_incubation_id: 1,
      date: postReq.request.body.date,
      count: 6,
      notes: 'Observação de teste',
    });

    const putReq = await waitForRequest(httpMock, `${base}/1`);
    expect(putReq.request.method).toBe('PUT');
    putReq.flush({ ...LOTE_API, hatch_events: [...LOTE_API.hatch_events] });

    const getReq = await waitForRequest(httpMock, `${base}/1`);
    expect(getReq.request.method).toBe('GET');
    getReq.flush({
      ...LOTE_API,
      hatch_events: [
        ...LOTE_API.hatch_events,
        { id: 2, flock_incubation_id: 1, date: postReq.request.body.date, count: 6, notes: 'Observação de teste' },
      ],
    });
    await promise;

    const updatedLote = component['rows']()[0];
    const novoEvento = updatedLote.hatchEvents.find((e) => e.id === '2');
    expect(novoEvento?.count).toBe(6);
    expect(novoEvento?.notes).toBe('Observação de teste');
  });

  it('preserva a observação ao editar um evento de nascimento já existente', async () => {
    const lote = component['rows']()[0];
    const existente = lote.hatchEvents[0];
    component['openEditHatchEvent'](lote, existente);
    component['hatchDraft']['notes'] = 'Observação corrigida';

    const promise = component['saveHatchForm']();

    const putEventReq = await waitForRequest(httpMock, `${base}/1/hatch-events/1`);
    expect(putEventReq.request.method).toBe('PUT');
    expect(putEventReq.request.body).toEqual({ date: existente.date, count: existente.count, notes: 'Observação corrigida' });
    putEventReq.flush({ id: 1, flock_incubation_id: 1, date: existente.date, count: existente.count, notes: 'Observação corrigida' });

    const putTopReq = await waitForRequest(httpMock, `${base}/1`);
    expect(putTopReq.request.method).toBe('PUT');
    putTopReq.flush(LOTE_API); // campos de topo inalterados

    const getReq = await waitForRequest(httpMock, `${base}/1`);
    expect(getReq.request.method).toBe('GET');
    getReq.flush({
      ...LOTE_API,
      hatch_events: [{ id: 1, flock_incubation_id: 1, date: existente.date, count: existente.count, notes: 'Observação corrigida' }],
    });
    await promise;

    const updatedLote = component['rows']()[0];
    expect(updatedLote.hatchEvents[0].notes).toBe('Observação corrigida');
  });
});
