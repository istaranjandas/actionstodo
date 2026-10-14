// Hosts the 3D world: the CSS valley paints instantly, then the WebGL world loads in idle time and fades in.
// Without WebGL (or after a lost context) the CSS valley simply stays.
import { lazy, Suspense, useEffect, useState } from 'react';
import { Environment } from '../components/Environment';
import { markWorldActivity, worldInput } from './worldInput';
import type { WorldLens } from './worldViews';
import type { WorldDay } from './worldBridge';
import type { ScrollerTarget } from '../hooks/useSmoothScroll';
import type { Theme } from '../types';

const WorldCanvas = lazy(() => import('./WorldCanvas'));

type WorldStatus = 'waiting' | 'loading' | 'ready' | 'unavailable';

function supportsWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

interface WorldStageProps {
  lens: WorldLens;
  focusOffset: number;
  weekStartOffset: number;
  days: WorldDay[];
  theme: Theme;
  reducedMotion: boolean;
  hasFinePointer: boolean;
  isCompact: boolean;
  scroller: ScrollerTarget | null;
}

export function WorldStage({ lens, focusOffset, weekStartOffset, days, theme, reducedMotion, hasFinePointer, isCompact, scroller }: WorldStageProps) {
  const [status, setStatus] = useState<WorldStatus>(() => (supportsWebGL() ? 'waiting' : 'unavailable'));

  // Let the interface paint and settle first; the world chunk is the heaviest download
  useEffect(() => {
    if (status !== 'waiting') return;
    const begin = () => setStatus('loading');
    if (typeof window.requestIdleCallback === 'function') {
      const handle = window.requestIdleCallback(begin, { timeout: 1500 });
      return () => window.cancelIdleCallback(handle);
    }
    const timer = setTimeout(begin, 400);
    return () => clearTimeout(timer);
  }, [status]);

  useEffect(() => {
    const handlePointerMove = (event: PointerEvent) => {
      markWorldActivity();
      if (event.pointerType !== 'mouse' || !hasFinePointer) return;
      worldInput.pointerX = (event.clientX / window.innerWidth) * 2 - 1;
      worldInput.pointerY = (event.clientY / window.innerHeight) * 2 - 1;
    };
    window.addEventListener('pointermove', handlePointerMove, { passive: true });
    window.addEventListener('pointerdown', markWorldActivity, { passive: true });
    window.addEventListener('keydown', markWorldActivity);
    window.addEventListener('wheel', markWorldActivity, { passive: true });
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerdown', markWorldActivity);
      window.removeEventListener('keydown', markWorldActivity);
      window.removeEventListener('wheel', markWorldActivity);
      worldInput.pointerX = 0;
      worldInput.pointerY = 0;
    };
  }, [hasFinePointer]);

  // Scrolling the task list tilts the camera down a touch
  useEffect(() => {
    if (!scroller) return;
    const readScrollTop = () => (scroller instanceof Window ? scroller.scrollY : scroller.scrollTop);
    const handleScroll = () => {
      markWorldActivity();
      worldInput.scroll = Math.min(1, readScrollTop() / 1400);
    };
    handleScroll();
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, [scroller]);

  useEffect(() => markWorldActivity(), [lens, focusOffset, theme, days]);

  const isWorldReady = status === 'ready';
  const showWorld = status === 'loading' || status === 'ready';

  return (
    <>
      <Environment scroller={scroller} parallaxEnabled={!reducedMotion && hasFinePointer && !isWorldReady} hidden={isWorldReady} />
      {showWorld && (
        <div className={`world-stage ${isWorldReady ? 'is-ready' : ''}`} aria-hidden="true">
          <Suspense fallback={null}>
            <WorldCanvas
              lens={lens}
              focusOffset={focusOffset}
              weekStartOffset={weekStartOffset}
              days={days}
              theme={theme}
              reducedMotion={reducedMotion}
              isCompact={isCompact}
              onReady={() => setStatus('ready')}
              onContextLost={() => setStatus('unavailable')}
            />
          </Suspense>
        </div>
      )}
    </>
  );
}
