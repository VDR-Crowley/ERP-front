import type { Species } from './novo-lote-plantel.interface';

export type CleaningType = 'total' | 'feeder' | 'tray' | 'nest';

export interface FlockCleaning {
  date: string;
  species: Species;
  cleaningType: CleaningType;
  notes?: string;
}
