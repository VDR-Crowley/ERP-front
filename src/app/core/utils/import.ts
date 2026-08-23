import * as XLSX from 'xlsx';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injector, inject, runInInjectionContext } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Venda } from '@core/interfaces/venda.interface';
import { ProducaoDiaria } from '@core/interfaces/producao-diaria.interface';
import { EstoqueOvos } from '@core/interfaces/estoque-ovos.interface';
import { Plantel } from '@core/interfaces/plantel.interface';
import { NovoLotePlantel, Species } from '@core/interfaces/novo-lote-plantel.interface';
import { migrateLegacyHatchEvents } from '@core/utils/hatch-tracking.util';
import { Product } from '@core/interfaces/product.interface';
import { Expense } from '@core/interfaces/expense.interface';
import { CashEntry } from '@core/interfaces/cash-entry.interface';
import { User } from '@core/interfaces/user.interface';
import { FeedStock, FeedOpenLog } from '@core/interfaces/feed-stock.interface';
import { FlockCleaning, CleaningType } from '@core/interfaces/flock-cleaning.interface';
import { createSalesStore } from '@core/api/adapters/sales.adapter';
import { createDailyProductionsStore } from '@core/api/adapters/daily-productions.adapter';
import { createEggStocksStore } from '@core/api/adapters/egg-stocks.adapter';
import { createFlockStore } from '@core/api/adapters/flock.adapter';
import { createProductsStore } from '@core/api/adapters/products.adapter';
import { createExpensesStore } from '@core/api/adapters/expenses.adapter';
import { createCashFlowsStore } from '@core/api/adapters/cash-flows.adapter';
import { createUsersStore } from '@core/api/adapters/users.adapter';
import { createFlockIncubationsStore } from '@core/api/adapters/flock-incubations.adapter';
import { createFeedStockStore, createFeedStockStoreExtended } from '@core/api/adapters/feed-stocks.adapter';
import { createFlockCleaningsStore } from '@core/api/adapters/flock-cleanings.adapter';
import { environment } from '../../../environments/environment';

export interface ImportResult {
  /** false só nos casos bloqueantes: arquivo inválido ou nenhuma aba reconhecida. */
  success: boolean;
  /** Mensagens bloqueantes (ver `success`) — quando populado, nada foi importado. */
  errors: string[];
  /** Aba -> quantidade de linhas importadas com sucesso. */
  summary: Record<string, number>;
  /** Aba -> quantidade de linhas que falharam (validação ou API). Só entra aqui se > 0. */
  failed: Record<string, number>;
  /** Uma mensagem por linha que falhou (validação de planilha ou erro 422 da API), pra exibir ao usuário. */
  rowErrors: string[];
}

/** Item de planilha já validado, com o número da linha original (pra reportar erro de API por linha). */
interface RowItem<T> {
  row: number;
  item: T;
}

const SHEET_NAMES = {
  sales: 'Vendas',
  dailyProduction: 'Produção',
  eggStock: 'Estoque de Ovos',
  flock: 'Plantel',
  products: 'Produtos',
  expenses: 'Despesas',
  cashFlow: 'Fluxo de Caixa',
  users: 'Usuários',
  flockIncubation: 'Novo Plantel',
  feedStock: 'Ração',
  feedOpenLog: 'Ração - Sacos Abertos',
  flockCleaning: 'Higienização',
} as const;

/**
 * Contexto de import: cria cada store/adapter da API preguiçosamente (só se a aba
 * correspondente estiver presente no arquivo) e reaproveita a mesma instância pra
 * todas as linhas daquela aba — `createXStore()` dispara um GET de lista assim que
 * é criada, então instanciar por linha desperdiçaria requisições.
 *
 * Os `create*Store()` usam `inject()` internamente (padrão de todos os
 * `core/api/adapters/*`), por isso precisam rodar dentro de um contexto de injeção
 * do Angular — daqui vem o `runInInjectionContext(injector, ...)`.
 */
