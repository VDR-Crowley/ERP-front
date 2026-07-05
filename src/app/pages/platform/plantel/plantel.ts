import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Plantel as PlantelModel } from '@core/interfaces/plantel.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, num } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';

type SortField = keyof PlantelModel;

const FIELDS: CrudField[] = [
  { key: 'species', label: 'Espécie', type: 'text', required: true },
  { key: 'quantity', label: 'Quantidade', type: 'number', step: 1, required: true },
  { key: 'feedBagsPerMonth', label: 'Sacos de ração/mês', type: 'number', step: 1, required: true },
  { key: 'bagPrice', label: 'Preço do saco', type: 'number', step: 0.01, required: true },
];

@Component({
  selector: 'app-plantel',
  imports: [FormsModule, CrudFormModal, ConfirmModal],
  templateUrl: './plantel.html',
  styleUrl: './plantel.scss',
})
export class Plantel {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<PlantelModel>(IDB_STORES.flock, []);

  protected readonly search = signal('');
  protected readonly sortField = signal<SortField | ''>('');
  protected readonly sortDir = signal<1 | -1>(1);

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Nova espécie');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<PlantelModel> | null>(null);

  protected readonly especies = computed(() => this.store.items().length);
  protected readonly totalAves = computed(() =>
    this.store.items().reduce((soma, p) => soma + p.quantity, 0),
  );
  protected readonly totalSacos = computed(() =>
    this.store.items().reduce((soma, p) => soma + p.feedBagsPerMonth, 0),
  );
  protected readonly investimento = computed(() =>
    this.store.items().reduce((soma, p) => soma + p.monthlyTotal, 0),
  );

  protected readonly rows = computed<WithId<PlantelModel>[]>(() => {
    const query = this.search().trim().toLowerCase();
    let list: WithId<PlantelModel>[] = this.store.items();

    if (query) {
      list = list.filter((p) => p.species.toLowerCase().includes(query));
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
    this.formTitle.set('Nova espécie');
    this.draft = { species: '', quantity: 0, feedBagsPerMonth: 0, bagPrice: 0 };
    this.formOpen.set(true);
  }

  protected openEdit(p: WithId<PlantelModel>): void {
    this.editingId = p.id;
    this.formTitle.set('Editar espécie');
    this.draft = { ...p };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const feedBagsPerMonth = Number(d['feedBagsPerMonth']);
    const bagPrice = Number(d['bagPrice']);
    const record: PlantelModel = {
      species: String(d['species']),
      quantity: Number(d['quantity']),
      feedBagsPerMonth,
      bagPrice,
      monthlyTotal: feedBagsPerMonth * bagPrice,
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(p: WithId<PlantelModel>): void {
    this.deleteTarget.set(p);
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
