const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * 'YYYY-MM-DD' ou datetime ISO completo do backend (Laravel/Carbon), ex.
 * '2026-08-19T00:00:00.000000Z' -> [ano, mês, dia] como números.
 *
 * Extrai os dígitos via regex em vez de `iso.split('-')` puro: com datetime
 * completo, o split ingênuo joga o sufixo "T00:00:00...Z" dentro do dia
 * (ex. "19T00:00:00.000000Z"), e `Number()` disso vira `NaN` — mesmo motivo
 * de `ptDate` em `format.ts` aceitar os dois formatos.
 */
function parseIsoDateParts(iso: string): [number, number, number] {
  const match = ISO_DATE_PREFIX.exec(iso);
  if (!match) return [NaN, NaN, NaN];
  const [, y, m, d] = match;
  return [Number(y), Number(m), Number(d)];
}

/** 'YYYY-MM-DD' (ou datetime ISO completo) + N dias -> 'YYYY-MM-DD' (aritmética em UTC, evita drift de fuso). */
export function addDays(iso: string, days: number): string {
  const [y, m, d] = parseIsoDateParts(iso);
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

/** Dias entre hoje (fuso local) e a data ISO informada (negativo se já passou). Aceita 'YYYY-MM-DD' ou datetime ISO completo da API. */
export function daysUntil(iso: string): number {
  const [y, m, d] = parseIsoDateParts(iso);
  const target = Date.UTC(y, m - 1, d);
  const [ty, tm, td] = todayLocalISO().split('-').map(Number);
  const today = Date.UTC(ty, tm - 1, td);
  return Math.round((target - today) / 86400000);
}

/** Dias desde a data ISO informada até hoje (fuso local); negativo se for no futuro. Aceita 'YYYY-MM-DD' ou datetime ISO completo da API. */
export function daysSince(iso: string): number {
  return -daysUntil(iso) || 0; // evita -0 quando a data é hoje
}

/**
 * 'YYYY-MM-DD' ou datetime ISO completo do backend (Laravel/Carbon) -> sempre
 * 'YYYY-MM-DD' puro (ou `null`/`undefined` intactos). Necessário antes de
 * jogar um valor de data num `<input type="date">`: o input nativo só aceita
 * o formato exato, e um datetime completo (ex. '2026-08-19T00:00:00.000000Z')
 * faz o binding falhar em silêncio, deixando o campo vazio (mesmo motivo de
 * `parseIsoDateParts` acima).
 */
export function toDateOnly<T extends string | null | undefined>(iso: T): T {
  if (!iso) return iso;
  const match = ISO_DATE_PREFIX.exec(iso);
  return (match ? `${match[1]}-${match[2]}-${match[3]}` : iso) as T;
}
