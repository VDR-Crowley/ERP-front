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
  /** Faturamento total dos dias já passados (até hoje) / nº desses dias. Dias futuros não entram — o mês ainda não "aconteceu" pra eles. */
  mediaPorDia: number;
  /** Dia com maior faturamento entre os dias já passados, ou `null` se nenhum teve venda. */
  maiorDia: MaiorDiaVendas | null;
  /** Quantos dias já passados (até hoje) não tiveram nenhuma venda — dias futuros não contam como "sem venda" (ainda não é possível saber). */
  diasSemVenda: number;
}

/** `true` se `date` ('YYYY-MM-DD') for depois de `hojeIso` ('YYYY-MM-DD') — comparação lexicográfica, válida pro formato ISO. */
export function isDiaFuturo(date: string, hojeIso: string): boolean {
  return date > hojeIso;
}

/**
 * Estatísticas do card "Vendas por dia" a partir da grade do mês
 * (`calendarMonthGrid`, só as células reais — ignora os `null` de
 * alinhamento) e do total já somado por dia (`totalVendasPorDia`).
 *
 * Dias futuros (depois de `hojeIso`) são excluídos de tudo — média, maior
 * dia e contagem de "sem venda": um dia que ainda não aconteceu não pode
 * ser "sem venda", e incluí-lo na média divide por dias que não tiveram
 * chance de vender nada, subestimando o resultado pra qualquer mês em
 * andamento (bug relatado: calendário sombreava/contava dias futuros como
 * se já tivessem dado zero vendas).
 */
export function calcularEstatisticasVendasPorDia(
  grid: (CalendarDay | null)[],
  porDia: Map<string, number>,
  hojeIso: string,
): EstatisticasVendasPorDia {
  const diasJaPassados = grid.filter(
    (c): c is CalendarDay => c !== null && !isDiaFuturo(c.date, hojeIso),
  );

  let soma = 0;
  let diasSemVenda = 0;
  let maiorDia: MaiorDiaVendas | null = null;

  for (const d of diasJaPassados) {
    const total = porDia.get(d.date) ?? 0;
    soma += total;
    if (total === 0) diasSemVenda++;
    if (total > 0 && (!maiorDia || total > maiorDia.total)) {
      maiorDia = { date: d.date, total };
    }
  }

  return {
    mediaPorDia: diasJaPassados.length ? soma / diasJaPassados.length : 0,
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
