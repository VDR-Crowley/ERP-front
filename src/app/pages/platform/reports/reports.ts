import { Component, computed, inject } from '@angular/core';
import {
  ApexAxisChartSeries,
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexGrid,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  ApexXAxis,
  ApexYAxis,
  NgApexchartsModule,
} from 'ng-apexcharts';
import { TopBuyer } from '@core/interfaces/report.interface';
import { Venda } from '@core/interfaces/venda.interface';
import { Product } from '@core/interfaces/product.interface';
import { createEntityStore } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { brl, num } from '@core/utils/format';

interface ProdutoDistribuicao {
  name: string;
  eggs: number;
  pct: number;
  color: string;
}

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
}

interface DonutChartOptions {
  series: ApexNonAxisChartSeries;
  chart: ApexChart;
  labels: string[];
  colors: string[];
  stroke: ApexStroke;
  dataLabels: ApexDataLabels;
  legend: ApexLegend;
  tooltip: ApexTooltip;
  plotOptions: ApexPlotOptions;
  fill: ApexFill;
}

const PRODUTO_CORES: Record<string, string> = {
  '1 Bandeja de ovos de galinha': '#10b981',
  '50 ovos de codorna': '#4f93f7',
  '30 ovos galinha': '#a78bfa',
  '5 ovos Galinha + 50 Codorna': '#e0b341',
};
const COR_PADRAO = '#64748b';
const MESES_ABREV = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
];

function calcularFaturamentoPorMes(vendas: Venda[]): { categories: string[]; data: number[] } {
  const porMes = new Map<string, number>();
  for (const venda of vendas) {
    const chave = venda.date.slice(0, 7);
    porMes.set(chave, (porMes.get(chave) ?? 0) + venda.total);
  }
  const chaves = [...porMes.keys()].sort();
  return {
    categories: chaves.map((chave) => MESES_ABREV[Number(chave.slice(5, 7)) - 1]),
    data: chaves.map((chave) => porMes.get(chave)!),
  };
}

function calcularTopBuyers(vendas: Venda[]): TopBuyer[] {
  const porComprador = new Map<string, { orders: number; total: number }>();
  for (const venda of vendas) {
    const atual = porComprador.get(venda.buyer) ?? { orders: 0, total: 0 };
    atual.orders += 1;
    atual.total += venda.total;
    porComprador.set(venda.buyer, atual);
  }

  const lista = [...porComprador.entries()]
    .map(([name, dados]) => ({ name, ...dados }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  const maiorTotal = lista[0]?.total ?? 1;
  return lista.map((c) => ({ ...c, pct: `${Math.round((c.total / maiorTotal) * 100)}%` }));
}

function calcularDistribuicaoOvos(vendas: Venda[], produtos: Product[]): ProdutoDistribuicao[] {
  const porProduto = new Map<string, number>();
  for (const venda of vendas) {
    const produto = produtos.find((p) => p.name === venda.product);
    const ovos = (produto?.eggsPerUnit ?? 0) * venda.quantity;
    porProduto.set(venda.product, (porProduto.get(venda.product) ?? 0) + ovos);
  }
  const totalGeral = [...porProduto.values()].reduce((soma, v) => soma + v, 0);

  return [...porProduto.entries()]
    .map(([name, eggs]) => ({
      name,
      eggs,
      pct: totalGeral ? Math.round((eggs / totalGeral) * 100) : 0,
      color: PRODUTO_CORES[name] ?? COR_PADRAO,
    }))
    .sort((a, b) => b.eggs - a.eggs);
}

@Component({
  selector: 'app-reports',
  imports: [NgApexchartsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  protected readonly brl = brl;
  protected readonly num = num;

  private readonly salesStore = createEntityStore<Venda>(IDB_STORES.sales, []);
  private readonly productsStore = createEntityStore<Product>(IDB_STORES.products, []);
  private readonly periodFilter = inject(PeriodFilterService);

  /** Vendas do store restritas ao período selecionado no DatePicker da topbar. */
  protected readonly vendasFiltradas = computed(() =>
    this.salesStore.items().filter((v) => this.periodFilter.includes(v.date)),
  );

  // Comparativos "vs. período anterior" exigiriam série histórica por período,
  // que o app não modela — ficam neutros até essa base existir. `eggsSold` já
  // vem de dado real (soma de distribuicaoOvos).
  protected readonly resumo = computed(() => ({
    eggsSold: this.distribuicaoOvos().reduce((soma, d) => soma + d.eggs, 0),
    eggsSoldChange: '—',
    marginPct: 0,
    marginChange: '—',
    revenueChange: '—',
    avgTicketChange: '—',
  }));

  protected readonly hasVendas = computed(() => this.vendasFiltradas().length > 0);
  protected readonly faturamentoTotal = computed(() =>
    this.vendasFiltradas().reduce((soma, v) => soma + v.total, 0),
  );
  protected readonly ticketMedio = computed(() => {
    const vendas = this.vendasFiltradas();
    return vendas.length ? this.faturamentoTotal() / vendas.length : 0;
  });

  protected readonly topBuyers = computed<TopBuyer[]>(() =>
    calcularTopBuyers(this.vendasFiltradas()),
  );
  protected readonly distribuicaoOvos = computed<ProdutoDistribuicao[]>(() =>
    calcularDistribuicaoOvos(this.vendasFiltradas(), this.productsStore.items()),
  );

  // Série vem só dos meses com venda real no IDB — nenhum mês é inventado.
  protected readonly revenueChart = computed<BarChartOptions>(() => {
    const { categories, data } = calcularFaturamentoPorMes(this.vendasFiltradas());
    return {
      series: [{ name: 'Faturamento', data }],
      chart: { type: 'bar', height: 220, toolbar: { show: false } },
      plotOptions: { bar: { borderRadius: 6, columnWidth: '45%' } },
      colors: ['#10b981'],
      dataLabels: { enabled: false },
      xaxis: {
        categories,
        axisBorder: { show: false },
        axisTicks: { show: false },
        labels: { style: { colors: '#6b7684' } },
      },
      yaxis: { labels: { style: { colors: '#6b7684' }, formatter: (v: number) => brl(v) } },
      grid: { borderColor: '#1e2732', strokeDashArray: 4 },
      tooltip: { y: { formatter: (v: number) => brl(v) } },
    };
  });

  protected readonly donutChart = computed<DonutChartOptions>(() => {
    const distribuicaoOvos = this.distribuicaoOvos();
    return {
      series: distribuicaoOvos.map((d) => d.eggs),
      chart: { type: 'donut', height: 190 },
      labels: distribuicaoOvos.map((d) => d.name),
      colors: distribuicaoOvos.map((d) => d.color),
      stroke: { width: 0 },
      dataLabels: { enabled: false },
      legend: { show: false },
      tooltip: { y: { formatter: (v: number) => `${num(v)} ovos` } },
      plotOptions: {
        pie: {
          donut: {
            size: '72%',
            labels: {
              show: true,
              value: { formatter: (v: string) => num(Number(v)) },
              total: { show: true, label: 'Ovos', formatter: () => num(this.resumo().eggsSold) },
            },
          },
        },
      },
      fill: { type: 'solid' },
    };
  });
}
