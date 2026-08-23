import { inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { VendorStock } from '@core/interfaces/vendor-stock.interface';
import { environment } from '../../../../environments/environment';
import { EntityStore, WithId } from '../entity-store';
import { fetchNameIdMaps, resolveIdByName } from './_shared';

interface VendorStockApi {
  id: number;
  product_id: number;
  vendedor_id: number;
  quantity: number;
}

/**
 * `VendorStock.product` é o NOME do produto no front (ver `vendor-stock.interface.ts`),
 * backend usa `product_id`. `vendedorId` já é o mesmo id (string) que a store de
 * vendedores expõe — sem tradução, só `Number()`/`String()`.
 */
export function createVendorStockStore(): EntityStore<VendorStock> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/vendor-stock`;
  const productsUrl = `${environment.apiUrl}/products`;
  const items = signal<WithId<VendorStock>[]>([]);

  function toApi(item: VendorStock, productId: number) {
    return { product_id: productId, vendedor_id: Number(item.vendedorId), quantity: item.quantity };
  }

  function load(): void {
    (async () => {
      const [list, products] = await Promise.all([
        firstValueFrom(http.get<VendorStockApi[]>(base)),
        fetchNameIdMaps(http, productsUrl),
      ]);
      items.set(
        list.map((api) => ({
          product: products.byId.get(api.product_id) ?? '',
          vendedorId: String(api.vendedor_id),
          quantity: api.quantity,
          id: String(api.id),
        })),
      );
    })().catch(() => {
      // Falha de rede/401 já tratada pelo authInterceptor — evita loading eterno.
    });
  }

  async function add(item: VendorStock): Promise<void> {
    const products = await fetchNameIdMaps(http, productsUrl);
    const productId = resolveIdByName(products, item.product, 'Produto');
    const created = await firstValueFrom(http.post<VendorStockApi>(base, toApi(item, productId)));
    items.update((list) => [
      ...list,
      { product: item.product, vendedorId: String(created.vendedor_id), quantity: created.quantity, id: String(created.id) },
    ]);
  }

  async function update(id: string, item: VendorStock): Promise<void> {
    const products = await fetchNameIdMaps(http, productsUrl);
    const productId = resolveIdByName(products, item.product, 'Produto');
    const updated = await firstValueFrom(http.put<VendorStockApi>(`${base}/${id}`, toApi(item, productId)));
    items.update((list) =>
      list.map((v) =>
        v.id === id
          ? { product: item.product, vendedorId: String(updated.vendedor_id), quantity: updated.quantity, id }
          : v,
      ),
    );
  }

  async function remove(id: string): Promise<void> {
    await firstValueFrom(http.delete<void>(`${base}/${id}`));
    items.update((list) => list.filter((v) => v.id !== id));
  }

  load();

  return { items, reload: load, add, update, remove };
}
