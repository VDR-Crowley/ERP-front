import { inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Venda } from '@core/interfaces/venda.interface';
import {
  PLANTEL_LOCATION,
  isPlantelLocation,
  vendedorIdFromLocation,
  vendedorLocation,
} from '@core/utils/stock-location';
import { environment } from '../../../../environments/environment';
import { decimalToNumber, EntityStore, WithId } from '../entity-store';
import { fetchNameIdMaps, NameIdMaps, resolveIdByName } from './_shared';

interface SaleApi {
  id: number;
  date: string;
  product_id: number;
  quantity: number;
  unit_price: string;
  total: string;
  payment_pending: boolean;
  buyer: string;
  seller_id: number;
  delivery_pending: boolean;
  delivery_date: string | null;
  stock_location_type: 'plantel' | 'vendedor';
  stock_location_vendedor_id: number | null;
}

/**
 * `Venda.product`/`Venda.seller` guardam NOME no front (autocomplete),
 * backend usa `product_id`/`seller_id`. `Venda.stockLocation` combina
 * tipo+id de local numa string (`'plantel'` ou `vendedor:<id>`), backend usa
 * duas colunas (`stock_location_type`/`stock_location_vendedor_id`) — ver
 * `core/utils/stock-location.ts` pro formato do front.
 *
 * O backend baixa/devolve o estoque de produto sozinho a cada create/update/
 * delete (ver `POST /sales` no openapi.yaml) — por isso essa store NÃO tenta
 * reproduzir esse ajuste no front (o antigo `adjustStock` de `sales.ts` foi
 * removido; o componente só recarrega `productsStore`/`vendorStockStore`
 * depois de cada mutação, pra refletir o que o backend já moveu).
 */
export function createSalesStore(): EntityStore<Venda> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/sales`;
  const productsUrl = `${environment.apiUrl}/products`;
  const vendedoresUrl = `${environment.apiUrl}/vendedores`;
  const items = signal<WithId<Venda>[]>([]);

  function toFront(api: SaleApi, products: NameIdMaps, vendedores: NameIdMaps): WithId<Venda> {
    const stockLocation = api.stock_location_type === 'vendedor' && api.stock_location_vendedor_id != null
      ? vendedorLocation(String(api.stock_location_vendedor_id))
      : PLANTEL_LOCATION;
    return {
      date: api.date,
      product: products.byId.get(api.product_id) ?? '',
      quantity: api.quantity,
      unitPrice: decimalToNumber(api.unit_price),
      total: decimalToNumber(api.total),
      paymentPending: api.payment_pending,
      buyer: api.buyer,
      seller: vendedores.byId.get(api.seller_id) ?? '',
      deliveryPending: api.delivery_pending,
      deliveryDate: api.delivery_date,
      stockLocation,
      id: String(api.id),
    };
  }

  function toApi(item: Venda, products: NameIdMaps, vendedores: NameIdMaps) {
    const location = item.stockLocation ?? PLANTEL_LOCATION;
    const plantel = isPlantelLocation(location);
    return {
      date: item.date,
      product_id: resolveIdByName(products, item.product, 'Produto'),
      quantity: item.quantity,
      unit_price: item.unitPrice,
      total: item.total,
      payment_pending: item.paymentPending,
      buyer: item.buyer,
      seller_id: resolveIdByName(vendedores, item.seller, 'Vendedor'),
      delivery_pending: item.deliveryPending,
      delivery_date: item.deliveryDate,
      stock_location_type: plantel ? 'plantel' : 'vendedor',
      stock_location_vendedor_id: plantel ? null : Number(vendedorIdFromLocation(location)),
    };
  }

  async function fetchRefs(): Promise<{ products: NameIdMaps; vendedores: NameIdMaps }> {
    const [products, vendedores] = await Promise.all([
      fetchNameIdMaps(http, productsUrl),
      fetchNameIdMaps(http, vendedoresUrl),
    ]);
    return { products, vendedores };
  }

  function load(): void {
    (async () => {
      const [list, refs] = await Promise.all([firstValueFrom(http.get<SaleApi[]>(base)), fetchRefs()]);
      items.set(list.map((api) => toFront(api, refs.products, refs.vendedores)));
    })().catch(() => {
      // Falha de rede/401 já tratada pelo authInterceptor — evita loading eterno.
    });
  }

  async function add(item: Venda): Promise<void> {
    const refs = await fetchRefs();
    const created = await firstValueFrom(http.post<SaleApi>(base, toApi(item, refs.products, refs.vendedores)));
    items.update((list) => [...list, toFront(created, refs.products, refs.vendedores)]);
  }

  async function update(id: string, item: Venda): Promise<void> {
    const refs = await fetchRefs();
    const updated = await firstValueFrom(http.put<SaleApi>(`${base}/${id}`, toApi(item, refs.products, refs.vendedores)));
    items.update((list) => list.map((v) => (v.id === id ? toFront(updated, refs.products, refs.vendedores) : v)));
  }

  async function remove(id: string): Promise<void> {
    await firstValueFrom(http.delete<void>(`${base}/${id}`));
    items.update((list) => list.filter((v) => v.id !== id));
  }

  load();

  return { items, reload: load, add, update, remove };
}
