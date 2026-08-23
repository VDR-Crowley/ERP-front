import { WritableSignal, signal } from '@angular/core';
import { firstValueFrom, Observable } from 'rxjs';

/** Item de entidade com o id do registro na API anexado (viaja junto em sort/filter). Mesmo formato do antigo `@core/idb/entity-store` — `id` sempre string, mesmo vindo de um PK inteiro do backend (`String(api.id)`). */
export type WithId<T> = T & { readonly id: string };

export interface EntityStore<T> {
  items: WritableSignal<WithId<T>[]>;
  reload(): void;
  add(item: T): Promise<void>;
  update(id: string, item: T): Promise<void>;
  remove(id: string): Promise<void>;
}

/**
 * Configuração de uma entidade REST simples: 1 GET de lista, POST/PUT/DELETE
 * padrão, corpo/resposta mapeados por `toFront`/`toApi`. Cobre entidades sem
 * regra de negócio extra (products, vendedores, flock, daily-productions,
 * egg-stocks, expenses, cash-flows, flock-cleanings). Entidades com
 * side-effects (sales, stock-transfers, flock-incubations, feed-stocks) ou
 * sub-recursos derivados (sale-exclusions, expense-species-overrides) usam
 * fábricas próprias em `core/api/adapters/*` — não passam por aqui.
 */
export interface RestEntityConfig<T extends object, Api extends { id: number }> {
  list(): Observable<Api[]>;
  create(item: T): Observable<Api>;
  update(id: string, item: T): Observable<Api>;
  remove(id: string): Observable<void>;
  toFront(api: Api): T;
}

/** Implementação genérica de `EntityStore<T>` sobre uma API REST simples (ver `RestEntityConfig`). */
export function createRestEntityStore<T extends object, Api extends { id: number }>(
  config: RestEntityConfig<T, Api>,
): EntityStore<T> {
  const items = signal<WithId<T>[]>([]);

  function toWithId(api: Api): WithId<T> {
    return { ...config.toFront(api), id: String(api.id) };
  }

  function load(): void {
    config.list().subscribe({
      next: (list) => items.set(list.map(toWithId)),
      error: () => {
        // Falha de rede/401 já tratada pelo authInterceptor (redireciona pro login);
        // aqui só evita deixar a tela travada num loading eterno.
      },
    });
  }

  async function add(item: T): Promise<void> {
    const created = await firstValueFrom(config.create(item));
    items.update((list) => [...list, toWithId(created)]);
  }

  async function update(id: string, item: T): Promise<void> {
    const updated = await firstValueFrom(config.update(id, item));
    items.update((list) => list.map((value) => (value.id === id ? toWithId(updated) : value)));
  }

  async function remove(id: string): Promise<void> {
    await firstValueFrom(config.remove(id));
    items.update((list) => list.filter((value) => value.id !== id));
  }

  load();

  return { items, reload: load, add, update, remove };
}

/** `EntityStore` somente-leitura (ex.: feed-open-logs — criado só via ação dedicada de outra entidade). add/update/remove rejeitam explicitamente em vez de falhar silenciosamente. */
export function createReadOnlyEntityStore<T extends object, Api extends { id: number }>(
  list: () => Observable<Api[]>,
  toFront: (api: Api) => T,
): EntityStore<T> {
  const items = signal<WithId<T>[]>([]);

  function load(): void {
    list().subscribe({
      next: (res) => items.set(res.map((api) => ({ ...toFront(api), id: String(api.id) }))),
      error: () => {},
    });
  }

  const notSupported = () =>
    Promise.reject(new Error('Entidade somente-leitura — sem create/update/delete direto.'));

  load();

  return { items, reload: load, add: notSupported, update: notSupported, remove: notSupported };
}

/** Decimal do backend (serializado como string, ex. `"12.50"`) -> number. `null`/`undefined` -> `null`. */
export function decimalToNumber(value: string | null | undefined): number {
  return value == null ? 0 : Number(value);
}

export function decimalToNullableNumber(value: string | null | undefined): number | null {
  return value == null ? null : Number(value);
}
