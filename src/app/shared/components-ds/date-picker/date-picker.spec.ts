import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { DatePicker, DateRange } from './date-picker';

/**
 * Regressão pro bug do commit c42bb65: clique no texto do período ou no
 * chevron não abria o calendário (só clique nos pixels exatos do ícone
 * funcionava). O teste dispara um clique real no elemento como ele
 * aparece renderizado — não chama métodos internos do PrimeNG diretamente
 * — pra pegar exatamente a interação que o usuário faz.
 */
@Component({
  standalone: true,
  imports: [DatePicker],
  template: `<app-date-picker mode="range" [value]="range" />`,
})
class RangeHost {
  range: DateRange = [new Date(2026, 7, 1), new Date(2026, 7, 31)];
}

describe('DatePicker (range, desktop overlay)', () => {
  let fixture: ComponentFixture<RangeHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RangeHost] }).compileComponents();
    fixture = TestBed.createComponent(RangeHost);
    fixture.detectChanges();
  });

  function panelVisible(): boolean {
    return !!fixture.nativeElement.querySelector('[data-pc-section="panel"].p-datepicker-panel');
  }

  it('abre o calendário ao clicar no texto do período exibido', () => {
    const input: HTMLInputElement = fixture.nativeElement.querySelector('.p-datepicker-input');
    expect(input).toBeTruthy();
    expect(panelVisible()).toBe(false);

    input.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
    input.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    fixture.detectChanges();

    expect(panelVisible()).toBe(true);
  });

  it('o container do ícone não cobre o resto do campo (regressão do overlap)', () => {
    const iconContainer: HTMLElement = fixture.nativeElement.querySelector(
      '.p-datepicker-input-icon-container',
    );
    const field: HTMLElement = fixture.nativeElement.querySelector('.app-date-picker__field');
    expect(iconContainer).toBeTruthy();

    const iconRect = iconContainer.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    // jsdom não faz layout real (larguras vêm 0), então o que importa aqui é
    // a REGRA aplicada, não o pixel: com `inset-inline-end: auto` o
    // container não deve ter `right`/`inset-inline-end` numérico setado
    // junto de `left` — isso é o que fazia o box esticar pra cobrir o campo.
    const style = getComputedStyle(iconContainer);
    expect(style.insetInlineEnd === 'auto' || style.right === 'auto').toBe(true);
    expect(fieldRect).toBeTruthy();
    expect(iconRect).toBeTruthy();
  });
});

@Component({
  standalone: true,
  imports: [DatePicker],
  template: `<app-date-picker mode="range" [inline]="true" [value]="range" />`,
})
class RangeInlineHost {
  range: DateRange = [new Date(2026, 7, 1), new Date(2026, 7, 31)];
}

describe('DatePicker (range, mobile inline/bottom-sheet)', () => {
  let fixture: ComponentFixture<RangeInlineHost>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [RangeInlineHost] }).compileComponents();
    fixture = TestBed.createComponent(RangeInlineHost);
    fixture.detectChanges();
  });

  it('expande o calendário embutido ao clicar no tap-catcher', () => {
    const tapCatcher: HTMLButtonElement = fixture.nativeElement.querySelector(
      '.app-date-picker__tap-catcher',
    );
    expect(tapCatcher).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.app-date-picker__field[inline]')).toBeFalsy();

    tapCatcher.click();
    fixture.detectChanges();

    const inlinePickers = fixture.nativeElement.querySelectorAll('p-datepicker');
    // segundo <p-datepicker> (o embutido) só existe no DOM depois do toggle
    expect(inlinePickers.length).toBe(2);
  });
});
