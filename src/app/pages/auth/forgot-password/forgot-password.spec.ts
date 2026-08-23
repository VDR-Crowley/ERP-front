import { vi } from 'vitest';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { environment } from '../../../../environments/environment';

import { ForgotPassword } from './forgot-password';

describe('ForgotPassword', () => {
  let component: ForgotPassword;
  let fixture: ComponentFixture<ForgotPassword>;
  let httpMock: HttpTestingController;
  let router: Router;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ForgotPassword],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPassword);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    router = TestBed.inject(Router);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('enviarEmail chama /password/forgot e avança pro passo 2', async () => {
    component['email'] = 'maria@exemplo.com';
    const promise = component['enviarEmail']();
    httpMock.expectOne(`${environment.apiUrl}/password/forgot`).flush({ message: 'ok' });
    await promise;
    expect(component['step']()).toBe(2);
  });

  it('validarToken com código inválido mostra erro e permanece na mesma etapa', async () => {
    component['step'].set(2); // simula já ter passado da etapa 1 (e-mail enviado)
    component['email'] = 'maria@exemplo.com';
    component['token'] = '482913';
    const promise = component['validarToken']();
    httpMock
      .expectOne(`${environment.apiUrl}/password/verify-code`)
      .flush({ message: 'Código inválido ou expirado.' }, { status: 422, statusText: 'Unprocessable Entity' });
    await promise;
    expect(component['step']()).toBe(2);
    expect(component['erro']()).toBeTruthy();
  });

  it('redefinir chama /password/reset e volta pro login', async () => {
    component['email'] = 'maria@exemplo.com';
    component['token'] = '482913';
    component['novaSenha'] = 'novaSenha456';
    component['confirmarSenha'] = 'novaSenha456';
    const promise = component['redefinir']();
    httpMock.expectOne(`${environment.apiUrl}/password/reset`).flush({ message: 'ok' });
    await promise;
    expect(router.navigate).toHaveBeenCalledWith(['/login']);
  });
});
