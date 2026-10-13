import { useCallback, useRef, useState } from 'react';
import { auth, googleProvider, signInWithPopup, signOut } from '../firebase';
import { getLocalISODate, getWeekDates } from '../modules/dateUtils';
import { useMagneticPull } from '../hooks/useInteractionPolish';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup';
import { MiniCalendar } from './MiniCalendar';
import { DevilIcon, GoogleIcon, MoonIcon, MotionIcon, SidebarViewIcon, SunIcon } from './Icons';
import type { AppState, Task, Theme, ViewName } from '../types';

interface SidebarProps {
  appState: AppState;
  theme: Theme;
  onToggleTheme: () => void;
  isMotionEnabled: boolean;
  onToggleMotion: () => void;
  onSelectView: (view: ViewName) => void;
  onPickDate: (dateStr: string | null) => void;
}

const SIDEBAR_VIEWS: { view: ViewName; label: string }[] = [
  { view: 'all', label: 'All dates' },
  { view: 'today', label: 'Today' },
  { view: 'this-week', label: 'This week' },
  { view: 'upcoming', label: 'Upcoming' },
  { view: 'completed', label: 'Completed' }
];

function countForView(view: ViewName, tasks: Task[]): number {
  const today = getLocalISODate();
  const week = getWeekDates(0);
  const open = tasks.filter(t => !t.completed);
  switch (view) {
    case 'today':
      return open.filter(t => t.date === today).length;
    case 'this-week':
      return open.filter(t => t.date >= week[0] && t.date <= week[6]).length;
    case 'upcoming':
      return open.filter(t => t.date >= today).length;
    case 'completed':
      return tasks.length - open.length;
    default:
      return open.length;
  }
}

export function Sidebar({ appState, theme, onToggleTheme, isMotionEnabled, onToggleMotion, onSelectView, onPickDate }: SidebarProps) {
  const [isDevilOpen, setIsDevilOpen] = useState(false);
  const devilButtonRef = useRef<HTMLButtonElement>(null);
  const devilPopupRef = useRef<HTMLDivElement>(null);
  const signInRef = useRef<HTMLButtonElement>(null);
  const closeDevil = useCallback(() => setIsDevilOpen(false), []);
  useDismissiblePopup(isDevilOpen, closeDevil, devilPopupRef, devilButtonRef);
  useMagneticPull(signInRef, { strength: 0.22 });

  const { currentUser, currentView, isTableView, specificDateFilter, tasks } = appState;

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

  return (
    <aside className="sidebar">
      <header className="top-bar">
        <div className="brand">
          <button
            type="button"
            className="brand-icon"
            title="Click me..."
            aria-label="Devil mascot"
            ref={devilButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              setIsDevilOpen(open => !open);
            }}
          >
            <DevilIcon size={20} />
          </button>
          <span>Actionstodo</span>

          <div className={`devil-popup ${isDevilOpen ? 'open' : ''}`} ref={devilPopupRef}>
            <button
              type="button"
              className="devil-popup-close"
              aria-label="Close warning"
              onClick={(e) => {
                e.stopPropagation();
                setIsDevilOpen(false);
              }}
            >
              &times;
            </button>
            <div className="devil-popup-icon">
              <DevilIcon size={24} />
            </div>
            <p className="devil-popup-text">
              If you don't complete the actions, then a devil will haunt you in sleep.
            </p>
            <button
              type="button"
              className="devil-popup-btn"
              onClick={(e) => {
                e.stopPropagation();
                setIsDevilOpen(false);
              }}
            >
              I'll do them! 😨
            </button>
          </div>
        </div>
      </header>

      <nav className="sidebar-nav" aria-label="Views">
        {SIDEBAR_VIEWS.map(({ view, label }) => {
          const count = countForView(view, tasks);
          const isActive = !isTableView && !specificDateFilter && view === currentView;
          return (
            <button
              key={view}
              type="button"
              className={`filter-menu-item sidebar-item ${isActive ? 'active' : ''}`}
              data-view={view}
              onClick={() => onSelectView(view)}
            >
              <SidebarViewIcon view={view} />
              <span className="sidebar-item-text">{label}</span>
              <span className="sidebar-count">{count ? String(count) : ''}</span>
            </button>
          );
        })}
      </nav>

      <section className="sidebar-calendar">
        <div className="sidebar-label">Calendar</div>
        <div id="miniCalendar">
          <MiniCalendar
            tasks={tasks}
            selected={specificDateFilter}
            onPick={(dateStr) => onPickDate(dateStr === specificDateFilter ? null : dateStr)}
          />
        </div>
      </section>

      <div className="top-actions sidebar-footer">
        <div className="auth-container">
          <button
            type="button"
            className="auth-login-btn"
            title="Sign in with Google to sync across all your devices"
            ref={signInRef}
            style={{ display: currentUser ? 'none' : 'inline-flex' }}
            onClick={handleSignIn}
          >
            <GoogleIcon />
            <span>Sign in with Google</span>
          </button>
          <div className="auth-user-wrap" style={{ display: currentUser ? 'inline-flex' : 'none' }}>
            <div className="user-pill">
              <span className="cloud-status-dot" title="Cloud Live Sync">●</span>
              <span className="user-display-name">{currentUser ? currentUser.displayName || currentUser.email || 'User' : 'User'}</span>
            </div>
            <button type="button" className="auth-signout-btn" title="Sign out" onClick={handleSignOut}>Log out</button>
          </div>
        </div>

        <div className="footer-toggles">
          <button
            type="button"
            className={`icon-button motion-toggle ${isMotionEnabled ? 'is-on' : ''}`}
            title={isMotionEnabled ? 'Turn 3D animations off' : 'Turn 3D animations on'}
            aria-label={isMotionEnabled ? 'Turn 3D animations off' : 'Turn 3D animations on'}
            aria-pressed={isMotionEnabled}
            onClick={onToggleMotion}
          >
            <MotionIcon />
          </button>
          <button
            className="icon-button"
            title={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            aria-label={theme === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            onClick={onToggleTheme}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
        </div>
      </div>
    </aside>
  );
}