interface ImportContext {
  salesStore: () => ReturnType<typeof createSalesStore>;
  dailyProductionsStore: () => ReturnType<typeof createDailyProductionsStore>;
  eggStocksStore: () => ReturnType<typeof createEggStocksStore>;
  flockStore: () => ReturnType<typeof createFlockStore>;
  productsStore: () => ReturnType<typeof createProductsStore>;
  expensesStore: () => ReturnType<typeof createExpensesStore>;
  cashFlowsStore: () => ReturnType<typeof createCashFlowsStore>;
  usersStore: () => ReturnType<typeof createUsersStore>;
  flockIncubationsStore: () => ReturnType<typeof createFlockIncubationsStore>;
  feedStockStore: () => ReturnType<typeof createFeedStockStore>;
  feedStockStoreExtended: () => ReturnType<typeof createFeedStockStoreExtended>;
  flockCleaningsStore: () => ReturnType<typeof createFlockCleaningsStore>;
  /** "Tipo" (Ração) -> id do `feed_stock`, resolvido uma única vez pra aba Ração-Sacos Abertos. */
  feedStockIdByType: () => Promise<Map<string, number>>;
}

/** Memoiza uma factory síncrona: só chama `factory()` na primeira leitura. */
function memo<T>(factory: () => T): () => T {
  let cached: T | undefined;
  let has = false;
  return () => {
    if (!has) {
      cached = factory();
      has = true;
    }
    return cached as T;
  };
}

/** Memoiza uma factory assíncrona (a própria Promise é cacheada, evita disparar 2x em paralelo). */
function memoAsync<T>(factory: () => Promise<T>): () => Promise<T> {
  let promise: Promise<T> | undefined;
  return () => {
    if (!promise) promise = factory();
    return promise;
  };
}

async function fetchFeedStockIdByType(http: HttpClient): Promise<Map<string, number>> {
  const list = await firstValueFrom(http.get<{ id: number; type: string }[]>(`${environment.apiUrl}/feed-stocks`));
  const map = new Map<string, number>();
  for (const item of list) map.set(item.type, item.id);
  return map;
}

function createImportContext(injector: Injector): ImportContext {
  const run = <T,>(factory: () => T): T => runInInjectionContext(injector, factory);
  const http = memo(() => run(() => inject(HttpClient)));

  return {
    salesStore: memo(() => run(() => createSalesStore())),
    dailyProductionsStore: memo(() => run(() => createDailyProductionsStore())),
    eggStocksStore: memo(() => run(() => createEggStocksStore())),
    flockStore: memo(() => run(() => createFlockStore())),
    productsStore: memo(() => run(() => createProductsStore())),
    expensesStore: memo(() => run(() => createExpensesStore())),
    cashFlowsStore: memo(() => run(() => createCashFlowsStore())),
    usersStore: memo(() => run(() => createUsersStore())),
    flockIncubationsStore: memo(() => run(() => createFlockIncubationsStore())),
    feedStockStore: memo(() => run(() => createFeedStockStore())),
    feedStockStoreExtended: memo(() => run(() => createFeedStockStoreExtended())),
    flockCleaningsStore: memo(() => run(() => createFlockCleaningsStore())),
    feedStockIdByType: memoAsync(() => fetchFeedStockIdByType(http())),
  };
}

/** Traduz erro de `store.add()`/API pra uma mensagem de 1 linha — usada no `rowErrors` de cada linha que falhou. */
function describeImportError(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    if (e.status === 422) {
      const apiErrors = e.error?.errors as Record<string, string[]> | undefined;
      if (apiErrors) return Object.values(apiErrors).flat().join(' ');
      if (e.error?.message) return String(e.error.message);
    }
    return e.error?.message ? String(e.error.message) : `Erro ${e.status} ao salvar.`;
  }
  if (e instanceof Error) return e.message;
  return 'Erro desconhecido ao salvar.';
}

interface EntityImporter {
  label: string;
  process(
    ws: XLSX.WorkSheet,
    rowErrors: string[],
    ctx: ImportContext,
  ): Promise<{ imported: number; failed: number } | undefined>;
}

/**
 * Uma linha que falha (validação de planilha OU erro 422 da API, ex.: nome de
 * Produto/Vendedor não encontrado) vira 1 entrada em `rowErrors` e NÃO trava as
 * demais linhas — cada linha é `add()`ada e tratada isoladamente. Retorna
 * `undefined` só quando a aba nem pôde ser lida (coluna obrigatória faltando);
 * nesse caso a aba inteira é pulada, mas as outras abas do arquivo seguem normais.
 */
