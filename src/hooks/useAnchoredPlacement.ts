// Keeps a floating panel inside the viewport: below its trigger when it fits, above when it doesn't,
// and scrolling inside itself only when neither side has room. Phones get {} so the CSS bottom sheet takes over.
import { useLayoutEffect, useState } from 'react';
import type { CSSProperties, RefObject } from 'react';

const GAP = 6;
const EDGE = 12;
const PHONE_MAX_WIDTH = 680;

export function useAnchoredPlacement(anchorEl: HTMLElement | null, panelRef: RefObject<HTMLElement | null>): CSSProperties {
  const [style, setStyle] = useState<CSSProperties>({});

  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!anchorEl || !panel) {
      setStyle({});
      return;
    }

    const place = () => {
      if (window.innerWidth <= PHONE_MAX_WIDTH) {
        setStyle({});
        return;
      }

      // Measure the panel at its natural height, then hand max-height back to React
      const previousMaxHeight = panel.style.maxHeight;
      panel.style.maxHeight = 'none';
      const height = panel.offsetHeight;
      const width = panel.offsetWidth;
      panel.style.maxHeight = previousMaxHeight;

      const anchor = anchorEl.getBoundingClientRect();
      const spaceBelow = window.innerHeight - anchor.bottom - GAP - EDGE;
      const spaceAbove = anchor.top - GAP - EDGE;

      let top: number;
      let maxHeight: number | undefined;
      let opensUp = false;
      if (height <= spaceBelow) {
        top = anchor.bottom + GAP;
      } else if (height <= spaceAbove) {
        top = anchor.top - GAP - height;
        opensUp = true;
      } else if (spaceBelow >= spaceAbove) {
        top = anchor.bottom + GAP;
        maxHeight = spaceBelow;
      } else {
        top = EDGE;
        maxHeight = spaceAbove;
        opensUp = true;
      }

      const left = Math.max(EDGE, Math.min(anchor.left, window.innerWidth - width - EDGE));
      setStyle({ top, left, maxHeight, transformOrigin: opensUp ? 'bottom left' : 'top left' });
    };

    place();
    // Content that grows after opening (e.g. the custom-time drawer) re-runs placement
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    window.addEventListener('resize', place);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', place);
    };
  }, [anchorEl, panelRef]);

  return style;
}
