import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DASHBOARD_MOCK } from '@core/mocks/dashboard.mock';
import { PRODUCAO_DIARIA_MOCK } from '@core/mocks/producao-diaria.mock';
import { VENDAS_MOCK, VENDAS_TOTAL_MOCK } from '@core/mocks/venda.mock';
import { PLANTEL_MOCK } from '@core/mocks/plantel.mock';
import { brl, num, ptDate } from '@core/utils/format';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard {
  protected readonly brl = brl;
  protected readonly num = num;
  protected readonly ptDate = ptDate;

  protected readonly resumo = DASHBOARD_MOCK;
  protected readonly faturamento = VENDAS_TOTAL_MOCK;

  protected readonly producaoRecente = [...PRODUCAO_DIARIA_MOCK].slice(-6).reverse();
  protected readonly ultimasVendas = [...VENDAS_MOCK].slice(-5).reverse();
  protected readonly plantel = PLANTEL_MOCK;

  protected readonly totalAves =
    DASHBOARD_MOCK.totalCodornas + DASHBOARD_MOCK.totalGalinhas;
  protected readonly totalSacos = PLANTEL_MOCK.reduce((soma, p) => soma + p.sacosRacaoMes, 0);
  protected readonly investimentoRacao = PLANTEL_MOCK.reduce((soma, p) => soma + p.totalMes, 0);
  protected readonly vendasPendentes = VENDAS_MOCK.filter((v) => v.pendentePagamento).length;
}
