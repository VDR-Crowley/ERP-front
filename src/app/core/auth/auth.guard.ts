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
