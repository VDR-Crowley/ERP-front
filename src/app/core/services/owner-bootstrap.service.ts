import { Injectable, PLATFORM_ID, inject } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import { IndexedDbService } from '@core/idb/idb.service';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { User } from '@core/interfaces/user.interface';
import { AuthSession, StoredUser } from '@core/services/auth-session.service';

const OWNER: User = {
  name: 'Vando Dos Reis',
  email: 'vandodosreis2001@gmail.com',
  password: '$Vando1234',
  phone: '(11) 95860-0976',
};

/**
 * Garante que a conta do proprietário exista no IDB e fique logada no boot.
 * Só cria/loga se o store `users` estiver vazio — não sobrescreve cadastros
 * já feitos (via /register) nem sessões de outros usuários de teste.
 */
@Injectable({ providedIn: 'root' })
export class OwnerBootstrapService {
  private readonly idb = inject(IndexedDbService);
  private readonly session = inject(AuthSession);
  private readonly platformId = inject(PLATFORM_ID);

  async run(): Promise<void> {
    if (!isPlatformBrowser(this.platformId)) return;

    const existing = await firstValueFrom(this.idb.getAll<StoredUser>(IDB_STORES.users));
    if (existing.length > 0) return;

    const id = crypto.randomUUID();
    await firstValueFrom(this.idb.save(IDB_STORES.users, id, OWNER));
    this.session.setCurrent({ id, ...OWNER });
  }
}
