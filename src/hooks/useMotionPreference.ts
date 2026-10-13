import { useSyncExternalStore } from 'react';

export type MotionPreference = 'auto' | 'on' | 'off';

const MOTION_PREFERENCE_KEY = 'actionstodo_motion_preference';
const listeners = new Set<() => void>();

function readMotionPreference(): MotionPreference {
  try {
    const stored = localStorage.getItem(MOTION_PREFERENCE_KEY);
    return stored === 'on' || stored === 'off' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

export function setMotionPreference(preference: MotionPreference): void {
  try {
    if (preference === 'auto') localStorage.removeItem(MOTION_PREFERENCE_KEY);
    else localStorage.setItem(MOTION_PREFERENCE_KEY, preference);
  } catch {
    return;
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useMotionPreference(): MotionPreference {
  return useSyncExternalStore(subscribe, readMotionPreference, () => 'auto');
}
