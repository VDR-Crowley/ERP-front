import { Component, computed, effect, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Venda } from '@core/interfaces/venda.interface';
import { Product } from '@core/interfaces/product.interface';
import { Vendedor } from '@core/interfaces/vendedor.interface';
import { WithId } from '@core/api/entity-store';
import { createSalesStore } from '@core/api/adapters/sales.adapter';
import { createProductsStore } from '@core/api/adapters/products.adapter';
import { createVendedoresStore } from '@core/api/adapters/vendedores.adapter';
import { createVendorStockStore } from '@core/api/adapters/vendor-stock.adapter';
import { createBarnStore } from '@core/api/adapters/barn.adapter';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { SalesQuickCreate } from '@core/services/sales-quick-create.service';
import { brl, num, ptDate } from '@core/utils/format';
import { todayLocalISO } from '@core/utils/date-diff';
import {
  PLANTEL_LOCATION,
  buildLocationOptions,
  locationLabel,
  vendedorLocation,
} from '@core/utils/stock-location';
import { AuthSession } from '@core/services/auth-session.service';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof Venda;

function buildFields(
  productOptions: { value: string; label: string }[],
  products: WithId<Product>[],
  vendedores: WithId<Vendedor>[],
  isVendedor: boolean,
): CrudField[] {
  const campos: CrudField[] = [
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
  {
    key: 'stockLocation',
    label: 'Local do estoque (baixa ao salvar)',
    type: 'select',
    required: true,
    optionsFor: () => buildLocationOptions(vendedores),
  },
  { key: 'buyer', label: 'Comprador', type: 'text', required: true },
  {
    key: 'seller',
    label: 'Vendedor',
    type: 'autocomplete',
    options: vendedores.map((v) => ({ value: v.name, label: v.name })),
    required: true,
  },
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
  // Perfil VENDEDOR: esconde "Vendedor" e "Local do estoque" — são travados
  // nele (o backend força os dois ao salvar). Ele só preenche o resto.
  return isVendedor
    ? campos.filter((f) => f.key !== 'seller' && f.key !== 'stockLocation')
    : campos;
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

  private readonly store = createSalesStore();
  private readonly productsStore = createProductsStore();
  private readonly vendedoresStore = createVendedoresStore();
  private readonly vendorStockStore = createVendorStockStore();
  private readonly barnStore = createBarnStore();
  private readonly periodFilter = inject(PeriodFilterService);
  private readonly session = inject(AuthSession);

  /**
   * Local padrão de uma venda nova: "Plantel" pro admin. Pro VENDEDOR, é o
   * estoque DELE (a venda sempre baixa do estoque do próprio vendedor — o
   * backend força isso de qualquer jeito). Galpão não é mais local de venda.
   */
  private defaultLocation(): string {
    const vendedorId = this.session.user()?.vendedor_id;
    return this.session.isVendedor() && vendedorId != null
      ? vendedorLocation(String(vendedorId))
      : PLANTEL_LOCATION;
  }
  private readonly quickCreate = inject(SalesQuickCreate);

  /** Atalho "Nova Venda" da sidebar — ignora o valor inicial (0), só abre em incrementos. */
  private readonly quickCreateEffect = effect(() => {
    if (this.quickCreate.signal() > 0) {
      this.openNew();
    }
  });

  protected readonly fields = computed<CrudField[]>(() => {
    const products = this.productsStore.items();
    const productOptions = products.map((p) => ({ value: p.name, label: p.name }));
    return buildFields(productOptions, products, this.vendedoresStore.items(), this.session.isVendedor());
  });

  protected readonly isVendedor = this.session.isVendedor;

  /**
   * Estoque pro VENDEDOR decidir se pode vender: o saldo DELE por produto
   * (positivo = tem; negativo = já vendeu e deve entregar) e o que há no Plantel
   * (o dono repõe). Mostra só produtos com algum saldo (dele ou no Plantel).
   */
  protected readonly meuEstoque = computed<{ name: string; minha: number; plantel: number }[]>(() => {
    if (!this.session.isVendedor()) return [];
    const vendor = this.vendorStockStore.items();
    return this.productsStore
      .items()
      .map((p) => ({
        name: p.name,
        minha: vendor.filter((v) => v.product === p.name).reduce((s, v) => s + v.quantity, 0),
        plantel: p.stock,
      }))
      .filter((r) => r.minha !== 0 || r.plantel !== 0);
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
  /** Venda original sendo editada — usada pra desfazer a baixa de estoque antiga antes de aplicar a nova. */
  private editingOriginal: WithId<Venda> | null = null;
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

  protected locationLabelFor(v: Venda): string {
    return locationLabel(
      v.stockLocation ?? PLANTEL_LOCATION,
      this.vendedoresStore.items(),
      this.barnStore.items(),
    );
  }

  protected openNew(): void {
    this.editingId = null;
    this.editingOriginal = null;
    this.formTitle.set('Nova venda');
    this.draft = {
      date: todayLocalISO(),
      product: '',
      quantity: 1,
      unitPrice: 0,
      stockLocation: this.defaultLocation(),
      buyer: '',
      // VENDEDOR: vendedor fixo nele (campo escondido; backend força mesmo).
      seller: this.session.isVendedor() ? (this.session.vendedorName() ?? '') : '',
      paymentPending: 'F',
      deliveryPending: 'FALTA',
      deliveryDate: '',
    };
    this.formOpen.set(true);
  }

  protected openEdit(v: WithId<Venda>): void {
    this.editingId = v.id;
    this.editingOriginal = v;
    this.formTitle.set('Editar venda');
    this.draft = {
      ...v,
      stockLocation: v.stockLocation ?? this.defaultLocation(),
      paymentPending: v.paymentPending ? 'F' : 'PAGO',
      deliveryPending: v.deliveryPending ? 'FALTA' : 'ENTREGUE',
      deliveryDate: v.deliveryDate ?? '',
    };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  /**
   * A baixa/devolução de estoque agora é feita pelo backend a cada
   * create/update/delete de venda (ver `POST/PUT/DELETE /sales` no
   * openapi.yaml — "baixa o estoque do produto no local informado"). O
   * antigo `adjustStock` daqui (que recalculava `productsStore`/
   * `vendorStockStore` no front) foi removido porque duplicaria o ajuste —
   * em vez disso, só recarrega os dois stores depois de mexer numa venda,
   * pra refletir o que o backend já moveu.
   */
  private reloadStock(): void {
    this.productsStore.reload();
    this.vendorStockStore.reload();
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const quantity = Number(d['quantity']);
    const unitPrice = Number(d['unitPrice']);
    const stockLocation = String(d['stockLocation'] || this.defaultLocation());
    const product = String(d['product']);
    const venda: Venda = {
      date: String(d['date']),
      product,
      quantity,
      unitPrice,
      total: quantity * unitPrice,
      paymentPending: d['paymentPending'] === 'F',
      buyer: String(d['buyer']),
      seller: String(d['seller']),
      deliveryPending: d['deliveryPending'] === 'FALTA',
      deliveryDate: d['deliveryDate'] ? String(d['deliveryDate']) : null,
      stockLocation,
    };

    if (this.editingId) {
      await this.store.update(this.editingId, venda);
    } else {
      await this.store.add(venda);
    }
    this.editingOriginal = null;
    this.formOpen.set(false);
    this.reloadStock();
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
    // O backend devolve a quantidade baixada por essa venda pro local de origem (ver DELETE /sales/{sale}).
    await this.store.remove(target.id);
    this.deleteTarget.set(null);
    this.reloadStock();
  }
}
