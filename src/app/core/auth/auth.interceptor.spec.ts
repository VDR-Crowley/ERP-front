import { vi } from 'vitest';
import { TestBed } from '@angular/core/testing';
import { HttpClient, HttpContext, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Router, provideRouter } from '@angular/router';
import { environment } from '../../../environments/environment';
import { authInterceptor } from './auth.interceptor';
import { AUTH_REQUEST_KIND, AuthTokenResponse } from './auth.model';
import { TokenStore } from './token-store.service';

const TOKEN_RESPONSE: AuthTokenResponse = {
  user: { id: 1, name: 'Maria', email: 'maria@exemplo.com', role: 'ADMINISTRADOR', created_at: 'x' },
  token_type: 'Bearer',
  access_token: 'new-access',
  access_token_expires_at: 'x',
  refresh_token: 'new-refresh',
  refresh_token_expires_at: 'x',
};

describe('authInterceptor', () => {
  let http: HttpClient;
  let httpMock: HttpTestingController;
  let tokens: TokenStore;
  let router: Router;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        provideRouter([]),
      ],
    });
    http = TestBed.inject(HttpClient);
    httpMock = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStore);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
  });

  afterEach(() => httpMock.verify());

  it('injeta o Bearer access token em chamadas normais', () => {
    tokens.setAccessToken('access-1');
    http.get(`${environment.apiUrl}/user`).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/user`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer access-1');
    req.flush({});
  });

  it('não injeta token em requisições marcadas como public (login/registro/senha)', () => {
    tokens.setAccessToken('access-1');
    const context = new HttpContext().set(AUTH_REQUEST_KIND, 'public');
    http.post(`${environment.apiUrl}/login`, {}, { context }).subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/login`);
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('não mexe em requisições fora da apiUrl', () => {
    tokens.setAccessToken('access-1');
    http.get('https://outro-dominio.com/x').subscribe();
    const req = httpMock.expectOne('https://outro-dominio.com/x');
    expect(req.request.headers.has('Authorization')).toBe(false);
    req.flush({});
  });

  it('em 401 numa chamada "refresh", desloga e redireciona pro login sem tentar de novo', () => {
    tokens.setRefreshToken('refresh-1', true);
    const context = new HttpContext().set(AUTH_REQUEST_KIND, 'refresh');
    let errored = false;
    http.post(`${environment.apiUrl}/refresh`, {}, { context }).subscribe({ error: () => (errored = true) });

    httpMock.expectOne(`${environment.apiUrl}/refresh`).flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(errored).toBe(true);
    expect(tokens.hasRefreshToken()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });

  it('em 401 numa chamada default: renova o token e repete a requisição original uma vez', () => {
    tokens.setAccessToken('expired-access');
    tokens.setRefreshToken('valid-refresh', true);

    let result: unknown;
    http.get(`${environment.apiUrl}/user`).subscribe((res) => (result = res));

    httpMock.expectOne(`${environment.apiUrl}/user`).flush(null, { status: 401, statusText: 'Unauthorized' });

    const refreshReq = httpMock.expectOne(`${environment.apiUrl}/refresh`);
    refreshReq.flush(TOKEN_RESPONSE);

    const retryReq = httpMock.expectOne(`${environment.apiUrl}/user`);
    expect(retryReq.request.headers.get('Authorization')).toBe('Bearer new-access');
    retryReq.flush({ ok: true });

    expect(result).toEqual({ ok: true });
  });

  it('duas chamadas 401 concorrentes disparam só 1 refresh e repetem as duas', () => {
    tokens.setAccessToken('expired-access');
    tokens.setRefreshToken('valid-refresh', true);

    let resFoo: unknown;
    let resBar: unknown;
    http.get(`${environment.apiUrl}/foo`).subscribe((res) => (resFoo = res));
    http.get(`${environment.apiUrl}/bar`).subscribe((res) => (resBar = res));

    httpMock.expectOne(`${environment.apiUrl}/foo`).flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock.expectOne(`${environment.apiUrl}/bar`).flush(null, { status: 401, statusText: 'Unauthorized' });

    const refreshReqs = httpMock.match(`${environment.apiUrl}/refresh`);
    expect(refreshReqs.length).toBe(1); // dedup: só 1 chamada de refresh pras 2 falhas
    refreshReqs[0].flush(TOKEN_RESPONSE);

    const retryFoo = httpMock.expectOne(`${environment.apiUrl}/foo`);
    expect(retryFoo.request.headers.get('Authorization')).toBe('Bearer new-access');
    retryFoo.flush({ ok: 'foo' });

    const retryBar = httpMock.expectOne(`${environment.apiUrl}/bar`);
    expect(retryBar.request.headers.get('Authorization')).toBe('Bearer new-access');
    retryBar.flush({ ok: 'bar' });

    expect(resFoo).toEqual({ ok: 'foo' });
    expect(resBar).toEqual({ ok: 'bar' });
  });

  it('se o refresh falhar, desloga, redireciona e propaga o erro original', () => {
    tokens.setAccessToken('expired-access');
    tokens.setRefreshToken('invalid-refresh', true);

    let errored = false;
    http.get(`${environment.apiUrl}/user`).subscribe({ error: () => (errored = true) });

    httpMock.expectOne(`${environment.apiUrl}/user`).flush(null, { status: 401, statusText: 'Unauthorized' });
    httpMock
      .expectOne(`${environment.apiUrl}/refresh`)
      .flush(null, { status: 401, statusText: 'Unauthorized' });

    expect(errored).toBe(true);
    expect(tokens.hasRefreshToken()).toBe(false);
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
