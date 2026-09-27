import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Expense } from '@core/interfaces/expense.interface';
import { WithId } from '@core/api/entity-store';
import { createExpensesStore } from '@core/api/adapters/expenses.adapter';
import { createFlockStore } from '@core/api/adapters/flock.adapter';
import {
  allocateExpenseAmount,
  classifyFlockSpecies,
  computeFlockRatio,
} from '@core/utils/business-line-report.util';
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

  /**
   * Aves em produção separadas por espécie (codorna x galinha), classificando
   * cada lote do plantel pelo texto de `species` (mesma regra da Análise por
   * Linha de Negócio — ver `classifyFlockSpecies`).
   */
  protected readonly avesPorEspecie = computed(() => {
    let codorna = 0;
    let galinha = 0;
    for (const f of this.flockStore.items()) {
      const especie = classifyFlockSpecies(f.species);
      if (especie === 'codorna') codorna += f.quantity ?? 0;
      else if (especie === 'galinha') galinha += f.quantity ?? 0;
    }
    return { codorna, galinha };
  });
  /**
   * Despesas do período alocadas por espécie: cada despesa vai 100% pra codorna
   * ou galinha quando a categoria/descrição menciona uma só; senão é rateada
   * pelo tamanho do plantel (`allocateExpenseAmount`, mesma regra da Análise por
   * Linha de Negócio).
   */
  protected readonly despesaPorEspecie = computed(() => {
    const ratio = computeFlockRatio(this.flockStore.items());
    let codorna = 0;
    let galinha = 0;
    for (const e of this.despesasNoPeriodo()) {
      const alloc = allocateExpenseAmount(e, ratio);
      codorna += alloc.codorna;
      galinha += alloc.galinha;
    }
    return { codorna, galinha };
  });
  /**
   * Custo por ave POR ESPÉCIE = despesas alocadas àquela espécie ÷ nº de aves
   * dela. Codorna e galinha calculados separados (a granja não mistura o custo).
   * Espécie sem aves cadastradas fica null.
   */
  protected readonly custoPorAveCodorna = computed(() => {
    const aves = this.avesPorEspecie().codorna;
    return aves > 0 ? this.despesaPorEspecie().codorna / aves : null;
  });
  protected readonly custoPorAveGalinha = computed(() => {
    const aves = this.avesPorEspecie().galinha;
    return aves > 0 ? this.despesaPorEspecie().galinha / aves : null;
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
