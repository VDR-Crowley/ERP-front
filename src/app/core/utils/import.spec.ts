import * as XLSX from 'xlsx';
import { of } from 'rxjs';
import { importWorkbookFile } from './import';
import { IndexedDbService } from '@core/idb/idb.service';

describe('importWorkbookFile - autocorreção de ano de digitação', () => {
  it('corrige ano fora da janela plausível preservando mês/dia', async () => {
    const saved: Record<string, unknown>[] = [];
    const fakeIdb = {
      clear: () => of(undefined),
      save: (_storeName: string, _id: string, data: unknown) => {
        saved.push(data as Record<string, unknown>);
        return of(undefined);
      },
    } as unknown as IndexedDbService;

    const rows = [
      {
        Data: '15/07/2028',
        Produto: 'Ovo Codorna',
        Quantidade: 10,
        'Preço Unitário': 1,
        Total: 10,
        'Status Pagamento': 'PAGO',
        Comprador: 'Cliente Teste',
        Vendedor: 'Vendedor Teste',
        'Status da entrega': 'ENTREGUE',
      },
    ];
    const sheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Vendas');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    const file = new File([buffer], 'teste.xlsx');

    const result = await importWorkbookFile(fakeIdb, file);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);

    const venda = saved.find((v) => v['product'] === 'Ovo Codorna') as { date: string } | undefined;
    expect(venda).toBeDefined();

    const year = Number(venda?.date.slice(0, 4));
    const currentYear = new Date().getFullYear();
    expect(year).not.toBe(2028);
    expect(year).toBeGreaterThanOrEqual(currentYear - 1);
    expect(year).toBeLessThanOrEqual(currentYear + 1);
    expect(venda?.date.slice(5)).toBe('07-15');
  });
});
