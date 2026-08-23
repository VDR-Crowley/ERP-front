import { inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { signal } from '@angular/core';
import { FeedStock } from '@core/interfaces/feed-stock.interface';
import { environment } from '../../../../environments/environment';
import { createRestEntityStore, decimalToNumber, EntityStore, WithId } from '../entity-store';

interface FeedStockApi {
  id: number;
  type: string;
  bags_in_stock: number;
  kg_in_stock: string;
  last_bag_weight_kg: string;
  expiration_date: string | null;
}

function toFront(api: FeedStockApi): FeedStock {
  return {
    type: api.type,
    bagsInStock: api.bags_in_stock,
    kgInStock: decimalToNumber(api.kg_in_stock),
    lastBagWeightKg: decimalToNumber(api.last_bag_weight_kg),
    expirationDate: api.expiration_date,
  };
}

function toApi(item: FeedStock) {
  return {
    type: item.type,
    bags_in_stock: item.bagsInStock,
    kg_in_stock: item.kgInStock,
    last_bag_weight_kg: item.lastBagWeightKg,
    expiration_date: item.expirationDate,
  };
}

/** Store simples (sem replenish/open-bag) — usada por `plantel.ts`, que só sobrescreve o registro inteiro via PUT/POST normal. */
export function createFeedStockStore(): EntityStore<FeedStock> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/feed-stocks`;

  return createRestEntityStore<FeedStock, FeedStockApi>({
    list: () => http.get<FeedStockApi[]>(base),
    create: (item) => http.post<FeedStockApi>(base, toApi(item)),
    update: (id, item) => http.put<FeedStockApi>(`${base}/${id}`, toApi(item)),
    remove: (id) => http.delete<void>(`${base}/${id}`),
    toFront,
  });
}

export interface ReplenishInput {
  bags: number;
  bagWeightKg: number;
  expirationDate: string;
}

export interface OpenBagInput {
  date: string;
  weightKg: number;
}

export interface FeedStockStore extends EntityStore<FeedStock> {
  /** `POST /feed-stocks/{id}/replenish` — soma sacos/kg ao saldo no backend (não faz a conta no front). */
  replenish(id: string, input: ReplenishInput): Promise<void>;
  /** `POST /feed-stocks/{id}/open-bag` — decrementa 1 saco no backend e cria o `feed_open_logs` correspondente (não existe `POST /feed-open-logs` direto). */
  openBag(id: string, input: OpenBagInput): Promise<void>;
}

/** Store estendida (com `replenish`/`openBag`) — usada por `controle-racao.ts`, a única tela com essas duas ações. */
export function createFeedStockStoreExtended(): FeedStockStore {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/feed-stocks`;
  const items = signal<WithId<FeedStock>[]>([]);

  function toWithId(api: FeedStockApi): WithId<FeedStock> {
    return { ...toFront(api), id: String(api.id) };
  }

  function load(): void {
    http.get<FeedStockApi[]>(base).subscribe({
      next: (list) => items.set(list.map(toWithId)),
      error: () => {},
    });
  }

  async function add(item: FeedStock): Promise<void> {
    const created = await firstValueFrom(http.post<FeedStockApi>(base, toApi(item)));
    items.update((list) => [...list, toWithId(created)]);
  }

  async function update(id: string, item: FeedStock): Promise<void> {
    const updated = await firstValueFrom(http.put<FeedStockApi>(`${base}/${id}`, toApi(item)));
    items.update((list) => list.map((v) => (v.id === id ? toWithId(updated) : v)));
  }

  async function remove(id: string): Promise<void> {
    await firstValueFrom(http.delete<void>(`${base}/${id}`));
    items.update((list) => list.filter((v) => v.id !== id));
  }

  async function replenish(id: string, input: ReplenishInput): Promise<void> {
    const updated = await firstValueFrom(
      http.post<FeedStockApi>(`${base}/${id}/replenish`, {
        bags: input.bags,
        bag_weight_kg: input.bagWeightKg,
        expiration_date: input.expirationDate,
      }),
    );
    items.update((list) => list.map((v) => (v.id === id ? toWithId(updated) : v)));
  }

  async function openBag(id: string, input: OpenBagInput): Promise<void> {
    const updated = await firstValueFrom(
      http.post<FeedStockApi>(`${base}/${id}/open-bag`, { date: input.date, weight_kg: input.weightKg }),
    );
    items.update((list) => list.map((v) => (v.id === id ? toWithId(updated) : v)));
  }

  load();

  return { items, reload: load, add, update, remove, replenish, openBag };
}
