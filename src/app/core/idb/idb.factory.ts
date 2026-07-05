import { IndexedDbConfig } from './idb.interface';
import { IndexedDbService } from './idb.service';

export function indexedDbFactory(config: IndexedDbConfig): IndexedDbService {
  const service = new IndexedDbService();
  service.reconfigure(config);
  return service;
}

export function createIDB(dbName: string, version: number, stores: string[]) {
  return indexedDbFactory({
    dbName,
    version,
    stores,
  });
}
