/**
 * Galpão (plantel/local físico). Abriga os lotes de aves (ver Flock/Plantel).
 * Consumido por `createBarnStore` (ver core/api/adapters/barn.adapter.ts).
 */
export interface Barn {
  /** Nome do galpão. Ex: "Galpão 1". */
  name: string;
  /** Localização física (opcional). */
  location: string | null;
  /** Data de início do galpão, em `yyyy-MM-dd` (opcional). */
  startDate: string | null;
  /** Observações livres (opcional). */
  notes: string | null;
}
