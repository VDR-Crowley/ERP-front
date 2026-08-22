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
