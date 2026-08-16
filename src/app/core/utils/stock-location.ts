/**
 * Estoque separado por LOCAL: "Plantel" (padrão, dono do campo `Product.stock`
 * já existente) ou "com um Vendedor" (novo store `vendorStock`, um registro
 * por par produto+vendedor). O local vira uma string simples pra caber nos
 * selects do crud-form-modal sem precisar de mais uma entidade: 'plantel' ou
 * `vendedor:<id>`. Funções aqui são puras (sem IDB) — a leitura/escrita real
 * do estoque fica nos componentes que injetam os entity-stores.
 */

export const PLANTEL_LOCATION = 'plantel';
const VENDEDOR_PREFIX = 'vendedor:';

export interface VendorStockLike {
  product: string;
  vendedorId: string;
  quantity: number;
}

export interface VendedorLike {
  id: string;
  name: string;
  active: boolean;
}

export function vendedorLocation(vendedorId: string): string {
  return `${VENDEDOR_PREFIX}${vendedorId}`;
}

export function vendedorIdFromLocation(location: string): string | null {
  return location.startsWith(VENDEDOR_PREFIX) ? location.slice(VENDEDOR_PREFIX.length) : null;
}

export function isPlantelLocation(location: string): boolean {
  return location === PLANTEL_LOCATION;
}

/** Rótulo pra exibir em tabelas/históricos. Vendedor apagado ainda mostra algo legível. */
export function locationLabel(location: string, vendedores: VendedorLike[]): string {
  if (isPlantelLocation(location)) return 'Plantel';
  const id = vendedorIdFromLocation(location);
  const vendedor = vendedores.find((v) => v.id === id);
  return vendedor ? `Vendedor: ${vendedor.name}` : 'Vendedor removido';
}

/** Opções pro select de local (Plantel + vendedores ativos), pro campo da venda/transferência. */
export function buildLocationOptions(vendedores: VendedorLike[]): { value: string; label: string }[] {
  return [
    { value: PLANTEL_LOCATION, label: 'Plantel' },
    ...vendedores
      .filter((v) => v.active)
      .map((v) => ({ value: vendedorLocation(v.id), label: `Vendedor: ${v.name}` })),
  ];
}

export function vendorStockQuantity(
  items: VendorStockLike[],
  product: string,
  vendedorId: string,
): number {
  const found = items.find((i) => i.product === product && i.vendedorId === vendedorId);
  return found?.quantity ?? 0;
}

/** Quantidade do produto no local dado — lê `plantelQty` (Estoque no Plantel) ou o vendorStock. */
export function quantityAtLocation(
  location: string,
  plantelQty: number,
  vendorStockItems: VendorStockLike[],
  product: string,
): number {
  if (isPlantelLocation(location)) return plantelQty;
  const vendedorId = vendedorIdFromLocation(location);
  if (!vendedorId) return 0;
  return vendorStockQuantity(vendorStockItems, product, vendedorId);
}

/** Valor total de estoque de um produto = soma de todos os locais (Plantel + cada vendedor). */
export function totalStockAllLocations(
  plantelQty: number,
  vendorStockItems: VendorStockLike[],
  product: string,
): number {
  const vendorTotal = vendorStockItems
    .filter((i) => i.product === product)
    .reduce((soma, i) => soma + i.quantity, 0);
  return plantelQty + vendorTotal;
}
