import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';

import { Reports } from './reports';
import { flushAllPendingGets } from '@core/testing/http-settle';
import { PeriodFilterService } from '@core/services/period-filter.service';
import { environment } from '../../../../environments/environment';

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

const productsUrl = `${environment.apiUrl}/products`;
const salesUrl = `${environment.apiUrl}/sales`;
const expensesUrl = `${environment.apiUrl}/expenses`;

const PRODUCTS_API = [
  { id: 1, name: '1 Bandeja de ovos de galinha', unit: 'un', unit_price: '20.00', stock: 10, eggs_per_unit: 30 },
];

/** `YYYY-MM-DD` local, mesmo formato que a API devolve — evita o desvio de fuso do `toISOString()`. */
function toIso(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function endOfMonth(date: Date): Date {
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  end.setHours(23, 59, 59, 999);
  return end;
}

const now = new Date();
const PAST_DATE = toIso(new Date(2000, 0, 15));
const CURRENT_MONTH_DATE = toIso(new Date(now.getFullYear(), now.getMonth(), 15));
const NEXT_MONTH = new Date(now.getFullYear(), now.getMonth() + 1, 1);
const NEXT_MONTH_DATE = toIso(new Date(now.getFullYear(), now.getMonth() + 1, 15));
const FAR_FUTURE_DATE = toIso(new Date(now.getFullYear(), now.getMonth() + 2, 15));

function saleApi(id: number, date: string, total: string) {
  return {
    id,
    date,
    product_id: 1,
    quantity: 1,
    unit_price: total,
    total,
    payment_pending: false,
    buyer: 'Comprador',
    seller_id: 1,
    delivery_pending: false,
    delivery_date: null,
    stock_location_type: 'plantel',
    stock_location_vendedor_id: null,
  };
}

function expenseApi(id: number, date: string, amount: string) {
  return {
    id,
    date,
    description: 'Despesa',
    category: 'outros',
    quantity: null,
    unit_price: null,
    amount,
    paid: true,
  };
}

async function createReportsFixture(): Promise<{
  fixture: ComponentFixture<Reports>;
  httpMock: HttpTestingController;
}> {
  await TestBed.configureTestingModule({
    imports: [Reports],
    providers: [provideRouter([]), provideHttpClient(), provideHttpClientTesting()],
  }).compileComponents();

  const fixture = TestBed.createComponent(Reports);
  const httpMock = TestBed.inject(HttpTestingController);
  return { fixture, httpMock };
}

describe('Reports', () => {
  it('should create', async () => {
    const { fixture, httpMock } = await createReportsFixture();
    await flushAllPendingGets(httpMock);
    await fixture.whenStable();
    expect(fixture.componentInstance).toBeTruthy();
  });
});

/**
 * Bug relatado: selecionar um mês futuro (ex.: chip "próximo mês" do
 * MonthTabs) mostrava Margem "0%" — parece empate, mas na verdade não
 * existe faturamento/despesa possível pra um período que ainda não
 * aconteceu. `marginPct` agora vira `null` nesse caso, e o template mostra
 * "—" em vez de um número enganoso.
 */
describe('Reports.resumo() — mês futuro não mostra margem enganosa', () => {
  it('marginPct é null quando o período selecionado é inteiramente futuro', async () => {
    const { fixture, httpMock } = await createReportsFixture();
    TestBed.inject(PeriodFilterService).setRange([startOfMonth(NEXT_MONTH), endOfMonth(NEXT_MONTH)]);

    await flushAllPendingGets(httpMock, {
      [productsUrl]: PRODUCTS_API,
      // Mesmo que exista (hipoteticamente) um lançamento futuro, ele não
      // deve contar — nem pra faturamento, nem pra margem.
      [salesUrl]: [saleApi(1, NEXT_MONTH_DATE, '999.00')],
      [expensesUrl]: [],
    });
    await fixture.whenStable();

    const reports = fixture.componentInstance as unknown as {
      resumo: () => { marginPct: number | null };
      faturamentoTotal: () => number;
    };

    expect(reports.faturamentoTotal()).toBe(0);
    expect(reports.resumo().marginPct).toBeNull();
  });
});

/**
 * Pedido do usuário: um período que cobre passado + mês atual + futuro
 * (ex.: "Tudo", ou um range custom que avança além de hoje) não deve
 * truncar a tela inteira — só não deve somar a contribuição dos meses
 * futuros no cálculo agregado. Vendas/despesas até o fim do mês corrente
 * continuam contando normalmente.
 */
describe('Reports — período passado+atual+futuro só soma até o fim do mês corrente', () => {
  it('faturamento e margem ignoram lançamentos futuros mesmo com range aberto', async () => {
    const { fixture, httpMock } = await createReportsFixture();
    // Range bem largo, cobrindo de 2000 até 2 meses à frente de hoje.
    TestBed.inject(PeriodFilterService).setRange([new Date(2000, 0, 1), endOfMonth(new Date(now.getFullYear(), now.getMonth() + 2, 1))]);

    await flushAllPendingGets(httpMock, {
      [productsUrl]: PRODUCTS_API,
      [salesUrl]: [
        saleApi(1, PAST_DATE, '100.00'),
        saleApi(2, CURRENT_MONTH_DATE, '200.00'),
        saleApi(3, NEXT_MONTH_DATE, '10000.00'),
        saleApi(4, FAR_FUTURE_DATE, '10000.00'),
      ],
      [expensesUrl]: [
        expenseApi(1, PAST_DATE, '50.00'),
        expenseApi(2, CURRENT_MONTH_DATE, '50.00'),
        expenseApi(3, NEXT_MONTH_DATE, '5000.00'),
      ],
    });
    await fixture.whenStable();

    const reports = fixture.componentInstance as unknown as {
      resumo: () => { marginPct: number | null };
      faturamentoTotal: () => number;
      vendasFiltradas: () => { date: string }[];
    };

    // Só as 2 vendas até o fim do mês corrente entram (100 + 200 = 300);
    // as 2 futuras (10000 + 10000) ficam de fora.
    expect(reports.faturamentoTotal()).toBe(300);
    expect(reports.vendasFiltradas().length).toBe(2);
    // Margem = (300 - 100) / 300 = 66.67% ≈ 67%, não achatada pelas despesas futuras (5000).
    expect(reports.resumo().marginPct).toBe(67);
  });
});
