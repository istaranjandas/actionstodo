// One place where third-party noise is filtered out of the console, so the app's own logging
// stays readable. Both filters are idempotent and only ever installed from the lazily loaded 3D
// chunks, so nothing here costs the initial bundle.
import { setConsoleFunction } from 'three';

type ConsoleLevel = 'log' | 'warn' | 'error';

const RAPIER_INIT_NOTICE =
  'using deprecated parameters for the initialization function; pass a single object instead';

let isRapierFilterInstalled = false;

// Rapier warns about its own deprecated init signature; nothing the app can act on
export function silenceRapierInitNotice(): void {
  if (isRapierFilterInstalled) return;
  isRapierFilterInstalled = true;
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (args.length === 1 && args[0] === RAPIER_INIT_NOTICE) return;
    originalWarn.apply(console, args);
  };
}

const isClockDeprecation = (message: string) => message.startsWith('THREE.Clock: This module has been deprecated');

const isPrecisionOnlyShaderLog = (message: string, params: unknown[]) => {
  if (!message.startsWith('THREE.WebGLProgram: Program Info Log:') || typeof params[0] !== 'string') return false;
  const logLines = params[0].split('\n').map((line) => line.trim()).filter(Boolean);
  return logLines.length > 0 && logLines.every((line) => line.includes('warning X4122'));
};

// three routes its own messages through a settable hook; drop the two classes of noise it emits
// on this stack and forward everything else unchanged
export function routeThreeConsole(): void {
  setConsoleFunction((level: ConsoleLevel, message: string, ...params: unknown[]) => {
    if (level === 'warn' && (isClockDeprecation(message) || isPrecisionOnlyShaderLog(message, params))) return;
    console[level](message, ...params);
  });
}
