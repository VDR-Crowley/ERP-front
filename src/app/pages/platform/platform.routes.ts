import { Routes } from '@angular/router';

export const PLATFORM_ROUTES: Routes = [
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'production',
    loadComponent: () => import('./production/production').then((m) => m.Production),
  },
  {
    path: 'sales',
    loadComponent: () => import('./sales/sales').then((m) => m.Sales),
  },
  {
    path: 'egg-stock',
    loadComponent: () => import('./egg-stock/egg-stock').then((m) => m.EggStock),
  },
  {
    path: 'plantel',
    loadComponent: () => import('./plantel/plantel').then((m) => m.Plantel),
  },
  {
    path: 'gestao-plantel',
    loadComponent: () => import('./gestao-plantel/gestao-plantel').then((m) => m.GestaoPlantel),
  },
  {
    path: 'controle-racao',
    loadComponent: () => import('./controle-racao/controle-racao').then((m) => m.ControleRacao),
  },
  {
    path: 'higienizacao',
    loadComponent: () =>
      import('./higienizacao-plantel/higienizacao-plantel').then((m) => m.HigienizacaoPlantel),
  },
  {
    path: 'expenses',
    loadComponent: () => import('./expenses/expenses').then((m) => m.Expenses),
  },
  {
    path: 'cash-flow',
    loadComponent: () => import('./cash-flow/cash-flow').then((m) => m.CashFlow),
  },
  {
    path: 'reports',
    loadComponent: () => import('./reports/reports').then((m) => m.Reports),
  },
  {
    path: 'analise-linha-negocio',
    loadComponent: () =>
      import('./analise-linha-negocio/analise-linha-negocio').then((m) => m.AnaliseLinhaNegocio),
  },
  {
    path: 'products',
    loadComponent: () => import('./products/products').then((m) => m.Products),
  },
  {
    path: 'users',
    loadComponent: () => import('./users/users').then((m) => m.Users),
  },
  {
    path: 'settings',
    loadComponent: () => import('./settings/settings').then((m) => m.Settings),
  },
  { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
];
