import { Injectable, signal } from '@angular/core';
import { DateRange } from '@shared/components-ds/date-picker/date-picker';

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfToday(date: Date): Date {
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);
  return end;
}

const now = new Date();
const DEFAULT_RANGE: DateRange = [startOfMonth(now), endOfToday(now)];

/**
 * Período selecionado no DatePicker da topbar (`layout-app`), compartilhado
 * com as telas que filtram por data (Relatórios é a primeira). Signal único
 * pra topbar e telas ficarem sincronizadas sem passar o valor por @Input.
 */
@Injectable({ providedIn: 'root' })
export class PeriodFilterService {
  readonly range = signal<DateRange>(DEFAULT_RANGE);

  setRange(range: DateRange): void {
    this.range.set(range);
  }

  /** `true` se a data ISO (`YYYY-MM-DD`) cair dentro do período selecionado. */
  includes(isoDate: string): boolean {
    const [start, end] = this.range();
    const date = new Date(`${isoDate}T00:00:00`);
    return date >= start && date <= end;
  }
}
