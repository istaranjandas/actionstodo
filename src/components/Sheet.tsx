// Bottom sheet for tablets and phones: slides up from the dock, closes on Esc or backdrop tap
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { usePresence } from '../hooks/usePresence';

interface SheetProps {
  isOpen: boolean;
  label: string;
  onClose: () => void;
  children: ReactNode;
}

export function Sheet({ isOpen, label, onClose, children }: SheetProps) {
  const { isMounted, isClosing } = usePresence(isOpen, 240);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const returnFocusTo = document.activeElement as HTMLElement | null;
    panelRef.current?.focus({ preventScroll: true });
    return () => returnFocusTo?.focus?.({ preventScroll: true });
  }, [isOpen]);

  if (!isMounted) return null;

  return (
    <div className={`sheet-layer ${isClosing ? 'is-closing' : ''}`}>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet-panel" role="dialog" aria-label={label} tabIndex={-1} ref={panelRef} data-lenis-prevent>
        <span className="sheet-grip" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}
