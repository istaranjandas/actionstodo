// Pointer, scroll and activity signals written by the interface and read by the render loop.
// Plain mutable values: high-frequency input never touches React state.
export const IDLE_AFTER_MS = 25000;

export const worldInput = {
  pointerX: 0,
  pointerY: 0,
  scroll: 0,
  lastActivityAt: performance.now()
};

export function markWorldActivity(): void {
  worldInput.lastActivityAt = performance.now();
}

export function isWorldIdle(now = performance.now()): boolean {
  return now - worldInput.lastActivityAt > IDLE_AFTER_MS;
}
