import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { NovoLotePlantel, Species } from '@core/interfaces/novo-lote-plantel.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, num, ptDate } from '@core/utils/format';
import { addDays, daysUntil } from '@core/utils/date-diff';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof NovoLotePlantel;
type UrgencyClass = 'ok' | 'warn' | 'out';

const HATCH_DAYS: Record<Species, number> = { quail: 18, chicken: 21 };

const SPECIES_OPTIONS = [
  { value: 'quail', label: 'Codorna' },
  { value: 'chicken', label: 'Galinha' },
];

const FIELDS: CrudField[] = [
  { key: 'startDate', label: 'Data que entrou na incubadora', type: 'date', required: true },
  { key: 'species', label: 'Espécie', type: 'select', required: true, options: SPECIES_OPTIONS },
  { key: 'eggCount', label: 'Quantidade de ovos', type: 'number', step: 1, required: true },
  { key: 'eggCost', label: 'Custo dos ovos', type: 'number', step: 0.01 },
  { key: 'feedCost', label: 'Custo ração até 45 dias', type: 'number', step: 0.01 },
  {
    key: 'investimentoPreview',
    label: 'Investimento estimado até 45 dias (Ovos + Ração)',
    type: 'number',
    step: 0.01,
    compute: (m) => (Number(m['eggCost']) || 0) + (Number(m['feedCost']) || 0),
  },
  { key: 'notes', label: 'Observações', type: 'text' },
];

const HATCH_FIELDS: CrudField[] = [
  { key: 'actualHatchDate', label: 'Data da eclosão', type: 'date', required: true },
  { key: 'hatchedCount', label: 'Quantidade de aves nascidas', type: 'number', step: 1, required: true },
];

@Component({
  selector: 'app-gestao-plantel',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './gestao-plantel.html',
  styleUrl: './gestao-plantel.scss',
})
export class GestaoPlantel {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;
  protected readonly hatchFields = HATCH_FIELDS;
  protected readonly speciesLabel = (s: Species) => (s === 'quail' ? 'Codorna' : 'Galinha');

  private readonly store = createEntityStore<NovoLotePlantel>(IDB_STORES.flockIncubation, []);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['startDate', 'notes'];
  private readonly sortState = createSortState<SortField>('startDate', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo lote');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<NovoLotePlantel> | null>(null);

  protected readonly hatchOpen = signal(false);
  protected hatchDraft: Record<string, unknown> = {};
  private hatchTarget: WithId<NovoLotePlantel> | null = null;

  protected readonly hatchNotice = signal<string | null>(null);

  protected readonly rows = computed<WithId<NovoLotePlantel>[]>(() =>
    sortRows(this.store.items(), this.sortField(), this.sortDir()),
  );

  protected readonly lotesIncubando = computed(
    () => this.store.items().filter((i) => i.status === 'incubando').length,
  );

  protected readonly proximaEclosao = computed(() => {
    const pendentes = this.store.items().filter((i) => i.status === 'incubando');
    return pendentes.length ? sortRows(pendentes, 'expectedHatchDate', 1)[0] : null;
  });

  protected readonly diasProximaEclosao = computed(() => {
    const p = this.proximaEclosao();
    return p ? daysUntil(p.expectedHatchDate) : null;
  });

  protected readonly investimentoAtivo = computed(() =>
    this.store
      .items()
      .filter((i) => i.status === 'incubando')
      .reduce((soma, i) => soma + this.investimento(i), 0),
  );

  protected investimento(item: NovoLotePlantel): number {
    return (item.eggCost ?? 0) + (item.feedCost ?? 0);
  }

  protected urgencyClass(item: NovoLotePlantel): UrgencyClass {
    const dias = daysUntil(item.expectedHatchDate);
    if (dias < 0) return 'out';
    if (dias <= 3) return 'warn';
    return 'ok';
  }

  protected urgencyLabel(item: NovoLotePlantel): string {
    const dias = daysUntil(item.expectedHatchDate);
    if (dias < 0) return `Atrasado ${Math.abs(dias)}d`;
    if (dias === 0) return 'Hoje';
    return `${dias}d`;
  }

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Novo lote');
    this.draft = {
      startDate: new Date().toISOString().slice(0, 10),
      species: 'quail',
      eggCount: 0,
      eggCost: 0,
      feedCost: 0,
      notes: '',
    };
    this.formOpen.set(true);
  }

  protected openEdit(item: WithId<NovoLotePlantel>): void {
    this.editingId = item.id;
    this.formTitle.set('Editar lote');
    this.draft = { ...item };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const previous = this.editingId
      ? this.store.items().find((i) => i.id === this.editingId)
      : undefined;

    const startDate = String(d['startDate']);
    const species = d['species'] as Species;
    const record: NovoLotePlantel = {
      startDate,
      species,
      eggCount: Number(d['eggCount']),
      expectedHatchDate: addDays(startDate, HATCH_DAYS[species]),
      actualHatchDate: previous?.actualHatchDate ?? null,
      hatchedCount: previous?.hatchedCount ?? null,
      status: previous?.status ?? 'incubando',
      eggCost: d['eggCost'] === '' || d['eggCost'] === null ? null : Number(d['eggCost']),
      feedCost: d['feedCost'] === '' || d['feedCost'] === null ? null : Number(d['feedCost']),
      notes: d['notes'] ? String(d['notes']) : undefined,
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askHatch(item: WithId<NovoLotePlantel>): void {
    this.hatchTarget = item;
    this.hatchDraft = {
      actualHatchDate: new Date().toISOString().slice(0, 10),
      hatchedCount: 0,
    };
    this.hatchOpen.set(true);
  }

  protected cancelHatch(): void {
    this.hatchOpen.set(false);
  }

  protected async saveHatch(): Promise<void> {
    const target = this.hatchTarget;
    if (!target) return;

    const actualHatchDate = String(this.hatchDraft['actualHatchDate']);
    const hatchedCount = Number(this.hatchDraft['hatchedCount']);

    const record: NovoLotePlantel = {
      startDate: target.startDate,
      species: target.species,
      eggCount: target.eggCount,
      expectedHatchDate: target.expectedHatchDate,
      actualHatchDate,
      hatchedCount,
      status: 'eclodido',
      eggCost: target.eggCost,
      feedCost: target.feedCost,
      notes: target.notes,
    };

    await this.store.update(target.id, record);
    this.hatchOpen.set(false);
    this.hatchNotice.set(
      `${hatchedCount} ave(s) nascida(s) em ${ptDate(actualHatchDate)} — lance no Plantel manualmente quando decidir que já faz parte do plantel adulto.`,
    );
  }

  protected closeHatchNotice(): void {
    this.hatchNotice.set(null);
  }

  protected askDelete(item: WithId<NovoLotePlantel>): void {
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
