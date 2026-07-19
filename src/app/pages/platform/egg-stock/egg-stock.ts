import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EstoqueOvos as EstoqueOvosModel } from '@core/interfaces/estoque-ovos.interface';
import { Product } from '@core/interfaces/product.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { brl, num, ptDate } from '@core/utils/format';
import { latestByDate } from '@core/utils/latest-by-date';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof EstoqueOvosModel;

function toNumberOrUndefined(value: unknown): number | undefined {
  if (value === '' || value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

@Component({
  selector: 'app-egg-stock',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './egg-stock.html',
  styleUrl: './egg-stock.scss',
})
export class EggStock {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly ptDate = ptDate;

  private readonly store = createEntityStore<EstoqueOvosModel>(IDB_STORES.eggStock, []);
  private readonly productsStore = createEntityStore<Product>(IDB_STORES.products, []);
  private readonly periodFilter = inject(PeriodFilterService);

  // Mesma fonte de conversão/preço usada em Produtos.estoqueReal() — se o
  // usuário mudar preço ou "ovos por unidade" no cadastro, o cálculo aqui
  // acompanha em vez de duplicar valores soltos.
  private readonly quailPackSize = computed(
    () => this.productsStore.items().find((p) => p.name === '50 ovos de codorna')?.eggsPerUnit ?? 50,
  );
  private readonly quailPackPrice = computed(
    () => this.productsStore.items().find((p) => p.name === '50 ovos de codorna')?.unitPrice ?? 15,
  );
  private readonly chickenPackSize = computed(
    () =>
      this.productsStore.items().find((p) => p.name === '1 Bandeja de ovos de galinha')?.eggsPerUnit ?? 30,
  );
  private readonly chickenPackPrice = computed(
    () =>
      this.productsStore.items().find((p) => p.name === '1 Bandeja de ovos de galinha')?.unitPrice ?? 20,
  );

  protected readonly fields: CrudField[] = [
    { key: 'date', label: 'Data', type: 'date', required: true },
    { key: 'quailEggs', label: 'Ovos codorna', type: 'number', step: 1 },
    { key: 'chickenEggs', label: 'Ovos galinha', type: 'number', step: 1 },
    {
      key: 'quailPacks',
      label: 'Pack codorna',
      type: 'number',
      step: 0.01,
      required: true,
      compute: (m) => {
        const eggs = toNumberOrUndefined(m['quailEggs']);
        if (eggs === undefined) return undefined;
        return Math.round((eggs / this.quailPackSize()) * 100) / 100;
      },
    },
    {
      key: 'chickenPacks',
      label: 'Pack galinha',
      type: 'number',
      step: 0.01,
      required: true,
      compute: (m) => {
        const eggs = toNumberOrUndefined(m['chickenEggs']);
        if (eggs === undefined) return undefined;
        return Math.round((eggs / this.chickenPackSize()) * 100) / 100;
      },
    },
    {
      key: 'quailStockValue',
      label: 'Valor estoque codorna',
      type: 'number',
      step: 0.01,
      required: true,
      compute: (m) => {
        const packs = toNumberOrUndefined(m['quailPacks']);
        if (packs === undefined) return undefined;
        return Math.round(packs * this.quailPackPrice() * 100) / 100;
      },
    },
    {
      key: 'chickenStockValue',
      label: 'Valor estoque galinha',
      type: 'number',
      step: 0.01,
      required: true,
      compute: (m) => {
        const packs = toNumberOrUndefined(m['chickenPacks']);
        if (packs === undefined) return undefined;
        return Math.round(packs * this.chickenPackPrice() * 100) / 100;
      },
    },
  ];

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['date'];
  private readonly sortState = createSortState<SortField>('date', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo registro');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<EstoqueOvosModel> | null>(null);

  // Cada linha é um snapshot do saldo naquele dia, não um delta — os cards do
  // topo devem refletir só a linha mais recente (carry-forward), nunca a soma
  // de todas as linhas (isso somaria saldos de dias diferentes). Usa sempre a
  // data mais recente do array, mesmo que seja futura em relação ao relógio
  // do sistema — restringir a "<= hoje" fazia um registro com data futura por
  // erro de digitação (ex: ano errado) esconder o snapshot real e zerar tudo.
  // Codorna e galinha são calculadas SEPARADAMENTE: cada uma pega sua própria
  // data mais recente com o próprio campo preenchido, ignorando linhas onde
  // só o campo dela está em branco. Antes as duas compartilhavam uma única
  // "linha mais recente geral" — se um lançamento recente preenchesse só
  // codorna, o card de galinha zerava mesmo tendo um valor real em data
  // anterior.
  private readonly ultimoQuail = computed<EstoqueOvosModel | undefined>(() =>
    latestByDate(this.store.items().filter((e) => e.quailEggs !== null)),
  );
  private readonly ultimoChicken = computed<EstoqueOvosModel | undefined>(() =>
    latestByDate(this.store.items().filter((e) => e.chickenEggs !== null)),
  );

  protected readonly totalCodorna = computed(() => this.ultimoQuail()?.quailEggs ?? 0);
  protected readonly totalGalinha = computed(() => this.ultimoChicken()?.chickenEggs ?? 0);
  protected readonly totalPacksCodorna = computed(() => this.ultimoQuail()?.quailPacks ?? 0);
  protected readonly totalPacksGalinha = computed(() => this.ultimoChicken()?.chickenPacks ?? 0);

  // quailStockValue/chickenStockValue gravados na linha são um snapshot
  // histórico (preço do dia do lançamento) — os cards de resumo recalculam
  // ao vivo com o preço ATUAL do produto, senão editar o preço em Produtos
  // não reflete aqui até um novo registro de estoque ser criado.
  protected readonly valorPacksCodorna = computed(
    () => Math.round(this.totalPacksCodorna() * this.quailPackPrice() * 100) / 100,
  );
  protected readonly valorPacksGalinha = computed(
    () => Math.round(this.totalPacksGalinha() * this.chickenPackPrice() * 100) / 100,
  );
  protected readonly valorTotal = computed(() => this.valorPacksCodorna() + this.valorPacksGalinha());

  /** Movimentação restrita ao período selecionado no DatePicker/chips da topbar — os cards acima não usam este filtro (carry-forward). */
  protected readonly rows = computed<WithId<EstoqueOvosModel>[]>(() =>
    sortRows(
      this.store.items().filter((e) => this.periodFilter.includes(e.date)),
      this.sortField(),
      this.sortDir(),
    ),
  );

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Novo registro');
    this.draft = {
      date: new Date().toISOString().slice(0, 10),
      quailEggs: 0,
      chickenEggs: 0,
      quailPacks: 0,
      chickenPacks: 0,
      quailStockValue: 0,
      chickenStockValue: 0,
    };
    this.formOpen.set(true);
  }

  protected openEdit(e: WithId<EstoqueOvosModel>): void {
    this.editingId = e.id;
    this.formTitle.set('Editar registro');
    this.draft = { ...e };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: EstoqueOvosModel = {
      date: String(d['date']),
      quailEggs: d['quailEggs'] === '' || d['quailEggs'] === null ? null : Number(d['quailEggs']),
      chickenEggs: d['chickenEggs'] === '' || d['chickenEggs'] === null ? null : Number(d['chickenEggs']),
      quailPacks: Number(d['quailPacks']),
      chickenPacks: Number(d['chickenPacks']),
      quailStockValue: Number(d['quailStockValue']),
      chickenStockValue: Number(d['chickenStockValue']),
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(e: WithId<EstoqueOvosModel>): void {
    this.deleteTarget.set(e);
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
