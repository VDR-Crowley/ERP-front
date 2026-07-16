export type Species = 'quail' | 'chicken';

export interface NovoLotePlantel {
  startDate: string;
  species: Species;
  eggCount: number;
  expectedHatchDate: string;
  actualHatchDate: string | null;
  hatchedCount: number | null;
  status: 'incubando' | 'eclodido';
  eggCost: number | null;
  feedCost: number | null;
  notes?: string;
}
