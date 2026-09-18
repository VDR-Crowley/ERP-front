import { inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { BarnStock } from '@core/interfaces/barn-stock.interface';
import { environment } from '../../../../environments/environment';
import { WithId } from '../entity-store';
import { fetchNameIdMaps } from './_shared';

interface BarnStockApi {
  id: number;
  barn_id: number;
  product_id: number;
  quantity: number;
}

export interface BarnStockReadStore {
  items: () => WithId<BarnStock>[];
  reload: () => void;
  /** Define (upsert) o saldo de um produto num galpão. */
  set: (barnId: string, productId: number, quantity: number) => Promise<void>;
}

/** Store de leitura do estoque por galpão (GET /barn-stocks), resolvendo product_id -> nome. */
export function createBarnStockStore(): BarnStockReadStore {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/barn-stocks`;
  const productsUrl = `${environment.apiUrl}/products`;
  const items = signal<WithId<BarnStock>[]>([]);

  function load(): void {
    (async () => {
      const [list, products] = await Promise.all([
        firstValueFrom(http.get<BarnStockApi[]>(base)),
        fetchNameIdMaps(http, productsUrl),
      ]);
      items.set(
        list.map((api) => ({
          product: products.byId.get(api.product_id) ?? '',
          barnId: String(api.barn_id),
          quantity: api.quantity,
          id: String(api.id),
        })),
      );
    })().catch(() => {
      // Falha de rede/401 já tratada pelo authInterceptor.
    });
  }

  async function set(barnId: string, productId: number, quantity: number): Promise<void> {
    await firstValueFrom(
      http.post(`${base}`, { barn_id: Number(barnId), product_id: productId, quantity }),
    );
  }

  load();

  return { items: () => items(), reload: load, set };
}
