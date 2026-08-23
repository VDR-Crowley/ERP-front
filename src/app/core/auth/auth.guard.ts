import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformServer } from '@angular/common';
import { CanActivateFn, Router } from '@angular/router';
import { TokenStore } from './token-store.service';

/**
 * Protege as rotas de `/platform`. Checa só a presença de um refresh token
 * (não faz chamada de rede) — se ele existir mas estiver expirado/revogado,
 * o `authInterceptor` cuida disso no primeiro 401 real (desloga e
 * redireciona). No boot da aplicação, `app.config.ts` já tenta renovar a
 * sessão a partir do refresh token antes do router avaliar este guard.
 *
 * No servidor (build-time prerender ou SSR real) não existe localStorage
 * real — `TokenStore` cai no fallback em memória (sempre vazio, ver
 * `browser-storage.ts`), então este guard nunca deve decidir "sem sessão"
 * com esse dado incompleto: quem decide de verdade é o client, depois da
 * hydration, com o token real. `/platform/**` já roda em
 * `RenderMode.Client` (`app.routes.server.ts`), então este guard nem chega
 * a ser avaliado no servidor em condições normais — o check abaixo é
 * defesa extra pra qualquer rota protegida que escape desse mapeamento.
 */
export const authGuard: CanActivateFn = () => {
  if (isPlatformServer(inject(PLATFORM_ID))) {
    return true;
  }

  const tokens = inject(TokenStore);
  const router = inject(Router);
  return tokens.hasRefreshToken() ? true : router.parseUrl('/login');
};
