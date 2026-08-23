import { PLATFORM_ID } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { vi } from 'vitest';
import { authGuard } from './auth.guard';
import { TokenStore } from './token-store.service';

describe('authGuard', () => {
  let tokens: TokenStore;
  let router: Router;

  function configure(platformId: 'browser' | 'server' = 'browser') {
    TestBed.configureTestingModule({
      providers: [provideRouter([]), { provide: PLATFORM_ID, useValue: platformId }],
    });
    tokens = TestBed.inject(TokenStore);
    router = TestBed.inject(Router);
  }

  function run() {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/platform/dashboard' } as never),
    );
  }

  describe('no browser', () => {
    beforeEach(() => configure('browser'));

    it('libera quando há refresh token', () => {
      tokens.setRefreshToken('refresh-1', true);
      expect(run()).toBe(true);
    });

    it('redireciona pro login quando não há sessão', () => {
      const result = run();
      expect(result).toEqual(router.parseUrl('/login'));
    });
  });

  describe('no servidor (SSR/prerender)', () => {
    beforeEach(() => configure('server'));

    it('libera sem decidir "sem sessão" — não há storage real pra checar', () => {
      // Sem refresh token nenhum (TokenStore cairia em MemoryStorage vazio
      // num servidor de verdade) — mesmo assim o guard não deve redirecionar:
      // quem decide é o client, depois da hydration.
      expect(run()).toBe(true);
    });

    it('libera mesmo com refresh token presente (não muda o resultado)', () => {
      tokens.setRefreshToken('refresh-1', true);
      expect(run()).toBe(true);
    });

    it('não lança erro e não acessa Router', () => {
      const spy = vi.spyOn(router, 'parseUrl');
      expect(() => run()).not.toThrow();
      expect(spy).not.toHaveBeenCalled();
    });
  });
});
