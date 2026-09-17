import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Plantel } from '@core/interfaces/plantel.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, decimalToNullableNumber, decimalToNumber, EntityStore } from '../entity-store';
import { toDateOnly } from '@core/utils/date-diff';

interface FlockApi {
  id: number;
  species: string;
  quantity: number;
  feed_bags_per_month: number;
  bag_price: string;
  monthly_total: string;
  acquired_date: string | null;
  investment_amount: string | null;
}

function toFront(api: FlockApi): Plantel {
  return {
    species: api.species,
    quantity: api.quantity,
    feedBagsPerMonth: api.feed_bags_per_month,
    bagPrice: decimalToNumber(api.bag_price),
    monthlyTotal: decimalToNumber(api.monthly_total),
    acquiredDate: toDateOnly(api.acquired_date),
    investmentAmount: decimalToNullableNumber(api.investment_amount),
  };
}

function toApi(item: Plantel) {
  return {
    species: item.species,
    quantity: item.quantity,
    feed_bags_per_month: item.feedBagsPerMonth,
    bag_price: item.bagPrice,
    monthly_total: item.monthlyTotal,
    acquired_date: item.acquiredDate || null,
    investment_amount: item.investmentAmount ?? null,
  };
}

export function createFlockStore(): EntityStore<Plantel> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/flock`;

  return createRestEntityStore<Plantel, FlockApi>({
    list: () => http.get<FlockApi[]>(base),
    create: (item) => http.post<FlockApi>(base, toApi(item)),
    update: (id, item) => http.put<FlockApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
