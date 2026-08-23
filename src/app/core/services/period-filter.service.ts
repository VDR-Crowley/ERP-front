import { Injectable, signal } from '@angular/core';
import { DateRange } from '@shared/components-ds/date-picker/date-picker';

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

const now = new Date();
// Mês corrente inteiro (1º ao último dia), igual ao chip "atual" do
// MonthTabs — pedido do cliente pra abrir a app já com o mês em vez de
// "Tudo" em branco. Nota: nos primeiros dias do mês isso pode distorcer a
// Margem de Relatórios (poucos dias de receita vs. despesas já lançadas);
// se voltar a incomodar, considerar voltar pra janela móvel de 30 dias.
const DEFAULT_RANGE: DateRange = [startOfMonth(now), endOfMonth(now)];

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

  /**
   * `true` se a data cair dentro do período selecionado, ou sempre `true` com
   * o filtro limpo. Aceita tanto `YYYY-MM-DD` quanto o ISO datetime completo
   * que a API devolve (`2026-08-17T00:00:00.000000Z`) — `slice(0, 10)` pega
   * só a parte da data antes de montar o horário local, senão
   * `new Date('...Z' + 'T00:00:00')` vira string malformada e `Invalid Date`
   * (toda comparação com `Invalid Date` é `false`, zerando o filtro pra
   * qualquer período).
   */
  includes(isoDate: string): boolean {
    if (!this.active()) return true;
    const [start, end] = this.range();
    const date = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
    return date >= start && date <= end;
  }
}
