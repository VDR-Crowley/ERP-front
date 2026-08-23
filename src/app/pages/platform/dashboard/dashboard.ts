import { Component, computed, inject } from '@angular/core';
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
import { VendorStock } from '@core/interfaces/vendor-stock.interface';
import { Expense } from '@core/interfaces/expense.interface';
import { DashboardResumo } from '@core/interfaces/dashboard.interface';
import { NovoLotePlantel } from '@core/interfaces/novo-lote-plantel.interface';
import { FeedStock } from '@core/interfaces/feed-stock.interface';
import { createEntityStore } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { createSalesStore } from '@core/api/adapters/sales.adapter';
import { createDailyProductionsStore } from '@core/api/adapters/daily-productions.adapter';
import { createFlockStore } from '@core/api/adapters/flock.adapter';
import { createEggStocksStore } from '@core/api/adapters/egg-stocks.adapter';
import { createProductsStore } from '@core/api/adapters/products.adapter';
import { createVendorStockStore } from '@core/api/adapters/vendor-stock.adapter';
import { createExpensesStore } from '@core/api/adapters/expenses.adapter';
import { createFlockIncubationsStore } from '@core/api/adapters/flock-incubations.adapter';
import { createFeedStockStore } from '@core/api/adapters/feed-stocks.adapter';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { brl, num, ptDate } from '@core/utils/format';
import { latestByDate } from '@core/utils/latest-by-date';
import { daysUntil } from '@core/utils/date-diff';
import { totalStockValue } from '@core/utils/stock-location';
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

