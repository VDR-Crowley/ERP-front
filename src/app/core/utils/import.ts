import * as XLSX from 'xlsx';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injector, inject, runInInjectionContext } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { Venda } from '@core/interfaces/venda.interface';
import { ProducaoDiaria } from '@core/interfaces/producao-diaria.interface';
import { Plantel } from '@core/interfaces/plantel.interface';
import { NovoLotePlantel, Species } from '@core/interfaces/novo-lote-plantel.interface';
import { migrateLegacyHatchEvents } from '@core/utils/hatch-tracking.util';
import { Product } from '@core/interfaces/product.interface';
import { Expense } from '@core/interfaces/expense.interface';
import { CashEntry } from '@core/interfaces/cash-entry.interface';
import { User } from '@core/interfaces/user.interface';
import { Vendedor } from '@core/interfaces/vendedor.interface';
import { FeedStock, FeedOpenLog } from '@core/interfaces/feed-stock.interface';
import { FlockCleaning, CleaningType } from '@core/interfaces/flock-cleaning.interface';
import { createSalesStore, SalesRefs } from '@core/api/adapters/sales.adapter';
import { createDailyProductionsStore } from '@core/api/adapters/daily-productions.adapter';
import { createFlockStore } from '@core/api/adapters/flock.adapter';
import { createBarnStore } from '@core/api/adapters/barn.adapter';
import { createBarnStockStore } from '@core/api/adapters/barn-stock.adapter';
import { createVendorStockStore } from '@core/api/adapters/vendor-stock.adapter';
import { Barn } from '@core/interfaces/barn.interface';
import { createProductsStore } from '@core/api/adapters/products.adapter';
import { createExpensesStore } from '@core/api/adapters/expenses.adapter';
import { createCashFlowsStore } from '@core/api/adapters/cash-flows.adapter';
import { createUsersStore } from '@core/api/adapters/users.adapter';
import { createVendedoresStore } from '@core/api/adapters/vendedores.adapter';
import { createFlockIncubationsStore } from '@core/api/adapters/flock-incubations.adapter';
import { createFeedStockStore, createFeedStockStoreExtended } from '@core/api/adapters/feed-stocks.adapter';
import { createFlockCleaningsStore } from '@core/api/adapters/flock-cleanings.adapter';
import { PLANTEL_LOCATION, vendedorLocation } from '@core/utils/stock-location';
import { environment } from '../../../environments/environment';

export interface ImportResult {
  /** false só nos casos bloqueantes: arquivo inválido ou nenhuma aba reconhecida. */
  success: boolean;
  /** Mensagens bloqueantes (ver `success`) — quando populado, nada foi importado. */
  errors: string[];
  /** Aba -> quantidade de linhas importadas com sucesso (create OU update, ver `warnings`). */
  summary: Record<string, number>;
  /** Aba -> quantidade de linhas que falharam (validação ou API). Só entra aqui se > 0. */
  failed: Record<string, number>;
  /** Aba -> quantidade de linhas IGNORADAS por já existirem (violação de unicidade). Só entra se > 0. */
  skipped: Record<string, number>;
  /** Uma mensagem por linha que falhou (validação de planilha ou erro 422 da API), pra exibir ao usuário. */
  rowErrors: string[];
  /**
   * Uma mensagem por linha que teve sucesso mas com uma decisão que vale avisar (ex.: "ID" da
   * planilha não existe mais no backend, recriado como novo registro) — não é falha, `summary`
   * já conta a linha como importada, mas o usuário deve saber que o id original não foi mantido.
   */
  warnings: string[];
}

/** Item de planilha já validado, com o número da linha original (pra reportar erro de API por linha). */
interface RowItem<T> {
  row: number;
  item: T;
  /**
   * Id real do registro no backend, quando a coluna "ID" (só existe em arquivo exportado por
   * essa versão do app) vem preenchida — usado pra reimportar como UPDATE em vez de CREATE (ver
   * `upsert`/`IMPORTERS`). Ausente = linha nova (planilha digitada à mão, ou de uma versão sem
   * essa coluna) — comportamento de sempre, cria via POST.
   */
  id?: string;
}

const SHEET_NAMES = {
  sales: 'Vendas',
  dailyProduction: 'Produção',
  flock: 'Plantel',
  products: 'Produtos',
  expenses: 'Despesas',
  cashFlow: 'Fluxo de Caixa',
  users: 'Usuários',
  vendedores: 'Vendedores',
  flockIncubation: 'Novo Plantel',
  feedStock: 'Ração',
  feedOpenLog: 'Ração - Sacos Abertos',
  flockCleaning: 'Higienização',
  barn: 'Galpões',
  barnStock: 'Estoque Galpão',
  vendorStock: 'Estoque Vendedor',
} as const;

interface BarnStockRow { barnName: string; product: string; quantity: number }
interface VendorStockRow { vendedorName: string; product: string; quantity: number }

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
  /** products+vendedores pra resolver Produto/Vendedor de cada linha de Vendas — memoizado, 1 GET de cada pro import inteiro (não 1 por linha, ver `salesStore().add`). */
  salesRefs: () => Promise<SalesRefs>;
  dailyProductionsStore: () => ReturnType<typeof createDailyProductionsStore>;
  flockStore: () => ReturnType<typeof createFlockStore>;
  barnsStore: () => ReturnType<typeof createBarnStore>;
  barnStockStore: () => ReturnType<typeof createBarnStockStore>;
  vendorStockStore: () => ReturnType<typeof createVendorStockStore>;
  productsStore: () => ReturnType<typeof createProductsStore>;
  expensesStore: () => ReturnType<typeof createExpensesStore>;
  cashFlowsStore: () => ReturnType<typeof createCashFlowsStore>;
  usersStore: () => ReturnType<typeof createUsersStore>;
  vendedoresStore: () => ReturnType<typeof createVendedoresStore>;
  flockIncubationsStore: () => ReturnType<typeof createFlockIncubationsStore>;
  feedStockStore: () => ReturnType<typeof createFeedStockStore>;
  feedStockStoreExtended: () => ReturnType<typeof createFeedStockStoreExtended>;
  flockCleaningsStore: () => ReturnType<typeof createFlockCleaningsStore>;
  /** "Tipo" (Ração) -> id do `feed_stock`, resolvido uma única vez pra aba Ração-Sacos Abertos. */
  feedStockIdByType: () => Promise<Map<string, number>>;
  /** `HttpClient` cru, pra chamadas que nenhum adapter cobre (GET de 1 `flock-incubation` pra preservar `hatchEvents` num update, listar ids de `feed-open-logs`). */
  httpClient: () => HttpClient;
  /** Ids (como string) hoje existentes em `feed-open-logs` — memoizado, 1 GET pro import inteiro. Usado só quando uma linha de "Ração - Sacos Abertos" vem com "ID" preenchido (não existe endpoint de update pra esse recurso, ver `runFeedOpenLog`). */
  feedOpenLogIds: () => Promise<Set<string>>;
  /** "Galpão" (nome) -> id do `barn`, pra resolver a coluna Galpão da Produção. Memoizado. */
  barnIdByName: () => Promise<Map<string, number>>;
  /**
   * Import CLEAN: quando `true`, o "ID" da planilha é IGNORADO e toda linha vira
   * um POST (criação pura). O "ID" exportado é do ambiente de origem (ex.:
   * produção) e não vale no banco de destino — reusá-lo num `PUT` causa colisão:
   * um POST de uma linha ganha um id auto-incremento que um `PUT /{id}` de outra
   * linha depois sobrescreve, e registros somem (ver histórico "50 ovos de
   * codorna" engolido por "1 Bandeja"). Fluxo esperado: resetar o banco → importar.
   */
  forceCreate: boolean;
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

