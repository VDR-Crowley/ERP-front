import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FeedStock, FeedOpenLog } from '@core/interfaces/feed-stock.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { num, ptDate } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof FeedStock;

/** Saco fechado restante ou menos já conta como estoque baixo pro tipo (confirmado pelo usuário). */
const ESTOQUE_BAIXO_LIMITE = 1;

const PESO_SACO_OPTIONS = [
  { value: '20', label: '20 kg' },
  { value: '40', label: '40 kg' },
];

const FIELDS: CrudField[] = [
  { key: 'type', label: 'Tipo', type: 'text', required: true },
  { key: 'bagsInStock', label: 'Sacos iniciais', type: 'number', step: 1, required: true },
  {
    key: 'lastBagWeightKg',
    label: 'Peso do saco',
    type: 'select',
    required: true,
    options: PESO_SACO_OPTIONS,
  },
  { key: 'expirationDate', label: 'Validade', type: 'date' },
];

const REPLENISH_FIELDS: CrudField[] = [
  { key: 'bags', label: 'Sacos repostos', type: 'number', step: 1, required: true },
  {
    key: 'bagWeightKg',
    label: 'Peso do saco',
    type: 'select',
    required: true,
    options: PESO_SACO_OPTIONS,
  },
  { key: 'expirationDate', label: 'Validade do lote reposto', type: 'date', required: true },
];

const OPEN_BAG_FIELDS: CrudField[] = [
  { key: 'weightKg', label: 'Peso do saco aberto (kg)', type: 'number', step: 0.1, required: true },
];

@Component({
  selector: 'app-controle-racao',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './controle-racao.html',
  styleUrl: './controle-racao.scss',
})
export class ControleRacao {
  protected readonly num = num;
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;
  protected readonly replenishFields = REPLENISH_FIELDS;
  protected readonly openBagFields = OPEN_BAG_FIELDS;

  private readonly store = createEntityStore<FeedStock>(IDB_STORES.feedStock, []);
  private readonly logStore = createEntityStore<FeedOpenLog>(IDB_STORES.feedOpenLog, []);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['type'];
  private readonly sortState = createSortState<SortField>('type', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected draft: Record<string, unknown> = {};
  protected readonly deleteTarget = signal<WithId<FeedStock> | null>(null);

  protected readonly replenishOpen = signal(false);
  protected replenishDraft: Record<string, unknown> = {};
  private replenishTarget: WithId<FeedStock> | null = null;

  protected readonly openBagOpen = signal(false);
  protected openBagDraft: Record<string, unknown> = {};
  private openBagTarget: WithId<FeedStock> | null = null;

  protected readonly rows = computed<WithId<FeedStock>[]>(() =>
    sortRows(this.store.items(), this.sortField(), this.sortDir()),
  );

  protected readonly totalSacos = computed(() =>
    this.store.items().reduce((soma, i) => soma + i.bagsInStock, 0),
  );
  protected readonly totalKg = computed(() =>
    this.store.items().reduce((soma, i) => soma + i.kgInStock, 0),
  );
  protected readonly tiposEstoqueBaixo = computed(
    () => this.store.items().filter((i) => i.bagsInStock <= ESTOQUE_BAIXO_LIMITE).length,
  );

  /** Sacos abertos no mês corrente, contados a partir do log — não do saldo atual. */
  protected readonly sacosAbertosMes = computed(() => {
    const now = new Date();
    const ym = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return this.logStore.items().filter((l) => l.date.startsWith(ym)).length;
  });

  protected isEstoqueBaixo(item: FeedStock): boolean {
    return item.bagsInStock <= ESTOQUE_BAIXO_LIMITE;
  }

  protected openNew(): void {
    this.draft = {
      type: '',
      bagsInStock: 0,
      lastBagWeightKg: '40',
      expirationDate: null,
    };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const bagsInStock = Number(d['bagsInStock']);
    const lastBagWeightKg = Number(d['lastBagWeightKg']);
    const record: FeedStock = {
      type: String(d['type']).trim(),
      bagsInStock,
      kgInStock: bagsInStock * lastBagWeightKg,
      lastBagWeightKg,
      expirationDate: d['expirationDate'] ? String(d['expirationDate']) : null,
    };
    await this.store.add(record);
    this.formOpen.set(false);
  }

  protected askReplenish(item: WithId<FeedStock>): void {
    this.replenishTarget = item;
    this.replenishDraft = {
      bags: 0,
      bagWeightKg: String(item.lastBagWeightKg || 40),
      expirationDate: item.expirationDate,
    };
    this.replenishOpen.set(true);
  }

  protected cancelReplenish(): void {
    this.replenishOpen.set(false);
  }

  protected async saveReplenish(): Promise<void> {
    const target = this.replenishTarget;
    if (!target) return;

    const bags = Number(this.replenishDraft['bags']);
    const bagWeightKg = Number(this.replenishDraft['bagWeightKg']);
    const expirationDate = this.replenishDraft['expirationDate']
      ? String(this.replenishDraft['expirationDate'])
      : null;

    const record: FeedStock = {
      type: target.type,
      bagsInStock: target.bagsInStock + bags,
      kgInStock: target.kgInStock + bags * bagWeightKg,
      lastBagWeightKg: bagWeightKg,
      expirationDate,
    };
    await this.store.update(target.id, record);
    this.replenishOpen.set(false);
  }

  protected askOpenBag(item: WithId<FeedStock>): void {
    this.openBagTarget = item;
    this.openBagDraft = { weightKg: item.lastBagWeightKg };
    this.openBagOpen.set(true);
  }

  protected cancelOpenBag(): void {
    this.openBagOpen.set(false);
  }

  protected async saveOpenBag(): Promise<void> {
    const target = this.openBagTarget;
    if (!target) return;

    const weightKg = Number(this.openBagDraft['weightKg']);

    const record: FeedStock = {
      type: target.type,
      bagsInStock: target.bagsInStock - 1,
      kgInStock: target.kgInStock - weightKg,
      lastBagWeightKg: target.lastBagWeightKg,
      expirationDate: target.expirationDate,
    };
    await this.store.update(target.id, record);
    await this.logStore.add({
      feedType: target.type,
      date: new Date().toISOString().slice(0, 10),
      weightKg,
    });
    this.openBagOpen.set(false);
  }

  protected askDelete(item: WithId<FeedStock>): void {
    this.deleteTarget.set(item);
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
