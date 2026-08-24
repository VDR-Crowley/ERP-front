import * as XLSX from 'xlsx';
import { of } from 'rxjs';
import { TestBed } from '@angular/core/testing';
import { Injector } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { buildExportWorkbook } from './export';
import { importWorkbookFile } from './import';
import { settleHttp } from '@core/testing/http-settle';
import { IndexedDbService } from '@core/idb/idb.service';
import { environment } from '../../../environments/environment';

const api = environment.apiUrl;
const urls = {
  products: `${api}/products`,
  vendedores: `${api}/vendedores`,
  sales: `${api}/sales`,
  dailyProductions: `${api}/daily-productions`,
  eggStocks: `${api}/egg-stocks`,
  flock: `${api}/flock`,
  expenses: `${api}/expenses`,
  cashFlows: `${api}/cash-flows`,
  users: `${api}/users`,
  flockIncubations: `${api}/flock-incubations`,
  feedStocks: `${api}/feed-stocks`,
  feedOpenLogs: `${api}/feed-open-logs`,
  flockCleanings: `${api}/flock-cleanings`,
  eggLosses: `${api}/egg-losses`,
};

describe('buildExportWorkbook', () => {
  let httpMock: HttpTestingController;
  let injector: Injector;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        // `typeof indexedDB === 'undefined'` no ambiente de teste — `IndexedDbService` real
        // rejeitaria (branch de SSR). Só "Dashboard" usa `idb.getAll`, o resto vem da API.
        { provide: IndexedDbService, useValue: { getAll: () => of([]) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    injector = TestBed.inject(Injector);
  });

  afterEach(() => httpMock.verify());

  // Regressão: `export.ts` lia de `IndexedDbService`/`IDB_STORES` — fonte morta desde que o
  // app migrou pra API real (`core/api/adapters/*`, commit a5d21c1). Só "Dashboard" ainda
  // escreve no IDB (sem endpoint de criação); todas as outras 12 abas exportavam vazio/stale
  // porque nenhuma tela grava mais lá. Prova que cada aba agora vem do endpoint real.
  it('monta cada aba a partir da API real, não do IndexedDB (só "Dashboard" ainda vem de lá)', async () => {
    const promise = buildExportWorkbook(injector);

    httpMock.expectOne(urls.products).flush([
      { id: 1, name: 'Ovo Real', unit: 'dz', unit_price: '15.00', stock: 10, eggs_per_unit: 12 },
    ]);
    httpMock.expectOne(urls.vendedores).flush([
      { id: 5, name: 'Karol', contact: '(11) 90000-0001', active: true },
    ]);
    httpMock.expectOne(urls.sales).flush([
      {
        id: 1,
        date: '2026-07-01',
        product_id: 1,
        quantity: 2,
        unit_price: '15.00',
        total: '30.00',
        payment_pending: false,
        buyer: 'Cliente A',
        seller_id: 5,
        delivery_pending: true,
        delivery_date: null,
      },
    ]);
    httpMock.expectOne(urls.dailyProductions).flush([
      { id: 1, date: '2026-07-01', quail_eggs: 100, chicken_eggs: 20 },
    ]);
    httpMock.expectOne(urls.eggStocks).flush([
      {
        id: 1, date: '2026-07-01', quail_eggs: 50, chicken_eggs: 10,
        quail_packs: '5.00', chicken_packs: '2.00', quail_stock_value: '75.00', chicken_stock_value: '20.00',
      },
    ]);
    httpMock.expectOne(urls.flock).flush([
      { id: 1, species: 'Codornas', quantity: 130, feed_bags_per_month: 3, bag_price: '106.00', monthly_total: '318.00' },
    ]);
    httpMock.expectOne(urls.expenses).flush([
      { id: 1, date: '2026-07-01', description: 'Ração', category: 'Ração', quantity: 1, unit_price: '106.00', amount: '106.00', paid: true },
    ]);
    httpMock.expectOne(urls.cashFlows).flush([
      { id: 1, date: '2026-07-01', description: 'Venda', inflow: true, amount: '30.00' },
    ]);
    httpMock.expectOne(urls.users).flush([{ id: 1, name: 'Karol', email: 'karol@x.com', is_active: true }]);
    httpMock.expectOne(urls.flockIncubations).flush([
      {
        id: 1, start_date: '2026-06-01', species: 'quail', egg_count: 50, expected_hatch_date: '2026-06-19',
        status: 'eclodido', egg_cost: '25.00', feed_cost: '10.00', notes: null,
        // 2 eventos incrementais — export consolida em 1 par (soma + data mais recente).
        hatch_events: [
          { id: 10, date: '2026-06-19', count: 20, notes: null },
          { id: 11, date: '2026-06-20', count: 30, notes: null },
        ],
      },
    ]);
    httpMock.expectOne(urls.feedStocks).flush([
      { id: 1, type: 'Codorna postura', bags_in_stock: 5, kg_in_stock: '100.00', last_bag_weight_kg: '20.00', expiration_date: '2026-12-01' },
    ]);
    httpMock.expectOne(urls.feedOpenLogs).flush([
      { id: 1, feed_type: 'Codorna postura', date: '2026-07-01', weight_kg: '20.00' },
    ]);
    httpMock.expectOne(urls.flockCleanings).flush([
      { id: 1, date: '2026-07-01', species: 'quail', cleaning_type: 'total', notes: null },
    ]);
    httpMock.expectOne(urls.eggLosses).flush([
      { id: 1, date: '2026-07-01', species: 'quail', quantity: 5, reason: 'Quebrado' },
    ]);

    const wb = await promise;
    const sheet = <T>(name: string) => XLSX.utils.sheet_to_json<T>(wb.Sheets[name]);

    expect(sheet('Vendedores')).toEqual([{ ID: 5, Nome: 'Karol', Contato: '(11) 90000-0001', Ativo: 'Sim' }]);
    expect(sheet('Produtos')).toEqual([
      { ID: 1, Produto: 'Ovo Real', Unidade: 'dz', 'Preço Unitário': 15, Estoque: 10, 'Ovos por Unidade': 12 },
    ]);
    // Vendas resolve product_id/seller_id -> nome usando o que já foi buscado pras próprias
    // abas Produtos/Vendedores (sem GET extra — só 1 GET de cada em `urls` acima).
    expect(sheet('Vendas')).toEqual([
      {
        ID: 1,
        Data: '01/07/2026',
        Produto: 'Ovo Real',
        Quantidade: 2,
        'Preço Unitário': 15,
        Total: 30,
        'Status Pagamento': 'PAGO',
        Comprador: 'Cliente A',
        Vendedor: 'Karol',
        'Status da entrega': 'FALTA',
        'Data da Entrega': '',
      },
    ]);
    // Consolidação de hatch_events: 20+30=50 nascidos, data = a mais recente (20/06).
    expect(sheet('Novo Plantel')).toEqual([
      {
        ID: 1,
        'Data Incubadora': '01/06/2026',
        Espécie: 'Codorna',
        'Qtd. Ovos': 50,
        'Eclosão Prevista': '19/06/2026',
        'Data Eclosão': '20/06/2026',
        'Qtd. Nascida': 50,
        Status: 'eclodido',
        'Custo Ovos': 25,
        'Custo Ração': 10,
        Observações: '',
      },
    ]);
    // API nunca devolve senha nem telefone — sai em branco de propósito (ver comentário em
    // `export.ts`), reimportar essa aba falha por linha com "Senha vazia", não silenciosamente.
    // "Usuários" fica de fora da coluna "ID" de propósito (fora do pedido original).
    expect(sheet('Usuários')).toEqual([{ Nome: 'Karol', 'E-mail': 'karol@x.com', Senha: '', Telefone: '' }]);
    expect(sheet('Ração - Sacos Abertos')).toEqual([
      { ID: 1, Data: '01/07/2026', Tipo: 'Codorna postura', 'Peso Aberto (kg)': 20 },
    ]);
    expect(sheet('Perda de Ovos')).toEqual([
      { ID: 1, Data: '01/07/2026', Espécie: 'Codorna', Quantidade: 5, Motivo: 'Quebrado' },
    ]);
  });

  // Pedido do usuário: "ID" (id real do backend) precisa ser a 1ª coluna em TODA aba de
  // entidade, exceto Fluxo de Caixa/Usuários/Dashboard (fora de escopo — ver docstring de
  // `export.ts`). Prova via a célula A1 (cabeçalho) de cada aba, sem depender do conteúdo.
  it('"ID" é a 1ª coluna em toda aba com entidade (exceto Fluxo de Caixa/Usuários/Dashboard)', async () => {
    const promise = buildExportWorkbook(injector);
    for (const url of Object.values(urls)) httpMock.expectOne(url).flush([]);

    const wb = await promise;
    const firstHeaderCell = (name: string) => wb.Sheets[name]['A1']?.v;

    const sheetsWithId = [
      'Vendedores',
      'Produtos',
      'Vendas',
      'Produção',
      'Estoque de Ovos',
      'Plantel',
      'Despesas',
      'Novo Plantel',
      'Ração',
      'Ração - Sacos Abertos',
      'Higienização',
      'Perda de Ovos',
    ];
    for (const name of sheetsWithId) {
      expect(firstHeaderCell(name), `aba "${name}" deveria ter "ID" como 1ª coluna`).toBe('ID');
    }

    expect(firstHeaderCell('Fluxo de Caixa')).toBe('Data');
    expect(firstHeaderCell('Usuários')).toBe('Nome');
  });
});

