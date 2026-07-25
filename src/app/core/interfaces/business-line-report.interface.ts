/** As duas linhas de negócio da granja — hoje só existem essas duas espécies. */
export type Species = 'codorna' | 'galinha';

/** Quanto de receita/custo cada espécie "puxa" de um lançamento (venda ou despesa). */
export type SpeciesAmounts = Record<Species, number>;

export interface SpeciesTotals {
  revenue: number;
  cost: number;
  profit: number;
  /** 0–100. `0` quando não há receita no período (evita divisão por zero). */
  marginPct: number;
}

export interface BusinessLineReport {
  codorna: SpeciesTotals;
  galinha: SpeciesTotals;
  /** `true` quando o lucro da galinha é >= 0 no período. */
  galinhaCobreCustos: boolean;
  /** Valor do prejuízo da galinha, coberto pelo resultado da codorna. `0` quando `galinhaCobreCustos` é `true`. */
  diferencaCobertaPelaCodorna: number;
}

export interface ProductLineResult {
  name: string;
  revenue: number;
  cost: number;
  profit: number;
  /** 0–100. `0` quando não há receita do produto no período. */
  marginPct: number;
  quantitySold: number;
}

export interface SpeciesMonthlyPoint {
  /** `YYYY-MM` */
  month: string;
  codornaRevenue: number;
  galinhaRevenue: number;
}
