export interface Venda {
  date: string;
  product: string;
  quantity: number;
  unitPrice: number;
  total: number;
  paymentPending: boolean;
  buyer: string;
  seller: string;
  deliveryPending: boolean;
  deliveryDate: string | null;
  /**
   * Local de onde a venda baixa o estoque: 'plantel' ou `vendedor:<id>` (ver
   * `core/utils/stock-location.ts`). Opcional pra não quebrar vendas
   * gravadas antes dessa feature — leitura sempre trata ausente como
   * PLANTEL_LOCATION.
   */
  stockLocation?: string;
}
