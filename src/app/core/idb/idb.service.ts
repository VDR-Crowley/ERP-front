import { Injectable } from '@angular/core';
import { IDBPDatabase, openDB } from 'idb';
import { from, Observable } from 'rxjs';
import { IIndexedDbService, IndexedDbConfig } from './idb.interface';

@Injectable({
  providedIn: 'root',
})
export class IndexedDbService implements IIndexedDbService {
  private dbPromise: Promise<IDBPDatabase>;
  private config: IndexedDbConfig;

  constructor() {
    this.config = {
      dbName: 'example-db',
      version: 1,
      stores: [
        'persons',
        'partners',
        'real_estate',
      ],
    };

    this.dbPromise = this.openConfigured();
  }

  reconfigure(config: IndexedDbConfig): void {
    this.config = config;
    this.dbPromise = this.openConfigured();
  }

  private openConfigured(): Promise<IDBPDatabase> {
    if (typeof indexedDB === 'undefined') {
      const rejected = Promise.reject<IDBPDatabase>(
        new Error('IndexedDB indisponível neste ambiente (SSR).'),
      );
      // eslint-disable-next-line @typescript-eslint/no-empty-function -- marca a rejeição como tratada (evita unhandledRejection no SSR)
      rejected.catch(() => {});
      return rejected;
    }
    const configRef = this.config;
    return openDB(this.config.dbName, this.config.version, {
      upgrade(db) {
        for (const store of configRef.stores) {
          if (!db.objectStoreNames.contains(store)) {
            db.createObjectStore(store, {
              keyPath: 'id',
            });
          }
        }
      },
    });
  }

  private validateStore(storeName: string): void {
    if (!this.config.stores.includes(storeName)) {
      throw new Error(
        `Store "${storeName}" não está configurado. Stores disponíveis: ${this.config.stores.join(', ')}`
      );
    }
  }

  getValue<T>(storeName: string, id: string): Observable<T | undefined> {
    return from(
      this.dbPromise.then(async (db) => {
        const result = await db.get(storeName, id);
        return result?.value;
      })
    );
  }

  saveValue<T>(storeName: string, id: string, data: T): Observable<void> {
    this.validateStore(storeName);
    return from(
      this.dbPromise.then(async (db) => {
        await db.put(storeName, {
          id,
          value: data,
        });
      })
    );
  }

  save<T>(storeName: string, id: string, data: T): Observable<void> {
    this.validateStore(storeName);
    return from(
      this.dbPromise.then(async (db) => {
        await db.put(storeName, {
          id,
          ...data,
        });
      })
    );
  }

  get<T>(storeName: string, id: string): Observable<T | undefined> {
    this.validateStore(storeName);
    return from(
      this.dbPromise.then(async (db) => {
        const result = await db.get(storeName, id);
        if (!result) return undefined;

        return result as T;
      })
    );
  }

  getAll<T>(storeName: string): Observable<T[]> {
    this.validateStore(storeName);
    return from(
      this.dbPromise.then(async (db) => {
        const results = await db.getAll(storeName);
        return results as T[];
      })
    );
  }

  getAllValues<T>(storeName: string): Observable<Record<string, T>> {
    this.validateStore(storeName);
    return from(
      this.dbPromise.then(async (db) => {
        const results = await db.getAll(storeName);
        const mapped: Record<string, T> = {};

        results.forEach((item: any) => {
          if (item?.id !== undefined) {
            mapped[item.id] = item.value;
          }
        });

        return mapped;
      })
    );
  }

  update<T>(storeName: string, id: string, updates: Partial<T>): Observable<void> {
    this.validateStore(storeName);
    return from(
      this.dbPromise.then(async (db) => {
        const existing = await db.get(storeName, id);
        if (!existing) throw new Error(`Item com id "${id}" não encontrado em ${storeName}.`);

        const updated = {
          id,
          ...existing,
          ...updates,
        };

        await db.put(storeName, updated);
      })
    );
  }

  delete(storeName: string, id: string): Observable<void> {
    this.validateStore(storeName);
    return from(
      this.dbPromise.then(async (db) => {
        await db.delete(storeName, id);
      })
    );
  }

  exists(storeName: string, id: string): Observable<boolean> {
    this.validateStore(storeName);
    return from(
      this.dbPromise.then(async (db) => {
        const result = await db.get(storeName, id);
        return result !== undefined;
      })
    );
  }

  clear(storeName: string): Observable<void> {
    this.validateStore(storeName);
    return from(
      this.dbPromise.then(async (db) => {
        await db.clear(storeName);
      })
    );
  }

  clearAll(): Observable<void> {
    return from(
      this.dbPromise.then(async (db) => {
        const stores = this.config.stores;
        await Promise.all(stores.map((store) => db.clear(store)));
      })
    );
  }

  count(storeName: string): Observable<number> {
    this.validateStore(storeName);
    return from(
      this.dbPromise.then(async (db) => {
        return db.count(storeName);
      })
    );
  }

  getAvailableStores(): string[] {
    return [
      ...this.config.stores,
    ];
  }

  getDatabaseName(): string {
    return this.config.dbName;
  }

  getDatabaseVersion(): number {
    return this.config.version;
  }
}
