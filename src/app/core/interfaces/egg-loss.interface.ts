import type { Species } from './novo-lote-plantel.interface';

export interface EggLoss {
  date: string;
  species: Species;
  quantity: number;
  reason?: string;
}
