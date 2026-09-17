import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { FlockInvestmentMonth } from '@core/interfaces/flock-investment-report.interface';
import { environment } from '../../../environments/environment';

interface FlockInvestmentMonthApi {
  month: string;
  revenue: number;
  expenses: number;
  expenses_covered: boolean;
  investment_paid_this_month: number;
  remaining_investment: number;
}

/**
 * `GET /flock/{flock}/investment-report` — série mensal de payback do
 * investimento de um plantel. Retorna 422 (corpo `{ message }`) quando o
 * plantel não tem `acquired_date`/`investment_amount` cadastrados; a tela
 * trata esse erro mostrando a orientação pra completar o cadastro em vez de
 * tratar como falha genérica.
 */
@Injectable({ providedIn: 'root' })
export class FlockInvestmentReportApiService {
  private readonly http = inject(HttpClient);

  get(flockId: string): Observable<FlockInvestmentMonth[]> {
    const url = `${environment.apiUrl}/flock/${flockId}/investment-report`;
    return this.http.get<FlockInvestmentMonthApi[]>(url).pipe(map((list) => list.map(toFront)));
  }
}

function toFront(api: FlockInvestmentMonthApi): FlockInvestmentMonth {
  return {
    month: api.month,
    revenue: api.revenue,
    expenses: api.expenses,
    expensesCovered: api.expenses_covered,
    investmentPaidThisMonth: api.investment_paid_this_month,
    remainingInvestment: api.remaining_investment,
  };
}
