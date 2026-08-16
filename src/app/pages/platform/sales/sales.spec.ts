import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { Sales } from './sales';
import { IndexedDbService } from '@core/idb/idb.service';
import { Product } from '@core/interfaces/product.interface';
import { Vendedor } from '@core/interfaces/vendedor.interface';
import { VendorStock } from '@core/interfaces/vendor-stock.interface';
import { WithId } from '@core/idb/entity-store';
import { vendedorLocation } from '@core/utils/stock-location';

/**
 * Bug 3 (validação, não bug): confirma que dá pra escolher "Estoque com
 * Karol" ao vender e que o saldo dela cai — sem mexer no Plantel.
 */
describe('Sales — venda baixando do estoque de um vendedor', () => {
  let component: Sales;
  let fixture: ComponentFixture<Sales>;
  let saved: Record<string, unknown>[];
  let productsInIdb: WithId<Product>[];
  let vendedoresInIdb: WithId<Vendedor>[];
  let vendorStockInIdb: WithId<VendorStock>[];

  beforeEach(async () => {
    saved = [];
    productsInIdb = [
      { id: 'prod-1', name: '50 ovos de codorna', unit: 'pack', unitPrice: 15, stock: 40, eggsPerUnit: 50 },
    ];
    vendedoresInIdb = [{ id: 'karol-1', name: 'Karol', contact: '', active: true }];
    vendorStockInIdb = [{ id: 'vs-1', product: '50 ovos de codorna', vendedorId: 'karol-1', quantity: 12 }];

    const byStore: Record<string, unknown[]> = {
      products: productsInIdb,
      vendedores: vendedoresInIdb,
      vendorStock: vendorStockInIdb,
      sales: [],
    };

    const fakeIdb = {
      getAll: (storeName: string) => of(byStore[storeName] ?? []),
      save: (_storeName: string, id: string, data: unknown) => {
        saved.push({ store: _storeName, id, ...(data as object) });
        return of(undefined);
      },
      delete: () => of(undefined),
    } as unknown as IndexedDbService;

    await TestBed.configureTestingModule({
      imports: [Sales],
      providers: [provideRouter([]), { provide: IndexedDbService, useValue: fakeIdb }],
    }).compileComponents();

    fixture = TestBed.createComponent(Sales);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('oferece "Vendedor: Karol" como opção de local do estoque', () => {
    const stockLocationField = component['fields']().find((f) => f.key === 'stockLocation')!;
    expect(stockLocationField).toBeTruthy();
    const options = stockLocationField.optionsFor!({});
    expect(options).toEqual([
      { value: 'plantel', label: 'Plantel' },
      { value: 'vendedor:karol-1', label: 'Vendedor: Karol' },
    ]);
  });

  it('vender escolhendo "Estoque com Karol" baixa o saldo dela e NÃO mexe no Plantel', async () => {
    component['openNew']();
    component['draft']['product'] = '50 ovos de codorna';
    component['draft']['quantity'] = 5;
    component['draft']['unitPrice'] = 15;
    component['draft']['stockLocation'] = vendedorLocation('karol-1');
    component['draft']['buyer'] = 'Cliente Teste';
    component['draft']['seller'] = 'Karol';

    await component['saveForm']();

    const vendorStockAfter = (component as unknown as { vendorStockStore: { items: () => WithId<VendorStock>[] } })
      .vendorStockStore.items()
      .find((v) => v.vendedorId === 'karol-1' && v.product === '50 ovos de codorna');
    expect(vendorStockAfter?.quantity).toBe(7); // 12 - 5

    const productAfter = (component as unknown as { productsStore: { items: () => WithId<Product>[] } })
      .productsStore.items()
      .find((p) => p.name === '50 ovos de codorna');
    expect(productAfter?.stock).toBe(40); // Plantel intocado

    const vendaSalva = saved.find((s) => s['store'] === 'sales');
    expect(vendaSalva?.['stockLocation']).toBe('vendedor:karol-1');
  });

  it('excluir a venda devolve a quantidade pro saldo da vendedora', async () => {
    component['openNew']();
    component['draft']['product'] = '50 ovos de codorna';
    component['draft']['quantity'] = 5;
    component['draft']['unitPrice'] = 15;
    component['draft']['stockLocation'] = vendedorLocation('karol-1');
    component['draft']['buyer'] = 'Cliente Teste';
    component['draft']['seller'] = 'Karol';
    await component['saveForm']();

    const venda = component['rows']().find((v) => v.buyer === 'Cliente Teste')!;
    component['askDelete'](venda);
    await component['confirmDelete']();

    const vendorStockAfter = (component as unknown as { vendorStockStore: { items: () => WithId<VendorStock>[] } })
      .vendorStockStore.items()
      .find((v) => v.vendedorId === 'karol-1' && v.product === '50 ovos de codorna');
    expect(vendorStockAfter?.quantity).toBe(12); // devolveu ao original
  });
});
