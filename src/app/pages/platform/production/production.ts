import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ProducaoDiaria } from '@core/interfaces/producao-diaria.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { num, ptDate } from '@core/utils/format';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type Row = WithId<ProducaoDiaria> & { total: number };
type SortField = keyof Row;

const FIELDS: CrudField[] = [
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'quailEggs', label: 'Ovos codorna', type: 'number', step: 1 },
  { key: 'chickenEggs', label: 'Ovos galinha', type: 'number', step: 1 },
];

@Component({
  selector: 'app-production',
  imports: [FormsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './production.html',
  styleUrl: './production.scss',
})
export class Production {
  protected readonly num = num;
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<ProducaoDiaria>(IDB_STORES.dailyProduction, []);
  private readonly periodFilter = inject(PeriodFilterService);

  protected readonly search = signal('');
  protected readonly searchKeys: (keyof Row)[] = ['date'];
  private readonly sortState = createSortState<SortField>('date', 1);
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
  // Conta dias únicos (não linhas) — se houver mais de um registro na mesma
  // data, isso não deve inflar o denominador e diluir a média.
  protected readonly diasRegistrados = computed(
    () => new Set(this.rowsComProducao().map((p) => p.date)).size,
  );
  protected readonly mediaDia = computed(() => {
    const dias = this.diasRegistrados();
    return dias ? Math.round(this.totalGeral() / dias) : 0;
  });

  protected readonly rows = computed<Row[]>(() => {
    const list: Row[] = this.store.items().map((p) => ({
      ...p,
      total: (p.quailEggs ?? 0) + (p.chickenEggs ?? 0),
    }));
    return sortRows(list, this.sortField(), this.sortDir());
  });

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Novo registro');
    this.draft = { date: new Date().toISOString().slice(0, 10), quailEggs: 0, chickenEggs: 0 };
    this.formOpen.set(true);
  }

  protected openEdit(p: WithId<ProducaoDiaria>): void {
    this.editingId = p.id;
    this.formTitle.set('Editar registro');
    this.draft = { ...p };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: ProducaoDiaria = {
      date: String(d['date']),
      quailEggs: d['quailEggs'] === '' || d['quailEggs'] === null ? null : Number(d['quailEggs']),
      chickenEggs:
        d['chickenEggs'] === '' || d['chickenEggs'] === null ? null : Number(d['chickenEggs']),
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