async function fetchFeedOpenLogIds(http: HttpClient): Promise<Set<string>> {
  const list = await firstValueFrom(http.get<{ id: number }[]>(`${environment.apiUrl}/feed-open-logs`));
  return new Set(list.map((item) => String(item.id)));
}

async function fetchBarnIdByName(http: HttpClient): Promise<Map<string, number>> {
  const list = await firstValueFrom(http.get<{ id: number; name: string }[]>(`${environment.apiUrl}/barns`));
  const map = new Map<string, number>();
  for (const item of list) map.set(item.name, item.id);
  return map;
}

function createImportContext(injector: Injector, forceCreate: boolean): ImportContext {
  const run = <T,>(factory: () => T): T => runInInjectionContext(injector, factory);
  const http = memo(() => run(() => inject(HttpClient)));

  const salesStore = memo(() => run(() => createSalesStore()));

  return {
    forceCreate,
    salesStore,
    salesRefs: memoAsync(() => salesStore().fetchRefs()),
    dailyProductionsStore: memo(() => run(() => createDailyProductionsStore())),
    flockStore: memo(() => run(() => createFlockStore())),
    barnsStore: memo(() => run(() => createBarnStore())),
    barnStockStore: memo(() => run(() => createBarnStockStore())),
    vendorStockStore: memo(() => run(() => createVendorStockStore())),
    productsStore: memo(() => run(() => createProductsStore())),
    expensesStore: memo(() => run(() => createExpensesStore())),
    cashFlowsStore: memo(() => run(() => createCashFlowsStore())),
    usersStore: memo(() => run(() => createUsersStore())),
    vendedoresStore: memo(() => run(() => createVendedoresStore())),
    flockIncubationsStore: memo(() => run(() => createFlockIncubationsStore())),
    feedStockStore: memo(() => run(() => createFeedStockStore())),
    feedStockStoreExtended: memo(() => run(() => createFeedStockStoreExtended())),
    flockCleaningsStore: memo(() => run(() => createFlockCleaningsStore())),
    feedStockIdByType: memoAsync(() => fetchFeedStockIdByType(http())),
    httpClient: http,
    feedOpenLogIds: memoAsync(() => fetchFeedOpenLogIds(http())),
    barnIdByName: memoAsync(() => fetchBarnIdByName(http())),
  };
}

/**
 * Traduz erro de `store.add()`/API (ou qualquer exceção inesperada — rede, parse,
 * timeout) pra uma mensagem de 1 linha. Usada no `rowErrors` de cada linha que
 * falhou e reaproveitada pelo caller (`layout-app.ts`) pro catch-all do fluxo de
 * import inteiro, garantindo mensagem consistente pra falha de rede/CORS.
 */
// Assinatura de violação de constraint única vazando cru da API (SQLite
// "UNIQUE constraint failed", MySQL "Duplicate entry", ou o SQLSTATE genérico
// que aparece nos dois) — acontece quando não existe validação `unique:` no
// FormRequest e o erro só é pego no nível do banco (500, mensagem crua).
// Detectado em qualquer status pra virar mensagem legível em vez do SQLSTATE.
const UNIQUE_CONSTRAINT_PATTERN = /SQLSTATE\[23000\]|SQLSTATE\[23505\]|UNIQUE constraint failed|Integrity constraint violation|Duplicate entry|Unique violation|duplicate key value|has already been taken|already been taken|já foi escolhido|já está em uso|já existe/i;

function friendlyIfUniqueConstraint(message: string): string {
  return UNIQUE_CONSTRAINT_PATTERN.test(message) ? 'Já existe um registro com esses dados.' : message;
}

export function describeImportError(e: unknown): string {
  if (e instanceof HttpErrorResponse) {
    // status 0 = requisição nunca chegou a ter resposta HTTP (CORS bloqueado,
    // servidor fora do ar, DNS/rede) — status/mensagem de servidor não existem
    // aqui, então dar uma mensagem específica em vez de "Erro 0 ao salvar.".
    if (e.status === 0) {
      return 'Falha de conexão com o servidor (rede ou CORS). Verifique sua internet e tente novamente.';
    }
    if (e.status === 422) {
      const apiErrors = e.error?.errors as Record<string, string[]> | undefined;
      if (apiErrors) return friendlyIfUniqueConstraint(Object.values(apiErrors).flat().join(' '));
      if (e.error?.message) return friendlyIfUniqueConstraint(String(e.error.message));
    }
    return e.error?.message ? friendlyIfUniqueConstraint(String(e.error.message)) : `Erro ${e.status} ao salvar.`;
  }
  if (e instanceof Error) return e.message;
  return 'Erro desconhecido ao salvar.';
}

/** true quando `e` é um 404 real da API — usado pra decidir "id da planilha não existe mais no backend" (ver `upsert`). */
function isNotFound(e: unknown): boolean {
  return e instanceof HttpErrorResponse && e.status === 404;
}

/** 409 (Conflict) = já existe um registro igual (violação de unicidade). O import IGNORA a linha em vez de falhar. */
function isConflict(e: unknown): boolean {
  return e instanceof HttpErrorResponse && e.status === 409;
}

/**
 * Erro de "já existe esse registro" (violação de unicidade), em qualquer forma:
 * 409 limpo do backend, ou o SQLSTATE cru (23000/23505 — SQLite/Postgres) que
 * vaza num 500 quando não há validação `unique` no FormRequest. O import IGNORA
 * essas linhas (conta como "ignorada", não como falha).
 */
function isDuplicate(e: unknown): boolean {
  if (isConflict(e)) return true;
  if (e instanceof HttpErrorResponse) {
    const parts: string[] = [];
    if (typeof e.error === 'string') parts.push(e.error);
    if (e.error?.message) parts.push(String(e.error.message));
    const apiErrors = e.error?.errors as Record<string, string[]> | undefined;
    if (apiErrors) parts.push(Object.values(apiErrors).flat().join(' '));
    if (e.message) parts.push(e.message);
    return UNIQUE_CONSTRAINT_PATTERN.test(parts.join(' '));
  }
  return e instanceof Error && UNIQUE_CONSTRAINT_PATTERN.test(e.message);
}

