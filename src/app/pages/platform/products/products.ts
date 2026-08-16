import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product } from '@core/interfaces/product.interface';
import { EstoqueOvos } from '@core/interfaces/estoque-ovos.interface';
import { VendorStock } from '@core/interfaces/vendor-stock.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, num } from '@core/utils/format';
import { latestByDate } from '@core/utils/latest-by-date';
import { totalStockAllLocations } from '@core/utils/stock-location';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

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
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './products.html',
  styleUrl: './products.scss',
})
export class Products {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<Product>(IDB_STORES.products, []);
  private readonly eggStockStore = createEntityStore<EstoqueOvos>(IDB_STORES.eggStock, []);
  private readonly vendorStockStore = createEntityStore<VendorStock>(IDB_STORES.vendorStock, []);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['name'];
  private readonly sortState = createSortState<SortField>('name', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo produto');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<Product> | null>(null);

  // Carry-forward igual Estoque de Ovos/Dashboard: sempre a linha mais
  // recente por data, ignorando linhas "molde" sem produção nenhuma.
  private readonly ultimoEstoqueOvos = computed(() =>
    latestByDate(
      this.eggStockStore.items().filter((e) => e.quailEggs !== null || e.chickenEggs !== null),
    ),
  );

  // "Estoque" cadastrado no produto é um número solto (digitado à mão ou
  // vindo do import) — pra produto de uma espécie só, dá pra calcular quantas
  // unidades cabem no estoque real de ovos. Kit misto (mistura codorna +
  // galinha numa proporção que o modelo de Produto não guarda) e produtos que
  // não são ovo (ex: carne de codorna abatida, que não tem tela de estoque
  // própria ainda) continuam usando o campo cadastrado, sem dado real pra
  // puxar.
  protected estoqueReal(p: Product): number {
    const estoque = this.ultimoEstoqueOvos();
    if (!estoque || !p.eggsPerUnit) return p.stock;
    if (p.name === '50 ovos de codorna' && estoque.quailEggs !== null) {
      return Math.floor(estoque.quailEggs / p.eggsPerUnit);
    }
    if (p.name === '1 Bandeja de ovos de galinha' && estoque.chickenEggs !== null) {
      return Math.floor(estoque.chickenEggs / p.eggsPerUnit);
    }
    return p.stock;
  }

  /** Estoque total do produto = Plantel (estoqueReal) + soma do que está com cada vendedor. */
  protected estoqueTotal(p: Product): number {
    return totalStockAllLocations(this.estoqueReal(p), this.vendorStockStore.items(), p.name);
  }

  protected readonly totalProdutos = computed(() => this.store.items().length);
  // Valor total de estoque = soma de todos os locais (Plantel + cada Vendedor), não só o Plantel.
  protected readonly valorEstoque = computed(() =>
    this.store.items().reduce((s, p) => s + p.unitPrice * this.estoqueTotal(p), 0),
  );
  protected readonly precoMedio = computed(() => {
    const items = this.store.items();
    return items.length ? items.reduce((s, p) => s + p.unitPrice, 0) / items.length : 0;
  });

  protected readonly rows = computed<WithId<Product>[]>(() =>
    sortRows(this.store.items(), this.sortField(), this.sortDir()),
  );

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
