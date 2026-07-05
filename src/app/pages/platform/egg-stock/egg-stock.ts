import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EstoqueOvos as EstoqueOvosModel } from '@core/interfaces/estoque-ovos.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, num, ptDate } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';

type SortField = keyof EstoqueOvosModel;

const FIELDS: CrudField[] = [
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'quailEggs', label: 'Ovos codorna', type: 'number', step: 1 },
  { key: 'chickenEggs', label: 'Ovos galinha', type: 'number', step: 1 },
  { key: 'quailPacks', label: 'Pack codorna', type: 'number', step: 0.01, required: true },
  { key: 'chickenPacks', label: 'Pack galinha', type: 'number', step: 0.01, required: true },
  { key: 'quailStockValue', label: 'Valor estoque codorna', type: 'number', step: 0.01, required: true },
  { key: 'chickenStockValue', label: 'Valor estoque galinha', type: 'number', step: 0.01, required: true },
];

@Component({
  selector: 'app-egg-stock',
  imports: [FormsModule, CrudFormModal, ConfirmModal],
  templateUrl: './egg-stock.html',
  styleUrl: './egg-stock.scss',
})
export class EggStock {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<EstoqueOvosModel>(IDB_STORES.eggStock, []);

  protected readonly search = signal('');
  protected readonly sortField = signal<SortField | ''>('');
  protected readonly sortDir = signal<1 | -1>(1);

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo registro');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<EstoqueOvosModel> | null>(null);

  protected readonly totalCodorna = computed(() =>
    this.store.items().reduce((soma, e) => soma + (e.quailEggs ?? 0), 0),
  );
  protected readonly totalGalinha = computed(() =>
    this.store.items().reduce((soma, e) => soma + (e.chickenEggs ?? 0), 0),
  );
  protected readonly totalPacks = computed(() =>
    this.store.items().reduce((soma, e) => soma + e.quailPacks + e.chickenPacks, 0),
  );
  protected readonly valorTotal = computed(() =>
    this.store.items().reduce((soma, e) => soma + e.quailStockValue + e.chickenStockValue, 0),
  );

  protected readonly rows = computed<WithId<EstoqueOvosModel>[]>(() => {
    const query = this.search().trim().toLowerCase();
    let list: WithId<EstoqueOvosModel>[] = this.store.items();

    if (query) {
      list = list.filter((e) => ptDate(e.date).toLowerCase().includes(query));
    }

    const field = this.sortField();
    const dir = this.sortDir();
    if (field) {
      list = [...list].sort((a, b) => {
        const x = a[field];
        const y = b[field];
        if (x === null) return 1;
        if (y === null) return -1;
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
    this.formTitle.set('Novo registro');
    this.draft = {
      date: new Date().toISOString().slice(0, 10),
      quailEggs: 0,
      chickenEggs: 0,
      quailPacks: 0,
      chickenPacks: 0,
      quailStockValue: 0,
      chickenStockValue: 0,
    };
    this.formOpen.set(true);
  }

  protected openEdit(e: WithId<EstoqueOvosModel>): void {
    this.editingId = e.id;
    this.formTitle.set('Editar registro');
    this.draft = { ...e };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: EstoqueOvosModel = {
      date: String(d['date']),
      quailEggs: d['quailEggs'] === '' || d['quailEggs'] === null ? null : Number(d['quailEggs']),
      chickenEggs: d['chickenEggs'] === '' || d['chickenEggs'] === null ? null : Number(d['chickenEggs']),
      quailPacks: Number(d['quailPacks']),
      chickenPacks: Number(d['chickenPacks']),
      quailStockValue: Number(d['quailStockValue']),
      chickenStockValue: Number(d['chickenStockValue']),
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(e: WithId<EstoqueOvosModel>): void {
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
