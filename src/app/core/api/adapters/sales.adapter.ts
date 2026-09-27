import { inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Venda } from '@core/interfaces/venda.interface';
import {
  PLANTEL_LOCATION,
  isPlantelLocation,
  isBarnLocation,
  barnIdFromLocation,
  barnLocation,
  vendedorIdFromLocation,
  vendedorLocation,
} from '@core/utils/stock-location';
import { environment } from '../../../../environments/environment';
import { toDateOnly } from '@core/utils/date-diff';
import { decimalToNumber, EntityStore, WithId } from '../entity-store';
import { fetchNameIdMaps, NameIdMaps, resolveIdByName } from './_shared';

export interface SalesRefs {
  products: NameIdMaps;
  vendedores: NameIdMaps;
}

/**
 * `add`/`update` aceitam `refs` pré-carregado opcional pra quem processa muitas
 * linhas de uma vez (ver `core/utils/import.ts`) e não quer 1 GET de
 * products/vendedores por linha — sem isso, cada chamada busca de novo (comportamento
 * padrão, mantido pro uso normal de tela: garante refs sempre atuais).
 */
export interface SalesStore extends EntityStore<Venda> {
  /** `skipStock`: cria a venda sem baixar estoque (import CLEAN — a planilha já traz o saldo final). Ver SaleService no backend. */
  add(item: Venda, refs?: SalesRefs, skipStock?: boolean): Promise<void>;
  update(id: string, item: Venda, refs?: SalesRefs): Promise<void>;
  fetchRefs(): Promise<SalesRefs>;
}

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
  stock_location_type: 'plantel' | 'vendedor' | 'barn';
  stock_location_vendedor_id: number | null;
  stock_location_barn_id: number | null;
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
export function createSalesStore(): SalesStore {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/sales`;
  const productsUrl = `${environment.apiUrl}/products`;
  const vendedoresUrl = `${environment.apiUrl}/vendedores`;
  const items = signal<WithId<Venda>[]>([]);

  function toFront(api: SaleApi, products: NameIdMaps, vendedores: NameIdMaps): WithId<Venda> {
    const stockLocation =
      api.stock_location_type === 'barn' && api.stock_location_barn_id != null
        ? barnLocation(String(api.stock_location_barn_id))
        : api.stock_location_type === 'vendedor' && api.stock_location_vendedor_id != null
          ? vendedorLocation(String(api.stock_location_vendedor_id))
          : PLANTEL_LOCATION;
    return {
      date: toDateOnly(api.date),
      product: products.byId.get(api.product_id) ?? '',
      quantity: api.quantity,
      unitPrice: decimalToNumber(api.unit_price),
      total: decimalToNumber(api.total),
      paymentPending: api.payment_pending,
      buyer: api.buyer,
      seller: vendedores.byId.get(api.seller_id) ?? '',
      deliveryPending: api.delivery_pending,
      deliveryDate: toDateOnly(api.delivery_date),
      stockLocation,
      id: String(api.id),
    };
  }

  function toApi(item: Venda, products: NameIdMaps, vendedores: NameIdMaps) {
    const location = item.stockLocation ?? PLANTEL_LOCATION;
    const barn = isBarnLocation(location);
    const plantel = isPlantelLocation(location);
    const type = barn ? 'barn' : plantel ? 'plantel' : 'vendedor';
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
      stock_location_type: type,
      stock_location_vendedor_id: type === 'vendedor' ? Number(vendedorIdFromLocation(location)) : null,
      stock_location_barn_id: type === 'barn' ? Number(barnIdFromLocation(location)) : null,
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

  async function add(item: Venda, preloadedRefs?: SalesRefs, skipStock = false): Promise<void> {
    const refs = preloadedRefs ?? (await fetchRefs());
    const body = { ...toApi(item, refs.products, refs.vendedores), ...(skipStock ? { skip_stock: true } : {}) };
    const created = await firstValueFrom(http.post<SaleApi>(base, body));
    items.update((list) => [...list, toFront(created, refs.products, refs.vendedores)]);
  }

  async function update(id: string, item: Venda, preloadedRefs?: SalesRefs): Promise<void> {
    const refs = preloadedRefs ?? (await fetchRefs());
    const updated = await firstValueFrom(http.put<SaleApi>(`${base}/${id}`, toApi(item, refs.products, refs.vendedores)));
    items.update((list) => list.map((v) => (v.id === id ? toFront(updated, refs.products, refs.vendedores) : v)));
  }

  async function remove(id: string): Promise<void> {
    await firstValueFrom(http.delete<void>(`${base}/${id}`));
    items.update((list) => list.filter((v) => v.id !== id));
  }

  load();

  return { items, reload: load, add, update, remove, fetchRefs };
}
