import { DatePipe } from '@angular/common';
import { Component, computed, inject, resource } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { RailwayUsageApiService } from '@core/api/railway-usage-api.service';
import { RailwayUsage, RailwayUsageError } from '@core/interfaces/railway-usage.interface';
import { num, usd } from '@core/utils/format';

/** Acima disso a barra de crédito fica em alerta (amarelo) / perigo (vermelho). */
const WARN_PERCENT = 70;
const DANGER_PERCENT = 90;

/**
 * Tela "Consumo Railway" — só ADMINISTRADOR (rota protegida pelo `roleGuard`,
 * item de menu escondido pra os demais). Mostra o custo do ciclo de cobrança
 * atual, a estimativa até o fim do ciclo e o consumo por serviço, vindos de
 * `GET /admin/railway-usage`. O custo é uma estimativa; a fatura oficial é a
 * do painel da Railway.
 */
@Component({
  selector: 'app-consumo-railway',
  imports: [DatePipe],
  templateUrl: './consumo-railway.html',
  styleUrl: './consumo-railway.scss',
})
export class ConsumoRailway {
  protected readonly usd = usd;
  protected readonly num = num;

  private readonly api = inject(RailwayUsageApiService);
  /** `true` só na próxima carga disparada por "Atualizar agora" (ignora o cache do backend). */
  private forceFresh = false;

  private readonly usageResource = resource({
    loader: (): Promise<RailwayUsage> => {
      const fresh = this.forceFresh;
      this.forceFresh = false;
      return firstValueFrom(this.api.get(fresh));
    },
  });

  protected readonly usage = computed<RailwayUsage | null>(() =>
    this.usageResource.hasValue() ? this.usageResource.value() : null,
  );
  protected readonly loading = this.usageResource.isLoading;

  /** Erro amigável: 503 (falta configurar o token), 502 (Railway fora/recusou), 403, genérico. */
  protected readonly error = computed<RailwayUsageError | null>(() => {
    const err = this.usageResource.error();
    if (!err) return null;
    const res = (err as { cause?: unknown }).cause ?? err;
    if (res instanceof HttpErrorResponse) {
      const body = (res.error ?? {}) as {
        message?: string;
        configured?: boolean;
        missing?: string[];
        how_to_fix?: string;
      };
      if (res.status === 403) {
        return { message: 'Esta tela é exclusiva para administradores.' };
      }
      if (res.status === 429) {
        return { message: 'Muitas consultas seguidas. Aguarde um minuto e tente de novo.' };
      }
      return {
        message: body.message ?? 'Não foi possível carregar o consumo do Railway.',
        configured: body.configured,
        missing: body.missing,
        howToFix: body.how_to_fix,
      };
    }
    return { message: 'Não foi possível carregar o consumo do Railway.' };
  });

  /** Percentual do crédito já usado, limitado a 100 só pra largura da barra. */
  protected barWidth(percent: number | null): number {
    return Math.min(100, Math.max(0, percent ?? 0));
  }

  protected tone(percent: number | null): 'ok' | 'warn' | 'danger' {
    const p = percent ?? 0;
    return p >= DANGER_PERCENT ? 'danger' : p >= WARN_PERCENT ? 'warn' : 'ok';
  }

  protected refresh(): void {
    this.forceFresh = true;
    this.usageResource.reload();
  }
}
