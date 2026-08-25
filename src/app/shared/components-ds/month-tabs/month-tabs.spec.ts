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

  it('MonthPicker recebe o mês corrente como fallback quando o filtro está limpo ("Tudo")', () => {
    periodFilter.clear();
    fixture.detectChanges();

    const monthPicker = fixture.debugElement.query(By.css('app-month-picker'));
    const now = new Date();
    expect((monthPicker.componentInstance.value() as Date).getTime()).toBe(startOfMonth(now).getTime());
    expect(monthPicker.componentInstance.active()).toBe(false);
  });
});
