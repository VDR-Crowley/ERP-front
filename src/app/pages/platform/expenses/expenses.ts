import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Expense } from '@core/interfaces/expense.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, ptDate } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';

type SortField = keyof Expense;

const FIELDS: CrudField[] = [
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'description', label: 'Descrição', type: 'text', required: true },
  { key: 'category', label: 'Categoria', type: 'text', required: true },
  { key: 'amount', label: 'Valor', type: 'number', step: 0.01, required: true },
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

@Component({
  selector: 'app-expenses',
  imports: [FormsModule, CrudFormModal, ConfirmModal],
  templateUrl: './expenses.html',
  styleUrl: './expenses.scss',
})
export class Expenses {
  protected readonly brl = brl;
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<Expense>(IDB_STORES.expenses, []);

  protected readonly search = signal('');
  protected readonly sortField = signal<SortField | ''>('');
  protected readonly sortDir = signal<1 | -1>(1);

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Nova despesa');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<Expense> | null>(null);

  protected readonly total = computed(() =>
    this.store.items().reduce((s, e) => s + e.amount, 0),
  );
  protected readonly totalPago = computed(() =>
    this.store
      .items()
      .filter((e) => e.paid)
      .reduce((s, e) => s + e.amount, 0),
  );
  protected readonly totalPendente = computed(() =>
    this.store
      .items()
      .filter((e) => !e.paid)
      .reduce((s, e) => s + e.amount, 0),
  );
  protected readonly qtdPendente = computed(
    () => this.store.items().filter((e) => !e.paid).length,
  );

  protected readonly rows = computed<WithId<Expense>[]>(() => {
    const query = this.search().trim().toLowerCase();
    let list: WithId<Expense>[] = this.store.items();

    if (query) {
      list = list.filter((e) =>
        [e.description, e.category, ptDate(e.date)].some((v) => v.toLowerCase().includes(query)),
      );
    }

    const field = this.sortField();
    const dir = this.sortDir();
    if (field) {
      list = [...list].sort((a, b) => {
        const x = a[field];
        const y = b[field];
        if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
        return String(x).localeCompare(String(y)) * dir;
      });
    }
    return list;
  });

  protected sortBy(field: SortField): void {
    if (this.sortField() === field) {
      this.sortDir.update((d) => (d === 1 ? -1 : 1));
    } else {
      this.sortField.set(field);
      this.sortDir.set(1);
    }
  }

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Nova despesa');
    this.draft = {
      date: new Date().toISOString().slice(0, 10),
      description: '',
      category: '',
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
