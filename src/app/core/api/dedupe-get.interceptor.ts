import { HttpEvent, HttpInterceptorFn } from '@angular/common/http';
import { Observable } from 'rxjs';
import { finalize, shareReplay } from 'rxjs/operators';
import { environment } from '../../../environments/environment';

/**
 * Várias stores independentes da mesma tela (ex.: Dashboard monta
 * products/sales/vendor-stock ao mesmo tempo) resolvem nome<->id de produto
 * buscando `GET /products` cada uma por conta própria (decisão registrada em
 * `core/api/adapters/_shared.ts` — desacoplamento entre entidades). Isso é
 * correto entidade-a-entidade, mas gera N requisições idênticas e
 * simultâneas pro mesmo endpoint quando várias stores montam junto.
 *
 * Este interceptor deduplica GETs para a MESMA URL da API que estejam
 * *realmente concorrentes* (mesmo instante, ainda sem resposta) — a 2ª/3ª
 * chamada recebe a resposta compartilhada da 1ª (`shareReplay(1)`) em vez de
 * abrir nova conexão. Assim que a requisição original completa, a entrada é
 * removida do cache (`finalize`), então a próxima chamada (não concorrente)
 * continua batendo na API de novo — não é cache, é só coalescência de
 * chamadas simultâneas. Mesmo padrão já usado pra deduplicar `/refresh`
 * concorrente em `AuthApiService.refreshSession$()`.
 */
const inFlight = new Map<string, Observable<HttpEvent<unknown>>>();

export const dedupeGetInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.method !== 'GET' || !req.url.startsWith(environment.apiUrl)) {
    return next(req);
  }

  const key = req.urlWithParams;
  const existing = inFlight.get(key);
  if (existing) {
    return existing;
  }

  const shared$ = next(req).pipe(
    finalize(() => inFlight.delete(key)),
    shareReplay(1),
  );
  inFlight.set(key, shared$);
  return shared$;
};
