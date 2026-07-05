import { Expense } from '@core/interfaces/expense.interface';

// Source: Mini_ERP_Criacao_Codornas_Galinhas.xlsx, aba "Despesas"
export const EXPENSES_MOCK: Expense[] = [
  { date: '2026-06-30', description: 'Ração codornas', category: 'Ração', amount: 106, paid: true },
  {
    date: '2026-06-29',
    description: 'Ração galinhas Embrapa',
    category: 'Ração',
    amount: 100,
    paid: true,
  },
  { date: '2026-06-26', description: 'Ração codornas', category: 'Ração', amount: 106, paid: true },
  { date: '2026-06-25', description: 'Ração galinhas Embrapa', category: 'Ração', amount: 100, paid: true },
  { date: '2026-06-24', description: 'Conta de energia', category: 'Energia', amount: 187.5, paid: false },
  { date: '2026-06-22', description: 'Bebedouros novos', category: 'Equipamento', amount: 240, paid: true },
  { date: '2026-06-20', description: 'Frete de insumos', category: 'Transporte', amount: 80, paid: true },
  { date: '2026-06-18', description: 'Reparo do galpão', category: 'Manutenção', amount: 150, paid: false },
  { date: '2026-06-15', description: 'Vacinas do plantel', category: 'Sanidade', amount: 95, paid: true },
];
