// Confirmation toasts: short-lived notices after task operations, optionally with one action (e.g. Undo)
import { useSyncExternalStore } from 'react';

export type ToastTone = 'success' | 'neutral' | 'danger';

export interface Toast {
  id: number;
  message: string;
  detail?: string;
  tone: ToastTone;
  actionLabel?: string;
  onAction?: () => void;
}

const TOAST_LIFETIME_MS = 3800;
const MAX_VISIBLE_TOASTS = 3;

let toasts: Toast[] = [];
let nextToastId = 1;
const listeners = new Set<() => void>();
const timers = new Map<number, number>();

function publish(next: Toast[]) {
  toasts = next;
  listeners.forEach((listener) => listener());
}

export function dismissToast(id: number): void {
  window.clearTimeout(timers.get(id));
  timers.delete(id);
  publish(toasts.filter((toast) => toast.id !== id));
}

export function pushToast(toast: Omit<Toast, 'id'>): void {
  const id = nextToastId++;
  const overflow = toasts.slice(0, Math.max(0, toasts.length - MAX_VISIBLE_TOASTS + 1));
  overflow.forEach((stale) => {
    window.clearTimeout(timers.get(stale.id));
    timers.delete(stale.id);
  });
  publish([...toasts.slice(overflow.length), { ...toast, id }]);
  timers.set(id, window.setTimeout(() => dismissToast(id), TOAST_LIFETIME_MS));
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useToasts(): Toast[] {
  return useSyncExternalStore(subscribe, () => toasts, () => toasts);
}
