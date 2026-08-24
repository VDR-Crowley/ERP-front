import { addDays, daysSince, daysUntil, toDateOnly, todayLocalISO } from './date-diff';

// Estes testes assumem o fuso do Brasil (UTC-3, o ambiente onde rodam) — é
// perto da meia-noite UTC (21h local) que o bug de usar
// `new Date().toISOString()` como "hoje" aparecia: o ISO já tinha virado o
// dia seguinte enquanto o relógio local ainda mostrava o dia anterior.
describe('todayLocalISO', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('usa a data local, não a UTC, quando são 21h no Brasil (ainda dia 3, UTC já é dia 4)', () => {
    vi.setSystemTime(new Date('2026-08-04T00:01:00.000Z')); // 2026-08-03 21:01 em GMT-3
    expect(todayLocalISO()).toBe('2026-08-03');
  });

  it('bate com a data UTC fora da janela crítica (meio da tarde local)', () => {
    vi.setSystemTime(new Date('2026-08-03T15:00:00.000Z')); // 2026-08-03 12:00 em GMT-3
    expect(todayLocalISO()).toBe('2026-08-03');
  });
});

describe('daysUntil', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('não conta um dia a mais perto da meia-noite UTC (hoje local ainda é dia 3)', () => {
    vi.setSystemTime(new Date('2026-08-04T00:01:00.000Z')); // 2026-08-03 21:01 em GMT-3
    expect(daysUntil('2026-08-04')).toBe(1);
    expect(daysUntil('2026-08-03')).toBe(0);
  });

  // Regressão: NaN dias atrás nos cards de "Última limpeza" em
  // higienizacao-plantel.ts — a API (Laravel/Carbon) manda datetime ISO
  // completo, e o split('-') ingênuo antigo jogava "19T00:00:00.000000Z" no
  // dia, virando NaN. Mesmo formato aceito por `ptDate` em format.ts.
  it('aceita datetime ISO completo da API (Carbon/Laravel), sem virar NaN', () => {
    vi.setSystemTime(new Date('2026-08-23T15:00:00.000Z')); // 2026-08-23 12:00 em GMT-3
    expect(daysUntil('2026-08-19T00:00:00.000000Z')).toBe(-4);
    expect(daysUntil('2026-08-23T00:00:00.000000Z')).toBe(0);
    expect(daysUntil('2026-08-25T00:00:00.000000Z')).toBe(2);
  });
});

describe('daysSince', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('é o inverso de daysUntil (dias já passados desde a data)', () => {
    vi.setSystemTime(new Date('2026-08-23T15:00:00.000Z')); // 2026-08-23 12:00 em GMT-3
    expect(daysSince('2026-08-19')).toBe(4);
    expect(daysSince('2026-08-23')).toBe(0);
  });

  it('aceita datetime ISO completo da API (Carbon/Laravel), sem virar NaN', () => {
    vi.setSystemTime(new Date('2026-08-23T15:00:00.000Z')); // 2026-08-23 12:00 em GMT-3
    expect(daysSince('2026-08-19T00:00:00.000000Z')).toBe(4);
  });
});

describe('addDays', () => {
  it('aceita datetime ISO completo da API (Carbon/Laravel), sem virar NaN', () => {
    expect(addDays('2026-08-19T00:00:00.000000Z', 18)).toBe('2026-09-06');
  });

  it('mantém comportamento original com data pura YYYY-MM-DD', () => {
    expect(addDays('2026-08-19', 18)).toBe('2026-09-06');
  });
});

// Regressão: campo "Validade" vazio ao abrir "Editar tipo" em controle-racao —
// a API manda datetime ISO completo pro `expiration_date`, e o
// `<input type="date">` só aceita 'YYYY-MM-DD' exato, então o binding falhava
// em silêncio.
describe('toDateOnly', () => {
  it('extrai YYYY-MM-DD de um datetime ISO completo da API (Carbon/Laravel)', () => {
    expect(toDateOnly('2026-08-19T00:00:00.000000Z')).toBe('2026-08-19');
  });

  it('mantém data pura YYYY-MM-DD intacta', () => {
    expect(toDateOnly('2026-08-19')).toBe('2026-08-19');
  });

  it('preserva null/undefined', () => {
    expect(toDateOnly(null)).toBeNull();
    expect(toDateOnly(undefined)).toBeUndefined();
  });
});
