export interface Expense {
  date: string;
  description: string;
  category: string;
  /** Galpão ao qual a despesa é atribuída (id do `barn`). Ausente = custo geral, não atribuído a um galpão. */
  barnId?: string;
  /** Nome do galpão vindo da planilha (coluna "Galpão"), transitório do import — resolvido pra `barnId` e nunca persistido. */
  barnName?: string;
  /** Opcional: despesas antigas não tinham essa quebra por unidade. */
  quantity?: number;
  /** Opcional: junto com `quantity`, gera `amount` automaticamente. */
  unitPrice?: number;
  amount: number;
  paid: boolean;
}
