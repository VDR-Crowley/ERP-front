import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ControleRacao } from './controle-racao';
import { environment } from '../../../../environments/environment';

/**
 * "Kg em estoque" deve se auto-calcular (Sacos em estoque × Peso do saco) no
 * form de edição, seguindo o mesmo padrão `compute` já usado em
 * `expenses.ts` (quantidade × valor unitário = valor total) — o campo fica
 * somente leitura enquanto as dependências estiverem preenchidas.
 */
describe('ControleRacao — Kg em estoque calculado automaticamente', () => {
  let component: ControleRacao;
  let fixture: ComponentFixture<ControleRacao>;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/feed-stocks`;
  const logsBase = `${environment.apiUrl}/feed-open-logs`;

  const FEED_API = {
    id: 1,
    type: 'Ração inicial',
    bags_in_stock: 5,
    kg_in_stock: '100.00',
    last_bag_weight_kg: '20.00',
    expiration_date: '2026-12-31',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ControleRacao],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(ControleRacao);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);

    httpMock.expectOne(base).flush([FEED_API]);
    httpMock.expectOne(logsBase).flush([]);
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('calcula kgInStock a partir de bagsInStock × lastBagWeightKg no campo de edição', () => {
    const kgField = component['editFields'].find((f) => f.key === 'kgInStock');
    expect(kgField?.compute?.({ bagsInStock: 5, lastBagWeightKg: '20' })).toBe(100);
  });

  it('recalcula quando o peso do saco muda', () => {
    const kgField = component['editFields'].find((f) => f.key === 'kgInStock');
    expect(kgField?.compute?.({ bagsInStock: 5, lastBagWeightKg: '40' })).toBe(200);
  });

  /**
   * `[name]="field.key"` no `crud-form-modal.html` é consumido pela diretiva
   * `NgModel` (registro do form) e não vaza pro atributo DOM — por isso os
   * campos aqui são localizados pela ordem de renderização (mesma ordem de
   * `editFields`: Tipo, Sacos em estoque, Kg em estoque, [select] Peso do
   * saco, Validade), não por seletor `[name=...]`.
   */
  function editControls(): HTMLElement[] {
    return fixture.debugElement
      .queryAll(By.css('.crud-form .field input, .crud-form .field select'))
      .map((de) => de.nativeElement as HTMLElement);
  }

  it('preenche automaticamente o campo Kg em estoque na tela ao mudar Sacos em estoque', () => {
    const item = component['rows']()[0];
    component['openEdit'](item);
    fixture.detectChanges();

    const bagsInput = editControls()[1] as HTMLInputElement;
    bagsInput.value = '10';
    bagsInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    expect(component['editDraft']['kgInStock']).toBe(200);
    const kgInput = editControls()[2] as HTMLInputElement;
    expect(kgInput.readOnly).toBe(true);
  });

  it('envia o kgInStock recalculado ao salvar a edição', async () => {
    const item = component['rows']()[0];
    component['openEdit'](item);
    fixture.detectChanges();

    const bagsInput = editControls()[1] as HTMLInputElement;
    bagsInput.value = '10';
    bagsInput.dispatchEvent(new Event('input'));
    fixture.detectChanges();

    const promise = component['saveEdit']();
    const putReq = httpMock.expectOne(`${base}/1`);
    expect(putReq.request.body.kg_in_stock).toBe(200);
    putReq.flush({ ...FEED_API, bags_in_stock: 10, kg_in_stock: '200.00' });
    await promise;
  });
});