/** Reporta progresso linha a linha durante o import — só pra feedback visual (ver `ImportProgress` no modal), não afeta o resultado. */
export interface ImportProgress {
  label: string;
  row: number;
  total: number;
}

interface EntityImporter {
  label: string;
  process(
    ws: XLSX.WorkSheet,
    rowErrors: string[],
    warnings: string[],
    ctx: ImportContext,
    onProgress?: (progress: ImportProgress) => void,
  ): Promise<{ imported: number; failed: number; skipped: number } | undefined>;
}

/**
 * `run` recebe, além do item já validado, o `id` da coluna "ID" (se a linha tinha um — ver
 * `RowItem`), o número da linha (pra mensagem de `warnings`) e o array de `warnings` da aba
 * inteira. A maioria dos `run` usa só `item`/`ctx` (create simples, ex. Fluxo de Caixa/Usuários,
 * que não suportam "ID" — ver `IMPORTERS`) — TS permite omitir os parâmetros finais que não são
 * usados.
 */
type RunFn<T> = (
  item: T,
  ctx: ImportContext,
  id: string | undefined,
  row: number,
  warnings: string[],
) => Promise<void>;

/**
 * Uma linha que falha (validação de planilha OU erro 422 da API, ex.: nome de
 * Produto/Vendedor não encontrado) vira 1 entrada em `rowErrors` e NÃO trava as
 * demais linhas — cada linha é `add()`ada/`update()`ada e tratada isoladamente. Retorna
 * `undefined` quando a aba nem pôde ser lida — coluna obrigatória faltando, OU
 * `parse()` lançou uma exceção inesperada (célula com formato que os helpers de
 * `toNumber`/`parseDate`/etc não previram) — nesse caso a aba inteira é pulada,
 * mas as outras abas do arquivo seguem normais. Antes o throw de `parse()`
 * escapava sem try/catch e subia até `confirmarImportacao()` (`layout-app.ts`),
 * que também não tinha catch — a Promise rejeitava sem nunca tocar os signals de
 * estado, e o modal ficava travado em "confirm" pra sempre (raiz do bug do loop
 * de carregamento infinito).
 */
function makeImporter<T>(
  label: string,
  parse: (ws: XLSX.WorkSheet, rowErrors: string[]) => RowItem<T>[] | undefined,
  run: RunFn<T>,
): EntityImporter {
  return {
    label,
    async process(ws, rowErrors, warnings, ctx, onProgress) {
      let rows: RowItem<T>[] | undefined;
      try {
        rows = parse(ws, rowErrors);
      } catch (e) {
        rowErrors.push(`Aba "${label}": erro ao processar (${describeImportError(e)}).`);
        return undefined;
      }
      if (rows === undefined) return undefined;

      let imported = 0;
      let failed = 0;
      let skipped = 0;
      const total = rows.length;
      let done = 0;
      // Import CLEAN (forceCreate): ignora o "ID" da planilha e cria tudo do zero.
      // O id exportado é de outro ambiente; reusá-lo num PUT colide com os ids
      // auto-incremento que os POSTs vão gerando (ver ImportContext.forceCreate).
      for (const { row, item, id } of rows) {
        try {
          await run(item, ctx, ctx.forceCreate ? undefined : id, row, warnings);
          imported++;
        } catch (e) {
          if (isDuplicate(e)) {
            // Já existe um registro igual — IGNORA a linha (não é falha).
            skipped++;
            warnings.push(`${label} linha ${row}: já existia (mesmos dados) — ignorada.`);
          } else {
            failed++;
            rowErrors.push(`${label} linha ${row}: ${describeImportError(e)}`);
          }
        }
        done++;
        onProgress?.({ label, row: done, total });
      }
      return { imported, failed, skipped };
    },
  };
}

/**
 * Store mínimo que `upsert` precisa — qualquer `EntityStore<T>` real (products, vendedores,
 * flock, daily-productions, expenses, feed-stocks simples, flock-cleanings) satisfaz
 * essa forma estrutural, mesmo tendo mais membros (`items`, `reload`, `remove`).
 */
interface UpsertableStore<T> {
  add(item: T): Promise<void>;
  update(id: string, item: T): Promise<void>;
}

/**
 * Reimportar uma linha com "ID" preenchido vira UPDATE idempotente em vez de CREATE — reimportar
 * o mesmo arquivo várias vezes não duplica nada, cada linha só sobrescreve o registro que já
 * criou da primeira vez. Sem "ID" (planilha nova/editada à mão), cria normal — comportamento de
 * sempre.
 *
 * Se o PUT devolve 404 (id da planilha não existe mais no backend — foi apagado por lá desde o
 * export), recria como novo registro (POST, sem id, deixando o backend gerar outro) em vez de
 * falhar a linha: o dado acaba existindo de qualquer jeito. `warnings` registra que o id original
 * não foi preservado, pro usuário saber (não é silencioso, mas também não trava a importação).
 */
async function upsert<T>(
  id: string | undefined,
  item: T,
  store: UpsertableStore<T>,
  label: string,
  row: number,
  warnings: string[],
): Promise<void> {
  if (id === undefined) {
    try {
      await store.add(item);
    } catch (e) {
      if (isConflict(e)) { warnings.push(`${label} linha ${row}: já existe um registro igual — ignorado.`); return; }
      throw e;
    }
    return;
  }
  try {
    await store.update(id, item);
  } catch (e) {
    if (isConflict(e)) { warnings.push(`${label} linha ${row}: já existe um registro igual — ignorado.`); return; }
    if (!isNotFound(e)) throw e;
    warnings.push(`${label} linha ${row}: ID ${id} não encontrado no backend (registro excluído lá?) — recriado como novo registro.`);
    try {
      await store.add(item);
    } catch (e2) {
      if (isConflict(e2)) { warnings.push(`${label} linha ${row}: já existe um registro igual — ignorado.`); return; }
      throw e2;
    }
  }
}

