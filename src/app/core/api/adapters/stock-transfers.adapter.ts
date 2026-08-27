import { inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { StockTransfer } from '@core/interfaces/stock-transfer.interface';
import { PLANTEL_LOCATION, isPlantelLocation, vendedorIdFromLocation, vendedorLocation } from '@core/utils/stock-location';
import { environment } from '../../../../environments/environment';
import { toDateOnly } from '@core/utils/date-diff';
import { EntityStore, WithId } from '../entity-store';
import { fetchNameIdMaps, NameIdMaps, resolveIdByName } from './_shared';

interface StockTransferApi {
  id: number;
  date: string;
  product_id: number;
  quantity: number;
  from_location_type: 'plantel' | 'vendedor';
  from_vendedor_id: number | null;
  to_location_type: 'plantel' | 'vendedor';
  to_vendedor_id: number | null;
  note: string | null;
}

/**
 * Mesmo padrão de `sales.adapter.ts`: `product` por nome, `fromLocation`/
 * `toLocation` combinando tipo+id (ver `core/utils/stock-location.ts`). O
 * backend move o estoque sozinho a cada create/update/delete (openapi.yaml);
 * o antigo `adjustStock` de `stock-transfers.ts` foi removido — o componente
 * só recarrega `productsStore`/`vendorStockStore` depois de cada mutação.
 */
export function createStockTransfersStore(): EntityStore<StockTransfer> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/stock-transfers`;
  // Só produtos são resolvidos por nome aqui — vendedorId já viaja como id em fromLocation/toLocation, sem precisar de /vendedores.
  const productsUrl = `${environment.apiUrl}/products`;
  const items = signal<WithId<StockTransfer>[]>([]);

  function locationToFront(type: 'plantel' | 'vendedor', vendedorId: number | null): string {
    return type === 'vendedor' && vendedorId != null ? vendedorLocation(String(vendedorId)) : PLANTEL_LOCATION;
  }

  function locationToApi(location: string): { type: 'plantel' | 'vendedor'; vendedorId: number | null } {
    if (isPlantelLocation(location)) return { type: 'plantel', vendedorId: null };
    return { type: 'vendedor', vendedorId: Number(vendedorIdFromLocation(location)) };
  }

  function toFront(api: StockTransferApi, products: NameIdMaps): WithId<StockTransfer> {
    return {
      date: toDateOnly(api.date),
      product: products.byId.get(api.product_id) ?? '',
      quantity: api.quantity,
      fromLocation: locationToFront(api.from_location_type, api.from_vendedor_id),
      toLocation: locationToFront(api.to_location_type, api.to_vendedor_id),
      note: api.note,
      id: String(api.id),
    };
  }

  function toApi(item: StockTransfer, products: NameIdMaps) {
    const from = locationToApi(item.fromLocation);
    const to = locationToApi(item.toLocation);
    return {
      date: item.date,
      product_id: resolveIdByName(products, item.product, 'Produto'),
      quantity: item.quantity,
      from_location_type: from.type,
      from_vendedor_id: from.vendedorId,
      to_location_type: to.type,
      to_vendedor_id: to.vendedorId,
      note: item.note || null,
    };
  }

  async function fetchRefs(): Promise<NameIdMaps> {
    return fetchNameIdMaps(http, productsUrl);
  }

  function load(): void {
    (async () => {
      const [list, products] = await Promise.all([
        firstValueFrom(http.get<StockTransferApi[]>(base)),
        fetchRefs(),
      ]);
      items.set(list.map((api) => toFront(api, products)));
    })().catch(() => {
      // Falha de rede/401 já tratada pelo authInterceptor — evita loading eterno.
    });
  }

  async function add(item: StockTransfer): Promise<void> {
    const products = await fetchRefs();
    const created = await firstValueFrom(http.post<StockTransferApi>(base, toApi(item, products)));
    items.update((list) => [...list, toFront(created, products)]);
  }

  async function update(id: string, item: StockTransfer): Promise<void> {
    const products = await fetchRefs();
    const updated = await firstValueFrom(http.put<StockTransferApi>(`${base}/${id}`, toApi(item, products)));
    items.update((list) => list.map((v) => (v.id === id ? toFront(updated, products) : v)));
  }

  async function remove(id: string): Promise<void> {
    await firstValueFrom(http.delete<void>(`${base}/${id}`));
    items.update((list) => list.filter((v) => v.id !== id));
  }

  load();

  return { items, reload: load, add, update, remove };
}
