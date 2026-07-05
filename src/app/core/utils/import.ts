import * as XLSX from 'xlsx';
import { Observable, firstValueFrom, forkJoin, of, switchMap } from 'rxjs';
import { IndexedDbService } from '@core/idb/idb.service';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { Venda } from '@core/interfaces/venda.interface';
import { ProducaoDiaria } from '@core/interfaces/producao-diaria.interface';
import { EstoqueOvos } from '@core/interfaces/estoque-ovos.interface';
import { Plantel } from '@core/interfaces/plantel.interface';
import { Product } from '@core/interfaces/product.interface';
import { Expense } from '@core/interfaces/expense.interface';
import { CashEntry } from '@core/interfaces/cash-entry.interface';
import { DashboardResumo } from '@core/interfaces/dashboard.interface';

export interface ImportResult {
  success: boolean;
  errors: string[];
  summary: Record<string, number>;
}

interface ParsedData {
  sales?: Venda[];
  dailyProduction?: ProducaoDiaria[];
  eggStock?: EstoqueOvos[];
  flock?: Plantel[];
  products?: Product[];
  expenses?: Expense[];
  cashFlow?: CashEntry[];
  dashboard?: DashboardResumo;
}

const SHEET_NAMES: Record<keyof ParsedData, string> = {
  sales: 'Vendas',
  dailyProduction: 'Produção',
  eggStock: 'Estoque de Ovos',
  flock: 'Plantel',
  products: 'Produtos',
  expenses: 'Despesas',
  cashFlow: 'Fluxo de Caixa',
  dashboard: 'Dashboard',
};

/** Lê e valida o arquivo; se houver qualquer erro, nenhum store é escrito. */
export async function importWorkbookFile(idb: IndexedDbService, file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch {
    return { success: false, errors: ['Arquivo inválido ou corrompido.'], summary: {} };
  }

  const errors: string[] = [];
  const data: ParsedData = {};

  const salesSheet = getSheet(workbook, SHEET_NAMES.sales);
  if (salesSheet) data.sales = parseSales(salesSheet, errors);

  const productionSheet = getSheet(workbook, SHEET_NAMES.dailyProduction);
  if (productionSheet) data.dailyProduction = parseDailyProduction(productionSheet, errors);

  const eggStockSheet = getSheet(workbook, SHEET_NAMES.eggStock);
  if (eggStockSheet) data.eggStock = parseEggStock(eggStockSheet, errors);

  const flockSheet = getSheet(workbook, SHEET_NAMES.flock);
  if (flockSheet) data.flock = parseFlock(flockSheet, errors);

  const productsSheet = getSheet(workbook, SHEET_NAMES.products);
  if (productsSheet) data.products = parseProducts(productsSheet, errors);

  const expensesSheet = getSheet(workbook, SHEET_NAMES.expenses);
  if (expensesSheet) data.expenses = parseExpenses(expensesSheet, errors);

  const cashFlowSheet = getSheet(workbook, SHEET_NAMES.cashFlow);
  if (cashFlowSheet) data.cashFlow = parseCashFlow(cashFlowSheet, errors);

  const dashboardSheet = getSheet(workbook, SHEET_NAMES.dashboard);
  if (dashboardSheet) data.dashboard = parseDashboard(dashboardSheet, errors);

  if (Object.keys(data).length === 0) {
    errors.push('Nenhuma aba reconhecida no arquivo. Baixe o modelo de exemplo pra conferir o formato.');
  }

  if (errors.length > 0) {
    return { success: false, errors, summary: {} };
  }

  await applyImport(idb, data);
  return { success: true, errors: [], summary: buildSummary(data) };
}

/**
 * Aplica os dados validados no IndexedDB (limpa e reescreve cada store presente
 * no arquivo). Chamado só depois que `importWorkbookFile` confirma zero erros.
 */
function applyImport(idb: IndexedDbService, data: ParsedData): Promise<void> {
  const storeWrites: Observable<unknown>[] = (Object.keys(data) as (keyof ParsedData)[]).map(
    (key) => {
      const storeName = IDB_STORES[key];
      const value = data[key];
      const items = Array.isArray(value) ? value : value ? [value] : [];
      return idb.clear(storeName).pipe(
        switchMap(() =>
          items.length > 0
            ? forkJoin(items.map((item, index) => idb.save(storeName, String(index), item as object)))
            : of(null),
        ),
      );
    },
  );

  if (storeWrites.length === 0) {
    return Promise.resolve();
  }
  return firstValueFrom(forkJoin(storeWrites)).then(() => undefined);
}

function buildSummary(data: ParsedData): Record<string, number> {
  const summary: Record<string, number> = {};
  (Object.keys(data) as (keyof ParsedData)[]).forEach((key) => {
    const value = data[key];
    summary[SHEET_NAMES[key]] = Array.isArray(value) ? value.length : value ? 1 : 0;
  });
  return summary;
}

