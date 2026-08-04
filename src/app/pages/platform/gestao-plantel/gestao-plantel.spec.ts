import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { GestaoPlantel } from './gestao-plantel';
import { IndexedDbService } from '@core/idb/idb.service';
import { HatchEvent, NovoLotePlantel } from '@core/interfaces/novo-lote-plantel.interface';

describe('GestaoPlantel — observação de evento de nascimento (registro incremental)', () => {
  let component: GestaoPlantel;
  let fixture: ComponentFixture<GestaoPlantel>;
  let saved: Record<string, unknown>[];

  beforeEach(async () => {
    saved = [];
    const fakeIdb = {
      getAll: () => of([]),
      save: (_storeName: string, _id: string, data: unknown) => {
        saved.push(data as Record<string, unknown>);
        return of(undefined);
      },
    } as unknown as IndexedDbService;

    await TestBed.configureTestingModule({
      imports: [GestaoPlantel],
      providers: [provideRouter([]), { provide: IndexedDbService, useValue: fakeIdb }],
    }).compileComponents();

    fixture = TestBed.createComponent(GestaoPlantel);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  function lote(overrides: Partial<NovoLotePlantel> & { id: string }): NovoLotePlantel & { id: string } {
    return {
      startDate: '2026-08-01',
      species: 'quail',
      eggCount: 10,
      expectedHatchDate: '2026-08-19',
      hatchEvents: [],
      status: 'incubando',
      eggCost: 0,
      feedCost: 0,
      ...overrides,
    };
  }

  it('grava a observação digitada ao registrar um nascimento novo', async () => {
    // Simula exatamente o que o template faz: abre o form (preenche o draft com
    // os defaults) e depois muta `hatchDraft[key]` a cada campo editado — é
    // isso que o `(ngModelChange)="onFieldChange(...)"` do crud-form-modal faz.
    component['openAddHatchEvent'](lote({ id: 'lote-1' }));
    component['hatchDraft']['count'] = 6;
    component['hatchDraft']['notes'] = 'Observação de teste';

    await component['saveHatchForm']();

    const record = saved.find((r) => 'hatchEvents' in r) as { hatchEvents: HatchEvent[] } | undefined;
    expect(record?.hatchEvents).toHaveLength(1);
    expect(record?.hatchEvents[0].count).toBe(6);
    expect(record?.hatchEvents[0].notes).toBe('Observação de teste');
  });

  it('preserva a observação ao editar um evento de nascimento já existente', async () => {
    const existente: HatchEvent = { id: 'evt-1', date: '2026-08-02', count: 3, notes: 'Primeiro lote' };
    component['openEditHatchEvent'](lote({ id: 'lote-1', hatchEvents: [existente] }), existente);
    component['hatchDraft']['notes'] = 'Observação corrigida';

    await component['saveHatchForm']();

    const record = saved.find((r) => 'hatchEvents' in r) as { hatchEvents: HatchEvent[] } | undefined;
    expect(record?.hatchEvents[0].notes).toBe('Observação corrigida');
  });
});
