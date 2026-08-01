import { HatchEvent, NovoLotePlantel } from '@core/interfaces/novo-lote-plantel.interface';

/**
 * Acompanhamento incremental de eclosão de um lote (`gestao-plantel`): a eclosão de um lote
 * não é instantânea, leva vários dias, então o total nascido é a soma de vários registros
 * (`HatchEvent`) em vez de um único evento que fecha o lote inteiro de uma vez.
 *
 * Todas as funções aqui são puras (sem Angular, sem IndexedDB) — o componente só monta o
 * novo array de eventos e decide quando persistir via `entity-store`.
 */

/** Soma a quantidade de aves nascidas em todos os eventos do lote. */
export function totalHatched(events: HatchEvent[]): number {
  return events.reduce((sum, e) => sum + e.count, 0);
}

/** Acrescenta um novo evento de nascimento ao histórico, sem alterar os já existentes. */
export function addHatchEvent(events: HatchEvent[], event: HatchEvent): HatchEvent[] {
  return [...events, event];
}

/** Atualiza um evento existente (edição do histórico) pelo `id`; não faz nada se o id não existir. */
export function updateHatchEvent(
  events: HatchEvent[],
  eventId: string,
  changes: Pick<HatchEvent, 'date' | 'count' | 'notes'>,
): HatchEvent[] {
  return events.map((e) => (e.id === eventId ? { ...e, ...changes } : e));
}

/** Remove um evento do histórico pelo `id`. */
export function removeHatchEvent(events: HatchEvent[], eventId: string): HatchEvent[] {
  return events.filter((e) => e.id !== eventId);
}

/**
 * Decide o status do lote depois de uma mudança no histórico de nascimentos: vira "eclodido"
 * automaticamente quando o total nascido atinge (ou ultrapassa) a quantidade de ovos — a
 * outra forma de fechar o lote é a ação manual "Concluir lote" (fora daqui, pro caso de nem
 * todos os ovos terem chocado). Um lote já "eclodido" nunca reabre sozinho: editar o
 * histórico (ex.: corrigir uma contagem) não pode desfazer silenciosamente esse fechamento.
 */
export function deriveStatusAfterHatchChange(
  currentStatus: NovoLotePlantel['status'],
  eggCount: number,
  events: HatchEvent[],
): NovoLotePlantel['status'] {
  if (currentStatus === 'eclodido') return 'eclodido';
  return totalHatched(events) >= eggCount ? 'eclodido' : 'incubando';
}

/**
 * Migra um lote salvo antes do histórico incremental existir: registros antigos tinham um
 * único par `actualHatchDate`/`hatchedCount` em vez de `hatchEvents`. Converte esse par num
 * evento único (sem observação — não existia esse campo antes). Registro já migrado
 * (`hatchEvents` presente) volta como está.
 */
export function migrateLegacyHatchEvents(lote: {
  hatchEvents?: HatchEvent[];
  actualHatchDate?: string | null;
  hatchedCount?: number | null;
}): HatchEvent[] {
  if (lote.hatchEvents) return lote.hatchEvents;
  if (lote.actualHatchDate && lote.hatchedCount) {
    return [{ id: crypto.randomUUID(), date: lote.actualHatchDate, count: lote.hatchedCount }];
  }
  return [];
}
