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
  /**
   * Rótulo "Local do estoque" vindo da planilha (coluna do export: "Plantel" ou
   * "Vendedor: <nome>"), transitório do import — resolvido pra `stockLocation`
   * (vendedor por nome; galpão/vazio viram Plantel) e nunca persistido.
   */
  stockLocationLabel?: string;
}
