import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Expense } from '@core/interfaces/expense.interface';
import { WithId } from '@core/api/entity-store';
import { createExpensesStore } from '@core/api/adapters/expenses.adapter';
import { createFlockStore } from '@core/api/adapters/flock.adapter';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { brl, num, ptDate } from '@core/utils/format';
import { todayLocalISO } from '@core/utils/date-diff';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof Expense;

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function buildFields(): CrudField[] {
  return [
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'description', label: 'Descrição', type: 'text', required: true },
  { key: 'category', label: 'Categoria', type: 'text', required: true },
  { key: 'quantity', label: 'Quantidade comprada', type: 'number', step: 1 },
  { key: 'unitPrice', label: 'Valor da unidade', type: 'number', step: 0.01 },
  {
    key: 'amount',
    label: 'Valor total',
    type: 'number',
    step: 0.01,
    required: true,
    compute: (m) => {
      const quantity = toNumberOrUndefined(m['quantity']);
      const unitPrice = toNumberOrUndefined(m['unitPrice']);
      if (quantity === undefined || unitPrice === undefined || quantity <= 0 || unitPrice <= 0) {
        return undefined;
      }
      return Math.round(quantity * unitPrice * 100) / 100;
    },
  },
  {
    key: 'paid',
    label: 'Situação',
    type: 'select',
    options: [
      { value: 'true', label: 'Pago' },
      { value: 'false', label: 'Pendente' },
    ],
    required: true,
  },
  ];
}

@Component({
  selector: 'app-expenses',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './expenses.html',
  styleUrl: './expenses.scss',
})
export class Expenses {
  protected readonly brl = brl;
  protected readonly ptDate = ptDate;

  protected readonly num = num;

  private readonly store = createExpensesStore();
  private readonly flockStore = createFlockStore();
  private readonly periodFilter = inject(PeriodFilterService);

  protected readonly fields = computed<CrudField[]>(() => buildFields());

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['date', 'description', 'category'];
  private readonly sortState = createSortState<SortField>('date', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Nova despesa');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<Expense> | null>(null);

  /** Despesas do store restritas ao período selecionado no DatePicker/chips da topbar. */
  protected readonly despesasNoPeriodo = computed(() =>
    this.store.items().filter((e) => this.periodFilter.includes(e.date)),
  );

  protected readonly total = computed(() =>
    this.despesasNoPeriodo().reduce((s, e) => s + e.amount, 0),
  );
  protected readonly totalPago = computed(() =>
    this.despesasNoPeriodo()
      .filter((e) => e.paid)
      .reduce((s, e) => s + e.amount, 0),
  );
  protected readonly totalPendente = computed(() =>
    this.despesasNoPeriodo()
      .filter((e) => !e.paid)
      .reduce((s, e) => s + e.amount, 0),
  );
  protected readonly qtdPendente = computed(
    () => this.despesasNoPeriodo().filter((e) => !e.paid).length,
  );

  /** Total de aves em produção (soma da quantidade de cada lote do plantel). */
  protected readonly totalAves = computed(() =>
    this.flockStore.items().reduce((soma, f) => soma + (f.quantity ?? 0), 0),
  );
  /**
   * Custo por ave = despesas do período ÷ total de aves. Número único que o
   * Ytallo pediu no lugar do controle de despesa por galpão (difícil demais):
   * quanto cada ave "custou" no período. Sem aves cadastradas, fica null.
   */
  protected readonly custoPorAve = computed(() => {
    const aves = this.totalAves();
    return aves > 0 ? this.total() / aves : null;
  });

  protected readonly rows = computed<WithId<Expense>[]>(() =>
    sortRows(this.despesasNoPeriodo(), this.sortField(), this.sortDir()),
  );

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Nova despesa');
    this.draft = {
      date: todayLocalISO(),
      description: '',
      category: '',
      quantity: '',
      unitPrice: '',
      amount: 0,
      paid: 'false',
    };
    this.formOpen.set(true);
  }

  protected openEdit(e: WithId<Expense>): void {
    this.editingId = e.id;
    this.formTitle.set('Editar despesa');
    this.draft = { ...e, paid: String(e.paid) };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: Expense = {
      date: String(d['date']),
      description: String(d['description']),
      category: String(d['category']),
      quantity: toNumberOrUndefined(d['quantity']),
      unitPrice: toNumberOrUndefined(d['unitPrice']),
      amount: Number(d['amount']),
      paid: d['paid'] === 'true' || d['paid'] === true,
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(e: WithId<Expense>): void {
    this.deleteTarget.set(e);
  }

  protected cancelDelete(): void {
    this.deleteTarget.set(null);
  }

  protected async confirmDelete(): Promise<void> {
    const target = this.deleteTarget();
    if (!target) return;
    await this.store.remove(target.id);
    this.deleteTarget.set(null);
  }
}
