import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Vendedores } from './vendedores';
import { environment } from '../../../../environments/environment';

/**
 * Reproduz o bug relatado em produção: coluna "Ações" (editar/excluir) na
 * tela Vendedores parece não salvar.
 */
describe('Vendedores — criar, editar e excluir (bug reportado em produção)', () => {
  let component: Vendedores;
  let fixture: ComponentFixture<Vendedores>;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/vendedores`;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [Vendedores],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(Vendedores);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    httpMock
      .expectOne(base)
      .flush([{ id: 1, name: 'Karol', contact: '(11) 99999-0000', active: true }]);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('cria um vendedor novo (com o checkbox Ativo) e ele aparece na lista', async () => {
    component['openNew']();
    component['draft']['name'] = 'Bruno';
    component['draft']['contact'] = '(11) 98888-1111';
    component['draft']['active'] = true;
    const promise = component['saveForm']();

    const req = httpMock.expectOne(base);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ name: 'Bruno', contact: '(11) 98888-1111', active: true });
    req.flush({ id: 2, name: 'Bruno', contact: '(11) 98888-1111', active: true });
    await promise;

    const created = component['rows']().find((v) => v.name === 'Bruno');
    expect(created).toBeTruthy();
    expect(created!.active).toBe(true);
  });

  it('edita nome/contato/ativo de um vendedor existente e persiste', async () => {
    const target = component['rows']().find((v) => v.id === '1')!;
    component['openEdit'](target);
    component['draft']['name'] = 'Karol Editada';
    component['draft']['active'] = false;
    const promise = component['saveForm']();

    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('PUT');
    req.flush({ id: 1, name: 'Karol Editada', contact: '(11) 99999-0000', active: false });
    await promise;

    const updated = component['rows']().find((v) => v.id === '1')!;
    expect(updated.name).toBe('Karol Editada');
    expect(updated.active).toBe(false);
  });

  it('exclui um vendedor existente (fluxo askDelete -> confirmDelete)', async () => {
    const target = component['rows']().find((v) => v.id === '1')!;
    component['askDelete'](target);
    expect(component['deleteTarget']()).toEqual(target);

    const promise = component['confirmDelete']();
    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.method).toBe('DELETE');
    req.flush(null, { status: 204, statusText: 'No Content' });
    await promise;

    expect(component['rows']().find((v) => v.id === '1')).toBeUndefined();
  });

  it('clicando de verdade no botão Editar (coluna Ações) abre o modal com o vendedor certo', () => {
    fixture.detectChanges();

    const editBtn = fixture.debugElement.query(By.css('button[title="Editar"]'));
    expect(editBtn, 'botão Editar não encontrado na tabela renderizada').toBeTruthy();
    editBtn.nativeElement.click();
    fixture.detectChanges();

    expect(component['formOpen']()).toBe(true);
    expect(component['draft']['name']).toBe('Karol');

    const modalTitle = fixture.debugElement.query(By.css('.modal__title'));
    expect(modalTitle.nativeElement.textContent).toContain('Editar vendedor');
  });

  it('clicando de verdade no botão Salvar do modal (aberto via clique em Editar) persiste a alteração', async () => {
    fixture.detectChanges();
    fixture.debugElement.query(By.css('button[title="Editar"]')).nativeElement.click();
    fixture.detectChanges();

    component['draft']['name'] = 'Karol via clique';

    const saveBtn = fixture.debugElement.query(By.css('.modal__actions .btn--primary'));
    expect(saveBtn, 'botão Salvar não encontrado no modal renderizado').toBeTruthy();
    saveBtn.nativeElement.click();

    const req = httpMock.expectOne(`${base}/1`);
    expect(req.request.body).toEqual({ name: 'Karol via clique', contact: '(11) 99999-0000', active: true });
    req.flush({ id: 1, name: 'Karol via clique', contact: '(11) 99999-0000', active: true });
    await fixture.whenStable();
  });

  it('clicando de verdade no botão Excluir (coluna Ações) abre a confirmação', () => {
    fixture.detectChanges();

    const delBtn = fixture.debugElement.query(By.css('button[title="Excluir"]'));
    expect(delBtn, 'botão Excluir não encontrado na tabela renderizada').toBeTruthy();
    delBtn.nativeElement.click();
    fixture.detectChanges();

    expect(component['deleteTarget']()?.id).toBe('1');
  });
});