async function runSales(item: Venda, ctx: ImportContext, id: string | undefined, row: number, warnings: string[]): Promise<void> {
  const refs = await ctx.salesRefs();
  // Resolve o "Local do estoque" da planilha: "Vendedor: <nome>" mantém o
  // vendedor (baixa do estoque dele); "Plantel", "Galpão: X" ou vazio viram
  // Plantel — galpão deixou de ser local de venda (só de produção agora).
  if (item.stockLocationLabel !== undefined) {
    const raw = item.stockLocationLabel.trim();
    const vendedorMatch = raw.match(/^vendedor:\s*(.+)$/i);
    if (vendedorMatch) {
      const name = vendedorMatch[1].trim();
      const vendedorId = refs.vendedores.byName.get(name);
      if (vendedorId === undefined) {
        warnings.push(`${SHEET_NAMES.sales} linha ${row}: vendedor "${name}" do "Local do estoque" não encontrado — venda gravada em Plantel.`);
        item.stockLocation = PLANTEL_LOCATION;
      } else {
        item.stockLocation = vendedorLocation(String(vendedorId));
      }
    } else {
      item.stockLocation = PLANTEL_LOCATION;
    }
    delete item.stockLocationLabel;
  }
  // Import CLEAN (forceCreate): cria a venda SEM baixar estoque — a planilha já
  // traz o saldo final, re-aplicar a baixa contaria em dobro (product.stock/
  // vendor_stock negativos, linhas de estoque de vendedor que a planilha não tem).
  if (id === undefined) {
    await ctx.salesStore().add(item, refs, ctx.forceCreate);
    return;
  }
  try {
    await ctx.salesStore().update(id, item, refs);
  } catch (e) {
    if (!isNotFound(e)) throw e;
    warnings.push(`${SHEET_NAMES.sales} linha ${row}: ID ${id} não encontrado no backend (registro excluído lá?) — recriado como novo registro.`);
    await ctx.salesStore().add(item, refs, ctx.forceCreate);
  }
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

/** Forma crua do `GET /flock-incubations/{id}` — só o necessário pra preservar `hatch_events` num update (ver `runFlockIncubation`). */
interface FlockIncubationHatchEventsApi {
  hatch_events: { id: number; date: string; count: number; notes: string | null }[];
}

/**
 * "Novo Plantel" com "ID" preenchido também vira update, mas não pode reusar o `upsert` genérico:
 * o par único "Data Eclosão"/"Qtd. Nascida" da planilha é sempre reconstruído com um evento novo
 * (`migrateLegacyHatchEvents`, `id: crypto.randomUUID()`), e `syncHatchEvents`
 * (`flock-incubations.adapter.ts`) NUNCA bate esse uuid com um evento já existente no servidor —
 * trataria como nascimento novo TODA reimportação, duplicando a cada rodada. Por isso, busca os
 * `hatch_events` REAIS do servidor antes do update e os mantém intactos (sync vira no-op); só os
 * campos de topo (espécie, contagem de ovos, status, custos, observações) refletem a planilha —
 * mesma perda de granularidade já assumida no export (ver `consolidateHatchEvents`, `export.ts`).
 */
async function runFlockIncubation(
  item: NovoLotePlantel,
  ctx: ImportContext,
  id: string | undefined,
  row: number,
  warnings: string[],
): Promise<void> {
  if (id === undefined) {
    await ctx.flockIncubationsStore().add(item);
    return;
  }
  const base = `${environment.apiUrl}/flock-incubations`;
  try {
    const current = await firstValueFrom(ctx.httpClient().get<FlockIncubationHatchEventsApi>(`${base}/${id}`));
    const preservedHatchEvents = current.hatch_events.map((e) => ({
      id: String(e.id),
      date: e.date,
      count: e.count,
      notes: e.notes ?? undefined,
    }));
    await ctx.flockIncubationsStore().update(id, { ...item, hatchEvents: preservedHatchEvents });
  } catch (e) {
    if (!isNotFound(e)) throw e;
    warnings.push(`${SHEET_NAMES.flockIncubation} linha ${row}: ID ${id} não encontrado no backend (registro excluído lá?) — recriado como novo registro.`);
    await ctx.flockIncubationsStore().add(item);
  }
}

/**
 * Não existe `POST /feed-open-logs` direto — o backend só registra abertura de
 * saco via `POST /feed-stocks/{id}/open-bag` (ver `feed-stocks.adapter.ts`), que
 * TAMBÉM decrementa 1 saco do estoque atual, igual a abrir um saco manualmente
 * pela tela de Controle de Ração. Resolve o `feed_stock` pelo "Tipo" da linha
 * (mesmo padrão de rejeição de `resolveIdByName`: nome não encontrado = linha
 * rejeitada, nunca cria tipo novo).
 *
 * Também não existe `PUT /feed-open-logs/{id}` (recurso só-leitura por id, ver openapi.yaml) —
 * "ID" preenchido não pode virar update de verdade. Se o id ainda existe na lista atual (GET
 * memoizado em `feedOpenLogIds`), a linha é IGNORADA (o log já existe, recriar duplicaria o
 * registro E decrementaria o estoque de novo); se não existe mais, recria como novo (mesmo
 * efeito colateral de abrir um saco novo) e avisa em `warnings` nos dois casos.
 */
async function runFeedOpenLog(
  item: FeedOpenLog,
  ctx: ImportContext,
  id: string | undefined,
  row: number,
  warnings: string[],
): Promise<void> {
  if (id !== undefined) {
    const existingIds = await ctx.feedOpenLogIds();
    if (existingIds.has(id)) {
      warnings.push(
        `${SHEET_NAMES.feedOpenLog} linha ${row}: ID ${id} já existe — linha ignorada (não há endpoint de atualização pra "${SHEET_NAMES.feedOpenLog}", reimportar recriaria o registro e decrementaria o estoque de novo).`,
      );
      return;
    }
    warnings.push(
      `${SHEET_NAMES.feedOpenLog} linha ${row}: ID ${id} não encontrado no backend — recriado como novo registro (decrementa 1 saco do estoque de ração, mesmo efeito de abrir saco novo).`,
    );
  }

  const idByType = await ctx.feedStockIdByType();
  const feedStockId = idByType.get(item.feedType);
  if (feedStockId === undefined) {
    throw new Error(`Tipo de ração "${item.feedType}" não encontrado — cadastre o tipo em Controle de Ração antes de importar.`);
  }
  await ctx.feedStockStoreExtended().openBag(String(feedStockId), { date: item.date, weightKg: item.weightKg });
}

/**
 * Ordem importa pras 3 dependências reais entre abas (confirmadas lendo migration/adapter de
 * cada entidade, não assumidas):
 * - "Produtos" roda antes de "Vendas": `Venda.product` resolve pro `product_id` do backend via
 *   nome (ver `resolveIdByName` em `sales.adapter.ts`) — banco sem produto cadastrado (produção,
 *   que nunca rodou o import inicial) faz toda linha de Vendas falhar com "Produto não
 *   encontrado" se Vendas processar antes de Produtos existir.
 * - "Vendedores" roda antes de "Vendas": mesmo caso do Produto, `Venda.seller` resolve pro
 *   `seller_id` (obrigatório, FK não-nula em `StoreSaleRequest`) via nome — banco de produção
 *   nunca teve vendedor cadastrado (a planilha real do usuário só tinha uma coluna solta
 *   "Vendedor" dentro de Vendas, sem aba própria), daí essa aba existir no export/import.
 * - "Ração" roda antes de "Ração - Sacos Abertos": resolve o tipo recém-criado (`feedStockIdByType`).
 * As demais abas (Produção, Plantel, Despesas, Fluxo de Caixa, Usuários, Novo
 * Plantel, Higienização) não têm FK nem resolução por nome entre si — checado nas
 * migrations do backend (`flock`, `flock_incubations`, `daily_productions`,
 * `expenses`, `cash_flows`, `flock_cleanings` não têm `foreignId`/`constrained` uns
 * pros outros) — por isso a ordem delas é livre.
 *
 * "ID" (update-vs-create, ver `upsert`) é ortogonal a essa ordem: não introduz nenhuma
 * dependência nova entre abas, só muda o método HTTP (PUT em vez de POST) por linha.
 */
const IMPORTERS: EntityImporter[] = [
  makeImporter(SHEET_NAMES.products, parseProducts, (item, ctx, id, row, warnings) =>
    upsert(id, item, ctx.productsStore(), SHEET_NAMES.products, row, warnings),
  ),
  makeImporter(SHEET_NAMES.vendedores, parseVendedores, (item, ctx, id, row, warnings) =>
    upsert(id, item, ctx.vendedoresStore(), SHEET_NAMES.vendedores, row, warnings),
  ),
  // Galpões ANTES de Produção: a coluna "Galpão" da Produção resolve pelo nome
  // do galpão (ver runDailyProduction), então os galpões precisam já existir.
  makeImporter(SHEET_NAMES.barn, parseBarn, (item, ctx, id, row, warnings) =>
    upsert(id, item, ctx.barnsStore(), SHEET_NAMES.barn, row, warnings),
  ),
  makeImporter(SHEET_NAMES.sales, parseSales, runSales),
  makeImporter(SHEET_NAMES.dailyProduction, parseDailyProduction, runDailyProduction),
  makeImporter(SHEET_NAMES.flock, parseFlock, runFlock),
  makeImporter(SHEET_NAMES.expenses, parseExpenses, runExpense),
  // Fluxo de Caixa e Usuários não ganharam coluna "ID" (fora do pedido original) — sempre create.
  makeImporter(SHEET_NAMES.cashFlow, parseCashFlow, (item, ctx) => ctx.cashFlowsStore().add(item)),
  makeImporter(SHEET_NAMES.users, parseUsers, (item, ctx) => runUser(item, ctx)),
  makeImporter(SHEET_NAMES.flockIncubation, parseFlockIncubation, runFlockIncubation),
  makeImporter(SHEET_NAMES.feedStock, parseFeedStock, (item, ctx, id, row, warnings) =>
    upsert(id, item, ctx.feedStockStore(), SHEET_NAMES.feedStock, row, warnings),
  ),
  makeImporter(SHEET_NAMES.feedOpenLog, parseFeedOpenLog, runFeedOpenLog),
  makeImporter(SHEET_NAMES.flockCleaning, parseFlockCleaning, (item, ctx, id, row, warnings) =>
    upsert(id, item, ctx.flockCleaningsStore(), SHEET_NAMES.flockCleaning, row, warnings),
  ),
  // Estoques por local: dependem de Galpões, Produtos e Vendedores já criados
  // (resolvidos por nome). Sem coluna "ID" — upsert por chave natural no backend.
  makeImporter(SHEET_NAMES.barnStock, parseBarnStock, runBarnStock),
  makeImporter(SHEET_NAMES.vendorStock, parseVendorStock, runVendorStock),
];

/** Lê o arquivo e cria/atualiza, via API, cada linha válida nas 12 entidades com adapter (dashboard não tem endpoint de criação — ignorado). */
export async function importWorkbookFile(
  injector: Injector,
  file: File,
  onProgress?: (progress: ImportProgress) => void,
  forceCreate = false,
): Promise<ImportResult> {
  const buffer = await file.arrayBuffer();

  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, { type: 'array' });
  } catch {
    return { success: false, errors: ['Arquivo inválido ou corrompido.'], summary: {}, failed: {}, skipped: {}, rowErrors: [], warnings: [] };
  }

  const present = IMPORTERS.filter((imp) => getSheet(workbook, imp.label) !== null);
  if (present.length === 0) {
    return {
      success: false,
      errors: ['Nenhuma aba reconhecida no arquivo. Baixe o modelo de exemplo pra conferir o formato.'],
      summary: {},
      failed: {},
      skipped: {},
      rowErrors: [],
      warnings: [],
    };
  }

  const ctx = createImportContext(injector, forceCreate);
  const rowErrors: string[] = [];
  const warnings: string[] = [];
  const summary: Record<string, number> = {};
  const failed: Record<string, number> = {};
  const skipped: Record<string, number> = {};

  // Import CLEAN: zera o banco ANTES de carregar (a planilha é a fonte única).
  // Preserva Usuários (login) e Fluxo de Caixa. Ver wipeBeforeImport.
  if (forceCreate) await wipeBeforeImport(ctx, warnings);

  for (const importer of present) {
    const ws = getSheet(workbook, importer.label)!;
    const result = await importer.process(ws, rowErrors, warnings, ctx, onProgress);
    if (result === undefined) continue; // coluna obrigatória faltando — mensagem já em rowErrors, aba inteira pulada
    summary[importer.label] = result.imported;
    if (result.failed > 0) failed[importer.label] = result.failed;
    if (result.skipped > 0) skipped[importer.label] = result.skipped;
  }

  // Import CLEAN: reajusta o estoque pro valor final da planilha. Cada venda
  // importada re-aplicou a baixa (SaleService baixa no create) e cada saco
  // aberto decrementou a ração — mas o estoque da planilha JÁ é o saldo final,
  // então isso deixava product.stock (Plantel) e feed_stock negativos. barn/
  // vendor stock não precisam: são importados DEPOIS das vendas via
  // updateOrCreate, então já ficam com o valor da planilha.
  if (forceCreate) await resetStockFromSheet(workbook, ctx, warnings);

  return { success: true, errors: [], summary, failed, skipped, rowErrors, warnings };
}

