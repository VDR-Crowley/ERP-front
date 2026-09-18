export interface Plantel {
  species: string;
  quantity: number;
  feedBagsPerMonth: number;
  bagPrice: number;
  monthlyTotal: number;
  /**
   * Galpão (barn) onde esta espécie/lote vive. Opcional: dado legado (import
   * da planilha) não traz galpão — fica null até ser atribuído na tela.
   */
  barnId?: number | null;
}
