/** 'YYYY-MM-DD' + N dias -> 'YYYY-MM-DD' (aritmética em UTC, evita drift de fuso). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Dias entre hoje e a data ISO informada (negativo se já passou). */
export function daysUntil(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  const target = Date.UTC(y, m - 1, d);
  // Mesma base de "hoje" usada nos defaults de data da tela (new Date().toISOString().slice(0, 10))
  // — usar getFullYear/getMonth/getDate (hora local) aqui desalinhava 1 dia com esses defaults
  // em fusos atrás de UTC.
  const [ty, tm, td] = new Date().toISOString().slice(0, 10).split('-').map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  return Math.round((target - today) / 86400000);
}
