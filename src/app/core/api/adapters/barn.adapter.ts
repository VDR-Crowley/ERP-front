import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Barn } from '@core/interfaces/barn.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, EntityStore } from '../entity-store';

interface BarnApi {
  id: number;
  name: string;
  location: string | null;
  start_date: string | null;
  notes: string | null;
}

/** Normaliza data ISO (`2026-09-17T00:00:00...`) ou `yyyy-MM-dd` pra `yyyy-MM-dd`. */
function toDateOnly(value: string | null): string | null {
  return value ? value.slice(0, 10) : null;
}

function toFront(api: BarnApi): Barn {
  return {
    name: api.name,
    location: api.location ?? null,
    startDate: toDateOnly(api.start_date),
    notes: api.notes ?? null,
  };
}

function toApi(item: Barn) {
  return {
    name: item.name,
    location: item.location || null,
    start_date: item.startDate || null,
    notes: item.notes || null,
  };
}

export function createBarnStore(): EntityStore<Barn> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/barns`;

  return createRestEntityStore<Barn, BarnApi>({
    list: () => http.get<BarnApi[]>(base),
    create: (item) => http.post<BarnApi>(base, toApi(item)),
    update: (id, item) => http.put<BarnApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
