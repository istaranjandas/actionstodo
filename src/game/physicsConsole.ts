const RAPIER_INIT_NOTICE = 'using deprecated parameters for the initialization function; pass a single object instead';

let isFilterInstalled = false;

export function silenceRapierInitNotice(): void {
  if (isFilterInstalled) return;
  isFilterInstalled = true;
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (args.length === 1 && args[0] === RAPIER_INIT_NOTICE) return;
    originalWarn.apply(console, args);
  };
}
