// The one system control in the HUD: the mascot key opens the profile panel — time of day, account,
// help and the creator's contact
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { Keyboard, Moon, Sun } from 'lucide-react';
import { auth, googleProvider, signInWithPopup, signOut } from '../firebase';
import { pushToast } from '../modules/toasts';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup';
import { CreatorAvatarIcon, DevilIcon, GoogleIcon } from './Icons';
import type { AppState, Theme } from '../types';

const CREATOR_EMAIL = 'istaranjandas@gmail.com';

interface SystemMenuProps {
  appState: AppState;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
  onOpenControls: () => void;
}

export function SystemMenu({ appState, theme, onSetTheme, onOpenControls }: SystemMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const titleId = useId();
  const { currentUser } = appState;

  const close = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    setIsOpen(false);
  }, []);
  useDismissiblePopup(isOpen, close, panelRef, triggerRef);

  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]')?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error('Sign-in error:', err);
        pushToast({ message: 'Could not sign in', detail: error.message, tone: 'danger' });
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  };

  const handleCopyEmail = async (e: MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(CREATOR_EMAIL);
      }
    } catch {
      // Clipboard may be blocked; the label still confirms so the user can copy manually
    }
    setCopyLabel('Copied!');
    window.clearTimeout(copyTimer.current);
    copyTimer.current = window.setTimeout(() => setCopyLabel('Copy'), 2000);
  };

  const profileName = currentUser ? currentUser.displayName || currentUser.email || 'Signed in' : 'Guest';

  return (
    <div className={`system-menu ${isOpen ? 'is-open' : ''}`}>
      <button
        type="button"
        className={`system-trigger is-profile ${isOpen ? 'is-active' : ''}`}
        aria-label="Profile and settings"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Profile"
        data-sfx={isOpen ? 'close' : 'open'}
        ref={triggerRef}
        onClick={() => setIsOpen(open => !open)}
      >
        <DevilIcon size={18} aria-hidden="true" />
      </button>

      {/* Dim and block the workspace so task rows cannot read through the settings panel */}
      {isOpen && <div className="system-scrim" aria-hidden="true" onClick={close} />}

      {isOpen && (
        <div className="system-panel" role="dialog" aria-labelledby={titleId} ref={panelRef} data-lenis-prevent>
          <div className="settings-header profile-head">
            <span className="profile-avatar" aria-hidden="true"><DevilIcon size={20} /></span>
            <span className="profile-copy">
              <span className="settings-title" id={titleId}>{profileName}</span>
              <span className="profile-hint">{currentUser ? 'Synced across your devices' : 'Tasks are saved on this device'}</span>
            </span>
          </div>

          <section className="settings-section">
            <span className="settings-section-label">Time of day</span>
            <div className="segmented" role="radiogroup" aria-label="Time of day">
              {([['dark', 'Dusk', Moon], ['light', 'Daylight', Sun]] as const).map(([value, label, Icon]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={theme === value}
                  className={`segmented-option ${theme === value ? 'is-active' : ''}`}
                  data-sfx="select"
                  onClick={() => onSetTheme(value)}
                >
                  <Icon size={15} strokeWidth={2} aria-hidden="true" />
                  <span>{label}</span>
                </button>
              ))}
            </div>
          </section>

          <section className="settings-section">
            <span className="settings-section-label">Account</span>
            {currentUser ? (
              <div className="system-account">
                <span className="system-account-name">
                  <span className="cloud-status-dot" aria-hidden="true" />
                  {currentUser.displayName || currentUser.email || 'Signed in'}
                </span>
                <button type="button" className="system-action" onClick={handleSignOut}>Log out</button>
              </div>
            ) : (
              <button type="button" className="system-action is-wide" title="Sign in with Google to sync across all your devices" onClick={handleSignIn}>
                <GoogleIcon />
                <span>Sign in with Google to sync</span>
              </button>
            )}
          </section>

          <section className="settings-section system-grid">
            <button type="button" className="system-action" data-sfx="open" onClick={() => { setIsOpen(false); onOpenControls(); }}>
              <Keyboard size={16} strokeWidth={2} aria-hidden="true" />
              <span>Controls</span>
              <kbd className="btn-kbd">?</kbd>
            </button>
          </section>

          <section className="settings-section system-creator">
            <span className="settings-section-label">Creator</span>
            <div className="creator-contact-box">
              <CreatorAvatarIcon size={26} />
              <a href={`mailto:${CREATOR_EMAIL}`} className="creator-email-anchor">{CREATOR_EMAIL}</a>
              <button type="button" className="creator-copy-email-btn" title="Copy email" onClick={handleCopyEmail}>
                <span>{copyLabel}</span>
              </button>
            </div>
          </section>

        </div>
      )}
    </div>
  );
}