/**
 * Import CLEAN: esvazia o banco ANTES de carregar a planilha, pra a planilha ser
 * a fonte única (reimportar substitui tudo, não acumula). Apaga cada entidade
 * pelos DELETE normais da API, na ordem filhos->pais exigida pelas FKs
 * (`restrictOnDelete` em sales/flock/daily_productions/stock_transfers). PRESERVA
 * Usuários (login) e Fluxo de Caixa. Cada delete é isolado — um erro isolado só
 * vira warning e não trava o import.
 *
 * `feed_open_logs` não tem endpoint DELETE (recurso só-leitura por id): ao apagar
 * o `feed_stock`, a FK `nullOnDelete` só zera o vínculo, o log fica. Então zeramos
 * os feed_open_logs à parte, via o novo DELETE de feed-open-logs.
 */
async function wipeBeforeImport(ctx: ImportContext, warnings: string[]): Promise<void> {
  const http = ctx.httpClient();
  const apiBase = environment.apiUrl;

  /** Apaga todas as linhas de `endpoint` (GET lista -> DELETE cada id). */
  async function wipe(endpoint: string): Promise<void> {
    let rows: { id: number }[];
    try {
      rows = await firstValueFrom(http.get<{ id: number }[]>(`${apiBase}/${endpoint}`));
    } catch (e) {
      warnings.push(`CLEAN: não consegui listar ${endpoint} pra limpar (${describeImportError(e)}).`);
      return;
    }
    for (const r of rows) {
      try {
        await firstValueFrom(http.delete<void>(`${apiBase}/${endpoint}/${r.id}`));
      } catch (e) {
        warnings.push(`CLEAN: não removi ${endpoint} #${r.id} (${describeImportError(e)}).`);
      }
    }
  }

  // Filhos e quem tem restrictOnDelete pra produto/vendedor/galpão vão primeiro.
  await wipe('sales'); // sale_exclusions caem por cascade
  await wipe('stock-transfers'); // restringe produto; não é importado, mas precisa sair pro wipe de products
  await wipe('daily-productions');
  await wipe('flock');
  await wipe('flock-cleanings');
  await wipe('flock-incubations'); // hatch_events caem por cascade
  await wipe('expenses'); // expense_species_overrides caem por cascade
  await wipe('feed-open-logs'); // some sacos abertos antigos (sem isso, reimport duplicaria)
  await wipe('feed-stocks');
  // Pais, depois que nada mais os referencia. barn_stock e vendor_stock têm
  // cascadeOnDelete em produto/vendedor/galpão, então caem sozinhos aqui — não
  // precisam de wipe próprio (e barn-stocks nem tem endpoint DELETE).
  await wipe('products');
  await wipe('vendedores');
  await wipe('barns');
  // Usuários e Fluxo de Caixa nunca são tocados (login + caixa preservados).
}

