import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { PeriodFilterService } from '@core/services/period-filter.service';
import type { DateRange } from '@shared/components-ds/date-picker/date-picker';

interface MonthChip {
  label: string;
  range: DateRange;
}

function startOfMonth(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfMonth(date: Date): Date {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}

/** "jan.", "fev." etc. do Intl viram "Jan", "Fev" (sem ponto, com maiúscula). */
function monthLabel(date: Date): string {
  const raw = new Intl.DateTimeFormat('pt-BR', { month: 'short' }).format(date).replace('.', '');
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

/**
 * Atalhos de mês (anterior/atual/seguinte) ao lado do `AppDatePicker` na
 * topbar. Complementa o DatePicker — não o substitui, já que Relatórios
 * ainda precisa do período customizado. Sempre calculado a partir da data
 * real de hoje, nunca hardcoded.
 */
@Component({
  selector: 'app-month-tabs',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './month-tabs.html',
  styleUrl: './month-tabs.scss',
})
export class MonthTabs {
  private readonly periodFilter = inject(PeriodFilterService);

  private readonly months: MonthChip[] = [-1, 0, 1].map((offset) => {
    const now = new Date();
    const ref = new Date(now.getFullYear(), now.getMonth() + offset, 1);
    return { label: monthLabel(ref), range: [startOfMonth(ref), endOfMonth(ref)] as DateRange };
  });

  /** Nenhum chip de mês fica ativo quando o filtro está limpo, ou quando o período atual (ex.: custom do DatePicker) não bate com nenhum dos 3 meses. */
  protected readonly chips = computed(() => {
    const active = this.periodFilter.active();
    const [start, end] = this.periodFilter.range();
    return this.months.map((chip) => ({
      ...chip,
      active:
        active &&
        start.getTime() === chip.range[0].getTime() &&
        end.getTime() === chip.range[1].getTime(),
    }));
  });

  /** "Tudo" fica ativo quando o filtro de período está limpo (mostrando todos os dados). */
  protected readonly allActive = computed(() => !this.periodFilter.active());

  protected select(chip: MonthChip): void {
    this.periodFilter.setRange(chip.range);
  }

  protected clear(): void {
    this.periodFilter.clear();
  }
}
