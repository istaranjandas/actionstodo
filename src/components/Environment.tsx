// The CSS valley: paints instantly while the 3D world loads, and stays as the world when WebGL is unavailable.
// Pure DOM + SVG layers moved with transforms only, so it costs almost nothing per frame.
import { useEffect, useRef } from 'react';
import type { ScrollerTarget } from '../hooks/useSmoothScroll';

interface EnvironmentProps {
  scroller: ScrollerTarget | null;
  parallaxEnabled: boolean;
  hidden?: boolean;
}

interface RidgeShape {
  seed: number;
  baseline: number;
  amplitude: number;
  detail: number;
}

const RIDGE_WIDTH = 1600;
const RIDGE_HEIGHT = 400;
const RIDGE_STEPS = 120;
const POINTER_EASING = 0.06;
const MAX_SCROLL_DEPTH = 2400;

const RIDGES: Record<'far' | 'mid' | 'near', RidgeShape> = {
  far: { seed: 1.7, baseline: 230, amplitude: 150, detail: 9 },
  mid: { seed: 4.2, baseline: 270, amplitude: 120, detail: 13 },
  near: { seed: 7.9, baseline: 320, amplitude: 90, detail: 17 }
};

// Ridged sine noise gives sharp summits and soft valleys, like a real skyline
function ridged(t: number, frequency: number, phase: number): number {
  return 1 - Math.abs(Math.sin(t * Math.PI * frequency + phase));
}

function buildRidgePath({ seed, baseline, amplitude, detail }: RidgeShape): string {
  let path = `M0 ${RIDGE_HEIGHT}`;
  for (let i = 0; i <= RIDGE_STEPS; i++) {
    const t = i / RIDGE_STEPS;
    const height = 0.58 * ridged(t, 1.4, seed) + 0.3 * ridged(t, 3.6, seed * 1.9) + 0.12 * Math.sin(t * Math.PI * detail + seed * 2.6);
    path += ` L${(t * RIDGE_WIDTH).toFixed(1)} ${(baseline - amplitude * height).toFixed(1)}`;
  }
  return `${path} L${RIDGE_WIDTH} ${RIDGE_HEIGHT} Z`;
}

const RIDGE_PATHS = {
  far: buildRidgePath(RIDGES.far),
  mid: buildRidgePath(RIDGES.mid),
  near: buildRidgePath(RIDGES.near)
};

function Ridge({ layer }: { layer: keyof typeof RIDGE_PATHS }) {
  return (
    <svg className={`env-ridge env-ridge-${layer}`} viewBox={`0 0 ${RIDGE_WIDTH} ${RIDGE_HEIGHT}`} preserveAspectRatio="none">
      <path d={RIDGE_PATHS[layer]} />
    </svg>
  );
}

export function Environment({ scroller, parallaxEnabled, hidden = false }: EnvironmentProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  // Pointer parallax: layers lean gently toward the cursor, eased so they never jitter
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !parallaxEnabled) return;
    const target = { x: 0, y: 0 };
    const current = { x: 0, y: 0 };
    let frame = 0;

    const step = () => {
      current.x += (target.x - current.x) * POINTER_EASING;
      current.y += (target.y - current.y) * POINTER_EASING;
      root.style.setProperty('--env-x', current.x.toFixed(4));
      root.style.setProperty('--env-y', current.y.toFixed(4));
      const isSettled = Math.abs(target.x - current.x) + Math.abs(target.y - current.y) < 0.001;
      frame = isSettled ? 0 : requestAnimationFrame(step);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      target.x = (event.clientX / window.innerWidth) * 2 - 1;
      target.y = (event.clientY / window.innerHeight) * 2 - 1;
      if (!frame) frame = requestAnimationFrame(step);
    };

    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      cancelAnimationFrame(frame);
      root.style.removeProperty('--env-x');
      root.style.removeProperty('--env-y');
    };
  }, [parallaxEnabled]);

  // Scroll depth: nearer layers travel further as the task feed scrolls
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !scroller || !parallaxEnabled) return;
    let frame = 0;
    const readScrollTop = () => (scroller instanceof Window ? scroller.scrollY : scroller.scrollTop);
    const applyScroll = () => {
      frame = 0;
      root.style.setProperty('--env-scroll', String(Math.min(readScrollTop(), MAX_SCROLL_DEPTH)));
    };
    const handleScroll = () => {
      if (!frame) frame = requestAnimationFrame(applyScroll);
    };
    applyScroll();
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      scroller.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(frame);
      root.style.removeProperty('--env-scroll');
    };
  }, [scroller, parallaxEnabled]);

  return (
    <div className={`environment ${hidden ? 'is-hidden' : ''}`} ref={rootRef} aria-hidden="true">
      <div className="env-sky" />
      <div className="env-stars" />
      <div className="env-sun" />
      <Ridge layer="far" />
      <div className="env-haze env-haze-far" />
      <Ridge layer="mid" />
      <div className="env-haze env-haze-near" />
      <Ridge layer="near" />
      <div className="env-grain" />
      <div className="env-vignette" />
    </div>
  );
}
