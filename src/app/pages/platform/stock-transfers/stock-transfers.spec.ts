import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { StockTransfers } from './stock-transfers';
import { IndexedDbService } from '@core/idb/idb.service';
import { Product } from '@core/interfaces/product.interface';
import { Vendedor } from '@core/interfaces/vendedor.interface';
import { VendorStock } from '@core/interfaces/vendor-stock.interface';
import { WithId } from '@core/idb/entity-store';
import { totalStockValue } from '@core/utils/stock-location';

/**
 * Pedido do Ytallo: a tabela "Estoque por local" mostra o valor em R$ de
 * cada linha, calculado do preço cadastrado em Produtos — e bate com o total
 * que a tela Produtos mostra (mesma função, ver stock-location.ts).
 */
describe('StockTransfers — coluna Valor (preço vem de Produtos)', () => {
  let component: StockTransfers;
  let fixture: ComponentFixture<StockTransfers>;
  let productsInIdb: WithId<Product>[];
  let vendedoresInIdb: WithId<Vendedor>[];
  let vendorStockInIdb: WithId<VendorStock>[];

  beforeEach(async () => {
    productsInIdb = [
      { id: 'p1', name: '50 ovos de codorna', unit: 'pack', unitPrice: 15, stock: 40, eggsPerUnit: 50 },
      { id: 'p2', name: 'Ração extra', unit: 'kg', unitPrice: 4, stock: 10, eggsPerUnit: 0 },
    ];
    vendedoresInIdb = [{ id: 'karol-1', name: 'Karol', contact: '', active: true }];
    vendorStockInIdb = [{ id: 'vs-1', product: '50 ovos de codorna', vendedorId: 'karol-1', quantity: 8 }];

    const byStore: Record<string, unknown[]> = {
      products: productsInIdb,
      vendedores: vendedoresInIdb,
      vendorStock: vendorStockInIdb,
      stockTransfers: [],
    };
    const fakeIdb = {
      getAll: (storeName: string) => of(byStore[storeName] ?? []),
    } as unknown as IndexedDbService;

    await TestBed.configureTestingModule({
      imports: [StockTransfers],
      providers: [provideRouter([]), { provide: IndexedDbService, useValue: fakeIdb }],
    }).compileComponents();

    fixture = TestBed.createComponent(StockTransfers);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('calcula o valor de cada linha (quantidade × preço do produto em Produtos)', () => {
    const rows = component['overviewRows']();

    const plantelOvos = rows.find((r) => r.product === '50 ovos de codorna' && r.location === 'plantel')!;
    expect(plantelOvos.value).toBe(600); // 40 * 15

    const karolOvos = rows.find((r) => r.product === '50 ovos de codorna' && r.location === 'vendedor:karol-1')!;
    expect(karolOvos.value).toBe(120); // 8 * 15

    const plantelRacao = rows.find((r) => r.product === 'Ração extra' && r.location === 'plantel')!;
    expect(plantelRacao.value).toBe(40); // 10 * 4
  });

  it('a soma das linhas bate com valorTotalEstoque() e com totalStockValue() — mesma fonte que Produtos.valorEstoque', () => {
    const rows = component['overviewRows']();
    const somaLinhas = rows.reduce((s, r) => s + r.value, 0);

    expect(somaLinhas).toBe(component['valorTotalEstoque']());
    expect(somaLinhas).toBe(totalStockValue(productsInIdb, vendorStockInIdb));
  });
});
