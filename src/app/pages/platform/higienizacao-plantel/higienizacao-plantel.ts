import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { FlockCleaning, CleaningType } from '@core/interfaces/flock-cleaning.interface';
import { Species } from '@core/interfaces/novo-lote-plantel.interface';
import { WithId } from '@core/api/entity-store';
import { createFlockCleaningsStore } from '@core/api/adapters/flock-cleanings.adapter';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { ptDate } from '@core/utils/format';
import { daysUntil, todayLocalISO } from '@core/utils/date-diff';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof FlockCleaning;

const SPECIES_OPTIONS = [
  { value: 'quail', label: 'Codorna' },
  { value: 'chicken', label: 'Galinha' },
];

const CLEANING_TYPE_OPTIONS: Record<Species, { value: string; label: string }[]> = {
  quail: [
    { value: 'total', label: 'Total' },
    { value: 'feeder', label: 'Bebedouro' },
    { value: 'tray', label: 'Bandeja' },
  ],
  chicken: [
    { value: 'total', label: 'Total' },
    { value: 'feeder', label: 'Bebedouro' },
    { value: 'nest', label: 'Ninho' },
  ],
};

const CLEANING_TYPE_LABELS: Record<CleaningType, string> = {
  total: 'Total',
  feeder: 'Bebedouro',
  tray: 'Bandeja',
  nest: 'Ninho',
};

const FIELDS: CrudField[] = [
  { key: 'date', label: 'Data', type: 'date', required: true },
  {
    key: 'species',
    label: 'Lote/Espécie',
    type: 'select',
    required: true,
    options: SPECIES_OPTIONS,
    // Troca de espécie pode deixar o tipo de limpeza selecionado inválido
    // (ex.: "Bandeja" não existe pra Galinha) — reseta pro primeiro tipo
    // válido da nova espécie.
    onChange: (value, model) => {
      const opts = CLEANING_TYPE_OPTIONS[value as Species];
      if (!opts.some((o) => o.value === model['cleaningType'])) {
        model['cleaningType'] = opts[0].value;
      }
    },
  },
  {
    key: 'cleaningType',
    label: 'Tipo de limpeza',
    type: 'select',
    required: true,
    optionsFor: (model) => CLEANING_TYPE_OPTIONS[(model['species'] as Species) ?? 'quail'],
  },
  { key: 'notes', label: 'Observações', type: 'text' },
];

@Component({
  selector: 'app-higienizacao-plantel',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './higienizacao-plantel.html',
  styleUrl: './higienizacao-plantel.scss',
})
export class HigienizacaoPlantel {
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;
  protected readonly speciesLabel = (s: Species) => (s === 'quail' ? 'Codorna' : 'Galinha');
  protected readonly cleaningTypeLabel = (t: CleaningType) => CLEANING_TYPE_LABELS[t];

  private readonly store = createFlockCleaningsStore();
  private readonly periodFilter = inject(PeriodFilterService);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['date', 'notes'];
  private readonly sortState = createSortState<SortField>('date', -1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Nova limpeza');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<FlockCleaning> | null>(null);

  /** Histórico completo, respeitando o período selecionado na topbar (chips Jun/Jul/Ago/Tudo). */
  protected readonly rows = computed<WithId<FlockCleaning>[]>(() =>
    sortRows(
      this.store.items().filter((i) => this.periodFilter.includes(i.date)),
      this.sortField(),
      this.sortDir(),
    ),
  );

  protected readonly ultimaLimpezaCodorna = computed(() => this.lastCleaning('quail'));
  protected readonly ultimaLimpezaGalinha = computed(() => this.lastCleaning('chicken'));

  private lastCleaning(species: Species): WithId<FlockCleaning> | null {
    const items = this.store.items().filter((i) => i.species === species);
    if (items.length === 0) return null;
    return sortRows(items, 'date', -1)[0];
  }

  protected diasAtrasLabel(date: string): string {
    const dias = -daysUntil(date);
    if (dias <= 0) return 'Hoje';
    return `${dias} dia${dias === 1 ? '' : 's'} atrás`;
  }

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Nova limpeza');
    this.draft = {
      date: todayLocalISO(),
      species: 'quail',
      cleaningType: 'total',
      notes: '',
    };
    this.formOpen.set(true);
  }

  protected openEdit(item: WithId<FlockCleaning>): void {
    this.editingId = item.id;
    this.formTitle.set('Editar limpeza');
    this.draft = { ...item };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: FlockCleaning = {
      date: String(d['date']),
      species: d['species'] as Species,
      cleaningType: d['cleaningType'] as CleaningType,
      notes: d['notes'] ? String(d['notes']) : undefined,
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(item: WithId<FlockCleaning>): void {
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
