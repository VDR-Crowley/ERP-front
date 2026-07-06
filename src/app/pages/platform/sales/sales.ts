import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Venda } from '@core/interfaces/venda.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, num, ptDate } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';

type SortField = keyof Venda;

const FIELDS: CrudField[] = [
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'product', label: 'Produto', type: 'text', required: true },
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

@Component({
  selector: 'app-sales',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe],
  templateUrl: './sales.html',
  styleUrl: './sales.scss',
})
export class Sales {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<Venda>(IDB_STORES.sales, []);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['date', 'product', 'buyer', 'seller'];
  protected readonly sortField = signal<SortField | ''>('');
  protected readonly sortDir = signal<1 | -1>(1);

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Nova venda');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<Venda> | null>(null);

  protected readonly faturamento = computed(() =>
    this.store.items().reduce((soma, v) => soma + v.total, 0),
  );
  protected readonly totalVendas = computed(() => this.store.items().length);
  protected readonly pendentes = computed(
    () => this.store.items().filter((v) => v.paymentPending).length,
  );
  protected readonly entregasPendentes = computed(
    () => this.store.items().filter((v) => v.deliveryPending).length,
  );
  protected readonly ticketMedio = computed(() => {
    const items = this.store.items();
    return items.length ? this.faturamento() / items.length : 0;
  });

  protected readonly rows = computed<WithId<Venda>[]>(() => {
    let list: WithId<Venda>[] = this.store.items();

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
