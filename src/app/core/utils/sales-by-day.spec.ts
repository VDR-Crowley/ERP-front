import { calendarMonthGrid } from './calendar-month';
import { calcularEstatisticasVendasPorDia, heatmapTier, totalVendasPorDia } from './sales-by-day';
import { Venda } from '@core/interfaces/venda.interface';

function venda(partial: Partial<Venda>): Venda {
  return {
    date: '2026-08-01',
    product: 'produto',
    quantity: 1,
    unitPrice: 10,
    total: 10,
    paymentPending: false,
    buyer: 'comprador',
    seller: 'vendedor',
    deliveryPending: false,
    deliveryDate: null,
    ...partial,
  };
}

describe('totalVendasPorDia', () => {
  it('soma venda.total (mesmo valor do Faturamento) agrupado por dia, ignorando hora/produto', () => {
    const vendas = [
      venda({ date: '2026-08-05', total: 100 }),
      venda({ date: '2026-08-05', total: 50 }),
      venda({ date: '2026-08-05T14:30:00.000000Z', total: 25 }),
      venda({ date: '2026-08-06', total: 200 }),
    ];

    const porDia = totalVendasPorDia(vendas);

    expect(porDia.get('2026-08-05')).toBe(175);
    expect(porDia.get('2026-08-06')).toBe(200);
    expect(porDia.size).toBe(2);
  });

  it('lista vazia -> mapa vazio', () => {
    expect(totalVendasPorDia([]).size).toBe(0);
  });
});

describe('calcularEstatisticasVendasPorDia', () => {
  it('média considera todos os dias do mês (inclusive sem venda), maior dia e contagem de dias sem venda', () => {
    // Agosto/2026 tem 31 dias.
    const grid = calendarMonthGrid(new Date(2026, 7, 1));
    const porDia = new Map<string, number>([
      ['2026-08-01', 300],
      ['2026-08-15', 700],
    ]);

    const stats = calcularEstatisticasVendasPorDia(grid, porDia);

    expect(stats.mediaPorDia).toBeCloseTo(1000 / 31, 5);
    expect(stats.maiorDia).toEqual({ date: '2026-08-15', total: 700 });
    expect(stats.diasSemVenda).toBe(29);
  });

  it('mês inteiro sem nenhuma venda -> média 0, maiorDia null, todos os dias contam como sem venda', () => {
    const grid = calendarMonthGrid(new Date(2026, 1, 1)); // fevereiro/2026, 28 dias
    const stats = calcularEstatisticasVendasPorDia(grid, new Map());

    expect(stats.mediaPorDia).toBe(0);
    expect(stats.maiorDia).toBeNull();
    expect(stats.diasSemVenda).toBe(28);
  });

  it('empate no maior dia fica com o primeiro encontrado (ordem da grade, cronológica)', () => {
    const grid = calendarMonthGrid(new Date(2026, 1, 1));
    const porDia = new Map<string, number>([
      ['2026-02-10', 500],
      ['2026-02-20', 500],
    ]);

    const stats = calcularEstatisticasVendasPorDia(grid, porDia);

    expect(stats.maiorDia).toEqual({ date: '2026-02-10', total: 500 });
  });
});

describe('heatmapTier', () => {
  it('sem venda (0) ou sem máximo no período -> tier 0', () => {
    expect(heatmapTier(0, 1000)).toBe(0);
    expect(heatmapTier(500, 0)).toBe(0);
  });

  it('tiers 1-4 relativos ao maior dia do período', () => {
    expect(heatmapTier(100, 1000)).toBe(1); // 10%
    expect(heatmapTier(300, 1000)).toBe(2); // 30%
    expect(heatmapTier(600, 1000)).toBe(3); // 60%
    expect(heatmapTier(900, 1000)).toBe(4); // 90%
    expect(heatmapTier(1000, 1000)).toBe(4); // o próprio maior dia
  });
});
