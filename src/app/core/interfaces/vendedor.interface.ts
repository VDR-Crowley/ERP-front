/** Lista reaproveitável de vendedores/revendedores — usada no local de estoque ("Estoque com o Vendedor X") e no campo Vendedor da venda. */
export interface Vendedor {
  name: string;
  contact: string;
  active: boolean;
}
