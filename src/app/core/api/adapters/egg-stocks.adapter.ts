import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { EstoqueOvos } from '@core/interfaces/estoque-ovos.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, decimalToNumber, EntityStore } from '../entity-store';

interface EggStockApi {
  id: number;
  date: string;
  quail_eggs: number | null;
  chicken_eggs: number | null;
  quail_packs: string;
  chicken_packs: string;
  quail_stock_value: string;
  chicken_stock_value: string;
}

function toFront(api: EggStockApi): EstoqueOvos {
  return {
    date: api.date,
    quailEggs: api.quail_eggs,
    chickenEggs: api.chicken_eggs,
    quailPacks: decimalToNumber(api.quail_packs),
    chickenPacks: decimalToNumber(api.chicken_packs),
    quailStockValue: decimalToNumber(api.quail_stock_value),
    chickenStockValue: decimalToNumber(api.chicken_stock_value),
  };
}

function toApi(item: EstoqueOvos) {
  return {
    date: item.date,
    quail_eggs: item.quailEggs,
    chicken_eggs: item.chickenEggs,
    quail_packs: item.quailPacks,
    chicken_packs: item.chickenPacks,
    quail_stock_value: item.quailStockValue,
    chicken_stock_value: item.chickenStockValue,
  };
}

export function createEggStocksStore(): EntityStore<EstoqueOvos> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/egg-stocks`;

  return createRestEntityStore<EstoqueOvos, EggStockApi>({
    list: () => http.get<EggStockApi[]>(base),
    create: (item) => http.post<EggStockApi>(base, toApi(item)),
    update: (id, item) => http.put<EggStockApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}
