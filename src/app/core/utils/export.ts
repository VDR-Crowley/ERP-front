import * as XLSX from 'xlsx';
import { firstValueFrom } from 'rxjs';
import { VENDAS_MOCK } from '@core/mocks/venda.mock';
import { PRODUCAO_DIARIA_MOCK } from '@core/mocks/producao-diaria.mock';
import { ESTOQUE_OVOS_MOCK } from '@core/mocks/estoque-ovos.mock';
import { PLANTEL_MOCK } from '@core/mocks/plantel.mock';
import { PRODUCTS_MOCK } from '@core/mocks/product.mock';
import { EXPENSES_MOCK } from '@core/mocks/expense.mock';
import { CASHFLOW_MOCK } from '@core/mocks/cash-entry.mock';
import { DASHBOARD_MOCK } from '@core/mocks/dashboard.mock';
import { ptDate } from '@core/utils/format';
import { IndexedDbService } from '@core/idb/idb.service';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { User } from '@core/interfaces/user.interface';

/** Exporta todos os dados do app para um único arquivo .xlsx com uma aba por entidade. */
export async function exportWorkbook(filename: string, idb: IndexedDbService): Promise<void> {
  const wb = XLSX.utils.book_new();

  const vendasSheet = XLSX.utils.json_to_sheet(
    VENDAS_MOCK.map((v) => ({
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
  );
  XLSX.utils.book_append_sheet(wb, vendasSheet, 'Vendas');

  const producaoSheet = XLSX.utils.json_to_sheet(
    PRODUCAO_DIARIA_MOCK.map((p) => ({
      Data: ptDate(p.date),
      'Ovos Codorna': p.quailEggs ?? '',
      'Ovos Galinha': p.chickenEggs ?? '',
    })),
  );
  XLSX.utils.book_append_sheet(wb, producaoSheet, 'Produção');

  const estoqueSheet = XLSX.utils.json_to_sheet(
    ESTOQUE_OVOS_MOCK.map((e) => ({
      Data: ptDate(e.date),
      'Ovos Codorna': e.quailEggs ?? '',
      'Ovos Galinha': e.chickenEggs ?? '',
      'Pack Codorna': e.quailPacks,
      'Pack Galinha': e.chickenPacks,
      'Valor Estoque Codorna': e.quailStockValue,
      'Valor Estoque Galinha': e.chickenStockValue,
    })),
  );
  XLSX.utils.book_append_sheet(wb, estoqueSheet, 'Estoque de Ovos');

  const plantelSheet = XLSX.utils.json_to_sheet(
    PLANTEL_MOCK.map((p) => ({
      Espécie: p.species,
      Quantidade: p.quantity,
      'Sacos Ração/Mês': p.feedBagsPerMonth,
      'Preço Saco': p.bagPrice,
      'Total Mês': p.monthlyTotal,
    })),
  );
  XLSX.utils.book_append_sheet(wb, plantelSheet, 'Plantel');

  const produtosSheet = XLSX.utils.json_to_sheet(
    PRODUCTS_MOCK.map((p) => ({
      Produto: p.name,
      Unidade: p.unit,
      'Preço Unitário': p.unitPrice,
      Estoque: p.stock,
      'Ovos por Unidade': p.eggsPerUnit,
    })),
  );
  XLSX.utils.book_append_sheet(wb, produtosSheet, 'Produtos');

  const despesasSheet = XLSX.utils.json_to_sheet(
    EXPENSES_MOCK.map((e) => ({
      Data: ptDate(e.date),
      Descrição: e.description,
      Categoria: e.category,
      Valor: e.amount,
      Pago: e.paid ? 'Sim' : 'Não',
    })),
  );
  XLSX.utils.book_append_sheet(wb, despesasSheet, 'Despesas');

  const fluxoCaixaSheet = XLSX.utils.json_to_sheet(
    CASHFLOW_MOCK.map((c) => ({
      Data: ptDate(c.date),
      Descrição: c.description,
      Tipo: c.inflow ? 'Entrada' : 'Saída',
      Valor: c.amount,
    })),
  );
  XLSX.utils.book_append_sheet(wb, fluxoCaixaSheet, 'Fluxo de Caixa');

  const dashboardSheet = XLSX.utils.json_to_sheet([
    { Indicador: 'Total de codornas', Valor: DASHBOARD_MOCK.totalQuails },
    { Indicador: 'Total de galinhas', Valor: DASHBOARD_MOCK.totalChickens },
    { Indicador: 'Produção diária codornas', Valor: DASHBOARD_MOCK.dailyQuailProduction },
    { Indicador: 'Produção diária galinhas', Valor: DASHBOARD_MOCK.dailyChickenProduction },
    { Indicador: 'Preço pack 50 ovos codorna', Valor: DASHBOARD_MOCK.quailPack50Price },
    { Indicador: 'Preço pack 30 ovos galinha', Valor: DASHBOARD_MOCK.chickenPack30Price },
  ]);
  XLSX.utils.book_append_sheet(wb, dashboardSheet, 'Dashboard');

  const users = await firstValueFrom(idb.getAll<User>(IDB_STORES.users));
  const usuariosSheet = XLSX.utils.json_to_sheet(
    users.map((u) => ({
      Nome: u.name,
      'E-mail': u.email,
      Senha: u.password,
      Telefone: u.phone ?? '',
    })),
  );
  XLSX.utils.book_append_sheet(wb, usuariosSheet, 'Usuários');

  XLSX.writeFile(wb, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}
