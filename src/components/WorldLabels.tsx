// DOM layer pinned to the 3D world: a label over every waypost and the lantern tooltip.
// Positions come from the projector. Today's label carries the next timed objective instead of
// repeating today's date, which the dock and the area title already state.
import { formatTimeRangeDisplay } from '../modules/timeUtils';
import { useMinuteClock } from '../hooks/useMinuteClock';
import { worldBridge } from '../world/worldBridge';
import type { WorldDay } from '../world/worldBridge';

interface WorldLabelsProps {
  days: WorldDay[];
  focusDate: string | null;
  today: string;
  onFocusDay: (date: string) => void;
}

export function WorldLabels({ days, focusDate, today, onFocusDay }: WorldLabelsProps) {
  // Only a task still ahead of the clock is "next"; an overdue one is simply still open
  const nowMinutes = useMinuteClock();
  const nowTime = `${String(Math.floor(nowMinutes / 60)).padStart(2, '0')}:${String(nowMinutes % 60).padStart(2, '0')}`;

  return (
    <div className="world-labels">
      {days.map((day) => {
        const [year, month, date] = day.date.split('-').map(Number);
        const weekday = new Date(year, month - 1, date).toLocaleDateString(undefined, { weekday: 'short' });
        const open = day.tasks.filter((task) => !task.completed).length;
        const done = day.tasks.length - open;
        const isToday = day.date === today;
        const nextTimed = isToday
          ? day.tasks
              .filter((task) => !task.completed && task.startTime && task.startTime > nowTime)
              .sort((a, b) => a.startTime.localeCompare(b.startTime))[0]
          : undefined;
        return (
          // Mouse shortcut only: the ribbon below offers the same days to keyboard and screen readers
          <button
            key={day.date}
            type="button"
            tabIndex={-1}
            aria-hidden="true"
            className={`post-label ${day.date === focusDate ? 'is-focused' : ''} ${isToday ? 'is-today' : ''}`}
            data-sfx="select"
            ref={(element) => {
              if (element) worldBridge.dayLabels.set(day.date, element);
              else worldBridge.dayLabels.delete(day.date);
            }}
            onClick={() => onFocusDay(day.date)}
          >
            <span className="post-label-day">
              {nextTimed ? (
                <>
                  Next <strong>{formatTimeRangeDisplay(nextTimed.startTime)}</strong>
                </>
              ) : isToday ? (
                'Today'
              ) : (
                <>
                  {weekday} <strong>{date}</strong>
                </>
              )}
            </span>
            {day.tasks.length > 0 && (
              <span className="post-label-tally">
                {open > 0 && <span className="tally-open">{open}</span>}
                {done > 0 && <span className="tally-done">{done}</span>}
              </span>
            )}
          </button>
        );
      })}

      <div
        className="lantern-tooltip"
        aria-hidden="true"
        ref={(element) => {
          worldBridge.hoverLabel = element;
        }}
      />
    </div>
  );
}
