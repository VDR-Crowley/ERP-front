import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProducaoDiaria } from '@core/interfaces/producao-diaria.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { num, ptDate } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';

type Row = WithId<ProducaoDiaria> & { total: number };
type SortField = keyof Row;

const FIELDS: CrudField[] = [
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'quailEggs', label: 'Ovos codorna', type: 'number', step: 1 },
  { key: 'chickenEggs', label: 'Ovos galinha', type: 'number', step: 1 },
];

@Component({
  selector: 'app-production',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe],
  templateUrl: './production.html',
  styleUrl: './production.scss',
})
export class Production {
  protected readonly num = num;
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<ProducaoDiaria>(IDB_STORES.dailyProduction, []);

  protected readonly search = signal('');
  protected readonly searchKeys: (keyof Row)[] = ['date'];
  protected readonly sortField = signal<SortField | ''>('');
  protected readonly sortDir = signal<1 | -1>(1);

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo registro');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<ProducaoDiaria> | null>(null);

  protected readonly totalCodorna = computed(() =>
    this.store.items().reduce((soma, p) => soma + (p.quailEggs ?? 0), 0),
  );
  protected readonly totalGalinha = computed(() =>
    this.store.items().reduce((soma, p) => soma + (p.chickenEggs ?? 0), 0),
  );
  protected readonly totalGeral = computed(() => this.totalCodorna() + this.totalGalinha());
  protected readonly mediaDia = computed(() => {
    const items = this.store.items();
    return items.length ? Math.round(this.totalGeral() / items.length) : 0;
  });

  protected readonly rows = computed<Row[]>(() => {
    let list: Row[] = this.store.items().map((p) => ({
      ...p,
      total: (p.quailEggs ?? 0) + (p.chickenEggs ?? 0),
    }));

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
    this.draft = { date: new Date().toISOString().slice(0, 10), quailEggs: 0, chickenEggs: 0 };
    this.formOpen.set(true);
  }

  protected openEdit(p: WithId<ProducaoDiaria>): void {
    this.editingId = p.id;
    this.formTitle.set('Editar registro');
    this.draft = { ...p };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: ProducaoDiaria = {
      date: String(d['date']),
      quailEggs: d['quailEggs'] === '' || d['quailEggs'] === null ? null : Number(d['quailEggs']),
      chickenEggs:
        d['chickenEggs'] === '' || d['chickenEggs'] === null ? null : Number(d['chickenEggs']),
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(p: WithId<ProducaoDiaria>): void {
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
