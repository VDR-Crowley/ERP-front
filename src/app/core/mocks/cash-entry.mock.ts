import { CashEntry, ChartBar } from '@core/interfaces/cash-entry.interface';

// Source: Mini_ERP_Criacao_Codornas_Galinhas.xlsx, aba "Fluxo de Caixa"
export const CASHFLOW_MOCK: CashEntry[] = [
  { date: '2026-06-20', description: 'Venda bandeja galinha', inflow: true, amount: 60 },
  { date: '2026-06-22', description: 'Venda 50 ovos codorna', inflow: true, amount: 45 },
  { date: '2026-06-24', description: 'Conta de energia', inflow: false, amount: 187.5 },
  { date: '2026-06-25', description: 'Venda 50 ovos codorna', inflow: true, amount: 30 },
  { date: '2026-06-26', description: 'Compra de ração', inflow: false, amount: 106 },
  { date: '2026-06-28', description: 'Venda bandeja galinha', inflow: true, amount: 20 },
  { date: '2026-06-29', description: 'Compra de ração', inflow: false, amount: 100 },
  { date: '2026-06-30', description: 'Venda 50 ovos codorna', inflow: true, amount: 15 },
];

// Série histórica ilustrativa (entradas x saídas por mês)
export const CASH_FLOW_CHART_MOCK: ChartBar[] = [
  { month: 'Jan', inPct: '45%', outPct: '30%' },
  { month: 'Fev', inPct: '60%', outPct: '38%' },
  { month: 'Mar', inPct: '52%', outPct: '44%' },
  { month: 'Abr', inPct: '72%', outPct: '40%' },
  { month: 'Mai', inPct: '66%', outPct: '50%' },
  { month: 'Jun', inPct: '85%', outPct: '46%' },
];
