import { calendarMonthGrid } from './calendar-month';

describe('calendarMonthGrid', () => {
  it('agosto/2026 (1º cai num sábado, 31 dias): 6 brancos no início, 6 semanas, 5 brancos no fim', () => {
    const grid = calendarMonthGrid(new Date(2026, 7, 1));

    expect(grid.length).toBe(42);
    expect(grid.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(grid[6]).toEqual({ date: '2026-08-01', day: 1 });
    expect(grid[36]).toEqual({ date: '2026-08-31', day: 31 });
    expect(grid.slice(37)).toEqual([null, null, null, null, null]);
  });

  it('fevereiro/2026 (1º cai num domingo, 28 dias): sem brancos, exatamente 4 semanas', () => {
    const grid = calendarMonthGrid(new Date(2026, 1, 1));

    expect(grid.length).toBe(28);
    expect(grid[0]).toEqual({ date: '2026-02-01', day: 1 });
    expect(grid[27]).toEqual({ date: '2026-02-28', day: 28 });
    expect(grid.some((c) => c === null)).toBe(false);
  });

  it('qualquer dia do mês serve de âncora — só ano/mês importam', () => {
    const grid = calendarMonthGrid(new Date(2026, 7, 15));

    expect(grid[6]).toEqual({ date: '2026-08-01', day: 1 });
  });
});
