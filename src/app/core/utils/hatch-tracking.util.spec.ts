import { HatchEvent, NovoLotePlantel } from '@core/interfaces/novo-lote-plantel.interface';
import {
  addHatchEvent,
  deriveStatusAfterHatchChange,
  migrateLegacyHatchEvents,
  removeHatchEvent,
  totalHatched,
  updateHatchEvent,
} from './hatch-tracking.util';

function hatchEvent(overrides: Partial<HatchEvent> = {}): HatchEvent {
  return { id: 'evt-1', date: '2026-07-27', count: 0, ...overrides };
}

describe('totalHatched', () => {
  it('soma a quantidade de todos os eventos', () => {
    const events = [hatchEvent({ id: 'a', count: 120 }), hatchEvent({ id: 'b', count: 30 })];
    expect(totalHatched(events)).toBe(150);
  });

  it('retorna 0 pra lista vazia', () => {
    expect(totalHatched([])).toBe(0);
  });
});

describe('addHatchEvent', () => {
  it('acrescenta o evento sem alterar os já existentes', () => {
    const existing = [hatchEvent({ id: 'a', count: 120, date: '2026-07-26' })];
    const result = addHatchEvent(existing, hatchEvent({ id: 'b', count: 40, date: '2026-07-27', notes: 'Segundo dia' }));

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual(existing[0]);
    expect(result[1]).toEqual({ id: 'b', count: 40, date: '2026-07-27', notes: 'Segundo dia' });
    // Não muta o array original — a tela mãe decide quando persistir.
    expect(existing).toHaveLength(1);
  });
});

describe('updateHatchEvent', () => {
  it('atualiza só o evento com o id informado, preservando os outros', () => {
    const events = [
      hatchEvent({ id: 'a', count: 120, date: '2026-07-26' }),
      hatchEvent({ id: 'b', count: 40, date: '2026-07-27' }),
    ];
    const result = updateHatchEvent(events, 'b', { date: '2026-07-27', count: 55, notes: 'Corrigido' });

    expect(result[0]).toEqual(events[0]);
    expect(result[1]).toEqual({ id: 'b', date: '2026-07-27', count: 55, notes: 'Corrigido' });
  });

  it('não altera a lista se o id não existir', () => {
    const events = [hatchEvent({ id: 'a', count: 120 })];
    const result = updateHatchEvent(events, 'nao-existe', { date: '2026-07-27', count: 1 });
    expect(result).toEqual(events);
  });
});

describe('removeHatchEvent', () => {
  it('remove só o evento com o id informado', () => {
    const events = [hatchEvent({ id: 'a', count: 120 }), hatchEvent({ id: 'b', count: 40 })];
    const result = removeHatchEvent(events, 'a');
    expect(result).toEqual([events[1]]);
  });
});

describe('deriveStatusAfterHatchChange', () => {
  it('mantém "incubando" enquanto o total nascido não atinge a quantidade de ovos', () => {
    const events = [hatchEvent({ count: 120 })];
    expect(deriveStatusAfterHatchChange('incubando', 150, events)).toBe('incubando');
  });

  it('vira "eclodido" automaticamente quando o total nascido atinge a quantidade de ovos', () => {
    const events = [hatchEvent({ id: 'a', count: 120 }), hatchEvent({ id: 'b', count: 30 })];
    expect(deriveStatusAfterHatchChange('incubando', 150, events)).toBe('eclodido');
  });

  it('vira "eclodido" quando o total nascido ultrapassa a quantidade de ovos (ex.: contagem inicial imprecisa)', () => {
    const events = [hatchEvent({ count: 160 })];
    expect(deriveStatusAfterHatchChange('incubando', 150, events)).toBe('eclodido');
  });

  it('um lote já "eclodido" nunca reabre automaticamente, mesmo editando o histórico pra um total menor', () => {
    const events = [hatchEvent({ count: 10 })];
    expect(deriveStatusAfterHatchChange('eclodido', 150, events)).toBe('eclodido');
  });
});

describe('migrateLegacyHatchEvents', () => {
  it('mantém hatchEvents como está quando já existe (registro já migrado)', () => {
    const events = [hatchEvent({ id: 'a', count: 120 })];
    const lote: Pick<NovoLotePlantel, 'hatchEvents' | 'actualHatchDate' | 'hatchedCount'> = {
      hatchEvents: events,
      actualHatchDate: null,
      hatchedCount: null,
    };
    expect(migrateLegacyHatchEvents(lote)).toBe(events);
  });

  it('converte actualHatchDate/hatchedCount legados num único evento quando hatchEvents não existe', () => {
    const lote = {
      hatchEvents: undefined as unknown as HatchEvent[],
      actualHatchDate: '2026-07-20',
      hatchedCount: 145,
    };
    const result = migrateLegacyHatchEvents(lote);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ date: '2026-07-20', count: 145 });
    expect(typeof result[0].id).toBe('string');
  });

  it('retorna lista vazia quando não há hatchEvents nem dado legado (lote ainda incubando, nunca editado)', () => {
    const lote = { hatchEvents: undefined as unknown as HatchEvent[], actualHatchDate: null, hatchedCount: null };
    expect(migrateLegacyHatchEvents(lote)).toEqual([]);
  });
});