function getSheet(wb: XLSX.WorkBook, name: string): XLSX.WorkSheet | null {
  return wb.Sheets[name] ?? null;
}

function readHeader(ws: XLSX.WorkSheet): string[] {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, blankrows: false });
  return ((rows[0] as unknown[] | undefined) ?? []).map((v) => String(v).trim());
}

function readRows(ws: XLSX.WorkSheet): Record<string, unknown>[] {
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' });
}

function requireColumns(
  header: string[],
  sheetLabel: string,
  columns: string[],
  errors: string[],
): boolean {
  const missing = columns.filter((c) => !header.includes(c));
  if (missing.length > 0) {
    errors.push(`Aba "${sheetLabel}": coluna(s) faltando: ${missing.join(', ')}.`);
    return false;
  }
  return true;
}

function excelSerialToIso(serial: number): string {
  // Arredonda pro dia inteiro: células de data "de verdade" no Excel podem vir
  // com um serial fracionário por imprecisão de ponto flutuante (ex.: 46203.9996
  // em vez de 46204), o que faria parse_date_code cair no dia errado.
  const parsed = XLSX.SSF.parse_date_code(Math.round(serial));
  const mm = String(parsed.m).padStart(2, '0');
  const dd = String(parsed.d).padStart(2, '0');
  return `${parsed.y}-${mm}-${dd}`;
}

function parseDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return excelSerialToIso(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) {
      const [, d, m, y] = br;
      return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  }
  return undefined;
}

function toNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const n = Number(value.replace(',', '.'));
    if (!Number.isNaN(n)) return n;
  }
  return undefined;
}

function toOptionalNumber(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  return toNumber(value);
}

function toRequiredString(value: unknown): string {
  return String(value ?? '').trim();
}

const rowRef = (rowIndex: number) => rowIndex + 2;

function parseSales(ws: XLSX.WorkSheet, errors: string[]): Venda[] | undefined {
  const label = SHEET_NAMES.sales;
  const header = readHeader(ws);
  const required = [
    'Data',
    'Produto',
    'Quantidade',
    'Preço Unitário',
    'Total',
    'Status Pagamento',
    'Comprador',
    'Vendedor',
    'Status da entrega',
  ];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: Venda[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const date = parseDate(row['Data']);
    const quantity = toNumber(row['Quantidade']);
    const unitPrice = toNumber(row['Preço Unitário']);
    const total = toNumber(row['Total']);
    const product = toRequiredString(row['Produto']);
    const buyer = toRequiredString(row['Comprador']);
    const seller = toRequiredString(row['Vendedor']);
    const paymentRaw = toRequiredString(row['Status Pagamento']).toUpperCase();
    const deliveryRaw = toRequiredString(row['Status da entrega']).toUpperCase();
    const deliveryDate = parseDate(row['Data da Entrega']);

    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (!product) errors.push(`${label} linha ${r}: "Produto" vazio.`);
    if (quantity === undefined) errors.push(`${label} linha ${r}: "Quantidade" inválida.`);
    if (unitPrice === undefined) errors.push(`${label} linha ${r}: "Preço Unitário" inválido.`);
    if (total === undefined) errors.push(`${label} linha ${r}: "Total" inválido.`);
    if (!buyer) errors.push(`${label} linha ${r}: "Comprador" vazio.`);
    if (!seller) errors.push(`${label} linha ${r}: "Vendedor" vazio.`);
    if (paymentRaw !== 'F' && paymentRaw !== 'PAGO') {
      errors.push(`${label} linha ${r}: "Status Pagamento" deve ser F ou PAGO (veio "${row['Status Pagamento']}").`);
    }
    if (deliveryRaw !== 'FALTA' && deliveryRaw !== 'ENTREGUE') {
      errors.push(`${label} linha ${r}: "Status da entrega" deve ser FALTA ou ENTREGUE (veio "${row['Status da entrega']}").`);
    }
    if (deliveryDate === undefined) {
      errors.push(`${label} linha ${r}: "Data da Entrega" em formato inválido.`);
    }

    if (date && product && quantity !== undefined && unitPrice !== undefined && total !== undefined) {
      result.push({
        date,
        product,
        quantity,
        unitPrice,
        total,
        paymentPending: paymentRaw === 'F',
        buyer,
        seller,
        deliveryPending: deliveryRaw === 'FALTA',
        deliveryDate: deliveryDate ?? null,
      });
    }
  });
  return result;
}

