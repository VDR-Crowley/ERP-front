/** CRM: comprador único (pelo nome). Telefone só existe aqui, não em `Venda`. */
export interface Customer {
  name: string;
  /** Telefone pro contato/WhatsApp. Vazio até ser preenchido no CRM. */
  phone: string;
  /**
   * Agregados calculados no backend a partir de TODAS as vendas da pessoa
   * (importante pro VENDEDOR, cujo /sales é escopado). Ausentes só se vier de
   * uma criação/edição local antes do reload.
   */
  lastPurchase?: string | null;
  purchaseCount?: number;
  total?: number;
  lastSeller?: string | null;
}
