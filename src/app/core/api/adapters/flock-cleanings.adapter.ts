import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { FlockCleaning } from '@core/interfaces/flock-cleaning.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, EntityStore } from '../entity-store';

interface FlockCleaningApi {
  id: number;
  date: string;
  species: 'quail' | 'chicken';
  cleaning_type: 'total' | 'feeder' | 'tray' | 'nest';
  notes: string | null;
}

function toFront(api: FlockCleaningApi): FlockCleaning {
  return {
    date: api.date,
    species: api.species,
    cleaningType: api.cleaning_type,
    notes: api.notes ?? undefined,
  };
}

function toApi(item: FlockCleaning) {
  return {
    date: item.date,
    species: item.species,
    cleaning_type: item.cleaningType,
    notes: item.notes || null,
  };
}

export function createFlockCleaningsStore(): EntityStore<FlockCleaning> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/flock-cleanings`;

  return createRestEntityStore<FlockCleaning, FlockCleaningApi>({
    list: () => http.get<FlockCleaningApi[]>(base),
    create: (item) => http.post<FlockCleaningApi>(base, toApi(item)),
    update: (id, item) => http.put<FlockCleaningApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
