import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { HatchEvent, NovoLotePlantel, Species } from '@core/interfaces/novo-lote-plantel.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, num, ptDate } from '@core/utils/format';
import { addDays, daysUntil, todayLocalISO } from '@core/utils/date-diff';
import {
  addHatchEvent,
  deriveStatusAfterHatchChange,
  migrateLegacyHatchEvents,
  removeHatchEvent,
  totalHatched,
  updateHatchEvent,
} from '@core/utils/hatch-tracking.util';
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

/** Campos do registro incremental de nascimento (ver `HatchEvent`) — um lote tem vários desses ao longo dos dias de eclosão. */
const HATCH_EVENT_FIELDS: CrudField[] = [
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'count', label: 'Quantidade de aves nascidas', type: 'number', step: 1, required: true },
  { key: 'notes', label: 'Observações', type: 'text' },
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
  protected readonly hatchEventFields = HATCH_EVENT_FIELDS;
  protected readonly speciesLabel = (s: Species) => (s === 'quail' ? 'Codorna' : 'Galinha');
  protected readonly totalHatched = totalHatched;

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

  /** Lotes com `hatchEvents` sempre presente — normaliza registros salvos antes do histórico incremental existir (ver `migrateLegacyHatchEvents`). */
  private readonly lotesNormalizados = computed<WithId<NovoLotePlantel>[]>(() =>
    this.store.items().map((item) => ({ ...item, hatchEvents: migrateLegacyHatchEvents(item) })),
  );

  /** `id`s de lote com o painel de histórico de nascimentos aberto. */
  protected readonly historyOpenIds = signal<ReadonlySet<string>>(new Set());
  protected isHistoryOpen(loteId: string): boolean {
    return this.historyOpenIds().has(loteId);
  }
  protected toggleHistory(loteId: string): void {
    this.historyOpenIds.update((ids) => {
      const next = new Set(ids);
      if (next.has(loteId)) {
        next.delete(loteId);
      } else {
        next.add(loteId);
      }
      return next;
    });
  }

  protected readonly hatchFormOpen = signal(false);
  protected readonly hatchFormTitle = signal('Registrar nascimento');
  protected hatchDraft: Record<string, unknown> = {};
  private hatchLoteTarget: WithId<NovoLotePlantel> | null = null;
  private editingHatchEventId: string | null = null;

  protected readonly deleteHatchEventTarget = signal<{
    lote: WithId<NovoLotePlantel>;
    event: HatchEvent;
  } | null>(null);

  protected readonly hatchNotice = signal<string | null>(null);

  protected readonly rows = computed<WithId<NovoLotePlantel>[]>(() =>
    sortRows(this.lotesNormalizados(), this.sortField(), this.sortDir()),
  );

  protected readonly lotesIncubando = computed(
    () => this.lotesNormalizados().filter((i) => i.status === 'incubando').length,
  );

  protected readonly proximaEclosao = computed(() => {
    const pendentes = this.lotesNormalizados().filter((i) => i.status === 'incubando');
    return pendentes.length ? sortRows(pendentes, 'expectedHatchDate', 1)[0] : null;
  });

  protected readonly diasProximaEclosao = computed(() => {
    const p = this.proximaEclosao();
    return p ? daysUntil(p.expectedHatchDate) : null;
  });

  protected readonly investimentoAtivo = computed(() =>
    this.lotesNormalizados()
      .filter((i) => i.status === 'incubando')
      .reduce((soma, i) => soma + this.investimento(i), 0),
  );

  protected investimento(item: NovoLotePlantel): number {
    return (item.eggCost ?? 0) + (item.feedCost ?? 0);
  }

  /** Monta o registro completo pra persistir, trocando só o histórico de nascimentos e o status — descarta os campos legados (`actualHatchDate`/`hatchedCount`) na primeira escrita. */
  private buildRecord(
    lote: NovoLotePlantel,
    hatchEvents: HatchEvent[],
    status: NovoLotePlantel['status'],
  ): NovoLotePlantel {
    return {
      startDate: lote.startDate,
      species: lote.species,
      eggCount: lote.eggCount,
      expectedHatchDate: lote.expectedHatchDate,
      hatchEvents,
      status,
      eggCost: lote.eggCost,
      feedCost: lote.feedCost,
      notes: lote.notes,
    };
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
      startDate: todayLocalISO(),
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
      hatchEvents: previous ? migrateLegacyHatchEvents(previous) : [],
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

  /** Abre o form pra registrar um novo nascimento (eclosão não é instantânea — cada lote pode ter vários registros ao longo dos dias). */
  protected openAddHatchEvent(item: WithId<NovoLotePlantel>): void {
    this.hatchLoteTarget = item;
    this.editingHatchEventId = null;
    this.hatchFormTitle.set('Registrar nascimento');
    this.hatchDraft = { date: todayLocalISO(), count: 0, notes: '' };
    this.hatchFormOpen.set(true);
  }

  /** Abre o form pra editar um registro de nascimento já existente (histórico editável, mesmo em lote já "eclodido"). */
  protected openEditHatchEvent(item: WithId<NovoLotePlantel>, event: HatchEvent): void {
    this.hatchLoteTarget = item;
    this.editingHatchEventId = event.id;
    this.hatchFormTitle.set('Editar registro de nascimento');
    this.hatchDraft = { date: event.date, count: event.count, notes: event.notes ?? '' };
    this.hatchFormOpen.set(true);
  }

  protected cancelHatchForm(): void {
    this.hatchFormOpen.set(false);
  }

  protected async saveHatchForm(): Promise<void> {
    const target = this.hatchLoteTarget;
    if (!target) return;

    const date = String(this.hatchDraft['date']);
    const count = Number(this.hatchDraft['count']);
    const notes = this.hatchDraft['notes'] ? String(this.hatchDraft['notes']) : undefined;

    const currentEvents = migrateLegacyHatchEvents(target);
    const events = this.editingHatchEventId
      ? updateHatchEvent(currentEvents, this.editingHatchEventId, { date, count, notes })
      : addHatchEvent(currentEvents, { id: crypto.randomUUID(), date, count, notes });
    const status = deriveStatusAfterHatchChange(target.status, target.eggCount, events);
    const acabouDeFechar = target.status === 'incubando' && status === 'eclodido';

    await this.store.update(target.id, this.buildRecord(target, events, status));
    this.hatchFormOpen.set(false);

    const total = totalHatched(events);
    this.hatchNotice.set(
      `${count} ave(s) registrada(s) em ${ptDate(date)} — total do lote: ${total}/${target.eggCount}` +
        (acabouDeFechar
          ? '. Lote marcado como eclodido — lance no Plantel manualmente quando decidir que já fazem parte do plantel adulto.'
          : '.'),
    );
  }

  /** Fecha o lote manualmente mesmo sem todos os ovos terem chocado (ex.: parte deles não vingou). */
  protected async concluirLote(item: WithId<NovoLotePlantel>): Promise<void> {
    await this.store.update(item.id, this.buildRecord(item, migrateLegacyHatchEvents(item), 'eclodido'));
  }

  protected askDeleteHatchEvent(item: WithId<NovoLotePlantel>, event: HatchEvent): void {
    this.deleteHatchEventTarget.set({ lote: item, event });
  }

  protected cancelDeleteHatchEvent(): void {
    this.deleteHatchEventTarget.set(null);
  }

  protected async confirmDeleteHatchEvent(): Promise<void> {
    const target = this.deleteHatchEventTarget();
    if (!target) return;

    const currentEvents = migrateLegacyHatchEvents(target.lote);
    const events = removeHatchEvent(currentEvents, target.event.id);
    const status = deriveStatusAfterHatchChange(target.lote.status, target.lote.eggCount, events);

    await this.store.update(target.lote.id, this.buildRecord(target.lote, events, status));
    this.deleteHatchEventTarget.set(null);
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
