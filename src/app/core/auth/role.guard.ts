import { inject } from '@angular/core';
import { CanActivateChildFn, Router } from '@angular/router';
import { AuthSession } from '@core/services/auth-session.service';

/** Rotas de `/platform` que o perfil VENDEDOR pode acessar. */
const VENDEDOR_PATHS = ['sales', 'crm'];

/**
 * Enforcement de UI do perfil VENDEDOR: se ele digitar a URL de uma tela que
 * não é Vendas/CRM, redireciona pra Vendas. O backend já bloqueia os dados
 * (403), isto só evita cair numa tela vazia/quebrada. Admin passa livre.
 */
export const roleGuard: CanActivateChildFn = (childRoute) => {
  const session = inject(AuthSession);
  if (!session.isVendedor()) return true;

  const path = childRoute.routeConfig?.path ?? '';
  if (VENDEDOR_PATHS.includes(path)) return true;

  return inject(Router).createUrlTree(['/platform/sales']);
};
