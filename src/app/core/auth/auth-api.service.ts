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
