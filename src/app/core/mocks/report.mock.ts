import { RevenueBar, ReportResumo } from '@core/interfaces/report.interface';

// Série histórica ilustrativa (faturamento por mês)
export const REVENUE_BARS_MOCK: RevenueBar[] = [
  { month: 'Jan', height: '52%' },
  { month: 'Fev', height: '64%' },
  { month: 'Mar', height: '58%' },
  { month: 'Abr', height: '78%' },
  { month: 'Mai', height: '70%' },
  { month: 'Jun', height: '92%' },
];

// Indicadores complementares que ainda não têm série histórica própria nos mocks
export const REPORT_RESUMO_MOCK: ReportResumo = {
  eggsSold: 14200,
  eggsSoldChange: '+8,1%',
  marginPct: 38,
  marginChange: '+3,0%',
  revenueChange: '+12,4%',
  avgTicketChange: '-1,2%',
};
