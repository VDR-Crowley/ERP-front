import { inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { SaleExclusion } from '@core/interfaces/sale-exclusion.interface';
import { environment } from '../../../../environments/environment';
import { EntityStore, WithId } from '../entity-store';

interface SaleExclusionApi {
  id: number;
  sale_id: number;
  reason: string;
  created_at: string;
}

interface SaleWithExclusionApi {
  id: number;
  exclusion: SaleExclusionApi | null;
}

/**
 * `sale_exclusions` não é uma coleção própria no front — é derivada do campo
 * `exclusion` que `GET /sales` já traz embutido em cada venda (ver
 * openapi.yaml). O "id" de cada item aqui é o `saleId` (1:1 por unique
 * constraint no backend), então `update`/`remove` recebem exatamente o que
 * `analise-linha-negocio.ts` já usa como chave (`sale.id`). Criar/atualizar
 * usa o mesmo endpoint idempotente (`POST /sales/{sale}/exclusion` —
 * `updateOrCreate` no backend); remover usa `DELETE /sales/{sale}/exclusion`.
 */
export function createSaleExclusionsStore(): EntityStore<SaleExclusion> {
  const http = inject(HttpClient);
  const salesBase = `${environment.apiUrl}/sales`;
  const items = signal<WithId<SaleExclusion>[]>([]);

  function toWithId(saleId: number, api: SaleExclusionApi): WithId<SaleExclusion> {
    return { saleId: String(saleId), reason: api.reason, createdAt: api.created_at, id: String(saleId) };
  }

  function load(): void {
    http.get<SaleWithExclusionApi[]>(salesBase).subscribe({
      next: (sales) => {
        items.set(
          sales.filter((s): s is SaleWithExclusionApi & { exclusion: SaleExclusionApi } => s.exclusion != null)
            .map((s) => toWithId(s.id, s.exclusion)),
        );
      },
      error: () => {
        // Falha de rede/401 já tratada pelo authInterceptor — evita loading eterno.
      },
    });
  }

  async function add(item: SaleExclusion): Promise<void> {
    const created = await firstValueFrom(
      http.post<SaleExclusionApi>(`${salesBase}/${item.saleId}/exclusion`, { reason: item.reason }),
    );
    items.update((list) => [...list, toWithId(Number(item.saleId), created)]);
  }

  async function update(id: string, item: SaleExclusion): Promise<void> {
    const updated = await firstValueFrom(
      http.post<SaleExclusionApi>(`${salesBase}/${id}/exclusion`, { reason: item.reason }),
    );
    items.update((list) => list.map((v) => (v.id === id ? toWithId(Number(id), updated) : v)));
  }

  async function remove(id: string): Promise<void> {
    await firstValueFrom(http.delete<void>(`${salesBase}/${id}/exclusion`));
    items.update((list) => list.filter((v) => v.id !== id));
  }

  load();

  return { items, reload: load, add, update, remove };
}
