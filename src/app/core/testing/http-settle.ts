import { HttpTestingController, TestRequest } from '@angular/common/http/testing';

/**
 * Helpers pra testar os `core/api/adapters/*` — muitos deles encadeiam
 * `Promise.all`/`await` internamente (ex.: `sales.adapter.ts`'s `fetchRefs()`,
 * `vendor-stock.adapter.ts`) antes de disparar a próxima requisição HTTP, e o
 * número de microtask ticks até isso acontecer não é sempre o mesmo. Em vez
 * de contar ticks manualmente em cada teste, `settleHttp` tenta algumas
 * rodadas até achar (e drenar) as requisições pendentes daquela URL.
 */

/** Deixa o microtask queue drenar — um `setTimeout` sempre roda depois de todo microtask pendente. */
export function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Espera até aparecer pelo menos 1 requisição pendente pra `url` (tenta por
 * algumas rodadas de `flushMicrotasks`), dá flush em todas com `body`, e
 * continua tentando por mais algumas rodadas caso apareçam novas requisições
 * pra mesma URL logo em seguida (efeito comum quando duas stores
 * independentes pedem a mesma referência ao mesmo tempo — ver
 * `vendor-stock.adapter.ts`). Lança erro se nenhuma aparecer.
 */
export async function settleHttp(
  httpMock: HttpTestingController,
  url: string,
  body: unknown,
  maxAttempts = 10,
): Promise<void> {
  let flushedAny = false;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pending = httpMock.match(url);
    if (pending.length > 0) {
      pending.forEach((req) => req.flush(body as never));
      flushedAny = true;
    } else if (flushedAny) {
      return;
    }
    await flushMicrotasks();
  }
  if (!flushedAny) {
    throw new Error(`Nenhuma requisição pendente encontrada pra ${url}`);
  }
}

/**
 * Como `settleHttp`, mas devolve a `TestRequest` sem dar flush — pra quando
 * o teste precisa inspecionar o corpo antes de decidir a resposta (ex.:
 * verificar o payload de um POST/PUT antes de flushar). Só aceita 1
 * requisição pendente pra `url` no fim da espera (usa `expectOne`).
 */
export async function waitForRequest(
  httpMock: HttpTestingController,
  url: string,
  maxAttempts = 10,
): Promise<TestRequest> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const pending = httpMock.match(url);
    if (pending.length > 0) {
      if (pending.length > 1) {
        throw new Error(`Mais de 1 requisição pendente pra ${url} (${pending.length})`);
      }
      return pending[0];
    }
    await flushMicrotasks();
  }
  throw new Error(`Nenhuma requisição pendente encontrada pra ${url}`);
}

/**
 * Flush indiscriminado de QUALQUER GET pendente (com `[]`, exceto as URLs em
 * `overrides` — flushadas com o valor dado). Útil em telas que somam várias
 * stores de uma vez (ex.: Dashboard) e o teste só se importa com uma ou
 * duas — não precisa listar/mapear manualmente cada endpoint que a tela usa.
 * Roda por algumas rodadas pra pegar GETs encadeados (ex.: `vendor-stock`
 * refazendo `/products` pra resolver nome — ver `vendor-stock.adapter.ts`).
 */
export async function flushAllPendingGets(
  httpMock: HttpTestingController,
  overrides: Record<string, unknown> = {},
  rounds = 5,
): Promise<void> {
  for (let round = 0; round < rounds; round++) {
    const pending = httpMock.match(() => true);
    if (pending.length === 0) {
      await flushMicrotasks();
      continue;
    }
    for (const req of pending) {
      const override = Object.entries(overrides).find(([url]) => req.request.url === url);
      req.flush((override ? override[1] : []) as never);
    }
    await flushMicrotasks();
  }
}
