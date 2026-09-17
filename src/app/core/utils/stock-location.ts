/**
 * Estoque separado por LOCAL: "Plantel" (padrão, dono do campo `Product.stock`
 * já existente), opcionalmente um PLANTEL ESPECÍFICO (`flock_stock` do lote,
 * mantido em sincronia com `Product.stock` pelo backend — não é um pool à
 * parte, só uma marcação de qual lote foi debitado) ou "com um Vendedor"
 * (novo store `vendorStock`, um registro por par produto+vendedor). O local
 * vira uma string simples pra caber nos selects do crud-form-modal sem
 * precisar de mais uma entidade: 'plantel', `plantel:<flockId>` ou
 * `vendedor:<id>`. Funções aqui são puras (sem IDB) — a leitura/escrita real
 * do estoque fica nos componentes que injetam os entity-stores.
 */

export const PLANTEL_LOCATION = 'plantel';
const PLANTEL_FLOCK_PREFIX = 'plantel:';
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

export interface FlockLike {
  id: string;
  species: string;
}

export function vendedorLocation(vendedorId: string): string {
  return `${VENDEDOR_PREFIX}${vendedorId}`;
}

export function vendedorIdFromLocation(location: string): string | null {
  return location.startsWith(VENDEDOR_PREFIX) ? location.slice(VENDEDOR_PREFIX.length) : null;
}

export function flockLocation(flockId: string): string {
  return `${PLANTEL_FLOCK_PREFIX}${flockId}`;
}

export function flockIdFromLocation(location: string): string | null {
  return location.startsWith(PLANTEL_FLOCK_PREFIX) ? location.slice(PLANTEL_FLOCK_PREFIX.length) : null;
}

/** `true` pro Plantel genérico E pro Plantel de um lote específico — os dois debitam do mesmo pool (`Product.stock`), só muda se a baixa também marca um `flock_stock`. */
export function isPlantelLocation(location: string): boolean {
  return location === PLANTEL_LOCATION || location.startsWith(PLANTEL_FLOCK_PREFIX);
}

/** Rótulo pra exibir em tabelas/históricos. Vendedor/lote apagado ainda mostra algo legível. */
export function locationLabel(location: string, vendedores: VendedorLike[], flocks: FlockLike[] = []): string {
  if (location === PLANTEL_LOCATION) return 'Plantel';
  const flockId = flockIdFromLocation(location);
  if (flockId) {
    const flock = flocks.find((f) => f.id === flockId);
    return flock ? `Plantel: ${flock.species}` : 'Plantel: lote removido';
  }
  const id = vendedorIdFromLocation(location);
  const vendedor = vendedores.find((v) => v.id === id);
  return vendedor ? `Vendedor: ${vendedor.name}` : 'Vendedor removido';
}

/** Opções pro select de local (Plantel genérico + planteis específicos + vendedores ativos), pro campo da venda/transferência. */
export function buildLocationOptions(
  vendedores: VendedorLike[],
  flocks: FlockLike[] = [],
): { value: string; label: string }[] {
  return [
    { value: PLANTEL_LOCATION, label: 'Plantel' },
    ...flocks.map((f) => ({ value: flockLocation(f.id), label: `Plantel: ${f.species}` })),
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

export interface ProductLike {
  name: string;
  unitPrice: number;
  stock: number;
}

/**
 * Multiplicação quantidade × preço unitário — trivial isolada, mas é a ÚNICA
 * função que faz essa conta no app. Card "Valor em estoque" (Produtos) e
 * tabela "Estoque por local" (Transferência de Estoque) chamam essa mesma
 * função em vez de reimplementar `qtd * preço` cada um no seu canto, pra
 * nunca divergir (ver invariante em stock-location.spec.ts).
 */
export function stockValue(quantity: number, unitPrice: number): number {
  return quantity * unitPrice;
}

/** Valor de estoque de UM produto = soma de todos os locais × preço unitário. Mesma fonte usada linha a linha na Transferência de Estoque e somada no card de Produtos. */
export function productStockValue(product: ProductLike, vendorStockItems: VendorStockLike[]): number {
  return stockValue(totalStockAllLocations(product.stock, vendorStockItems, product.name), product.unitPrice);
}

/** Valor total de estoque de TODOS os produtos, todos os locais — fonte única do card "Valor em estoque". */
export function totalStockValue(products: ProductLike[], vendorStockItems: VendorStockLike[]): number {
  return products.reduce((soma, p) => soma + productStockValue(p, vendorStockItems), 0);
}
