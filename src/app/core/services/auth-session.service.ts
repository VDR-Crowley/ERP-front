import { Injectable, computed, inject, signal } from '@angular/core';
import { AuthUser } from '@core/auth/auth.model';
import { LOCAL_STORAGE } from '@core/auth/browser-storage';

const PROFILE_OVERLAY_KEY = 'erp-profile-overlay';

/** Campos cosméticos sem contrapartida no backend hoje (não existe PATCH /user na API). */
interface ProfileOverlay {
  phone?: string;
  farm?: string;
}

export type SessionUser = AuthUser & ProfileOverlay;

/**
 * Sessão do usuário autenticado. O usuário em si (id/name/email/role/
 * created_at) vem sempre da API — login, registro, refresh ou GET /user —
 * nunca é inventado localmente.
 *
 * `phone`/`farm` são só um overlay cosmético local (tela de Configurações),
 * porque a API não expõe endpoint pra atualizar perfil ainda. Ficam em
 * localStorage indexados por e-mail e nunca são enviados ao backend — ver
 * `patch()`.
 */
@Injectable({ providedIn: 'root' })
export class AuthSession {
  private readonly localStorage = inject(LOCAL_STORAGE);

  readonly user = signal<SessionUser | null>(null);
  readonly userId = computed(() => this.user()?.id ?? null);
  readonly isAuthenticated = computed(() => this.user() !== null);

  setCurrent(user: AuthUser): void {
    const overlay = this.readOverlay(user.email);
    this.user.set({ ...user, ...overlay });
  }

  /** Só atualiza os campos cosméticos locais (ver docstring da classe) — nunca chama a API. */
  patch(changes: ProfileOverlay): void {
    const current = this.user();
    if (!current) return;
    const next: SessionUser = { ...current, ...changes };
    this.user.set(next);
    this.writeOverlay(current.email, { phone: next.phone, farm: next.farm });
  }

  clear(): void {
    this.user.set(null);
  }

  private readOverlay(email: string): ProfileOverlay {
    try {
      const all = JSON.parse(this.localStorage.getItem(PROFILE_OVERLAY_KEY) ?? '{}') as Record<
        string,
        ProfileOverlay
      >;
      return all[email] ?? {};
    } catch {
      return {};
    }
  }

  private writeOverlay(email: string, overlay: ProfileOverlay): void {
    try {
      const all = JSON.parse(this.localStorage.getItem(PROFILE_OVERLAY_KEY) ?? '{}') as Record<
        string,
        ProfileOverlay
      >;
      all[email] = overlay;
      this.localStorage.setItem(PROFILE_OVERLAY_KEY, JSON.stringify(all));
    } catch {
      /* storage indisponível — overlay fica só na sessão atual */
    }
  }
}
