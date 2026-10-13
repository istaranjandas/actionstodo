import { useMediaQuery } from './useMediaQuery';
import { useMotionPreference } from './useMotionPreference';
import type { MotionPreference } from './useMotionPreference';

export const NON_DESKTOP_QUERY = '(max-width: 1024px), (hover: none) and (pointer: coarse)';
export const DESKTOP_SCROLL_PANE_QUERY = '(min-width: 1025px)';

export interface MotionProfile {
  prefersReducedMotion: boolean;
  systemPrefersReducedMotion: boolean;
  motionPreference: MotionPreference;
  isTouchDevice: boolean;
  hasFinePointer: boolean;
}

export function useMotionProfile(): MotionProfile {
  const systemPrefersReducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const motionPreference = useMotionPreference();
  const isTouchDevice = useMediaQuery('(hover: none) and (pointer: coarse)');
  const hasFinePointer = useMediaQuery('(hover: hover) and (pointer: fine)');
  const prefersReducedMotion = motionPreference === 'auto' ? systemPrefersReducedMotion : motionPreference === 'off';
  return { prefersReducedMotion, systemPrefersReducedMotion, motionPreference, isTouchDevice, hasFinePointer };
}
