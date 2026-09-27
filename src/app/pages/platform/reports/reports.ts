import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
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
import { createSalesStore } from '@core/api/adapters/sales.adapter';
import { createProductsStore } from '@core/api/adapters/products.adapter';
import { createExpensesStore } from '@core/api/adapters/expenses.adapter';
import { createBarnStore } from '@core/api/adapters/barn.adapter';
import { createDailyProductionsStore } from '@core/api/adapters/daily-productions.adapter';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { ThemeService } from '@core/utils/theme.service';
import { brl, num } from '@core/utils/format';

interface ProdutoDistribuicao {
  name: string;
  eggs: number;
  pct: number;
  color: string;
}

/** Uma linha do painel "Ovos produzidos por galpão" do relatório. */
interface OvosGalpao {
  name: string;
  eggs: number;
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

function endOfMonth(date: Date): Date {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}
// Fim do mês corrente real (não hardcoded) — usado pra excluir vendas/despesas
// futuras de qualquer soma. Sem isso, um período custom que avança além de
// hoje (ou "Tudo") somaria lançamentos que ainda não aconteceram.
const CURRENT_MONTH_END = endOfMonth(new Date());

function isFuturePeriod(isoDate: string): boolean {
  const data = new Date(`${isoDate.slice(0, 10)}T00:00:00`);
  return data > CURRENT_MONTH_END;
}
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
  imports: [NgApexchartsModule, FormsModule],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  protected readonly brl = brl;
  protected readonly num = num;

  private readonly salesStore = createSalesStore();
  private readonly productsStore = createProductsStore();
  private readonly expensesStore = createExpensesStore();
  private readonly barnStore = createBarnStore();
  private readonly productionStore = createDailyProductionsStore();
  private readonly periodFilter = inject(PeriodFilterService);
  private readonly themeService = inject(ThemeService);

  /** Galpões cadastrados — usados só pra rotular o painel de ovos por galpão. */
  protected readonly barns = computed(() => this.barnStore.items());

  /**
   * Vendas do período selecionado. As vendas voltaram a ser todas de "Plantel"
   * (sem galpão): o galpão é dimensão só de PRODUÇÃO agora, então o
   * faturamento é sempre consolidado, sem recorte por galpão.
   */
  protected readonly vendasFiltradas = computed(() =>
    this.salesStore
      .items()
      .filter((v) => this.periodFilter.includes(v.date) && !isFuturePeriod(v.date)),
  );
  /** Total de despesas do período (todas — sem recorte por galpão). */
  protected readonly despesasFiltradas = computed(() =>
    this.expensesStore
      .items()
      .filter((e) => this.periodFilter.includes(e.date) && !isFuturePeriod(e.date))
      .reduce((soma, e) => soma + e.amount, 0),
  );

  /**
   * Ovos produzidos por galpão no período (codorna + galinha). É o número que o
   * Ytallo usa pro payback: quanto cada galpão produziu, independente de venda.
   * Produção sem galpão (dado legado/import antigo) cai em "Sem galpão".
   */
  protected readonly ovosPorGalpao = computed<OvosGalpao[]>(() => {
    const producoes = this.productionStore
      .items()
      .filter((p) => this.periodFilter.includes(p.date) && !isFuturePeriod(p.date));
    const eggsOf = (p: { quailEggs: number | null; chickenEggs: number | null }) =>
      (p.quailEggs ?? 0) + (p.chickenEggs ?? 0);

    const linhas: OvosGalpao[] = this.barns().map((b) => ({
      name: b.name,
      eggs: producoes
        .filter((p) => p.barnId != null && String(p.barnId) === b.id)
        .reduce((soma, p) => soma + eggsOf(p), 0),
    }));

    const semGalpao = producoes
      .filter((p) => p.barnId == null)
      .reduce((soma, p) => soma + eggsOf(p), 0);
    if (semGalpao > 0) {
      linhas.push({ name: 'Sem galpão', eggs: semGalpao });
    }
    return linhas;
  });
  protected readonly ovosPorGalpaoTotal = computed(() =>
    this.ovosPorGalpao().reduce((soma, l) => soma + l.eggs, 0),
  );
  /**
   * `true` quando o período selecionado é inteiramente futuro (ex.: chip
   * "próximo mês" do MonthTabs, ou custom range que só começa depois de
   * hoje) — nesses casos não existe faturamento/despesa possível ainda, e
   * `marginPct` vira `null` em vez de um "0%" enganoso (parece empate,
   * não "sem dados"). "Tudo" (filtro limpo) nunca conta como futuro.
   */
  protected readonly isPeriodFullyFuture = computed(() => {
    if (!this.periodFilter.active()) return false;
    const [start] = this.periodFilter.range();
    return start > CURRENT_MONTH_END;
  });
  // Margem = (faturamento - despesas) / faturamento, no período selecionado.
  // `eggsSold` já vem de dado real (soma de distribuicaoOvos). Comparativos
  // "vs. período anterior" exigiriam série histórica por período, que o app
  // não modela — em vez de mostrar um "—" sem explicação (confundia o
  // usuário, que marcou "que?" perto da Margem), os cards não prometem mais
  // nenhuma comparação até essa base existir de verdade.
  protected readonly resumo = computed(() => {
    const faturamento = this.faturamentoTotal();
    const marginPct = this.isPeriodFullyFuture()
      ? null
      : faturamento
        ? Math.round(((faturamento - this.despesasFiltradas()) / faturamento) * 100)
        : 0;
    return {
      eggsSold: this.distribuicaoOvos().reduce((soma, d) => soma + d.eggs, 0),
      marginPct,
    };
  });

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
    const textColor = this.themeService.isDark() ? '#e9eef3' : '#10151c';
    return {
      series: [{ name: 'Faturamento', data }],
      chart: { type: 'bar', height: 220, toolbar: { show: false } },
      plotOptions: { bar: { borderRadius: 6, columnWidth: '45%' } },
      colors: ['#10b981'],
      // Valor de cada mês em cima da barra — sem isso só dava pra estimar
      // olhando a régua do eixo Y, o que confundia o usuário.
      dataLabels: {
        enabled: true,
        offsetY: -20,
        style: { fontSize: '12px', colors: [textColor] },
        formatter: (v: number) => brl(v),
      },
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
    const textColor = this.themeService.isDark() ? '#e9eef3' : '#10151c';
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
              name: { color: textColor },
              value: { color: textColor, formatter: (v: string) => num(Number(v)) },
              total: {
                show: true,
                label: 'Ovos',
                color: textColor,
                formatter: () => num(this.resumo().eggsSold),
              },
            },
          },
        },
      },
      fill: { type: 'solid' },
    };
  });
}
