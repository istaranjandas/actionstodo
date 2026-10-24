import { useMediaQuery } from './useMediaQuery';

// Breakpoints. CSS cannot read these, so keep them in step with the @media rules:
// 680 = phone, 1024 = non-desktop (narrow window or coarse pointer), 1025+ = the desktop pane.
export const COMPACT_QUERY = '(max-width: 680px)';
export const NON_DESKTOP_QUERY = '(max-width: 1024px), (hover: none) and (pointer: coarse)';
export const DESKTOP_SCROLL_PANE_QUERY = '(min-width: 1025px)';
export const COARSE_POINTER_QUERY = '(hover: none) and (pointer: coarse)';
export const FINE_POINTER_QUERY = '(hover: hover) and (pointer: fine)';
export const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

export interface MotionProfile {
  prefersReducedMotion: boolean;
  isTouchDevice: boolean;
  hasFinePointer: boolean;
}

// The device's own motion wish. The in-app Animations switch is applied on top of this in App.tsx,
// so either one can hold motion back.
export function useMotionProfile(): MotionProfile {
  const prefersReducedMotion = useMediaQuery(REDUCED_MOTION_QUERY);
  const isTouchDevice = useMediaQuery(COARSE_POINTER_QUERY);
  const hasFinePointer = useMediaQuery(FINE_POINTER_QUERY);
  return { prefersReducedMotion, isTouchDevice, hasFinePointer };
}