function parseDailyProduction(ws: XLSX.WorkSheet, errors: string[]): ProducaoDiaria[] | undefined {
  const label = SHEET_NAMES.dailyProduction;
  const header = readHeader(ws);
  if (!requireColumns(header, label, ['Data', 'Ovos Codorna', 'Ovos Galinha'], errors)) return undefined;

  const rows = readRows(ws);
  const result: ProducaoDiaria[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const date = parseDate(row['Data']);
    const quailEggs = toOptionalNumber(row['Ovos Codorna']);
    const chickenEggs = toOptionalNumber(row['Ovos Galinha']);

    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (quailEggs === undefined) errors.push(`${label} linha ${r}: "Ovos Codorna" inválido.`);
    if (chickenEggs === undefined) errors.push(`${label} linha ${r}: "Ovos Galinha" inválido.`);

    if (date) {
      result.push({ date, quailEggs: quailEggs ?? null, chickenEggs: chickenEggs ?? null });
    }
  });
  return result;
}

function parseEggStock(ws: XLSX.WorkSheet, errors: string[]): EstoqueOvos[] | undefined {
  const label = SHEET_NAMES.eggStock;
  const header = readHeader(ws);
  const required = [
    'Data',
    'Ovos Codorna',
    'Ovos Galinha',
    'Pack Codorna',
    'Pack Galinha',
    'Valor Estoque Codorna',
    'Valor Estoque Galinha',
  ];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: EstoqueOvos[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const date = parseDate(row['Data']);
    const quailEggs = toOptionalNumber(row['Ovos Codorna']);
    const chickenEggs = toOptionalNumber(row['Ovos Galinha']);
    const quailPacks = toNumber(row['Pack Codorna']);
    const chickenPacks = toNumber(row['Pack Galinha']);
    const quailStockValue = toNumber(row['Valor Estoque Codorna']);
    const chickenStockValue = toNumber(row['Valor Estoque Galinha']);

    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (quailPacks === undefined) errors.push(`${label} linha ${r}: "Pack Codorna" inválido.`);
    if (chickenPacks === undefined) errors.push(`${label} linha ${r}: "Pack Galinha" inválido.`);
    if (quailStockValue === undefined) errors.push(`${label} linha ${r}: "Valor Estoque Codorna" inválido.`);
    if (chickenStockValue === undefined) errors.push(`${label} linha ${r}: "Valor Estoque Galinha" inválido.`);

    if (
      date &&
      quailPacks !== undefined &&
      chickenPacks !== undefined &&
      quailStockValue !== undefined &&
      chickenStockValue !== undefined
    ) {
      result.push({
        date,
        quailEggs: quailEggs ?? null,
        chickenEggs: chickenEggs ?? null,
        quailPacks,
        chickenPacks,
        quailStockValue,
        chickenStockValue,
      });
    }
  });
  return result;
}

function parseFlock(ws: XLSX.WorkSheet, errors: string[]): Plantel[] | undefined {
  const label = SHEET_NAMES.flock;
  const header = readHeader(ws);
  const required = ['Espécie', 'Quantidade', 'Sacos Ração/Mês', 'Preço Saco', 'Total Mês'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: Plantel[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const species = toRequiredString(row['Espécie']);
    const quantity = toNumber(row['Quantidade']);
    const feedBagsPerMonth = toNumber(row['Sacos Ração/Mês']);
    const bagPrice = toNumber(row['Preço Saco']);
    const monthlyTotal = toNumber(row['Total Mês']);

    if (!species) errors.push(`${label} linha ${r}: "Espécie" vazia.`);
    if (quantity === undefined) errors.push(`${label} linha ${r}: "Quantidade" inválida.`);
    if (feedBagsPerMonth === undefined) errors.push(`${label} linha ${r}: "Sacos Ração/Mês" inválido.`);
    if (bagPrice === undefined) errors.push(`${label} linha ${r}: "Preço Saco" inválido.`);
    if (monthlyTotal === undefined) errors.push(`${label} linha ${r}: "Total Mês" inválido.`);

    if (
      species &&
      quantity !== undefined &&
      feedBagsPerMonth !== undefined &&
      bagPrice !== undefined &&
      monthlyTotal !== undefined
    ) {
      result.push({ species, quantity, feedBagsPerMonth, bagPrice, monthlyTotal });
    }
  });
  return result;
}

