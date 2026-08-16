import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product } from '@core/interfaces/product.interface';
import { Vendedor } from '@core/interfaces/vendedor.interface';
import { VendorStock } from '@core/interfaces/vendor-stock.interface';
import { StockTransfer } from '@core/interfaces/stock-transfer.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { num, ptDate } from '@core/utils/format';
import { todayLocalISO } from '@core/utils/date-diff';
import {
  PLANTEL_LOCATION,
  buildLocationOptions,
  isPlantelLocation,
  locationLabel,
  vendedorIdFromLocation,
} from '@core/utils/stock-location';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

interface StockOverviewRow {
  product: string;
  location: string;
  locationLabel: string;
  quantity: number;
}

type TransferSortField = keyof StockTransfer;

@Component({
  selector: 'app-stock-transfers',
  imports: [FormsModule, CrudFormModal, SortIcon],
  templateUrl: './stock-transfers.html',
  styleUrl: './stock-transfers.scss',
})
export class StockTransfers {
  protected readonly num = num;
  protected readonly ptDate = ptDate;

  private readonly productsStore = createEntityStore<Product>(IDB_STORES.products, []);
  private readonly vendedoresStore = createEntityStore<Vendedor>(IDB_STORES.vendedores, []);
  private readonly vendorStockStore = createEntityStore<VendorStock>(IDB_STORES.vendorStock, []);
  private readonly transferStore = createEntityStore<StockTransfer>(IDB_STORES.stockTransfers, []);

  /** Visão de "quanto de cada produto está em cada local", Plantel + cada vendedor com saldo. */
  protected readonly overviewRows = computed<StockOverviewRow[]>(() => {
    const products = this.productsStore.items();
    const vendedores = this.vendedoresStore.items();
    const vendorStock = this.vendorStockStore.items();
    const rows: StockOverviewRow[] = [];

    for (const p of products) {
      rows.push({
        product: p.name,
        location: PLANTEL_LOCATION,
        locationLabel: 'Plantel',
        quantity: p.stock,
      });
      for (const vs of vendorStock.filter((v) => v.product === p.name)) {
        if (vs.quantity === 0) continue;
        rows.push({
          product: p.name,
          location: `vendedor:${vs.vendedorId}`,
          locationLabel: locationLabel(`vendedor:${vs.vendedorId}`, vendedores),
          quantity: vs.quantity,
        });
      }
    }
    return rows;
  });

  protected readonly fields = computed<CrudField[]>(() => {
    const products = this.productsStore.items();
    const vendedores = this.vendedoresStore.items();
    const productOptions = products.map((p) => ({ value: p.name, label: p.name }));
    const locationOptions = buildLocationOptions(vendedores);
    return [
      { key: 'date', label: 'Data', type: 'date', required: true },
      { key: 'product', label: 'Produto', type: 'autocomplete', options: productOptions, required: true },
      { key: 'quantity', label: 'Quantidade', type: 'number', step: 1, required: true },
      { key: 'fromLocation', label: 'De', type: 'select', required: true, optionsFor: () => locationOptions },
      { key: 'toLocation', label: 'Para', type: 'select', required: true, optionsFor: () => locationOptions },
      { key: 'note', label: 'Observação', type: 'text' },
    ];
  });

  protected readonly formOpen = signal(false);
  protected draft: Record<string, unknown> = {};

  private readonly sortState = createSortState<TransferSortField>('date', -1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly historyRows = computed<WithId<StockTransfer>[]>(() =>
    sortRows(this.transferStore.items(), this.sortField(), this.sortDir()),
  );

  protected locationLabelFor(location: string): string {
    return locationLabel(location, this.vendedoresStore.items());
  }

  protected openNew(): void {
    this.draft = {
      date: todayLocalISO(),
      product: '',
      quantity: 1,
      fromLocation: PLANTEL_LOCATION,
      toLocation: PLANTEL_LOCATION,
      note: '',
    };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  /**
   * Ajusta o saldo de estoque de um produto num local (Plantel ou vendedor).
   * Não bloqueia estoque negativo — mesmo comportamento lenient do resto do
   * app (ex.: Controle de Ração, Vendas).
   */
  private async adjustStock(location: string, product: string, delta: number): Promise<void> {
    if (!product || !delta) return;
    if (isPlantelLocation(location)) {
      const p = this.productsStore.items().find((x) => x.name === product);
      if (!p) return;
      await this.productsStore.update(p.id, { ...p, stock: p.stock + delta });
      return;
    }
    const vendedorId = vendedorIdFromLocation(location);
    if (!vendedorId) return;
    const existing = this.vendorStockStore
      .items()
      .find((vs) => vs.product === product && vs.vendedorId === vendedorId);
    if (existing) {
      await this.vendorStockStore.update(existing.id, {
        ...existing,
        quantity: existing.quantity + delta,
      });
    } else {
      await this.vendorStockStore.add({ product, vendedorId, quantity: delta });
    }
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const product = String(d['product'] ?? '').trim();
    const quantity = Number(d['quantity']);
    const fromLocation = String(d['fromLocation'] || PLANTEL_LOCATION);
    const toLocation = String(d['toLocation'] || PLANTEL_LOCATION);
    if (!product || !quantity || fromLocation === toLocation) {
      this.formOpen.set(false);
      return;
    }

    await this.adjustStock(fromLocation, product, -quantity);
    await this.adjustStock(toLocation, product, quantity);

    await this.transferStore.add({
      date: String(d['date']),
      product,
      quantity,
      fromLocation,
      toLocation,
      note: d['note'] ? String(d['note']) : null,
    });

    this.formOpen.set(false);
  }
}
