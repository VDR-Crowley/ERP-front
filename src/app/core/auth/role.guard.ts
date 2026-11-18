import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthSession } from '@core/services/auth-session.service';

/** Rotas de `/platform` que o perfil VENDEDOR pode acessar. */
const VENDEDOR_PATHS = ['sales', 'crm'];

/** Rotas de `/platform` exclusivas de ADMINISTRADOR (o backend responde 403 pra qualquer outro). */
const ADMIN_ONLY_PATHS = ['consumo-railway'];

/**
 * Enforcement de UI dos perfis: se o VENDEDOR digitar a URL de uma tela que
 * não é Vendas/CRM, redireciona pra Vendas; telas exclusivas de admin
 * (`ADMIN_ONLY_PATHS`) redirecionam quem não é ADMINISTRADOR pro Dashboard.
 * O backend já bloqueia os dados (403), isto só evita cair numa tela
 * vazia/quebrada.
 */
export const roleGuard: CanActivateChildFn = (childRoute) => {
  const session = inject(AuthSession);
  const path = childRoute.routeConfig?.path ?? '';

  if (session.isVendedor()) {
    return VENDEDOR_PATHS.includes(path) ? true : inject(Router).createUrlTree(['/platform/sales']);
  }

  if (ADMIN_ONLY_PATHS.includes(path) && !session.isAdmin()) {
    return inject(Router).createUrlTree(['/platform/dashboard']);
  }
  return true;
};
