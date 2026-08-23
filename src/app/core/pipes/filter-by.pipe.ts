import { Pipe, PipeTransform } from '@angular/core';
import { ptDate } from '@core/utils/format';

// Casa 'aaaa-mm-dd' plano e datetime ISO completo do backend
// ('aaaa-mm-ddTHH:mm:ss[.ssssss]Z'), mesmo formato aceito por ptDate().
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T.*)?$/;
// Marcas de acento combinantes (U+0300–U+036F) resultantes de string.normalize('NFD').
const DIACRITICS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');

/**
 * Normaliza texto de busca: unifica separadores de data (/, -, .),
 * preenche dia/mês com zero à esquerda (para "1/7", "01/07" e
 * "2026-07-01" serem equivalentes) e remove acentos, já que o usuário
 * frequentemente digita sem diacríticos (ex.: "joao" para "João").
 */
function normalize(value: string): string {
  const v = value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(DIACRITICS, '');
  if (v !== '' && /^[\d/\-.]+$/.test(v) && /[/\-.]/.test(v)) {
    return v
      .split(/[/\-.]/)
      .map((seg) => (seg.length === 1 ? seg.padStart(2, '0') : seg))
      .join('/');
  }
  return v;
}

/**
 * Filtra uma lista de itens por texto de busca, comparando um ou mais
 * campos. Campos com valor em formato ISO (aaaa-mm-dd) também são
 * comparados no formato dd/mm/aaaa, então a busca funciona independente
 * do formato de data digitado pelo usuário.
 */
@Pipe({
  name: 'filterBy',
  standalone: true,
  pure: true,
})
export class FilterByPipe implements PipeTransform {
  transform<T extends object>(items: T[], query: string | null | undefined, keys: (keyof T)[]): T[] {
    const q = normalize(query ?? '');
    if (!q) return items;

    return items.filter((item) =>
      keys.some((key) => {
        const raw = item[key];
        if (raw === null || raw === undefined) return false;
        const str = String(raw);
        const candidates = ISO_DATE.test(str) ? [str, ptDate(str)] : [str];
        return candidates.some((c) => normalize(c).includes(q));
      }),
    );
  }
}
