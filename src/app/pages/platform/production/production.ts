import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProducaoDiaria } from '@core/interfaces/producao-diaria.interface';
import { WithId } from '@core/api/entity-store';
import { createDailyProductionsStore } from '@core/api/adapters/daily-productions.adapter';
import { createBarnStore } from '@core/api/adapters/barn.adapter';
import { createFlockStore } from '@core/api/adapters/flock.adapter';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { num, ptDate } from '@core/utils/format';
import { todayLocalISO } from '@core/utils/date-diff';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type Row = WithId<ProducaoDiaria> & { total: number };
type SortField = keyof Row;

const DATE_FIELD: CrudField = { key: 'date', label: 'Data', type: 'date', required: true };

/** Normaliza nome de espécie (sem acento, minúsculo) — mesmo padrão do resto do app. */
const DIACRITICS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
function normalizeSpecies(value: string): string {
  return value.trim().toLowerCase().normalize('NFD').replace(DIACRITICS, '');
}
function isQuail(species: string): boolean {
  return normalizeSpecies(species).includes('codorna');
}
function isChicken(species: string): boolean {
  return normalizeSpecies(species).includes('galinha');
}

@Component({
  selector: 'app-production',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './production.html',
  styleUrl: './production.scss',
})
export class Production {
  protected readonly num = num;
  protected readonly ptDate = ptDate;

  private readonly store = createDailyProductionsStore();
  private readonly barnStore = createBarnStore();
  private readonly flockStore = createFlockStore();
  private readonly periodFilter = inject(PeriodFilterService);

  /**
   * Espécies presentes num galpão (a partir dos lotes cadastrados no Plantel).
   * Sem galpão escolhido, ou galpão sem lote cadastrado → ambas liberadas (não
   * bloqueia o lançamento). Só filtra quando o galpão TEM lotes e a espécie
   * não está entre eles.
   */
  private speciesInBarn(barnIdRaw: unknown): { quail: boolean; chicken: boolean } {
    if (barnIdRaw === '' || barnIdRaw == null) return { quail: true, chicken: true };
    const barnId = Number(barnIdRaw);
    const flocks = this.flockStore.items().filter((f) => Number(f.barnId) === barnId);
    if (flocks.length === 0) return { quail: true, chicken: true };
    return {
      quail: flocks.some((f) => isQuail(f.species)),
      chicken: flocks.some((f) => isChicken(f.species)),
    };
  }

  /** Campos do form + seletor de Galpão. Os campos de ovos aparecem só pras
   * espécies que existem no galpão escolhido. */
  protected readonly fields = computed<CrudField[]>(() => [
    DATE_FIELD,
    {
      key: 'barnId',
      label: 'Galpão',
      type: 'select',
      options: [
        { value: '', label: '— Sem galpão —' },
        ...this.barnStore.items().map((b) => ({ value: b.id, label: b.name })),
      ],
    },
    {
      key: 'quailEggs',
      label: 'Ovos codorna',
      type: 'number',
      step: 1,
      hiddenFor: (model) => !this.speciesInBarn(model['barnId']).quail,
    },
    {
      key: 'chickenEggs',
      label: 'Ovos galinha',
      type: 'number',
      step: 1,
      hiddenFor: (model) => !this.speciesInBarn(model['barnId']).chicken,
    },
  ]);

  /** Nome do galpão de um registro (pra coluna da tabela). '—' quando sem galpão. */
  protected barnName(barnId: number | null | undefined): string {
    if (barnId == null) return '—';
    const b = this.barnStore.items().find((x) => Number(x.id) === Number(barnId));
    return b ? b.name : '—';
  }