/** Mesmo limite usado em Controle de Ração (feed-stock.interface / controle-racao.ts). */
const ESTOQUE_RACAO_BAIXO_LIMITE = 1;

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

  private readonly salesStore = createSalesStore();
  private readonly productionStore = createDailyProductionsStore();
  private readonly flockStore = createFlockStore();
  private readonly eggStockStore = createEggStocksStore();
  private readonly productsStore = createProductsStore();
  private readonly vendorStockStore = createVendorStockStore();
  private readonly expensesStore = createExpensesStore();
  // `dashboard` não é entidade persistida no backend (ver plano-entidades.md) — nunca foi
  // escrito nem pelo antigo store do IndexedDB, `resumo` sempre cai no fallback `RESUMO_VAZIO`.
  // Mantido como estava (IDB inerte) só pra não quebrar a leitura abaixo.
  private readonly dashboardStore = createEntityStore<DashboardResumo>(IDB_STORES.dashboard, []);
  private readonly flockIncubationStore = createFlockIncubationsStore();
  private readonly feedStockStore = createFeedStockStore();
  private readonly periodFilter = inject(PeriodFilterService);

  protected readonly resumo = computed(() => this.dashboardStore.items()[0] ?? RESUMO_VAZIO);

  // Cards de produção/vendas/saldo respeitam o período selecionado no
  // DatePicker/chips da topbar — diferente dos cards de estoque
  // (ovosCodornaEstoque/ovosGalinhaEstoque/bandejasProntasCodorna/
  // bandejasProntasGalinha/valorEstoque), que são saldo atual (não soma de
  // período) e continuam intencionalmente fora do filtro (ver comentário em
  // ultimoQuailEstoque/ultimaProducao).
  protected readonly producaoNoPeriodo = computed(() =>
    this.productionStore.items().filter((p) => this.periodFilter.includes(p.date)),
  );
  protected readonly vendasNoPeriodo = computed(() =>
    this.salesStore.items().filter((v) => this.periodFilter.includes(v.date)),
  );
  protected readonly despesasNoPeriodo = computed(() =>
    this.expensesStore.items().filter((e) => this.periodFilter.includes(e.date)),
  );

  protected readonly faturamento = computed(() =>
    this.vendasNoPeriodo().reduce((soma, v) => soma + v.total, 0),
  );
  protected readonly totalDespesas = computed(() =>
    this.despesasNoPeriodo().reduce((soma, e) => soma + e.amount, 0),
  );
  protected readonly saldo = computed(() => this.faturamento() - this.totalDespesas());

  // IndexedDB getAll() retorna na ordem da keyPath (id, um uuid aleatório),
  // não por data nem por ordem de inserção — .slice(-6) sem ordenar pegava
  // 6 linhas arbitrárias, não os 6 dias mais recentes. Ordena por data (desc)
  // antes de cortar, mesmo padrão já usado em ultimasVendas. Ignora linhas
  // "molde" (dias futuros do template ainda sem lançamento, com os dois
  // campos em branco) — senão as 10 mais recentes por data eram só linhas
  // vazias. Mostra as últimas 10 com produção de verdade, não 6.
  protected readonly producaoRecente = computed(() =>
    sortRows(
      this.productionStore.items().filter((p) => p.quailEggs !== null || p.chickenEggs !== null),
      'date',
      -1,
    ).slice(0, 10),
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
    () => this.vendasNoPeriodo().filter((v) => v.paymentPending).length,
  );

  protected readonly tiposRacaoBaixa = computed(
    () => this.feedStockStore.items().filter((f) => f.bagsInStock <= ESTOQUE_RACAO_BAIXO_LIMITE).length,
  );
  protected readonly tiposRacaoBaixaNomes = computed(() =>
    this.feedStockStore
      .items()
      .filter((f) => f.bagsInStock <= ESTOQUE_RACAO_BAIXO_LIMITE)
      .map((f) => f.type),
  );

  protected readonly lotesIncubando = computed(
    () => this.flockIncubationStore.items().filter((i) => i.status === 'incubando').length,
  );
  protected readonly lotesIncubandoPorEspecie = computed(() => {
    const incubando = this.flockIncubationStore.items().filter((i) => i.status === 'incubando');
    return {
      quail: incubando.filter((i) => i.species === 'quail').length,
      chicken: incubando.filter((i) => i.species === 'chicken').length,
    };
  });
  private readonly proximaEclosao = computed(() => {
    const pendentes = this.flockIncubationStore.items().filter((i) => i.status === 'incubando');
    return pendentes.length ? sortRows(pendentes, 'expectedHatchDate', 1)[0] : null;
  });
  protected readonly proximaEclosaoData = computed(() => this.proximaEclosao()?.expectedHatchDate ?? null);
  protected readonly diasProximaEclosao = computed(() => {
    const p = this.proximaEclosao();
    return p ? daysUntil(p.expectedHatchDate) : null;
  });

  protected readonly totalOvosColetadosCodorna = computed(() =>
    this.producaoNoPeriodo().reduce((soma, p) => soma + (p.quailEggs ?? 0), 0),
  );
  protected readonly totalOvosColetadosGalinha = computed(() =>
    this.producaoNoPeriodo().reduce((soma, p) => soma + (p.chickenEggs ?? 0), 0),
  );
  protected readonly producaoHojeTotal = computed(
    () => this.totalOvosColetadosCodorna() + this.totalOvosColetadosGalinha(),
  );

  // Usa sempre a linha mais recente por data (não restringe a "<= hoje") —
  // um snapshot com data futura por erro de digitação não pode esconder o
  // estoque real e zerar os cards. Ver latestByDate. Codorna e galinha são
  // calculadas SEPARADAMENTE: cada uma pega sua própria data mais recente
  // com o próprio campo preenchido, ignorando linhas onde só o campo dela
  // está em branco — mesma correção aplicada em egg-stock.ts. Antes as duas
  // compartilhavam uma única "linha mais recente geral", então um
  // lançamento recente preenchendo só uma espécie zerava a outra mesmo
  // tendo estoque real disponível.
  private readonly ultimoQuailEstoque = computed(() =>
    latestByDate(this.eggStockStore.items().filter((e) => e.quailEggs !== null)),
  );
  private readonly ultimoChickenEstoque = computed(() =>
    latestByDate(this.eggStockStore.items().filter((e) => e.chickenEggs !== null)),
  );

  // Estoque de Ovos é preenchido à parte da Produção Diária — enquanto não
  // houver nenhum snapshot lá, cai pra converter a produção mais recente em
  // pacotes usando o tamanho de pacote dos próprios produtos cadastrados
  // ("50 ovos de codorna" / "30 ovos galinha"), em vez de ficar sempre 0.
  private readonly ultimaProducao = computed(() =>
    latestByDate(this.productionStore.items().filter((p) => p.quailEggs !== null || p.chickenEggs !== null)),
  );
  private readonly quailPackSize = computed(
    () => this.productsStore.items().find((p) => p.name === '50 ovos de codorna')?.eggsPerUnit ?? 50,
  );
  private readonly chickenPackSize = computed(
    () => this.productsStore.items().find((p) => p.name === '30 ovos galinha')?.eggsPerUnit ?? 30,
  );
  private readonly quailPackPrice = computed(
    () => this.productsStore.items().find((p) => p.name === '50 ovos de codorna')?.unitPrice ?? 15,
  );
  private readonly chickenPackPrice = computed(
    () =>
      this.productsStore.items().find((p) => p.name === '1 Bandeja de ovos de galinha')?.unitPrice ?? 20,
  );

  // Cada espécie soma seu próprio "prontas" independente: pega o pack de
  // Estoque de Ovos da própria espécie quando existe (arredondado pra baixo
  // pra unidade — não dá pra vender 0,6 de um pack), e só cai pra converter
  // a Produção Diária daquela espécie se ela nunca teve snapshot em Estoque
  // de Ovos. Cards separados por espécie (não somados) — ver mesma separação
  // já aplicada em ovosCodornaEstoque/ovosGalinhaEstoque.
  protected readonly bandejasProntasCodorna = computed(() => {
    const quailEstoque = this.ultimoQuailEstoque();
    const quailPacks = quailEstoque
      ? quailEstoque.quailPacks
      : (this.ultimaProducao()?.quailEggs ?? 0) / this.quailPackSize();
    return Math.floor(quailPacks);
  });
  protected readonly bandejasProntasGalinha = computed(() => {
    const chickenEstoque = this.ultimoChickenEstoque();
    const chickenPacks = chickenEstoque
      ? chickenEstoque.chickenPacks
      : (this.ultimaProducao()?.chickenEggs ?? 0) / this.chickenPackSize();
    return Math.floor(chickenPacks);
  });
  protected readonly prontasParaVendaTotal = computed(
    () => this.bandejasProntasCodorna() + this.bandejasProntasGalinha(),
  );
  protected readonly ovosCodornaEstoque = computed(() => this.ultimoQuailEstoque()?.quailEggs ?? 0);
  protected readonly ovosGalinhaEstoque = computed(() => this.ultimoChickenEstoque()?.chickenEggs ?? 0);

  // Fonte única com Produtos/Transferência de Estoque — mesma função
  // totalStockValue() (preço cadastrado em Produtos × Plantel + todos os
  // vendedores, pros 5 produtos, não só os 2 ligados a ovo). Antes esse card
  // usava valorEstoqueCodorna/Galinha calculado a partir do Estoque de Ovos
  // (packs × preço), cobrindo só 2 produtos e divergindo do total real da
  // granja — bug relatado pelo Ytallo.
  protected readonly valorEstoque = computed(() =>
    totalStockValue(this.productsStore.items(), this.vendorStockStore.items()),
  );

  protected readonly totalOvosVendidos = computed(() =>
    this.vendasNoPeriodo().reduce((soma, venda) => {
      const produto = this.productsStore.items().find((p) => p.name === venda.product);
      return soma + (produto?.eggsPerUnit ?? 0) * venda.quantity;
    }, 0),
  );
  protected readonly ticketMedio = computed(() => {
    const vendas = this.vendasNoPeriodo();
    return vendas.length ? this.faturamento() / vendas.length : 0;
  });
  protected readonly clientesAtendidos = computed(
    () => new Set(this.vendasNoPeriodo().map((v) => v.buyer)).size,
  );

  protected readonly vendasPorProduto = computed(() =>
    calcularVendasPorProduto(this.vendasNoPeriodo()),
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
