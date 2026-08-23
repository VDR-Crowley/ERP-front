import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { AnaliseLinhaNegocio } from './analise-linha-negocio';
import { flushAllPendingGets } from '@core/testing/http-settle';
import { environment } from '../../../../environments/environment';

const EMPTY_SPECIES_TOTALS_API = { revenue: 0, cost: 0, profit: 0, margin_pct: 0 };
const EMPTY_BUSINESS_LINE_REPORT_API = {
  by_species: {
    quail: EMPTY_SPECIES_TOTALS_API,
    chicken: EMPTY_SPECIES_TOTALS_API,
    chicken_covers_costs: true,
    difference_covered_by_quail: 0,
  },
  by_product: [],
  monthly_series: [],
};

// jsdom (ambiente de teste) não implementa ResizeObserver, usado pelo ApexCharts
// para redimensionar o gráfico ao montar o componente.
/* eslint-disable @typescript-eslint/no-empty-function */
if (typeof ResizeObserver === 'undefined') {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
}
/* eslint-enable @typescript-eslint/no-empty-function */

describe('AnaliseLinhaNegocio', () => {
  let component: AnaliseLinhaNegocio;
  let fixture: ComponentFixture<AnaliseLinhaNegocio>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AnaliseLinhaNegocio],
      providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(AnaliseLinhaNegocio);
    component = fixture.componentInstance;
    httpMock = TestBed.inject(HttpTestingController);
    // salesStore, expensesStore, sale-exclusions (GET /sales de novo) e
    // expense-species-overrides (GET /expenses de novo) — ver os adapters
    // respectivos. GET /business-line-report vem do `resource()` do relatório
    // (precisa de um corpo com o shape certo, não `[]` como os demais).
    const overrides = { [`${environment.apiUrl}/business-line-report`]: EMPTY_BUSINESS_LINE_REPORT_API };
    await flushAllPendingGets(httpMock, overrides);
    fixture.detectChanges();
    await flushAllPendingGets(httpMock, overrides); // resource() só dispara o loader depois do 1º detectChanges
    await fixture.whenStable();
  });

  afterEach(() => httpMock.verify());

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
