/** CRM: comprador único (pelo nome). Telefone só existe aqui, não em `Venda`. */
export interface Customer {
  name: string;
  /** Telefone pro contato/WhatsApp. Vazio até ser preenchido no CRM. */
  phone: string;
}
