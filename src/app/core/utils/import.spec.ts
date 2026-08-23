import * as XLSX from 'xlsx';
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
});
