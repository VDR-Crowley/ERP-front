/** Ação renderizada no rodapé opcional do bottom sheet (`sheet__footer`). */
export interface BottomSheetAction {
  label: string;
  icon?: string;
  /** Estilo do botão — usa as classes `.btn--primary`/`.btn--ghost` já existentes no projeto. */
  intent?: 'primary' | 'ghost';
  disabled?: boolean;
  action?: () => void;
  /** `false` mantém o sheet aberto após o clique. Padrão: fecha. */
  closeOnClick?: boolean;
}
