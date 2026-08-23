import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AuthSession } from '@core/services/auth-session.service';
import { Users } from './users';
import { environment } from '../../../../environments/environment';

describe('Users — administração de usuários (API real, não IndexedDB)', () => {
  let component: Users;
  let fixture: ComponentFixture<Users>;
  let httpMock: HttpTestingController;
  let session: AuthSession;
  const base = `${environment.apiUrl}/users`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Users],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    session = TestBed.inject(AuthSession);
    session.setCurrent({ id: 1, name: 'Admin Logado', email: 'admin@exemplo.com', role: 'ADMINISTRADOR', created_at: 'x' });

    fixture = TestBed.createComponent(Users);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    httpMock.expectOne(base).flush([
      { id: 1, name: 'Admin Logado', email: 'admin@exemplo.com', role: 'ADMINISTRADOR', is_active: true, created_at: 'x' },
      { id: 2, name: 'Outro Usuário', email: 'outro@exemplo.com', role: 'ADMINISTRADOR', is_active: true, created_at: 'x' },
    ]);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('cria um usuário novo via POST /users (não /register)', async () => {
    component['openNew']();
    component['draft']['name'] = 'Novo';
    component['draft']['email'] = 'novo@exemplo.com';
    component['draft']['password'] = 'segredo6';
    component['draft']['passwordConfirmation'] = 'segredo6';
    const promise = component['saveForm']();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      name: 'Novo',
      email: 'novo@exemplo.com',
      password: 'segredo6',
      password_confirmation: 'segredo6',
    });
    req.flush({ id: 3, name: 'Novo', email: 'novo@exemplo.com', role: 'ADMINISTRADOR', is_active: true, created_at: 'x' });
    await promise;

    expect(component['formOpen']()).toBe(false);
    expect(component['rows']().some((u) => u.email === 'novo@exemplo.com')).toBe(true);
  });

  it('edita nome/e-mail sem tocar senha quando o campo fica em branco', async () => {
    const target = component['rows']().find((u) => u.id === '2')!;
    component['openEdit'](target);
    component['draft']['name'] = 'Outro Editado';
    const promise = component['saveForm']();

    const req = httpMock.expectOne(`${base}/2`);
    expect(req.request.body).toEqual({ name: 'Outro Editado', email: 'outro@exemplo.com', is_active: true });
    req.flush({ id: 2, name: 'Outro Editado', email: 'outro@exemplo.com', role: 'ADMINISTRADOR', is_active: true, created_at: 'x' });
    await promise;

    expect(component['rows']().find((u) => u.id === '2')?.name).toBe('Outro Editado');
  });

  it('exibe os erros de validação (422) no modal em vez de fechar', async () => {
    component['openNew']();
    component['draft']['name'] = 'Novo';
    component['draft']['email'] = 'ja-existe@exemplo.com';
    component['draft']['password'] = 'segredo6';
    component['draft']['passwordConfirmation'] = 'segredo6';
    const promise = component['saveForm']();

    const req = httpMock.expectOne(base);
    req.flush(
      { message: 'The email has already been taken.', errors: { email: ['The email has already been taken.'] } },
      { status: 422, statusText: 'Unprocessable Content' },
    );
    await promise;

    expect(component['formOpen']()).toBe(true);
    expect(component['formErrors']()).toEqual(['The email has already been taken.']);
  });

  it('desativa um usuário via DELETE /users/{id} (askDelete -> confirmDelete) e ele some da lista', async () => {
    const target = component['rows']().find((u) => u.id === '2')!;
    component['askDelete'](target);
    expect(component['deleteTarget']()).toEqual(target);

    const promise = component['confirmDelete']();
    const req = httpMock.expectOne(`${base}/2`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;

    expect(component['rows']().find((u) => u.id === '2')).toBeUndefined();
  });

  it('não permite pedir a desativação da própria conta (askDelete é no-op)', () => {
    const self = component['rows']().find((u) => u.id === '1')!;
    component['askDelete'](self);
    expect(component['deleteTarget']()).toBeNull();
  });

  it('desabilita o botão Excluir na própria linha (coluna Ações)', () => {
    fixture.detectChanges();

    const rows = fixture.debugElement.queryAll(By.css('.tbl tbody tr'));
    const selfRow = rows.find((r) => r.nativeElement.textContent.includes('admin@exemplo.com'));
    const deleteBtn = selfRow!.query(By.css('button.btn--danger'));
    expect(deleteBtn.nativeElement.disabled).toBe(true);
  });
});
