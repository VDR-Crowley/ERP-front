import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { IndexedDbService } from '@core/idb/idb.service';
import { IDB_STORES } from '@core/idb/idb-seed.service';
import { User } from '@core/interfaces/user.interface';

export type StoredUser = User & { id: string };

const STORAGE_KEY = 'erp-current-user';

/**
 * Sessão do usuário logado. Guarda o registro completo (com uuid) em
 * localStorage e expõe via signal, pra consumir em qualquer tela sem reler o
 * IndexedDB. Alterações (`patch`) gravam no IDB e sincronizam o localStorage.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly idb = inject(IndexedDbService);

  readonly user = signal<StoredUser | null>(this.read());
  readonly userId = computed(() => this.user()?.id ?? null);

  private read(): StoredUser | null {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredUser;
    } catch {
      return null;
    }
  }

  private write(user: StoredUser | null): void {
    if (typeof localStorage === 'undefined') return;
    if (user) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  setCurrent(user: StoredUser): void {
    this.user.set(user);
    this.write(user);
  }

  /** Aplica mudanças no usuário logado: grava no IDB e sincroniza localStorage/signal. */
  async patch(changes: Partial<User>): Promise<void> {
    const current = this.user();
    if (!current) return;
    await firstValueFrom(this.idb.update(IDB_STORES.users, current.id, changes));
    this.setCurrent({ ...current, ...changes });
  }

  clear(): void {
    this.user.set(null);
    this.write(null);
  }
}
