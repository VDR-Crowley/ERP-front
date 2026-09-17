/** Uma linha (mês) do Relatório de Investimento de um plantel — ver `GET /flock/{flock}/investment-report`. */
export interface FlockInvestmentMonth {
  /** `YYYY-MM` */
  month: string;
  revenue: number;
  expenses: number;
  expensesCovered: boolean;
  investmentPaidThisMonth: number;
  remainingInvestment: number;
}