function makeImporter<T>(
  label: string,
  parse: (ws: XLSX.WorkSheet, rowErrors: string[]) => RowItem<T>[] | undefined,
  run: (item: T, ctx: ImportContext) => Promise<void>,
): EntityImporter {
  return {
    label,
    async process(ws, rowErrors, ctx) {
      const rows = parse(ws, rowErrors);
      if (rows === undefined) return undefined;

      let imported = 0;
      let failed = 0;
      for (const { row, item } of rows) {
        try {
          await run(item, ctx);
          imported++;
        } catch (e) {
          failed++;
          rowErrors.push(`${label} linha ${row}: ${describeImportError(e)}`);
        }
      }
      return { imported, failed };
    },
  };
}

async function runUser(item: User, ctx: ImportContext): Promise<void> {
  await ctx.usersStore().add({
    name: item.name,
    email: item.email,
    isActive: true,
    password: item.password,
    passwordConfirmation: item.password,
  });
}

/**
 * Não existe `POST /feed-open-logs` direto — o backend só registra abertura de
 * saco via `POST /feed-stocks/{id}/open-bag` (ver `feed-stocks.adapter.ts`), que
 * TAMBÉM decrementa 1 saco do estoque atual, igual a abrir um saco manualmente
 * pela tela de Controle de Ração. Resolve o `feed_stock` pelo "Tipo" da linha
 * (mesmo padrão de rejeição de `resolveIdByName`: nome não encontrado = linha
 * rejeitada, nunca cria tipo novo).
 */
async function runFeedOpenLog(item: FeedOpenLog, ctx: ImportContext): Promise<void> {
  const idByType = await ctx.feedStockIdByType();
  const id = idByType.get(item.feedType);
  if (id === undefined) {
    throw new Error(`Tipo de ração "${item.feedType}" não encontrado — cadastre o tipo em Controle de Ração antes de importar.`);
  }
  await ctx.feedStockStoreExtended().openBag(String(id), { date: item.date, weightKg: item.weightKg });
}

/** Ordem importa: "Ração" roda antes de "Ração - Sacos Abertos" pra resolver o tipo recém-criado. */
const IMPORTERS: EntityImporter[] = [
  makeImporter(SHEET_NAMES.sales, parseSales, (item, ctx) => ctx.salesStore().add(item)),
  makeImporter(SHEET_NAMES.dailyProduction, parseDailyProduction, (item, ctx) => ctx.dailyProductionsStore().add(item)),
  makeImporter(SHEET_NAMES.eggStock, parseEggStock, (item, ctx) => ctx.eggStocksStore().add(item)),
  makeImporter(SHEET_NAMES.flock, parseFlock, (item, ctx) => ctx.flockStore().add(item)),
  makeImporter(SHEET_NAMES.products, parseProducts, (item, ctx) => ctx.productsStore().add(item)),
  makeImporter(SHEET_NAMES.expenses, parseExpenses, (item, ctx) => ctx.expensesStore().add(item)),
  makeImporter(SHEET_NAMES.cashFlow, parseCashFlow, (item, ctx) => ctx.cashFlowsStore().add(item)),
  makeImporter(SHEET_NAMES.users, parseUsers, runUser),
  makeImporter(SHEET_NAMES.flockIncubation, parseFlockIncubation, (item, ctx) => ctx.flockIncubationsStore().add(item)),
  makeImporter(SHEET_NAMES.feedStock, parseFeedStock, (item, ctx) => ctx.feedStockStore().add(item)),
  makeImporter(SHEET_NAMES.feedOpenLog, parseFeedOpenLog, runFeedOpenLog),
  makeImporter(SHEET_NAMES.flockCleaning, parseFlockCleaning, (item, ctx) => ctx.flockCleaningsStore().add(item)),
];

/** Lê o arquivo e cria, via API, cada linha válida nas 12 entidades com adapter (dashboard não tem endpoint de criação — ignorado). */
export async function importWorkbookFile(injector: Injector, file: File): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch {
    return { success: false, errors: ['Arquivo inválido ou corrompido.'], summary: {}, failed: {}, rowErrors: [] };
  }

  const present = IMPORTERS.filter((imp) => getSheet(workbook, imp.label) !== null);
  if (present.length === 0) {
    return {
      success: false,
      errors: ['Nenhuma aba reconhecida no arquivo. Baixe o modelo de exemplo pra conferir o formato.'],
      summary: {},
      failed: {},
      rowErrors: [],
    };
  }

  const ctx = createImportContext(injector);
  const rowErrors: string[] = [];
  const summary: Record<string, number> = {};
  const failed: Record<string, number> = {};

  for (const importer of present) {
    const ws = getSheet(workbook, importer.label)!;
    const result = await importer.process(ws, rowErrors, ctx);
    if (result === undefined) continue; // coluna obrigatória faltando — mensagem já em rowErrors, aba inteira pulada
    summary[importer.label] = result.imported;
    if (result.failed > 0) failed[importer.label] = result.failed;
  }

  return { success: true, errors: [], summary, failed, rowErrors };
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

