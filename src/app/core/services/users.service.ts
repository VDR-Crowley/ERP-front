import { Injectable, inject } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IndexedDbService } from '@core/idb/idb.service';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { User } from '@core/interfaces/user.interface';

type StoredUser = User & { id: string };

/** Cadastro e autenticação de usuários persistidos no IndexedDB (store `users`). */
@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly idb = inject(IndexedDbService);

  private async all(): Promise<StoredUser[]> {
    return firstValueFrom(this.idb.getAll<StoredUser>(IDB_STORES.users));
  }

  /** Salva um novo usuário. Recusa e-mail já cadastrado. */
  async register(user: User): Promise<{ ok: boolean; error?: string }> {
    const email = user.email.trim().toLowerCase();
    const existing = await this.all();
    if (existing.some((u) => u.email.trim().toLowerCase() === email)) {
      return { ok: false, error: 'E-mail já cadastrado.' };
    }
    await firstValueFrom(
      this.idb.save(IDB_STORES.users, crypto.randomUUID(), {
        name: user.name.trim(),
        email: user.email.trim(),
        password: user.password,
      }),
    );
    return { ok: true };
  }

  /** Retorna o usuário se e-mail + senha baterem com algum registro; senão null. */
  async validate(email: string, password: string): Promise<StoredUser | null> {
    const target = email.trim().toLowerCase();
    const users = await this.all();
    return (
      users.find((u) => u.email.trim().toLowerCase() === target && u.password === password) ?? null
    );
  }
}
