export interface RevenueBar {
  month: string;
  height: string;
}

export interface TopBuyer {
  name: string;
  orders: number;
  total: number;
  pct: string;
}

export interface ReportResumo {
  eggsSold: number;
  eggsSoldChange: string;
  marginPct: number;
  marginChange: string;
  revenueChange: string;
  avgTicketChange: string;
}
