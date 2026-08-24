import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EggLoss } from '@core/interfaces/egg-loss.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, EntityStore } from '../entity-store';

interface EggLossApi {
  id: number;
  date: string;
  species: 'quail' | 'chicken';
  quantity: number;
  reason: string | null;
}

function toFront(api: EggLossApi): EggLoss {
  return {
    date: api.date,
    species: api.species,
    quantity: api.quantity,
    reason: api.reason ?? undefined,
  };
}

function toApi(item: EggLoss) {
  return {
    date: item.date,
    species: item.species,
    quantity: item.quantity,
    reason: item.reason || null,
  };
}

export function createEggLossesStore(): EntityStore<EggLoss> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/egg-losses`;

  return createRestEntityStore<EggLoss, EggLossApi>({
    list: () => http.get<EggLossApi[]>(base),
    create: (item) => http.post<EggLossApi>(base, toApi(item)),
    update: (id, item) => http.put<EggLossApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
