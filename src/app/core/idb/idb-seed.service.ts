import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { Observable, of } from 'rxjs';
import { catchError } from 'rxjs/operators';
import { IndexedDbService } from './idb.service';

export const DB_NAME = 'minierp-db';
export const DB_VERSION = 7;

export const IDB_STORES = {
  sales: 'sales',
  dailyProduction: 'dailyProduction',
  eggStock: 'eggStock',
  flock: 'flock',
  products: 'products',
  expenses: 'expenses',
  cashFlow: 'cashFlow',
  dashboard: 'dashboard',
  users: 'users',
  flockIncubation: 'flockIncubation',
  feedStock: 'feedStock',
  feedOpenLog: 'feedOpenLog',
  flockCleaning: 'flockCleaning',
  /** Vendas marcadas como "evento isolado" — excluídas da Análise por Linha de Negócio, sem apagar o registro original de `sales`. */
  excludedSales: 'excludedSales',
  /** Overrides manuais de espécie por despesa — ver `ExpenseSpeciesOverride`. */
  expenseSpeciesOverrides: 'expenseSpeciesOverrides',
  /** Lista reaproveitável de vendedores/revendedores — ver `Vendedor`. */
  vendedores: 'vendedores',
  /** Saldo de produto por vendedor (estoque fora do Plantel) — ver `VendorStock`. */
  vendorStock: 'vendorStock',
  /** Histórico de transferências de estoque entre locais — ver `StockTransfer`. */
  stockTransfers: 'stockTransfers',
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

    // Purga defensiva do store legado `users`: até 2026-08-24, `export.ts` lia dali com um
    // formato que incluía a SENHA em texto puro (`User.password`) — corrigido pra nunca mais
    // gravar/exportar isso, mas qualquer navegador que já tinha usado o app ANTES da migração
    // pra API real (commit a5d21c1) ainda pode ter esse registro sentado no IndexedDB local,
    // com a senha exposta em texto puro pra quem abrir o DevTools daquele navegador. Nada mais
    // escreve nesse store (import.ts também migrou pra API), então limpar aqui não perde dado
    // nenhum que ainda esteja em uso — só remove o resíduo sensível. `catchError` porque
    // primeira visita (store recém-criado) pode não ter nada a limpar; erro aqui não pode
    // travar o boot do app.
    this.idb.clear(IDB_STORES.users).pipe(catchError(() => of(void 0))).subscribe();

    return of(void 0);
  }
}
