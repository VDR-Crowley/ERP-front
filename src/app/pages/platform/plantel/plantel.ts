import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Plantel as PlantelModel } from '@core/interfaces/plantel.interface';
import { FeedStock } from '@core/interfaces/feed-stock.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, num } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof PlantelModel;

const DIACRITICS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
/** Mesmo padrão de normalização de texto usado no resto do app (ver filter-by.pipe.ts). */
function normalizeSpecies(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(DIACRITICS, '');
}

/** Peso de saco padrão quando a sincronização com Controle de Ração precisa
 * criar um FeedStock novo (pedido original não especifica um peso — ver
 * comentário em `syncFeedStock` abaixo). Cliente confirmou 40kg como compra
 * padrão atual; não afeta FeedStocks já existentes com 20kg. */
const DEFAULT_BAG_WEIGHT_KG = 40;

const FIELDS: CrudField[] = [
  { key: 'species', label: 'Espécie', type: 'text', required: true },
  { key: 'quantity', label: 'Quantidade', type: 'number', step: 1, required: true },
  { key: 'feedBagsPerMonth', label: 'Sacos de ração/mês', type: 'number', step: 1, required: true },
  { key: 'bagPrice', label: 'Preço do saco', type: 'number', step: 0.01, required: true },
];

@Component({
  selector: 'app-plantel',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './plantel.html',
  styleUrl: './plantel.scss',
})
export class Plantel {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<PlantelModel>(IDB_STORES.flock, []);
  private readonly feedStockStore = createEntityStore<FeedStock>(IDB_STORES.feedStock, []);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['species'];
  private readonly sortState = createSortState<SortField>('species', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Nova espécie');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<PlantelModel> | null>(null);

  protected readonly especies = computed(() => this.store.items().length);
  protected readonly totalAves = computed(() =>
    this.store.items().reduce((soma, p) => soma + p.quantity, 0),
  );
  protected readonly totalSacos = computed(() =>
    this.store.items().reduce((soma, p) => soma + p.feedBagsPerMonth, 0),
  );
  protected readonly investimento = computed(() =>
    this.store.items().reduce((soma, p) => soma + p.monthlyTotal, 0),
  );

  protected readonly rows = computed<WithId<PlantelModel>[]>(() =>
    sortRows(this.store.items(), this.sortField(), this.sortDir()),
  );

  /** Custo/mês dividido pela Quantidade — deixa explícito que é esse valor
   * (não a Quantidade em si) que se relaciona com o Custo/mês. */
  protected custoPorAve(item: PlantelModel): number {
    return item.quantity ? item.monthlyTotal / item.quantity : 0;
  }

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Nova espécie');
    this.draft = { species: '', quantity: 0, feedBagsPerMonth: 0, bagPrice: 0 };
    this.formOpen.set(true);
  }

  protected openEdit(p: WithId<PlantelModel>): void {
    this.editingId = p.id;
    this.formTitle.set('Editar espécie');
    this.draft = { ...p };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const feedBagsPerMonth = Number(d['feedBagsPerMonth']);
    const bagPrice = Number(d['bagPrice']);
    const record: PlantelModel = {
      species: String(d['species']),
      quantity: Number(d['quantity']),
      feedBagsPerMonth,
      bagPrice,
      monthlyTotal: feedBagsPerMonth * bagPrice,
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);

    await this.syncFeedStock(record);
  }

  /**
   * SINCRONIZAÇÃO COM CONTROLE DE RAÇÃO — efeito colateral do save de Plantel.
   *
   * Pedido original do usuário era ambíguo: "lá no plantel fica igual, o
   * valor cadastrado lá vira o valor do estoque da ração". Interpretação
   * adotada (a mais direta): a cada save de Plantel (criação OU edição),
   * procura por nome normalizado (sem acento, minúsculo — mesmo padrão de
   * `normalize()` em filter-by.pipe.ts) um FeedStock cujo `type` combine com
   * `species`. Se achar, SOBRESCREVE `bagsInStock` desse FeedStock com
   * `feedBagsPerMonth` do Plantel (e recalcula `kgInStock` mantendo o
   * `lastBagWeightKg` já cadastrado, senão o kg ficaria dessincronizado do
   * número de sacos). Se não achar nenhum FeedStock com esse nome, cria um
   * novo, com peso de saco padrão de 40kg (não especificado no pedido
   * original) e sem validade.
   *
   * Implicação a confirmar com o usuário: editar Plantel PISA por cima de
   * qualquer reposição/abertura de saco feita manualmente em Controle de
   * Ração pro mesmo tipo — não soma ao saldo existente, substitui.
   */
  private async syncFeedStock(plantel: PlantelModel): Promise<void> {
    const target = normalizeSpecies(plantel.species);
    if (!target) return;

    const existing = this.feedStockStore
      .items()
      .find((f) => normalizeSpecies(f.type) === target);

    if (existing) {
      const updated: FeedStock = {
        type: existing.type,
        bagsInStock: plantel.feedBagsPerMonth,
        kgInStock: plantel.feedBagsPerMonth * existing.lastBagWeightKg,
        lastBagWeightKg: existing.lastBagWeightKg,
        expirationDate: existing.expirationDate,
      };
      await this.feedStockStore.update(existing.id, updated);
    } else {
      await this.feedStockStore.add({
        type: plantel.species,
        bagsInStock: plantel.feedBagsPerMonth,
        kgInStock: plantel.feedBagsPerMonth * DEFAULT_BAG_WEIGHT_KG,
        lastBagWeightKg: DEFAULT_BAG_WEIGHT_KG,
        expirationDate: null,
      });
    }
  }

  protected askDelete(p: WithId<PlantelModel>): void {
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
