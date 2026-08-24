import * as XLSX from 'xlsx';
import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { Injector } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting, TestRequest } from '@angular/common/http/testing';
import { importWorkbookFile } from './import';
import { flushMicrotasks, settleHttp } from '@core/testing/http-settle';
import { environment } from '../../../environments/environment';

function buildFile(sheets: Record<string, Record<string, unknown>[]>): File {
  const workbook = XLSX.utils.book_new();
  for (const [name, rows] of Object.entries(sheets)) {
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), name);
  }
  const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return new File([buffer], 'teste.xlsx');
}

/**
 * `importWorkbookFile` suspende na primeira linha (`await file.arrayBuffer()`)
 * antes de disparar qualquer requisição — por isso, diferente dos specs de
 * `core/api/adapters/*`, nenhum GET/POST está pendente logo após chamar a
 * função. Espera (com retry) até achar exatamente 1 requisição pro método+URL.
 */
async function expectRequest(
  httpMock: HttpTestingController,
  url: string,
  method: string,
  maxAttempts = 20,
): Promise<TestRequest> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const found = httpMock.match((req) => req.urlWithParams === url && req.method === method);
    if (found.length === 1) return found[0];
    if (found.length > 1) throw new Error(`Mais de 1 requisição pendente pra ${method} ${url}`);
    await flushMicrotasks();
  }
  throw new Error(`Nenhuma requisição pendente encontrada pra ${method} ${url}`);
}

