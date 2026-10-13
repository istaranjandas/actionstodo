import { useCallback, useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup';
import { useMagneticPull } from '../hooks/useInteractionPolish';
import { CreatorAvatarIcon } from './Icons';

const CREATOR_EMAIL = 'istaranjandas@gmail.com';

export function CreatorBadge() {
  const [isOpen, setIsOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const resetTimer = useRef<number | undefined>(undefined);
  const close = useCallback(() => setIsOpen(false), []);
  useDismissiblePopup(isOpen, close, popupRef, buttonRef);
  useMagneticPull(buttonRef, { strength: 0.4 });

  useEffect(() => () => window.clearTimeout(resetTimer.current), []);

  const handleCopy = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(CREATOR_EMAIL);
      }
    } catch {
      // Clipboard may be blocked; the label still confirms so the user can copy manually
    }
    setCopyLabel('Copied!');
    window.clearTimeout(resetTimer.current);
    resetTimer.current = window.setTimeout(() => setCopyLabel('Copy'), 2000);
  };

  return (
    <div className="creator-badge-dock" id="creatorBadgeDock">
      <button
        type="button"
        className="creator-boy-btn"
        title="Hi - I am the creator"
        aria-label="Contact Creator"
        ref={buttonRef}
        onClick={(e) => {
          e.stopPropagation();
          setIsOpen(open => !open);
        }}
      >
        <CreatorAvatarIcon className="creator-boy-icon" size={28} />
      </button>

      <div className={`creator-popup ${isOpen ? 'open' : ''}`} ref={popupRef}>
        <button
          type="button"
          className="creator-popup-close-btn"
          aria-label="Close creator popup"
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen(false);
          }}
        >
          &times;
        </button>
        <div className="creator-popup-header">
          <div className="creator-popup-avatar-wrap">
            <CreatorAvatarIcon size={34} />
          </div>
          <div>
            <div className="creator-popup-title">Creator</div>
            <div className="creator-popup-subtitle">Actionstodo</div>
          </div>
        </div>
        <p className="creator-popup-body">
          Hi - I am the creator, feel free to contact me here:
        </p>
        <div className="creator-contact-box">
          <a href={`mailto:${CREATOR_EMAIL}`} className="creator-email-anchor">{CREATOR_EMAIL}</a>
          <button type="button" className="creator-copy-email-btn" title="Copy email" onClick={handleCopy}>
            <span>{copyLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
