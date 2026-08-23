import { inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { HatchEvent, NovoLotePlantel } from '@core/interfaces/novo-lote-plantel.interface';
import { environment } from '../../../../environments/environment';
import { decimalToNullableNumber, EntityStore, WithId } from '../entity-store';

interface HatchEventApi {
  id: number;
  flock_incubation_id: number;
  date: string;
  count: number;
  notes: string | null;
}

interface FlockIncubationApi {
  id: number;
  start_date: string;
  species: 'quail' | 'chicken';
  egg_count: number;
  expected_hatch_date: string;
  status: 'incubando' | 'eclodido';
  egg_cost: string | null;
  feed_cost: string | null;
  notes: string | null;
  hatch_events: HatchEventApi[];
}

function hatchEventToFront(api: HatchEventApi): HatchEvent {
  return { id: String(api.id), date: api.date, count: api.count, notes: api.notes ?? undefined };
}

function toFront(api: FlockIncubationApi): WithId<NovoLotePlantel> {
  return {
    startDate: api.start_date,
    species: api.species,
    eggCount: api.egg_count,
    expectedHatchDate: api.expected_hatch_date,
    hatchEvents: api.hatch_events.map(hatchEventToFront),
    status: api.status,
    eggCost: decimalToNullableNumber(api.egg_cost),
    feedCost: decimalToNullableNumber(api.feed_cost),
    notes: api.notes ?? undefined,
    id: String(api.id),
  };
}

function topLevelToApi(item: NovoLotePlantel) {
  return {
    start_date: item.startDate,
    species: item.species,
    egg_count: item.eggCount,
    expected_hatch_date: item.expectedHatchDate,
    status: item.status,
    egg_cost: item.eggCost,
    feed_cost: item.feedCost,
    notes: item.notes || null,
  };
}

function hatchEventToApi(event: Pick<HatchEvent, 'date' | 'count' | 'notes'>) {
  return { date: event.date, count: event.count, notes: event.notes || null };
}

/** `id` gerado no front pra um `HatchEvent` novo (`crypto.randomUUID()` em `gestao-plantel.ts`) nunca é um id numérico puro — usado pra distinguir "precisa POST" de "já existe no backend, PUT/DELETE". */
function isServerHatchEventId(id: string): boolean {
  return /^\d+$/.test(id);
}

/**
 * `flock_incubations` + `hatch_events` (sub-recurso). O front trata o lote
 * inteiro como um blob (`NovoLotePlantel.hatchEvents[]`) e chama sempre
 * `store.update()` com o registro completo — inclusive pra registrar/editar/
 * apagar um nascimento (ver `gestao-plantel.ts`). O backend, porém, só
 * aceita mudança de nascimento pelos endpoints dedicados
 * (`POST/PUT/DELETE /flock-incubations/{id}/hatch-events[/{event}]`), que
 * recalculam `status` sozinhos. Por isso `update()` aqui faz diff entre o
 * `hatchEvents` recebido e o último estado carregado (a própria signal
 * `items`, lida ANTES de aplicar a mudança) e traduz em create/update/delete
 * de evento, na ordem certa; o PUT dos campos de topo roda depois, sempre
 * (idempotente — o `status` client-side já usa a mesma regra do backend, ver
 * `hatch-tracking.util.ts`). Termina com um GET do lote pra devolver o
 * estado 100% autoritativo do servidor (ids reais dos eventos novos, status
 * recalculado).
 */
export function createFlockIncubationsStore(): EntityStore<NovoLotePlantel> {
  const http = inject(HttpClient);
  const base = `${environment.apiUrl}/flock-incubations`;
  const items = signal<WithId<NovoLotePlantel>[]>([]);

  function load(): void {
    http.get<FlockIncubationApi[]>(base).subscribe({
      next: (list) => items.set(list.map(toFront)),
      error: () => {
        // Falha de rede/401 já tratada pelo authInterceptor — evita loading eterno.
      },
    });
  }

  async function syncHatchEvents(incubationId: string, previous: HatchEvent[], next: HatchEvent[]): Promise<void> {
    const previousById = new Map(previous.map((e) => [e.id, e]));
    const nextIds = new Set(next.map((e) => e.id));

    for (const event of previous) {
      if (!nextIds.has(event.id)) {
        await firstValueFrom(http.delete<void>(`${base}/${incubationId}/hatch-events/${event.id}`));
      }
    }

    for (const event of next) {
      const before = previousById.get(event.id);
      if (!before && !isServerHatchEventId(event.id)) {
        await firstValueFrom(
          http.post<HatchEventApi>(`${base}/${incubationId}/hatch-events`, hatchEventToApi(event)),
        );
        continue;
      }
      if (before && (before.date !== event.date || before.count !== event.count || before.notes !== event.notes)) {
        await firstValueFrom(
          http.put<HatchEventApi>(`${base}/${incubationId}/hatch-events/${event.id}`, hatchEventToApi(event)),
        );
      }
    }
  }

  async function add(item: NovoLotePlantel): Promise<void> {
    const created = await firstValueFrom(http.post<FlockIncubationApi>(base, topLevelToApi(item)));
    let final = toFront(created);
    if (item.hatchEvents.length > 0) {
      await syncHatchEvents(final.id, [], item.hatchEvents);
      final = toFront(await firstValueFrom(http.get<FlockIncubationApi>(`${base}/${final.id}`)));
    }
    items.update((list) => [...list, final]);
  }

  async function update(id: string, item: NovoLotePlantel): Promise<void> {
    const previous = items().find((v) => v.id === id);
    await syncHatchEvents(id, previous?.hatchEvents ?? [], item.hatchEvents);
    await firstValueFrom(http.put<FlockIncubationApi>(`${base}/${id}`, topLevelToApi(item)));
    const refreshed = toFront(await firstValueFrom(http.get<FlockIncubationApi>(`${base}/${id}`)));
    items.update((list) => list.map((v) => (v.id === id ? refreshed : v)));
  }

  async function remove(id: string): Promise<void> {
    await firstValueFrom(http.delete<void>(`${base}/${id}`));
    items.update((list) => list.filter((v) => v.id !== id));
  }

  load();

  return { items, reload: load, add, update, remove };
}
