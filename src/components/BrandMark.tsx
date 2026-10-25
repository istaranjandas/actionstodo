// The brand mark: the horned mascot anchoring the far left of the top dock. Clicking it is the one
// easter egg in the console, so it owns its own dismissible popup.
import { useCallback, useRef, useState } from 'react';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup';
import { DevilIcon } from './Icons';

export function BrandMark() {
  const [isOpen, setIsOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const close = useCallback(() => setIsOpen(false), []);
  useDismissiblePopup(isOpen, close, popupRef, buttonRef);

  return (
    <div className="brand-mark">
      <button
        type="button"
        className="brand-icon"
        title="Actionstodo — click me..."
        aria-label="Actionstodo devil mascot"
        aria-expanded={isOpen}
        data-sfx="open"
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(open => !open);
        }}
      >
        <DevilIcon size={18} />
      </button>

      <div className={`devil-popup ${isOpen ? 'open' : ''}`} ref={popupRef}>
        <button type="button" className="devil-popup-close" aria-label="Close warning" onClick={close}>
          &times;
        </button>
        <div className="devil-popup-icon">
          <DevilIcon size={24} />
        </div>
        <p className="devil-popup-text">If you don't complete the actions, then a devil will haunt you in sleep.</p>
        <button type="button" className="devil-popup-btn" onClick={close}>
          I'll do them! 😨
        </button>
      </div>
    </div>
  );
}
