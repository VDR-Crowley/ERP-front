import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { EggLoss } from '@core/interfaces/egg-loss.interface';
import { Species } from '@core/interfaces/novo-lote-plantel.interface';
import { WithId } from '@core/api/entity-store';
import { createEggLossesStore } from '@core/api/adapters/egg-loss.adapter';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { num, ptDate } from '@core/utils/format';
import { todayLocalISO } from '@core/utils/date-diff';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type SortField = keyof EggLoss;

const SPECIES_OPTIONS = [
  { value: 'quail', label: 'Codorna' },
  { value: 'chicken', label: 'Galinha' },
];

const FIELDS: CrudField[] = [
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'species', label: 'Espécie', type: 'select', required: true, options: SPECIES_OPTIONS },
  { key: 'quantity', label: 'Quantidade', type: 'number', step: 1, required: true },
  { key: 'reason', label: 'Motivo', type: 'text' },
];

@Component({
  selector: 'app-perda-de-ovos',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './perda-de-ovos.html',
  styleUrl: './perda-de-ovos.scss',
})
export class PerdaDeOvos {
  protected readonly num = num;
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;
  protected readonly speciesLabel = (s: Species) => (s === 'quail' ? 'Codorna' : 'Galinha');

  private readonly store = createEggLossesStore();
  private readonly periodFilter = inject(PeriodFilterService);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['date', 'reason'];
  private readonly sortState = createSortState<SortField>('date', -1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo lançamento');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<EggLoss> | null>(null);

  /** Restrito ao período selecionado na topbar (mesmo padrão de Produção/Higienização). */
  protected readonly rowsPeriodo = computed(() =>
    this.store.items().filter((i) => this.periodFilter.includes(i.date)),
  );

  protected readonly rows = computed<WithId<EggLoss>[]>(() =>
    sortRows(this.rowsPeriodo(), this.sortField(), this.sortDir()),
  );

  protected readonly totalCodorna = computed(() => this.totalBySpecies('quail'));
  protected readonly totalGalinha = computed(() => this.totalBySpecies('chicken'));
  protected readonly totalGeral = computed(() => this.totalCodorna() + this.totalGalinha());

  private totalBySpecies(species: Species): number {
    return this.rowsPeriodo()
      .filter((i) => i.species === species)
      .reduce((soma, i) => soma + i.quantity, 0);
  }

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Novo lançamento');
    this.draft = { date: todayLocalISO(), species: 'quail', quantity: 1, reason: '' };
    this.formOpen.set(true);
  }

  protected openEdit(item: WithId<EggLoss>): void {
    this.editingId = item.id;
    this.formTitle.set('Editar lançamento');
    this.draft = { ...item };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: EggLoss = {
      date: String(d['date']),
      species: d['species'] as Species,
      quantity: Number(d['quantity']),
      reason: d['reason'] ? String(d['reason']) : undefined,
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(item: WithId<EggLoss>): void {
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
