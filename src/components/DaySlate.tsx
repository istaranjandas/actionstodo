// The day slate: a field log floating beside its waypost. The header carries the day's date, the
// open/done telemetry (DONE toggles completed work in and out of the log) and the command line, so the
// primary action sits at the top. One day (Today, a picked date) is a single left-anchored column;
// the All lens widens it into a grid of day cards that share the same header.
import type { ReactNode, RefCallback } from 'react';
import { ArrowLeft, CalendarDays } from 'lucide-react';
import { parseISODate } from '../modules/dateUtils';
import type { ViewSummary } from '../modules/store';
import { DatePicker } from './DatePicker';

export type SlateLayout = 'column' | 'grid';

interface DaySlateProps {
  label: string;
  layout: SlateLayout;
  summary: ViewSummary;
  isScrolled: boolean;
  isDoneLens: boolean;
  backLabel: string | null;
  onBack: () => void;
  // Focused day shown in the header; null for the multi-day board
  date: string | null;
  onPickDate: (date: string) => void;
  showDone: boolean;
  onToggleDone: () => void;
  scrollRef: RefCallback<HTMLElement>;
  command: ReactNode;
  children: ReactNode;
}

const dayLabel = (isoDate: string) =>
  parseISODate(isoDate).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

export function DaySlate({
  label,
  layout,
  summary,
  isScrolled,
  isDoneLens,
  backLabel,
  onBack,
  date,
  onPickDate,
  showDone,
  onToggleDone,
  scrollRef,
  command,
  children
}: DaySlateProps) {
  const { open: openCount, done: doneCount, total } = summary;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;
  const isGrid = layout === 'grid';

  return (
    <section className={`slate ${isGrid ? 'is-grid' : 'is-column'} ${isScrolled ? 'is-scrolled' : ''}`} aria-label={label}>
      <header className="slate-header">
        <div className="slate-header-bar">
          {backLabel && (
            <button type="button" className="slate-back" data-sfx="close" onClick={onBack} title="Back (Esc)">
              <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
              <span>{backLabel}</span>
            </button>
          )}

          {date && (
            <div className="picker-chip-wrap slate-date" title="Jump to a date">
              <span className="slate-date-label">
                <CalendarDays size={12} strokeWidth={2.2} aria-hidden="true" />
                <span>{dayLabel(date)}</span>
              </span>
              <DatePicker ariaLabel="Jump to a date" value={date} onChange={onPickDate} />
            </div>
          )}

          <div className="slate-progress" aria-label={isDoneLens ? `${doneCount} completed` : `${openCount} open, ${doneCount} done`}>
            {!isDoneLens && (
              <span className="slate-stat">
                <strong>{openCount}</strong> open
              </span>
            )}
            <button
              type="button"
              className={`slate-stat is-done is-toggle ${doneCount === 0 ? 'is-zero' : ''} ${showDone ? 'is-on' : ''}`}
              aria-pressed={showDone}
              title={showDone ? `Hide done tasks (${doneCount})` : `Show done tasks (${doneCount})`}
              data-sfx="none"
              onClick={onToggleDone}
            >
              <strong>{doneCount}</strong> {isDoneLens ? 'completed' : 'done'}
            </button>
            {!isDoneLens && (
              <span className="slate-gauge" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Completed">
                <span className="slate-gauge-fill" style={{ width: `${progress}%` }} />
              </span>
            )}
          </div>
        </div>
        <div className="slate-command is-in-header">{command}</div>
      </header>

      <div className="slate-body main-pane" ref={scrollRef}>
        <main className={`date-groups ${isGrid ? 'day-grid' : ''}`} id="dateGroupsContainer">
          {children}
        </main>
      </div>
    </section>
  );
}
