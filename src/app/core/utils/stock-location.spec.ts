import {
  FlockLike,
  PLANTEL_LOCATION,
  ProductLike,
  VendedorLike,
  VendorStockLike,
  buildLocationOptions,
  flockIdFromLocation,
  flockLocation,
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

function flock(overrides: Partial<FlockLike> = {}): FlockLike {
  return { id: 'f1', species: 'Galinha Embrapa 051', ...overrides };
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

describe('flockLocation / flockIdFromLocation', () => {
  it('faz o round-trip do id do lote pro local e de volta', () => {
    const location = flockLocation('2');
    expect(location).toBe('plantel:2');
    expect(flockIdFromLocation(location)).toBe('2');
  });

  it('retorna null pro local Plantel genérico e pro local de vendedor', () => {
    expect(flockIdFromLocation(PLANTEL_LOCATION)).toBeNull();
    expect(flockIdFromLocation(vendedorLocation('v1'))).toBeNull();
  });
});

describe('isPlantelLocation', () => {
  it('reconhece o Plantel genérico e o Plantel de um lote específico, rejeita local de vendedor', () => {
    expect(isPlantelLocation(PLANTEL_LOCATION)).toBe(true);
    expect(isPlantelLocation(flockLocation('f1'))).toBe(true);
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

  it('rotula um plantel específico cadastrado', () => {
    const flocks = [flock({ id: 'f1', species: 'Codorna' })];
    expect(locationLabel(flockLocation('f1'), [], flocks)).toBe('Plantel: Codorna');
  });

  it('cai pra "Plantel: lote removido" quando o id não existe mais na lista', () => {
    expect(locationLabel(flockLocation('sumiu'), [], [])).toBe('Plantel: lote removido');
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

  it('inclui os planteis específicos entre o Plantel genérico e os vendedores', () => {
    const vendedores = [vendedor({ id: 'v1', name: 'Karol', active: true })];
    const flocks = [flock({ id: 'f1', species: 'Codorna' }), flock({ id: 'f2', species: 'Galinha' })];
    expect(buildLocationOptions(vendedores, flocks)).toEqual([
      { value: 'plantel', label: 'Plantel' },
      { value: 'plantel:f1', label: 'Plantel: Codorna' },
      { value: 'plantel:f2', label: 'Plantel: Galinha' },
      { value: 'vendedor:v1', label: 'Vendedor: Karol' },
    ]);
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
