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

    const wb = await promise;
    const sheet = <T>(name: string) => XLSX.utils.sheet_to_json<T>(wb.Sheets[name]);

    expect(sheet('Vendedores')).toEqual([{ Nome: 'Karol', Contato: '(11) 90000-0001', Ativo: 'Sim' }]);
    expect(sheet('Produtos')).toEqual([
      { Produto: 'Ovo Real', Unidade: 'dz', 'Preço Unitário': 15, Estoque: 10, 'Ovos por Unidade': 12 },
    ]);
    // Vendas resolve product_id/seller_id -> nome usando o que já foi buscado pras próprias
    // abas Produtos/Vendedores (sem GET extra — só 1 GET de cada em `urls` acima).
    expect(sheet('Vendas')).toEqual([
      {
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
        'Data Incubadora': '01/06/2026',
        Espécie: 'Codorna',
        'Qtd. Ovos': 50,
        'Eclosão Prevista': '19/06/2026',
        'Data Eclosão': '20/06/2026',
        'Qtd. Nascida': 50,
        Status: 'eclodido',
        'Custo Ovos': 25,
        'Custo Ração': 10,
      },
    ]);
    // API nunca devolve senha nem telefone — sai em branco de propósito (ver comentário em
    // `export.ts`), reimportar essa aba falha por linha com "Senha vazia", não silenciosamente.
    expect(sheet('Usuários')).toEqual([{ Nome: 'Karol', 'E-mail': 'karol@x.com' }]);
    expect(sheet('Ração - Sacos Abertos')).toEqual([
      { Data: '01/07/2026', Tipo: 'Codorna postura', 'Peso Aberto (kg)': 20 },
    ]);
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
  // Produtos cadastrados) e reimportar num ambiente vazio (produção, 0 registros) precisa
  // recriar os mesmos dados — 1 POST por linha exportada, sem duplicar, e a Venda precisa
  // resolver Produto/Vendedor pros ids NOVOS criados no ambiente de destino (não os ids
  // antigos de local, que não existem lá).
  it('exporta Vendedores/Produtos/Vendas de "local" e reimporta em ambiente vazio sem duplicar, resolvendo os ids novos', async () => {
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

    const wb = await exportPromise;
    const buffer = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = new File([buffer], 'export-local.xlsx');

    // Ambiente de destino "vazio" (produção antes de qualquer import) — reimporta o arquivo
    // acabado de exportar. IMPORTERS roda Produtos e Vendedores antes de Vendas.
    const importPromise = importWorkbookFile(injector, file);

    (await waitOne(httpMock, urls.products, 'GET')).flush([]);
    const productPost = await waitOne(httpMock, urls.products, 'POST');
    expect(productPost.request.body).toEqual({
      name: 'Ovo Real', unit: 'dz', unit_price: 15, stock: 10, eggs_per_unit: 12,
    });
    productPost.flush({ id: 200, name: 'Ovo Real', unit: 'dz', unit_price: '15.00', stock: 10, eggs_per_unit: 12 });

    (await waitOne(httpMock, urls.vendedores, 'GET')).flush([]);
    const vendedorPost = await waitOne(httpMock, urls.vendedores, 'POST');
    expect(vendedorPost.request.body).toEqual({ name: 'Karol', contact: null, active: true });
    vendedorPost.flush({ id: 100, name: 'Karol', contact: null, active: true });

    // Vendas: cria a store (GET /sales) e resolve refs (GET /products + GET /vendedores) —
    // já reflete Produtos/Vendedores recém-criados acima (ids 200/100 do ambiente novo, NÃO
    // os ids 1/5 de local, que não existem aqui).
    await settleHttp(httpMock, urls.sales, []);
    await settleHttp(httpMock, urls.products, [{ id: 200, name: 'Ovo Real' }]);
    await settleHttp(httpMock, urls.vendedores, [{ id: 100, name: 'Karol' }]);

    const salesPost = await waitOne(httpMock, urls.sales, 'POST');
    expect(salesPost.request.body).toMatchObject({ product_id: 200, seller_id: 100 });
    salesPost.flush({
      id: 1, date: '2026-07-01', product_id: 200, quantity: 2, unit_price: '15.00', total: '30.00',
      payment_pending: false, buyer: 'Cliente A', seller_id: 100, delivery_pending: true, delivery_date: null,
      stock_location_type: 'plantel', stock_location_vendedor_id: null,
    });

    const result = await importPromise;

    expect(result.success).toBe(true);
    expect(result.summary).toEqual({ Produtos: 1, Vendedores: 1, Vendas: 1 });
    expect(result.failed).toEqual({});
    expect(result.rowErrors).toEqual([]);

    // Nenhum POST a mais em nenhuma das 3 URLs — 1 linha exportada, 1 POST, sem duplicar.
    httpMock.expectNone({ url: urls.products, method: 'POST' });
    httpMock.expectNone({ url: urls.vendedores, method: 'POST' });
    httpMock.expectNone({ url: urls.sales, method: 'POST' });
  });
});

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