// Janela de anos plausíveis pra autocorreção de digitação: [anoAtual-1, anoAtual+1].
// A base de teste tem datas com o ano digitado errado (2027/2028 em vez de 2026),
// o que fazia registros sumirem dos filtros de mês (só apareciam no chip "Tudo").
// Qualquer ano fora dessa janela é tratado como erro de digitação, nunca como data
// legítima — e corrigido preservando mês/dia.
const PLAUSIBLE_YEAR_WINDOW = 1;

/**
 * Corrige o ano de uma data importada quando ele cai fora da janela plausível
 * (anoAtual-1..anoAtual+1). Entre os anos plausíveis, escolhe o que deixa a data
 * mais próxima de hoje (preservando mês/dia) — é a melhor aproximação do que o
 * usuário quis digitar sem inventar informação que a planilha não tem.
 */
function correctImplausibleYear(year: number, month: number, day: number): number {
  const now = new Date();
  const minYear = now.getFullYear() - PLAUSIBLE_YEAR_WINDOW;
  const maxYear = now.getFullYear() + PLAUSIBLE_YEAR_WINDOW;
  if (year >= minYear && year <= maxYear) return year;

  let bestYear = year;
  let bestDiff = Infinity;
  for (let y = minYear; y <= maxYear; y++) {
    const diff = Math.abs(new Date(y, month - 1, day).getTime() - now.getTime());
    if (diff < bestDiff) {
      bestDiff = diff;
      bestYear = y;
    }
  }
  return bestYear;
}

function excelSerialToIso(serial: number): string {
  // Arredonda pro dia inteiro: células de data "de verdade" no Excel podem vir
  // com um serial fracionário por imprecisão de ponto flutuante (ex.: 46203.9996
  // em vez de 46204), o que faria parse_date_code cair no dia errado.
  const parsed = XLSX.SSF.parse_date_code(Math.round(serial));
  const year = correctImplausibleYear(parsed.y, parsed.m, parsed.d);
  const mm = String(parsed.m).padStart(2, '0');
  const dd = String(parsed.d).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

function parseDate(value: unknown): string | null | undefined {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'number') return excelSerialToIso(value);
  if (typeof value === 'string') {
    const trimmed = value.trim();
    const br = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (br) {
      const [, d, m, y] = br;
      const year = correctImplausibleYear(Number(y), Number(m), Number(d));
      return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
    }
    const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (iso) {
      const [, y, m, d] = iso;
      const year = correctImplausibleYear(Number(y), Number(m), Number(d));
      return `${year}-${m}-${d}`;
    }
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

function parseSales(ws: XLSX.WorkSheet, errors: string[]): RowItem<Venda>[] | undefined {
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
  const result: RowItem<Venda>[] = [];
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
        row: r,
        item: {
          date,
          product,
          quantity,
          unitPrice,
          total: Math.round(quantity * unitPrice * 100) / 100,
          paymentPending: paymentRaw === 'F',
          buyer,
          seller,
          deliveryPending: deliveryRaw === 'FALTA',
          deliveryDate: deliveryDate ?? null,
        },
      });
    }
  });
  return result;
}

function parseDailyProduction(ws: XLSX.WorkSheet, errors: string[]): RowItem<ProducaoDiaria>[] | undefined {
  const label = SHEET_NAMES.dailyProduction;
  const header = readHeader(ws);
  if (!requireColumns(header, label, ['Data', 'Ovos Codorna', 'Ovos Galinha'], errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<ProducaoDiaria>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const date = parseDate(row['Data']);
    const quailEggs = toOptionalNumber(row['Ovos Codorna']);
    const chickenEggs = toOptionalNumber(row['Ovos Galinha']);

    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (quailEggs === undefined) errors.push(`${label} linha ${r}: "Ovos Codorna" inválido.`);
    if (chickenEggs === undefined) errors.push(`${label} linha ${r}: "Ovos Galinha" inválido.`);

    if (date) {
      result.push({ row: r, item: { date, quailEggs: quailEggs ?? null, chickenEggs: chickenEggs ?? null } });
    }
  });
  return result;
}

