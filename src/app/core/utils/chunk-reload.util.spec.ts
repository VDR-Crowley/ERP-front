import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { PLATFORM_ID } from '@angular/core';
import { NavigationError, Router } from '@angular/router';
import { Subject } from 'rxjs';
import { initChunkErrorReload } from './chunk-reload.util';

/**
 * Regressão: 2026-08-24, chunk-load falho (deploy invalidou hash antigo) travava
 * a navegação com "Failed to fetch dynamically imported module" e o usuário
 * ficava preso, sem reload automático. Ver também o 404 real pra assets em
 * src/server.ts (mesmo incidente, lado servidor).
 */
describe('initChunkErrorReload', () => {
  const RELOAD_GUARD_KEY = 'chunk-reload-attempted';
  let events$: Subject<unknown>;
  let reloadSpy: ReturnType<typeof vi.fn>;

  function setup() {
    events$ = new Subject();
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'browser' },
        { provide: Router, useValue: { events: events$.asObservable() } },
      ],
    });
    TestBed.runInInjectionContext(() => initChunkErrorReload());
  }

  beforeEach(() => {
    sessionStorage.clear();
    reloadSpy = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: reloadSpy });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('recarrega a página numa NavigationError de chunk-load', () => {
    setup();

    events$.next(
      new NavigationError(1, '/platform/algo', new Error(
        'Failed to fetch dynamically imported module: https://x/chunk-ABC.js',
      )),
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem(RELOAD_GUARD_KEY)).toBe('1');
  });

  it('ignora NavigationError que não é de chunk-load', () => {
    setup();

    events$.next(new NavigationError(1, '/platform/algo', new Error('Guard negou acesso')));

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('não recarrega de novo se já tentou nesta sessão (guard anti-loop)', () => {
    sessionStorage.setItem(RELOAD_GUARD_KEY, '1');
    setup();

    events$.next(
      new NavigationError(1, '/platform/algo', new Error('ChunkLoadError: Loading chunk 5 failed')),
    );

    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it('recarrega numa rejeição de import() dinâmico não tratada pelo Router', () => {
    setup();

    window.dispatchEvent(
      Object.assign(new Event('unhandledrejection'), {
        reason: new Error('Failed to fetch dynamically imported module: https://x/chunk-XYZ.js'),
      }),
    );

    expect(reloadSpy).toHaveBeenCalledTimes(1);
  });

  it('não faz nada no servidor (SSR, sem window/sessionStorage)', () => {
    TestBed.configureTestingModule({
      providers: [
        { provide: PLATFORM_ID, useValue: 'server' },
        { provide: Router, useValue: { events: new Subject().asObservable() } },
      ],
    });

    expect(() => TestBed.runInInjectionContext(() => initChunkErrorReload())).not.toThrow();
  });
});
