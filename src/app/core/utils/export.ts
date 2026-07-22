import * as XLSX from 'xlsx';
import { firstValueFrom } from 'rxjs';
import { Venda } from '@core/interfaces/venda.interface';
import { ProducaoDiaria } from '@core/interfaces/producao-diaria.interface';
import { EstoqueOvos } from '@core/interfaces/estoque-ovos.interface';
import { Plantel } from '@core/interfaces/plantel.interface';
import { NovoLotePlantel, Species } from '@core/interfaces/novo-lote-plantel.interface';
import { FeedStock, FeedOpenLog } from '@core/interfaces/feed-stock.interface';
import { FlockCleaning } from '@core/interfaces/flock-cleaning.interface';
import { Product } from '@core/interfaces/product.interface';
import { Expense } from '@core/interfaces/expense.interface';
import { CashEntry } from '@core/interfaces/cash-entry.interface';
import { DashboardResumo } from '@core/interfaces/dashboard.interface';
import { User } from '@core/interfaces/user.interface';
import { ptDate } from '@core/utils/format';
import { IndexedDbService } from '@core/idb/idb.service';
import { IDB_STORES } from '@core/idb/idb-seed.service';

const DASHBOARD_VAZIO: DashboardResumo = {
  totalQuails: 0,
  totalChickens: 0,
  dailyQuailProduction: 0,
  dailyChickenProduction: 0,
  quailPack50Price: 0,
  chickenPack30Price: 0,
};

