import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Vendedor } from '@core/interfaces/vendedor.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { num } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof Vendedor;

const FIELDS: CrudField[] = [
  { key: 'name', label: 'Nome', type: 'text', required: true },
  { key: 'contact', label: 'Contato', type: 'text' },
  { key: 'active', label: 'Ativo', type: 'checkbox' },
];

@Component({
  selector: 'app-vendedores',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './vendedores.html',
  styleUrl: './vendedores.scss',
})
export class Vendedores {
  protected readonly num = num;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<Vendedor>(IDB_STORES.vendedores, []);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['name', 'contact'];
  private readonly sortState = createSortState<SortField>('name', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo vendedor');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<Vendedor> | null>(null);

  protected readonly totalVendedores = computed(() => this.store.items().length);
  protected readonly totalAtivos = computed(
    () => this.store.items().filter((v) => v.active).length,
  );

  protected readonly rows = computed<WithId<Vendedor>[]>(() =>
    sortRows(this.store.items(), this.sortField(), this.sortDir()),
  );

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Novo vendedor');
    this.draft = { name: '', contact: '', active: true };
    this.formOpen.set(true);
  }

  protected openEdit(v: WithId<Vendedor>): void {
    this.editingId = v.id;
    this.formTitle.set('Editar vendedor');
    this.draft = { ...v };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: Vendedor = {
      name: String(d['name'] ?? '').trim(),
      contact: String(d['contact'] ?? '').trim(),
      active: !!d['active'],
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(v: WithId<Vendedor>): void {
    this.deleteTarget.set(v);
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
