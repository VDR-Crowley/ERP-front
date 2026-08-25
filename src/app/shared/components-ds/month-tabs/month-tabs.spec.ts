import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { providePrimeNG } from 'primeng/config';

import { MonthTabs } from './month-tabs';
import { PeriodFilterService } from '@core/services/period-filter.service';

function startOfMonth(date: Date): Date {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  start.setHours(0, 0, 0, 0);
  return start;
}

function endOfMonth(date: Date): Date {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}

describe('MonthTabs', () => {
  let fixture: ComponentFixture<MonthTabs>;
  let periodFilter: PeriodFilterService;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [MonthTabs],
      providers: [providePrimeNG({ translation: { today: 'Hoje', clear: 'Limpar' } })],
    }).compileComponents();

    fixture = TestBed.createComponent(MonthTabs);
    periodFilter = TestBed.inject(PeriodFilterService);
    fixture.detectChanges();
  });

  it('mostra o mês corrente selecionado por padrão (default do PeriodFilterService)', () => {
    const now = new Date();
    expect(periodFilter.active()).toBe(true);
    expect(periodFilter.range()).toEqual([startOfMonth(now), endOfMonth(now)]);
  });

  it('selecionar um mês no MonthPicker aplica o range do mês cheio via PeriodFilterService', () => {
    const picked = new Date(2026, 5, 15); // junho, qualquer dia
    fixture.debugElement
      .query(By.css('app-month-picker'))
      .triggerEventHandler('valueChange', picked);
    fixture.detectChanges();

    expect(periodFilter.active()).toBe(true);
    expect(periodFilter.range()).toEqual([startOfMonth(picked), endOfMonth(picked)]);
  });

  it('"Limpar" do MonthPicker (valueChange com null) limpa o filtro, igual ao "Tudo"', () => {
    fixture.debugElement
      .query(By.css('app-month-picker'))
      .triggerEventHandler('valueChange', null);
    fixture.detectChanges();

    expect(periodFilter.active()).toBe(false);
  });

  it('botão "Tudo" limpa o filtro de período', () => {
    const tudoBtn = fixture.debugElement.query(By.css('.month-tabs__chip--clear'))
      .nativeElement as HTMLButtonElement;
    tudoBtn.click();
    fixture.detectChanges();

    expect(periodFilter.active()).toBe(false);
  });

  it('"Tudo" fica marcado como ativo quando o filtro está limpo', () => {
    periodFilter.clear();
    fixture.detectChanges();

    const tudoBtn = fixture.debugElement.query(By.css('.month-tabs__chip--clear'))
      .nativeElement as HTMLButtonElement;
    expect(tudoBtn.classList).toContain('month-tabs__chip--active');
  });

  it('MonthPicker recebe `null` (sem mês pré-selecionado) quando o filtro está limpo ("Tudo")', () => {
    periodFilter.clear();
    fixture.detectChanges();

    const monthPicker = fixture.debugElement.query(By.css('app-month-picker'));
    expect(monthPicker.componentInstance.value()).toBeNull();
    expect(monthPicker.componentInstance.active()).toBe(false);
  });

  it('REGRESSÃO: clicar "Tudo" e reabrir o popup não deixa o mês atual pré-marcado — um clique nele não reativa o filtro', async () => {
    const tudoBtn = fixture.debugElement.query(By.css('.month-tabs__chip--clear'))
      .nativeElement as HTMLButtonElement;
    tudoBtn.click();
    fixture.detectChanges();
    expect(periodFilter.active()).toBe(false);

    // Reabre o popup do MonthPicker (mesma interação que um usuário faria pra
    // conferir/trocar o mês).
    const input = fixture.debugElement.query(By.css('input')).nativeElement as HTMLInputElement;
    input.dispatchEvent(new Event('focus'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    // Nenhuma célula do grid jan-dez deve aparecer como "selecionada" —
    // antes do fix, o mês corrente vinha marcado em verde e um clique nele
    // reativava o filtro, anulando o "Tudo".
    const selectedCell = fixture.debugElement.query(By.css('span.p-datepicker-month-selected'));
    expect(selectedCell).toBeNull();
  });
});
