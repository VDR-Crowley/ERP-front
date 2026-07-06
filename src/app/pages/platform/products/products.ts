import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product } from '@core/interfaces/product.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, num } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';

type SortField = keyof Product;

const FIELDS: CrudField[] = [
  { key: 'name', label: 'Produto', type: 'text', required: true },
  { key: 'unit', label: 'Unidade', type: 'text', required: true },
  { key: 'unitPrice', label: 'Preço', type: 'number', step: 0.01, required: true },
  { key: 'stock', label: 'Estoque', type: 'number', step: 1, required: true },
  { key: 'eggsPerUnit', label: 'Ovos por unidade', type: 'number', step: 1, required: true },
];

@Component({
  selector: 'app-products',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe],
  templateUrl: './products.html',
  styleUrl: './products.scss',
})
export class Products {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<Product>(IDB_STORES.products, []);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['name'];
  protected readonly sortField = signal<SortField | ''>('');
  protected readonly sortDir = signal<1 | -1>(1);

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo produto');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<Product> | null>(null);

  protected readonly totalProdutos = computed(() => this.store.items().length);
  protected readonly valorEstoque = computed(() =>
    this.store.items().reduce((s, p) => s + p.unitPrice * p.stock, 0),
  );
  protected readonly precoMedio = computed(() => {
    const items = this.store.items();
    return items.length ? items.reduce((s, p) => s + p.unitPrice, 0) / items.length : 0;
  });

  protected readonly rows = computed<WithId<Product>[]>(() => {
    let list: WithId<Product>[] = this.store.items();

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
    this.formTitle.set('Novo produto');
    this.draft = { name: '', unit: '', unitPrice: 0, stock: 0, eggsPerUnit: 0 };
    this.formOpen.set(true);
  }

  protected openEdit(p: WithId<Product>): void {
    this.editingId = p.id;
    this.formTitle.set('Editar produto');
    this.draft = { ...p };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: Product = {
      name: String(d['name']),
      unit: String(d['unit']),
      unitPrice: Number(d['unitPrice']),
      stock: Number(d['stock']),
      eggsPerUnit: Number(d['eggsPerUnit']),
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(p: WithId<Product>): void {
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