/** Exporta os dados reais do IndexedDB (mesma fonte que as telas leem) para um único arquivo .xlsx com uma aba por entidade. */
export async function exportWorkbook(filename: string, idb: IndexedDbService): Promise<void> {
  const [
    vendas,
    producao,
    estoque,
    plantel,
    produtos,
    despesas,
    fluxoCaixa,
    dashboardRows,
    users,
    novoLotePlantel,
    feedStock,
    feedOpenLog,
    flockCleaning,
  ] = await Promise.all([
    firstValueFrom(idb.getAll<Venda>(IDB_STORES.sales)),
    firstValueFrom(idb.getAll<ProducaoDiaria>(IDB_STORES.dailyProduction)),
    firstValueFrom(idb.getAll<EstoqueOvos>(IDB_STORES.eggStock)),
    firstValueFrom(idb.getAll<Plantel>(IDB_STORES.flock)),
    firstValueFrom(idb.getAll<Product>(IDB_STORES.products)),
    firstValueFrom(idb.getAll<Expense>(IDB_STORES.expenses)),
    firstValueFrom(idb.getAll<CashEntry>(IDB_STORES.cashFlow)),
    firstValueFrom(idb.getAll<DashboardResumo>(IDB_STORES.dashboard)),
    firstValueFrom(idb.getAll<User>(IDB_STORES.users)),
    firstValueFrom(idb.getAll<NovoLotePlantel>(IDB_STORES.flockIncubation)),
    firstValueFrom(idb.getAll<FeedStock>(IDB_STORES.feedStock)),
    firstValueFrom(idb.getAll<FeedOpenLog>(IDB_STORES.feedOpenLog)),
    firstValueFrom(idb.getAll<FlockCleaning>(IDB_STORES.flockCleaning)),
  ]);
  const dashboard = dashboardRows[0] ?? DASHBOARD_VAZIO;

  const wb = XLSX.utils.book_new();

  // `header` explícito em todo json_to_sheet abaixo: sem ele, uma lista vazia
  // (conta nova, categoria ainda sem nenhum registro) gera aba sem nem a
  // linha de cabeçalho — reimportar esse .xlsx falhava com "coluna(s)
  // faltando" pra qualquer aba que estivesse zerada no momento do export.
  const vendasHeader = [
    'Data',
    'Produto',
    'Quantidade',
    'Preço Unitário',
    'Total',
    'Status Pagamento',
    'Comprador',
    'Vendedor',
    'Status da entrega',
    'Data da Entrega',
  ];
  const vendasSheet = XLSX.utils.json_to_sheet(
    vendas.map((v) => ({
      Data: ptDate(v.date),
      Produto: v.product,
      Quantidade: v.quantity,
      'Preço Unitário': v.unitPrice,
      Total: v.total,
      'Status Pagamento': v.paymentPending ? 'F' : 'PAGO',
      Comprador: v.buyer,
      Vendedor: v.seller,
      'Status da entrega': v.deliveryPending ? 'FALTA' : 'ENTREGUE',
      'Data da Entrega': v.deliveryDate ? ptDate(v.deliveryDate) : '',
    })),
    { header: vendasHeader },
  );
  XLSX.utils.book_append_sheet(wb, vendasSheet, 'Vendas');

  const producaoHeader = ['Data', 'Ovos Codorna', 'Ovos Galinha'];
  const producaoSheet = XLSX.utils.json_to_sheet(
    producao.map((p) => ({
      Data: ptDate(p.date),
      'Ovos Codorna': p.quailEggs ?? '',
      'Ovos Galinha': p.chickenEggs ?? '',
    })),
    { header: producaoHeader },
  );
  XLSX.utils.book_append_sheet(wb, producaoSheet, 'Produção');

  const estoqueHeader = [
    'Data',
    'Ovos Codorna',
    'Ovos Galinha',
    'Pack Codorna',
    'Pack Galinha',
    'Valor Estoque Codorna',
    'Valor Estoque Galinha',
  ];
  const estoqueSheet = XLSX.utils.json_to_sheet(
    estoque.map((e) => ({
      Data: ptDate(e.date),
      'Ovos Codorna': e.quailEggs ?? '',
      'Ovos Galinha': e.chickenEggs ?? '',
      'Pack Codorna': e.quailPacks,
      'Pack Galinha': e.chickenPacks,
      'Valor Estoque Codorna': e.quailStockValue,
      'Valor Estoque Galinha': e.chickenStockValue,
    })),
    { header: estoqueHeader },
  );
  XLSX.utils.book_append_sheet(wb, estoqueSheet, 'Estoque de Ovos');

  const plantelHeader = ['Espécie', 'Quantidade', 'Sacos Ração/Mês', 'Preço Saco', 'Total Mês'];
  const plantelSheet = XLSX.utils.json_to_sheet(
    plantel.map((p) => ({
      Espécie: p.species,
      Quantidade: p.quantity,
      'Sacos Ração/Mês': p.feedBagsPerMonth,
      'Preço Saco': p.bagPrice,
      'Total Mês': p.monthlyTotal,
    })),
    { header: plantelHeader },
  );
  XLSX.utils.book_append_sheet(wb, plantelSheet, 'Plantel');

  const produtosHeader = ['Produto', 'Unidade', 'Preço Unitário', 'Estoque', 'Ovos por Unidade'];
  const produtosSheet = XLSX.utils.json_to_sheet(
    produtos.map((p) => ({
      Produto: p.name,
      Unidade: p.unit,
      'Preço Unitário': p.unitPrice,
      Estoque: p.stock,
      'Ovos por Unidade': p.eggsPerUnit,
    })),
    { header: produtosHeader },
  );
  XLSX.utils.book_append_sheet(wb, produtosSheet, 'Produtos');

  const despesasHeader = ['Data', 'Descrição', 'Categoria', 'Qtd.', 'Valor unit.', 'Valor', 'Pago'];
  const despesasSheet = XLSX.utils.json_to_sheet(
    despesas.map((e) => ({
      Data: ptDate(e.date),
      Descrição: e.description,
      Categoria: e.category,
      'Qtd.': e.quantity ?? '',
      'Valor unit.': e.unitPrice ?? '',
      Valor: e.amount,
      Pago: e.paid ? 'Sim' : 'Não',
    })),
    { header: despesasHeader },
  );
  XLSX.utils.book_append_sheet(wb, despesasSheet, 'Despesas');

  const fluxoCaixaHeader = ['Data', 'Descrição', 'Tipo', 'Valor'];
  const fluxoCaixaSheet = XLSX.utils.json_to_sheet(
    fluxoCaixa.map((c) => ({
      Data: ptDate(c.date),
      Descrição: c.description,
      Tipo: c.inflow ? 'Entrada' : 'Saída',
      Valor: c.amount,
    })),
    { header: fluxoCaixaHeader },
  );
  XLSX.utils.book_append_sheet(wb, fluxoCaixaSheet, 'Fluxo de Caixa');

  const dashboardSheet = XLSX.utils.json_to_sheet([
    { Indicador: 'Total de codornas', Valor: dashboard.totalQuails },
    { Indicador: 'Total de galinhas', Valor: dashboard.totalChickens },
    { Indicador: 'Produção diária codornas', Valor: dashboard.dailyQuailProduction },
    { Indicador: 'Produção diária galinhas', Valor: dashboard.dailyChickenProduction },
    { Indicador: 'Preço pack 50 ovos codorna', Valor: dashboard.quailPack50Price },
    { Indicador: 'Preço pack 30 ovos galinha', Valor: dashboard.chickenPack30Price },
  ]);
  XLSX.utils.book_append_sheet(wb, dashboardSheet, 'Dashboard');

  const usuariosHeader = ['Nome', 'E-mail', 'Senha', 'Telefone'];
  const usuariosSheet = XLSX.utils.json_to_sheet(
    users.map((u) => ({
      Nome: u.name,
      'E-mail': u.email,
      Senha: u.password,
      Telefone: u.phone ?? '',
    })),
    { header: usuariosHeader },
  );
  XLSX.utils.book_append_sheet(wb, usuariosSheet, 'Usuários');

  const speciesLabel = (s: Species) => (s === 'quail' ? 'Codorna' : 'Galinha');
  const novoLotePlantelHeader = [
    'Data Incubadora',
    'Espécie',
    'Qtd. Ovos',
    'Eclosão Prevista',
    'Data Eclosão',
    'Qtd. Nascida',
    'Status',
    'Custo Ovos',
    'Custo Ração',
    'Observações',
  ];
  const novoLotePlantelSheet = XLSX.utils.json_to_sheet(
    novoLotePlantel.map((n) => ({
      'Data Incubadora': ptDate(n.startDate),
      Espécie: speciesLabel(n.species),
      'Qtd. Ovos': n.eggCount,
      'Eclosão Prevista': ptDate(n.expectedHatchDate),
      'Data Eclosão': n.actualHatchDate ? ptDate(n.actualHatchDate) : '',
      'Qtd. Nascida': n.hatchedCount ?? '',
      Status: n.status,
      'Custo Ovos': n.eggCost ?? '',
      'Custo Ração': n.feedCost ?? '',
      Observações: n.notes ?? '',
    })),
    { header: novoLotePlantelHeader },
  );
  XLSX.utils.book_append_sheet(wb, novoLotePlantelSheet, 'Novo Plantel');

  const racaoHeader = ['Tipo', 'Sacos em Estoque', 'Kg em Estoque', 'Peso do Saco', 'Validade'];
  const racaoSheet = XLSX.utils.json_to_sheet(
    feedStock.map((f) => ({
      Tipo: f.type,
      'Sacos em Estoque': f.bagsInStock,
      'Kg em Estoque': f.kgInStock,
      'Peso do Saco': f.lastBagWeightKg,
      Validade: f.expirationDate ? ptDate(f.expirationDate) : '',
    })),
    { header: racaoHeader },
  );
  XLSX.utils.book_append_sheet(wb, racaoSheet, 'Ração');

  const racaoAbertosHeader = ['Data', 'Tipo', 'Peso Aberto (kg)'];
  const racaoAbertosSheet = XLSX.utils.json_to_sheet(
    [...feedOpenLog]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((l) => ({
        Data: ptDate(l.date),
        Tipo: l.feedType,
        'Peso Aberto (kg)': l.weightKg,
      })),
    { header: racaoAbertosHeader },
  );
  XLSX.utils.book_append_sheet(wb, racaoAbertosSheet, 'Ração - Sacos Abertos');

  const cleaningTypeLabel: Record<FlockCleaning['cleaningType'], string> = {
    total: 'Total',
    feeder: 'Bebedouro',
    tray: 'Bandeja',
    nest: 'Ninho',
  };
  const higienizacaoHeader = ['Data', 'Espécie', 'Tipo', 'Observações'];
  const higienizacaoSheet = XLSX.utils.json_to_sheet(
    [...flockCleaning]
      .sort((a, b) => b.date.localeCompare(a.date))
      .map((h) => ({
        Data: ptDate(h.date),
        Espécie: speciesLabel(h.species),
        Tipo: cleaningTypeLabel[h.cleaningType],
        Observações: h.notes ?? '',
      })),
    { header: higienizacaoHeader },
  );
  XLSX.utils.book_append_sheet(wb, higienizacaoSheet, 'Higienização');

  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
