/**
 * Saldo de um produto no estoque de um vendedor específico. Um registro por
 * par (product, vendedorId) — ver `core/utils/stock-location.ts` pra leitura
 * e cálculo. O Estoque no Plantel continua no campo `Product.stock` já
 * existente; isso aqui cobre só o que está fora do Plantel.
 */
export interface VendorStock {
  product: string;
  vendedorId: string;
  quantity: number;
}