function parseEggStock(ws: XLSX.WorkSheet, errors: string[]): RowItem<EstoqueOvos>[] | undefined {
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
  const result: RowItem<EstoqueOvos>[] = [];
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

    if (date) {
      result.push({
        row: r,
        item: {
          date,
          quailEggs: quailEggs ?? null,
          chickenEggs: chickenEggs ?? null,
          quailPacks: quailPacks ?? 0,
          chickenPacks: chickenPacks ?? 0,
          quailStockValue: quailStockValue ?? 0,
          chickenStockValue: chickenStockValue ?? 0,
        },
      });
    }
  });
  return result;
}

function parseFlock(ws: XLSX.WorkSheet, errors: string[]): RowItem<Plantel>[] | undefined {
  const label = SHEET_NAMES.flock;
  const header = readHeader(ws);
  const required = ['Espécie', 'Quantidade', 'Sacos Ração/Mês', 'Preço Saco', 'Total Mês'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<Plantel>[] = [];
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
      result.push({ row: r, item: { species, quantity, feedBagsPerMonth, bagPrice, monthlyTotal } });
    }
  });
  return result;
}

function parseProducts(ws: XLSX.WorkSheet, errors: string[]): RowItem<Product>[] | undefined {
  const label = SHEET_NAMES.products;
  const header = readHeader(ws);
  const required = ['Produto', 'Unidade', 'Preço Unitário', 'Estoque', 'Ovos por Unidade'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<Product>[] = [];
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
      result.push({ row: r, item: { name, unit, unitPrice, stock, eggsPerUnit } });
    }
  });
  return result;
}

function parseExpenses(ws: XLSX.WorkSheet, errors: string[]): RowItem<Expense>[] | undefined {
  const label = SHEET_NAMES.expenses;
  const header = readHeader(ws);
  const required = ['Data', 'Descrição', 'Categoria', 'Valor', 'Pago'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<Expense>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const date = parseDate(row['Data']);
    const description = toRequiredString(row['Descrição']);
    const category = toRequiredString(row['Categoria']);
    const quantity = toOptionalNumber(row['Qtd.']);
    const unitPrice = toOptionalNumber(row['Valor unit.']);
    const amount = toNumber(row['Valor']);
    const paidRaw = toRequiredString(row['Pago']);
    const paidNorm = paidRaw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (!description) errors.push(`${label} linha ${r}: "Descrição" vazia.`);
    if (!category) errors.push(`${label} linha ${r}: "Categoria" vazia.`);
    if (quantity === undefined) errors.push(`${label} linha ${r}: "Qtd." inválida.`);
    if (unitPrice === undefined) errors.push(`${label} linha ${r}: "Valor unit." inválido.`);
    if (amount === undefined) errors.push(`${label} linha ${r}: "Valor" inválido.`);
    if (paidNorm !== 'sim' && paidNorm !== 'nao') {
      errors.push(`${label} linha ${r}: "Pago" deve ser Sim ou Não (veio "${row['Pago']}").`);
    }

    if (
      date &&
      description &&
      category &&
      quantity !== undefined &&
      unitPrice !== undefined &&
      amount !== undefined
    ) {
      const computedAmount =
        quantity !== null && unitPrice !== null && quantity > 0 && unitPrice > 0
          ? Math.round(quantity * unitPrice * 100) / 100
          : amount;
      result.push({
        row: r,
        item: {
          date,
          description,
          category,
          ...(quantity !== null ? { quantity } : {}),
          ...(unitPrice !== null ? { unitPrice } : {}),
          amount: computedAmount,
          paid: paidNorm === 'sim',
        },
      });
    }
  });
  return result;
}

function parseCashFlow(ws: XLSX.WorkSheet, errors: string[]): RowItem<CashEntry>[] | undefined {
  const label = SHEET_NAMES.cashFlow;
  const header = readHeader(ws);
  const required = ['Data', 'Descrição', 'Tipo', 'Valor'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<CashEntry>[] = [];
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
      result.push({ row: r, item: { date, description, amount, inflow: tipoNorm === 'entrada' } });
    }
  });
  return result;
}

