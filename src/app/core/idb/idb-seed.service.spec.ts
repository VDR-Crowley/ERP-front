import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { of, throwError, firstValueFrom } from 'rxjs';
import { IdbSeedService, IDB_STORES } from './idb-seed.service';
import { IndexedDbService } from './idb.service';

/**
 * Regressão de segurança: até 2026-08-24 `export.ts` lia o store legado `IDB_STORES.users` com
 * um formato que incluía SENHA EM TEXTO PURO — corrigido no export, mas qualquer navegador que
 * usou o app antes da migração pra API (commit a5d21c1) pode ainda ter esse registro sentado no
 * IndexedDB local. `seed()` agora purga esse store toda vez que o app inicia, defensivamente.
 */
describe('IdbSeedService', () => {
  function setup(reconfigure: () => void, clear: (store: string) => ReturnType<IndexedDbService['clear']>) {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: IndexedDbService, useValue: { reconfigure, clear } },
      ],
    });
    return TestBed.inject(IdbSeedService);
  }

  it('limpa o store "users" (residual de senha em texto puro) depois de reconfigurar o IndexedDB', async () => {
    const reconfigure = vi.fn();
    const clear = vi.fn(() => of(void 0));
    const service = setup(reconfigure, clear);

    await firstValueFrom(service.seed());

    expect(reconfigure).toHaveBeenCalled();
    expect(clear).toHaveBeenCalledWith(IDB_STORES.users);
  });

  it('não trava o boot se o clear falhar (ex.: store recém-criado, sem nada a limpar)', async () => {
    const clear = vi.fn(() => throwError(() => new Error('nada pra limpar')));
    const service = setup(vi.fn(), clear);

    await expect(firstValueFrom(service.seed())).resolves.toBeUndefined();
  });
});
