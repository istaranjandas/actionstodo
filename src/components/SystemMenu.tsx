// The one system control in the HUD: sound, time of day, account, mode, help and the creator's contact
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import type { CSSProperties, MouseEvent, ReactNode } from 'react';
import { Car, Gamepad2, Keyboard, Menu, Moon, Music, Sun, Volume2, X } from 'lucide-react';
import { auth, googleProvider, signInWithPopup, signOut } from '../firebase';
import { updateSoundSettings, useSoundSettings } from '../audio/soundSettings';
import { playUiSound } from '../audio/uiSounds';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup';
import { CreatorAvatarIcon, GoogleIcon } from './Icons';
import type { AppState, Theme } from '../types';

const CREATOR_EMAIL = 'istaranjandas@gmail.com';

interface SoundSettingRowProps {
  icon: ReactNode;
  label: string;
  hint: string;
  enabled: boolean;
  volume: number;
  onToggle: () => void;
  onVolumeChange: (volume: number) => void;
  onVolumeCommit?: () => void;
}

function SoundSettingRow({ icon, label, hint, enabled, volume, onToggle, onVolumeChange, onVolumeCommit }: SoundSettingRowProps) {
  const labelId = useId();
  const percent = Math.round(volume * 100);

  return (
    <div className={`settings-row ${enabled ? 'is-on' : ''}`}>
      <div className="settings-row-head">
        <span className="settings-row-icon" aria-hidden="true">{icon}</span>
        <span className="settings-row-copy">
          <span className="settings-row-label" id={labelId}>{label}</span>
          <span className="settings-row-hint">{hint}</span>
        </span>
        <button type="button" role="switch" aria-checked={enabled} aria-labelledby={labelId} className="settings-switch" data-sfx="none" onClick={onToggle}>
          <span className="settings-switch-thumb" />
        </button>
      </div>
      <label className="settings-volume">
        <span className="settings-volume-label">Volume</span>
        <input
          type="range"
          className="settings-slider"
          min={0}
          max={100}
          step={5}
          value={percent}
          disabled={!enabled}
          aria-label={`${label} volume`}
          style={{ '--slider-fill': `${percent}%` } as CSSProperties}
          onChange={(e) => onVolumeChange(Number(e.target.value) / 100)}
          onPointerUp={onVolumeCommit}
          onKeyUp={onVolumeCommit}
        />
        <span className="settings-volume-value">{percent}%</span>
      </label>
    </div>
  );
}

interface SystemMenuProps {
  appState: AppState;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
  onEnterGameMode: () => void;
  onOpenControls: () => void;
}

export function SystemMenu({ appState, theme, onSetTheme, onEnterGameMode, onOpenControls }: SystemMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copyLabel, setCopyLabel] = useState('Copy');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const copyTimer = useRef<number | undefined>(undefined);
  const titleId = useId();
  const { effectsEnabled, effectsVolume, musicEnabled, musicVolume } = useSoundSettings();
  const { currentUser } = appState;

  const close = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    setIsOpen(false);
  }, []);
  useDismissiblePopup(isOpen, close, panelRef, triggerRef);

  useEffect(() => {
    if (isOpen) panelRef.current?.querySelector<HTMLElement>('[role="switch"]')?.focus({ preventScroll: true });
  }, [isOpen]);

  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  // Turning sound off plays its cue first; turning it on plays the cue once the bus is live
  const toggleEffects = () => {
    if (effectsEnabled) {
      playUiSound('toggleOff');
      updateSoundSettings({ effectsEnabled: false });
    } else {
      updateSoundSettings({ effectsEnabled: true });
      playUiSound('toggleOn');
    }
  };

  const toggleMusic = () => {
    playUiSound(musicEnabled ? 'toggleOff' : 'toggleOn');
    updateSoundSettings({ musicEnabled: !musicEnabled });
  };

  const handleSignIn = async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      const error = err as { code?: string; message?: string };
      if (error.code !== 'auth/popup-closed-by-user') {
        console.error('Sign-in error:', err);
        alert('Could not sign in: ' + error.message);
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

  return (
    <div className="system-menu">
      <span className={`sync-lamp ${currentUser ? 'is-live' : ''}`} title={currentUser ? 'Cloud sync is live' : 'Saved on this device'} aria-hidden="true" />
      <a href="/alpineoverride/" className="system-trigger is-icon" aria-label="Play Alpine Overdrive" title="Play Alpine Overdrive">
        <Car size={18} strokeWidth={2.2} aria-hidden="true" />
      </a>
      <button
        type="button"
        className={`system-trigger ${isOpen ? 'is-active' : ''}`}
        aria-label="System menu"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        data-sfx={isOpen ? 'close' : 'open'}
        ref={triggerRef}
        onClick={() => setIsOpen(open => !open)}
      >
        {isOpen ? <X size={18} strokeWidth={2.2} aria-hidden="true" /> : <Menu size={18} strokeWidth={2.2} aria-hidden="true" />}
        <span className="system-trigger-label">System</span>
      </button>

      {isOpen && (
        <div className="system-panel" role="dialog" aria-labelledby={titleId} ref={panelRef} data-lenis-prevent>
          <div className="settings-header">
            <span className="settings-title" id={titleId}>System</span>
          </div>

          <section className="settings-section">
            <span className="settings-section-label">Audio</span>
            <SoundSettingRow
              icon={<Volume2 size={16} strokeWidth={2} />}
              label="Sound effects"
              hint="Hover ticks, drops and mission-complete chimes"
              enabled={effectsEnabled}
              volume={effectsVolume}
              onToggle={toggleEffects}
              onVolumeChange={(volume) => updateSoundSettings({ effectsVolume: volume })}
              onVolumeCommit={() => playUiSound('select')}
            />
            <SoundSettingRow
              icon={<Music size={16} strokeWidth={2} />}
              label="Ambient music"
              hint="A quiet, evolving soundtrack"
              enabled={musicEnabled}
              volume={musicVolume}
              onToggle={toggleMusic}
              onVolumeChange={(volume) => updateSoundSettings({ musicVolume: volume })}
            />
          </section>

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
            <button type="button" className="system-action" data-sfx="select" onClick={() => { setIsOpen(false); onEnterGameMode(); }}>
              <Gamepad2 size={16} strokeWidth={2} aria-hidden="true" />
              <span>Game mode</span>
            </button>
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

          <p className="settings-note">Animations follow your device’s reduced-motion setting.</p>
        </div>
      )}
    </div>
  );
}
