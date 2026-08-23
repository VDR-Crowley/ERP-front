import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthSession } from '@core/services/auth-session.service';

import { Settings } from './settings';

describe('Settings', () => {
  let component: Settings;
  let fixture: ComponentFixture<Settings>;
  let session: AuthSession;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Settings],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    session = TestBed.inject(AuthSession);
    session.setCurrent({
      id: 1,
      name: 'Maria',
      email: 'maria@exemplo.com',
      role: 'ADMINISTRADOR',
      created_at: 'x',
    });

    fixture = TestBed.createComponent(Settings);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('should create e carrega os campos do usuário logado', () => {
    expect(component).toBeTruthy();
    expect(component['nome']).toBe('Maria');
    expect(component['email']).toBe('maria@exemplo.com');
  });

  it('salvar() faz patch só dos campos locais (phone/farm) via AuthSession', () => {
    component['telefone'] = '(11) 90000-0000';
    component['granja'] = 'Granja Boa Vista';
    component['salvar']();
    expect(session.user()?.phone).toBe('(11) 90000-0000');
    expect(session.user()?.farm).toBe('Granja Boa Vista');
  });
});