describe('importWorkbookFile', () => {
  let httpMock: HttpTestingController;
  let injector: Injector;
  const expensesBase = `${environment.apiUrl}/expenses`;
  const salesBase = `${environment.apiUrl}/sales`;
  const productsBase = `${environment.apiUrl}/products`;
  const vendedoresBase = `${environment.apiUrl}/vendedores`;
  const flockIncubationsBase = `${environment.apiUrl}/flock-incubations`;
  const feedStocksBase = `${environment.apiUrl}/feed-stocks`;
  const feedOpenLogsBase = `${environment.apiUrl}/feed-open-logs`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
    injector = TestBed.inject(Injector);
  });

  afterEach(() => httpMock.verify());

  it('importa cada linha válida chamando POST no adapter real da entidade', async () => {
    const file = buildFile({
      Despesas: [
        {
          Data: '01/07/2026',
          Descrição: 'Ração codornas',
          Categoria: 'Ração',
          'Qtd.': 1,
          'Valor unit.': 106,
          Valor: 106,
          Pago: 'Sim',
        },
      ],
    });

    const promise = importWorkbookFile(injector, file);

    (await expectRequest(httpMock, expensesBase, 'GET')).flush([]);
    const postReq = await expectRequest(httpMock, expensesBase, 'POST');
    expect(postReq.request.body).toEqual({
      date: '2026-07-01',
      description: 'Ração codornas',
      category: 'Ração',
      quantity: 1,
      unit_price: 106,
      amount: 106,
      paid: true,
    });
    postReq.flush({
      id: 1,
      date: '2026-07-01',
      description: 'Ração codornas',
      category: 'Ração',
      quantity: 1,
      unit_price: '106.00',
      amount: '106.00',
      paid: true,
    });

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.summary['Despesas']).toBe(1);
    expect(result.failed).toEqual({});
    expect(result.rowErrors).toEqual([]);
  });

  it('linha com erro 422 da API não trava a importação das outras linhas da mesma aba', async () => {
    const file = buildFile({
      Despesas: [
        {
          Data: '01/07/2026',
          Descrição: 'Ração codornas',
          Categoria: 'Ração',
          'Qtd.': 1,
          'Valor unit.': 106,
          Valor: 106,
          Pago: 'Sim',
        },
        {
          Data: '02/07/2026',
          Descrição: 'Conta de energia',
          Categoria: 'Energia',
          'Qtd.': '',
          'Valor unit.': '',
          Valor: 187.5,
          Pago: 'Não',
        },
      ],
    });

    const promise = importWorkbookFile(injector, file);

    (await expectRequest(httpMock, expensesBase, 'GET')).flush([]);

    const firstPost = await expectRequest(httpMock, expensesBase, 'POST');
    firstPost.flush({
      id: 1,
      date: '2026-07-01',
      description: 'Ração codornas',
      category: 'Ração',
      quantity: 1,
      unit_price: '106.00',
      amount: '106.00',
      paid: true,
    });

    const secondPost = await expectRequest(httpMock, expensesBase, 'POST');
    secondPost.flush(
      { message: 'Dados inválidos.', errors: { category: ['Categoria inválida.'] } },
      { status: 422, statusText: 'Unprocessable Entity' },
    );

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.summary['Despesas']).toBe(1);
    expect(result.failed['Despesas']).toBe(1);
    expect(result.rowErrors).toEqual(['Despesas linha 3: Categoria inválida.']);
  });

  it('rejeita a linha quando Produto/Vendedor referenciado não existe, sem chamar POST', async () => {
    const file = buildFile({
      Vendas: [
        {
          Data: '01/07/2026',
          Produto: 'Ovo Fantasma',
          Quantidade: 1,
          'Preço Unitário': 15,
          Total: 15,
          'Status Pagamento': 'PAGO',
          Comprador: 'Cliente Teste',
          Vendedor: 'Vendedor Teste',
          'Status da entrega': 'ENTREGUE',
        },
      ],
    });

    const promise = importWorkbookFile(injector, file);

    await settleHttp(httpMock, salesBase, []);
    await settleHttp(httpMock, productsBase, [{ id: 1, name: 'Ovo Real' }]);
    await settleHttp(httpMock, vendedoresBase, [{ id: 1, name: 'Vendedor Teste' }]);

    const result = await promise;

    httpMock.expectNone({ url: salesBase, method: 'POST' });

    expect(result.success).toBe(true);
    expect(result.summary['Vendas']).toBe(0);
    expect(result.failed['Vendas']).toBe(1);
    expect(result.rowErrors).toEqual([
      'Vendas linha 2: Produto "Ovo Fantasma" não encontrado — selecione um item já cadastrado.',
    ]);
  });

  // Regressão: `salesStore().add()` buscava products+vendedores via HTTP a cada
  // linha (`fetchRefs()` sem cache) — com uma planilha de Vendas real (100+
  // linhas), isso virava 200+ GETs sequenciais, lento a ponto de parecer
  // travado. Agora `salesRefs()` do `ImportContext` memoiza a busca (1 GET de
  // cada pro import inteiro) e `salesStore().add(item, refs)` reaproveita.
  it('import de Vendas com múltiplas linhas busca products/vendedores exatamente 1 vez, não 1 por linha', async () => {
    const file = buildFile({
      Vendas: [
        {
          Data: '01/07/2026',
          Produto: 'Ovo Real',
          Quantidade: 1,
          'Preço Unitário': 15,
          Total: 15,
          'Status Pagamento': 'PAGO',
          Comprador: 'Cliente A',
          Vendedor: 'Vendedor Um',
          'Status da entrega': 'ENTREGUE',
        },
        {
          Data: '02/07/2026',
          Produto: 'Carne de Codorna',
          Quantidade: 2,
          'Preço Unitário': 20,
          Total: 40,
          'Status Pagamento': 'PAGO',
          Comprador: 'Cliente B',
          Vendedor: 'Vendedor Dois',
          'Status da entrega': 'ENTREGUE',
        },
        {
          Data: '03/07/2026',
          Produto: 'Ovo Real',
          Quantidade: 3,
          'Preço Unitário': 15,
          Total: 45,
          'Status Pagamento': 'PAGO',
          Comprador: 'Cliente C',
          Vendedor: 'Vendedor Um',
          'Status da entrega': 'ENTREGUE',
        },
      ],
    });

    const promise = importWorkbookFile(injector, file);

    await settleHttp(httpMock, salesBase, []);
    await settleHttp(httpMock, productsBase, [
      { id: 1, name: 'Ovo Real' },
      { id: 2, name: 'Carne de Codorna' },
    ]);
    await settleHttp(httpMock, vendedoresBase, [
      { id: 10, name: 'Vendedor Um' },
      { id: 20, name: 'Vendedor Dois' },
    ]);

    for (let i = 0; i < 3; i++) {
      const post = await expectRequest(httpMock, salesBase, 'POST');
      post.flush({
        id: i + 1,
        date: '2026-07-01',
        product_id: 1,
        quantity: 1,
        unit_price: '15.00',
        total: '15.00',
        payment_pending: false,
        buyer: 'Cliente',
        seller_id: 10,
        delivery_pending: false,
        delivery_date: null,
        stock_location_type: 'plantel',
        stock_location_vendedor_id: null,
      });
    }

    const result = await promise;

    // Se `add()` tivesse voltado a buscar refs por linha, sobraria um GET
    // pendente aqui (a 3ª linha teria disparado outro) — `expectNone` confirma
    // que só existiu o único GET já flushado acima pra cada URL.
    httpMock.expectNone({ url: productsBase, method: 'GET' });
    httpMock.expectNone({ url: vendedoresBase, method: 'GET' });

    expect(result.success).toBe(true);
    expect(result.summary['Vendas']).toBe(3);
    expect(result.failed).toEqual({});
  });

  // Regressão: banco de produção nunca rodou o import inicial (só dev/local
  // rodou), então começa sem nenhum produto cadastrado. "Produtos" precisa
  // processar antes de "Vendas" em IMPORTERS pra que uma Venda referenciando
  // um produto criado NA MESMA importação (não cadastrado antes) resolva o
  // `product_id` corretamente — mesmo que a aba "Vendas" venha antes de
  // "Produtos" no arquivo (a ordem de processamento é a de IMPORTERS, não a
  // ordem das abas no workbook).
  it('produto criado na mesma importação é resolvido pela Venda que o referencia, mesmo com "Vendas" antes de "Produtos" no arquivo', async () => {
    const file = buildFile({
      Vendas: [
        {
          Data: '01/07/2026',
          Produto: 'Ovo Real',
          Quantidade: 1,
          'Preço Unitário': 15,
          Total: 15,
          'Status Pagamento': 'PAGO',
          Comprador: 'Cliente Teste',
          Vendedor: 'Vendedor Um',
          'Status da entrega': 'ENTREGUE',
        },
      ],
      Produtos: [{ Produto: 'Ovo Real', Unidade: 'dz', 'Preço Unitário': 15, Estoque: 10, 'Ovos por Unidade': 12 }],
    });

    const promise = importWorkbookFile(injector, file);

    // "Produtos" roda primeiro (banco começa sem produtos, igual produção).
    (await expectRequest(httpMock, productsBase, 'GET')).flush([]);
    const productPost = await expectRequest(httpMock, productsBase, 'POST');
    productPost.flush({ id: 7, name: 'Ovo Real', unit: 'dz', unit_price: '15.00', stock: 10, eggs_per_unit: 12 });

    // Só agora "Vendas" processa — `salesRefs()` busca products/vendedores DEPOIS
    // do produto ter sido criado, então já enxerga ele. `settleHttp` (não
    // `expectRequest`) porque criar `salesStore()` dispara 2 GETs de cada
    // (o `load()` da própria store + o `fetchRefs()` memoizado do import).
    await settleHttp(httpMock, salesBase, []);
    await settleHttp(httpMock, productsBase, [{ id: 7, name: 'Ovo Real' }]);
    await settleHttp(httpMock, vendedoresBase, [{ id: 10, name: 'Vendedor Um' }]);

    const salesPost = await expectRequest(httpMock, salesBase, 'POST');
    expect(salesPost.request.body.product_id).toBe(7);
    salesPost.flush({
      id: 1,
      date: '2026-07-01',
      product_id: 7,
      quantity: 1,
      unit_price: '15.00',
      total: '15.00',
      payment_pending: false,
      buyer: 'Cliente Teste',
      seller_id: 10,
      delivery_pending: false,
      delivery_date: null,
      stock_location_type: 'plantel',
      stock_location_vendedor_id: null,
    });

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.summary['Produtos']).toBe(1);
    expect(result.summary['Vendas']).toBe(1);
    expect(result.failed).toEqual({});
    expect(result.rowErrors).toEqual([]);
  });

  // Regressão: planilha real do usuário nunca teve aba "Vendedores" própria (só a
  // coluna solta "Vendedor" em Vendas) — export/import ganharam essa aba pra que o
  // ciclo export(local, com vendedores cadastrados)→reimport(produção, banco vazio)
  // funcione. Prova que "Vendedores" roda antes de "Vendas" em `IMPORTERS`, mesmo
  // com a ordem invertida no arquivo.
  it('vendedor criado na mesma importação é resolvido pela Venda que o referencia, mesmo com "Vendas" antes de "Vendedores" no arquivo', async () => {
    const file = buildFile({
      Vendas: [
        {
          Data: '01/07/2026',
          Produto: 'Ovo Real',
          Quantidade: 1,
          'Preço Unitário': 15,
          Total: 15,
          'Status Pagamento': 'PAGO',
          Comprador: 'Cliente Teste',
          Vendedor: 'Vendedor Novo',
          'Status da entrega': 'ENTREGUE',
        },
      ],
      Produtos: [{ Produto: 'Ovo Real', Unidade: 'dz', 'Preço Unitário': 15, Estoque: 10, 'Ovos por Unidade': 12 }],
      Vendedores: [{ Nome: 'Vendedor Novo', Contato: '', Ativo: 'Sim' }],
    });

    const promise = importWorkbookFile(injector, file);

    // "Produtos" primeiro.
    (await expectRequest(httpMock, productsBase, 'GET')).flush([]);
    const productPost = await expectRequest(httpMock, productsBase, 'POST');
    productPost.flush({ id: 7, name: 'Ovo Real', unit: 'dz', unit_price: '15.00', stock: 10, eggs_per_unit: 12 });

    // "Vendedores" roda em seguida — antes de "Vendas".
    (await expectRequest(httpMock, vendedoresBase, 'GET')).flush([]);
    const vendedorPost = await expectRequest(httpMock, vendedoresBase, 'POST');
    expect(vendedorPost.request.body).toEqual({ name: 'Vendedor Novo', contact: null, active: true });
    vendedorPost.flush({ id: 10, name: 'Vendedor Novo', contact: null, active: true });

    // Só agora "Vendas" processa — `salesRefs()` já enxerga o vendedor criado.
    await settleHttp(httpMock, salesBase, []);
    await settleHttp(httpMock, productsBase, [{ id: 7, name: 'Ovo Real' }]);
    await settleHttp(httpMock, vendedoresBase, [{ id: 10, name: 'Vendedor Novo' }]);

    const salesPost = await expectRequest(httpMock, salesBase, 'POST');
    expect(salesPost.request.body.seller_id).toBe(10);
    salesPost.flush({
      id: 1,
      date: '2026-07-01',
      product_id: 7,
      quantity: 1,
      unit_price: '15.00',
      total: '15.00',
      payment_pending: false,
      buyer: 'Cliente Teste',
      seller_id: 10,
      delivery_pending: false,
      delivery_date: null,
      stock_location_type: 'plantel',
      stock_location_vendedor_id: null,
    });

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.summary['Produtos']).toBe(1);
    expect(result.summary['Vendedores']).toBe(1);
    expect(result.summary['Vendas']).toBe(1);
    expect(result.failed).toEqual({});
    expect(result.rowErrors).toEqual([]);
  });

  // Regressão: cada linha (e cada aba) precisa ser processada 1 de cada vez,
  // aguardando a resposta HTTP completa antes de disparar a próxima — nunca
  // em paralelo/sem controle de concorrência. Um backend de dev
  // (`php artisan serve`) é single-threaded e cai com dezenas de requisições
  // simultâneas. `httpMock.expectNone` logo depois de pegar a requisição de
  // uma linha prova que a próxima (linha seguinte, ou aba seguinte) ainda não
  // foi disparada nesse ponto.
  it('processa linhas e abas sequencialmente — nunca 2+ requisições da mesma aba pendentes ao mesmo tempo', async () => {
    const file = buildFile({
      Produtos: [
        { Produto: 'Ovo', Unidade: 'dz', 'Preço Unitário': 5, Estoque: 10, 'Ovos por Unidade': 12 },
        { Produto: 'Carne', Unidade: 'kg', 'Preço Unitário': 20, Estoque: 5, 'Ovos por Unidade': 0 },
      ],
      Despesas: [
        {
          Data: '01/07/2026',
          Descrição: 'Ração codornas',
          Categoria: 'Ração',
          'Qtd.': 1,
          'Valor unit.': 106,
          Valor: 106,
          Pago: 'Sim',
        },
        {
          Data: '02/07/2026',
          Descrição: 'Conta de energia',
          Categoria: 'Energia',
          'Qtd.': '',
          'Valor unit.': '',
          Valor: 187.5,
          Pago: 'Não',
        },
      ],
    });

    const promise = importWorkbookFile(injector, file);

    // Aba "Produtos" vem antes de "Despesas" em IMPORTERS — enquanto a 1ª
    // linha de Produtos está pendente, nem a 2ª linha de Produtos nem
    // nenhuma requisição de Despesas podem ter sido disparadas ainda.
    (await expectRequest(httpMock, productsBase, 'GET')).flush([]);
    const productPost1 = await expectRequest(httpMock, productsBase, 'POST');
    httpMock.expectNone({ url: productsBase, method: 'POST' });
    httpMock.expectNone({ url: expensesBase, method: 'GET' });
    productPost1.flush({ id: 1, name: 'Ovo', unit: 'dz', unit_price: '5.00', stock: 10, eggs_per_unit: 12 });

    const productPost2 = await expectRequest(httpMock, productsBase, 'POST');
    httpMock.expectNone({ url: expensesBase, method: 'GET' });
    productPost2.flush({ id: 2, name: 'Carne', unit: 'kg', unit_price: '20.00', stock: 5, eggs_per_unit: 0 });

    // Só agora a aba "Despesas" começa — mesma regra linha a linha dentro dela.
    (await expectRequest(httpMock, expensesBase, 'GET')).flush([]);
    const expensePost1 = await expectRequest(httpMock, expensesBase, 'POST');
    httpMock.expectNone({ url: expensesBase, method: 'POST' });
    expensePost1.flush({
      id: 1,
      date: '2026-07-01',
      description: 'Ração codornas',
      category: 'Ração',
      quantity: 1,
      unit_price: '106.00',
      amount: '106.00',
      paid: true,
    });

    const expensePost2 = await expectRequest(httpMock, expensesBase, 'POST');
    expensePost2.flush({
      id: 2,
      date: '2026-07-02',
      description: 'Conta de energia',
      category: 'Energia',
      amount: '187.50',
      paid: false,
    });

    const result = await promise;

    expect(result.summary['Produtos']).toBe(2);
    expect(result.summary['Despesas']).toBe(2);
    expect(result.failed).toEqual({});
  });

  // Regressão: quando o FormRequest da API não tem regra `unique:` (ex.:
  // Despesas, Higienização) e a colisão só é pega no nível do banco, o erro
  // vaza cru (SQLSTATE/"UNIQUE constraint failed"/"Duplicate entry") — feio
  // pro usuário e sem explicar o que aconteceu. `describeImportError` detecta
  // esse padrão (em qualquer status HTTP) e troca por uma mensagem legível.
  it('erro de constraint única (SQLSTATE cru) vira mensagem legível em vez do texto do banco', async () => {
    const file = buildFile({
      Despesas: [
        {
          Data: '01/07/2026',
          Descrição: 'Ração codornas',
          Categoria: 'Ração',
          'Qtd.': 1,
          'Valor unit.': 106,
          Valor: 106,
          Pago: 'Sim',
        },
      ],
    });

    const promise = importWorkbookFile(injector, file);

    (await expectRequest(httpMock, expensesBase, 'GET')).flush([]);
    const post = await expectRequest(httpMock, expensesBase, 'POST');
    post.flush(
      { message: 'SQLSTATE[23000]: Integrity constraint violation: 19 UNIQUE constraint failed: expenses.date' },
      { status: 500, statusText: 'Internal Server Error' },
    );

    const result = await promise;

    expect(result.rowErrors).toEqual(['Despesas linha 2: Já existe um registro com esses dados.']);
  });

  it('arquivo corrompido (zip inválido) é bloqueante (nenhuma linha é tentada)', async () => {
    const file = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00])], 'teste.xlsx');

    const result = await importWorkbookFile(injector, file);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual(['Arquivo inválido ou corrompido.']);
    expect(result.summary).toEqual({});
  });

  it('nenhuma aba reconhecida no arquivo é bloqueante', async () => {
    const file = buildFile({ 'Aba Desconhecida': [{ Col: 1 }] });

    const result = await importWorkbookFile(injector, file);

    expect(result.success).toBe(false);
    expect(result.errors).toEqual([
      'Nenhuma aba reconhecida no arquivo. Baixe o modelo de exemplo pra conferir o formato.',
    ]);
    expect(result.summary).toEqual({});
  });

  it('coluna obrigatória faltando pula só aquela aba — as outras abas do arquivo seguem normais', async () => {
    const file = buildFile({
      Vendas: [{ Data: '01/07/2026' }], // faltam colunas obrigatórias
      Despesas: [
        {
          Data: '01/07/2026',
          Descrição: 'Ração codornas',
          Categoria: 'Ração',
          'Qtd.': 1,
          'Valor unit.': 106,
          Valor: 106,
          Pago: 'Sim',
        },
      ],
    });

    const promise = importWorkbookFile(injector, file);

    (await expectRequest(httpMock, expensesBase, 'GET')).flush([]);
    (await expectRequest(httpMock, expensesBase, 'POST')).flush({
      id: 1,
      date: '2026-07-01',
      description: 'Ração codornas',
      category: 'Ração',
      quantity: 1,
      unit_price: '106.00',
      amount: '106.00',
      paid: true,
    });

    const result = await promise;

    expect(result.success).toBe(true);
    expect(result.summary['Vendas']).toBeUndefined();
    expect(result.summary['Despesas']).toBe(1);
    expect(result.rowErrors.some((e) => e.includes('Vendas'))).toBe(true);

    httpMock.expectNone({ url: salesBase, method: 'GET' });
  });

  // Regressão: bug reportado do "loop de carregamento infinito" no botão
  // Importar — uma exceção inesperada durante o parse de uma aba (não coberta
  // por validação, ex.: célula de data corrompida quebrando o parser do xlsx)
  // escapava sem try/catch, rejeitava a Promise de `importWorkbookFile` e
  // nunca resolvia `importState` em `layout-app.ts`, travando o modal em
  // "confirm" pra sempre sem mostrar erro. Agora a aba com erro é pulada
  // (mesmo padrão de "coluna obrigatória faltando") e as outras seguem normais.
  it('exceção inesperada durante parse de uma aba não trava a Promise — aba é pulada e as outras seguem', async () => {
    const file = buildFile({
      Despesas: [
        {
          Data: 46203, // serial numérico de data — passa pelo branch que aciona XLSX.SSF.parse_date_code
          Descrição: 'Ração codornas',
          Categoria: 'Ração',
          'Qtd.': 1,
          'Valor unit.': 106,
          Valor: 106,
          Pago: 'Sim',
        },
      ],
      Produtos: [{ Produto: 'Ovo', Unidade: 'dz', 'Preço Unitário': 5, Estoque: 10, 'Ovos por Unidade': 12 }],
    });

    const parseDateCodeSpy = vi.spyOn(XLSX.SSF, 'parse_date_code').mockImplementation(() => {
      throw new Error('planilha corrompida');
    });

    const promise = importWorkbookFile(injector, file);

    // "Produtos" vem antes de "Despesas" em IMPORTERS — segue normal mesmo com
    // a outra aba quebrando.
    (await expectRequest(httpMock, productsBase, 'GET')).flush([]);
    (await expectRequest(httpMock, productsBase, 'POST')).flush({
      id: 1,
      name: 'Ovo',
      unit: 'dz',
      unit_price: '5.00',
      stock: 10,
      eggs_per_unit: 12,
    });

    const result = await promise;
    parseDateCodeSpy.mockRestore();

    // Acima de tudo: a Promise RESOLVE (nunca fica pendente pra sempre — essa
    // era a causa do loop infinito de loading na UI).
    expect(result.success).toBe(true);
    expect(result.summary['Produtos']).toBe(1);
    expect(result.summary['Despesas']).toBeUndefined();
    expect(result.rowErrors.some((e) => e.startsWith('Aba "Despesas": erro ao processar'))).toBe(true);
  });

  // Pedido do usuário: coluna "ID" (id real do backend) faz reimportar virar UPDATE em vez de
  // CREATE — reimportar o mesmo arquivo várias vezes não duplica nada.
  describe('coluna "ID" — update idempotente em vez de create', () => {
    it('"ID" com lixo (não numérico) vira erro de linha, sem chamar PUT nem POST', async () => {
      const file = buildFile({
        Produtos: [
          { ID: 'abc', Produto: 'Ovo Real', Unidade: 'dz', 'Preço Unitário': 15, Estoque: 10, 'Ovos por Unidade': 12 },
        ],
      });

      const result = await importWorkbookFile(injector, file);

      expect(result.success).toBe(true);
      expect(result.summary['Produtos']).toBe(0);
      expect(result.rowErrors).toEqual(['Produtos linha 2: "ID" inválido (deve ser um número inteiro).']);
      // Linha inválida nem chega a entrar no loop de `run()` — nenhuma chamada HTTP acontece
      // (nem o GET que `ctx.productsStore()` dispararia na primeira vez que fosse usado).
      httpMock.expectNone({ url: productsBase, method: 'GET' });
      httpMock.expectNone({ url: productsBase, method: 'POST' });
    });

    // "Ração - Sacos Abertos" não tem `PUT/{id}` (recurso só-leitura por id, ver openapi.yaml) —
    // "ID" preenchido não pode virar update de verdade. Se o id ainda existe, ignora a linha (não
    // decrementa estoque de novo); se não existe mais, recria via open-bag normal e avisa.
    it('Ração - Sacos Abertos: "ID" que ainda existe é ignorado (sem endpoint de update, evita duplicar/decrementar de novo)', async () => {
      const file = buildFile({
        'Ração - Sacos Abertos': [{ ID: 9, Data: '01/07/2026', Tipo: 'Codorna postura', 'Peso Aberto (kg)': 20 }],
      });

      const promise = importWorkbookFile(injector, file);

      (await expectRequest(httpMock, feedOpenLogsBase, 'GET')).flush([{ id: 9, feed_stock_id: 1, feed_type: 'Codorna postura', date: '2026-07-01', weight_kg: '20.00' }]);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.summary['Ração - Sacos Abertos']).toBe(1);
      expect(result.warnings).toEqual([
        'Ração - Sacos Abertos linha 2: ID 9 já existe — linha ignorada (não há endpoint de atualização pra "Ração - Sacos Abertos", reimportar recriaria o registro e decrementaria o estoque de novo).',
      ]);
      // Nunca chega a resolver o tipo nem abrir saco — a linha é ignorada antes disso.
      httpMock.expectNone({ url: feedStocksBase, method: 'GET' });
    });

    it('Ração - Sacos Abertos: "ID" que não existe mais recria via open-bag normal e avisa', async () => {
      const file = buildFile({
        'Ração - Sacos Abertos': [{ ID: 9, Data: '01/07/2026', Tipo: 'Codorna postura', 'Peso Aberto (kg)': 20 }],
      });

      const promise = importWorkbookFile(injector, file);

      (await expectRequest(httpMock, feedOpenLogsBase, 'GET')).flush([]); // id 9 não está mais na lista
      // `feedStockIdByType()` (resolve "Tipo" -> id) E `feedStockStoreExtended()` (openBag,
      // construída na 1ª vez que é usada) cada uma dispara SEU PRÓPRIO GET /feed-stocks — 2
      // requisições distintas pra mesma URL, mesmo padrão de "salesRefs" duplo GET já visto em
      // Vendas.
      (await expectRequest(httpMock, feedStocksBase, 'GET')).flush([{ id: 1, type: 'Codorna postura' }]);
      const openBagReq = await expectRequest(httpMock, `${feedStocksBase}/1/open-bag`, 'POST');
      (await expectRequest(httpMock, feedStocksBase, 'GET')).flush([
        { id: 1, type: 'Codorna postura', bags_in_stock: 5, kg_in_stock: '100.00', last_bag_weight_kg: '20.00', expiration_date: null },
      ]);
      expect(openBagReq.request.body).toEqual({ date: '2026-07-01', weight_kg: 20 });
      openBagReq.flush({
        id: 1, type: 'Codorna postura', bags_in_stock: 4, kg_in_stock: '80.00', last_bag_weight_kg: '20.00', expiration_date: null,
      });

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.summary['Ração - Sacos Abertos']).toBe(1);
      expect(result.warnings).toEqual([
        'Ração - Sacos Abertos linha 2: ID 9 não encontrado no backend — recriado como novo registro (decrementa 1 saco do estoque de ração, mesmo efeito de abrir saco novo).',
      ]);
    });

    // O par único "Data Eclosão"/"Qtd. Nascida" da planilha sempre reconstrói 1 hatch event com
    // `crypto.randomUUID()` novo (`migrateLegacyHatchEvents`) — se esse evento sintético fosse
    // enviado no update, `syncHatchEvents` (adapter) o trataria como nascimento NOVO toda
    // reimportação, duplicando a cada rodada. `runFlockIncubation` busca os `hatch_events` REAIS
    // do servidor primeiro e os preserva intactos no update — prova que nenhuma chamada de
    // `hatch-events` (POST/PUT/DELETE) acontece, só o PUT dos campos de topo.
    it('Novo Plantel: update com "ID" preserva hatch_events reais do servidor — não duplica nascimento', async () => {
      const file = buildFile({
        'Novo Plantel': [
          {
            ID: 7,
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
        ],
      });

      const loteApi = {
        id: 7,
        start_date: '2026-06-01',
        species: 'quail',
        egg_count: 50,
        expected_hatch_date: '2026-06-19',
        status: 'eclodido',
        egg_cost: '25.00',
        feed_cost: '10.00',
        notes: null,
        hatch_events: [
          { id: 50, flock_incubation_id: 7, date: '2026-06-19', count: 20, notes: null },
          { id: 51, flock_incubation_id: 7, date: '2026-06-20', count: 30, notes: null },
        ],
      };

      const promise = importWorkbookFile(injector, file);

      // `runFlockIncubation` busca o lote 7 direto primeiro, pra preservar hatch_events.
      (await expectRequest(httpMock, `${flockIncubationsBase}/7`, 'GET')).flush(loteApi);
      // Só depois cria a store (GET de lista, `flockIncubationsStore()` memoizado).
      (await expectRequest(httpMock, flockIncubationsBase, 'GET')).flush([loteApi]);

      const putReq = await expectRequest(httpMock, `${flockIncubationsBase}/7`, 'PUT');
      expect(putReq.request.body).toMatchObject({ egg_cost: 25, feed_cost: 10, status: 'eclodido' });
      putReq.flush(loteApi);

      // `update()` do adapter termina com 1 GET pra devolver o estado autoritativo do servidor
      // (ver comentário em `flock-incubations.adapter.ts`) — 2ª chamada a essa mesma URL.
      (await expectRequest(httpMock, `${flockIncubationsBase}/7`, 'GET')).flush(loteApi);

      const result = await promise;

      expect(result.success).toBe(true);
      expect(result.summary['Novo Plantel']).toBe(1);
      expect(result.rowErrors).toEqual([]);
      // Nenhuma chamada de hatch-events — os eventos preservados carregam id real do servidor
      // (`isServerHatchEventId`), `syncHatchEvents` nunca os trata como novos.
      httpMock.expectNone({ url: `${flockIncubationsBase}/7/hatch-events`, method: 'POST' });
      httpMock.expectNone({ url: `${flockIncubationsBase}/7/hatch-events/50`, method: 'PUT' });
      httpMock.expectNone({ url: `${flockIncubationsBase}/7/hatch-events/51`, method: 'PUT' });
    });
  });
});
