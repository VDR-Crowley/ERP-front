# Integração de Autenticação Real (Laravel Sanctum) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir a autenticação fake (IndexedDB) por integração real com a API Laravel (`ERP-Backend`), com par access/refresh token, interceptor HTTP com refresh silencioso e dedup de 401 concorrentes, e guard de rota.

**Architecture:** Módulo novo `src/app/core/auth/` concentra tudo: modelos de contrato da API, `TokenStore` (access token em memória, refresh token em Web Storage), `AuthApiService` (chamadas HTTP + efeitos colaterais de sessão + refresh compartilhado), `authInterceptor` (functional interceptor, injeta Bearer, trata 401), `authGuard` (protege `/platform`). `AuthSession` existente é reescrito pra guardar o usuário vindo da API em vez do registro fake do IndexedDB, mantendo os mesmos nomes de método (`user`, `setCurrent`, `patch`, `clear`) pra não quebrar `layout-app.ts`/`settings.ts`. `UsersService` e `OwnerBootstrapService` (fake) são removidos.

**Tech Stack:** Angular 21 standalone (`HttpClient` functional interceptors via `provideHttpClient(withInterceptors(...))`), RxJS (`shareReplay`, `switchMap`, `catchError`), Vitest via `@angular/build:unit-test` (`ng test`), `HttpClientTesting`.

## Global Constraints

- API base: `environment.apiUrl` (`http://localhost:8000/api` em dev). Nunca hardcode a URL — sempre via `environment`.
- Sanctum é 100% token-based aqui ("Sem sessão/cookie — só Bearer token" — `ERP-Backend/docs/openapi.yaml:7`) — sem CSRF/cookie, sem `withCredentials`.
- Formato de erro de validação do backend: `{ message: string, errors?: Record<string, string[]> }`, status 422. Rate limit: 429, `{ message: string }`.
- `access_token`: usar em toda rota normal (`ability: access`). Expira em 2h.
- `refresh_token`: usar só em `POST /refresh`, como o próprio Bearer do header (não é body param). Expira em 30 dias, é rotacionado a cada uso (o antigo é revogado).
- Nunca persistir `access_token` em `localStorage`/`sessionStorage` — só em memória (decisão de segurança documentada no `TokenStore`).
- Não usar `git push` no repositório `ERP-front` em nenhuma etapa — só `git add`/`git commit` local.
- Não tocar em `src/app/pages/platform/users/*` (CRUD local de usuários da aplicação, independente do login — não tem endpoint correspondente no backend).

---

### Task 1: Modelos de auth + TokenStore

**Files:**
- Create: `src/app/core/auth/auth.model.ts`
- Create: `src/app/core/auth/token-store.service.ts`
- Test: `src/app/core/auth/token-store.service.spec.ts`

**Interfaces:**
- Produces: `AuthUser { id: number; name: string; email: string; role: string; created_at: string }`, `AuthTokenResponse { user: AuthUser; token_type: string; access_token: string; access_token_expires_at: string; refresh_token: string; refresh_token_expires_at: string }`, `MessageResponse { message: string }`, `ValidationErrorResponse { message: string; errors?: Record<string, string[]> }`, `AuthRequestKind = 'default' | 'public' | 'refresh'`, `AUTH_REQUEST_KIND: HttpContextToken<AuthRequestKind>` (default `'default'`).
- Produces (TokenStore): `setAccessToken(token: string): void`, `getAccessToken(): string | null`, `setRefreshToken(token: string, persist: boolean): void`, `rotateRefreshToken(token: string): void`, `getRefreshToken(): string | null`, `hasRefreshToken(): boolean`, `clear(): void`.

- [ ] **Step 1: Criar os modelos e o context token**

```typescript
// src/app/core/auth/auth.model.ts
import { HttpContextToken } from '@angular/common/http';

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string;
  created_at: string;
}

export interface AuthTokenResponse {
  user: AuthUser;
  token_type: string;
  access_token: string;
  access_token_expires_at: string;
  refresh_token: string;
  refresh_token_expires_at: string;
}

export interface MessageResponse {
  message: string;
}

export interface ValidationErrorResponse {
  message: string;
  errors?: Record<string, string[]>;
}

export type AuthRequestKind = 'default' | 'public' | 'refresh';

/**
 * Marca como o `authInterceptor` deve tratar a requisição:
 * - 'default' (padrão): injeta o access_token; em 401 tenta refresh e repete
 *   a chamada original uma vez.
 * - 'public': não injeta token (endpoint não autenticado — login, registro,
 *   fluxo de esqueci-senha); em 401 só repassa o erro, sem tentar refresh.
 * - 'refresh': não injeta o access_token (quem chama, `AuthApiService`, já
 *   setou o header com o refresh_token); em 401 desloga e redireciona pro
 *   login sem tentar refresh de novo — essa chamada JÁ É o refresh.
 */
export const AUTH_REQUEST_KIND = new HttpContextToken<AuthRequestKind>(() => 'default');
```

- [ ] **Step 2: Escrever o teste (falhando) do TokenStore**

```typescript
// src/app/core/auth/token-store.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { TokenStore } from './token-store.service';

describe('TokenStore', () => {
  let store: TokenStore;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({});
    store = TestBed.inject(TokenStore);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('guarda e devolve o access token só em memória', () => {
    expect(store.getAccessToken()).toBeNull();
    store.setAccessToken('access-1');
    expect(store.getAccessToken()).toBe('access-1');
    expect(localStorage.getItem('erp-refresh-token')).toBeNull();
    expect(sessionStorage.getItem('erp-refresh-token')).toBeNull();
  });

  it('persiste o refresh token em localStorage quando persist=true', () => {
    store.setRefreshToken('refresh-1', true);
    expect(localStorage.getItem('erp-refresh-token')).toBe('refresh-1');
    expect(sessionStorage.getItem('erp-refresh-token')).toBeNull();
    expect(store.getRefreshToken()).toBe('refresh-1');
    expect(store.hasRefreshToken()).toBe(true);
  });

  it('persiste o refresh token em sessionStorage quando persist=false', () => {
    store.setRefreshToken('refresh-2', false);
    expect(sessionStorage.getItem('erp-refresh-token')).toBe('refresh-2');
    expect(localStorage.getItem('erp-refresh-token')).toBeNull();
    expect(store.getRefreshToken()).toBe('refresh-2');
  });

  it('rotateRefreshToken mantém o storage originalmente escolhido', () => {
    store.setRefreshToken('refresh-1', true);
    store.rotateRefreshToken('refresh-rotated');
    expect(localStorage.getItem('erp-refresh-token')).toBe('refresh-rotated');
    expect(sessionStorage.getItem('erp-refresh-token')).toBeNull();

    store.setRefreshToken('refresh-2', false);
    store.rotateRefreshToken('refresh-rotated-2');
    expect(sessionStorage.getItem('erp-refresh-token')).toBe('refresh-rotated-2');
    expect(localStorage.getItem('erp-refresh-token')).toBeNull();
  });

  it('clear() limpa access token em memória e refresh token nos dois storages', () => {
    store.setAccessToken('access-1');
    store.setRefreshToken('refresh-1', true);
    store.clear();
    expect(store.getAccessToken()).toBeNull();
    expect(store.getRefreshToken()).toBeNull();
    expect(store.hasRefreshToken()).toBe(false);
  });
});
```

- [ ] **Step 3: Rodar o teste e confirmar que falha**

Run: `npx ng test --include='**/token-store.service.spec.ts' --watch=false`
Expected: FAIL — `Cannot find module './token-store.service'`

- [ ] **Step 4: Implementar o TokenStore**

