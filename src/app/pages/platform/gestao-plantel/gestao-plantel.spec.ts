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

/**
 * Bug reportado: "Custo dos ovos" é preço UNITÁRIO (por ovo), não total —
 * "Investimento estimado até 45 dias" tem que ser
 * `(quantidade × custo unitário) + custo ração`, não só ecoar `eggCost` cru.
 * Ver `gestao-plantel.ts` (`FIELDS`, campo `investimentoPreview` e
 * `eggTotalCost`) e `investimento()` (mesmo cálculo pro total da tabela).
 */
describe('GestaoPlantel — investimento estimado (custo unitário dos ovos)', () => {
  let component: GestaoPlantel;
  let fixture: ComponentFixture<GestaoPlantel>;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/flock-incubations`;

  const LOTE_API = {
    id: 1,
    start_date: '2026-08-01',
    species: 'quail' as const,
    egg_count: 267,
    expected_hatch_date: '2026-08-19',
    status: 'incubando' as const,
    egg_cost: '0.30',
    feed_cost: '150.00',
    notes: null,
    hatch_events: [],
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

  it('calcula "Custo total dos ovos" = quantidade × custo unitário', () => {
    const field = component['fields'].find((f) => f.key === 'eggTotalCost');
    expect(field?.compute?.({ eggCount: 267, eggCost: 0.3 })).toBeCloseTo(80.1, 2);
  });

  it('calcula "Investimento estimado" = (quantidade × custo unitário) + ração', () => {
    const field = component['fields'].find((f) => f.key === 'investimentoPreview');
    expect(field?.compute?.({ eggCount: 267, eggCost: 0.3, feedCost: 50 })).toBeCloseTo(130.1, 2);
  });

  it('trata ração vazia como 0 no investimento estimado (não bloqueia o cálculo do ovos)', () => {
    const field = component['fields'].find((f) => f.key === 'investimentoPreview');
    expect(field?.compute?.({ eggCount: 267, eggCost: 0.3, feedCost: '' })).toBeCloseTo(80.1, 2);
  });

  it('recalcula o investimento estimado quando quantidade ou custo unitário mudam (edição)', () => {
    const field = component['fields'].find((f) => f.key === 'investimentoPreview');
    expect(field?.compute?.({ eggCount: 267, eggCost: 0.3, feedCost: 150 })).toBeCloseTo(230.1, 2);
    expect(field?.compute?.({ eggCount: 300, eggCost: 0.3, feedCost: 150 })).toBeCloseTo(240, 2);
    expect(field?.compute?.({ eggCount: 267, eggCost: 1, feedCost: 150 })).toBeCloseTo(417, 2);
  });

  it('totaliza a mesma conta na tabela (investimento())', () => {
    const item = { ...LOTE_API_TO_MODEL, eggCount: 267, eggCost: 0.3, feedCost: 150 };
    expect(component['investimento'](item)).toBeCloseTo(230.1, 2);
  });

  it('form de edição não reaplica o default de ração (sem marcador __isNew)', () => {
    const lote = component['rows']()[0];
    component['openEdit'](lote);
    expect(component['draft']['__isNew']).toBeUndefined();
  });
});

const LOTE_API_TO_MODEL = {
  startDate: '2026-08-01',
  species: 'quail' as const,
  expectedHatchDate: '2026-08-19',
  hatchEvents: [],
  status: 'incubando' as const,
  eggCount: 0,
  eggCost: 0 as number | null,
  feedCost: 0 as number | null,
  notes: undefined as string | undefined,
};

/**
 * "Custo ração até 45 dias" sugere R$150 quando a quantidade de ovos cai na
 * faixa 200-270 — só no form de criação (`Novo lote`), só enquanto o campo
 * estiver vazio (não sobrescreve valor já digitado pelo usuário).
 */
describe('GestaoPlantel — default de ração pra quantidade 200-270', () => {
  let component: GestaoPlantel;
  let fixture: ComponentFixture<GestaoPlantel>;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/flock-incubations`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GestaoPlantel],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(GestaoPlantel);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    httpMock.expectOne(base).flush([]);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('preenche 150 quando quantidade entra em 200-270 e ração está vazia (form de criação)', () => {
    component['openNew']();
    const eggCountField = component['fields'].find((f) => f.key === 'eggCount');
    eggCountField?.onChange?.(250, component['draft']);
    expect(component['draft']['feedCost']).toBe(150);
  });

  it('não preenche fora da faixa 200-270', () => {
    component['openNew']();
    const eggCountField = component['fields'].find((f) => f.key === 'eggCount');
    eggCountField?.onChange?.(150, component['draft']);
    expect(component['draft']['feedCost']).toBe('');
  });

  it('não sobrescreve valor de ração já digitado pelo usuário', () => {
    component['openNew']();
    component['draft']['feedCost'] = 80;
    const eggCountField = component['fields'].find((f) => f.key === 'eggCount');
    eggCountField?.onChange?.(250, component['draft']);
    expect(component['draft']['feedCost']).toBe(80);
  });

  it('respeita os limites inclusivos 200 e 270', () => {
    component['openNew']();
    const eggCountField = component['fields'].find((f) => f.key === 'eggCount');
    eggCountField?.onChange?.(200, component['draft']);
    expect(component['draft']['feedCost']).toBe(150);
  });

  it('não aplica o default no form de edição (sem __isNew)', () => {
    const model: Record<string, unknown> = { feedCost: '' };
    const eggCountField = component['fields'].find((f) => f.key === 'eggCount');
    eggCountField?.onChange?.(250, model);
    expect(model['feedCost']).toBe('');
  });
});
