import { Venda } from '@core/interfaces/venda.interface';
import { CalendarDay } from './calendar-month';

/** Soma `venda.total` (mesmo valor usado em Faturamento) por dia ('YYYY-MM-DD'). */
export function totalVendasPorDia(vendas: Venda[]): Map<string, number> {
  const porDia = new Map<string, number>();
  for (const venda of vendas) {
    const dia = venda.date.slice(0, 10);
    porDia.set(dia, (porDia.get(dia) ?? 0) + venda.total);
  }
  return porDia;
}

export interface MaiorDiaVendas {
  date: string;
  total: number;
}

export interface EstatisticasVendasPorDia {
  /** Faturamento total do mês / nº de dias do mês (inclui dias sem venda). */
  mediaPorDia: number;
  /** Dia com maior faturamento do mês, ou `null` se nenhum dia teve venda. */
  maiorDia: MaiorDiaVendas | null;
  /** Quantos dias do mês (dentro da grade, células reais — não os brancos de alinhamento) não tiveram nenhuma venda. */
  diasSemVenda: number;
}

/**
 * Estatísticas do card "Vendas por dia" a partir da grade do mês
 * (`calendarMonthGrid`, só as células reais — ignora os `null` de
 * alinhamento) e do total já somado por dia (`totalVendasPorDia`).
 */
export function calcularEstatisticasVendasPorDia(
  grid: (CalendarDay | null)[],
  porDia: Map<string, number>,
): EstatisticasVendasPorDia {
  const diasDoMes = grid.filter((c): c is CalendarDay => c !== null);

  let soma = 0;
  let diasSemVenda = 0;
  let maiorDia: MaiorDiaVendas | null = null;

  for (const d of diasDoMes) {
    const total = porDia.get(d.date) ?? 0;
    soma += total;
    if (total === 0) diasSemVenda++;
    if (total > 0 && (!maiorDia || total > maiorDia.total)) {
      maiorDia = { date: d.date, total };
    }
  }

  return {
    mediaPorDia: diasDoMes.length ? soma / diasDoMes.length : 0,
    maiorDia,
    diasSemVenda,
  };
}

/** Faixa de intensidade (0 = sem venda, 4 = maior dia do mês) relativa ao maior valor do período — pinta o heatmap do calendário. */
export function heatmapTier(value: number, max: number): 0 | 1 | 2 | 3 | 4 {
  if (value <= 0 || max <= 0) return 0;
  const ratio = value / max;
  if (ratio >= 0.75) return 4;
  if (ratio >= 0.5) return 3;
  if (ratio >= 0.25) return 2;
  return 1;
}
