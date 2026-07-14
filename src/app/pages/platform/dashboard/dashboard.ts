import { Component, computed } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  ApexChart,
  ApexDataLabels,
  ApexFill,
  ApexLegend,
  ApexNonAxisChartSeries,
  ApexPlotOptions,
  ApexStroke,
  ApexTooltip,
  NgApexchartsModule,
} from 'ng-apexcharts';
import { Venda } from '@core/interfaces/venda.interface';
import { ProducaoDiaria } from '@core/interfaces/producao-diaria.interface';
import { Plantel } from '@core/interfaces/plantel.interface';
import { EstoqueOvos } from '@core/interfaces/estoque-ovos.interface';
import { Product } from '@core/interfaces/product.interface';
import { Expense } from '@core/interfaces/expense.interface';
import { DashboardResumo } from '@core/interfaces/dashboard.interface';
import { createEntityStore } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { brl, num, ptDate } from '@core/utils/format';
import { sortRows } from '@shared/table-sort/table-sort';

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

interface VendaPorProduto {
  name: string;
  total: number;
  pct: number;
  color: string;
}

const PRODUTO_CORES: Record<string, string> = {
  '1 Bandeja de ovos de galinha': '#10b981',
  '50 ovos de codorna': '#3b82f6',
  '30 ovos galinha': '#a855f7',
  '5 ovos Galinha + 50 Codorna': '#e0b341',
};
const COR_PADRAO = '#64748b';

const RESUMO_VAZIO: DashboardResumo = {
  totalQuails: 0,
  totalChickens: 0,
  dailyQuailProduction: 0,
  dailyChickenProduction: 0,
  quailPack50Price: 0,
  chickenPack30Price: 0,
};

