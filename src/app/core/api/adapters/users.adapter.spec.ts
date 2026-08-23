import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { createUsersStore } from './users.adapter';
import { environment } from '../../../../environments/environment';

describe('createUsersStore', () => {
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/users`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('carrega a lista mapeando snake_case -> camelCase (is_active -> isActive)', () => {
    const store = TestBed.runInInjectionContext(() => createUsersStore());
    httpMock.expectOne(base).flush([
      {
        id: 1,
        name: 'Maria',
        email: 'maria@exemplo.com',
        role: 'ADMINISTRADOR',
        is_active: true,
        created_at: '2026-08-23T00:00:00.000000Z',
      },
    ]);

    expect(store.items()).toEqual([{ id: '1', name: 'Maria', email: 'maria@exemplo.com', isActive: true }]);
  });

  it('add() envia name/email/password/password_confirmation (sem role e sem is_active)', async () => {
    const store = TestBed.runInInjectionContext(() => createUsersStore());
    httpMock.expectOne(base).flush([]);

    const promise = store.add({
      name: 'Novo',
      email: 'novo@exemplo.com',
      isActive: true,
      password: 'segredo6',
      passwordConfirmation: 'segredo6',
    });
    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Novo',
      email: 'novo@exemplo.com',
      password: 'segredo6',
      password_confirmation: 'segredo6',
    });
    req.flush({
      id: 9,
      name: 'Novo',
      email: 'novo@exemplo.com',
      role: 'ADMINISTRADOR',
      is_active: true,
      created_at: '2026-08-23T00:00:00.000000Z',
    });
    await promise;

    expect(store.items()).toEqual([{ id: '9', name: 'Novo', email: 'novo@exemplo.com', isActive: true }]);
  });

  it('update() sem senha não envia password/password_confirmation', async () => {
    const store = TestBed.runInInjectionContext(() => createUsersStore());
    httpMock.expectOne(base).flush([
      {
        id: 1,
        name: 'Maria',
        email: 'maria@exemplo.com',
        role: 'ADMINISTRADOR',
        is_active: true,
        created_at: '2026-08-23T00:00:00.000000Z',
      },
    ]);

    const promise = store.update('1', { name: 'Maria Editada', email: 'maria@exemplo.com', isActive: true });
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('PUT');
    expect(req.request.body).toEqual({ name: 'Maria Editada', email: 'maria@exemplo.com', is_active: true });
    req.flush({
      id: 1,
      name: 'Maria Editada',
      email: 'maria@exemplo.com',
      role: 'ADMINISTRADOR',
      is_active: true,
      created_at: '2026-08-23T00:00:00.000000Z',
    });
    await promise;
  });

  it('update() com senha envia password/password_confirmation', async () => {
    const store = TestBed.runInInjectionContext(() => createUsersStore());
    httpMock.expectOne(base).flush([
      {
        id: 1,
        name: 'Maria',
        email: 'maria@exemplo.com',
        role: 'ADMINISTRADOR',
        is_active: true,
        created_at: '2026-08-23T00:00:00.000000Z',
      },
    ]);

    const promise = store.update('1', {
      name: 'Maria',
      email: 'maria@exemplo.com',
      isActive: true,
      password: 'nova-senha6',
      passwordConfirmation: 'nova-senha6',
    });
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.body).toEqual({
      name: 'Maria',
      email: 'maria@exemplo.com',
      is_active: true,
      password: 'nova-senha6',
      password_confirmation: 'nova-senha6',
    });
    req.flush({
      id: 1,
      name: 'Maria',
      email: 'maria@exemplo.com',
      role: 'ADMINISTRADOR',
      is_active: true,
      created_at: '2026-08-23T00:00:00.000000Z',
    });
    await promise;
  });

  it('remove() chama DELETE /users/{id} (desativação no backend) e tira o item da lista', async () => {
    const store = TestBed.runInInjectionContext(() => createUsersStore());
    httpMock.expectOne(base).flush([
      {
        id: 1,
        name: 'Maria',
        email: 'maria@exemplo.com',
        role: 'ADMINISTRADOR',
        is_active: true,
        created_at: '2026-08-23T00:00:00.000000Z',
      },
    ]);

    const promise = store.remove('1');
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;

    expect(store.items()).toEqual([]);
  });
});
