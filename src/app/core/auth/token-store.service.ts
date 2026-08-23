import { Injectable, inject } from '@angular/core';
import { LOCAL_STORAGE, SESSION_STORAGE } from './browser-storage';

const REFRESH_TOKEN_KEY = 'erp-refresh-token';

/**
 * Guarda o par de tokens da sessão autenticada.
 *
 * Decisão de segurança: o `access_token` (usado em toda chamada à API) fica
 * só em memória (campo privado desta classe) — nunca vai pro localStorage
 * nem sessionStorage, então não sobrevive a um reload nem é lido por um XSS
 * que escaneie o storage. Expira em 2h de qualquer forma (openapi.yaml).
 *
 * O `refresh_token` (30 dias, rotacionado a cada uso) precisa sobreviver a
 * um reload — senão toda navegação forçaria novo login. Fica em Web
 * Storage: localStorage se o usuário marcou "lembrar de mim" no login
 * (sobrevive fechar o navegador), sessionStorage se não (só a aba atual).
 * Isso ainda expõe o refresh_token a um XSS na página — mitigado por: (1)
 * rotação a cada uso (um token roubado e já usado pelo dono vira inválido
 * na próxima chamada legítima), (2) o refresh_token sozinho só serve pra
 * chamar `/refresh` (ability `refresh`, não `access` — não lê nem escreve
 * nada da API sem antes trocar por um access_token).
 */
@Injectable({ providedIn: 'root' })
export class TokenStore {
  private readonly localStorage = inject(LOCAL_STORAGE);
  private readonly sessionStorage = inject(SESSION_STORAGE);

  private accessToken: string | null = null;

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setRefreshToken(token: string, persist: boolean): void {
    this.clearRefreshToken();
    (persist ? this.localStorage : this.sessionStorage).setItem(REFRESH_TOKEN_KEY, token);
  }

  /** Rotaciona o refresh_token mantendo o storage (local/session) já escolhido no login. */
  rotateRefreshToken(token: string): void {
    const persist = this.localStorage.getItem(REFRESH_TOKEN_KEY) !== null;
    this.setRefreshToken(token, persist);
  }

  getRefreshToken(): string | null {
    return this.localStorage.getItem(REFRESH_TOKEN_KEY) ?? this.sessionStorage.getItem(REFRESH_TOKEN_KEY);
  }

  hasRefreshToken(): boolean {
    return this.getRefreshToken() !== null;
  }

  private clearRefreshToken(): void {
    this.localStorage.removeItem(REFRESH_TOKEN_KEY);
    this.sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  clear(): void {
    this.accessToken = null;
    this.clearRefreshToken();
  }
}
