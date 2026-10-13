import { createContext, useContext, useEffect } from 'react';
import type { RefObject } from 'react';
import gsap from 'gsap';

export interface InteractionPolish {
  tiltEnabled: boolean;
  magneticEnabled: boolean;
}

export const InteractionPolishContext = createContext<InteractionPolish>({ tiltEnabled: false, magneticEnabled: false });

export function useInteractionPolish(): InteractionPolish {
  return useContext(InteractionPolishContext);
}

interface SpringAxis {
  value: number;
  velocity: number;
  target: number;
}

const SPRING_STIFFNESS = 170;
const SPRING_DAMPING = 17;
const REST_THRESHOLD = 0.0005;

function stepSpring(axis: SpringAxis, deltaSeconds: number): boolean {
  const acceleration = SPRING_STIFFNESS * (axis.target - axis.value) - SPRING_DAMPING * axis.velocity;
  axis.velocity += acceleration * deltaSeconds;
  axis.value += axis.velocity * deltaSeconds;
  const atRest = Math.abs(axis.velocity) < REST_THRESHOLD && Math.abs(axis.target - axis.value) < REST_THRESHOLD;
  if (atRest) {
    axis.value = axis.target;
    axis.velocity = 0;
  }
  return atRest;
}

interface TiltOptions {
  maxTiltDegrees?: number;
  hoverScale?: number;
}

export function useTiltCard(cardRef: RefObject<HTMLElement | null>, { maxTiltDegrees = 3.5, hoverScale = 1.006 }: TiltOptions = {}): void {
  const { tiltEnabled } = useInteractionPolish();

  useEffect(() => {
    const card = cardRef.current;
    if (!card || !tiltEnabled) return;

    const rotateX: SpringAxis = { value: 0, velocity: 0, target: 0 };
    const rotateY: SpringAxis = { value: 0, velocity: 0, target: 0 };
    const scale: SpringAxis = { value: 1, velocity: 0, target: 1 };
    let isTicking = false;

    const render = () => {
      const isNeutral = rotateX.value === 0 && rotateY.value === 0 && scale.value === 1;
      card.style.transform = isNeutral
        ? ''
        : `perspective(1000px) rotateX(${rotateX.value.toFixed(3)}deg) rotateY(${rotateY.value.toFixed(3)}deg) scale3d(${scale.value.toFixed(4)}, ${scale.value.toFixed(4)}, 1)`;
    };

    const tick = (_time: number, deltaMs: number) => {
      const deltaSeconds = Math.min(deltaMs / 1000, 1 / 30);
      const settledX = stepSpring(rotateX, deltaSeconds);
      const settledY = stepSpring(rotateY, deltaSeconds);
      const settledScale = stepSpring(scale, deltaSeconds);
      render();
      if (settledX && settledY && settledScale) {
        gsap.ticker.remove(tick);
        isTicking = false;
      }
    };

    const startTicking = () => {
      if (isTicking) return;
      isTicking = true;
      gsap.ticker.add(tick);
    };

    const resetImmediately = () => {
      [rotateX, rotateY].forEach((axis) => Object.assign(axis, { value: 0, velocity: 0, target: 0 }));
      Object.assign(scale, { value: 1, velocity: 0, target: 1 });
      card.style.removeProperty('--glare-opacity');
      render();
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || card.classList.contains('is-drag-source') || card.querySelector('.is-editing')) return;
      const bounds = card.getBoundingClientRect();
      const relativeX = (event.clientX - bounds.left) / bounds.width;
      const relativeY = (event.clientY - bounds.top) / bounds.height;
      rotateX.target = (0.5 - relativeY) * 2 * maxTiltDegrees;
      rotateY.target = (relativeX - 0.5) * 2 * maxTiltDegrees;
      scale.target = hoverScale;
      card.style.setProperty('--glare-x', `${(relativeX * 100).toFixed(2)}%`);
      card.style.setProperty('--glare-y', `${(relativeY * 100).toFixed(2)}%`);
      card.style.setProperty('--glare-opacity', '1');
      startTicking();
    };

    const handlePointerLeave = () => {
      rotateX.target = 0;
      rotateY.target = 0;
      scale.target = 1;
      card.style.removeProperty('--glare-opacity');
      startTicking();
    };

    card.addEventListener('pointermove', handlePointerMove);
    card.addEventListener('pointerleave', handlePointerLeave);
    card.addEventListener('dragstart', resetImmediately);

    return () => {
      card.removeEventListener('pointermove', handlePointerMove);
      card.removeEventListener('pointerleave', handlePointerLeave);
      card.removeEventListener('dragstart', resetImmediately);
      gsap.ticker.remove(tick);
      resetImmediately();
    };
  }, [cardRef, tiltEnabled, maxTiltDegrees, hoverScale]);
}

interface MagneticOptions {
  strength?: number;
}

export function useMagneticPull(elementRef: RefObject<HTMLElement | null>, { strength = 0.32 }: MagneticOptions = {}): void {
  const { magneticEnabled } = useInteractionPolish();

  useEffect(() => {
    const element = elementRef.current;
    if (!element || !magneticEnabled) return;

    const moveX = gsap.quickTo(element, 'x', { duration: 0.45, ease: 'power3.out' });
    const moveY = gsap.quickTo(element, 'y', { duration: 0.45, ease: 'power3.out' });

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      const bounds = element.getBoundingClientRect();
      moveX((event.clientX - (bounds.left + bounds.width / 2)) * strength);
      moveY((event.clientY - (bounds.top + bounds.height / 2)) * strength);
    };

    const handlePointerLeave = () => {
      gsap.to(element, { x: 0, y: 0, duration: 0.9, ease: 'elastic.out(1, 0.38)', overwrite: true });
    };

    element.addEventListener('pointermove', handlePointerMove);
    element.addEventListener('pointerleave', handlePointerLeave);

    return () => {
      element.removeEventListener('pointermove', handlePointerMove);
      element.removeEventListener('pointerleave', handlePointerLeave);
      gsap.killTweensOf(element);
      gsap.set(element, { clearProps: 'transform' });
    };
  }, [elementRef, magneticEnabled, strength]);
}