  protected readonly search = signal('');
  protected readonly searchKeys: (keyof Row)[] = ['date'];
  private readonly sortState = createSortState<SortField>('date', -1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo registro');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<ProducaoDiaria> | null>(null);

  // Restrito ao período selecionado no DatePicker da topbar (mesmo já usado
  // por Relatórios) — sem isso, os cards somavam a produção inteira desde o
  // primeiro registro, diluindo a média com dias antigos fora do período que
  // o usuário está vendo no seletor.
  protected readonly rowsPeriodo = computed(() =>
    this.store.items().filter((p) => this.periodFilter.includes(p.date)),
  );
  // A planilha do usuário vem com o mês inteiro pré-preenchido (linhas de
  // dias futuros ainda sem lançamento, com os dois campos em branco) — se
  // isso for importado, essas linhas "molde" entram no store com data válida
  // mas sem produção nenhuma. Sem esse filtro elas contam como "dia
  // registrado" no Set abaixo e diluem a média com dias que não têm produção
  // de verdade.
  protected readonly rowsComProducao = computed(() =>
    this.rowsPeriodo().filter((p) => p.quailEggs !== null || p.chickenEggs !== null),
  );
  protected readonly totalCodorna = computed(() =>
    this.rowsComProducao().reduce((soma, p) => soma + (p.quailEggs ?? 0), 0),
  );
  protected readonly totalGalinha = computed(() =>
    this.rowsComProducao().reduce((soma, p) => soma + (p.chickenEggs ?? 0), 0),
  );
  protected readonly totalGeral = computed(() => this.totalCodorna() + this.totalGalinha());
  // Média por espécie, não combinada — codorna e galinha têm ritmos de
  // postura bem diferentes, então uma média "no total" (soma das duas
  // dividida pelos dias) não corresponde a nenhuma das duas de verdade.
  // Cada espécie usa seu próprio contador de dias (dias únicos, não linhas)
  // — um dia com só codorna lançada não deve contar no denominador da
  // galinha, e vice-versa.
  protected readonly diasCodorna = computed(
    () => new Set(this.rowsComProducao().filter((p) => p.quailEggs !== null).map((p) => p.date)).size,
  );
  protected readonly diasGalinha = computed(
    () => new Set(this.rowsComProducao().filter((p) => p.chickenEggs !== null).map((p) => p.date)).size,
  );
  protected readonly mediaDiaCodorna = computed(() => {
    const dias = this.diasCodorna();
    return dias ? Math.round(this.totalCodorna() / dias) : 0;
  });
  protected readonly mediaDiaGalinha = computed(() => {
    const dias = this.diasGalinha();
    return dias ? Math.round(this.totalGalinha() / dias) : 0;
  });

  protected readonly rows = computed<Row[]>(() => {
    const list: Row[] = this.rowsPeriodo().map((p) => ({
      ...p,
      total: (p.quailEggs ?? 0) + (p.chickenEggs ?? 0),
    }));
    return sortRows(list, this.sortField(), this.sortDir());
  });

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Novo registro');
    this.draft = { date: todayLocalISO(), quailEggs: 0, chickenEggs: 0, barnId: '' };
    this.formOpen.set(true);
  }

  protected openEdit(p: WithId<ProducaoDiaria>): void {
    this.editingId = p.id;
    this.formTitle.set('Editar registro');
    // barnId vai como string no form (o <select> compara valores de texto).
    this.draft = { ...p, barnId: p.barnId != null ? String(p.barnId) : '' };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const barnIdRaw = d['barnId'];
    // Espécies do galpão: se a espécie não existe nele, grava null (não 0),
    // pra não poluir o galpão com ovos de uma espécie que ele não tem.
    const sp = this.speciesInBarn(barnIdRaw);
    const record: ProducaoDiaria = {
      date: String(d['date']),
      quailEggs: !sp.quail
        ? null
        : d['quailEggs'] === '' || d['quailEggs'] === null
          ? null
          : Number(d['quailEggs']),
      chickenEggs: !sp.chicken
        ? null
        : d['chickenEggs'] === '' || d['chickenEggs'] === null
          ? null
          : Number(d['chickenEggs']),
      barnId: barnIdRaw ? Number(barnIdRaw) : null,
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(p: WithId<ProducaoDiaria>): void {
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
