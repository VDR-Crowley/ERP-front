import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { RailwayUsage, RailwayUsageMetrics } from '@core/interfaces/railway-usage.interface';
import { environment } from '../../../environments/environment';

interface UsageMetricsApi {
  cpu_vcpu_minutes: number;
  memory_gb_minutes: number;
  network_egress_gb: number;
  volume_gb_minutes: number;
  backup_gb_minutes: number;
}

interface RailwayUsageApi {
  project: { id: string; name: string | null };
  plan_credit_usd: number;
  totals: {
    current_cost_usd: number;
    estimated_cycle_end_cost_usd: number;
    credit_used_percent: number | null;
    estimated_credit_used_percent: number | null;
  };
  services: {
    service_id: string | null;
    name: string;
    usage: UsageMetricsApi;
    cost_usd: number;
  }[];
  estimated_usage: UsageMetricsApi;
  note: string;
  fetched_at: string;
  cached: boolean;
}

/**
 * `GET /admin/railway-usage` — consumo/custo do Railway no ciclo de cobrança
 * atual. Só ADMINISTRADOR (403 pros demais). O backend cacheia ~5 min;
 * `fresh = true` manda `?fresh=1` pra consultar a Railway na hora (o
 * endpoint tem limite de 30 req/min).
 */
@Injectable({ providedIn: 'root' })
export class RailwayUsageApiService {
  private readonly http = inject(HttpClient);
  private readonly url = `${environment.apiUrl}/admin/railway-usage`;

  get(fresh = false): Observable<RailwayUsage> {
    const params = fresh ? new HttpParams().set('fresh', '1') : new HttpParams();
    return this.http.get<RailwayUsageApi>(this.url, { params }).pipe(map(toFront));
  }
}

function metrics(api: UsageMetricsApi): RailwayUsageMetrics {
  return {
    cpuVcpuMinutes: api.cpu_vcpu_minutes,
    memoryGbMinutes: api.memory_gb_minutes,
    networkEgressGb: api.network_egress_gb,
    volumeGbMinutes: api.volume_gb_minutes,
    backupGbMinutes: api.backup_gb_minutes,
  };
}

function toFront(api: RailwayUsageApi): RailwayUsage {
  return {
    projectName: api.project?.name ?? null,
    planCreditUsd: api.plan_credit_usd,
    currentCostUsd: api.totals.current_cost_usd,
    estimatedCycleEndCostUsd: api.totals.estimated_cycle_end_cost_usd,
    creditUsedPercent: api.totals.credit_used_percent,
    estimatedCreditUsedPercent: api.totals.estimated_credit_used_percent,
    services: api.services.map((s) => ({
      serviceId: s.service_id,
      name: s.name,
      usage: metrics(s.usage),
      costUsd: s.cost_usd,
    })),
    estimatedUsage: metrics(api.estimated_usage),
    note: api.note,
    fetchedAt: api.fetched_at,
    cached: api.cached,
  };
}
