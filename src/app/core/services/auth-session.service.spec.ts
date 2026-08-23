import { TestBed } from '@angular/core/testing';
import { AuthSession } from './auth-session.service';
import { AuthUser } from '@core/auth/auth.model';

const USER: AuthUser = {
  id: 1,
  name: 'Maria da Silva',
  email: 'maria@exemplo.com',
  role: 'ADMINISTRADOR',
  created_at: '2026-08-22T14:30:00.000000Z',
};

describe('AuthSession', () => {
  let session: AuthSession;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    session = TestBed.inject(AuthSession);
  });

  it('começa deslogado', () => {
    expect(session.user()).toBeNull();
    expect(session.isAuthenticated()).toBe(false);
    expect(session.userId()).toBeNull();
  });

  it('setCurrent guarda o usuário vindo da API', () => {
    session.setCurrent(USER);
    expect(session.user()).toEqual(USER);
    expect(session.isAuthenticated()).toBe(true);
    expect(session.userId()).toBe(1);
  });

  it('patch atualiza só os campos cosméticos locais (phone/farm)', () => {
    session.setCurrent(USER);
    session.patch({ phone: '(11) 90000-0000', farm: 'Granja Boa Vista' });
    expect(session.user()?.phone).toBe('(11) 90000-0000');
    expect(session.user()?.farm).toBe('Granja Boa Vista');
    expect(session.user()?.name).toBe(USER.name); // não mexe nos campos da API
  });

  it('patch sem usuário logado não faz nada', () => {
    session.patch({ phone: '(11) 90000-0000' });
    expect(session.user()).toBeNull();
  });

  it('overlay de phone/farm sobrevive a um novo setCurrent do mesmo e-mail (ex.: após refresh de sessão)', () => {
    session.setCurrent(USER);
    session.patch({ phone: '(11) 90000-0000' });
    session.clear();
    session.setCurrent(USER);
    expect(session.user()?.phone).toBe('(11) 90000-0000');
  });

  it('clear() desloga', () => {
    session.setCurrent(USER);
    session.clear();
    expect(session.user()).toBeNull();
    expect(session.isAuthenticated()).toBe(false);
  });
});
