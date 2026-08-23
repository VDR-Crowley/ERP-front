import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';

import { Register } from './register';

describe('Register', () => {
  let component: Register;
  let fixture: ComponentFixture<Register>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Register],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Register);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create', () => {
    expect(component).toBeTruthy();
  });

  it('formValido exige nome, e-mail e senhas coincidentes com 6+ caracteres', () => {
    component['nome'] = 'Maria';
    component['email'] = 'maria@exemplo.com';
    component['senha'] = '123456';
    component['confirmarSenha'] = '123456';
    expect(component['formValido']()).toBe(true);

    component['confirmarSenha'] = '000000';
    expect(component['formValido']()).toBe(false);
  });
});
