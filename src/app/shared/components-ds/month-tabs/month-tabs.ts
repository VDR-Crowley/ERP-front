import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { MonthPicker } from '@shared/components-ds/month-picker/month-picker';
import { PeriodFilterService } from '@core/services/period-filter.service';
import type { DateRange } from '@shared/components-ds/date-picker/date-picker';

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

/** `true` se `[start, end]` for exatamente o mês cheio (1º ao último dia) de `start`. */
function isWholeMonth(start: Date, end: Date): boolean {
  return start.getTime() === startOfMonth(start).getTime() && end.getTime() === endOfMonth(start).getTime();
}

/**
 * Atalho de mês (via `MonthPicker`, popup com grade jan-dez + navegação de
 * ano) ao lado do `AppDatePicker` na topbar. Complementa o DatePicker — não
 * o substitui, já que Relatórios ainda precisa do período customizado.
 * Mostra sempre o mês corrente real quando o filtro não bate com nenhum mês
 * cheio (ex.: "Tudo" ou um range custom) — nunca hardcoded.
 */
@Component({
  selector: 'app-month-tabs',
  standalone: true,
  imports: [MonthPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './month-tabs.html',
  styleUrl: './month-tabs.scss',
})
export class MonthTabs {
  private readonly periodFilter = inject(PeriodFilterService);

  /** Mês mostrado no botão: o mês ativo do filtro quando ele for um mês
   * cheio, senão o mês corrente real (mesmo fallback do `MonthPicker` antes
   * de qualquer seleção). */
  protected readonly displayedMonth = computed(() => {
    const active = this.periodFilter.active();
    const [start, end] = this.periodFilter.range();
    if (active && isWholeMonth(start, end)) return start;
    return startOfMonth(new Date());
  });

  /** Botão fica com o visual "ativo" só quando o filtro corrente é
   * exatamente esse mês cheio — igual ao antigo chip selecionado. */
  protected readonly monthActive = computed(() => {
    const active = this.periodFilter.active();
    const [start, end] = this.periodFilter.range();
    return active && isWholeMonth(start, end);
  });

  /** "Tudo" fica ativo quando o filtro de período está limpo (mostrando todos os dados). */
  protected readonly allActive = computed(() => !this.periodFilter.active());

  protected selectMonth(month: Date | null): void {
    if (!month) {
      // Botão "Limpar" do popup — mesmo efeito do "Tudo".
      this.periodFilter.clear();
      return;
    }
    this.periodFilter.setRange([startOfMonth(month), endOfMonth(month)] as DateRange);
  }

  protected clear(): void {
    this.periodFilter.clear();
  }
}
