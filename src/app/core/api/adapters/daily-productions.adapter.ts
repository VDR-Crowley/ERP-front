import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { ProducaoDiaria } from '@core/interfaces/producao-diaria.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, EntityStore } from '../entity-store';

interface DailyProductionApi {
  id: number;
  date: string;
  quail_eggs: number | null;
  chicken_eggs: number | null;
}

function toFront(api: DailyProductionApi): ProducaoDiaria {
  return { date: api.date, quailEggs: api.quail_eggs, chickenEggs: api.chicken_eggs };
}

function toApi(item: ProducaoDiaria) {
  return { date: item.date, quail_eggs: item.quailEggs, chicken_eggs: item.chickenEggs };
}

export function createDailyProductionsStore(): EntityStore<ProducaoDiaria> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/daily-productions`;

  return createRestEntityStore<ProducaoDiaria, DailyProductionApi>({
    list: () => http.get<DailyProductionApi[]>(base),
    create: (item) => http.post<DailyProductionApi>(base, toApi(item)),
    update: (id, item) => http.put<DailyProductionApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
