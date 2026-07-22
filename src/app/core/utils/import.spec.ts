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

describe('importWorkbookFile - Higienização', () => {
  function fakeIdbCapturing(saved: Record<string, unknown>[]) {
    return {
      clear: () => of(undefined),
      save: (_storeName: string, _id: string, data: unknown) => {
        saved.push(data as Record<string, unknown>);
        return of(undefined);
      },
    } as unknown as IndexedDbService;
  }

  function buildFile(rows: Record<string, unknown>[]): File {
    const sheet = XLSX.utils.json_to_sheet(rows, {
      header: ['Data', 'Espécie', 'Tipo', 'Observações'],
    });
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, 'Higienização');
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
    return new File([buffer], 'teste.xlsx');
  }

  it('importa limpezas das duas espécies com os tipos válidos por espécie', async () => {
    const saved: Record<string, unknown>[] = [];
    const fakeIdb = fakeIdbCapturing(saved);

    const file = buildFile([
      { Data: '01/07/2026', Espécie: 'Codorna', Tipo: 'Total', Observações: 'Limpeza geral' },
      { Data: '02/07/2026', Espécie: 'Codorna', Tipo: 'Bebedouro', Observações: '' },
      { Data: '03/07/2026', Espécie: 'Codorna', Tipo: 'Bandeja', Observações: '' },
      { Data: '04/07/2026', Espécie: 'Galinha', Tipo: 'Total', Observações: '' },
      { Data: '05/07/2026', Espécie: 'Galinha', Tipo: 'Bebedouro', Observações: '' },
      { Data: '06/07/2026', Espécie: 'Galinha', Tipo: 'Ninho', Observações: 'Troca de forração' },
    ]);

    const result = await importWorkbookFile(fakeIdb, file);

    expect(result.success).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.summary['Higienização']).toBe(6);
    expect(saved.length).toBe(6);

    const quailTray = saved.find((s) => s['species'] === 'quail' && s['cleaningType'] === 'tray');
    expect(quailTray).toBeDefined();
    expect(quailTray?.['date']).toBe('2026-07-03');

    const chickenNest = saved.find((s) => s['species'] === 'chicken' && s['cleaningType'] === 'nest');
    expect(chickenNest?.['notes']).toBe('Troca de forração');
  });

  it('rejeita Tipo incompatível com a Espécie (ex.: Bandeja pra Galinha)', async () => {
    const saved: Record<string, unknown>[] = [];
    const fakeIdb = fakeIdbCapturing(saved);

    const file = buildFile([{ Data: '01/07/2026', Espécie: 'Galinha', Tipo: 'Bandeja', Observações: '' }]);

    const result = await importWorkbookFile(fakeIdb, file);

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('Bandeja'))).toBe(true);
    expect(saved.length).toBe(0);
  });

  it('rejeita espécie ou tipo desconhecidos', async () => {
    const saved: Record<string, unknown>[] = [];
    const fakeIdb = fakeIdbCapturing(saved);

    const file = buildFile([{ Data: '01/07/2026', Espécie: 'Pato', Tipo: 'Total', Observações: '' }]);

    const result = await importWorkbookFile(fakeIdb, file);

    expect(result.success).toBe(false);
    expect(result.errors.some((e) => e.includes('Espécie'))).toBe(true);
  });
});
