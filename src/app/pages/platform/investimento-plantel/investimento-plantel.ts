import { Component, computed, inject, resource, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
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
import { FlockInvestmentMonth } from '@core/interfaces/flock-investment-report.interface';
import { createFlockStore } from '@core/api/adapters/flock.adapter';
import { FlockInvestmentReportApiService } from '@core/api/flock-investment-report-api.service';
import { ThemeService } from '@core/utils/theme.service';
import { brl, num } from '@core/utils/format';

const MESES_ABREV = [
  'Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez',
];

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

/**
 * Tela "Investimento no Plantel" — payback mensal de um lote comprado como
 * investimento (data de aquisição + valor investido, cadastrados em Plantel).
 * O relatório em si (receita, despesa, quanto do investimento foi pago,
 * quanto falta) vem pronto de `GET /flock/{flock}/investment-report`; este
 * componente só monta a apresentação. Antes de chamar a API, confere no
 * front se o plantel selecionado já tem `acquiredDate`/`investmentAmount`
 * preenchidos — evita um round-trip só pra descobrir o 422 que o backend
 * devolveria pro mesmo motivo.
 */
@Component({
  selector: 'app-investimento-plantel',
  imports: [FormsModule, RouterLink, NgApexchartsModule],
  templateUrl: './investimento-plantel.html',
  styleUrl: './investimento-plantel.scss',
})
export class InvestimentoPlantel {
  protected readonly brl = brl;
  protected readonly num = num;

  private readonly flockStore = createFlockStore();
  private readonly reportApi = inject(FlockInvestmentReportApiService);
  private readonly themeService = inject(ThemeService);
  private readonly route = inject(ActivatedRoute);

  /** Pré-seleciona o plantel vindo do botão "Relatório de investimento" da tela Plantel (`?flockId=`), se houver. */
  protected readonly selectedFlockId = signal(this.route.snapshot.queryParamMap.get('flockId') ?? '');

  protected readonly flockOptions = computed(() =>
    this.flockStore.items().map((f) => ({ value: f.id, label: f.species })),
  );

  protected readonly selectedFlock = computed(
    () => this.flockStore.items().find((f) => f.id === this.selectedFlockId()) ?? null,
  );

  protected readonly hasInvestmentData = computed(() => {
    const flock = this.selectedFlock();
    return !!flock && !!flock.acquiredDate && flock.investmentAmount != null;
  });

  private readonly reportResource = resource({
    params: () => ({ flockId: this.selectedFlockId(), ready: this.hasInvestmentData() }),
    loader: ({ params }): Promise<FlockInvestmentMonth[]> => {
      if (!params.flockId || !params.ready) return Promise.resolve([]);
      return firstValueFrom(this.reportApi.get(params.flockId));
    },
  });

  /** `.value()` lança se o resource estiver em estado de erro — `hasValue()` evita isso. */
  protected readonly months = computed<FlockInvestmentMonth[]>(() =>
    this.reportResource.hasValue() ? this.reportResource.value() : [],
  );
  protected readonly isLoading = computed(() => this.reportResource.isLoading());

  protected readonly loadError = computed<string | null>(() => {
    const err = this.reportResource.error();
    if (!err) return null;
    if (err instanceof HttpErrorResponse && err.status === 422) {
      return err.error?.message ?? 'Plantel sem dados de investimento cadastrados.';
    }
    return 'Não foi possível carregar o relatório. Tente novamente.';
  });

  protected readonly totalInvested = computed(() => this.selectedFlock()?.investmentAmount ?? 0);

  protected readonly remainingInvestment = computed(() => {
    const rows = this.months();
    return rows.length ? rows[rows.length - 1].remainingInvestment : this.totalInvested();
  });

  protected readonly paidSoFar = computed(() => this.totalInvested() - this.remainingInvestment());

  protected readonly percentPaid = computed(() => {
    const total = this.totalInvested();
    return total > 0 ? (this.paidSoFar() / total) * 100 : 0;
  });

  protected readonly chart = computed<LineChartOptions>(() => {
    const rows = this.months();
    const textColor = this.themeService.isDark() ? '#e9eef3' : '#10151c';
    const categories = rows.map((r) => {
      const [, month] = r.month.split('-');
      return MESES_ABREV[Number(month) - 1] ?? r.month;
    });
    return {
      series: [
        { name: 'Receita', data: rows.map((r) => r.revenue) },
        { name: 'Despesas', data: rows.map((r) => r.expenses) },
        { name: 'Investimento pago no mês', data: rows.map((r) => r.investmentPaidThisMonth) },
      ],
      chart: { type: 'line', height: 260, toolbar: { show: false } },
      colors: ['#4f93f7', '#e0b341', '#5fbf7a'],
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
