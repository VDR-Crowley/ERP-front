import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';

import { Dashboard } from './dashboard';
import { Products } from '../products/products';
import { IndexedDbService } from '@core/idb/idb.service';
import { Product } from '@core/interfaces/product.interface';
import { VendorStock } from '@core/interfaces/vendor-stock.interface';
import { WithId } from '@core/idb/entity-store';

// jsdom (ambiente de teste) não implementa ResizeObserver, usado pelo ApexCharts
// para redimensionar o gráfico ao montar o componente.
/* eslint-disable @typescript-eslint/no-empty-function */
if (typeof ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
/* eslint-enable @typescript-eslint/no-empty-function */

describe('Dashboard', () => {
  let component: Dashboard;
  let fixture: ComponentFixture<Dashboard>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([])],
    }).compileComponents();

    fixture = TestBed.createComponent(Dashboard);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});

/**
 * Pedido do Ytallo: o card "Valor em estoque" do Dashboard calculava do
 * módulo antigo Estoque de Ovos (só 2 produtos) e divergia do módulo
 * Produtos (5 produtos, Plantel + vendedores). Invariante: os dois números
 * têm que bater sempre, porque agora vêm da mesma função (totalStockValue).
 */
describe('Dashboard.valorEstoque() — invariante com Products.valorEstoque()', () => {
  let dashboardFixture: ComponentFixture<Dashboard>;
  let productsFixture: ComponentFixture<Products>;

  beforeEach(async () => {
    const productsInIdb: WithId<Product>[] = [
      { id: 'p1', name: '50 ovos de codorna', unit: 'pack', unitPrice: 15, stock: 40, eggsPerUnit: 50 },
      { id: 'p2', name: '1 Bandeja de ovos de galinha', unit: 'un', unitPrice: 20, stock: 12, eggsPerUnit: 30 },
      { id: 'p3', name: 'Ração extra', unit: 'kg', unitPrice: 4, stock: 25, eggsPerUnit: 0 },
      { id: 'p4', name: 'Kit misto', unit: 'un', unitPrice: 30, stock: 6, eggsPerUnit: 0 },
      { id: 'p5', name: 'Carne de codorna', unit: 'kg', unitPrice: 18, stock: 9, eggsPerUnit: 0 },
    ];
    const vendorStockInIdb: WithId<VendorStock>[] = [
      { id: 'vs-1', product: '50 ovos de codorna', vendedorId: 'karol', quantity: 8 },
      { id: 'vs-2', product: 'Kit misto', vendedorId: 'bruno', quantity: 3 },
    ];
    // Estoque de Ovos ainda tem dado (só 2 produtos) — não pode ser o que o
    // Dashboard usa mais, senão o valor bate errado com Produtos.
    const eggStockInIdb = [
      { id: 'e1', date: '2026-08-01', quailEggs: 100, chickenEggs: 50, quailPacks: 2, chickenPacks: 1, quailStockValue: 30, chickenStockValue: 20 },
    ];

    const byStore: Record<string, unknown[]> = {
      products: productsInIdb,
      vendorStock: vendorStockInIdb,
      eggStock: eggStockInIdb,
    };
    const fakeIdb = {
      getAll: (storeName: string) => of(byStore[storeName] ?? []),
    } as unknown as IndexedDbService;

    await TestBed.configureTestingModule({
      imports: [Dashboard],
      providers: [provideRouter([]), { provide: IndexedDbService, useValue: fakeIdb }],
    }).compileComponents();
    dashboardFixture = TestBed.createComponent(Dashboard);
    await dashboardFixture.whenStable();

    await TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [Products],
      providers: [provideRouter([]), { provide: IndexedDbService, useValue: fakeIdb }],
    }).compileComponents();
    productsFixture = TestBed.createComponent(Products);
    await productsFixture.whenStable();
  });

  it('Dashboard.valorEstoque() bate exatamente com Products.valorEstoque() pro mesmo estoque', () => {
    const dashboardValor = (dashboardFixture.componentInstance as unknown as { valorEstoque: () => number })
      .valorEstoque();
    const productsValor = (productsFixture.componentInstance as unknown as { valorEstoque: () => number })
      .valorEstoque();

    expect(dashboardValor).toBeGreaterThan(0);
    expect(dashboardValor).toBe(productsValor);
    // Confirma que NÃO é o valor antigo do Estoque de Ovos (150+100=250, só 2 produtos).
    expect(dashboardValor).not.toBe(250);
  });
});