/**
 * Reajuste de estoque do import CLEAN (ver chamada em `importWorkbookFile`):
 * sobrescreve `product.stock` e `feed_stock` com os valores da planilha, que são
 * o saldo FINAL (pós-vendas/pós-aberturas). Sem isso, a baixa que cada venda/
 * saco aberto reaplica durante o import deixa esses saldos negativos. Resolve
 * produto por nome e tipo de ração por "Tipo" (o "ID" da planilha é ignorado no
 * CLEAN). Cada PUT é isolado — uma falha vira warning, não trava o import.
 */
async function resetStockFromSheet(wb: XLSX.WorkBook, ctx: ImportContext, warnings: string[]): Promise<void> {
  const prodSheet = wb.Sheets[SHEET_NAMES.products];
  if (prodSheet) {
    const refs = await ctx.salesRefs();
    const store = ctx.productsStore();
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(prodSheet, { defval: '' });
    for (const row of rows) {
      const name = toRequiredString(row['Produto']);
      const id = refs.products.byName.get(name);
      const item = store.items().find((p) => p.name === name);
      if (id === undefined || !item) continue;
      const stock = toNumber(row['Estoque']) ?? 0;
      // Sempre reaplica o PUT: o `item` do store no front carrega o stock de
      // CRIAÇÃO (o front nunca viu a baixa que o backend aplicou por venda),
      // então comparar com ele não detectaria o negativo no banco.
      try {
        await store.update(String(id), { ...item, stock });
      } catch (e) {
        warnings.push(`CLEAN: não reajustei o estoque de "${name}" (${describeImportError(e)}).`);
      }
    }
  }

  const feedSheet = wb.Sheets[SHEET_NAMES.feedStock];
  if (feedSheet) {
    const idByType = await ctx.feedStockIdByType();
    const store = ctx.feedStockStore();
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(feedSheet, { defval: '' });
    for (const row of rows) {
      const type = toRequiredString(row['Tipo']);
      const id = idByType.get(type);
      const item = store.items().find((f) => f.type === type);
      if (id === undefined || !item) continue;
      const bagsInStock = toNumber(row['Sacos em Estoque']) ?? 0;
      const kgInStock = toNumber(row['Kg em Estoque']) ?? 0;
      // Sempre reaplica o PUT (mesmo motivo do produto): o store do front tem o
      // saldo de criação, não o decrementado pelas aberturas de saco no backend.
      try {
        await store.update(String(id), { ...item, bagsInStock, kgInStock });
      } catch (e) {
        warnings.push(`CLEAN: não reajustei a ração "${type}" (${describeImportError(e)}).`);
      }
    }
  }
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

/**
 * "ID" (coluna opcional — só existe em arquivo exportado por essa versão do app, primeira
 * coluna de cada aba com entidade, ver `export.ts`) — quando preenchida, é o id real do
 * registro no backend, usado pra reimportar como UPDATE em vez de CREATE (ver
 * `upsert`/`IMPORTERS`). `null` = coluna vazia ou ausente (linha nova — cria normal). `undefined`
 * = valor presente mas não-numérico (planilha editada à mão com lixo na coluna) — vira erro de
 * linha, mesmo padrão dos outros campos obrigatórios/validados.
 */
function parseId(value: unknown): string | null | undefined {
  const trimmed = toRequiredString(value);
  if (trimmed === '') return null;
  return /^\d+$/.test(trimmed) ? trimmed : undefined;
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
    const idRaw = parseId(row['ID']);
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

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
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

    if (
      idRaw !== undefined &&
      date &&
      product &&
      quantity !== undefined &&
      unitPrice !== undefined &&
      total !== undefined
    ) {
      const stockLocationLabel = toRequiredString(row['Local do estoque']);
      result.push({
        row: r,
        id: idRaw ?? undefined,
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
          ...(stockLocationLabel ? { stockLocationLabel } : {}),
        },
      });
    }
  });
  return result;
}

