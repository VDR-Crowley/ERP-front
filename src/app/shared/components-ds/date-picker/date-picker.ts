import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';

export type DatePickerMode = 'single' | 'range';
export type DateRange = [Date, Date];

/**
 * DatePicker reutilizável do design system (`components-ds`). Envolve o
 * `p-datepicker` do PrimeNG, com input somente-leitura (abre calendário, não
 * digita) estilizado como pill via tokens `--erp-*`. O atalho "Hoje" vem do
 * `showButtonBar` do PrimeNG (traduzido em `app.config.ts`).
 */
@Component({
  selector: 'app-date-picker',
  standalone: true,
  imports: [FormsModule, DatePickerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './date-picker.html',
  styleUrl: './date-picker.scss',
})
export class DatePicker {
  readonly mode = input<DatePickerMode>('single');
  readonly value = input<Date | DateRange | null>(null);
  readonly placeholder = input<string>();
  readonly valueChange = output<Date | DateRange | null>();

  protected readonly resolvedPlaceholder = computed(
    () => this.placeholder() ?? (this.mode() === 'range' ? 'Selecionar período' : 'Selecionar data'),
  );

  /** Valor no formato que o p-datepicker espera: `Date | Date[]`. */
  protected readonly internalValue = computed<Date | Date[] | null>(() => {
    const v = this.value();
    if (this.mode() === 'range') {
      return Array.isArray(v) ? v : null;
    }
    return Array.isArray(v) ? null : v;
  });

  protected onModelChange(next: Date | Date[] | null): void {
    if (this.mode() === 'range') {
      const [start, end] = Array.isArray(next) ? next : [null, null];
      this.valueChange.emit(start ? ([start, end ?? start] as DateRange) : null);
      return;
    }
    this.valueChange.emit(Array.isArray(next) ? null : next);
  }
}
