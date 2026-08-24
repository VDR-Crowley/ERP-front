import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { PerdaDeOvos } from './perda-de-ovos';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { environment } from '../../../../environments/environment';

interface EggLossApiRow {
  id: number;
  date: string;
  species: 'quail' | 'chicken';
  quantity: number;
  reason: string | null;
}

describe('PerdaDeOvos', () => {
  let component: PerdaDeOvos;
  let fixture: ComponentFixture<PerdaDeOvos>;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/egg-losses`;

  let apiRows: EggLossApiRow[];

  beforeEach(async () => {
    apiRows = [
      { id: 1, date: '2026-08-20', species: 'quail', quantity: 10, reason: 'Quebrado' },
      { id: 2, date: '2026-08-21', species: 'chicken', quantity: 3, reason: null },
    ];

    await TestBed.configureTestingModule({
      imports: [PerdaDeOvos],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(PerdaDeOvos);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    // Filtro de período (mês corrente por padrão) desativado — datas fixas do teste não
    // precisam depender da data real em que a suíte roda (ver PeriodFilterService).
    TestBed.inject(PeriodFilterService).clear();

    httpMock.expectOne(base).flush(apiRows);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('lista os registros vindos da API, mais recente primeiro (sort padrão de data desc)', () => {
    const rows = component['rows']();
    expect(rows.length).toBe(2);
    expect(rows.map((r) => r.reason)).toEqual([undefined, 'Quebrado']);
  });

  it('soma quantidade perdida por espécie no período', () => {
    expect(component['totalCodorna']()).toBe(10);
    expect(component['totalGalinha']()).toBe(3);
    expect(component['totalGeral']()).toBe(13);
  });

  it('cria um novo lançamento via POST e adiciona à lista', async () => {
    component['openNew']();
    component['draft'] = { date: '2026-08-22', species: 'quail', quantity: 5, reason: 'Doação' };
    const promise = component['saveForm']();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ date: '2026-08-22', species: 'quail', quantity: 5, reason: 'Doação' });
    req.flush({ id: 3, date: '2026-08-22', species: 'quail', quantity: 5, reason: 'Doação' });
    await promise;

    expect(component['rows']().length).toBe(3);
    expect(component['formOpen']()).toBe(false);
  });

  it('edita um lançamento existente via PUT', async () => {
    const target = component['rows']().find((r) => r.id === '1')!;
    component['openEdit'](target);
    component['draft']['quantity'] = 20;
    const promise = component['saveForm']();

    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toMatchObject({ quantity: 20 });
    req.flush({ id: 1, date: '2026-08-20', species: 'quail', quantity: 20, reason: 'Quebrado' });
    await promise;

    expect(component['rows']().find((r) => r.id === '1')!.quantity).toBe(20);
  });

  it('exclui um lançamento via DELETE após confirmação', async () => {
    const target = component['rows']().find((r) => r.id === '2')!;
    component['askDelete'](target);
    expect(component['deleteTarget']()).toEqual(target);

    const promise = component['confirmDelete']();
    const req = httpMock.expectOne(`${base}/2`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;

    expect(component['rows']().find((r) => r.id === '2')).toBeUndefined();
    expect(component['deleteTarget']()).toBeNull();
  });
});
