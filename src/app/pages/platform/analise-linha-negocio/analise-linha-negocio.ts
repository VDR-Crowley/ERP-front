import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { firstValueFrom } from 'rxjs';
import { Venda } from '@core/interfaces/venda.interface';
import { Expense } from '@core/interfaces/expense.interface';
import { ExpenseSpeciesOverride } from '@core/interfaces/expense-species-override.interface';
import { BusinessLineReport, ProductLineResult, Species } from '@core/interfaces/business-line-report.interface';
import { WithId } from '@core/api/entity-store';
import { createSalesStore } from '@core/api/adapters/sales.adapter';
import { createExpensesStore } from '@core/api/adapters/expenses.adapter';
import { createSaleExclusionsStore } from '@core/api/adapters/sale-exclusions.adapter';
import { createExpenseSpeciesOverridesStore } from '@core/api/adapters/expense-species-overrides.adapter';
import { BusinessLineReportApiService, BusinessLineReportResult } from '@core/api/business-line-report-api.service';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { ThemeService } from '@core/utils/theme.service';
import { todayLocalISO, toLocalISO } from '@core/utils/date-diff';
import { brl, num, ptDate } from '@core/utils/format';
import { excludeSalesByIds } from '@core/utils/business-line-report.util';
import { createSortState, sortRows } from '@shared/table-sort/table-sort';
import { SortIcon } from '@shared/sort-icon/sort-icon';
import { FilterByPipe } from '@core/pipes/filter-by.pipe';

const EMPTY_SPECIES_TOTALS = { revenue: 0, cost: 0, profit: 0, marginPct: 0 };
const EMPTY_REPORT: BusinessLineReport = {
  codorna: EMPTY_SPECIES_TOTALS,
  galinha: EMPTY_SPECIES_TOTALS,
  galinhaCobreCustos: true,
  diferencaCobertaPelaCodorna: 0,
};

type ProductSortField = keyof ProductLineResult;
type ViewMode = 'especie' | 'produto';
type ExclusionSearchField = 'product' | 'buyer';
type ExpenseSearchField = 'description' | 'category';
/** Opção do seletor de override por despesa — `auto` remove o override (volta pra detecção por texto). */
type ExpenseSpeciesChoice = 'auto' | Species;

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

/** Motivo padrão salvo ao marcar uma venda como "evento isolado" pela tela (ver `SaleExclusion`). */
const MOTIVO_PADRAO = 'Evento isolado / não recorrente (marcado manualmente na Análise por Linha de Negócio)';

/** Motivo padrão salvo ao marcar o override de espécie de uma despesa (ver `ExpenseSpeciesOverride`). */
const MOTIVO_OVERRIDE_PADRAO = 'Origem real diferente da categoria/descrição (marcado manualmente na Análise por Linha de Negócio)';

/**
 * Tela "Análise por Linha de Negócio" — rentabilidade de codorna x galinha e por produto.
 * O relatório em si (rateio, margem, série mensal) vem pronto de
 * `GET /business-line-report` (ver `business-line-report-api.service.ts`); este componente
 * só chama a API pelo período global e monta a apresentação — as listas de gerenciamento
 * (exclusão de venda, override de despesa) continuam lendo `sales`/`expenses` reais direto.
 *

 * Vendas atípicas (ex.: uma venda única de um produto que não é recorrente) podem ser
 * marcadas como "desconsiderar da análise" — isso não apaga a venda de `sales`, só a remove
 * dos cálculos aqui, via um store separado (`excludedSales`, ver `SaleExclusion`). O
 * mecanismo é genérico: qualquer venda pode ser marcada, não só um produto específico.
 *
 * Despesas também podem ter a espécie sobrescrita manualmente (ex.: saco de ração de
 * galinha usado de fato pras codornas) via outro store separado (`expenseSpeciesOverrides`,
 * ver `ExpenseSpeciesOverride`), que tem prioridade sobre a detecção por texto em
 * `allocateExpenseAmount`.
 */
@Component({
  selector: 'app-analise-linha-negocio',
  imports: [FormsModule, NgApexchartsModule, SortIcon, FilterByPipe],
  templateUrl: './analise-linha-negocio.html',
  styleUrl: './analise-linha-negocio.scss',
})
export class AnaliseLinhaNegocio {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly ptDate = ptDate;

  private readonly salesStore = createSalesStore();
  private readonly expensesStore = createExpensesStore();
  private readonly excludedSalesStore = createSaleExclusionsStore();
  private readonly expenseOverridesStore = createExpenseSpeciesOverridesStore();
  private readonly periodFilter = inject(PeriodFilterService);
  private readonly themeService = inject(ThemeService);
  private readonly businessLineReportApi = inject(BusinessLineReportApiService);

  /**
   * Rateio/cálculo (codorna x galinha, por produto, série mensal) agora vem
   * pronto de `GET /business-line-report?start=&end=` — o backend já lê
   * `sales`/`sale_exclusions`/`expenses`/`expense_species_overrides`/`flock`/
   * `products` reais (ver `business-line-report-api.service.ts`). Reavalia
   * sozinho quando o período do DatePicker da topbar muda.
   */
  private readonly reportResource = resource({
    params: () => ({ active: this.periodFilter.active(), range: this.periodFilter.range() }),
    loader: ({ params }): Promise<BusinessLineReportResult> => {
      const [start, end] = params.active
        ? [toLocalISO(params.range[0]), toLocalISO(params.range[1])]
        : [undefined, undefined];
      return firstValueFrom(this.businessLineReportApi.get(start, end));
    },
  });

