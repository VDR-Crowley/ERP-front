import { RenderMode } from '@angular/ssr';
import { serverRoutes } from './app.routes.server';

/**
 * Guarda de regressão pro bug de F5/acesso direto redirecionando pro
 * /login mesmo com sessão válida: com `RenderMode.Prerender` cobrindo
 * `'**'` (config antiga), `authGuard` rodava em build-time sem token real
 * e o redirect pro /login ficava gravado no HTML estático de toda rota
 * `/platform/**`. `RenderMode.Client` pula guard e SSR nessas rotas —
 * quem decide é o client, depois da hydration, com o token real.
 */
describe('serverRoutes', () => {
  it('rotas /platform/** usam RenderMode.Client (pulam guard/SSR)', () => {
    const platformRoute = serverRoutes.find((r) => r.path === 'platform/**');
    expect(platformRoute?.renderMode).toBe(RenderMode.Client);
  });

  it('demais rotas (catch-all) continuam em RenderMode.Prerender', () => {
    const catchAll = serverRoutes.find((r) => r.path === '**');
    expect(catchAll?.renderMode).toBe(RenderMode.Prerender);
  });

  it('a entrada de /platform/** vem antes do catch-all (match por ordem)', () => {
    const platformIndex = serverRoutes.findIndex((r) => r.path === 'platform/**');
    const catchAllIndex = serverRoutes.findIndex((r) => r.path === '**');
    expect(platformIndex).toBeGreaterThanOrEqual(0);
    expect(platformIndex).toBeLessThan(catchAllIndex);
  });
});
