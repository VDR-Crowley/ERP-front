import { InjectionToken } from '@angular/core';

/**
 * Storage em memória — usado quando `localStorage`/`sessionStorage` reais
 * não funcionam (SSR, ou o ambiente de teste deste projeto: o runner
 * `@angular/build:unit-test`/Vitest aqui não expõe um `window.localStorage`
 * funcional, só o stub experimental do Node que fica `undefined` sem
 * `--localstorage-file`). Fora desses casos, o browser real é sempre usado.
 */
class MemoryStorage implements Storage {
  private readonly map = new Map<string, string>();

  get length(): number {
    return this.map.size;
  }

  clear(): void {
    this.map.clear();
  }

  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.map.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.map.delete(key);
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
}

/** Testa se o Storage passado funciona de verdade (lança/retorna undefined quando não). */
function safeStorage(factory: () => Storage): Storage {
  try {
    const storage = factory();
    const probeKey = '__erp_storage_probe__';
    storage.setItem(probeKey, '1');
    storage.removeItem(probeKey);
    return storage;
  } catch {
    return new MemoryStorage();
  }
}

export const LOCAL_STORAGE = new InjectionToken<Storage>('LOCAL_STORAGE', {
  providedIn: 'root',
  factory: () => safeStorage(() => localStorage),
});

export const SESSION_STORAGE = new InjectionToken<Storage>('SESSION_STORAGE', {
  providedIn: 'root',
  factory: () => safeStorage(() => sessionStorage),
});
