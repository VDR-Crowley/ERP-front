export interface Plantel {
  species: string;
  quantity: number;
  feedBagsPerMonth: number;
  bagPrice: number;
  monthlyTotal: number;
  /** Opcional: quando o plantel é uma entidade de investimento (ex.: lote comprado pronto). Alimenta o Relatório de Investimento. */
  acquiredDate?: string | null;
  /** Opcional: valor investido na aquisição do lote. Junto com `acquiredDate`, habilita o Relatório de Investimento. */
  investmentAmount?: number | null;
}
