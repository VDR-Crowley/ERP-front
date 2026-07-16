import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Venda } from '@core/interfaces/venda.interface';
import { Product } from '@core/interfaces/product.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { brl, num, ptDate } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof Venda;

function buildFields(productOptions: { value: string; label: string }[], products: WithId<Product>[]): CrudField[] {
  return [
  { key: 'date', label: 'Data', type: 'date', required: true },
  {
    key: 'product',
    label: 'Produto',
    type: 'autocomplete',
    options: productOptions,
    required: true,
    onSelect: (option, model) => {
      const product = products.find((p) => p.name === option.value);
      if (product) {
        model['unitPrice'] = product.unitPrice;
      }
    },
  },
  { key: 'quantity', label: 'Quantidade', type: 'number', step: 1, required: true },
  { key: 'unitPrice', label: 'Preço unitário', type: 'number', step: 0.01, required: true },
  { key: 'buyer', label: 'Comprador', type: 'text', required: true },
  { key: 'seller', label: 'Vendedor', type: 'text', required: true },
  {
    key: 'paymentPending',
    label: 'Status Pagamento',
    type: 'select',
    options: [
      { value: 'F', label: 'F (pendente)' },
      { value: 'PAGO', label: 'PAGO' },
    ],
    required: true,
  },
  {
    key: 'deliveryPending',
    label: 'Status da Entrega',
    type: 'select',
    options: [
      { value: 'FALTA', label: 'FALTA' },
      { value: 'ENTREGUE', label: 'ENTREGUE' },
    ],
    required: true,
  },
  { key: 'deliveryDate', label: 'Data de entrega', type: 'date' },
  ];
}

@Component({
  selector: 'app-sales',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './sales.html',
  styleUrl: './sales.scss',
})
export class Sales {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly ptDate = ptDate;

  private readonly store = createEntityStore<Venda>(IDB_STORES.sales, []);
  private readonly productsStore = createEntityStore<Product>(IDB_STORES.products, []);
  private readonly periodFilter = inject(PeriodFilterService);

  protected readonly fields = computed<CrudField[]>(() => {
    const products = this.productsStore.items();
    const productOptions = products.map((p) => ({ value: p.name, label: p.name }));
    return buildFields(productOptions, products);
  });

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['date', 'product', 'buyer', 'seller'];
  private readonly sortState = createSortState<SortField>('date', -1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Nova venda');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<Venda> | null>(null);

  /** Vendas do store restritas ao período selecionado no DatePicker/chips da topbar. */
  protected readonly vendasNoPeriodo = computed(() =>
    this.store.items().filter((v) => this.periodFilter.includes(v.date)),
  );

  protected readonly faturamento = computed(() =>
    this.vendasNoPeriodo().reduce((soma, v) => soma + v.total, 0),
  );
  protected readonly totalVendas = computed(() => this.vendasNoPeriodo().length);
  protected readonly pendentes = computed(
    () => this.store.items().filter((v) => v.paymentPending).length,
  );
  protected readonly entregasPendentes = computed(
    () => this.store.items().filter((v) => v.deliveryPending).length,
  );
  protected readonly ticketMedio = computed(() => {
    const items = this.vendasNoPeriodo();
    return items.length ? this.faturamento() / items.length : 0;
  });

  protected readonly rows = computed<WithId<Venda>[]>(() =>
    sortRows(this.vendasNoPeriodo(), this.sortField(), this.sortDir()),
  );

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Nova venda');
    this.draft = {
      date: new Date().toISOString().slice(0, 10),
      product: '',
      quantity: 1,
      unitPrice: 0,
      buyer: '',
      seller: '',
      paymentPending: 'F',
      deliveryPending: 'FALTA',
      deliveryDate: '',
    };
    this.formOpen.set(true);
  }

  protected openEdit(v: WithId<Venda>): void {
    this.editingId = v.id;
    this.formTitle.set('Editar venda');
    this.draft = {
      ...v,
      paymentPending: v.paymentPending ? 'F' : 'PAGO',
      deliveryPending: v.deliveryPending ? 'FALTA' : 'ENTREGUE',
      deliveryDate: v.deliveryDate ?? '',
    };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const quantity = Number(d['quantity']);
    const unitPrice = Number(d['unitPrice']);
    const venda: Venda = {
      date: String(d['date']),
      product: String(d['product']),
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      paymentPending: d['paymentPending'] === 'F',
      buyer: String(d['buyer']),
      seller: String(d['seller']),
      deliveryPending: d['deliveryPending'] === 'FALTA',
      deliveryDate: d['deliveryDate'] ? String(d['deliveryDate']) : null,
    };

    if (this.editingId) {
      await this.store.update(this.editingId, venda);
    } else {
      await this.store.add(venda);
    }
    this.formOpen.set(false);
  }

  protected askDelete(v: WithId<Venda>): void {
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
