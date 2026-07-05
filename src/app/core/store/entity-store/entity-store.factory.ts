import { BehaviorSubject } from 'rxjs';

/**
 * Cria uma store completa com seleção, lista, loading e erro.
 * Útil para gerenciar coleções com seleção (ex: produtos, usuários).
 */
export function createEntityStore<T>() {
  const selected = new BehaviorSubject<T | null>(null);
  const list = new BehaviorSubject<T[]>([]);
  const loading = new BehaviorSubject<boolean>(false);
  const error = new BehaviorSubject<any | null>(null);
  return {
    selected,
    list,
    loading,
    error,
    selected$: selected.asObservable(),
    list$: list.asObservable(),
    loading$: loading.asObservable(),
    error$: error.asObservable(),
    setSelected: (value: T | null) => selected.next(value),
    setList: (value: T[]) => list.next(value),
    setLoading: (value: boolean) => loading.next(value),
    setError: (err: any) => error.next(err),
    clearSelected: () => selected.next(null),
    clearList: () => list.next([]),
    clearAll: () => {
      selected.next(null);
      list.next([]);
    },
  };
}

/**
 * Cria uma store simples para um único item com loading e erro.
 * Útil para detalhes, links ou itens isolados.
 */
export function createEntityItemStore<T>() {
  const item = new BehaviorSubject<T | null>(null);
  const loading = new BehaviorSubject<boolean>(false);
  const error = new BehaviorSubject<any | null>(null);
  return {
    item,
    loading,
    error,
    item$: item.asObservable(),
    loading$: loading.asObservable(),
    error$: error.asObservable(),
    setItem: (value: T | null) => item.next(value),
    setLoading: (value: boolean) => loading.next(value),
    setError: (err: any) => error.next(err),
    clearItem: () => item.next(null),
  };
}

/**
 * Cria uma store reativa para um único valor simples.
 * Útil para enums, flags ou seleções básicas.
 */
export function createSimpleEntityStore<T>() {
  const subject = new BehaviorSubject<T | null>(null);
  return {
    value$: subject.asObservable(),
    set: (value: T | null) => subject.next(value),
    get: () => subject.getValue(),
    clear: () => subject.next(null),
  };
}
