import { Plantel } from '@core/interfaces/plantel.interface';

// Source: Mini_ERP_Criacao_Codornas_Galinhas.xlsx, aba "Plantel"
export const PLANTEL_MOCK: Plantel[] = [
  { species: 'Codornas', quantity: 130, feedBagsPerMonth: 3, bagPrice: 106, monthlyTotal: 318 },
  {
    species: 'Galinhas Embrapa 051',
    quantity: 32,
    feedBagsPerMonth: 4,
    bagPrice: 100,
    monthlyTotal: 400,
  },
];
