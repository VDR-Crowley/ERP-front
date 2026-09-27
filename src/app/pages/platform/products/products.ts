import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product } from '@core/interfaces/product.interface';
import { WithId } from '@core/api/entity-store';
import { createProductsStore } from '@core/api/adapters/products.adapter';
import { createVendorStockStore } from '@core/api/adapters/vendor-stock.adapter';
import { createBarnStockStore } from '@core/api/adapters/barn-stock.adapter';
import { brl, num } from '@core/utils/format';
import { totalStockAllLocations, totalStockValue } from '@core/utils/stock-location';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof Product;

@Component({
  selector: 'app-products',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './products.html',
  styleUrl: './products.scss',
})
export class Products {
  protected readonly brl = brl;
  protected readonly num = num;

  private readonly store = createProductsStore();
  private readonly vendorStockStore = createVendorStockStore();
  private readonly barnStockStore = createBarnStockStore();

  /**
   * Campos do form: nome, preço e UM estoque (Plantel = `product.stock`). Galpão
   * deixou de ser local de estoque — o saldo é único no Plantel (antes havia um
   * campo "Estoque <galpão>" por galpão).
   */
  protected readonly fields = computed<CrudField[]>(() => [
    { key: 'name', label: 'Produto', type: 'text', required: true },
    { key: 'unitPrice', label: 'Preço', type: 'number', step: 0.01, required: true },
    { key: 'stock', label: 'Estoque (Plantel)', type: 'number', step: 1 },
  ]);

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

  /**
   * "Estoque no Plantel" é sempre `p.stock` puro — o mesmo campo que
   * Transferência de Estoque e Vendas movimentam. Até essa feature, os 2
   * produtos de ovo de espécie única tinham esse número TROCADO na tela por
   * um cálculo derivado do antigo módulo Estoque de Ovos (`estoqueReal`,
   * removido aqui) — editar "Estoque" nesses 2 produtos não tinha efeito
   * nenhum na coluna, porque ela ignorava `p.stock` e recalculava sozinha
   * (bug relatado em produção: "editei o estoque e não mudou nada"). Ver
   * `products.spec.ts` pra reprodução. O módulo Estoque de Ovos foi removido
   * (duplicava/divergia deste campo sem sincronizar) — Produtos é a única
   * fonte editável/transferível.
   *
   * Estoque total do produto = Plantel (p.stock) + soma do que está com cada vendedor.
   */
  protected estoqueTotal(p: Product): number {
    return totalStockAllLocations(
      p.stock,
      this.vendorStockStore.items(),
      p.name,
      this.barnStockStore.items(),
    );
  }

  /** "Estoque no Plantel" = `product.stock` (galpão foi consolidado em Plantel). */
  protected estoqueNoPlantel(p: Product): number {
    return p.stock;
  }

  protected readonly totalProdutos = computed(() => this.store.items().length);
  // Fonte única do valor de estoque (soma de todos os locais, todos os
  // produtos) — a mesma função usada linha a linha em Transferência de
  // Estoque, pra nunca divergir entre as duas telas.
  protected readonly valorEstoque = computed(() =>
    totalStockValue(this.store.items(), this.vendorStockStore.items(), this.barnStockStore.items()),
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
    this.draft = { name: '', unit: 'un', unitPrice: 0, stock: 0, eggsPerUnit: 0 };
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
    // `unit`/`eggsPerUnit` não são mais editados na tela — preservados do
    // registro (ou default no produto novo), pra não quebrar a API. `stock` é o
    // saldo único do Plantel (galpão deixou de ser local de estoque).
    const record: Product = {
      name: String(d['name']),
      unit: String(d['unit'] ?? 'un') || 'un',
      unitPrice: Number(d['unitPrice']),
      stock: Number(d['stock'] ?? 0),
      eggsPerUnit: Number(d['eggsPerUnit'] ?? 0),
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
