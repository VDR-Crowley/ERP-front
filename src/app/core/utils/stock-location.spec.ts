import {
  PLANTEL_LOCATION,
  ProductLike,
  VendedorLike,
  VendorStockLike,
  buildLocationOptions,
  isPlantelLocation,
  locationLabel,
  productStockValue,
  quantityAtLocation,
  stockValue,
  totalStockAllLocations,
  totalStockValue,
  vendedorIdFromLocation,
  vendedorLocation,
  vendorStockQuantity,
} from './stock-location';

function vendedor(overrides: Partial<VendedorLike> = {}): VendedorLike {
  return { id: 'v1', name: 'Karol', active: true, ...overrides };
}

describe('vendedorLocation / vendedorIdFromLocation', () => {
  it('faz o round-trip do id do vendedor pro local e de volta', () => {
    const location = vendedorLocation('abc-123');
    expect(location).toBe('vendedor:abc-123');
    expect(vendedorIdFromLocation(location)).toBe('abc-123');
  });

  it('retorna null pro local Plantel', () => {
    expect(vendedorIdFromLocation(PLANTEL_LOCATION)).toBeNull();
  });
});

describe('isPlantelLocation', () => {
  it('reconhece o local Plantel e rejeita local de vendedor', () => {
    expect(isPlantelLocation(PLANTEL_LOCATION)).toBe(true);
    expect(isPlantelLocation(vendedorLocation('v1'))).toBe(false);
  });
});

describe('locationLabel', () => {
  it('rotula o Plantel', () => {
    expect(locationLabel(PLANTEL_LOCATION, [])).toBe('Plantel');
  });

  it('rotula um vendedor cadastrado', () => {
    const vendedores = [vendedor({ id: 'v1', name: 'Karol' })];
    expect(locationLabel(vendedorLocation('v1'), vendedores)).toBe('Vendedor: Karol');
  });

  it('cai pra "Vendedor removido" quando o id não existe mais na lista', () => {
    expect(locationLabel(vendedorLocation('sumiu'), [])).toBe('Vendedor removido');
  });
});

describe('buildLocationOptions', () => {
  it('sempre inclui Plantel primeiro, seguido dos vendedores ativos', () => {
    const vendedores = [
      vendedor({ id: 'v1', name: 'Karol', active: true }),
      vendedor({ id: 'v2', name: 'Bruno', active: true }),
    ];
    expect(buildLocationOptions(vendedores)).toEqual([
      { value: 'plantel', label: 'Plantel' },
      { value: 'vendedor:v1', label: 'Vendedor: Karol' },
      { value: 'vendedor:v2', label: 'Vendedor: Bruno' },
    ]);
  });

  it('exclui vendedores inativos', () => {
    const vendedores = [vendedor({ id: 'v1', active: false })];
    expect(buildLocationOptions(vendedores)).toEqual([{ value: 'plantel', label: 'Plantel' }]);
  });
});

describe('vendorStockQuantity', () => {
  const items: VendorStockLike[] = [
    { product: 'Ovos', vendedorId: 'v1', quantity: 30 },
    { product: 'Ovos', vendedorId: 'v2', quantity: 10 },
  ];

  it('retorna a quantidade do par produto+vendedor', () => {
    expect(vendorStockQuantity(items, 'Ovos', 'v1')).toBe(30);
  });

  it('retorna 0 quando não há registro pro par', () => {
    expect(vendorStockQuantity(items, 'Ovos', 'v3')).toBe(0);
    expect(vendorStockQuantity(items, 'Ração', 'v1')).toBe(0);
  });
});

describe('quantityAtLocation', () => {
  const vendorStockItems: VendorStockLike[] = [{ product: 'Ovos', vendedorId: 'v1', quantity: 30 }];

  it('lê a quantidade do Plantel do parâmetro plantelQty, ignorando vendorStock', () => {
    expect(quantityAtLocation(PLANTEL_LOCATION, 100, vendorStockItems, 'Ovos')).toBe(100);
  });

  it('lê a quantidade do vendorStock pro local de um vendedor', () => {
    expect(quantityAtLocation(vendedorLocation('v1'), 100, vendorStockItems, 'Ovos')).toBe(30);
  });

  it('retorna 0 pra local de vendedor sem registro', () => {
    expect(quantityAtLocation(vendedorLocation('v2'), 100, vendorStockItems, 'Ovos')).toBe(0);
  });
});

