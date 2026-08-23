import { inject, signal } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { ExpenseSpeciesOverride } from '@core/interfaces/expense-species-override.interface';
import { Species } from '@core/interfaces/business-line-report.interface';
import { environment } from '../../../../environments/environment';
import { EntityStore, WithId } from '../entity-store';

interface ExpenseSpeciesOverrideApi {
  id: number;
  expense_id: number;
  species: 'quail' | 'chicken' | null;
  reason: string;
  created_at: string;
}

interface ExpenseWithOverrideApi {
  id: number;
  species_override: ExpenseSpeciesOverrideApi | null;
}

/**
 * Front usa `Species = 'codorna' | 'galinha'` (`business-line-report.interface.ts`) nessa
 * entidade especificamente; o resto do backend (flock-incubations, flock-cleanings) já
 * padronizou em inglês (`quail`/`chicken`, ver `plano-entidades.md`). Traduz só aqui.
 */
const TO_API: Record<Species, 'quail' | 'chicken'> = { codorna: 'quail', galinha: 'chicken' };
const TO_FRONT: Record<'quail' | 'chicken', Species> = { quail: 'codorna', chicken: 'galinha' };

/**
 * Mesmo padrão de `sale-exclusions.adapter.ts`: entidade derivada do campo
 * `species_override` embutido em `GET /expenses`, "id" = `expenseId` (1:1 por
 * unique constraint), create/update via o mesmo `POST` idempotente.
 */
export function createExpenseSpeciesOverridesStore(): EntityStore<ExpenseSpeciesOverride> {
  const http = inject(HttpClient);
  const expensesBase = `${environment.apiUrl}/expenses`;
  const items = signal<WithId<ExpenseSpeciesOverride>[]>([]);

  function toWithId(expenseId: number, api: ExpenseSpeciesOverrideApi): WithId<ExpenseSpeciesOverride> {
    return {
      expenseId: String(expenseId),
      species: api.species ? TO_FRONT[api.species] : null,
      reason: api.reason,
      createdAt: api.created_at,
      id: String(expenseId),
    };
  }

  function load(): void {
    http.get<ExpenseWithOverrideApi[]>(expensesBase).subscribe({
      next: (expenses) => {
        items.set(
          expenses
            .filter((e): e is ExpenseWithOverrideApi & { species_override: ExpenseSpeciesOverrideApi } => e.species_override != null)
            .map((e) => toWithId(e.id, e.species_override)),
        );
      },
      error: () => {
        // Falha de rede/401 já tratada pelo authInterceptor — evita loading eterno.
      },
    });
  }

  async function add(item: ExpenseSpeciesOverride): Promise<void> {
    const created = await firstValueFrom(
      http.post<ExpenseSpeciesOverrideApi>(`${expensesBase}/${item.expenseId}/species-override`, {
        species: item.species ? TO_API[item.species] : null,
        reason: item.reason,
      }),
    );
    items.update((list) => [...list, toWithId(Number(item.expenseId), created)]);
  }

  async function update(id: string, item: ExpenseSpeciesOverride): Promise<void> {
    const updated = await firstValueFrom(
      http.post<ExpenseSpeciesOverrideApi>(`${expensesBase}/${id}/species-override`, {
        species: item.species ? TO_API[item.species] : null,
        reason: item.reason,
      }),
    );
    items.update((list) => list.map((v) => (v.id === id ? toWithId(Number(id), updated) : v)));
  }

  async function remove(id: string): Promise<void> {
    await firstValueFrom(http.delete<void>(`${expensesBase}/${id}/species-override`));
    items.update((list) => list.filter((v) => v.id !== id));
  }

  load();

  return { items, reload: load, add, update, remove };
}
