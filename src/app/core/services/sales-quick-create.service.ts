import { Injectable, signal } from '@angular/core';

/**
 * Atalho "Nova Venda" da sidebar (`layout-app`): sinaliza pra tela de Vendas
 * abrir o modal de criação assim que estiver montada — funciona tanto vindo
 * de outra página (a tela ainda vai montar) quanto já estando em Vendas (o
 * `effect` reage na hora, sem precisar de navegação). Signal único em vez de
 * @Input porque as duas pontas não têm relação pai/filho.
 */
@Injectable({ providedIn: 'root' })
export class SalesQuickCreate {
  private readonly requested = signal(0);

  /** Incrementa em vez de `set(true)` pra disparar o `effect` mesmo em cliques seguidos. */
  request(): void {
    this.requested.update((n) => n + 1);
  }

  readonly signal = this.requested.asReadonly();
}
