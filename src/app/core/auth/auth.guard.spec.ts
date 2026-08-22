import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { authGuard } from './auth.guard';
import { TokenStore } from './token-store.service';

describe('authGuard', () => {
  let tokens: TokenStore;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    tokens = TestBed.inject(TokenStore);
    router = TestBed.inject(Router);
  });

  function run() {
    return TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/platform/dashboard' } as never),
    );
  }

  it('libera quando há refresh token', () => {
    tokens.setRefreshToken('refresh-1', true);
    expect(run()).toBe(true);
  });

  it('redireciona pro login quando não há sessão', () => {
    const result = run();
    expect(result).toEqual(router.parseUrl('/login'));
  });
});
