import { ComponentFixture, TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { Products } from './products';
import { IndexedDbService } from '@core/idb/idb.service';
import { Product } from '@core/interfaces/product.interface';
import { WithId } from '@core/idb/entity-store';

/**
 * Reproduz e depois cobre a correção do bug relatado em produção: editar o
 * campo "Estoque" de um produto e clicar Salvar não persistia pra produtos
 * ligados a ovo (a coluna exibida ignorava o valor recém-salvo e recalculava
 * do Estoque de Ovos — ver histórico do commit pra detalhe do bug).
 */
describe('Products — edição de estoque (bug reportado em produção)', () => {
  let component: Products;
  let fixture: ComponentFixture<Products>;
  let saved: Record<string, unknown>[];
  let productsInIdb: WithId<Product>[];

  function product(overrides: Partial<Product> & { id: string }): WithId<Product> {
    return { name: 'Produto', unit: 'un', unitPrice: 10, stock: 0, eggsPerUnit: 0, ...overrides };
  }

  beforeEach(async () => {
    saved = [];
    // 5 produtos, igual ao relato: 2 ligados a ovo (nome batia com o antigo
    // override de estoqueReal, hoje removido) e 3 "normais".
    productsInIdb = [
      product({ id: 'p1', name: '50 ovos de codorna', eggsPerUnit: 50, stock: 20 }),
      product({ id: 'p2', name: '1 Bandeja de ovos de galinha', eggsPerUnit: 30, stock: 15 }),
      product({ id: 'p3', name: 'Ração extra', stock: 5 }),
      product({ id: 'p4', name: 'Kit misto', stock: 8 }),
      product({ id: 'p5', name: 'Carne de codorna', stock: 3 }),
    ];

    const fakeIdb = {
      getAll: (storeName: string) => of(storeName === 'products' ? productsInIdb : []),
      save: (_storeName: string, id: string, data: unknown) => {
        saved.push({ id, ...(data as object) });
        return of(undefined);
      },
    } as unknown as IndexedDbService;

    await TestBed.configureTestingModule({
      imports: [Products],
      providers: [provideRouter([]), { provide: IndexedDbService, useValue: fakeIdb }],
    }).compileComponents();

    fixture = TestBed.createComponent(Products);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it.each(['p1', 'p2', 'p3', 'p4', 'p5'])(
    'edita o estoque do produto %s e a coluna Estoque no Plantel (p.stock) reflete o novo valor',
    async (id) => {
      const target = component['rows']().find((p) => p.id === id)!;
      expect(target).toBeTruthy();

      component['openEdit'](target);
      component['draft']['stock'] = 777;
      await component['saveForm']();

      const updated = component['rows']().find((p) => p.id === id)!;
      expect(updated.stock).toBe(777);
      // Estoque total (Plantel + vendedores) também reflete, sem vendorStock = igual ao Plantel.
      expect(component['estoqueTotal'](updated)).toBe(777);
    },
  );

  it('cria um produto novo e depois consegue editar o estoque dele', async () => {
    component['openNew']();
    component['draft'] = { name: 'Produto Novo', unit: 'un', unitPrice: 1, stock: 50, eggsPerUnit: 0 };
    await component['saveForm']();

    const created = component['rows']().find((p) => p.name === 'Produto Novo');
    expect(created).toBeTruthy();
    expect(created!.stock).toBe(50);

    component['openEdit'](created!);
    component['draft']['stock'] = 999;
    await component['saveForm']();

    const updated = component['rows']().find((p) => p.name === 'Produto Novo');
    expect(updated!.stock).toBe(999);
  });
});
