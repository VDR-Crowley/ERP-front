/** 'YYYY-MM-DD' + N dias -> 'YYYY-MM-DD' (aritmética em UTC, evita drift de fuso). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * Data de hoje no fuso local do navegador, em 'YYYY-MM-DD'. Usar isso (e não
 * `new Date().toISOString().slice(0, 10)`, que é UTC) como default de "hoje" em
 * formulários — perto da meia-noite UTC (21h em fusos como o do Brasil, UTC-3)
 * o ISO já vira o dia seguinte, adiantando a data padrão incorretamente.
 */
export function todayLocalISO(): string {
  return toLocalISO(new Date());
}

/** Qualquer `Date` (fuso local do navegador) -> 'YYYY-MM-DD'. Mesmo motivo de `todayLocalISO`: evita o drift de `toISOString()` (UTC) perto da meia-noite local. */
export function toLocalISO(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Dias entre hoje (fuso local) e a data ISO informada (negativo se já passou). */
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  const [ty, tm, td] = todayLocalISO().split('-').map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  return Math.round((target - today) / 86400000);
}
