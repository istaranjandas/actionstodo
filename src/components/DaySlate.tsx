// The day slate: the dashboard's command deck. The header carries the day, the total / done / left
// telemetry, the completion gauge and the quick-add line, so the primary actions sit above the log.
// One day (Today, a picked date) is a single column; the All lens widens it into a grid of day cards.
import type { ReactNode, RefCallback } from 'react';
import { ArrowLeft, CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, getLocalISODate, parseISODate } from '../modules/dateUtils';
import type { ViewSummary } from '../modules/store';
import { DatePicker } from './DatePicker';

export type SlateLayout = 'column' | 'grid';

interface DaySlateProps {
  label: string;
  layout: SlateLayout;
  // Names the multi-day board beside its telemetry; the single-day slate is already named by its date
  title: string | null;
  summary: ViewSummary;
  isScrolled: boolean;
  backLabel: string | null;
  onBack: () => void;
  // Focused day shown in the header; null for the multi-day board
  date: string | null;
  onPickDate: (date: string) => void;
  onPrevDay: () => void;
  onNextDay: () => void;
  scrollRef: RefCallback<HTMLElement>;
  command: ReactNode;
  children: ReactNode;
}

const fullDayLabel = (isoDate: string) =>
  parseISODate(isoDate).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

function relativeDayLabel(isoDate: string): string {
  const today = getLocalISODate();
  if (isoDate === today) return 'Today';
  if (isoDate === addDays(today, 1)) return 'Tomorrow';
  if (isoDate === addDays(today, -1)) return 'Yesterday';
  return 'Selected day';
}

export function DaySlate({
  label,
  layout,
  title,
  summary,
  isScrolled,
  backLabel,
  onBack,
  date,
  onPickDate,
  onPrevDay,
  onNextDay,
  scrollRef,
  command,
  children
}: DaySlateProps) {
  const { open: openCount, done: doneCount, total } = summary;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;
  const isGrid = layout === 'grid';
  const dayName = date ? fullDayLabel(date) : null;

  return (
    <section className={`slate ${isGrid ? 'is-grid' : 'is-column'} ${isScrolled ? 'is-scrolled' : ''}`} aria-label={label}>
      <header className="slate-header dash-hero">
        {backLabel && (
          <button type="button" className="slate-back dash-back" data-sfx="close" onClick={onBack} title="Back (Esc)">
            <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>{backLabel}</span>
          </button>
        )}

        <div className="dash-hero-top">
          <div className="dash-date-nav">
            {date && (
              <button type="button" className="dash-step-btn" aria-label="Previous day" title="Previous day" onClick={onPrevDay}>
                <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
              </button>
            )}

            <div className="dash-date-block">
              <span className="dash-eyebrow">
                <CalendarDays size={13} strokeWidth={2.2} aria-hidden="true" />
                {date ? relativeDayLabel(date) : 'Workspace'}
              </span>

              {date ? (
                <div className="picker-chip-wrap dash-date-picker" title="Jump to a date">
                  <button type="button" className="dash-date-button">
                    <span className="dash-date-title">{dayName}</span>
                  </button>
                  <DatePicker ariaLabel="Jump to a date" value={date} onChange={onPickDate} />
                </div>
              ) : (
                <h1 className="dash-date-title">{title ?? 'All tasks'}</h1>
              )}

              <span className="dash-date-sub">
                {date ? 'Your plan, focused and in order' : 'Every task across your board'}
              </span>
            </div>

            {date && (
              <button type="button" className="dash-step-btn" aria-label="Next day" title="Next day" onClick={onNextDay}>
                <ChevronRight size={18} strokeWidth={2.2} aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="dash-stats" aria-label={date ? `Summary for ${dayName}` : 'Board summary'}>
            <div className="dash-stat">
              <span>Total</span>
              <strong>{total}</strong>
            </div>
            <div className="dash-stat is-done">
              <span>Completed</span>
              <strong>{doneCount}</strong>
            </div>
            <div className="dash-stat is-remaining">
              <span>Remaining</span>
              <strong>{openCount}</strong>
            </div>
          </div>
        </div>

        <div className="dash-progress-row">
          <div
            className="dash-progress-track"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={progress}
            aria-label="Completed progress"
          >
            <span className="dash-progress-fill" style={{ width: `${progress}%` }} />
          </div>
          <span className="dash-progress-value">{progress}%</span>
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
