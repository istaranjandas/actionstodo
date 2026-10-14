import { useEffect, useState } from 'react';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

let activeLenis: Lenis | null = null;

export function scrollContentToTop(): void {
  if (activeLenis) {
    activeLenis.scrollTo(0);
    return;
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

export type ScrollerTarget = HTMLElement | Window;

export function readScrollTop(scroller: ScrollerTarget): number {
  return scroller instanceof Window ? scroller.scrollY : scroller.scrollTop;
}

// Jump straight to a remembered position (used when returning to a view)
export function restoreScrollPosition(scroller: ScrollerTarget, top: number): void {
  if (activeLenis) {
    activeLenis.scrollTo(top, { immediate: true, force: true });
    return;
  }
  scroller.scrollTo({ top, behavior: 'instant' as ScrollBehavior });
}

interface SmoothScrollOptions {
  scrollPane: HTMLElement | null;
  usePaneAsScroller: boolean;
  smoothingEnabled: boolean;
}

export function useSmoothScroll({ scrollPane, usePaneAsScroller, smoothingEnabled }: SmoothScrollOptions): ScrollerTarget | null {
  const [scroller, setScroller] = useState<ScrollerTarget | null>(null);

  useEffect(() => {
    if (!scrollPane) return;
    const scrollTarget: ScrollerTarget = usePaneAsScroller ? scrollPane : window;
    setScroller(scrollTarget);

    if (!smoothingEnabled) {
      return () => {
        setScroller(null);
      };
    }

    const lenis = new Lenis({
      wrapper: usePaneAsScroller ? scrollPane : window,
      content: usePaneAsScroller ? scrollPane : document.documentElement,
      autoRaf: false,
      lerp: 0.1,
      smoothWheel: true,
      prevent: (node: HTMLElement) => Boolean(node.closest?.('[data-lenis-prevent], .week-table-scroll, .time-popover, .settings-panel, .side-console'))
    });
    activeLenis = lenis;

    const handleScroll = () => {
      ScrollTrigger.update();
    };
    const advanceLenis = (time: number) => lenis.raf(time * 1000);

    lenis.on('scroll', handleScroll);
    gsap.ticker.add(advanceLenis);
    gsap.ticker.lagSmoothing(0);

    return () => {
      gsap.ticker.remove(advanceLenis);
      lenis.off('scroll', handleScroll);
      lenis.destroy();
      if (activeLenis === lenis) activeLenis = null;
      setScroller(null);
    };
  }, [scrollPane, usePaneAsScroller, smoothingEnabled]);

  return scroller;
}
