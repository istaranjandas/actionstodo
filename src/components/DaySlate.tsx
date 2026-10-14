// The day slate: a field log floating beside its waypost. Header shows real progress, the body lists the
// tasks, and the command line at the foot logs new ones. One day (Today, a picked date) is a single
// left-anchored column; the multi-day lenses widen it into a grid of day cards that scrolls as a whole.
import type { ReactNode, RefCallback } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { ViewSummary } from '../modules/store';

export type SlateLayout = 'column' | 'grid';

interface DaySlateProps {
  label: string;
  layout: SlateLayout;
  summary: ViewSummary;
  isScrolled: boolean;
  isDoneLens: boolean;
  backLabel: string | null;
  onBack: () => void;
  scrollRef: RefCallback<HTMLElement>;
  command: ReactNode;
  children: ReactNode;
}

export function DaySlate({ label, layout, summary, isScrolled, isDoneLens, backLabel, onBack, scrollRef, command, children }: DaySlateProps) {
  const { open: openCount, done: doneCount, total } = summary;
  const progress = total ? Math.round((doneCount / total) * 100) : 0;

  return (
    <section className={`slate ${layout === 'grid' ? 'is-grid' : 'is-column'} ${isScrolled ? 'is-scrolled' : ''}`} aria-label={label}>
      <header className="slate-header">
        {backLabel && (
          <button type="button" className="slate-back" data-sfx="close" onClick={onBack} title="Back (Esc)">
            <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
            <span>{backLabel}</span>
          </button>
        )}
        <div className="slate-progress" aria-label={isDoneLens ? `${doneCount} completed` : `${openCount} open, ${doneCount} done`}>
          {!isDoneLens && (
            <span className="slate-stat">
              <strong>{openCount}</strong> open
            </span>
          )}
          <span className="slate-stat is-done">
            <strong>{doneCount}</strong> {isDoneLens ? 'completed' : 'done'}
          </span>
          {!isDoneLens && (
            <span className="slate-gauge" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress} aria-label="Completed">
              <span className="slate-gauge-fill" style={{ width: `${progress}%` }} />
            </span>
          )}
        </div>
      </header>

      <div className="slate-body main-pane" ref={scrollRef}>
        <main className={`date-groups ${layout === 'grid' ? 'day-grid' : ''}`} id="dateGroupsContainer">
          {children}
        </main>
      </div>

      <footer className="slate-command">{command}</footer>
    </section>
  );
}
