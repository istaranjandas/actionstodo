import { useEffect } from 'react';
import type { RefObject } from 'react';

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
      if (popupRef.current && !popupRef.current.contains(target) && triggerRef.current && !triggerRef.current.contains(target)) {
        close();
      }
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
