import { RenderMode, ServerRoute } from '@angular/ssr';

export const serverRoutes: ServerRoute[] = [
  /**
   * Rotas protegidas (`/platform/**`) dependem de sessão do usuário
   * (`authGuard`) e de dados só disponíveis no browser (access_token em
   * memória, refresh_token em Web Storage — ver `token-store.service.ts`).
   *
   * Com `RenderMode.Prerender` (config anterior, cobria `'**'`), o
   * `authGuard` rodava em build-time sem nenhum token real, sempre via
   * `router.parseUrl('/login')` — e esse redirect ficava GRAVADO no HTML
   * estático de cada rota (`dist/.../platform/<rota>/index.html` continha o
   * conteúdo do /login, não da rota). Todo usuário, mesmo com sessão válida,
   * recebia esse HTML errado, e só corrigia após o Router do client
   * re-navegar depois da hydration — daí o redirect indevido e o flash de
   * /login em F5/acesso direto.
   *
   * `RenderMode.Client` pula guard e SSR pra essas rotas: o servidor manda
   * só o app-shell, e o `authGuard` roda 1x, no browser, já com acesso real
   * ao refresh token e à renovação de sessão feita no `provideAppInitializer`
   * de `app.config.ts`.
   */
  {
    path: 'platform/**',
    renderMode: RenderMode.Client,
  },
  {
    path: '**',
    renderMode: RenderMode.Prerender,
  },
];
