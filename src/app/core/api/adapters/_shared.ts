import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

/**
 * Front guarda produto/vendedor por NOME em várias entidades (`sales`,
 * `vendor_stock`, `stock_transfers`) — backend usa FK numérica
 * (`product_id`/`seller_id`/`vendedor_id`). Essas entidades resolvem o par
 * nome<->id buscando a lista de referência (products/vendedores) direto da
 * API a cada load/add/update — mais simples e desacoplado do que depender
 * de outra instância de store já carregada na mesma tela (ver decisão em
 * `docs/superpowers/plans/...` do relatório final).
 */
export interface NameIdMaps {
  byId: Map<number, string>;
  byName: Map<string, number>;
}

export async function fetchNameIdMaps(http: HttpClient, url: string): Promise<NameIdMaps> {
  const list = await firstValueFrom(http.get<{ id: number; name: string }[]>(url));
  const byId = new Map<number, string>();
  const byName = new Map<string, number>();
  for (const item of list) {
    byId.set(item.id, item.name);
    byName.set(item.name, item.id);
  }
  return { byId, byName };
}

export function resolveIdByName(maps: NameIdMaps, name: string, entityLabel: string): number {
  const id = maps.byName.get(name);
  if (id === undefined) {
    throw new Error(`${entityLabel} "${name}" não encontrado — selecione um item já cadastrado.`);
  }
  return id;
}
