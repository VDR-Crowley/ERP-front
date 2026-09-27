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
import { DashboardResumo } from '@core/interfaces/dashboard.interface';
import { createEntityStore } from '@core/idb/entity-store';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { createSalesStore } from '@core/api/adapters/sales.adapter';
import { createDailyProductionsStore } from '@core/api/adapters/daily-productions.adapter';
import { createFlockStore } from '@core/api/adapters/flock.adapter';
import { createProductsStore } from '@core/api/adapters/products.adapter';
import { createVendorStockStore } from '@core/api/adapters/vendor-stock.adapter';
import { createBarnStockStore } from '@core/api/adapters/barn-stock.adapter';
import { createExpensesStore } from '@core/api/adapters/expenses.adapter';
import { createFlockIncubationsStore } from '@core/api/adapters/flock-incubations.adapter';
import { createFeedStockStore } from '@core/api/adapters/feed-stocks.adapter';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { brl, num, ptDate } from '@core/utils/format';
import { daysUntil, todayLocalISO, toLocalISO } from '@core/utils/date-diff';
import { totalStockValue, totalStockAllLocations } from '@core/utils/stock-location';
import { sortRows } from '@shared/table-sort/table-sort';
import { CalendarDay, calendarMonthGrid, endOfMonth, isWholeMonth, startOfMonth } from '@core/utils/calendar-month';
import { calcularEstatisticasVendasPorDia, heatmapTier, isDiaFuturo, totalVendasPorDia } from '@core/utils/sales-by-day';

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
  private readonly productsStore = createProductsStore();
  private readonly vendorStockStore = createVendorStockStore();
  private readonly barnStockStore = createBarnStockStore();
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
  // (bandejasProntasCodorna/bandejasProntasGalinha/valorEstoque), que lêem
  // Product.stock direto: saldo atual (snapshot), não soma de período, e
  // continuam intencionalmente fora do filtro (ver comentário em
  // bandejasProntasCodorna).
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
    sortRows(this.salesStore.items(), 'date', -1).slice(0, 20),
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
  // Ovos COLETADOS (produção bruta em daily_productions), não ovos VENDIDOS.
  // Card "Produção coletada" mostra este número; ele é sempre >= totalOvosVendidos
  // (nem todo ovo coletado no período já virou venda). Bug relatado: usuário
  // comparava este card com "Ovos vendidos" de Relatórios (mesmo formato de
  // totalOvosVendidos abaixo) achando que eram a mesma métrica — não são.
  protected readonly producaoHojeTotal = computed(
    () => this.totalOvosColetadosCodorna() + this.totalOvosColetadosGalinha(),
  );

  // Fonte única com Produtos/Transferência de Estoque: `product.stock` puro
  // (mesmo campo editado em Produtos e movimentado em Transferência de
  // Estoque — ver stock-transfers.ts, `quantity: p.stock` sem dividir por
  // eggsPerUnit). stock já é bandeja/pacote, não ovo cru. Antes esse card
  // calculava a partir da ÚLTIMA linha de daily_productions ÷ eggsPerUnit —
  // produção bruta, nunca descontava venda/transferência, desconectada do
  // estoque real (mesmo motivo da reversão do módulo Estoque de Ovos, ver
  // comentário de valorEstoque abaixo). Decisão do usuário: "tudo que é de
  // estoque, puxa de Produtos" — daily_productions não entra mais aqui.
  // "Prontas para venda" = estoque LÍQUIDO somando TODOS os locais (Plantel +
  // galpões + vendedores), não só `product.stock` (Plantel). Ex.: Plantel 20 e
  // Karol -5 (vendeu, falta entregar) => 15 prontas. Antes lia só product.stock
  // (dava 0 com estoque no galpão) e a galinha buscava "30 ovos galinha", nome
  // que não existe — o produto é "1 Bandeja de ovos de galinha".
  private prontasDoProduto(nome: string): number {
    const p = this.productsStore.items().find((item) => item.name === nome);
    if (!p) return 0;
    return totalStockAllLocations(
      p.stock,
      this.vendorStockStore.items(),
      p.name,
      this.barnStockStore.items(),
    );
  }
  protected readonly bandejasProntasCodorna = computed(() =>
    this.prontasDoProduto('50 ovos de codorna'),
  );
  protected readonly bandejasProntasGalinha = computed(() =>
    this.prontasDoProduto('1 Bandeja de ovos de galinha'),
  );
  protected readonly prontasParaVendaTotal = computed(
    () => this.bandejasProntasCodorna() + this.bandejasProntasGalinha(),
  );

  // Fonte única com Produtos/Transferência de Estoque — mesma função
  // totalStockValue() (preço cadastrado em Produtos × Plantel + todos os
  // vendedores, pros 5 produtos, não só os 2 ligados a ovo). Antes esse card
  // usava valorEstoqueCodorna/Galinha calculado a partir do módulo Estoque
  // de Ovos (packs × preço, removido), cobrindo só 2 produtos e divergindo
  // do total real da granja — bug relatado pelo Ytallo.
  protected readonly valorEstoque = computed(() =>
    totalStockValue(this.productsStore.items(), this.vendorStockStore.items(), this.barnStockStore.items()),
  );

  // Mesma fórmula de resumo().eggsSold em Relatórios (produto.eggsPerUnit × quantidade,
  // somado sobre as vendas do período) — deve bater com "Ovos vendidos" lá. Ver
  // comentário de producaoHojeTotal acima pra distinção com ovos coletados.
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

  protected readonly diasSemana = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

  // Card "Vendas por dia" mostra sempre 1 mês inteiro, igual ao MonthTabs da
  // topbar: mês selecionado quando o filtro corrente for exatamente um mês
  // cheio, senão o mês corrente real (cobre tanto "Tudo" quanto um intervalo
  // arbitrário do DatePicker que não seja um mês fechado).
  protected readonly mesExibidoCalendario = computed(() => {
    const active = this.periodFilter.active();
    const [start, end] = this.periodFilter.range();
    if (active && isWholeMonth(start, end)) return start;
    return new Date();
  });

  protected readonly mesExibidoLabel = computed(() => {
    const label = this.mesExibidoCalendario().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });
    return label.charAt(0).toUpperCase() + label.slice(1);
  });

  protected readonly calendarioVendas = computed<(CalendarDay | null)[]>(() =>
    calendarMonthGrid(this.mesExibidoCalendario()),
  );

  // Vendas do mês exibido no calendário — não usa `vendasNoPeriodo()`/`periodFilter.includes`
  // de propósito: o card sempre mostra o mês inteiro (ver `mesExibidoCalendario`), mesmo que o
  // filtro ativo seja um intervalo customizado menor que o mês.
  private readonly vendasDoMesCalendario = computed(() => {
    const mes = this.mesExibidoCalendario();
    const inicio = toLocalISO(startOfMonth(mes));
    const fim = toLocalISO(endOfMonth(mes));
    return this.salesStore.items().filter((v) => {
      const dia = v.date.slice(0, 10);
      return dia >= inicio && dia <= fim;
    });
  });

  protected readonly vendasPorDiaMapa = computed(() => totalVendasPorDia(this.vendasDoMesCalendario()));

  // Estatísticas (e o teto do heatmap) só sobre dias já passados — ver
  // comentário de `calcularEstatisticasVendasPorDia`. Dia futuro nunca teve
  // chance de vender nada, então nem entra como candidato a "maior dia".
  protected readonly estatisticasVendasPorDia = computed(() =>
    calcularEstatisticasVendasPorDia(this.calendarioVendas(), this.vendasPorDiaMapa(), todayLocalISO()),
  );

  protected readonly maiorVendaDoMes = computed(() => this.estatisticasVendasPorDia().maiorDia?.total ?? 0);

  protected valorVendasDia(date: string): number {
    return this.vendasPorDiaMapa().get(date) ?? 0;
  }

  protected tierVendasDia(date: string): 0 | 1 | 2 | 3 | 4 {
    return heatmapTier(this.valorVendasDia(date), this.maiorVendaDoMes());
  }

  // Dia depois de hoje: nunca teve chance de ter venda — célula mostra só o
  // número, sem sombreado nem valor, visualmente distinta de um dia já
  // passado com R$0,00 real (esse sim conta em "Dias sem venda"). Bug
  // relatado: calendário sombreava/contava dias futuros como se já tivessem
  // dado zero vendas.
  protected diaEhFuturo(date: string): boolean {
    return isDiaFuturo(date, todayLocalISO());
  }
}
