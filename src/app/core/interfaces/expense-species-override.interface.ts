import { Species } from './business-line-report.interface';

/**
 * Marca manualmente qual espécie realmente consumiu uma despesa específica (por `id` do
 * registro em `expenses`), sobrescrevendo a detecção automática por texto em
 * `allocateExpenseAmount`. Cobre o caso de um insumo de uma espécie ser de fato usado pra
 * outra (ex.: não tinha ração de codorna disponível no comércio, abriu-se um saco de ração
 * de galinha e usou pras codornas — a categoria/descrição da despesa não reflete quem
 * consumiu o custo).
 *
 * Store separado (`expenseSpeciesOverrides`) em vez de um campo em `Expense`, no mesmo
 * padrão de `SaleExclusion` — não mexe no schema usado por Despesas/Import-Export, e não
 * apaga nem edita o registro original.
 */
export interface ExpenseSpeciesOverride {
  /** `id` do registro em `expenses` (store `IDB_STORES.expenses`) que está sendo sobrescrito. */
  expenseId: string;
  /** Espécie real que consumiu a despesa. `null` força rateio pelo plantel ("ambas"). */
  species: Species | null;
  /** Motivo, livre — hoje preenchido com um texto padrão ao marcar pela tela. */
  reason: string;
  /** Data (ISO) em que o override foi marcado. */
  createdAt: string;
}
