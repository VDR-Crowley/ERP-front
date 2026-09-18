import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Barn } from '@core/interfaces/barn.interface';
import { WithId } from '@core/api/entity-store';
import { createBarnStore } from '@core/api/adapters/barn.adapter';
import { num, ptDate } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof Barn;

const FIELDS: CrudField[] = [
  { key: 'name', label: 'Nome do galpão', type: 'text', required: true },
  { key: 'location', label: 'Localização', type: 'text' },
  { key: 'startDate', label: 'Data de início', type: 'date' },
  { key: 'notes', label: 'Observação', type: 'text' },
];

@Component({
  selector: 'app-galpoes',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './galpoes.html',
  styleUrl: './galpoes.scss',
})
export class Galpoes {
  protected readonly num = num;
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;

  private readonly store = createBarnStore();

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['name', 'location', 'notes'];
  private readonly sortState = createSortState<SortField>('name', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo galpão');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<Barn> | null>(null);

  protected readonly totalGalpoes = computed(() => this.store.items().length);

  protected readonly rows = computed<WithId<Barn>[]>(() =>
    sortRows(this.store.items(), this.sortField(), this.sortDir()),
  );

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Novo galpão');
    this.draft = { name: '', location: '', startDate: '', notes: '' };
    this.formOpen.set(true);
  }

  protected openEdit(b: WithId<Barn>): void {
    this.editingId = b.id;
    this.formTitle.set('Editar galpão');
    this.draft = { ...b };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: Barn = {
      name: String(d['name'] ?? '').trim(),
      location: String(d['location'] ?? '').trim() || null,
      startDate: String(d['startDate'] ?? '').trim() || null,
      notes: String(d['notes'] ?? '').trim() || null,
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(b: WithId<Barn>): void {
    this.deleteTarget.set(b);
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
