import { Routes } from '@angular/router';
import { AUTH_ROUTES } from './pages/auth/auth.routes';
import { PLATFORM_ROUTES } from './pages/platform/platform.routes';
import { authGuard } from '@core/auth/auth.guard';
import { roleGuard } from '@core/auth/role.guard';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./layouts/layout-auth/layout-auth').then((m) => m.LayoutAuth),
    children: AUTH_ROUTES,
  },
  {
    path: 'platform',
    canActivate: [authGuard],
    canActivateChild: [roleGuard],
    loadComponent: () => import('./layouts/layout-app/layout-app').then((m) => m.LayoutApp),
    children: PLATFORM_ROUTES,
  },
  { path: '**', redirectTo: '' },
];