function parseBarn(ws: XLSX.WorkSheet, errors: string[]): RowItem<Barn>[] | undefined {
  const label = SHEET_NAMES.barn;
  const header = readHeader(ws);
  if (!requireColumns(header, label, ['Nome'], errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<Barn>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const idRaw = parseId(row['ID']);
    const name = toRequiredString(row['Nome']);
    const location = toRequiredString(row['Localização']);
    const startDate = parseDate(row['Início']);
    const notes = toRequiredString(row['Observação']);

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
    if (!name) errors.push(`${label} linha ${r}: "Nome" vazio.`);
    if (startDate === undefined) errors.push(`${label} linha ${r}: "Início" em formato inválido.`);

    if (idRaw !== undefined && name && startDate !== undefined) {
      result.push({
        row: r,
        id: idRaw ?? undefined,
        item: { name, location: location || null, startDate: startDate ?? null, notes: notes || null },
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
    const idRaw = parseId(row['ID']);
    const date = parseDate(row['Data']);
    const quailEggs = toOptionalNumber(row['Ovos Codorna']);
    const chickenEggs = toOptionalNumber(row['Ovos Galinha']);

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (quailEggs === undefined) errors.push(`${label} linha ${r}: "Ovos Codorna" inválido.`);
    if (chickenEggs === undefined) errors.push(`${label} linha ${r}: "Ovos Galinha" inválido.`);

    if (idRaw !== undefined && date) {
      const barnName = toRequiredString(row['Galpão']);
      result.push({
        row: r,
        id: idRaw ?? undefined,
        item: { date, quailEggs: quailEggs ?? null, chickenEggs: chickenEggs ?? null, ...(barnName ? { barnName } : {}) },
      });
    }
  });
  return result;
}

/** Resolve o nome do galpão (coluna "Galpão") pro `barnId` e faz o upsert. Sem galpão na planilha → null (legado). */
async function runDailyProduction(item: ProducaoDiaria, ctx: ImportContext, id: string | undefined, row: number, warnings: string[]): Promise<void> {
  if (item.barnName) {
    const barns = await ctx.barnIdByName();
    const barnId = barns.get(item.barnName);
    if (barnId === undefined) {
      warnings.push(`${SHEET_NAMES.dailyProduction} linha ${row}: galpão "${item.barnName}" não encontrado — produção importada sem galpão.`);
    }
    item.barnId = barnId ?? null;
  }
  delete item.barnName;
  await upsert(id, item, ctx.dailyProductionsStore(), SHEET_NAMES.dailyProduction, row, warnings);
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
    const idRaw = parseId(row['ID']);
    const species = toRequiredString(row['Espécie']);
    const quantity = toNumber(row['Quantidade']);
    const feedBagsPerMonth = toNumber(row['Sacos Ração/Mês']);
    const bagPrice = toNumber(row['Preço Saco']);
    const monthlyTotal = toNumber(row['Total Mês']);

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
    if (!species) errors.push(`${label} linha ${r}: "Espécie" vazia.`);
    if (quantity === undefined) errors.push(`${label} linha ${r}: "Quantidade" inválida.`);
    if (feedBagsPerMonth === undefined) errors.push(`${label} linha ${r}: "Sacos Ração/Mês" inválido.`);
    if (bagPrice === undefined) errors.push(`${label} linha ${r}: "Preço Saco" inválido.`);
    if (monthlyTotal === undefined) errors.push(`${label} linha ${r}: "Total Mês" inválido.`);

    if (
      idRaw !== undefined &&
      species &&
      quantity !== undefined &&
      feedBagsPerMonth !== undefined &&
      bagPrice !== undefined &&
      monthlyTotal !== undefined
    ) {
      const barnName = toRequiredString(row['Galpão']);
      result.push({ row: r, id: idRaw ?? undefined, item: { species, quantity, feedBagsPerMonth, bagPrice, monthlyTotal, ...(barnName ? { barnName } : {}) } });
    }
  });
  return result;
}

/** Resolve o galpão (coluna "Galpão") pro `barnId` e faz upsert do flock. */
async function runFlock(item: Plantel, ctx: ImportContext, id: string | undefined, row: number, warnings: string[]): Promise<void> {
  if (item.barnName) {
    const barns = await ctx.barnIdByName();
    const barnId = barns.get(item.barnName);
    if (barnId === undefined) warnings.push(`${SHEET_NAMES.flock} linha ${row}: galpão "${item.barnName}" não encontrado — espécie importada sem galpão.`);
    item.barnId = barnId ?? null;
  }
  delete item.barnName;
  await upsert(id, item, ctx.flockStore(), SHEET_NAMES.flock, row, warnings);
}

function parseBarnStock(ws: XLSX.WorkSheet, errors: string[]): RowItem<BarnStockRow>[] | undefined {
  const label = SHEET_NAMES.barnStock;
  const header = readHeader(ws);
  if (!requireColumns(header, label, ['Galpão', 'Produto', 'Quantidade'], errors)) return undefined;
  const rows = readRows(ws);
  const result: RowItem<BarnStockRow>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const barnName = toRequiredString(row['Galpão']);
    const product = toRequiredString(row['Produto']);
    const quantity = toNumber(row['Quantidade']);
    if (!barnName) errors.push(`${label} linha ${r}: "Galpão" vazio.`);
    if (!product) errors.push(`${label} linha ${r}: "Produto" vazio.`);
    if (quantity === undefined) errors.push(`${label} linha ${r}: "Quantidade" inválida.`);
    if (barnName && product && quantity !== undefined) result.push({ row: r, item: { barnName, product, quantity } });
  });
  return result;
}

async function runBarnStock(item: BarnStockRow, ctx: ImportContext, _id: string | undefined, row: number, warnings: string[]): Promise<void> {
  const [barns, refs] = await Promise.all([ctx.barnIdByName(), ctx.salesRefs()]);
  const barnId = barns.get(item.barnName);
  const productId = refs.products.byName.get(item.product);
  if (barnId === undefined) { warnings.push(`${SHEET_NAMES.barnStock} linha ${row}: galpão "${item.barnName}" não encontrado — pulado.`); return; }
  if (productId === undefined) { warnings.push(`${SHEET_NAMES.barnStock} linha ${row}: produto "${item.product}" não encontrado — pulado.`); return; }
  await ctx.barnStockStore().set(String(barnId), productId, item.quantity);
}

function parseVendorStock(ws: XLSX.WorkSheet, errors: string[]): RowItem<VendorStockRow>[] | undefined {
  const label = SHEET_NAMES.vendorStock;
  const header = readHeader(ws);
  if (!requireColumns(header, label, ['Vendedor', 'Produto', 'Quantidade'], errors)) return undefined;
  const rows = readRows(ws);
  const result: RowItem<VendorStockRow>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const vendedorName = toRequiredString(row['Vendedor']);
    const product = toRequiredString(row['Produto']);
    const quantity = toNumber(row['Quantidade']);
    if (!vendedorName) errors.push(`${label} linha ${r}: "Vendedor" vazio.`);
    if (!product) errors.push(`${label} linha ${r}: "Produto" vazio.`);
    if (quantity === undefined) errors.push(`${label} linha ${r}: "Quantidade" inválida.`);
    if (vendedorName && product && quantity !== undefined) result.push({ row: r, item: { vendedorName, product, quantity } });
  });
  return result;
}