function parseProducts(ws: XLSX.WorkSheet, errors: string[]): Product[] | undefined {
  const label = SHEET_NAMES.products;
  const header = readHeader(ws);
  const required = ['Produto', 'Unidade', 'Preço Unitário', 'Estoque', 'Ovos por Unidade'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: Product[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const name = toRequiredString(row['Produto']);
    const unit = toRequiredString(row['Unidade']);
    const unitPrice = toNumber(row['Preço Unitário']);
    const stock = toNumber(row['Estoque']);
    const eggsPerUnit = toNumber(row['Ovos por Unidade']);

    if (!name) errors.push(`${label} linha ${r}: "Produto" vazio.`);
    if (!unit) errors.push(`${label} linha ${r}: "Unidade" vazia.`);
    if (unitPrice === undefined) errors.push(`${label} linha ${r}: "Preço Unitário" inválido.`);
    if (stock === undefined) errors.push(`${label} linha ${r}: "Estoque" inválido.`);
    if (eggsPerUnit === undefined) errors.push(`${label} linha ${r}: "Ovos por Unidade" inválido.`);

    if (name && unit && unitPrice !== undefined && stock !== undefined && eggsPerUnit !== undefined) {
      result.push({ name, unit, unitPrice, stock, eggsPerUnit });
    }
  });
  return result;
}

function parseExpenses(ws: XLSX.WorkSheet, errors: string[]): Expense[] | undefined {
  const label = SHEET_NAMES.expenses;
  const header = readHeader(ws);
  const required = ['Data', 'Descrição', 'Categoria', 'Valor', 'Pago'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: Expense[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const date = parseDate(row['Data']);
    const description = toRequiredString(row['Descrição']);
    const category = toRequiredString(row['Categoria']);
    const amount = toNumber(row['Valor']);
    const paidRaw = toRequiredString(row['Pago']);
    const paidNorm = paidRaw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (!description) errors.push(`${label} linha ${r}: "Descrição" vazia.`);
    if (!category) errors.push(`${label} linha ${r}: "Categoria" vazia.`);
    if (amount === undefined) errors.push(`${label} linha ${r}: "Valor" inválido.`);
    if (paidNorm !== 'sim' && paidNorm !== 'nao') {
      errors.push(`${label} linha ${r}: "Pago" deve ser Sim ou Não (veio "${row['Pago']}").`);
    }

    if (date && description && category && amount !== undefined) {
      result.push({ date, description, category, amount, paid: paidNorm === 'sim' });
    }
  });
  return result;
}

function parseCashFlow(ws: XLSX.WorkSheet, errors: string[]): CashEntry[] | undefined {
  const label = SHEET_NAMES.cashFlow;
  const header = readHeader(ws);
  const required = ['Data', 'Descrição', 'Tipo', 'Valor'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: CashEntry[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const date = parseDate(row['Data']);
    const description = toRequiredString(row['Descrição']);
    const amount = toNumber(row['Valor']);
    const tipoRaw = toRequiredString(row['Tipo']);
    const tipoNorm = tipoRaw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (!description) errors.push(`${label} linha ${r}: "Descrição" vazia.`);
    if (amount === undefined) errors.push(`${label} linha ${r}: "Valor" inválido.`);
    if (tipoNorm !== 'entrada' && tipoNorm !== 'saida') {
      errors.push(`${label} linha ${r}: "Tipo" deve ser Entrada ou Saída (veio "${row['Tipo']}").`);
    }

    if (date && description && amount !== undefined) {
      result.push({ date, description, amount, inflow: tipoNorm === 'entrada' });
    }
  });
  return result;
}

const DASHBOARD_FIELD_BY_LABEL: Record<string, keyof DashboardResumo> = {
  'Total de codornas': 'totalQuails',
  'Total de galinhas': 'totalChickens',
  'Produção diária codornas': 'dailyQuailProduction',
  'Produção diária galinhas': 'dailyChickenProduction',
  'Preço pack 50 ovos codorna': 'quailPack50Price',
  'Preço pack 30 ovos galinha': 'chickenPack30Price',
};

function parseDashboard(ws: XLSX.WorkSheet, errors: string[]): DashboardResumo | undefined {
  const label = SHEET_NAMES.dashboard;
  const header = readHeader(ws);
  if (!requireColumns(header, label, ['Indicador', 'Valor'], errors)) return undefined;

  const rows = readRows(ws);
  const partial: Partial<DashboardResumo> = {};
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const indicador = toRequiredString(row['Indicador']);
    const field = DASHBOARD_FIELD_BY_LABEL[indicador];
    const valor = toNumber(row['Valor']);

    if (!field) {
      errors.push(`${label} linha ${r}: "Indicador" desconhecido ("${indicador}").`);
      return;
    }
    if (valor === undefined) {
      errors.push(`${label} linha ${r}: "Valor" inválido para "${indicador}".`);
      return;
    }
    partial[field] = valor;
  });

  const missing = (Object.keys(DASHBOARD_FIELD_BY_LABEL) as string[]).filter(
    (lbl) => partial[DASHBOARD_FIELD_BY_LABEL[lbl]] === undefined,
  );
  if (missing.length > 0) {
    errors.push(`${label}: indicador(es) faltando: ${missing.join(', ')}.`);
    return undefined;
  }

  return partial as DashboardResumo;
}
