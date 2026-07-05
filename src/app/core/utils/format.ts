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

/** '2026-06-21' -> '21/06/2026' */
export function ptDate(iso: string): string {
  const parts = iso.split('-');
  if (parts.length !== 3) {
    return iso;
  }
  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}