describe('totalStockAllLocations', () => {
  it('soma o Plantel com todos os vendedores que têm o produto', () => {
    const vendorStockItems: VendorStockLike[] = [
      { product: 'Ovos', vendedorId: 'v1', quantity: 30 },
      { product: 'Ovos', vendedorId: 'v2', quantity: 10 },
      { product: 'Ração', vendedorId: 'v1', quantity: 999 },
    ];
    expect(totalStockAllLocations(100, vendorStockItems, 'Ovos')).toBe(140);
  });

  it('retorna só o Plantel quando não há vendorStock pro produto', () => {
    expect(totalStockAllLocations(50, [], 'Ovos')).toBe(50);
  });
});

function product(overrides: Partial<ProductLike> = {}): ProductLike {
  return { name: 'Ovos', unitPrice: 15, stock: 20, ...overrides };
}

describe('stockValue', () => {
  it('multiplica quantidade por preço unitário', () => {
    expect(stockValue(10, 2.5)).toBe(25);
  });

  it('zero em qualquer lado dá zero', () => {
    expect(stockValue(0, 99)).toBe(0);
    expect(stockValue(99, 0)).toBe(0);
  });
});

describe('productStockValue', () => {
  it('soma todos os locais do produto antes de multiplicar pelo preço', () => {
    const p = product({ name: 'Ovos', unitPrice: 15, stock: 20 });
    const vendorStockItems: VendorStockLike[] = [{ product: 'Ovos', vendedorId: 'v1', quantity: 10 }];
    // (20 Plantel + 10 vendedor) * 15 = 450
    expect(productStockValue(p, vendorStockItems)).toBe(450);
  });

  it('ignora vendorStock de outro produto', () => {
    const p = product({ name: 'Ovos', unitPrice: 15, stock: 20 });
    const vendorStockItems: VendorStockLike[] = [{ product: 'Ração', vendedorId: 'v1', quantity: 999 }];
    expect(productStockValue(p, vendorStockItems)).toBe(300);
  });
});

describe('totalStockValue', () => {
  it('soma o valor de todos os produtos', () => {
    const products = [product({ name: 'Ovos', unitPrice: 15, stock: 20 }), product({ name: 'Ração', unitPrice: 4, stock: 50 })];
    const vendorStockItems: VendorStockLike[] = [{ product: 'Ovos', vendedorId: 'v1', quantity: 10 }];
    // Ovos: (20+10)*15 = 450 | Ração: 50*4 = 200
    expect(totalStockValue(products, vendorStockItems)).toBe(650);
  });

  it('retorna 0 pra lista de produtos vazia', () => {
    expect(totalStockValue([], [])).toBe(0);
  });
});

describe('invariante: valor total (Produtos) === soma linha a linha por local (Transferência de Estoque)', () => {
  it('somar stockValue() de cada linha "produto × local" (igual a tabela Estoque por local) bate exatamente com totalStockValue() (o card Valor em estoque) — nunca duas contas separadas', () => {
    const products = [
      product({ name: '50 ovos de codorna', unitPrice: 15, stock: 40 }),
      product({ name: '1 Bandeja de ovos de galinha', unitPrice: 20, stock: 12 }),
      product({ name: 'Ração extra', unitPrice: 4, stock: 0 }), // sem estoque em lugar nenhum
    ];
    const vendorStockItems: VendorStockLike[] = [
      { product: '50 ovos de codorna', vendedorId: 'karol', quantity: 8 },
      { product: '50 ovos de codorna', vendedorId: 'bruno', quantity: 3 },
      { product: '1 Bandeja de ovos de galinha', vendedorId: 'karol', quantity: 5 },
    ];

    // Exatamente a mesma montagem de linhas que StockTransfers.overviewRows faz:
    // 1 linha Plantel por produto + 1 linha por vendedor com quantity > 0.
    const rowValues: number[] = [];
    for (const p of products) {
      rowValues.push(stockValue(p.stock, p.unitPrice));
      for (const vs of vendorStockItems.filter((v) => v.product === p.name)) {
        if (vs.quantity === 0) continue;
        rowValues.push(stockValue(vs.quantity, p.unitPrice));
      }
    }
    const somaLinhaALinha = rowValues.reduce((s, v) => s + v, 0);

    expect(somaLinhaALinha).toBe(totalStockValue(products, vendorStockItems));
  });
});
