import { useEffect } from 'react';
import type { RefObject } from 'react';

// True when the point is inside the element's box. A click can land on a child that the popup's own
// state change just re-rendered away (an icon swapped for another icon), and a detached target no
// longer answers `contains`, so geometry is the only reliable membership test.
function hitsBox(element: HTMLElement | null, x: number, y: number): boolean {
  if (!element) return false;
  const rect = element.getBoundingClientRect();
  return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
}

export function useDismissiblePopup(
  isOpen: boolean,
  close: () => void,
  popupRef: RefObject<HTMLElement | null>,
  triggerRef: RefObject<HTMLElement | null>
): void {
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as Node;
      const inPopup = Boolean(popupRef.current?.contains(target)) || hitsBox(popupRef.current, e.clientX, e.clientY);
      const inTrigger = Boolean(triggerRef.current?.contains(target)) || hitsBox(triggerRef.current, e.clientX, e.clientY);
      if (popupRef.current && !inPopup && !inTrigger) close();
    };
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [isOpen, close, popupRef, triggerRef]);
}
