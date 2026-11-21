import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ConsumoRailway } from './consumo-railway';
import { environment } from '../../../../environments/environment';

const URL = `${environment.apiUrl}/admin/railway-usage`;

const METRICS = {
  cpu_vcpu_minutes: 120,
  memory_gb_minutes: 480,
  network_egress_gb: 0.5,
  volume_gb_minutes: 0,
  backup_gb_minutes: 0,
};

const PAYLOAD = {
  project: { id: 'p1', name: 'ERP' },
  period: 'current_billing_cycle',
  currency: 'USD',
  plan_credit_usd: 5,
  totals: {
    current_cost_usd: 1.2345,
    estimated_cycle_end_cost_usd: 3.5,
    credit_used_percent: 24.69,
    estimated_credit_used_percent: 70,
  },
  services: [
    { service_id: 's1', name: 'App', usage: METRICS, cost_usd: 1.0 },
    { service_id: 's2', name: 'Postgres', usage: METRICS, cost_usd: 0.2345 },
  ],
  estimated_usage: METRICS,
  note: 'Custo estimado.',
  fetched_at: '2026-11-18T12:00:00Z',
  cached: true,
  configured: true,
};

describe('ConsumoRailway', () => {
  let fixture: ComponentFixture<ConsumoRailway>;
  let httpMock: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ConsumoRailway],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(ConsumoRailway);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => httpMock.verify());

  async function settle(): Promise<void> {
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('mostra custos e uma linha por serviço', async () => {
    fixture.detectChanges();
    httpMock.expectOne(URL).flush(PAYLOAD);
    await settle();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('US$ 1,2345');
    expect(text).toContain('US$ 3,5000');
    expect(text).toContain('App');
    expect(text).toContain('Postgres');
    expect(fixture.nativeElement.querySelectorAll('tbody tr').length).toBe(2);
  });

  it('"Atualizar agora" pede ?fresh=1', async () => {
    fixture.detectChanges();
    httpMock.expectOne(URL).flush(PAYLOAD);
    await settle();

    fixture.componentInstance['refresh']();
    await new Promise((r) => setTimeout(r));
    const req = httpMock.expectOne((r) => r.url === URL);
    expect(req.request.params.get('fresh')).toBe('1');
    req.flush(PAYLOAD);
    await settle();
  });

  it('503 não configurado mostra mensagem e variáveis faltando', async () => {
    fixture.detectChanges();
    httpMock.expectOne(URL).flush(
      {
        message: 'Integração com o Railway não configurada.',
        configured: false,
        missing: ['RAILWAY_API_TOKEN'],
        how_to_fix: 'Configure RAILWAY_API_TOKEN.',
      },
      { status: 503, statusText: 'Service Unavailable' },
    );
    await settle();

    const text = (fixture.nativeElement as HTMLElement).textContent ?? '';
    expect(text).toContain('Integração com o Railway não configurada.');
    expect(text).toContain('RAILWAY_API_TOKEN');
    expect(text).toContain('Configure RAILWAY_API_TOKEN.');
  });
});