function calcularVendasPorProduto(vendas: Venda[]): VendaPorProduto[] {
  const porProduto = new Map<string, number>();
  for (const venda of vendas) {
    porProduto.set(venda.product, (porProduto.get(venda.product) ?? 0) + venda.total);
  }
  const totalGeral = [...porProduto.values()].reduce((soma, valor) => soma + valor, 0);

  return [...porProduto.entries()]
    .map(([name, total]) => ({
      name,
      total,
      pct: totalGeral ? Math.round((total / totalGeral) * 100) : 0,
      color: PRODUTO_CORES[name] ?? COR_PADRAO,
    }))
    .sort((a, b) => b.total - a.total);
}

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, NgApexchartsModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly ptDate = ptDate;

  private readonly salesStore = createEntityStore<Venda>(IDB_STORES.sales, []);
  private readonly productionStore = createEntityStore<ProducaoDiaria>(
    IDB_STORES.dailyProduction,
    [],
  );
  private readonly flockStore = createEntityStore<Plantel>(IDB_STORES.flock, []);
  private readonly eggStockStore = createEntityStore<EstoqueOvos>(IDB_STORES.eggStock, []);
  private readonly productsStore = createEntityStore<Product>(IDB_STORES.products, []);
  private readonly expensesStore = createEntityStore<Expense>(IDB_STORES.expenses, []);
  private readonly dashboardStore = createEntityStore<DashboardResumo>(IDB_STORES.dashboard, []);

  protected readonly resumo = computed(() => this.dashboardStore.items()[0] ?? RESUMO_VAZIO);
  protected readonly faturamento = computed(() =>
    this.salesStore.items().reduce((soma, v) => soma + v.total, 0),
  );
  protected readonly totalDespesas = computed(() =>
    this.expensesStore.items().reduce((soma, e) => soma + e.amount, 0),
  );
  // Vendas - Despesas, mesma base "total geral" já usada pelos outros cards
  // do Dashboard (o DatePicker da topbar ainda não filtra esta tela).
  protected readonly saldo = computed(() => this.faturamento() - this.totalDespesas());

  protected readonly producaoRecente = computed(() =>
    [...this.productionStore.items()].slice(-6).reverse(),
  );
  protected readonly ultimasVendas = computed(() =>
    sortRows(this.salesStore.items(), 'date', -1).slice(0, 5),
  );
  protected readonly plantel = computed(() => this.flockStore.items());
  protected readonly produtos = computed(() => this.productsStore.items());

  protected readonly totalAves = computed(
    () => this.resumo().totalQuails + this.resumo().totalChickens,
  );
  protected readonly totalSacos = computed(() =>
    this.flockStore.items().reduce((soma, p) => soma + p.feedBagsPerMonth, 0),
  );
  protected readonly investimentoRacao = computed(() =>
    this.flockStore.items().reduce((soma, p) => soma + p.monthlyTotal, 0),
  );
  protected readonly vendasPendentes = computed(
    () => this.salesStore.items().filter((v) => v.paymentPending).length,
  );

  protected readonly totalOvosColetados = computed(() =>
    this.productionStore
      .items()
      .reduce((soma, p) => soma + (p.quailEggs ?? 0) + (p.chickenEggs ?? 0), 0),
  );

  private readonly ultimoEstoque = computed(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return this.eggStockStore
      .items()
      .filter((e) => e.date <= hoje)
      .reduce<EstoqueOvos | undefined>(
        (maisRecente, e) => (!maisRecente || e.date > maisRecente.date ? e : maisRecente),
        undefined,
      );
  });

  // Estoque de Ovos é preenchido à parte da Produção Diária — enquanto não
  // houver nenhum snapshot lá, cai pra converter a produção mais recente em
  // pacotes usando o tamanho de pacote dos próprios produtos cadastrados
  // ("50 ovos de codorna" / "30 ovos galinha"), em vez de ficar sempre 0.
  private readonly ultimaProducao = computed(() => {
    const hoje = new Date().toISOString().slice(0, 10);
    return this.productionStore
      .items()
      .filter((p) => p.date <= hoje)
      .reduce<ProducaoDiaria | undefined>(
        (maisRecente, p) => (!maisRecente || p.date > maisRecente.date ? p : maisRecente),
        undefined,
      );
  });
  private readonly quailPackSize = computed(
    () => this.productsStore.items().find((p) => p.name === '50 ovos de codorna')?.eggsPerUnit ?? 50,
  );
  private readonly chickenPackSize = computed(
    () => this.productsStore.items().find((p) => p.name === '30 ovos galinha')?.eggsPerUnit ?? 30,
  );

  protected readonly bandejasProntas = computed(() => {
    const estoque = this.ultimoEstoque();
    if (estoque) return Math.floor(estoque.quailPacks + estoque.chickenPacks);

    const producao = this.ultimaProducao();
    if (!producao) return 0;
    return (
      Math.floor((producao.quailEggs ?? 0) / this.quailPackSize()) +
      Math.floor((producao.chickenEggs ?? 0) / this.chickenPackSize())
    );
  });
  protected readonly ovosCodornaEstoque = computed(() => this.ultimoEstoque()?.quailEggs ?? 0);
  protected readonly ovosGalinhaEstoque = computed(() => this.ultimoEstoque()?.chickenEggs ?? 0);

  protected readonly totalOvosVendidos = computed(() =>
    this.salesStore.items().reduce((soma, venda) => {
      const produto = this.productsStore.items().find((p) => p.name === venda.product);
      return soma + (produto?.eggsPerUnit ?? 0) * venda.quantity;
    }, 0),
  );
  protected readonly ticketMedio = computed(() => {
    const vendas = this.salesStore.items();
    return vendas.length ? this.faturamento() / vendas.length : 0;
  });
  protected readonly clientesAtendidos = computed(
    () => new Set(this.salesStore.items().map((v) => v.buyer)).size,
  );

  protected readonly vendasPorProduto = computed(() =>
    calcularVendasPorProduto(this.salesStore.items()),
  );

  protected readonly donutChart = computed<DonutChartOptions>(() => {
    const vendasPorProduto = this.vendasPorProduto();
    return {
      series: vendasPorProduto.map((v) => v.total),
      chart: { type: 'donut', height: 230 },
      labels: vendasPorProduto.map((v) => v.name),
      colors: vendasPorProduto.map((v) => v.color),
      stroke: { width: 0 },
      dataLabels: { enabled: false },
      legend: { show: false },
      tooltip: { y: { formatter: (val: number) => brl(val) } },
      plotOptions: { pie: { donut: { size: '72%' } } },
      fill: { type: 'solid' },
    };
  });
}
