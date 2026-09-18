/** Saldo de um produto num galpão (leitura). `product` é o NOME (como vendor-stock). */
export interface BarnStock {
  product: string;
  barnId: string;
  quantity: number;
}
