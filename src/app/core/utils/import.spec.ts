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
});