```typescript
// src/app/core/auth/token-store.service.ts
import { Injectable } from '@angular/core';

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
  private accessToken: string | null = null;

  setAccessToken(token: string): void {
    this.accessToken = token;
  }

  getAccessToken(): string | null {
    return this.accessToken;
  }

  setRefreshToken(token: string, persist: boolean): void {
    this.clearRefreshToken();
    (persist ? localStorage : sessionStorage).setItem(REFRESH_TOKEN_KEY, token);
  }

  /** Rotaciona o refresh_token mantendo o storage (local/session) já escolhido no login. */
  rotateRefreshToken(token: string): void {
    const persist = localStorage.getItem(REFRESH_TOKEN_KEY) !== null;
    this.setRefreshToken(token, persist);
  }

  getRefreshToken(): string | null {
    return localStorage.getItem(REFRESH_TOKEN_KEY) ?? sessionStorage.getItem(REFRESH_TOKEN_KEY);
  }

  hasRefreshToken(): boolean {
    return this.getRefreshToken() !== null;
  }

  private clearRefreshToken(): void {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    sessionStorage.removeItem(REFRESH_TOKEN_KEY);
  }

  clear(): void {
    this.accessToken = null;
    this.clearRefreshToken();
  }
}
```

- [ ] **Step 5: Rodar o teste e confirmar que passa**

Run: `npx ng test --include='**/token-store.service.spec.ts' --watch=false`
Expected: PASS (5 testes)

- [ ] **Step 6: Commit**

```bash
git add src/app/core/auth/auth.model.ts src/app/core/auth/token-store.service.ts src/app/core/auth/token-store.service.spec.ts
git commit -m "feat(auth): modelos da API e TokenStore (access em memória, refresh em storage)"
```

---

### Task 2: AuthSession reescrito pro usuário real

**Files:**
- Modify: `src/app/core/services/auth-session.service.ts`
- Test: `src/app/core/services/auth-session.service.spec.ts` (criar)

**Interfaces:**
- Consumes: `AuthUser` de `@core/auth/auth.model` (Task 1).
- Produces: `SessionUser = AuthUser & { phone?: string; farm?: string }`, classe `AuthSession` com `user: Signal<SessionUser | null>`, `userId: Signal<number | null>`, `isAuthenticated: Signal<boolean>`, `setCurrent(user: AuthUser): void`, `patch(changes: { phone?: string; farm?: string }): void`, `clear(): void`. Consumido por `layout-app.ts`, `settings.ts`, `AuthApiService` (Task 3).

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// src/app/core/services/auth-session.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { AuthSession } from './auth-session.service';
import { AuthUser } from '@core/auth/auth.model';

const USER: AuthUser = {
  id: 1,
  name: 'Maria da Silva',
  email: 'maria@exemplo.com',
  role: 'ADMINISTRADOR',
  created_at: '2026-08-22T14:30:00.000000Z',
};

