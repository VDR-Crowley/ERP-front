export interface Expense {
  date: string;
  description: string;
  category: string;
  /** Opcional: despesas antigas não tinham essa quebra por unidade. */
  quantity?: number;
  /** Opcional: junto com `quantity`, gera `amount` automaticamente. */
  unitPrice?: number;
  amount: number;
  paid: boolean;
}
