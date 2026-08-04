import { daysUntil, todayLocalISO } from './date-diff';

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
});
