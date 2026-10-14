import { useMediaQuery } from './useMediaQuery';

export const NON_DESKTOP_QUERY = '(max-width: 1024px), (hover: none) and (pointer: coarse)';
export const DESKTOP_SCROLL_PANE_QUERY = '(min-width: 1025px)';

export interface MotionProfile {
  prefersReducedMotion: boolean;
  isTouchDevice: boolean;
  hasFinePointer: boolean;
}

// Motion always runs, except when the device asks for reduced motion
export function useMotionProfile(): MotionProfile {
  const prefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isTouchDevice = useMediaQuery('(hover: none) and (pointer: coarse)');
  const hasFinePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  return { prefersReducedMotion, isTouchDevice, hasFinePointer };
}
