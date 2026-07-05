import { Observable } from 'rxjs';

export interface IndexedDbConfig {
  dbName: string;
  version: number;
  stores: string[];
}

export interface IIndexedDbService {
  saveValue<T>(storeName: string, id: string, data: T): Observable<void>;
  getValue<T>(storeName: string, id: string): Observable<T | undefined>;
  save<T>(storeName: string, id: string, data: T): Observable<void>;
  get<T>(storeName: string, id: string): Observable<T | undefined>;
  getAll<T>(storeName: string): Observable<T[]>;
  getAllValues<T>(storeName: string): Observable<Record<string, T>>;
  update<T>(storeName: string, id: string, updates: Partial<T>): Observable<void>;
  delete(storeName: string, id: string): Observable<void>;
  exists(storeName: string, id: string): Observable<boolean>;
  clear(storeName: string): Observable<void>;
  clearAll(): Observable<void>;
  count(storeName: string): Observable<number>;

  getAvailableStores(): string[];
  getDatabaseName(): string;
  getDatabaseVersion(): number;

  reconfigure(config: IndexedDbConfig): void;
}
