// The arcade key: one glass control that lists every mini-game the app ships, and launches it.
// Small enough to sit beside the System key in the top-right cluster; the panel itself is the menu.
import { useCallback, useId, useRef, useState } from 'react';
import { Car, ChevronRight, Gamepad2, Swords } from 'lucide-react';
import { playUiSound } from '../audio/uiSounds';
import { useDismissiblePopup } from '../hooks/useDismissiblePopup';

export type GameId = 'arena' | 'alpine';

interface GameEntry {
  id: GameId;
  title: string;
  detail: string;
  Icon: typeof Swords;
}

// Only what actually ships: the in-app quest arena, and the standalone alpine run
const GAMES: GameEntry[] = [
  {
    id: 'arena',
    title: 'Quest Arena',
    detail: 'Steer the runner across the island and collect a relic for every task you clear.',
    Icon: Swords
  },
  {
    id: 'alpine',
    title: 'Alpine Overdrive',
    detail: 'A night drive down the pass. Arrow keys, no brakes, one long descent.',
    Icon: Car
  }
];

interface GameMenuProps {
  onEnterGameMode: () => void;
}

export function GameMenu({ onEnterGameMode }: GameMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const close = useCallback(() => {
    if (panelRef.current?.contains(document.activeElement)) triggerRef.current?.focus();
    setIsOpen(false);
  }, []);
  useDismissiblePopup(isOpen, close, panelRef, triggerRef);

  const launch = (id: GameId) => {
    close();
    playUiSound('open');
    if (id === 'arena') {
      onEnterGameMode();
      return;
    }
    window.location.href = '/alpineoverride/';
  };

  return (
    <div className="game-menu">
      <button
        type="button"
        className={`system-trigger is-icon ${isOpen ? 'is-active' : ''}`}
        aria-label="Arcade — mini-games"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        title="Arcade"
        data-sfx={isOpen ? 'close' : 'open'}
        ref={triggerRef}
        onClick={() => setIsOpen(open => !open)}
      >
        <Gamepad2 size={18} strokeWidth={2} aria-hidden="true" />
      </button>

      {isOpen && (
        <div className="arcade-panel" role="dialog" aria-labelledby={titleId} ref={panelRef} data-lenis-prevent>
          <div className="arcade-head">
            <span className="arcade-title" id={titleId}>Arcade</span>
            <span className="arcade-count">{GAMES.length} games</span>
          </div>

          <ul className="arcade-list">
            {GAMES.map(({ id, title, detail, Icon }) => (
              <li key={id}>
                <button type="button" className="arcade-game" data-sfx="select" onClick={() => launch(id)}>
                  <span className="arcade-game-icon" aria-hidden="true"><Icon size={18} strokeWidth={1.9} /></span>
                  <span className="arcade-game-copy">
                    <span className="arcade-game-title">{title}</span>
                    <span className="arcade-game-detail">{detail}</span>
                  </span>
                  <ChevronRight className="arcade-game-go" size={16} aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>

          <p className="arcade-foot">Clearing a task lights a relic. The arena reads today’s log.</p>
        </div>
      )}
    </div>
  );
}
