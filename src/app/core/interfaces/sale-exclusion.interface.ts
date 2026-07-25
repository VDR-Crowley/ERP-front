/**
 * Marca uma venda específica (por `id` do registro em `sales`) como "evento isolado" —
 * não representativa do fluxo normal do negócio (ex.: venda única de um produto que não é
 * recorrente). Não apaga a venda do IndexedDB: só a remove dos cálculos de
 * receita/custo/margem na tela "Análise por Linha de Negócio" (por espécie e por produto).
 *
 * Store separado (`excludedSales`) em vez de um campo em `Venda` pra não mexer no schema
 * usado por Vendas/Import-Export, e pra generalizar: qualquer venda pode ser marcada como
 * atípica no futuro, não só o caso do kit misto que motivou essa feature.
 */
export interface SaleExclusion {
  /** `id` do registro em `sales` (store `IDB_STORES.sales`) que está sendo desconsiderado. */
  saleId: string;
  /** Motivo, livre — hoje preenchido com um texto padrão ao marcar pela tela. */
  reason: string;
  /** Data (ISO) em que a exclusão foi marcada. */
  createdAt: string;
}