async function runVendorStock(item: VendorStockRow, ctx: ImportContext, _id: string | undefined, row: number, warnings: string[]): Promise<void> {
  const refs = await ctx.salesRefs();
  const vendedorId = refs.vendedores.byName.get(item.vendedorName);
  if (vendedorId === undefined) { warnings.push(`${SHEET_NAMES.vendorStock} linha ${row}: vendedor "${item.vendedorName}" não encontrado — pulado.`); return; }
  await ctx.vendorStockStore().add({ product: item.product, vendedorId: String(vendedorId), quantity: item.quantity });
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
    const idRaw = parseId(row['ID']);
    const name = toRequiredString(row['Produto']);
    const unit = toRequiredString(row['Unidade']);
    const unitPrice = toNumber(row['Preço Unitário']);
    const stock = toNumber(row['Estoque']);
    const eggsPerUnit = toNumber(row['Ovos por Unidade']);

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
    if (!name) errors.push(`${label} linha ${r}: "Produto" vazio.`);
    if (!unit) errors.push(`${label} linha ${r}: "Unidade" vazia.`);
    if (unitPrice === undefined) errors.push(`${label} linha ${r}: "Preço Unitário" inválido.`);
    if (stock === undefined) errors.push(`${label} linha ${r}: "Estoque" inválido.`);
    if (eggsPerUnit === undefined) errors.push(`${label} linha ${r}: "Ovos por Unidade" inválido.`);

    if (idRaw !== undefined && name && unit && unitPrice !== undefined && stock !== undefined && eggsPerUnit !== undefined) {
      result.push({ row: r, id: idRaw ?? undefined, item: { name, unit, unitPrice, stock, eggsPerUnit } });
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
    const idRaw = parseId(row['ID']);
    const date = parseDate(row['Data']);
    const description = toRequiredString(row['Descrição']);
    const category = toRequiredString(row['Categoria']);
    const barnName = toRequiredString(row['Galpão']);
    const quantity = toOptionalNumber(row['Qtd.']);
    const unitPrice = toOptionalNumber(row['Valor unit.']);
    const amount = toNumber(row['Valor']);
    const paidRaw = toRequiredString(row['Pago']);
    const paidNorm = paidRaw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
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
      idRaw !== undefined &&
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
        id: idRaw ?? undefined,
        item: {
          date,
          description,
          category,
          ...(barnName ? { barnName } : {}),
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

/** Resolve o nome do galpão (coluna "Galpão") pro `barnId` e faz o upsert. Sem galpão na planilha → despesa geral (sem galpão). */
async function runExpense(item: Expense, ctx: ImportContext, id: string | undefined, row: number, warnings: string[]): Promise<void> {
  if (item.barnName) {
    const barns = await ctx.barnIdByName();
    const barnId = barns.get(item.barnName);
    if (barnId === undefined) {
      warnings.push(`${SHEET_NAMES.expenses} linha ${row}: galpão "${item.barnName}" não encontrado — despesa importada sem galpão.`);
    }
    item.barnId = barnId !== undefined ? String(barnId) : undefined;
  }
  delete item.barnName;
  await upsert(id, item, ctx.expensesStore(), SHEET_NAMES.expenses, row, warnings);
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

function parseVendedores(ws: XLSX.WorkSheet, errors: string[]): RowItem<Vendedor>[] | undefined {
  const label = SHEET_NAMES.vendedores;
  const header = readHeader(ws);
  if (!requireColumns(header, label, ['Nome', 'Ativo'], errors)) return undefined;

  const rows = readRows(ws);
  const result: RowItem<Vendedor>[] = [];
  rows.forEach((row, i) => {
    const r = rowRef(i);
    const idRaw = parseId(row['ID']);
    const name = toRequiredString(row['Nome']);
    const contact = toRequiredString(row['Contato']);
    const ativoRaw = toRequiredString(row['Ativo']);
    const ativoNorm = ativoRaw.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
    if (!name) errors.push(`${label} linha ${r}: "Nome" vazio.`);
    if (ativoNorm !== 'sim' && ativoNorm !== 'nao') {
      errors.push(`${label} linha ${r}: "Ativo" deve ser Sim ou Não (veio "${row['Ativo']}").`);
    }

    if (idRaw !== undefined && name && (ativoNorm === 'sim' || ativoNorm === 'nao')) {
      result.push({ row: r, id: idRaw ?? undefined, item: { name, contact, active: ativoNorm === 'sim' } });
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
    const idRaw = parseId(row['ID']);
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

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
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
      idRaw !== undefined &&
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
        id: idRaw ?? undefined,
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
    const idRaw = parseId(row['ID']);
    const type = toRequiredString(row['Tipo']);
    const bagsInStock = toNumber(row['Sacos em Estoque']);
    const kgInStock = toNumber(row['Kg em Estoque']);
    const lastBagWeightKg = toNumber(row['Peso do Saco']);
    const expirationDate = parseDate(row['Validade']);

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
    if (!type) errors.push(`${label} linha ${r}: "Tipo" vazio.`);
    if (bagsInStock === undefined) errors.push(`${label} linha ${r}: "Sacos em Estoque" inválido.`);
    if (kgInStock === undefined) errors.push(`${label} linha ${r}: "Kg em Estoque" inválido.`);
    if (lastBagWeightKg === undefined) errors.push(`${label} linha ${r}: "Peso do Saco" inválido.`);
    if (expirationDate === undefined) errors.push(`${label} linha ${r}: "Validade" em formato inválido.`);

    if (
      idRaw !== undefined &&
      type &&
      bagsInStock !== undefined &&
      kgInStock !== undefined &&
      lastBagWeightKg !== undefined &&
      expirationDate !== undefined
    ) {
      result.push({ row: r, id: idRaw ?? undefined, item: { type, bagsInStock, kgInStock, lastBagWeightKg, expirationDate } });
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
    const idRaw = parseId(row['ID']);
    const date = parseDate(row['Data']);
    const species = parseSpecies(row['Espécie']);
    const cleaningType = parseCleaningType(row['Tipo']);
    const notes = toRequiredString(row['Observações']);

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
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

    if (idRaw !== undefined && date && species && cleaningType && compatible) {
      result.push({ row: r, id: idRaw ?? undefined, item: { date, species, cleaningType, ...(notes ? { notes } : {}) } });
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
    const idRaw = parseId(row['ID']);
    const date = parseDate(row['Data']);
    const feedType = toRequiredString(row['Tipo']);
    const weightKg = toNumber(row['Peso Aberto (kg)']);

    if (idRaw === undefined) errors.push(`${label} linha ${r}: "ID" inválido (deve ser um número inteiro).`);
    if (!date) errors.push(`${label} linha ${r}: "Data" inválida ou vazia.`);
    if (!feedType) errors.push(`${label} linha ${r}: "Tipo" vazio.`);
    if (weightKg === undefined) errors.push(`${label} linha ${r}: "Peso Aberto (kg)" inválido.`);

    if (idRaw !== undefined && date && feedType && weightKg !== undefined) {
      result.push({ row: r, id: idRaw ?? undefined, item: { feedType, date, weightKg } });
    }
  });
  return result;
}
