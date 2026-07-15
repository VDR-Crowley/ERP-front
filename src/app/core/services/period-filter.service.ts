import { Injectable, signal } from '@angular/core';
import { DateRange } from '@shared/components-ds/date-picker/date-picker';

function daysAgo(date: Date, days: number): Date {
  const start = new Date(date);
  start.setDate(start.getDate() - days);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfToday(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

const now = new Date();
// Janela móvel de 30 dias (não "1º dia do mês até hoje"): no início de cada
// mês, "mês atual" cobre poucos dias e mistura despesas do mês novo com
// receita do mês anterior que ainda não caiu aqui — isso já derrubou a Margem
// de Relatórios pra negativo mesmo com o negócio saudável no acumulado.
const DEFAULT_RANGE: DateRange = [daysAgo(now, 29), endOfToday(now)];

/**
 * Período selecionado no DatePicker da topbar (`layout-app`), compartilhado
 * com as telas que filtram por data (Relatórios é a primeira). Signal único
 * pra topbar e telas ficarem sincronizadas sem passar o valor por @Input.
 */
@Injectable({ providedIn: 'root' })
export class PeriodFilterService {
  readonly range = signal<DateRange>(DEFAULT_RANGE);
  /** `false` = filtro limpo ("Tudo"/"Limpar") — telas mostram os dados completos. */
  readonly active = signal<boolean>(true);

  setRange(range: DateRange): void {
    this.range.set(range);
    this.active.set(true);
  }

  /** Remove o filtro sem precisar recarregar a página — telas voltam a mostrar tudo. */
  clear(): void {
    this.active.set(false);
  }

  /** `true` se a data ISO (`YYYY-MM-DD`) cair dentro do período selecionado, ou sempre `true` com o filtro limpo. */
  includes(isoDate: string): boolean {
    if (!this.active()) return true;
    const [start, end] = this.range();
    const date = new Date(`${isoDate}T00:00:00`);
    return date >= start && date <= end;
  }
}
