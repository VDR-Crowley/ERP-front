import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { BusinessLineReportApiService } from './business-line-report-api.service';
import { environment } from '../../../environments/environment';

describe('BusinessLineReportApiService', () => {
  let service: BusinessLineReportApiService;
  let httpMock: HttpTestingController;
  const base = `${environment.apiUrl}/business-line-report`;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(BusinessLineReportApiService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  it('envia start/end como query params quando informados', () => {
    service.get('2026-01-01', '2026-08-31').subscribe();
    const req = httpMock.expectOne(
      (r) => r.url === base && r.params.get('start') === '2026-01-01' && r.params.get('end') === '2026-08-31',
    );
    req.flush({
      by_species: {
        quail: { revenue: 0, cost: 0, profit: 0, margin_pct: 0 },
        chicken: { revenue: 0, cost: 0, profit: 0, margin_pct: 0 },
        chicken_covers_costs: true,
        difference_covered_by_quail: 0,
      },
      by_product: [],
      monthly_series: [],
    });
  });

  it('não envia params quando start/end são omitidos', () => {
    service.get().subscribe();
    const req = httpMock.expectOne(base);
    expect(req.request.params.keys().length).toBe(0);
    req.flush({
      by_species: {
        quail: { revenue: 0, cost: 0, profit: 0, margin_pct: 0 },
        chicken: { revenue: 0, cost: 0, profit: 0, margin_pct: 0 },
        chicken_covers_costs: true,
        difference_covered_by_quail: 0,
      },
      by_product: [],
      monthly_series: [],
    });
  });

  it('mapeia by_species.quail/chicken -> report.codorna/galinha e traduz o resto dos campos', () => {
    let result: unknown;
    service.get().subscribe((r) => (result = r));

    httpMock.expectOne(base).flush({
      by_species: {
        quail: { revenue: 5200, cost: 3100, profit: 2100, margin_pct: 40.38 },
        chicken: { revenue: 800, cost: 900, profit: -100, margin_pct: -12.5 },
        chicken_covers_costs: false,
        difference_covered_by_quail: 100,
      },
      by_product: [
        { name: 'Bandeja de ovos de codorna', revenue: 3200, cost: 1900, profit: 1300, margin_pct: 40.62, quantity_sold: 64 },
      ],
      monthly_series: [{ month: '2026-08', quail_revenue: 3200, chicken_revenue: 2000 }],
    });

    expect(result).toEqual({
      report: {
        codorna: { revenue: 5200, cost: 3100, profit: 2100, marginPct: 40.38 },
        galinha: { revenue: 800, cost: 900, profit: -100, marginPct: -12.5 },
        galinhaCobreCustos: false,
        diferencaCobertaPelaCodorna: 100,
      },
      byProduct: [
        { name: 'Bandeja de ovos de codorna', revenue: 3200, cost: 1900, profit: 1300, marginPct: 40.62, quantitySold: 64 },
      ],
      monthly: [{ month: '2026-08', codornaRevenue: 3200, galinhaRevenue: 2000 }],
    });
  });
});
