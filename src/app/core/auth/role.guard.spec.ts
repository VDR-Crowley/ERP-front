import { TestBed } from '@angular/core/testing';
import { Router, UrlTree, provideRouter } from '@angular/router';
import { roleGuard } from './role.guard';
import { AuthSession } from '@core/services/auth-session.service';
import { AuthUser } from './auth.model';

describe('roleGuard', () => {
  let session: AuthSession;
  let router: Router;

  const user = (role: string): AuthUser =>
    ({ id: 1, name: 'U', email: 'u@x.com', role, created_at: '' }) as AuthUser;

  function run(path: string) {
    return TestBed.runInInjectionContext(() =>
      roleGuard({ routeConfig: { path } } as never, [] as never),
    );
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    session = TestBed.inject(AuthSession);
    router = TestBed.inject(Router);
  });

  it('admin acessa a tela de consumo do Railway', () => {
    session.setCurrent(user('ADMINISTRADOR'));
    expect(run('consumo-railway')).toBe(true);
  });

  it('VENDEDOR é redirecionado pra Vendas ao tentar o consumo do Railway', () => {
    session.setCurrent(user('VENDEDOR'));
    const result = run('consumo-railway') as UrlTree;
    expect(router.serializeUrl(result)).toBe('/platform/sales');
  });

  it('sem sessão carregada, tela exclusiva de admin vai pro Dashboard', () => {
    const result = run('consumo-railway') as UrlTree;
    expect(router.serializeUrl(result)).toBe('/platform/dashboard');
  });

  it('VENDEDOR continua acessando Vendas e CRM', () => {
    session.setCurrent(user('VENDEDOR'));
    expect(run('sales')).toBe(true);
    expect(run('crm')).toBe(true);
  });

  it('telas comuns seguem livres para admin', () => {
    session.setCurrent(user('ADMINISTRADOR'));
    expect(run('dashboard')).toBe(true);
  });
});
