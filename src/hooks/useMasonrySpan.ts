import { useLayoutEffect } from 'react';
import type { RefObject } from 'react';

export const MASONRY_ROW_UNIT_PX = 2;
export const MASONRY_GAP_PX = 18;

export function useMasonrySpan(cardRef: RefObject<HTMLElement | null>): void {
  useLayoutEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const applySpan = () => {
      const rowSpan = Math.ceil((card.offsetHeight + MASONRY_GAP_PX) / MASONRY_ROW_UNIT_PX);
      card.style.gridRowEnd = `span ${rowSpan}`;
    };

    applySpan();
    const resizeObserver = new ResizeObserver(applySpan);
    resizeObserver.observe(card);

    return () => {
      resizeObserver.disconnect();
      card.style.removeProperty('grid-row-end');
    };
  }, [cardRef]);
}
