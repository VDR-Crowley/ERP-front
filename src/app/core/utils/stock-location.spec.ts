import {
  PLANTEL_LOCATION,
  VendedorLike,
  VendorStockLike,
  buildLocationOptions,
  isPlantelLocation,
  locationLabel,
  quantityAtLocation,
  totalStockAllLocations,
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
