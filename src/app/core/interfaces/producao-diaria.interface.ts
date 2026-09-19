export interface ProducaoDiaria {
  date: string;
  quailEggs: number | null;
  chickenEggs: number | null;
  /**
   * Galpão (barn) onde a produção foi registrada. Opcional: dado legado
   * (import da planilha) não traz galpão — fica null até ser atribuído.
   */
  barnId?: number | null;
  /**
   * Nome do galpão vindo da planilha (coluna "Galpão"), transitório do import:
   * é resolvido pra `barnId` antes de enviar pra API e nunca é persistido.
   */
  barnName?: string;
}
