export type Species = 'quail' | 'chicken';

/** Um registro de nascimentos dentro do período de eclosão de um lote (eclosão não é instantânea — leva vários dias). */
export interface HatchEvent {
  id: string;
  date: string;
  count: number;
  notes?: string;
}

export interface NovoLotePlantel {
  startDate: string;
  species: Species;
  eggCount: number;
  expectedHatchDate: string;
  /** Histórico incremental de nascimentos do lote (ver `HatchEvent`) — substitui os campos únicos legados abaixo. */
  hatchEvents: HatchEvent[];
  status: 'incubando' | 'eclodido';
  eggCost: number | null;
  feedCost: number | null;
  notes?: string;
  /** @deprecated Campo legado (pré-`hatchEvents`) mantido só pra leitura/migração de registros salvos antes dessa mudança. */
  actualHatchDate?: string | null;
  /** @deprecated Campo legado (pré-`hatchEvents`) mantido só pra leitura/migração de registros salvos antes dessa mudança. */
  hatchedCount?: number | null;
}
