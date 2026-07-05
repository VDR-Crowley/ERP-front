import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { IndexedDbService } from './idb.service';

export const DB_NAME = 'minierp-db';
export const DB_VERSION = 1;

export const IDB_STORES = {
  sales: 'sales',
  dailyProduction: 'dailyProduction',
  eggStock: 'eggStock',
  flock: 'flock',
  products: 'products',
  expenses: 'expenses',
  cashFlow: 'cashFlow',
  dashboard: 'dashboard',
} as const;

/**
 * Configura os object stores do IndexedDB (via IndexedDbService genérico já
 * existente). Não semeia mais dados de mock — a plataforma logada só usa o
 * que o usuário importar via Excel (botão Importar). Instalação nova abre com
 * o IDB vazio; quem já tem dado salvo não é afetado (nada aqui apaga store
 * existente).
 */
@Injectable({ providedIn: 'root' })
export class IdbSeedService {
  private readonly idb = inject(IndexedDbService);
  private readonly platformId = inject(PLATFORM_ID);

  seed(): Observable<void> {
    if (!isPlatformBrowser(this.platformId)) {
      return of(void 0);
    }

    this.idb.reconfigure({
      dbName: DB_NAME,
      version: DB_VERSION,
      stores: Object.values(IDB_STORES),
    });

    return of(void 0);
  }
}
