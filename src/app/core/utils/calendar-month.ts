import { toLocalISO } from './date-diff';

export interface CalendarDay {
  /** 'YYYY-MM-DD', fuso local (mesma convenção de `toLocalISO`). */
  date: string;
  day: number;
}

/** 1º dia do mês de `date`, 00:00:00 local. */
export function startOfMonth(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

/** Último dia do mês de `date`, 23:59:59.999 local. */
export function endOfMonth(date: Date): Date {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** `true` se `[start, end]` for exatamente o mês cheio (1º ao último dia) de `start`. */
export function isWholeMonth(start: Date, end: Date): boolean {
  return start.getTime() === startOfMonth(start).getTime() && end.getTime() === endOfMonth(start).getTime();
}

/**
 * Grade de calendário (semanas de 7 colunas Dom-Sáb) do mês de `monthAnchor`
 * (só ano/mês importam). Células antes do dia 1 ou depois do último dia do
 * mês vêm como `null` — preenchem a grade até fechar a última semana (mesma
 * ideia de qualquer calendário mensal: linhas completas, dias fora do mês em
 * branco em vez de mostrar o mês vizinho).
 */
export function calendarMonthGrid(monthAnchor: Date): (CalendarDay | null)[] {
  const year = monthAnchor.getFullYear();
  const month = monthAnchor.getMonth();
  const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Dom
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (CalendarDay | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: toLocalISO(new Date(year, month, d)), day: d });
  }
  while (cells.length % 7 !== 0) cells.push(null);

  return cells;
}
