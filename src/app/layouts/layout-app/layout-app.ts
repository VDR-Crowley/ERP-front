import { Component, inject, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';

interface NavItem {
  path: string;
  icon: string;
  label: string;
  sub: string;
}

@Component({
  selector: 'app-layout-app',
  imports: [RouterOutlet, RouterLink, RouterLinkActive],
  templateUrl: './layout-app.html',
  styleUrl: './layout-app.scss',
})
export class LayoutApp {
  private readonly router = inject(Router);

  protected readonly menuOpen = signal(false);

  protected readonly nav: NavItem[] = [
    {
      path: '/plataforma/dashboard',
      icon: 'pi-home',
      label: 'Dashboard',
      sub: 'Visão geral da produção e vendas',
    },
    {
      path: '/plataforma/producao',
      icon: 'pi-chart-bar',
      label: 'Produção',
      sub: 'Produção diária de ovos',
    },
    {
      path: '/plataforma/vendas',
      icon: 'pi-shopping-cart',
      label: 'Vendas',
      sub: 'Todas as vendas realizadas',
    },
    {
      path: '/plataforma/estoque',
      icon: 'pi-database',
      label: 'Estoque de Ovos',
      sub: 'Saldo diário de ovos e packs',
    },
    {
      path: '/plataforma/plantel',
      icon: 'pi-th-large',
      label: 'Plantel & Ração',
      sub: 'Espécies, ração e custos',
    },
  ];

  private current(): NavItem {
    return this.nav.find((item) => this.router.url.startsWith(item.path)) ?? this.nav[0];
  }

  protected pageTitle(): string {
    return this.current().label;
  }

  protected pageSub(): string {
    return this.current().sub;
  }

  protected toggleMenu(): void {
    this.menuOpen.update((open) => !open);
  }

  protected closeMenu(): void {
    this.menuOpen.set(false);
  }
}
