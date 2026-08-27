import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Expense } from '@core/interfaces/expense.interface';
import { environment } from '../../../../environments/environment';
import { toDateOnly } from '@core/utils/date-diff';
import { createRestEntityStore, decimalToNumber, decimalToNullableNumber, EntityStore } from '../entity-store';

/** `species_override` vem junto no GET (ver `expense-species-overrides.adapter.ts`) — ignorado aqui, essa store só cuida dos campos próprios de `Expense`. */
export interface ExpenseApi {
  id: number;
  date: string;
  description: string;
  category: string;
  quantity: number | null;
  unit_price: string | null;
  amount: string;
  paid: boolean;
  species_override?: { id: number; expense_id: number; species: 'quail' | 'chicken' | null; reason: string; created_at: string } | null;
}

export function expenseToFront(api: ExpenseApi): Expense {
  return {
    date: toDateOnly(api.date),
    description: api.description,
    category: api.category,
    quantity: api.quantity ?? undefined,
    unitPrice: decimalToNullableNumber(api.unit_price) ?? undefined,
    amount: decimalToNumber(api.amount),
    paid: api.paid,
  };
}

function toApi(item: Expense) {
  return {
    date: item.date,
    description: item.description,
    category: item.category,
    quantity: item.quantity ?? null,
    unit_price: item.unitPrice ?? null,
    amount: item.amount,
    paid: item.paid,
  };
}

export function createExpensesStore(): EntityStore<Expense> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/expenses`;

  return createRestEntityStore<Expense, ExpenseApi>({
    list: () => http.get<ExpenseApi[]>(base),
    create: (item) => http.post<ExpenseApi>(base, toApi(item)),
    update: (id, item) => http.put<ExpenseApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront: expenseToFront,
  });
}
