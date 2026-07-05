import { WritableSignal, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IndexedDbService } from './idb.service';

/** Item de entidade com o id do registro no IndexedDB anexado (viaja junto em sort/filter). */
export type WithId<T> = T & { readonly id: string };

export interface EntityStore<T> {
  items: WritableSignal<WithId<T>[]>;
  reload(): void;
  add(item: T): Promise<void>;
  update(id: string, item: T): Promise<void>;
  remove(id: string): Promise<void>;
}

interface StoredRecord {
  id: string;
}

/**
 * Cria um signal reativo por entidade, populado a partir de um object store do
 * IndexedDB (via IndexedDbService já configurado pelo IdbSeedService). Usa
 * `seedData` como valor inicial (SSR e enquanto a leitura assíncrona do IDB
 * não resolve); quando o IDB devolve dados, o signal é atualizado. Cada item
 * carrega seu `id` do IDB, permitindo add/update/remove mesmo depois de
 * ordenar/filtrar a lista nas telas.
 */
export function createEntityStore<T extends object>(storeName: string, seedData: T[]): EntityStore<T> {
  const idb = inject(IndexedDbService);
  const items = signal<WithId<T>[]>(
    seedData.map((item, index) => ({ ...item, id: `seed-${index}` })),
  );

  function load(): void {
    try {
      idb.getAll<T & StoredRecord>(storeName).subscribe({
        next: (records) => {
          if (records.length > 0) {
            items.set(records.map((record) => ({ ...record })) as WithId<T>[]);
          }
        },
        error: () => {
          // IndexedDB indisponível (SSR) — mantém o valor semeado.
        },
      });
    } catch {
      // Store ainda não configurado (ex.: teste unitário sem o seed rodar) — mantém o valor semeado.
    }
  }

  async function add(item: T): Promise<void> {
    const id = crypto.randomUUID();
    await firstValueFrom(idb.save(storeName, id, item));
    items.update((list) => [...list, { ...item, id }]);
  }

  async function update(id: string, item: T): Promise<void> {
    await firstValueFrom(idb.save(storeName, id, item));
    items.update((list) => list.map((value) => (value.id === id ? { ...item, id } : value)));
  }

  async function remove(id: string): Promise<void> {
    await firstValueFrom(idb.delete(storeName, id));
    items.update((list) => list.filter((value) => value.id !== id));
  }

  load();

  return { items, reload: load, add, update, remove };
}
