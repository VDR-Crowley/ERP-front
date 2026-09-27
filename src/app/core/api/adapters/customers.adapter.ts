import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Customer } from '@core/interfaces/customer.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, EntityStore } from '../entity-store';

interface CustomerApi {
  id: number;
  name: string;
  phone: string | null;
}

function toFront(api: CustomerApi): Customer {
  return { name: api.name, phone: api.phone ?? '' };
}

function toApi(item: Customer) {
  return { name: item.name, phone: item.phone || null };
}

export function createCustomersStore(): EntityStore<Customer> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/customers`;

  return createRestEntityStore<Customer, CustomerApi>({
    list: () => http.get<CustomerApi[]>(base),
    create: (item) => http.post<CustomerApi>(base, toApi(item)),
    update: (id, item) => http.put<CustomerApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
