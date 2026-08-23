import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../environments/environment';
import { AuthApiService } from './auth-api.service';
import { TokenStore } from './token-store.service';
import { LOCAL_STORAGE, SESSION_STORAGE } from './browser-storage';
import { AuthSession } from '@core/services/auth-session.service';
import { AuthTokenResponse } from './auth.model';

const TOKEN_RESPONSE: AuthTokenResponse = {
  user: {
    id: 1,
    name: 'Maria da Silva',
    email: 'maria@exemplo.com',
    role: 'ADMINISTRADOR',
    created_at: '2026-08-22T14:30:00.000000Z',
  },
  token_type: 'Bearer',
  access_token: '1|access-abc',
  access_token_expires_at: '2026-08-22T16:30:00.000000Z',
  refresh_token: '2|refresh-xyz',
  refresh_token_expires_at: '2026-09-21T14:30:00.000000Z',
};

describe('AuthApiService', () => {
  let service: AuthApiService;
  let httpMock: HttpTestingController;
  let tokens: TokenStore;
  let session: AuthSession;
  let localStore: Storage;
  let sessionStore: Storage;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    service = TestBed.inject(AuthApiService);
    httpMock = TestBed.inject(HttpTestingController);
    tokens = TestBed.inject(TokenStore);
    session = TestBed.inject(AuthSession);
    localStore = TestBed.inject(LOCAL_STORAGE);
    sessionStore = TestBed.inject(SESSION_STORAGE);
  });

  afterEach(() => httpMock.verify());

  it('login envia e-mail/senha, guarda os tokens e a sessão', () => {
    let result: AuthTokenResponse | undefined;
    service.login('maria@exemplo.com', 'minhasenha123', true).subscribe((res) => (result = res));

    const req = httpMock.expectOne(`${environment.apiUrl}/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'maria@exemplo.com', password: 'minhasenha123' });
    req.flush(TOKEN_RESPONSE);

    expect(result).toEqual(TOKEN_RESPONSE);
    expect(tokens.getAccessToken()).toBe('1|access-abc');
    expect(tokens.getRefreshToken()).toBe('2|refresh-xyz');
    expect(localStore.getItem('erp-refresh-token')).toBe('2|refresh-xyz'); // remember=true
    expect(session.user()?.email).toBe('maria@exemplo.com');
  });

  it('login com remember=false guarda o refresh token só na sessão da aba', () => {
    service.login('maria@exemplo.com', 'minhasenha123', false).subscribe();
    httpMock.expectOne(`${environment.apiUrl}/login`).flush(TOKEN_RESPONSE);
    expect(sessionStore.getItem('erp-refresh-token')).toBe('2|refresh-xyz');
    expect(localStore.getItem('erp-refresh-token')).toBeNull();
  });

  it('register envia name/email/password/password_confirmation e loga automaticamente', () => {
    service
      .register({
        name: 'Maria',
        email: 'maria@exemplo.com',
        password: 'minhasenha123',
        password_confirmation: 'minhasenha123',
      })
      .subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/register`);
    expect(req.request.body).toEqual({
      name: 'Maria',
      email: 'maria@exemplo.com',
      password: 'minhasenha123',
      password_confirmation: 'minhasenha123',
    });
    req.flush(TOKEN_RESPONSE);
    expect(session.isAuthenticated()).toBe(true);
  });

  it('logout chama POST /logout com o access token e limpa a sessão mesmo se a API falhar', () => {
    tokens.setAccessToken('1|access-abc');
    tokens.setRefreshToken('2|refresh-xyz', true);
    session.setCurrent(TOKEN_RESPONSE.user);

    let completed = false;
    service.logout().subscribe(() => (completed = true));

    const req = httpMock.expectOne(`${environment.apiUrl}/logout`);
    req.flush(null, { status: 401, statusText: 'Unauthorized' }); // token já expirado — não importa

    expect(completed).toBe(true);
    expect(tokens.getAccessToken()).toBeNull();
    expect(tokens.hasRefreshToken()).toBe(false);
    expect(session.user()).toBeNull();
  });

  it('forgotPassword/verifyResetCode/resetPassword chamam os endpoints certos', () => {
    service.forgotPassword('maria@exemplo.com').subscribe();
    httpMock.expectOne(`${environment.apiUrl}/password/forgot`).flush({ message: 'ok' });

    service.verifyResetCode('maria@exemplo.com', '482913').subscribe();
    const verifyReq = httpMock.expectOne(`${environment.apiUrl}/password/verify-code`);
    expect(verifyReq.request.body).toEqual({ email: 'maria@exemplo.com', code: '482913' });
    verifyReq.flush({ message: 'ok' });

    service.resetPassword('maria@exemplo.com', '482913', 'novaSenha456', 'novaSenha456').subscribe();
    const resetReq = httpMock.expectOne(`${environment.apiUrl}/password/reset`);
    expect(resetReq.request.body).toEqual({
      email: 'maria@exemplo.com',
      code: '482913',
      password: 'novaSenha456',
      password_confirmation: 'novaSenha456',
    });
    resetReq.flush({ message: 'ok' });
  });

  it('refreshSession$ envia o refresh_token como Bearer e rotaciona o par', () => {
    tokens.setRefreshToken('2|refresh-xyz', true);

    service.refreshSession$().subscribe();
    const req = httpMock.expectOne(`${environment.apiUrl}/refresh`);
    expect(req.request.headers.get('Authorization')).toBe('Bearer 2|refresh-xyz');
    expect(req.request.body).toEqual({});
    req.flush({ ...TOKEN_RESPONSE, access_token: '3|new-access', refresh_token: '4|new-refresh' });

    expect(tokens.getAccessToken()).toBe('3|new-access');
    expect(tokens.getRefreshToken()).toBe('4|new-refresh');
    expect(localStore.getItem('erp-refresh-token')).toBe('4|new-refresh'); // mantém persist=true
  });

  it('refreshSession$ compartilha a mesma chamada entre subscribers concorrentes', () => {
    tokens.setRefreshToken('2|refresh-xyz', true);

    let countA = 0;
    let countB = 0;
    service.refreshSession$().subscribe(() => countA++);
    service.refreshSession$().subscribe(() => countB++);

    const reqs = httpMock.match(`${environment.apiUrl}/refresh`);
    expect(reqs.length).toBe(1); // só 1 chamada HTTP pras 2 subscriptions
    reqs[0].flush(TOKEN_RESPONSE);

    expect(countA).toBe(1);
    expect(countB).toBe(1);
  });
});
