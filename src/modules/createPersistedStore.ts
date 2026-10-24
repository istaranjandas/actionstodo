// One shape for every preference stored in localStorage: read once, normalise what was found,
// then hand React a snapshot through useSyncExternalStore. Callers only supply the key, the
// defaults and the normaliser, so no two settings modules can drift apart again.
import { useSyncExternalStore } from 'react';

export interface PersistedStore<T> {
  get: () => T;
  update: (updates: Partial<T>) => void;
  subscribe: (listener: () => void) => () => void;
  use: () => T;
}

export function createPersistedStore<T extends object>(
  key: string,
  defaults: T,
  normalize: (stored: Partial<T>) => T
): PersistedStore<T> {
  const listeners = new Set<() => void>();

  function load(): T {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return defaults;
      return normalize(JSON.parse(raw) as Partial<T>);
    } catch {
      return defaults;
    }
  }

  let value = load();

  function get(): T {
    return value;
  }

  function update(updates: Partial<T>): void {
    value = { ...value, ...updates };
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage can be full or blocked; the choice still applies for this visit
    }
    listeners.forEach((listener) => listener());
  }

  function subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  }

  function use(): T {
    return useSyncExternalStore(subscribe, get, get);
  }

  return { get, update, subscribe, use };
}
