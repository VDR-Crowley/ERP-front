import { Routes } from '@angular/router';

export const PLATFORM_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'producao',
    loadComponent: () => import('./producao/producao').then((m) => m.Producao),
  },
  {
    path: 'vendas',
    loadComponent: () => import('./vendas/vendas').then((m) => m.Vendas),
  },
  {
    path: 'estoque',
    loadComponent: () => import('./estoque-ovos/estoque-ovos').then((m) => m.EstoqueOvos),
  },
  {
    path: 'plantel',
    loadComponent: () => import('./plantel/plantel').then((m) => m.Plantel),
  },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
];
