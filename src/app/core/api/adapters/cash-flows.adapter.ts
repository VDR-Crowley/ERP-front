import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CashEntry } from '@core/interfaces/cash-entry.interface';
import { environment } from '../../../../environments/environment';
import { toDateOnly } from '@core/utils/date-diff';
import { createRestEntityStore, decimalToNumber, EntityStore } from '../entity-store';

interface CashFlowApi {
  id: number;
  date: string;
  description: string;
  inflow: boolean;
  amount: string;
}

function toFront(api: CashFlowApi): CashEntry {
  return {
    date: toDateOnly(api.date),
    description: api.description,
    inflow: api.inflow,
    amount: decimalToNumber(api.amount),
  };
}

function toApi(item: CashEntry) {
  return { date: item.date, description: item.description, inflow: item.inflow, amount: item.amount };
}

export function createCashFlowsStore(): EntityStore<CashEntry> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/cash-flows`;

  return createRestEntityStore<CashEntry, CashFlowApi>({
    list: () => http.get<CashFlowApi[]>(base),
    create: (item) => http.post<CashFlowApi>(base, toApi(item)),
    update: (id, item) => http.put<CashFlowApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
