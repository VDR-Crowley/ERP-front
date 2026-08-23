import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { BusinessLineReport, ProductLineResult, SpeciesMonthlyPoint } from '@core/interfaces/business-line-report.interface';
import { environment } from '../../../environments/environment';

interface SpeciesTotalsApi {
  revenue: number;
  cost: number;
  profit: number;
  margin_pct: number;
}

interface BusinessLineReportApi {
  by_species: {
    quail: SpeciesTotalsApi;
    chicken: SpeciesTotalsApi;
    chicken_covers_costs: boolean;
    difference_covered_by_quail: number;
  };
  by_product: {
    name: string;
    revenue: number;
    cost: number;
    profit: number;
    margin_pct: number;
    quantity_sold: number;
  }[];
  monthly_series: { month: string; quail_revenue: number; chicken_revenue: number }[];
}

export interface BusinessLineReportResult {
  report: BusinessLineReport;
  byProduct: ProductLineResult[];
  monthly: SpeciesMonthlyPoint[];
}

/**
 * `GET /business-line-report` — substitui o cálculo local que existia em
 * `business-line-report.util.ts` (rateio de despesa por espécie, receita de
 * kit misto, etc. — tudo isso agora é feito no backend a partir de `sales`,
 * `expenses`, `flock` e `products` reais). Mapeia o payload em inglês
 * (`by_species.quail/chicken`) pro shape português que a tela/HTML já usam
 * (`report().codorna`/`report().galinha`) — só a tela "Análise por Linha de
 * Negócio" usa esse serviço.
 */
@Injectable({ providedIn: 'root' })
export class BusinessLineReportApiService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/business-line-report`;

  get(start?: string, end?: string): Observable<BusinessLineReportResult> {
    let params = new HttpParams();
    if (start) params = params.set('start', start);
    if (end) params = params.set('end', end);

    return this.http.get<BusinessLineReportApi>(this.base, { params }).pipe(map(toFront));
  }
}

function toFront(api: BusinessLineReportApi): BusinessLineReportResult {
  return {
    report: {
      codorna: fromSpeciesTotals(api.by_species.quail),
      galinha: fromSpeciesTotals(api.by_species.chicken),
      galinhaCobreCustos: api.by_species.chicken_covers_costs,
      diferencaCobertaPelaCodorna: api.by_species.difference_covered_by_quail,
    },
    byProduct: api.by_product.map((p) => ({
      name: p.name,
      revenue: p.revenue,
      cost: p.cost,
      profit: p.profit,
      marginPct: p.margin_pct,
      quantitySold: p.quantity_sold,
    })),
    monthly: api.monthly_series.map((m) => ({
      month: m.month,
      codornaRevenue: m.quail_revenue,
      galinhaRevenue: m.chicken_revenue,
    })),
  };
}

function fromSpeciesTotals(api: SpeciesTotalsApi) {
  return { revenue: api.revenue, cost: api.cost, profit: api.profit, marginPct: api.margin_pct };
}
