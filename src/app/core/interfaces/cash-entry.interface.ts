export interface CashEntry {
  date: string;
  description: string;
  inflow: boolean;
  amount: number;
}

export interface ChartBar {
  month: string;
  inPct: string;
  outPct: string;
}
