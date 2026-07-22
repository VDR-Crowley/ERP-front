import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
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
  /** No bottom sheet mobile, o overlay flutuante do PrimeNG fica mal posicionado
   * (o `CdkDrag` do sheet mantém `transform` inline no ancestral, o que muda o
   * containing block do painel `position: fixed`). Com `inline=true`, o campo
   * vira um toggle que expande o calendário nativo (`p-datepicker[inline]`) no
   * próprio fluxo do sheet, em vez de abrir um overlay posicionado por JS. */
  readonly inline = input<boolean>(false);
  readonly valueChange = output<Date | DateRange | null>();

  /** Só usado quando `inline()` — controla se o calendário embutido está aberto. */
  protected readonly expanded = signal(false);

  protected readonly resolvedPlaceholder = computed(
    () => this.placeholder() ?? (this.mode() === 'range' ? 'Selecionar período' : 'Selecionar data'),
  );

  protected toggleExpanded(): void {
    this.expanded.update((v) => !v);
  }

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
      if (next === null) {
        // Botão "Limpar" do calendário — emite null pra quem usa o componente
        // saber que o usuário pediu pra remover o filtro (não é "1º clique
        // pendente", que chega como array parcial, tratado abaixo).
        this.valueChange.emit(null);
        this.expanded.set(false);
        return;
      }
      const [start, end] = Array.isArray(next) ? next : [null, null];
      if (!start || !end) {
        // Só o primeiro clique aconteceu (início escolhido, fim ainda não) —
        // não emite ainda, senão o período fecha com início=fim antes do
        // usuário clicar a segunda data.
        return;
      }
      this.valueChange.emit([start, end] as DateRange);
      this.expanded.set(false);
      return;
    }
    this.valueChange.emit(Array.isArray(next) ? null : next);
    this.expanded.set(false);
  }
}
