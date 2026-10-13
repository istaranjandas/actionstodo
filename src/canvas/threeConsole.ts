import { setConsoleFunction } from 'three';

type ConsoleLevel = 'log' | 'warn' | 'error';

const isClockDeprecation = (message: string) => message.startsWith('THREE.Clock: This module has been deprecated');

const isPrecisionOnlyShaderLog = (message: string, params: unknown[]) => {
  if (!message.startsWith('THREE.WebGLProgram: Program Info Log:') || typeof params[0] !== 'string') return false;
  const logLines = params[0].split('\n').map((line) => line.trim()).filter(Boolean);
  return logLines.length > 0 && logLines.every((line) => line.includes('warning X4122'));
};

export function routeThreeConsole(): void {
  setConsoleFunction((level: ConsoleLevel, message: string, ...params: unknown[]) => {
    if (level === 'warn' && (isClockDeprecation(message) || isPrecisionOnlyShaderLog(message, params))) return;
    console[level](message, ...params);
  });
}