  protected readonly view = signal<ViewMode>('especie');
  protected setView(next: ViewMode): void {
    this.view.set(next);
  }

  /** Painel de gerenciamento de vendas atípicas — fechado por padrão pra não poluir a tela. */
  protected readonly manageExclusionsOpen = signal(false);
  protected toggleManageExclusions(): void {
    this.manageExclusionsOpen.update((open) => !open);
  }

  protected readonly exclusionSearch = signal('');
  protected readonly exclusionSearchKeys: ExclusionSearchField[] = ['product', 'buyer'];

  /** Painel "Despesas — origem real" — fechado por padrão pra não poluir a tela. */
  protected readonly manageExpenseOverridesOpen = signal(false);
  protected toggleManageExpenseOverrides(): void {
    this.manageExpenseOverridesOpen.update((open) => !open);
  }

  protected readonly expenseSearch = signal('');
  protected readonly expenseSearchKeys: ExpenseSearchField[] = ['description', 'category'];

  /** Todas as vendas do store restritas ao período selecionado no DatePicker da topbar (sem descontar exclusões — usado na lista de gerenciamento, pra poder marcar/desmarcar). */
  protected readonly vendasNoPeriodo = computed(() =>
    this.salesStore.items().filter((v) => this.periodFilter.includes(v.date)),
  );
  /** Despesas do store restritas ao mesmo período. */
  protected readonly despesasFiltradas = computed(() =>
    this.expensesStore.items().filter((e) => this.periodFilter.includes(e.date)),
  );
  /** `id`s de venda marcados como "evento isolado" (ver `SaleExclusion`). */
  protected readonly excludedSaleIds = computed(
    () => new Set(this.excludedSalesStore.items().map((e) => e.saleId)),
  );
  protected readonly excludedCount = computed(
    () => this.vendasNoPeriodo().filter((v) => this.excludedSaleIds().has(v.id)).length,
  );

  /** `id` de despesa -> override manual de espécie (ver `ExpenseSpeciesOverride`); usado no rateio de custos abaixo. */
  protected readonly expenseSpeciesOverrides = computed(
    () => new Map(this.expenseOverridesStore.items().map((o) => [o.expenseId, o.species])),
  );
  protected readonly expenseOverridesCount = computed(
    () => this.despesasFiltradas().filter((e) => this.expenseSpeciesOverrides().has(e.id)).length,
  );

  /**
   * "Tem venda considerada no período?" — só decide se mostra o relatório ou
   * o estado vazio; olhar pras vendas não-excluídas do próprio `salesStore`
   * (sem esperar `GET /business-line-report`) evita o piscar de "sem dados"
   * durante o loading do resource.
   */
  protected readonly hasVendas = computed(
    () => excludeSalesByIds(this.vendasNoPeriodo(), this.excludedSaleIds()).length > 0,
  );

  protected readonly report = computed(() => this.reportResource.value()?.report ?? EMPTY_REPORT);

  protected readonly productResults = computed<ProductLineResult[]>(
    () => this.reportResource.value()?.byProduct ?? [],
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
    const series = this.reportResource.value()?.monthly ?? [];
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

  protected isExcluded(saleId: string): boolean {
    return this.excludedSaleIds().has(saleId);
  }

  /** Marca/desmarca uma venda como "evento isolado" — não apaga o registro de `sales`, só grava/remove a marca em `excludedSales`. `GET /business-line-report` já exclui a marcada, então recarrega o relatório em seguida. */
  protected async toggleExclusion(sale: WithId<Venda>): Promise<void> {
    const existing = this.excludedSalesStore.items().find((e) => e.saleId === sale.id);
    if (existing) {
      await this.excludedSalesStore.remove(existing.id);
    } else {
      await this.excludedSalesStore.add({
        saleId: sale.id,
        reason: MOTIVO_PADRAO,
        createdAt: todayLocalISO(),
      });
    }
    this.reportResource.reload();
  }

  /** Opção atual do seletor pra uma despesa: `auto` quando não há override gravado. */
  protected expenseSpeciesChoice(expenseId: string): ExpenseSpeciesChoice {
    return this.expenseSpeciesOverrides().get(expenseId) ?? 'auto';
  }

  /**
   * Aplica o override de espécie escolhido pra uma despesa (ver `ExpenseSpeciesOverride`).
   * `auto` remove o override (volta pra detecção por texto); `codorna`/`galinha` grava a
   * espécie real que consumiu o custo, sobrescrevendo a categoria/descrição.
   */
  protected async setExpenseSpeciesOverride(
    expense: WithId<Expense>,
    choice: ExpenseSpeciesChoice,
  ): Promise<void> {
    const existing = this.expenseOverridesStore.items().find((o) => o.expenseId === expense.id);

    if (choice === 'auto') {
      if (existing) {
        await this.expenseOverridesStore.remove(existing.id);
        this.reportResource.reload();
      }
      return;
    }

    const override: ExpenseSpeciesOverride = {
      expenseId: expense.id,
      species: choice,
      reason: MOTIVO_OVERRIDE_PADRAO,
      createdAt: todayLocalISO(),
    };

    if (existing) {
      await this.expenseOverridesStore.update(existing.id, override);
    } else {
      await this.expenseOverridesStore.add(override);
    }
    this.reportResource.reload();
  }
}
