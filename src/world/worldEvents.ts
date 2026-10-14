// Tiny event channel from the interface to the 3D world.
// Lives outside the lazy world chunk so UI code can fire events without loading three.js.
export type WorldEvent = { type: 'complete'; taskId: string } | { type: 'add' };

type WorldListener = (event: WorldEvent) => void;

const listeners = new Set<WorldListener>();

export function emitWorldEvent(event: WorldEvent): void {
  listeners.forEach((listener) => listener(event));
}

export function subscribeWorldEvents(listener: WorldListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