function parseUsers(ws: XLSX.WorkSheet, errors: string[]): RowItem<User>[] | undefined {
  const label = SHEET_NAMES.users;
  const header = readHeader(ws);
  if (!requireColumns(header, label, ['Nome', 'E-mail', 'Senha'], errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<User>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const name = toRequiredString(row['Nome']);
    const email = toRequiredString(row['E-mail']);
    const password = toRequiredString(row['Senha']);
    const phone = toRequiredString(row['Telefone']);

    if (!name) errors.push(`${label} linha ${r}: "Nome" vazio.`);
    if (!email) errors.push(`${label} linha ${r}: "E-mail" vazio.`);
    if (!password) errors.push(`${label} linha ${r}: "Senha" vazia.`);

    if (name && email && password) {
      result.push({ row: r, item: { name, email, password, ...(phone ? { phone } : {}) } });
    }
  });
  return result;
}

function parseSpecies(value: unknown): Species | undefined {
  const norm = toRequiredString(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (norm === 'codorna' || norm === 'codornas' || norm === 'quail') return 'quail';
  if (norm === 'galinha' || norm === 'galinhas' || norm === 'chicken') return 'chicken';
  return undefined;
}

function parseFlockIncubation(ws: XLSX.WorkSheet, errors: string[]): RowItem<NovoLotePlantel>[] | undefined {
  const label = SHEET_NAMES.flockIncubation;
  const header = readHeader(ws);
  const required = [
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
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<NovoLotePlantel>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const startDate = parseDate(row['Data Incubadora']);
    const species = parseSpecies(row['Espécie']);
    const eggCount = toNumber(row['Qtd. Ovos']);
    const expectedHatchDate = parseDate(row['Eclosão Prevista']);
    const actualHatchDate = parseDate(row['Data Eclosão']);
    const hatchedCount = toOptionalNumber(row['Qtd. Nascida']);
    const statusRaw = toRequiredString(row['Status']).toLowerCase();
    const eggCost = toOptionalNumber(row['Custo Ovos']);
    const feedCost = toOptionalNumber(row['Custo Ração']);
    const notes = toRequiredString(row['Observações']);

    if (!startDate) errors.push(`${label} linha ${r}: "Data Incubadora" inválida ou vazia.`);
    if (!species) errors.push(`${label} linha ${r}: "Espécie" deve ser Codorna ou Galinha (veio "${row['Espécie']}").`);
    if (eggCount === undefined) errors.push(`${label} linha ${r}: "Qtd. Ovos" inválido.`);
    if (!expectedHatchDate) errors.push(`${label} linha ${r}: "Eclosão Prevista" inválida ou vazia.`);
    if (actualHatchDate === undefined) errors.push(`${label} linha ${r}: "Data Eclosão" em formato inválido.`);
    if (hatchedCount === undefined) errors.push(`${label} linha ${r}: "Qtd. Nascida" inválida.`);
    if (statusRaw !== 'incubando' && statusRaw !== 'eclodido') {
      errors.push(`${label} linha ${r}: "Status" deve ser incubando ou eclodido (veio "${row['Status']}").`);
    }
    if (eggCost === undefined) errors.push(`${label} linha ${r}: "Custo Ovos" inválido.`);
    if (feedCost === undefined) errors.push(`${label} linha ${r}: "Custo Ração" inválido.`);

    if (
      startDate &&
      species &&
      eggCount !== undefined &&
      expectedHatchDate &&
      actualHatchDate !== undefined &&
      hatchedCount !== undefined &&
      (statusRaw === 'incubando' || statusRaw === 'eclodido') &&
      eggCost !== undefined &&
      feedCost !== undefined
    ) {
      result.push({
        row: r,
        item: {
          startDate,
          species,
          eggCount,
          expectedHatchDate,
          hatchEvents: migrateLegacyHatchEvents({ actualHatchDate, hatchedCount }),
          status: statusRaw,
          eggCost,
          feedCost,
          ...(notes ? { notes } : {}),
        },
      });
    }
  });
  return result;
}

