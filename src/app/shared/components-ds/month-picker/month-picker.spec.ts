import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { providePrimeNG } from 'primeng/config';

import { MonthPicker } from './month-picker';

describe('MonthPicker', () => {
  let fixture: ComponentFixture<MonthPicker>;
  let component: MonthPicker;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonthPicker],
      providers: [
        // Mesma tradução de `app.config.ts` — sem isso o PrimeNG usa o
        // `monthNamesShort` default em inglês ("Aug" em vez de "ago").
        providePrimeNG({
          translation: {
            today: 'Hoje',
            clear: 'Limpar',
            monthNamesShort: [
              'jan', 'fev', 'mar', 'abr', 'mai', 'jun',
              'jul', 'ago', 'set', 'out', 'nov', 'dez',
            ],
          },
        }),
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(MonthPicker);
    component = fixture.componentInstance;
  });

  function inputEl(): HTMLInputElement {
    return fixture.debugElement.query(By.css('input')).nativeElement as HTMLInputElement;
  }

  it('mostra só o mês formatado ("M") quando `value` é definido', async () => {
    fixture.componentRef.setInput('value', new Date(2026, 7, 15)); // agosto
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // PrimeNG formata via `monthNamesShort` ("ago"); a capitalização pra
    // "Ago" fica por conta do CSS (`text-transform: capitalize`), não
    // verificável em jsdom sem stylesheet computado — então checa o valor
    // cru do input.
    expect(inputEl().value).toBe('ago');
  });

  it('mostra o placeholder curto ("Mês") quando `value` é `null` — cabe no botão compacto', () => {
    fixture.componentRef.setInput('value', null);
    fixture.detectChanges();

    expect(inputEl().placeholder).toBe('Mês');
  });

  it('aria-label continua descritivo ("Selecionar mês") mesmo com o placeholder curto', () => {
    fixture.componentRef.setInput('value', null);
    fixture.detectChanges();

    // `[attr.aria-label]` fica na tag `<p-datepicker>` (não no `<input>`
    // interno) — mesmo binding de antes, só confirmando que o texto
    // completo não encolheu junto com o `placeholder` visível.
    const pDatepicker = fixture.debugElement.query(By.css('p-datepicker')).nativeElement as HTMLElement;
    expect(pDatepicker.getAttribute('aria-label')).toBe('Selecionar mês');
  });

  it('emite `valueChange` quando um mês é selecionado', () => {
    const emitted: (Date | null)[] = [];
    component.valueChange.subscribe((v) => emitted.push(v));
    fixture.detectChanges();

    const selected = new Date(2026, 8, 1);
    (component as unknown as { onModelChange(v: Date | null): void }).onModelChange(selected);

    expect(emitted).toEqual([selected]);
  });

  it('emite `null` quando o popup é limpo ("Limpar")', () => {
    const emitted: (Date | null)[] = [];
    component.valueChange.subscribe((v) => emitted.push(v));
    fixture.detectChanges();

    (component as unknown as { onModelChange(v: Date | null): void }).onModelChange(null);

    expect(emitted).toEqual([null]);
  });
});
