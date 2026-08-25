import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { DatePickerModule } from 'primeng/datepicker';

const MONTH_ABBR = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "ago" -> "Ago 2026". Monta a partir de `MONTH_ABBR` (não `Intl`) pra bater
 * exatamente com `monthNamesShort` do `app.config.ts`, evitando o "ago. de
 * 2026" que o `Intl.DateTimeFormat('pt-BR', { month: 'short', year: 'numeric' })` produz. */
function monthYearLabel(date: Date): string {
  const abbr = MONTH_ABBR[date.getMonth()];
  return `${abbr.charAt(0).toUpperCase()}${abbr.slice(1)} ${date.getFullYear()}`;
}

/**
 * Botão único ("Ago 2026") que abre um `p-datepicker` em `view="month"` —
 * grade de meses com navegação por ano e atalhos "Hoje"/"Limpar" (via
 * `showButtonBar`, traduzidos em `app.config.ts`). Substitui os 3 chips fixos
 * (mês anterior/atual/seguinte) do `MonthTabs` por um seletor livre de
 * qualquer mês/ano.
 */
@Component({
  selector: 'app-month-picker',
  standalone: true,
  imports: [FormsModule, DatePickerModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './month-picker.html',
  styleUrl: './month-picker.scss',
})
export class MonthPicker {
  /** Mês exibido no botão (qualquer dia dentro do mês; só mês/ano importam). */
  readonly value = input<Date | null>(null);
  /** Estampa o botão como ativo (mesmo visual do antigo chip selecionado). */
  readonly active = input<boolean>(false);
  readonly valueChange = output<Date | null>();

  protected readonly label = computed(() => {
    const v = this.value();
    return v ? monthYearLabel(v) : 'Selecionar mês';
  });

  protected onModelChange(next: Date | null): void {
    this.valueChange.emit(next);
  }
}
