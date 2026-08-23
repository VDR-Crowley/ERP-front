import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Product } from '@core/interfaces/product.interface';
import { Vendedor } from '@core/interfaces/vendedor.interface';
import { VendorStock } from '@core/interfaces/vendor-stock.interface';
import { StockTransfer } from '@core/interfaces/stock-transfer.interface';
import { WithId } from '@core/api/entity-store';
import { createProductsStore } from '@core/api/adapters/products.adapter';
import { createVendedoresStore } from '@core/api/adapters/vendedores.adapter';
import { createVendorStockStore } from '@core/api/adapters/vendor-stock.adapter';
import { createStockTransfersStore } from '@core/api/adapters/stock-transfers.adapter';
import { brl, num, ptDate } from '@core/utils/format';
import { todayLocalISO } from '@core/utils/date-diff';
import {
  PLANTEL_LOCATION,
  buildLocationOptions,
  locationLabel,
  stockValue,
  totalStockValue,
} from '@core/utils/stock-location';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

interface StockOverviewRow {
  product: string;
  location: string;
  locationLabel: string;
  quantity: number;
  value: number;
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
  protected readonly brl = brl;
  protected readonly ptDate = ptDate;

  private readonly productsStore = createProductsStore();
  private readonly vendedoresStore = createVendedoresStore();
  private readonly vendorStockStore = createVendorStockStore();
  private readonly transferStore = createStockTransfersStore();

  /**
   * Visão de "quanto de cada produto está em cada local" (Plantel + cada
   * vendedor com saldo), com o valor em R$ de cada linha. O "Valor" usa
   * `stockValue()` — a mesma função (não uma conta nova) que o card "Valor em
   * estoque" de Produtos soma no total, pra nunca divergir entre as telas.
   */
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
        value: stockValue(p.stock, p.unitPrice),
      });
      for (const vs of vendorStock.filter((v) => v.product === p.name)) {
        if (vs.quantity === 0) continue;
        rows.push({
          product: p.name,
          location: `vendedor:${vs.vendedorId}`,
          locationLabel: locationLabel(`vendedor:${vs.vendedorId}`, vendedores),
          quantity: vs.quantity,
          value: stockValue(vs.quantity, p.unitPrice),
        });
      }
    }
    return rows;
  });

  /** Fonte única com Produtos.valorEstoque — mesma função `totalStockValue()`. */
  protected readonly valorTotalEstoque = computed(() =>
    totalStockValue(this.productsStore.items(), this.vendorStockStore.items()),
  );

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
   * O backend move o estoque de origem->destino sozinho a cada create/
   * update/delete de transferência (ver `POST /stock-transfers` no
   * openapi.yaml). O antigo `adjustStock` daqui foi removido — duplicaria o
   * movimento; só recarrega os stores dependentes depois de salvar.
   */
  private reloadStock(): void {
    this.productsStore.reload();
    this.vendorStockStore.reload();
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

    await this.transferStore.add({
      date: String(d['date']),
      product,
      quantity,
      fromLocation,
      toLocation,
      note: d['note'] ? String(d['note']) : null,
    });

    this.formOpen.set(false);
    this.reloadStock();
  }
}
