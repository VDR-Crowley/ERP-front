/**
 * Histórico de transferência de estoque entre locais (Plantel <-> Vendedor,
 * ou entre vendedores). NÃO é venda — não gera receita nem `total`. Local no
 * formato de `core/utils/stock-location.ts`: 'plantel' ou `vendedor:<id>`.
 */
export interface StockTransfer {
  date: string;
  product: string;
  quantity: number;
  fromLocation: string;
  toLocation: string;
  note: string | null;
}