describe('AuthSession', () => {
  let session: AuthSession;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({});
    session = TestBed.inject(AuthSession);
  });

  afterEach(() => localStorage.clear());

  it('começa deslogado', () => {
    expect(session.user()).toBeNull();
    expect(session.isAuthenticated()).toBe(false);
    expect(session.userId()).toBeNull();
  });

  it('setCurrent guarda o usuário vindo da API', () => {
    session.setCurrent(USER);
    expect(session.user()).toEqual(USER);
    expect(session.isAuthenticated()).toBe(true);
    expect(session.userId()).toBe(1);
  });

  it('patch atualiza só os campos cosméticos locais (phone/farm)', () => {
    session.setCurrent(USER);
    session.patch({ phone: '(11) 90000-0000', farm: 'Granja Boa Vista' });
    expect(session.user()?.phone).toBe('(11) 90000-0000');
    expect(session.user()?.farm).toBe('Granja Boa Vista');
    expect(session.user()?.name).toBe(USER.name); // não mexe nos campos da API
  });

  it('patch sem usuário logado não faz nada', () => {
    session.patch({ phone: '(11) 90000-0000' });
    expect(session.user()).toBeNull();
  });

  it('overlay de phone/farm sobrevive a um novo setCurrent do mesmo e-mail (ex.: após refresh de sessão)', () => {
    session.setCurrent(USER);
    session.patch({ phone: '(11) 90000-0000' });
    session.clear();
    session.setCurrent(USER);
    expect(session.user()?.phone).toBe('(11) 90000-0000');
  });

  it('clear() desloga', () => {
    session.setCurrent(USER);
    session.clear();
    expect(session.user()).toBeNull();
    expect(session.isAuthenticated()).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx ng test --include='**/auth-session.service.spec.ts' --watch=false`
Expected: FAIL — asserções sobre `isAuthenticated`/overlay não batem com a implementação atual (baseada em IndexedDB/`StoredUser`).

- [ ] **Step 3: Reescrever o AuthSession**

```typescript
// src/app/core/services/auth-session.service.ts
import { Injectable, computed, signal } from '@angular/core';
import { AuthUser } from '@core/auth/auth.model';

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
    if (typeof localStorage === 'undefined') return {};
    try {
      const all = JSON.parse(localStorage.getItem(PROFILE_OVERLAY_KEY) ?? '{}') as Record<
        string,
        ProfileOverlay
      >;
      return all[email] ?? {};
    } catch {
      return {};
    }
  }

  private writeOverlay(email: string, overlay: ProfileOverlay): void {
    if (typeof localStorage === 'undefined') return;
    try {
      const all = JSON.parse(localStorage.getItem(PROFILE_OVERLAY_KEY) ?? '{}') as Record<
        string,
        ProfileOverlay
      >;
      all[email] = overlay;
      localStorage.setItem(PROFILE_OVERLAY_KEY, JSON.stringify(all));
    } catch {
      /* localStorage indisponível (SSR) — overlay fica só na sessão atual */
    }
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx ng test --include='**/auth-session.service.spec.ts' --watch=false`
Expected: PASS (6 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/services/auth-session.service.ts src/app/core/services/auth-session.service.spec.ts
git commit -m "feat(auth): AuthSession passa a guardar o usuário real da API"
```

---

### Task 3: AuthApiService (chamadas HTTP + refresh compartilhado)

**Files:**
- Create: `src/app/core/auth/auth-api.service.ts`
- Test: `src/app/core/auth/auth-api.service.spec.ts`

**Interfaces:**
- Consumes: `TokenStore` (Task 1), `AuthSession` (Task 2), `AuthUser`/`AuthTokenResponse`/`MessageResponse`/`AUTH_REQUEST_KIND` (Task 1), `environment.apiUrl`.
- Produces: `AuthApiService` com `register(payload): Observable<AuthTokenResponse>`, `login(email, password, remember = true): Observable<AuthTokenResponse>`, `logout(): Observable<void>`, `me(): Observable<AuthUser>`, `forgotPassword(email): Observable<MessageResponse>`, `verifyResetCode(email, code): Observable<MessageResponse>`, `resetPassword(email, code, password, password_confirmation): Observable<MessageResponse>`, `refreshSession$(): Observable<AuthTokenResponse>`, `clearSession(): void`. Consumido pelos componentes de auth (Tasks 7-9), `layout-app.ts` (Task 10) e `authInterceptor` (Task 4).

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// src/app/core/auth/auth-api.service.spec.ts
import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AuthApiService } from './auth-api.service';
import { TokenStore } from './token-store.service';
import { AuthSession } from '@core/services/auth-session.service';
import { AuthTokenResponse } from './auth.model';

const TOKEN_RESPONSE: AuthTokenResponse = {
  user: { id: 1, name: 'Maria da Silva', email: 'maria@exemplo.com', role: 'ADMINISTRADOR', created_at: '2026-08-22T14:30:00.000000Z' },
  token_type: 'Bearer',
  access_token: '1|access-abc',
  access_token_expires_at: '2026-08-22T16:30:00.000000Z',
  refresh_token: '2|refresh-xyz',
  refresh_token_expires_at: '2026-09-21T14:30:00.000000Z',
};

describe('AuthApiService', () => {
  let service: AuthApiService;
  let httpMock: HttpTestingController;
  let tokens: TokenStore;
  let session: AuthSession;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthApiService);
    httpMock = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStore);
    session = TestBed.inject(AuthSession);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('login envia e-mail/senha, guarda os tokens e a sessão', () => {
    let result: AuthTokenResponse | undefined;
    service.login('maria@exemplo.com', 'minhasenha123', true).subscribe((res) => (result = res));

    const req = httpMock.expectOne(`${environment.apiUrl}/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'maria@exemplo.com', password: 'minhasenha123' });
    req.flush(TOKEN_RESPONSE);

    expect(result).toEqual(TOKEN_RESPONSE);
    expect(tokens.getAccessToken()).toBe('1|access-abc');
    expect(tokens.getRefreshToken()).toBe('2|refresh-xyz');
    expect(localStorage.getItem('erp-refresh-token')).toBe('2|refresh-xyz'); // remember=true
    expect(session.user()?.email).toBe('maria@exemplo.com');
  });

  it('login com remember=false guarda o refresh token só na sessão da aba', () => {
    service.login('maria@exemplo.com', 'minhasenha123', false).subscribe();
    httpMock.expectOne(`${environment.apiUrl}/login`).flush(TOKEN_RESPONSE);
    expect(sessionStorage.getItem('erp-refresh-token')).toBe('2|refresh-xyz');
    expect(localStorage.getItem('erp-refresh-token')).toBeNull();
  });

  it('register envia name/email/password/password_confirmation e loga automaticamente', () => {
    service
      .register({ name: 'Maria', email: 'maria@exemplo.com', password: 'minhasenha123', password_confirmation: 'minhasenha123' })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/register`);
    expect(req.request.body).toEqual({
      name: 'Maria',
      email: 'maria@exemplo.com',
      password: 'minhasenha123',
      password_confirmation: 'minhasenha123',
    });
    req.flush(TOKEN_RESPONSE);
    expect(session.isAuthenticated()).toBe(true);
  });

  it('logout chama POST /logout com o access token e limpa a sessão mesmo se a API falhar', () => {
    tokens.setAccessToken('1|access-abc');
    tokens.setRefreshToken('2|refresh-xyz', true);
    session.setCurrent(TOKEN_RESPONSE.user);

    let completed = false;
    service.logout().subscribe(() => (completed = true));

    const req = httpMock.expectOne(`${environment.apiUrl}/logout`);
    req.flush(null, { status: 401, statusText: 'Unauthorized' }); // token já expirado — não importa

    expect(completed).toBe(true);
    expect(tokens.getAccessToken()).toBeNull();
    expect(tokens.hasRefreshToken()).toBe(false);
    expect(session.user()).toBeNull();
  });

  it('forgotPassword/verifyResetCode/resetPassword chamam os endpoints certos', () => {
    service.forgotPassword('maria@exemplo.com').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/password/forgot`).flush({ message: 'ok' });

    service.verifyResetCode('maria@exemplo.com', '482913').subscribe();
    const verifyReq = httpMock.expectOne(`${environment.apiUrl}/password/verify-code`);
    expect(verifyReq.request.body).toEqual({ email: 'maria@exemplo.com', code: '482913' });
    verifyReq.flush({ message: 'ok' });

    service.resetPassword('maria@exemplo.com', '482913', 'novaSenha456', 'novaSenha456').subscribe();
    const resetReq = httpMock.expectOne(`${environment.apiUrl}/password/reset`);
    expect(resetReq.request.body).toEqual({
      email: 'maria@exemplo.com',
      code: '482913',
      password: 'novaSenha456',
      password_confirmation: 'novaSenha456',
    });
    resetReq.flush({ message: 'ok' });
  });

  it('refreshSession$ envia o refresh_token como Bearer e rotaciona o par', () => {
    tokens.setRefreshToken('2|refresh-xyz', true);

    service.refreshSession$().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/refresh`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer 2|refresh-xyz');
    expect(req.request.body).toEqual({});
    req.flush({ ...TOKEN_RESPONSE, access_token: '3|new-access', refresh_token: '4|new-refresh' });

    expect(tokens.getAccessToken()).toBe('3|new-access');
    expect(tokens.getRefreshToken()).toBe('4|new-refresh');
    expect(localStorage.getItem('erp-refresh-token')).toBe('4|new-refresh'); // mantém persist=true
  });

  it('refreshSession$ compartilha a mesma chamada entre subscribers concorrentes', () => {
    tokens.setRefreshToken('2|refresh-xyz', true);

    let countA = 0;
    let countB = 0;
    service.refreshSession$().subscribe(() => countA++);
    service.refreshSession$().subscribe(() => countB++);

    const reqs = httpMock.match(`${environment.apiUrl}/refresh`);
    expect(reqs.length).toBe(1); // só 1 chamada HTTP pras 2 subscriptions
    reqs[0].flush(TOKEN_RESPONSE);

    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx ng test --include='**/auth-api.service.spec.ts' --watch=false`
Expected: FAIL — `Cannot find module './auth-api.service'`

- [ ] **Step 3: Implementar o AuthApiService**

```typescript
// src/app/core/auth/auth-api.service.ts
import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpContext, HttpHeaders } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, finalize, shareReplay, tap } from 'rxjs/operators';
import { environment } from '../../../environments/environment';
import { AuthSession } from '@core/services/auth-session.service';
import { TokenStore } from './token-store.service';
import { AUTH_REQUEST_KIND, AuthTokenResponse, AuthUser, MessageResponse } from './auth.model';

const PUBLIC = new HttpContext().set(AUTH_REQUEST_KIND, 'public');

export interface RegisterPayload {
  name: string;
  email: string;
  password: string;
  password_confirmation: string;
}

/**
 * Fala com a API de auth do ERP-Backend e mantém `TokenStore`/`AuthSession`
 * sincronizados com o resultado de cada chamada. É o único lugar que sabe
 * o formato exato dos endpoints — componentes e o `authInterceptor` só
 * chamam os métodos daqui.
 */
@Injectable({ providedIn: 'root' })
export class AuthApiService {
  private readonly http = inject(HttpClient);
  private readonly tokens = inject(TokenStore);
  private readonly session = inject(AuthSession);
  private readonly baseUrl = environment.apiUrl;

  private refreshInFlight$: Observable<AuthTokenResponse> | null = null;

  register(payload: RegisterPayload): Observable<AuthTokenResponse> {
    return this.http
      .post<AuthTokenResponse>(`${this.baseUrl}/register`, payload, { context: PUBLIC })
      .pipe(tap((res) => this.applySession(res, true)));
  }

  login(email: string, password: string, remember = true): Observable<AuthTokenResponse> {
    return this.http
      .post<AuthTokenResponse>(`${this.baseUrl}/login`, { email, password }, { context: PUBLIC })
      .pipe(tap((res) => this.applySession(res, remember)));
  }

  /** Best-effort: mesmo se a API falhar (token já expirado, rede fora), limpa a sessão local. */
  logout(): Observable<void> {
    return this.http.post<void>(`${this.baseUrl}/logout`, {}).pipe(
      catchError(() => of(void 0)),
      tap(() => this.clearSession()),
    );
  }

  me(): Observable<AuthUser> {
    return this.http.get<AuthUser>(`${this.baseUrl}/user`);
  }

  forgotPassword(email: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(`${this.baseUrl}/password/forgot`, { email }, { context: PUBLIC });
  }

  verifyResetCode(email: string, code: string): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(
      `${this.baseUrl}/password/verify-code`,
      { email, code },
      { context: PUBLIC },
    );
  }

  resetPassword(
    email: string,
    code: string,
    password: string,
    password_confirmation: string,
  ): Observable<MessageResponse> {
    return this.http.post<MessageResponse>(
      `${this.baseUrl}/password/reset`,
      { email, code, password, password_confirmation },
      { context: PUBLIC },
    );
  }

  /**
   * Troca o refresh_token atual por um par novo. Compartilha a mesma
   * Observable entre chamadas concorrentes (ex.: várias respostas 401 ao
   * mesmo tempo no `authInterceptor`) — só dispara uma requisição de
   * `/refresh` por vez, as demais pegam o resultado da primeira.
   */
  refreshSession$(): Observable<AuthTokenResponse> {
    if (this.refreshInFlight$) {
      return this.refreshInFlight$;
    }
    const refreshToken = this.tokens.getRefreshToken();
    if (!refreshToken) {
      return throwError(() => new Error('Sem refresh token — sessão não pode ser renovada.'));
    }
    const context = new HttpContext().set(AUTH_REQUEST_KIND, 'refresh');
    const headers = new HttpHeaders({ Authorization: `Bearer ${refreshToken}` });

    this.refreshInFlight$ = this.http.post<AuthTokenResponse>(`${this.baseUrl}/refresh`, {}, { headers, context }).pipe(
      tap((res) => {
        this.tokens.setAccessToken(res.access_token);
        this.tokens.rotateRefreshToken(res.refresh_token);
        this.session.setCurrent(res.user);
      }),
      shareReplay(1),
      finalize(() => {
        this.refreshInFlight$ = null;
      }),
    );
    return this.refreshInFlight$;
  }

  clearSession(): void {
    this.tokens.clear();
    this.session.clear();
  }

  private applySession(res: AuthTokenResponse, persistRefresh: boolean): void {
    this.tokens.setAccessToken(res.access_token);
    this.tokens.setRefreshToken(res.refresh_token, persistRefresh);
    this.session.setCurrent(res.user);
  }
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx ng test --include='**/auth-api.service.spec.ts' --watch=false`
Expected: PASS (8 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/auth/auth-api.service.ts src/app/core/auth/auth-api.service.spec.ts
git commit -m "feat(auth): AuthApiService com login/registro/logout/refresh compartilhado"
```

---

### Task 4: authInterceptor (Bearer + refresh silencioso + dedup de 401 concorrentes)

**Files:**
- Create: `src/app/core/auth/auth.interceptor.ts`
- Test: `src/app/core/auth/auth.interceptor.spec.ts`

**Interfaces:**
- Consumes: `TokenStore`, `AuthApiService`, `AUTH_REQUEST_KIND` (Tasks 1 e 3), `Router`.
- Produces: `authInterceptor: HttpInterceptorFn`. Consumido por `app.config.ts` (Task 6).

- [ ] **Step 1: Escrever os testes (falhando)**

```typescript
// src/app/core/auth/auth.interceptor.spec.ts
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AUTH_REQUEST_KIND, AuthTokenResponse } from './auth.model';
import { TokenStore } from './token-store.service';

const TOKEN_RESPONSE: AuthTokenResponse = {
  user: { id: 1, name: 'Maria', email: 'maria@exemplo.com', role: 'ADMINISTRADOR', created_at: 'x' },
  token_type: 'Bearer',
  access_token: 'new-access',
  access_token_expires_at: 'x',
  refresh_token: 'new-refresh',
  refresh_token_expires_at: 'x',
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokens: TokenStore;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStore);
    router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
    sessionStorage.clear();
  });

  it('injeta o Bearer access token em chamadas normais', () => {
    tokens.setAccessToken('access-1');
    http.get(`${environment.apiUrl}/user`).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/user`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({});
  });

  it('não injeta token em requisições marcadas como public (login/registro/senha)', () => {
    tokens.setAccessToken('access-1');
    const context = new HttpContext().set(AUTH_REQUEST_KIND, 'public');
    http.post(`${environment.apiUrl}/login`, {}, { context }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/login`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('não mexe em requisições fora da apiUrl', () => {
    tokens.setAccessToken('access-1');
    http.get('https://outro-dominio.com/x').subscribe();
    const req = httpMock.expectOne('https://outro-dominio.com/x');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('em 401 numa chamada "refresh", desloga e redireciona pro login sem tentar de novo', () => {
    tokens.setRefreshToken('refresh-1', true);
    const context = new HttpContext().set(AUTH_REQUEST_KIND, 'refresh');
    let errored = false;
    http.post(`${environment.apiUrl}/refresh`, {}, { context }).subscribe({ error: () => (errored = true) });

    httpMock.expectOne(`${environment.apiUrl}/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(errored).toBe(true);
    expect(tokens.hasRefreshToken()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('em 401 numa chamada default: renova o token e repete a requisição original uma vez', () => {
    tokens.setAccessToken('expired-access');
    tokens.setRefreshToken('valid-refresh', true);

    let result: unknown;
    http.get(`${environment.apiUrl}/user`).subscribe((res) => (result = res));

    httpMock.expectOne(`${environment.apiUrl}/user`).flush(null, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne(`${environment.apiUrl}/refresh`);
    refreshReq.flush(TOKEN_RESPONSE);

    const retryReq = httpMock.expectOne(`${environment.apiUrl}/user`);
    expect(retryReq.request.headers.get('Authorization')).toBe('Bearer new-access');
    retryReq.flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('duas chamadas 401 concorrentes disparam só 1 refresh e repetem as duas', () => {
    tokens.setAccessToken('expired-access');
    tokens.setRefreshToken('valid-refresh', true);

    let resFoo: unknown;
    let resBar: unknown;
    http.get(`${environment.apiUrl}/foo`).subscribe((res) => (resFoo = res));
    http.get(`${environment.apiUrl}/bar`).subscribe((res) => (resBar = res));

    httpMock.expectOne(`${environment.apiUrl}/foo`).flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne(`${environment.apiUrl}/bar`).flush(null, { status: 401, statusText: 'Unauthorized' });

    const refreshReqs = httpMock.match(`${environment.apiUrl}/refresh`);
    expect(refreshReqs.length).toBe(1); // dedup: só 1 chamada de refresh pras 2 falhas
    refreshReqs[0].flush(TOKEN_RESPONSE);

    const retryFoo = httpMock.expectOne(`${environment.apiUrl}/foo`);
    expect(retryFoo.request.headers.get('Authorization')).toBe('Bearer new-access');
    retryFoo.flush({ ok: 'foo' });

    const retryBar = httpMock.expectOne(`${environment.apiUrl}/bar`);
    expect(retryBar.request.headers.get('Authorization')).toBe('Bearer new-access');
    retryBar.flush({ ok: 'bar' });

    expect(resFoo).toEqual({ ok: 'foo' });
    expect(resBar).toEqual({ ok: 'bar' });
  });

  it('se o refresh falhar, desloga, redireciona e propaga o erro original', () => {
    tokens.setAccessToken('expired-access');
    tokens.setRefreshToken('invalid-refresh', true);

    let errored = false;
    http.get(`${environment.apiUrl}/user`).subscribe({ error: () => (errored = true) });

    httpMock.expectOne(`${environment.apiUrl}/user`).flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne(`${environment.apiUrl}/refresh`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(errored).toBe(true);
    expect(tokens.hasRefreshToken()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `npx ng test --include='**/auth.interceptor.spec.ts' --watch=false`
Expected: FAIL — `Cannot find module './auth.interceptor'`

- [ ] **Step 3: Implementar o interceptor**

```typescript
// src/app/core/auth/auth.interceptor.ts
import { inject } from '@angular/core';
import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { TokenStore } from './token-store.service';
import { AuthApiService } from './auth-api.service';
import { AUTH_REQUEST_KIND } from './auth.model';

/**
 * Injeta o Bearer access token em toda chamada à API e trata 401:
 * - Chamada normal ('default'): tenta um refresh silencioso e repete a
 *   requisição original uma vez. Refresh concorrente é deduplicado pelo
 *   `AuthApiService.refreshSession$()` (Observable compartilhada) — várias
 *   401 ao mesmo tempo disparam só 1 `/refresh`.
 * - Chamada pública ('public' — login/registro/senha): não injeta token,
 *   não tenta refresh, só repassa o erro pro componente mostrar.
 * - A própria chamada de refresh ('refresh'): se ela voltar 401, a sessão
 *   é encerrada e o usuário vai pro login — não faz sentido tentar de novo.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const tokens = inject(TokenStore);
  const authApi = inject(AuthApiService);
  const router = inject(Router);
  const kind = req.context.get(AUTH_REQUEST_KIND);

  const accessToken = tokens.getAccessToken();
  const authedReq =
    kind === 'default' && accessToken
      ? req.clone({ setHeaders: { Authorization: `Bearer ${accessToken}` } })
      : req;

  return next(authedReq).pipe(
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) {
        return throwError(() => err);
      }

      if (kind === 'refresh') {
        authApi.clearSession();
        router.navigate(['/login']);
        return throwError(() => err);
      }

      if (kind === 'public') {
        return throwError(() => err);
      }

      return authApi.refreshSession$().pipe(
        switchMap((res) =>
          next(req.clone({ setHeaders: { Authorization: `Bearer ${res.access_token}` } })),
        ),
        catchError((refreshErr: unknown) => {
          authApi.clearSession();
          router.navigate(['/login']);
          return throwError(() => refreshErr);
        }),
      );
    }),
  );
};
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `npx ng test --include='**/auth.interceptor.spec.ts' --watch=false`
Expected: PASS (7 testes, incluindo o de dedup de 401 concorrentes)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/auth/auth.interceptor.ts src/app/core/auth/auth.interceptor.spec.ts
git commit -m "feat(auth): interceptor HTTP com refresh silencioso e dedup de 401 concorrentes"
```

---

### Task 5: authGuard

**Files:**
- Create: `src/app/core/auth/auth.guard.ts`
- Test: `src/app/core/auth/auth.guard.spec.ts`

**Interfaces:**
- Consumes: `TokenStore` (Task 1).
- Produces: `authGuard: CanActivateFn`. Consumido por `app.routes.ts` (Task 6).

- [ ] **Step 1: Escrever o teste (falhando)**

```typescript
// src/app/core/auth/auth.guard.spec.ts
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { runInInjectionContext } from '@angular/core';
import { authGuard } from './auth.guard';
import { TokenStore } from './token-store.service';

describe('authGuard', () => {
  let tokens: TokenStore;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    tokens = TestBed.inject(TokenStore);
    router = TestBed.inject(Router);
  });

  afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  function run() {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/platform/dashboard' } as never),
    );
  }

  it('libera quando há refresh token', () => {
    tokens.setRefreshToken('refresh-1', true);
    expect(run()).toBe(true);
  });

  it('redireciona pro login quando não há sessão', () => {
    const result = run();
    expect(result).toEqual(router.parseUrl('/login'));
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

Run: `npx ng test --include='**/auth.guard.spec.ts' --watch=false`
Expected: FAIL — `Cannot find module './auth.guard'`

- [ ] **Step 3: Implementar o guard**

```typescript
// src/app/core/auth/auth.guard.ts
import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { TokenStore } from './token-store.service';

/**
 * Protege as rotas de `/platform`. Checa só a presença de um refresh token
 * (não faz chamada de rede) — se ele existir mas estiver expirado/revogado,
 * o `authInterceptor` cuida disso no primeiro 401 real (desloga e
 * redireciona). No boot da aplicação, `app.config.ts` já tenta renovar a
 * sessão a partir do refresh token antes do router avaliar este guard.
 */
export const authGuard: CanActivateFn = () => {
  const tokens = inject(TokenStore);
  const router = inject(Router);
  return tokens.hasRefreshToken() ? true : router.parseUrl('/login');
};
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `npx ng test --include='**/auth.guard.spec.ts' --watch=false`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/core/auth/auth.guard.ts src/app/core/auth/auth.guard.spec.ts
git commit -m "feat(auth): guard de rota protege /platform via refresh token"
```

---

### Task 6: Ligar tudo (app.config, app.routes) e remover a auth fake

**Files:**
- Modify: `src/app/app.config.ts`
- Modify: `src/app/app.routes.ts`
- Modify: `src/environments/environment.type.ts` (comentário)
- Modify: `src/environments/environment.spec.ts` (comentário)
- Delete: `src/app/core/services/users.service.ts`
- Delete: `src/app/core/services/owner-bootstrap.service.ts`

**Interfaces:**
- Consumes: `authInterceptor` (Task 4), `authGuard` (Task 5), `AuthApiService`/`TokenStore` (Tasks 1 e 3).

- [ ] **Step 1: Remover os serviços fake**

```bash
rm src/app/core/services/users.service.ts
rm src/app/core/services/owner-bootstrap.service.ts
```

- [ ] **Step 2: Atualizar `app.config.ts`** — adiciona `provideHttpClient(withInterceptors(...))`, troca o boot do owner fake por uma tentativa silenciosa de refresh de sessão

```typescript
// src/app/app.config.ts
import {
  ApplicationConfig,
  inject,
  provideAppInitializer,
  provideBrowserGlobalErrorListeners,
} from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { providePrimeNG } from 'primeng/config';
import { definePreset } from '@primeuix/themes';
import Aura from '@primeuix/themes/aura';

import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { provideClientHydration, withEventReplay } from '@angular/platform-browser';
import { provideAnimationsAsync } from '@angular/platform-browser/animations/async';
import { IdbSeedService } from '@core/idb/idb-seed.service';
import { authInterceptor } from '@core/auth/auth.interceptor';
import { AuthApiService } from '@core/auth/auth-api.service';
import { TokenStore } from '@core/auth/token-store.service';

// Aura's default light primary.color ({primary.500}) fails WCAG AA contrast
// (2.53:1) against its white contrastColor. Bumped to {primary.700} (5.48:1).
const AccessibleAura = definePreset(Aura, {
  semantic: {
    colorScheme: {
      light: {
        primary: {
          color: '{primary.700}',
          hoverColor: '{primary.800}',
          activeColor: '{primary.900}',
        },
      },
    },
  },
});

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideClientHydration(withEventReplay()),
    provideAnimationsAsync(),
    providePrimeNG({
      theme: {
        preset: AccessibleAura,
        options: {
          darkModeSelector: '.app-dark',
        },
      },
      translation: {
        today: 'Hoje',
        clear: 'Limpar',
        dayNames: [
          'domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
          'quinta-feira', 'sexta-feira', 'sábado',
        ],
        dayNamesShort: ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'],
        dayNamesMin: ['Do', 'Se', 'Te', 'Qu', 'Qu', 'Se', 'Sa'],
        monthNames: [
          'janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
          'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro',
        ],
        monthNamesShort: [
          'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
          'jul', 'ago', 'set', 'out', 'nov', 'dez',
        ],
        firstDayOfWeek: 0,
      },
    }),
    provideAppInitializer(() => {
      const idbSeed = inject(IdbSeedService);
      const tokens = inject(TokenStore);
      const authApi = inject(AuthApiService);

      const seed$ = firstValueFrom(idbSeed.seed());
      // Se há um refresh_token guardado (login anterior), tenta renovar a
      // sessão silenciosamente antes do router avaliar o `authGuard` — evita
      // mandar pro /login quem só deu F5 na página. Se falhar (token
      // expirado/revogado), limpa tudo e o guard cuida do redirect.
      const authBoot$ = tokens.hasRefreshToken()
        ? firstValueFrom(authApi.refreshSession$()).catch(() => authApi.clearSession())
        : Promise.resolve();

      return Promise.all([seed$, authBoot$]);
    }),
  ],
};
```

- [ ] **Step 3: Proteger a rota `platform` no `app.routes.ts`**

```typescript
// src/app/app.routes.ts
import { Routes } from '@angular/router';
import { AUTH_ROUTES } from './pages/auth/auth.routes';
import { PLATFORM_ROUTES } from './pages/platform/platform.routes';
import { authGuard } from '@core/auth/auth.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layouts/layout-auth/layout-auth').then((m) => m.LayoutAuth),
    children: AUTH_ROUTES,
  },
  {
    path: 'platform',
    canActivate: [authGuard],
    loadComponent: () => import('./layouts/layout-app/layout-app').then((m) => m.LayoutApp),
    children: PLATFORM_ROUTES,
  },
  { path: '**', redirectTo: '' },
];
```

- [ ] **Step 4: Atualizar comentários em `environment.type.ts` e `environment.spec.ts`** (não são mais infra "sem consumidor")

Em `src/environments/environment.type.ts`, trocar o parágrafo final do docblock:

```typescript
 * "apiUrl" é a base da API Laravel (ERP-Backend). Consumida por
 * `AuthApiService` (login/registro/logout/refresh/reset de senha) — ver
 * `src/app/core/auth/`.
```

Em `src/environments/environment.spec.ts`, trocar o comentário:

```typescript
// Testa a infraestrutura de environment em si — AuthApiService (ver
// src/app/core/auth/) consome environment.apiUrl pra falar com o
// ERP-Backend.
```

- [ ] **Step 5: Rodar a suíte inteira até aqui pra garantir que nada quebrou de import**

Run: `npx ng test --watch=false 2>&1 | tail -60`
Expected: Falhas esperadas só nos specs de `login`/`register`/`forgot-password`/`settings`/`layout-app` (ainda não atualizados — Tasks 7-11); nenhum erro de módulo não encontrado relacionado a `users.service`/`owner-bootstrap.service`.

- [ ] **Step 6: Commit**

```bash
git add src/app/app.config.ts src/app/app.routes.ts src/environments/environment.type.ts src/environments/environment.spec.ts
git rm src/app/core/services/users.service.ts src/app/core/services/owner-bootstrap.service.ts
git commit -m "feat(auth): liga interceptor+guard, remove UsersService/OwnerBootstrapService fake"
```

---

### Task 7: Tela de login usa AuthApiService

**Files:**
- Modify: `src/app/pages/auth/login/login.ts`
- Modify: `src/app/pages/auth/login/login.spec.ts`

**Interfaces:**
- Consumes: `AuthApiService.login()` (Task 3).

- [ ] **Step 1: Atualizar o spec pra prover HttpClientTesting (senão a injeção do AuthApiService falha)**

```typescript
// src/app/pages/auth/login/login.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { Login } from './login';

describe('Login', () => {
  let component: Login;
  let fixture: ComponentFixture<Login>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Login],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Login);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
```

- [ ] **Step 2: Rodar o spec e confirmar que falha** (componente ainda importa `UsersService`, que foi deletado na Task 6)

Run: `npx ng test --include='**/login.spec.ts' --watch=false`
Expected: FAIL — `Cannot find module '@core/services/users.service'`

- [ ] **Step 3: Reescrever `login.ts`**

```typescript
// src/app/pages/auth/login/login.ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { AuthApiService } from '@core/auth/auth-api.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss',
})
export class Login {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

  protected email = '';
  protected password = '';
  protected remember = true;

  protected readonly erro = signal('');
  protected readonly entrando = signal(false);
  protected readonly mostrarSenha = signal(false);

  protected toggleSenha(): void {
    this.mostrarSenha.update((v) => !v);
  }

  protected async onSubmit(): Promise<void> {
    if (this.entrando()) {
      return;
    }
    this.erro.set('');
    this.entrando.set(true);
    try {
      await firstValueFrom(this.authApi.login(this.email.trim(), this.password, this.remember));
      this.router.navigate(['/platform/dashboard']);
    } catch (err) {
      this.erro.set(this.mensagemErro(err));
    } finally {
      this.entrando.set(false);
    }
  }

  private mensagemErro(err: unknown): string {
    if (err instanceof HttpErrorResponse) {
      if (err.status === 422) {
        return err.error?.message ?? 'E-mail ou senha inválidos.';
      }
      if (err.status === 429) {
        return 'Muitas tentativas. Aguarde um instante e tente novamente.';
      }
    }
    return 'Não foi possível entrar. Tente novamente.';
  }
}
```

- [ ] **Step 4: Rodar o spec e confirmar que passa**

Run: `npx ng test --include='**/login.spec.ts' --watch=false`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/auth/login/login.ts src/app/pages/auth/login/login.spec.ts
git commit -m "feat(auth): tela de login usa AuthApiService (API real)"
```

---

### Task 8: Tela de cadastro usa AuthApiService

**Files:**
- Modify: `src/app/pages/auth/register/register.ts`
- Create: `src/app/pages/auth/register/register.spec.ts`

**Interfaces:**
- Consumes: `AuthApiService.register()` (Task 3).

- [ ] **Step 1: Criar o spec (falhando)**

```typescript
// src/app/pages/auth/register/register.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { Register } from './register';

describe('Register', () => {
  let component: Register;
  let fixture: ComponentFixture<Register>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Register);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('formValido exige nome, e-mail e senhas coincidentes com 6+ caracteres', () => {
    component['nome'] = 'Maria';
    component['email'] = 'maria@exemplo.com';
    component['senha'] = '123456';
    component['confirmarSenha'] = '123456';
    expect(component['formValido']()).toBe(true);

    component['confirmarSenha'] = '000000';
    expect(component['formValido']()).toBe(false);
  });
});
```

- [ ] **Step 2: Rodar o spec e confirmar que falha**

Run: `npx ng test --include='**/register.spec.ts' --watch=false`
Expected: FAIL — `register.ts` ainda importa `UsersService` (deletado na Task 6)

- [ ] **Step 3: Reescrever `register.ts`**

```typescript
// src/app/pages/auth/register/register.ts
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { PasswordModule } from 'primeng/password';
import { AuthApiService } from '@core/auth/auth-api.service';

@Component({
  selector: 'app-register',
  imports: [FormsModule, RouterLink, ButtonModule, InputTextModule, PasswordModule],
  templateUrl: './register.html',
  styleUrl: './register.scss',
})
export class Register {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

  protected nome = '';
  protected email = '';
  protected senha = '';
  protected confirmarSenha = '';

  protected readonly erro = signal('');
  protected readonly salvando = signal(false);

  protected senhasConferem(): boolean {
    return this.senha.length >= 6 && this.senha === this.confirmarSenha;
  }

  protected formValido(): boolean {
    return this.nome.trim().length > 0 && this.email.trim().length > 0 && this.senhasConferem();
  }

  protected async cadastrar(): Promise<void> {
    if (!this.formValido() || this.salvando()) {
      return;
    }
    this.erro.set('');
    this.salvando.set(true);
    try {
      // API loga automaticamente no registro (ver openapi.yaml: /register).
      await firstValueFrom(
        this.authApi.register({
          name: this.nome.trim(),
          email: this.email.trim(),
          password: this.senha,
          password_confirmation: this.confirmarSenha,
        }),
      );
      this.router.navigate(['/platform/dashboard']);
    } catch (err) {
      this.erro.set(this.mensagemErro(err));
    } finally {
      this.salvando.set(false);
    }
  }

  private mensagemErro(err: unknown): string {
    if (err instanceof HttpErrorResponse && err.status === 422) {
      const errors = err.error?.errors as Record<string, string[]> | undefined;
      return errors?.['email']?.[0] ?? err.error?.message ?? 'Não foi possível cadastrar.';
    }
    return 'Não foi possível cadastrar. Tente novamente.';
  }
}
```

- [ ] **Step 4: Rodar o spec e confirmar que passa**

Run: `npx ng test --include='**/register.spec.ts' --watch=false`
Expected: PASS (2 testes)

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/auth/register/register.ts src/app/pages/auth/register/register.spec.ts
git commit -m "feat(auth): tela de cadastro usa AuthApiService, redireciona ao dashboard (login automático)"
```

---

### Task 9: Fluxo de esqueci-senha usa AuthApiService

**Files:**
- Modify: `src/app/pages/auth/forgot-password/forgot-password.ts`
- Modify: `src/app/pages/auth/forgot-password/forgot-password.html`
- Create: `src/app/pages/auth/forgot-password/forgot-password.spec.ts`

**Interfaces:**
- Consumes: `AuthApiService.forgotPassword()`, `.verifyResetCode()`, `.resetPassword()` (Task 3).

- [ ] **Step 1: Criar o spec (falhando)**

```typescript
// src/app/pages/auth/forgot-password/forgot-password.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';

import { ForgotPassword } from './forgot-password';

describe('ForgotPassword', () => {
  let component: ForgotPassword;
  let fixture: ComponentFixture<ForgotPassword>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPassword);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('enviarEmail chama /password/forgot e avança pro passo 2', async () => {
    component['email'] = 'maria@exemplo.com';
    const promise = component['enviarEmail']();
    httpMock.expectOne(`${environment.apiUrl}/password/forgot`).flush({ message: 'ok' });
    await promise;
    expect(component['step']()).toBe(2);
  });

  it('validarToken com código inválido mostra erro e fica no passo 2', async () => {
    component['email'] = 'maria@exemplo.com';
    component['token'] = '482913';
    const promise = component['validarToken']();
    httpMock
      .expectOne(`${environment.apiUrl}/password/verify-code`)
      .flush({ message: 'Código inválido ou expirado.' }, { status: 422, statusText: 'Unprocessable Entity' });
    await promise;
    expect(component['step']()).toBe(2);
    expect(component['erro']()).toBeTruthy();
  });

  it('redefinir chama /password/reset e volta pro login', async () => {
    component['email'] = 'maria@exemplo.com';
    component['token'] = '482913';
    component['novaSenha'] = 'novaSenha456';
    component['confirmarSenha'] = 'novaSenha456';
    const promise = component['redefinir']();
    httpMock.expectOne(`${environment.apiUrl}/password/reset`).flush({ message: 'ok' });
    await promise;
  });
});
```

- [ ] **Step 2: Rodar o spec e confirmar que falha**

Run: `npx ng test --include='**/forgot-password.spec.ts' --watch=false`
Expected: FAIL — `enviarEmail`/`validarToken`/`redefinir` ainda são `void` síncronos com TODO, não chamam a API

- [ ] **Step 3: Reescrever `forgot-password.ts`**

```typescript
// src/app/pages/auth/forgot-password/forgot-password.ts
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { ButtonModule } from 'primeng/button';
import { InputTextModule } from 'primeng/inputtext';
import { InputOtpModule } from 'primeng/inputotp';
import { PasswordModule } from 'primeng/password';
import { MessageModule } from 'primeng/message';
import { AuthApiService } from '@core/auth/auth-api.service';

@Component({
  selector: 'app-forgot-password',
  imports: [
    FormsModule,
    RouterLink,
    ButtonModule,
    InputTextModule,
    InputOtpModule,
    PasswordModule,
    MessageModule,
  ],
  templateUrl: './forgot-password.html',
  styleUrl: './forgot-password.scss',
})
export class ForgotPassword {
  private readonly router = inject(Router);
  private readonly authApi = inject(AuthApiService);

  /** 1 = e-mail, 2 = código, 3 = nova senha */
  protected readonly step = signal(1);

  protected email = '';
  protected token = '';
  protected novaSenha = '';
  protected confirmarSenha = '';

  protected readonly enviando = signal(false);
  protected readonly erro = signal('');

  protected readonly tokenValido = computed(() => this.token.length === 6);
  protected readonly senhasConferem = computed(
    () => this.novaSenha.length >= 6 && this.novaSenha === this.confirmarSenha,
  );

  protected async enviarEmail(): Promise<void> {
    if (!this.email.trim() || this.enviando()) {
      return;
    }
    this.erro.set('');
    this.enviando.set(true);
    try {
      // A API sempre responde OK genérico aqui (não revela se o e-mail existe).
      await firstValueFrom(this.authApi.forgotPassword(this.email.trim()));
      this.step.set(2);
    } catch {
      this.erro.set('Não foi possível enviar o código. Tente novamente.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async validarToken(): Promise<void> {
    if (!this.tokenValido() || this.enviando()) {
      return;
    }
    this.erro.set('');
    this.enviando.set(true);
    try {
      await firstValueFrom(this.authApi.verifyResetCode(this.email.trim(), this.token));
      this.step.set(3);
    } catch {
      this.erro.set('Código inválido ou expirado.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected async redefinir(): Promise<void> {
    if (!this.senhasConferem() || this.enviando()) {
      return;
    }
    this.erro.set('');
    this.enviando.set(true);
    try {
      await firstValueFrom(
        this.authApi.resetPassword(this.email.trim(), this.token, this.novaSenha, this.confirmarSenha),
      );
      this.router.navigate(['/login']);
    } catch {
      this.erro.set('Não foi possível redefinir a senha. Tente novamente.');
    } finally {
      this.enviando.set(false);
    }
  }

  protected voltar(): void {
    this.erro.set('');
    if (this.step() === 1) {
      this.router.navigate(['/login']);
      return;
    }
    this.step.update((s) => Math.max(1, s - 1));
  }
}
```

- [ ] **Step 4: Adicionar exibição de erro e desabilitar botões durante `enviando()` no template**

Em `forgot-password.html`, logo antes do bloco `<!-- ETAPA 1 — E-MAIL -->`, adicionar:

```html
@if (erro()) {
  <p class="auth-field__error" style="margin-bottom: 1rem">{{ erro() }}</p>
}
```

E trocar os três `[disabled]` dos botões de submit pra também considerar `enviando()`:

```html
[disabled]="!email || enviando()"
```
```html
[disabled]="!tokenValido() || enviando()"
```
```html
[disabled]="!senhasConferem() || enviando()"
```

- [ ] **Step 5: Rodar o spec e confirmar que passa**

Run: `npx ng test --include='**/forgot-password.spec.ts' --watch=false`
Expected: PASS (4 testes)

- [ ] **Step 6: Commit**

```bash
git add src/app/pages/auth/forgot-password/forgot-password.ts src/app/pages/auth/forgot-password/forgot-password.html src/app/pages/auth/forgot-password/forgot-password.spec.ts
git commit -m "feat(auth): fluxo de esqueci-senha usa AuthApiService (3 etapas reais)"
```

---

### Task 10: Logout real no layout da plataforma

**Files:**
- Modify: `src/app/layouts/layout-app/layout-app.ts`
- Modify: `src/app/layouts/layout-app/layout-app.spec.ts`

**Interfaces:**
- Consumes: `AuthApiService.logout()` (Task 3).

- [ ] **Step 1: Ler o spec existente pra saber o que já é provido** (não reproduzido aqui — só adicionar `provideHttpClient()`/`provideHttpClientTesting()` aos providers do `TestBed.configureTestingModule`, do mesmo jeito que nas Tasks 7-9, e um teste novo)

Adicionar ao final do arquivo `layout-app.spec.ts` (mantendo o que já existe, só ajustando os `providers` do `beforeEach` pra incluir `provideHttpClient(), provideHttpClientTesting()`):

```typescript
  it('sair() chama o logout da API e navega pro login', async () => {
    const httpMock = TestBed.inject(HttpTestingController);
    const router = TestBed.inject(Router);
    spyOn(router, 'navigate').and.resolveTo(true);

    const promise = component['sair']();
    httpMock.expectOne(`${environment.apiUrl}/logout`).flush(null, { status: 204, statusText: 'No Content' });
    await promise;

    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
```

(imports adicionais no topo do spec: `HttpTestingController` de `@angular/common/http/testing`, `environment` de `../../../environments/environment`.)

- [ ] **Step 2: Rodar o spec e confirmar que falha**

Run: `npx ng test --include='**/layout-app.spec.ts' --watch=false`
Expected: FAIL — `sair()` ainda é síncrono e não chama a API

- [ ] **Step 3: Atualizar `layout-app.ts`** — trocar o import de `AuthSession` por incluir também `AuthApiService`, e reescrever `sair()`

```typescript
// diff conceitual em src/app/layouts/layout-app/layout-app.ts
import { AuthApiService } from '@core/auth/auth-api.service';
// ... mantém: import { AuthSession } from '@core/services/auth-session.service';

export class LayoutApp {
  private readonly router = inject(Router);
  private readonly idb = inject(IndexedDbService);
  private readonly session = inject(AuthSession);
  private readonly authApi = inject(AuthApiService);
  // ...

  protected async sair(): Promise<void> {
    // authApi.logout() já limpa TokenStore/AuthSession mesmo se a API falhar
    // (ver AuthApiService.logout — best-effort).
    await firstValueFrom(this.authApi.logout());
    this.router.navigate(['/login']);
  }
```

(precisa também importar `firstValueFrom` de `rxjs` no topo do arquivo.)

- [ ] **Step 4: Rodar o spec e confirmar que passa**

Run: `npx ng test --include='**/layout-app.spec.ts' --watch=false`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/layouts/layout-app/layout-app.ts src/app/layouts/layout-app/layout-app.spec.ts
git commit -m "feat(auth): botão Sair chama POST /logout antes de voltar ao login"
```

---

### Task 11: Tela de Configurações sem a releitura fake do IndexedDB

**Files:**
- Modify: `src/app/pages/platform/settings/settings.ts`
- Test: `src/app/pages/platform/settings/settings.spec.ts` (criar, se não existir — checar antes)

**Interfaces:**
- Consumes: `AuthSession.user`/`.patch()` (Task 2, já compatível na assinatura).

- [ ] **Step 1: Checar se já existe spec pra `Settings`**

Run: `test -f src/app/pages/platform/settings/settings.spec.ts && echo existe || echo nao-existe`

Se `nao-existe`, criar:

```typescript
// src/app/pages/platform/settings/settings.spec.ts
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthSession } from '@core/services/auth-session.service';

import { Settings } from './settings';

describe('Settings', () => {
  let component: Settings;
  let fixture: ComponentFixture<Settings>;
  let session: AuthSession;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    session = TestBed.inject(AuthSession);
    session.setCurrent({ id: 1, name: 'Maria', email: 'maria@exemplo.com', role: 'ADMINISTRADOR', created_at: 'x' });

    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create e carrega os campos do usuário logado', () => {
    expect(component).toBeTruthy();
    expect(component['nome']).toBe('Maria');
    expect(component['email']).toBe('maria@exemplo.com');
  });

  it('salvar() faz patch só dos campos locais (phone/farm) via AuthSession', () => {
    component['telefone'] = '(11) 90000-0000';
    component['granja'] = 'Granja Boa Vista';
    component['salvar']();
    expect(session.user()?.phone).toBe('(11) 90000-0000');
    expect(session.user()?.farm).toBe('Granja Boa Vista');
  });
});
```

- [ ] **Step 2: Rodar o spec e confirmar que falha**

Run: `npx ng test --include='**/settings.spec.ts' --watch=false`
Expected: FAIL — `settings.ts` ainda lê `IndexedDbService`/`IDB_STORES.users` (registro que não existe mais pro usuário autenticado)

- [ ] **Step 3: Reescrever `settings.ts`** — remove a releitura via IndexedDB (não existe mais registro do usuário autenticado lá; a fonte de verdade agora é a API/`AuthSession`), mantém as prefs de UI

```typescript
// src/app/pages/platform/settings/settings.ts
import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { ToggleSwitchModule } from 'primeng/toggleswitch';
import { SkeletonModule } from 'primeng/skeleton';
import { ThemeService } from '@core/utils/theme.service';
import { AuthSession } from '@core/services/auth-session.service';

interface Pref {
  key: string;
  label: string;
  desc: string;
}

@Component({
  selector: 'app-settings',
  imports: [FormsModule, InputTextModule, ButtonModule, ToggleSwitchModule, SkeletonModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings implements OnInit {
  private readonly theme = inject(ThemeService);
  private readonly session = inject(AuthSession);

  /** Usuário logado (vem da API — ver AuthSession). */
  protected readonly user = this.session.user;

  protected nome = '';
  protected email = '';
  protected telefone = '';
  protected granja = '';

  protected readonly salvando = signal(false);
  protected readonly salvo = signal(false);
  protected readonly carregando = signal(true);

  ngOnInit(): void {
    this.carregarPerfil();
  }

  private carregarPerfil(): void {
    this.carregando.set(true);
    const user = this.user();
    if (user) {
      this.nome = user.name;
      this.email = user.email;
      this.telefone = user.phone ?? '';
      this.granja = user.farm ?? '';
    }
    this.carregando.set(false);
  }

  /**
   * name/email não têm endpoint de atualização na API ainda — só phone/farm
   * são persistidos (localmente, via `AuthSession.patch`, ver docstring lá).
   */
  protected salvar(): void {
    if (!this.user() || this.salvando()) return;
    this.salvo.set(false);
    this.salvando.set(true);
    this.session.patch({
      phone: this.telefone.trim(),
      farm: this.granja.trim(),
    });
    this.salvando.set(false);
    this.salvo.set(true);
  }

  protected cancelar(): void {
    this.salvo.set(false);
    this.carregarPerfil();
  }

  protected readonly prefsDefs: Pref[] = [
    { key: 'emailAlerts', label: 'Alertas por e-mail', desc: 'Receba avisos de vendas e pendências' },
    {
      key: 'lowStock',
      label: 'Aviso de estoque baixo',
      desc: 'Notificar quando ovos ou ração estiverem acabando',
    },
    { key: 'weeklyReport', label: 'Relatório semanal', desc: 'Resumo automático toda segunda-feira' },
    { key: 'darkTheme', label: 'Tema escuro', desc: 'Interface com fundo escuro' },
  ];

  protected readonly prefs = signal<Record<string, boolean>>({
    emailAlerts: true,
    lowStock: true,
    weeklyReport: false,
    darkTheme: this.theme.isDark(),
  });

  protected setPref(key: string, value: boolean): void {
    this.prefs.update((p) => ({ ...p, [key]: value }));
    if (key === 'darkTheme') {
      this.theme.setDark(value);
    }
  }
}
```

Nota: campo "Nome" no formulário fica visualmente editável no template mas não é mais persistido (a API não expõe update de perfil) — como o `salvar()` já não envia `name`, isso é consistente; se quiser, uma melhoria futura fora de escopo é desabilitar o campo `nome`/`email` no `settings.html` ou adicionar uma nota de "somente leitura". Não alterado aqui pra manter o escopo em auth.

- [ ] **Step 4: Rodar o spec e confirmar que passa**

Run: `npx ng test --include='**/settings.spec.ts' --watch=false`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/app/pages/platform/settings/settings.ts src/app/pages/platform/settings/settings.spec.ts
git commit -m "fix(settings): perfil lê/edita via AuthSession real, remove releitura fake do IndexedDB"
```

---

### Task 12: Suíte completa + build de produção

**Files:** nenhum (verificação)

- [ ] **Step 1: Rodar a suíte inteira**

Run: `npx ng test --watch=false`
Expected: todos os testes passam (nenhuma falha) — reportar contagem total

- [ ] **Step 2: Build de produção**

Run: `npx ng build --configuration production`
Expected: build conclui sem erro; checar warnings de budget (`angular.json` já define `maximumWarning: 500kB` / `maximumError: 1MB` pro bundle inicial)

- [ ] **Step 3: Commit final (se sobrar algo solto, ex. lockfile)**

```bash
git status --short
# se houver mudanças não commitadas relevantes:
git add -A
git commit -m "chore(auth): integração real com a API Laravel finalizada"
```

- [ ] **Step 4: Confirmar que não houve push**

Run: `git log --oneline -15` e `git status` — mostrar que a branch local está à frente da remota e que nenhum `git push` foi executado em nenhum passo deste plano.

---

## Self-Review Notes

- Cobertura do spec do usuário: leitura do backend (routes/api.php, Controllers, Requests, openapi.yaml) ✅ feita antes deste plano; serviço HTTP real ✅ Task 3; armazenamento token em memória + refresh em storage com decisão documentada ✅ Task 1; interceptor injeta Bearer ✅ Task 4; retry silencioso em 401 ✅ Task 4; dedup de refresh concorrente ✅ Task 4 (testado explicitamente); telas login/cadastro/reset ✅ Tasks 7-9; compatibilidade com `AuthSession`/guards ✅ Tasks 2 e 5 (nomes de método preservados); testes unitários com `HttpTestingController` incluindo concorrência ✅ Task 4; suíte completa + build produção ✅ Task 12; sem push ✅ regra global + Task 12 Step 4.
- Fora de escopo, explicitamente preservado: `pages/platform/users/*` (CRUD local de usuários da aplicação, sem endpoint correspondente no backend).