describe('export -> reimport (ciclo completo)', () => {
  let httpMock: HttpTestingController;
  let injector: Injector;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: IndexedDbService, useValue: { getAll: () => of([]) } },
      ],
    });
    httpMock = TestBed.inject(HttpTestingController);
    injector = TestBed.inject(Injector);
  });

  afterEach(() => httpMock.verify());

  // Ciclo completo do pedido do usuário: exportar o que já está em LOCAL (com Vendedores e
  // Produtos cadastrados) e reimportar num ambiente vazio (produção, 0 registros). Como o
  // export agora inclui "ID" (id real de LOCAL), o import tenta primeiro UPDATE (PUT) por esse
  // id — que 404 no ambiente vazio (esses ids não existem lá) — e só então cria via POST,
  // avisando em `warnings` que o id original não foi preservado. A Venda ainda precisa resolver
  // Produto/Vendedor pros ids NOVOS criados no destino (200/100), não os de local (1/5).
  it('exporta Vendedores/Produtos/Vendas de "local" e reimporta em ambiente vazio: PUT 404 (id não existe lá) cai pra POST, sem duplicar', async () => {
    const exportPromise = buildExportWorkbook(injector);

    httpMock.expectOne(urls.products).flush([
      { id: 1, name: 'Ovo Real', unit: 'dz', unit_price: '15.00', stock: 10, eggs_per_unit: 12 },
    ]);
    httpMock.expectOne(urls.vendedores).flush([{ id: 5, name: 'Karol', contact: null, active: true }]);
    httpMock.expectOne(urls.sales).flush([
      {
        id: 1, date: '2026-07-01', product_id: 1, quantity: 2, unit_price: '15.00', total: '30.00',
        payment_pending: false, buyer: 'Cliente A', seller_id: 5, delivery_pending: true, delivery_date: null,
      },
    ]);
    httpMock.expectOne(urls.dailyProductions).flush([]);
    httpMock.expectOne(urls.eggStocks).flush([]);
    httpMock.expectOne(urls.flock).flush([]);
    httpMock.expectOne(urls.expenses).flush([]);
    httpMock.expectOne(urls.cashFlows).flush([]);
    httpMock.expectOne(urls.users).flush([]);
    httpMock.expectOne(urls.flockIncubations).flush([]);
    httpMock.expectOne(urls.feedStocks).flush([]);
    httpMock.expectOne(urls.feedOpenLogs).flush([]);
    httpMock.expectOne(urls.flockCleanings).flush([]);
    httpMock.expectOne(urls.eggLosses).flush([]);

    const wb = await exportPromise;
    expect(XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets['Produtos'])[0]['ID']).toBe(1);
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = new File([buffer], 'export-local.xlsx');

    // Ambiente de destino "vazio" (produção antes de qualquer import) — reimporta o arquivo
    // acabado de exportar. IMPORTERS roda Produtos e Vendedores antes de Vendas.
    const importPromise = importWorkbookFile(injector, file);

    (await waitOne(httpMock, urls.products, 'GET')).flush([]);
    const productPut = await waitOne(httpMock, `${urls.products}/1`, 'PUT');
    productPut.flush({ message: 'Não encontrado.' }, { status: 404, statusText: 'Not Found' });
    const productPost = await waitOne(httpMock, urls.products, 'POST');
    expect(productPost.request.body).toEqual({
      name: 'Ovo Real', unit: 'dz', unit_price: 15, stock: 10, eggs_per_unit: 12,
    });
    productPost.flush({ id: 200, name: 'Ovo Real', unit: 'dz', unit_price: '15.00', stock: 10, eggs_per_unit: 12 });

    (await waitOne(httpMock, urls.vendedores, 'GET')).flush([]);
    const vendedorPut = await waitOne(httpMock, `${urls.vendedores}/5`, 'PUT');
    vendedorPut.flush({ message: 'Não encontrado.' }, { status: 404, statusText: 'Not Found' });
    const vendedorPost = await waitOne(httpMock, urls.vendedores, 'POST');
    expect(vendedorPost.request.body).toEqual({ name: 'Karol', contact: null, active: true });
    vendedorPost.flush({ id: 100, name: 'Karol', contact: null, active: true });

    // Vendas: cria a store (GET /sales) e resolve refs (GET /products + GET /vendedores) —
    // já reflete Produtos/Vendedores recém-criados acima (ids 200/100 do ambiente novo, NÃO
    // os ids 1/5 de local, que não existem aqui).
    await settleHttp(httpMock, urls.sales, []);
    await settleHttp(httpMock, urls.products, [{ id: 200, name: 'Ovo Real' }]);
    await settleHttp(httpMock, urls.vendedores, [{ id: 100, name: 'Karol' }]);

    const salesPut = await waitOne(httpMock, `${urls.sales}/1`, 'PUT');
    salesPut.flush({ message: 'Não encontrado.' }, { status: 404, statusText: 'Not Found' });
    const salesPost = await waitOne(httpMock, urls.sales, 'POST');
    expect(salesPost.request.body).toMatchObject({ product_id: 200, seller_id: 100 });
    salesPost.flush({
      id: 1, date: '2026-07-01', product_id: 200, quantity: 2, unit_price: '15.00', total: '30.00',
      payment_pending: false, buyer: 'Cliente A', seller_id: 100, delivery_pending: true, delivery_date: null,
      stock_location_type: 'plantel', stock_location_vendedor_id: null,
    });

    const result = await importPromise;

    expect(result.success).toBe(true);
    // As outras 10 abas vieram vazias de "local" (`[]` flushado acima) — o export ainda assim
    // escreve o cabeçalho (ver `header` explícito em cada `json_to_sheet` de `export.ts`), então
    // o reimport reconhece a aba e conta 0 linhas em vez de "coluna(s) faltando".
    expect(result.summary).toEqual({
      Produtos: 1,
      Vendedores: 1,
      Vendas: 1,
      Produção: 0,
      'Estoque de Ovos': 0,
      Plantel: 0,
      Despesas: 0,
      'Fluxo de Caixa': 0,
      Usuários: 0,
      'Novo Plantel': 0,
      Ração: 0,
      'Ração - Sacos Abertos': 0,
      Higienização: 0,
      'Perda de Ovos': 0,
    });
    expect(result.failed).toEqual({});
    expect(result.rowErrors).toEqual([]);
    expect(result.warnings).toEqual([
      'Produtos linha 2: ID 1 não encontrado no backend (registro excluído lá?) — recriado como novo registro.',
      'Vendedores linha 2: ID 5 não encontrado no backend (registro excluído lá?) — recriado como novo registro.',
      'Vendas linha 2: ID 1 não encontrado no backend (registro excluído lá?) — recriado como novo registro.',
    ]);

    // Nenhum POST a mais em nenhuma das 3 URLs — 1 linha exportada, 1 PUT (404) + 1 POST, sem duplicar.
    httpMock.expectNone({ url: urls.products, method: 'POST' });
    httpMock.expectNone({ url: urls.vendedores, method: 'POST' });
    httpMock.expectNone({ url: urls.sales, method: 'POST' });
  });

  // Complementa o teste acima: se o mesmo arquivo local fosse reimportado NO PRÓPRIO ambiente
  // local (onde os ids 1/5 realmente existem), o PUT teria sucesso de primeira — update
  // idempotente, sem POST nenhum. Prova o caminho feliz do "ID" (sem 404/fallback).
  it('reimporta no MESMO ambiente de origem: PUT direto (id existe), nenhum POST — idempotente', async () => {
    const file = buildIdFile({
      Produtos: [
        { ID: 1, Produto: 'Ovo Real', Unidade: 'dz', 'Preço Unitário': 15, Estoque: 10, 'Ovos por Unidade': 12 },
      ],
    });

    const promise = importWorkbookFile(injector, file);

    (await waitOne(httpMock, urls.products, 'GET')).flush([
      { id: 1, name: 'Ovo Real', unit: 'dz', unit_price: '15.00', stock: 10, eggs_per_unit: 12 },
    ]);
    const productPut = await waitOne(httpMock, `${urls.products}/1`, 'PUT');
    expect(productPut.request.body).toEqual({ name: 'Ovo Real', unit: 'dz', unit_price: 15, stock: 10, eggs_per_unit: 12 });
    productPut.flush({ id: 1, name: 'Ovo Real', unit: 'dz', unit_price: '15.00', stock: 10, eggs_per_unit: 12 });

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ Produtos: 1 });
    expect(result.failed).toEqual({});
    expect(result.rowErrors).toEqual([]);
    expect(result.warnings).toEqual([]);
    httpMock.expectNone({ url: urls.products, method: 'POST' });
  });

  // Pedido do usuário: arquivo SEM a coluna "ID" (planilha nova, digitada por fora, ou de uma
  // versão anterior do app) continua criando normalmente — "ID" nunca é obrigatória.
  it('reimporta arquivo sem a coluna "ID": continua criando via POST, comportamento de sempre', async () => {
    const file = buildIdFile({
      Produtos: [{ Produto: 'Ovo Real', Unidade: 'dz', 'Preço Unitário': 15, Estoque: 10, 'Ovos por Unidade': 12 }],
    });

    const promise = importWorkbookFile(injector, file);

    (await waitOne(httpMock, urls.products, 'GET')).flush([]);
    const productPost = await waitOne(httpMock, urls.products, 'POST');
    expect(productPost.request.body).toEqual({ name: 'Ovo Real', unit: 'dz', unit_price: 15, stock: 10, eggs_per_unit: 12 });
    productPost.flush({ id: 1, name: 'Ovo Real', unit: 'dz', unit_price: '15.00', stock: 10, eggs_per_unit: 12 });

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ Produtos: 1 });
    expect(result.warnings).toEqual([]);
    httpMock.expectNone({ url: `${urls.products}/1`, method: 'PUT' });
  });
});

function buildIdFile(sheets: Record<string, Record<string, unknown>[]>): File {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buffer], 'teste.xlsx');
}

/** Como `expectRequest` de `import.spec.ts` — espera (com retry) até achar exatamente 1 requisição pendente pro método+URL. */
async function waitOne(httpMock: HttpTestingController, url: string, method: string, maxAttempts = 20) {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const found = httpMock.match((req) => req.urlWithParams === url && req.method === method);
    if (found.length === 1) return found[0];
    if (found.length > 1) throw new Error(`Mais de 1 requisição pendente pra ${method} ${url}`);
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  throw new Error(`Nenhuma requisição pendente encontrada pra ${method} ${url}`);
}
