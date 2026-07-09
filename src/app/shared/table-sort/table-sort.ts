import { Signal, signal } from '@angular/core';

export type SortDir = 1 | -1;

export interface SortState<F extends string> {
  readonly sortField: Signal<F | ''>;
  readonly sortDir: Signal<SortDir>;
  readonly sortBy: (field: F) => void;
}

export function createSortState<F extends string>(
  defaultField: F | '' = '',
  defaultDir: SortDir = 1,
): SortState<F> {
  const sortField = signal<F | ''>(defaultField);
  const sortDir = signal<SortDir>(defaultDir);

  function sortBy(field: F): void {
    if (sortField() === field) {
      sortDir.update((d) => (d === 1 ? -1 : 1));
    } else {
      sortField.set(field);
      sortDir.set(1);
    }
  }

  return { sortField, sortDir, sortBy };
}

function compareBy<T, F extends keyof T>(a: T, b: T, field: F, dir: SortDir): number {
  const x = a[field];
  const y = b[field];
  if (x === null || x === undefined) return y === null || y === undefined ? 0 : 1;
  if (y === null || y === undefined) return -1;
  if (typeof x === 'number' && typeof y === 'number') return (x - y) * dir;
  return String(x).localeCompare(String(y)) * dir;
}

export function sortRows<T, F extends keyof T>(list: T[], field: F | '', dir: SortDir): T[] {
  if (!field) return list;
  return [...list].sort((a, b) => compareBy(a, b, field, dir));
}
