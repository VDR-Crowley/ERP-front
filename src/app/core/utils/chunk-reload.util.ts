import { inject, PLATFORM_ID } from '@angular/core';
import { isPlatformBrowser } from '@angular/common';
import { NavigationError, Router } from '@angular/router';

/**
 * Após um novo deploy, os chunks JS hashados antigos deixam de existir no
 * servidor. Uma aba aberta antes do deploy que tenta navegar (lazy route)
 * pede o chunk antigo, recebe 404/index.html, e o Router trava em
 * `NavigationError` — o usuário fica preso na página atual sem entender por quê.
 *
 * Detecta esse padrão (via `NavigationError` do Router e via rejeição de
 * `import()` dinâmico não capturada) e força um reload completo da página,
 * que busca o `index.html` + chunks atuais e resolve o problema. Um guard em
 * `sessionStorage` evita loop infinito de reload caso o erro persista.
 */
const RELOAD_GUARD_KEY = 'chunk-reload-attempted';

const CHUNK_ERROR_PATTERN =
  /ChunkLoadError|Failed to fetch dynamically imported module|Loading chunk .* failed|Importing a module script failed/i;

function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return CHUNK_ERROR_PATTERN.test(message);
}

function reloadOnce(): void {
  if (sessionStorage.getItem(RELOAD_GUARD_KEY)) {
    // Já tentamos recarregar nesta sessão e o erro persiste — não insistir
    // (evita loop infinito de reload).
    return;
  }
  sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
  window.location.reload();
}

export function initChunkErrorReload(): void {
  if (!isPlatformBrowser(inject(PLATFORM_ID))) {
    // No servidor (SSR) não há sessionStorage/window nem chunks lazy pra falhar.
    return;
  }

  const router = inject(Router);

  router.events.subscribe((event) => {
    if (event instanceof NavigationError && isChunkLoadError(event.error)) {
      reloadOnce();
    }
  });

  window.addEventListener('unhandledrejection', (event) => {
    if (isChunkLoadError(event.reason)) {
      reloadOnce();
    }
  });
}
