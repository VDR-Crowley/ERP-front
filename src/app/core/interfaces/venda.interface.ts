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
}
