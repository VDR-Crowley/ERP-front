import { Component, computed, inject, signal } from '@angular/core';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexGrid,
  ApexLegend,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  NgApexchartsModule,
} from 'ng-apexcharts';
import { Venda } from '@core/interfaces/venda.interface';
import { Expense } from '@core/interfaces/expense.interface';
import { Plantel } from '@core/interfaces/plantel.interface';
import { Product } from '@core/interfaces/product.interface';
import { ProductLineResult } from '@core/interfaces/business-line-report.interface';
import { createEntityStore } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { ThemeService } from '@core/utils/theme.service';
import { brl, num } from '@core/utils/format';
import {
  buildBusinessLineReport,
  buildProductReport,
  buildSpeciesRevenueSeries,
} from '@core/utils/business-line-report.util';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';

type ProductSortField = keyof ProductLineResult;
type ViewMode = 'especie' | 'produto';

interface LineChartOptions {
  series: ApexAxisChartSeries;
  chart: ApexChart;
  colors: string[];
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  xaxis: ApexXAxis;
  yaxis: ApexYAxis;
  grid: ApexGrid;
  legend: ApexLegend;
  tooltip: ApexTooltip;
}

const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

/**
 * Tela "Análise por Linha de Negócio" — rentabilidade de codorna x galinha e por produto,
 * a partir dos dados já existentes em `sales`, `expenses`, `flock` e `products` (IndexedDB).
 * A lógica de rateio (despesa por menção/plantel, receita de produto misto por valor
 * implícito do ovo) vive em funções puras testáveis (`business-line-report.util.ts`); este
 * componente só busca os stores, filtra pelo período global e monta a apresentação.
 */
@Component({
  selector: 'app-analise-linha-negocio',
  imports: [NgApexchartsModule, SortIcon],
  templateUrl: './analise-linha-negocio.html',
  styleUrl: './analise-linha-negocio.scss',
})
export class AnaliseLinhaNegocio {
  protected readonly brl = brl;
  protected readonly num = num;

  private readonly salesStore = createEntityStore<Venda>(IDB_STORES.sales, []);
  private readonly expensesStore = createEntityStore<Expense>(IDB_STORES.expenses, []);
  private readonly flockStore = createEntityStore<Plantel>(IDB_STORES.flock, []);
  private readonly productsStore = createEntityStore<Product>(IDB_STORES.products, []);
  private readonly periodFilter = inject(PeriodFilterService);
  private readonly themeService = inject(ThemeService);

  protected readonly view = signal<ViewMode>('especie');
  protected setView(next: ViewMode): void {
    this.view.set(next);
  }

  /** Vendas do store restritas ao período selecionado no DatePicker da topbar. */
  private readonly vendasFiltradas = computed(() =>
    this.salesStore.items().filter((v) => this.periodFilter.includes(v.date)),
  );
  /** Despesas do store restritas ao mesmo período. */
  private readonly despesasFiltradas = computed(() =>
    this.expensesStore.items().filter((e) => this.periodFilter.includes(e.date)),
  );
  /** Plantel não é filtrado por período — é o tamanho atual do plantel, usado só pro rateio. */
  private readonly flockItems = computed(() => this.flockStore.items());
  private readonly productsItems = computed(() => this.productsStore.items());

  protected readonly hasVendas = computed(() => this.vendasFiltradas().length > 0);

  protected readonly report = computed(() =>
    buildBusinessLineReport(
      this.vendasFiltradas(),
      this.despesasFiltradas(),
      this.flockItems(),
      this.productsItems(),
    ),
  );

  protected readonly productResults = computed<ProductLineResult[]>(() =>
    buildProductReport(
      this.vendasFiltradas(),
      this.despesasFiltradas(),
      this.flockItems(),
      this.productsItems(),
    ),
  );

  private readonly sortState = createSortState<ProductSortField>('marginPct', 1);
  protected readonly sortField = this.sortState.sortField;
  protected readonly sortDir = this.sortState.sortDir;
  protected readonly sortBy = this.sortState.sortBy;

  protected readonly productRows = computed<ProductLineResult[]>(() =>
    sortRows(this.productResults(), this.sortField(), this.sortDir()),
  );

  protected readonly produtoMaisFraco = computed<ProductLineResult | null>(() => {
    const rows = this.productResults();
    if (!rows.length) return null;
    return rows.reduce((pior, atual) => (atual.marginPct < pior.marginPct ? atual : pior));
  });

  protected readonly produtoMaisForte = computed<ProductLineResult | null>(() => {
    const rows = this.productResults();
    if (!rows.length) return null;
    return rows.reduce((melhor, atual) => (atual.marginPct > melhor.marginPct ? atual : melhor));
  });

  protected readonly revenueOverTimeChart = computed<LineChartOptions>(() => {
    const series = buildSpeciesRevenueSeries(this.vendasFiltradas(), this.productsItems());
    const textColor = this.themeService.isDark() ? '#e9eef3' : '#10151c';
    const categories = series.map((p) => {
      const [, month] = p.month.split('-');
      return MESES_ABREV[Number(month) - 1] ?? p.month;
    });
    return {
      series: [
        { name: 'Codorna', data: series.map((p) => p.codornaRevenue) },
        { name: 'Galinha', data: series.map((p) => p.galinhaRevenue) },
      ],
      chart: { type: 'line', height: 260, toolbar: { show: false } },
      colors: ['#4f93f7', '#e0b341'],
      stroke: { curve: 'smooth', width: 3 },
      dataLabels: { enabled: false },
      xaxis: {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: '#6b7684' } },
      },
      yaxis: { labels: { style: { colors: '#6b7684' }, formatter: (v: number) => brl(v) } },
      grid: { borderColor: '#1e2732', strokeDashArray: 4 },
      legend: { labels: { colors: textColor } },
      tooltip: { y: { formatter: (v: number) => brl(v) } },
    };
  });
}
