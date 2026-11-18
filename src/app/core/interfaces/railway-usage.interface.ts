/** Consumo bruto do ciclo de cobrança do Railway (unidades: vCPU-min, GB-min, GB). */
export interface RailwayUsageMetrics {
  cpuVcpuMinutes: number;
  memoryGbMinutes: number;
  networkEgressGb: number;
  volumeGbMinutes: number;
  backupGbMinutes: number;
}

export interface RailwayServiceUsage {
  serviceId: string | null;
  name: string;
  usage: RailwayUsageMetrics;
  costUsd: number;
}

/** Resposta de `GET /admin/railway-usage` (camelCase). Valores em US$. */
export interface RailwayUsage {
  projectName: string | null;
  planCreditUsd: number;
  currentCostUsd: number;
  estimatedCycleEndCostUsd: number;
  creditUsedPercent: number | null;
  estimatedCreditUsedPercent: number | null;
  services: RailwayServiceUsage[];
  estimatedUsage: RailwayUsageMetrics;
  note: string;
  fetchedAt: string;
  cached: boolean;
}

/** Corpo de erro do endpoint (503 = não configurado, 502 = falha na API do Railway). */
export interface RailwayUsageError {
  message: string;
  configured?: boolean;
  missing?: string[];
  howToFix?: string;
}
