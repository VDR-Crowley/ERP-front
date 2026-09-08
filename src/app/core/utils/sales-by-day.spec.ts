import { calendarMonthGrid } from './calendar-month';
import { calcularEstatisticasVendasPorDia, heatmapTier, isDiaFuturo, totalVendasPorDia } from './sales-by-day';
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
    // Agosto/2026 tem 31 dias. hojeIso = último dia do mês -> nenhum dia é futuro, mês inteiro conta.
    const grid = calendarMonthGrid(new Date(2026, 7, 1));
    const porDia = new Map<string, number>([
      ['2026-08-01', 300],
      ['2026-08-15', 700],
    ]);

    const stats = calcularEstatisticasVendasPorDia(grid, porDia, '2026-08-31');

    expect(stats.mediaPorDia).toBeCloseTo(1000 / 31, 5);
    expect(stats.maiorDia).toEqual({ date: '2026-08-15', total: 700 });
    expect(stats.diasSemVenda).toBe(29);
  });

  it('mês inteiro sem nenhuma venda -> média 0, maiorDia null, todos os dias contam como sem venda', () => {
    const grid = calendarMonthGrid(new Date(2026, 1, 1)); // fevereiro/2026, 28 dias
    const stats = calcularEstatisticasVendasPorDia(grid, new Map(), '2026-02-28');

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

    const stats = calcularEstatisticasVendasPorDia(grid, porDia, '2026-02-28');

    expect(stats.maiorDia).toEqual({ date: '2026-02-10', total: 500 });
  });

  it('dias futuros (depois de hojeIso) não entram na média, nem em maior dia, nem em dias sem venda', () => {
    // "Hoje" é 2026-08-10: só os primeiros 10 dias de agosto contam.
    const grid = calendarMonthGrid(new Date(2026, 7, 1));
    const porDia = new Map<string, number>([
      ['2026-08-05', 100],
      ['2026-08-20', 999], // venda futura hipotética — não deveria existir, mas mesmo se existisse não conta
    ]);

    const stats = calcularEstatisticasVendasPorDia(grid, porDia, '2026-08-10');

    // Só dias 1-10 contam: soma 100, 10 dias -> média 10. Sem o corte seria 1099/31.
    expect(stats.mediaPorDia).toBeCloseTo(100 / 10, 5);
    // 999 (dia 20, futuro) não pode virar "maior dia" mesmo sendo o maior valor do mapa.
    expect(stats.maiorDia).toEqual({ date: '2026-08-05', total: 100 });
    // 9 dos 10 dias passados (1-10, exceto o 5) não tiveram venda — dia 20 (futuro) não conta como "sem venda".
    expect(stats.diasSemVenda).toBe(9);
  });

  it('hojeIso antes do início do mês (mês futuro inteiro) -> nenhum dia conta, média 0 e sem maior dia', () => {
    const grid = calendarMonthGrid(new Date(2026, 7, 1));
    const stats = calcularEstatisticasVendasPorDia(grid, new Map([['2026-08-05', 500]]), '2026-07-15');

    expect(stats.mediaPorDia).toBe(0);
    expect(stats.maiorDia).toBeNull();
    expect(stats.diasSemVenda).toBe(0);
  });
});

describe('isDiaFuturo', () => {
  it('data depois de hoje -> futuro', () => {
    expect(isDiaFuturo('2026-08-11', '2026-08-10')).toBe(true);
  });

  it('data igual ou antes de hoje -> não é futuro', () => {
    expect(isDiaFuturo('2026-08-10', '2026-08-10')).toBe(false);
    expect(isDiaFuturo('2026-08-09', '2026-08-10')).toBe(false);
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
