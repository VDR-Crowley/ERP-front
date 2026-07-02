export interface Venda {
  data: string;
  produto: string;
  quantidade: number;
  precoUnitario: number;
  total: number;
  pendentePagamento: boolean;
  comprador: string;
  vendedor: string;
}
