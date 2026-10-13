// Sidebar Mini Calendar
// Month grid (Mon-first). Days with open tasks get a dot; clicking a day picks it.
import { useMemo, useState } from 'react';
import { getLocalISODate } from '../modules/dateUtils';
import type { Task } from '../types';

interface MiniCalendarProps {
  tasks: Task[];
  selected: string | null;
  onPick: (dateStr: string) => void;
}

const WEEKDAY_LABELS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export function MiniCalendar({ tasks, selected, onPick }: MiniCalendarProps) {
  const [view, setView] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  // Jump to the month of a newly picked date
  if (selected !== lastSelected) {
    setLastSelected(selected);
    if (selected) {
      const [y, m] = selected.split('-').map(Number);
      setView({ year: y, month: m - 1 });
    }
  }

  const navigate = (step: number) => {
    setView(({ year, month }) => {
      let nextMonth = month + step;
      let nextYear = year;
      if (nextMonth < 0) { nextMonth = 11; nextYear -= 1; }
      if (nextMonth > 11) { nextMonth = 0; nextYear += 1; }
      return { year: nextYear, month: nextMonth };
    });
  };

  const openDates = useMemo(() => new Set(tasks.filter(t => !t.completed && t.date).map(t => t.date)), [tasks]);
  const today = getLocalISODate();
  const first = new Date(view.year, view.month, 1);
  const lead = (first.getDay() + 6) % 7; // Monday-first offset
  const daysInMonth = new Date(view.year, view.month + 1, 0).getDate();
  const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  return (
    <>
      <div className="cal-head">
        <span className="cal-title">{title}</span>
        <div className="cal-nav">
          <button type="button" aria-label="Previous month" onClick={() => navigate(-1)}>‹</button>
          <button type="button" aria-label="Next month" onClick={() => navigate(1)}>›</button>
        </div>
      </div>
      <div className="cal-grid">
        {WEEKDAY_LABELS.map((w, i) => <span className="cal-weekday" key={`weekday-${i}`}>{w}</span>)}
        {Array.from({ length: lead }, (_, i) => <span className="cal-cell is-empty" key={`lead-${i}`} />)}
        {Array.from({ length: daysInMonth }, (_, i) => {
          const d = i + 1;
          const iso = getLocalISODate(new Date(view.year, view.month, d));
          const cls = [
            'cal-cell',
            iso === today ? 'is-today' : '',
            iso === selected ? 'is-selected' : '',
            openDates.has(iso) ? 'has-tasks' : ''
          ].join(' ');
          return (
            <button type="button" className={cls} key={iso} onClick={() => onPick(iso)}>
              {d}
            </button>
          );
        })}
      </div>
    </>
  );
}
