// Helpers de formatação usados pelas telas (pt-BR via Intl, sem depender de
// registerLocaleData). Mantidos em core/utils para reuso entre componentes.

export function brl(value: number | null | undefined): string {
  const n = Number(value ?? 0);
  return `R$ ${n.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function num(value: number | null | undefined, decimals = 0): string {
  if (value === null || value === undefined) {
    return '—';
  }
  return Number(value).toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

const ISO_DATE_PREFIX = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * '2026-06-21' -> '21/06/2026'. Também aceita datetime ISO completo do
 * backend (Laravel/Carbon), ex. '2026-06-21T00:00:00.000000Z' -> '21/06/2026'.
 *
 * Extrai ano/mês/dia direto dos dígitos da string (regex), sem passar por
 * `Date`/`toISOString()` — evita qualquer conversão de fuso horário, que
 * perto da meia-noite local poderia adiantar ou atrasar o dia exibido
 * (mesmo cuidado de `toLocalISO`/`todayLocalISO` em `date-diff.ts`).
 *
 * Se `value` for um `Date`, usa os componentes locais (não UTC), pelo
 * mesmo motivo.
 */
export function ptDate(value: string | Date): string {
  if (value instanceof Date) {
    const y = value.getFullYear();
    const m = String(value.getMonth() + 1).padStart(2, '0');
    const d = String(value.getDate()).padStart(2, '0');
    return `${d}/${m}/${y}`;
  }
  const match = ISO_DATE_PREFIX.exec(value);
  if (!match) {
    return value;
  }
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