function parseFeedStock(ws: XLSX.WorkSheet, errors: string[]): RowItem<FeedStock>[] | undefined {
  const label = SHEET_NAMES.feedStock;
  const header = readHeader(ws);
  const required = ['Tipo', 'Sacos em Estoque', 'Kg em Estoque', 'Peso do Saco', 'Validade'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<FeedStock>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const type = toRequiredString(row['Tipo']);
    const bagsInStock = toNumber(row['Sacos em Estoque']);
    const kgInStock = toNumber(row['Kg em Estoque']);
    const lastBagWeightKg = toNumber(row['Peso do Saco']);
    const expirationDate = parseDate(row['Validade']);

    if (!type) errors.push(`${label} linha ${r}: "Tipo" vazio.`);
    if (bagsInStock === undefined) errors.push(`${label} linha ${r}: "Sacos em Estoque" inválido.`);
    if (kgInStock === undefined) errors.push(`${label} linha ${r}: "Kg em Estoque" inválido.`);
    if (lastBagWeightKg === undefined) errors.push(`${label} linha ${r}: "Peso do Saco" inválido.`);
    if (expirationDate === undefined) errors.push(`${label} linha ${r}: "Validade" em formato inválido.`);

    if (
      type &&
      bagsInStock !== undefined &&
      kgInStock !== undefined &&
      lastBagWeightKg !== undefined &&
      expirationDate !== undefined
    ) {
      result.push({ row: r, item: { type, bagsInStock, kgInStock, lastBagWeightKg, expirationDate } });
    }
  });
  return result;
}

function parseCleaningType(value: unknown): CleaningType | undefined {
  const norm = toRequiredString(value)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
  if (norm === 'total') return 'total';
  if (norm === 'bebedouro' || norm === 'feeder') return 'feeder';
  if (norm === 'bandeja' || norm === 'tray') return 'tray';
  if (norm === 'ninho' || norm === 'nest') return 'nest';
  return undefined;
}

function parseFlockCleaning(ws: XLSX.WorkSheet, errors: string[]): RowItem<FlockCleaning>[] | undefined {
  const label = SHEET_NAMES.flockCleaning;
  const header = readHeader(ws);
  const required = ['Data', 'Espécie', 'Tipo', 'Observações'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<FlockCleaning>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const date = parseDate(row['Data']);
    const species = parseSpecies(row['Espécie']);
    const cleaningType = parseCleaningType(row['Tipo']);
    const notes = toRequiredString(row['Observações']);

    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (!species) errors.push(`${label} linha ${r}: "Espécie" deve ser Codorna ou Galinha (veio "${row['Espécie']}").`);
    if (!cleaningType) {
      errors.push(`${label} linha ${r}: "Tipo" deve ser Total, Bebedouro, Bandeja ou Ninho (veio "${row['Tipo']}").`);
    }
    // Bandeja só existe pra Codorna (guarda ovos na bandeja) e Ninho só pra
    // Galinha (bota no ninho) — mesma restrição aplicada no formulário da tela.
    if (species && cleaningType === 'tray' && species !== 'quail') {
      errors.push(`${label} linha ${r}: "Tipo" Bandeja só é válido pra espécie Codorna.`);
    }
    if (species && cleaningType === 'nest' && species !== 'chicken') {
      errors.push(`${label} linha ${r}: "Tipo" Ninho só é válido pra espécie Galinha.`);
    }

    const compatible =
      cleaningType === 'total' ||
      cleaningType === 'feeder' ||
      (cleaningType === 'tray' && species === 'quail') ||
      (cleaningType === 'nest' && species === 'chicken');

    if (date && species && cleaningType && compatible) {
      result.push({ row: r, item: { date, species, cleaningType, ...(notes ? { notes } : {}) } });
    }
  });
  return result;
}

function parseFeedOpenLog(ws: XLSX.WorkSheet, errors: string[]): RowItem<FeedOpenLog>[] | undefined {
  const label = SHEET_NAMES.feedOpenLog;
  const header = readHeader(ws);
  const required = ['Data', 'Tipo', 'Peso Aberto (kg)'];
  if (!requireColumns(header, label, required, errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<FeedOpenLog>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const date = parseDate(row['Data']);
    const feedType = toRequiredString(row['Tipo']);
    const weightKg = toNumber(row['Peso Aberto (kg)']);

    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (!feedType) errors.push(`${label} linha ${r}: "Tipo" vazio.`);
    if (weightKg === undefined) errors.push(`${label} linha ${r}: "Peso Aberto (kg)" inválido.`);

    if (date && feedType && weightKg !== undefined) {
      result.push({ row: r, item: { feedType, date, weightKg } });
    }
  });
  return result;
}
