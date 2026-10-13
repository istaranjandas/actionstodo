import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Flame, ScrollText, Trophy } from 'lucide-react';
import { useGameProgress } from '../state/gameProgress';
import { useQuestSignals } from '../state/arenaRuntime';
import { gameInput } from '../input/gameInput';
import { playLevelUpFanfare } from '../effects/arenaAudio';
import { celebrateLevelUp } from '../effects/celebrate';
import { ViewportModeToggle } from '../../components/ViewportModeToggle';
import type { ViewportMode } from '../../components/ViewportModeToggle';

interface GameHudProps {
  onChangeMode: (mode: ViewportMode) => void;
  isTouchDevice: boolean;
  celebrate: boolean;
}

const LEVEL_UP_TOAST_MS = 2600;
const COMPACT_SCREEN_WIDTH = 680;

export function GameHud({ onChangeMode, isTouchDevice, celebrate }: GameHudProps) {
  const progress = useGameProgress();
  const { nearestInRange, questLog } = useQuestSignals();
  const [isQuestLogOpen, setIsQuestLogOpen] = useState(() => window.innerWidth > COMPACT_SCREEN_WIDTH);
  const [levelUpBanner, setLevelUpBanner] = useState<number | null>(null);
  const announcedLevelUpId = useRef(progress.lastLevelUp?.id ?? null);
  const xpPercent = Math.round((progress.xpIntoLevel / progress.xpForNextLevel) * 100);

  useEffect(() => {
    const levelUp = progress.lastLevelUp;
    if (!levelUp || levelUp.id === announcedLevelUpId.current) return;
    announcedLevelUpId.current = levelUp.id;
    setLevelUpBanner(levelUp.level);
    playLevelUpFanfare();
    if (celebrate) celebrateLevelUp();
    const hideBanner = window.setTimeout(() => setLevelUpBanner(null), LEVEL_UP_TOAST_MS);
    return () => window.clearTimeout(hideBanner);
  }, [progress.lastLevelUp, celebrate]);

  return (
    <div className="game-hud">
      <div className="hud-player-card">
        <div className="hud-level-badge" aria-label={`Level ${progress.level}`}>
          <span className="hud-level-caption">LV</span>
          <span className="hud-level-value">{progress.level}</span>
        </div>
        <div className="hud-xp">
          <div className="hud-xp-label">
            <span>Experience</span>
            <span className="hud-xp-numbers">{progress.xpIntoLevel} / {progress.xpForNextLevel} XP</span>
          </div>
          <div className="hud-xp-track" role="progressbar" aria-valuemin={0} aria-valuemax={progress.xpForNextLevel} aria-valuenow={progress.xpIntoLevel} aria-label="Experience to next level">
            <div className="hud-xp-fill" style={{ width: `${xpPercent}%` }} />
          </div>
        </div>
        <div className={`hud-streak ${progress.streakDays > 0 ? 'is-lit' : ''}`} title="Days in a row with at least one completed quest">
          <Flame className="hud-streak-flame" size={18} strokeWidth={2.4} aria-hidden="true" />
          <strong>{progress.streakDays}</strong>
          <span>day streak</span>
        </div>
      </div>

      <div className="hud-mode-switch">
        <ViewportModeToggle mode="game" onChange={onChangeMode} />
      </div>

      <section className={`hud-quest-log ${isQuestLogOpen ? 'is-open' : ''}`} aria-label="Quest log">
        <button type="button" className="hud-quest-log-toggle" aria-expanded={isQuestLogOpen} onClick={() => setIsQuestLogOpen((open) => !open)}>
          <ScrollText size={15} strokeWidth={2.2} aria-hidden="true" />
          <span>Quest log</span>
          <span className="hud-quest-count">{questLog.length}</span>
          <ChevronDown className="hud-quest-chevron" size={15} aria-hidden="true" />
        </button>
        {isQuestLogOpen && (
          <ol className="hud-quest-list">
            {questLog.length === 0 && <li className="hud-quest-empty">All quests cleared. Add a task to spawn a new relic.</li>}
            {questLog.map((quest) => (
              <li key={quest.taskId} className={`hud-quest-item ${quest.isUrgent ? 'is-urgent' : ''} ${nearestInRange?.taskId === quest.taskId ? 'is-in-range' : ''}`}>
                <span className="hud-quest-dot" aria-hidden="true" />
                <span className="hud-quest-text">{quest.text}</span>
                <span className="hud-quest-distance">{quest.distance} m</span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {nearestInRange && (
        <button
          type="button"
          className="hud-interact-prompt"
          onClick={() => {
            gameInput.interactRequested = true;
          }}
        >
          <span className="hud-interact-key">E</span>
          <span className="hud-interact-copy">
            <span className="hud-interact-title">[Press E or Tap to Complete Quest]</span>
            <span className="hud-interact-task">{nearestInRange.text}</span>
          </span>
        </button>
      )}

      {!isTouchDevice && (
        <div className="hud-controls-hint" aria-hidden="true">
          <span><kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> move</span>
          <span><kbd>Shift</kbd> sprint</span>
          <span><kbd>Space</kbd> jump</span>
          <span><kbd>E</kbd> complete</span>
          <span>Drag to look · Scroll to zoom</span>
        </div>
      )}

      {levelUpBanner !== null && (
        <div className="hud-level-up" role="status">
          <Trophy size={26} strokeWidth={2.2} aria-hidden="true" />
          <div>
            <div className="hud-level-up-title">Level up!</div>
            <div className="hud-level-up-subtitle">You reached level {levelUpBanner}</div>
          </div>
        </div>
      )}
    </div>
  );
}
