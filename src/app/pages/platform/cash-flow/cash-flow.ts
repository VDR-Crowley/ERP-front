import { Component, computed, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexPlotOptions,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  NgApexchartsModule,
} from 'ng-apexcharts';
import { CashEntry } from '@core/interfaces/cash-entry.interface';
import { createEntityStore, WithId } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, ptDate } from '@core/utils/format';
import { todayLocalISO } from '@core/utils/date-diff';
import { CrudField, CrudFormModal } from '@shared/crud-form-modal/crud-form-modal';
import { ConfirmModal } from '@shared/confirm-modal/confirm-modal';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

interface CashRow extends WithId<CashEntry> {
  saldo: number;
}

type SortField = keyof CashEntry;

const FIELDS: CrudField[] = [
  { key: 'date', label: 'Data', type: 'date', required: true },
  { key: 'description', label: 'Descrição', type: 'text', required: true },
  {
    key: 'inflow',
    label: 'Tipo',
    type: 'select',
    options: [
      { value: 'true', label: 'Entrada' },
      { value: 'false', label: 'Saída' },
    ],
    required: true,
  },
  { key: 'amount', label: 'Valor', type: 'number', step: 0.01, required: true },
];

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'];

interface BarChartOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  plotOptions: ApexPlotOptions;
  colors: string[];
  dataLabels: ApexDataLabels;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  grid: ApexGrid;
  tooltip: ApexTooltip;
  legend: ApexLegend;
}

@Component({
  selector: 'app-cash-flow',
  imports: [FormsModule, NgApexchartsModule, CrudFormModal, ConfirmModal, FilterByPipe, SortIcon],
  templateUrl: './cash-flow.html',
  styleUrl: './cash-flow.scss',
})
export class CashFlow {
  protected readonly brl = brl;
  protected readonly ptDate = ptDate;
  protected readonly fields = FIELDS;

  private readonly store = createEntityStore<CashEntry>(IDB_STORES.cashFlow, []);

  protected readonly search = signal('');
  protected readonly searchKeys: SortField[] = ['date', 'description'];
  private readonly sortState = createSortState<SortField>('date', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly formOpen = signal(false);
  protected readonly formTitle = signal('Novo lançamento');
  protected draft: Record<string, unknown> = {};
  private editingId: string | null = null;
  protected readonly deleteTarget = signal<WithId<CashEntry> | null>(null);

  protected readonly entradas = computed(() =>
    this.store
      .items()
      .filter((c) => c.inflow)
      .reduce((s, c) => s + c.amount, 0),
  );
  protected readonly saidas = computed(() =>
    this.store
      .items()
      .filter((c) => !c.inflow)
      .reduce((s, c) => s + c.amount, 0),
  );
  protected readonly saldo = computed(() => this.entradas() - this.saidas());
  protected readonly hasLancamentos = computed(() => this.store.items().length > 0);

  // Sem série histórica real por mês ainda — só é exibido quando há lançamentos.
  protected readonly chart: BarChartOptions = {
    series: [
      { name: 'Entradas', data: MESES.map(() => 0) },
      { name: 'Saídas', data: MESES.map(() => 0) },
    ],
    chart: { type: 'bar', height: 200, toolbar: { show: false } },
    plotOptions: { bar: { borderRadius: 5, columnWidth: '55%' } },
    colors: ['#10b981', '#324055'],
    dataLabels: { enabled: false },
    xaxis: {
      categories: MESES,
      axisBorder: { show: false },
      axisTicks: { show: false },
      labels: { style: { colors: '#6b7684' } },
    },
    yaxis: { labels: { style: { colors: '#6b7684' }, formatter: (v: number) => `${v}%` } },
    grid: { borderColor: '#1e2732', strokeDashArray: 4 },
    tooltip: { y: { formatter: (v: number) => `${v}%` } },
    legend: { show: true, labels: { colors: '#8b98a8' }, markers: { size: 5 } },
  };

  protected readonly rows = computed<CashRow[]>(() => {
    const chronological = sortRows(this.store.items(), 'date', 1);
    let saldo = 0;
    const withSaldo: CashRow[] = chronological.map((c) => {
      saldo += c.inflow ? c.amount : -c.amount;
      return { ...c, saldo };
    });
    return sortRows(withSaldo, this.sortField(), this.sortDir());
  });

  protected openNew(): void {
    this.editingId = null;
    this.formTitle.set('Novo lançamento');
    this.draft = {
      date: todayLocalISO(),
      description: '',
      inflow: 'true',
      amount: 0,
    };
    this.formOpen.set(true);
  }

  protected openEdit(c: WithId<CashEntry>): void {
    this.editingId = c.id;
    this.formTitle.set('Editar lançamento');
    this.draft = { ...c, inflow: String(c.inflow) };
    this.formOpen.set(true);
  }

  protected cancelForm(): void {
    this.formOpen.set(false);
  }

  protected async saveForm(): Promise<void> {
    const d = this.draft;
    const record: CashEntry = {
      date: String(d['date']),
      description: String(d['description']),
      inflow: d['inflow'] === 'true' || d['inflow'] === true,
      amount: Number(d['amount']),
    };

    if (this.editingId) {
      await this.store.update(this.editingId, record);
    } else {
      await this.store.add(record);
    }
    this.formOpen.set(false);
  }

  protected askDelete(c: WithId<CashEntry>): void {
    this.deleteTarget.set(c);
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
