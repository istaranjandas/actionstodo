// Top-left of the HUD: the brand mark and the name of where you are on the path, like a game's area title
import { useCallback, useRef, useState } from 'react';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup';
import { DevilIcon } from './Icons';

interface LocationTitleProps {
  title: string;
  subtitle: string;
}

export function LocationTitle({ title, subtitle }: LocationTitleProps) {
  const [isDevilOpen, setIsDevilOpen] = useState(false);
  const devilButtonRef = useRef<HTMLButtonElement>(null);
  const devilPopupRef = useRef<HTMLDivElement>(null);
  const closeDevil = useCallback(() => setIsDevilOpen(false), []);
  useDismissiblePopup(isDevilOpen, closeDevil, devilPopupRef, devilButtonRef);

  return (
    <header className="location">
      <button
        type="button"
        className="brand-icon"
        title="Actionstodo — click me..."
        aria-label="Actionstodo devil mascot"
        data-sfx="open"
        ref={devilButtonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsDevilOpen(open => !open);
        }}
      >
        <DevilIcon size={20} />
      </button>

      <div className="location-copy" aria-live="polite">
        <span className="location-subtitle">{subtitle}</span>
        {/* Keyed so each new place name sweeps in */}
        <h1 className="location-title" key={title}>{title}</h1>
      </div>

      <div className={`devil-popup ${isDevilOpen ? 'open' : ''}`} ref={devilPopupRef}>
        <button type="button" className="devil-popup-close" aria-label="Close warning" onClick={() => setIsDevilOpen(false)}>
          &times;
        </button>
        <div className="devil-popup-icon">
          <DevilIcon size={24} />
        </div>
        <p className="devil-popup-text">If you don't complete the actions, then a devil will haunt you in sleep.</p>
        <button type="button" className="devil-popup-btn" onClick={() => setIsDevilOpen(false)}>
          I'll do them! 😨
        </button>
      </div>
    </header>
  );
}
