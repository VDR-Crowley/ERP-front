import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { provideRouter } from '@angular/router';
import { Vendedores } from './vendedores';
import { IndexedDbService } from '@core/idb/idb.service';
import { Vendedor } from '@core/interfaces/vendedor.interface';
import { WithId } from '@core/idb/entity-store';

/**
 * Reproduz o bug relatado em produção: coluna "Ações" (editar/excluir) na
 * tela Vendedores parece não salvar.
 */
describe('Vendedores — criar, editar e excluir (bug reportado em produção)', () => {
  let component: Vendedores;
  let fixture: ComponentFixture<Vendedores>;
  let saved: Record<string, unknown>[];
  let removed: string[];
  let vendedoresInIdb: WithId<Vendedor>[];

  beforeEach(async () => {
    saved = [];
    removed = [];
    vendedoresInIdb = [
      { id: 'v1', name: 'Karol', contact: '(11) 99999-0000', active: true },
    ];

    const fakeIdb = {
      getAll: (storeName: string) => of(storeName === 'vendedores' ? vendedoresInIdb : []),
      save: (_storeName: string, id: string, data: unknown) => {
        saved.push({ id, ...(data as object) });
        return of(undefined);
      },
      delete: (_storeName: string, id: string) => {
        removed.push(id);
        return of(undefined);
      },
    } as unknown as IndexedDbService;

    await TestBed.configureTestingModule({
      imports: [Vendedores],
      providers: [provideRouter([]), { provide: IndexedDbService, useValue: fakeIdb }],
    }).compileComponents();

    fixture = TestBed.createComponent(Vendedores);
    component = fixture.componentInstance;
    await fixture.whenStable();
  });

  it('cria um vendedor novo (com o checkbox Ativo) e ele aparece na lista', async () => {
    component['openNew']();
    component['draft']['name'] = 'Bruno';
    component['draft']['contact'] = '(11) 98888-1111';
    component['draft']['active'] = true;
    await component['saveForm']();

    const created = component['rows']().find((v) => v.name === 'Bruno');
    expect(created).toBeTruthy();
    expect(created!.active).toBe(true);
  });

  it('edita nome/contato/ativo de um vendedor existente e persiste', async () => {
    const target = component['rows']().find((v) => v.id === 'v1')!;
    component['openEdit'](target);
    component['draft']['name'] = 'Karol Editada';
    component['draft']['active'] = false;
    await component['saveForm']();

    const updated = component['rows']().find((v) => v.id === 'v1')!;
    expect(updated.name).toBe('Karol Editada');
    expect(updated.active).toBe(false);
  });

  it('exclui um vendedor existente (fluxo askDelete -> confirmDelete)', async () => {
    const target = component['rows']().find((v) => v.id === 'v1')!;
    component['askDelete'](target);
    expect(component['deleteTarget']()).toEqual(target);

    await component['confirmDelete']();

    expect(component['rows']().find((v) => v.id === 'v1')).toBeUndefined();
    expect(removed).toContain('v1');
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
    await fixture.whenStable();

    expect(saved.some((s) => s['name'] === 'Karol via clique')).toBe(true);
  });

  it('clicando de verdade no botão Excluir (coluna Ações) abre a confirmação', () => {
    fixture.detectChanges();

    const delBtn = fixture.debugElement.query(By.css('button[title="Excluir"]'));
    expect(delBtn, 'botão Excluir não encontrado na tabela renderizada').toBeTruthy();
    delBtn.nativeElement.click();
    fixture.detectChanges();

    expect(component['deleteTarget']()?.id).toBe('v1');
  });
});
