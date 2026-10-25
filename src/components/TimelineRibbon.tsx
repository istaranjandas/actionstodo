// The path ribbon: two separate HUD pieces. The lens tabs pick which stretch of path the camera frames;
// the timeline below is a game compass — a strip of day ticks that glides to centre the focused day.
// Q / E (or ← →) walk one day, « » jump a week, the month name opens the date picker. Every day tick is
// also a drop zone: drag a task onto it to reschedule (data-drop-date, handled by the list drag controller).
// Key hints live in tooltips only; no keycap badges on screen.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { ChevronsLeft, ChevronsRight } from 'lucide-react';
import { addDays, getLocalISODate } from '../modules/dateUtils';
import { BrandMark } from './BrandMark';
import { ViewNav } from './ViewNav';
import type { NavKey } from '../modules/navigation';
import type { Task } from '../types';
import { DatePicker } from './DatePicker';

interface TimelineRibbonProps {
  tasks: Task[];
  focusDate: string | null;
  activeLens: NavKey | null;
  lensCounts: Partial<Record<NavKey, number | null>>;
  showPlanner: boolean;
  isCompact: boolean;
  onSelectLens: (key: NavKey) => void;
  onFocusDay: (date: string) => void;
}

const WEEKDAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PAST_RANGE = 30;
const FUTURE_RANGE = 60;
const FOCUS_MARGIN = 14;

const parse = (isoDate: string) => {
  const [year, month, day] = isoDate.split('-').map(Number);
  return new Date(year, month - 1, day);
};

export function TimelineRibbon({ tasks, focusDate, activeLens, lensCounts, showPlanner, onSelectLens, onFocusDay }: TimelineRibbonProps) {
  const today = getLocalISODate();
  const anchorDate = focusDate ?? today;
  const ribbonRef = useRef<HTMLElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const hasCentred = useRef(false);

  // A stable range around today, stretched only when the focus wanders beyond it
  const days = useMemo(() => {
    const pastEdge = addDays(today, -PAST_RANGE);
    const futureEdge = addDays(today, FUTURE_RANGE);
    const focusStart = addDays(anchorDate, -FOCUS_MARGIN);
    const focusEnd = addDays(anchorDate, FOCUS_MARGIN);
    const rangeStart = pastEdge < focusStart ? pastEdge : focusStart;
    const rangeEnd = futureEdge > focusEnd ? futureEdge : focusEnd;
    const list: string[] = [];
    for (let date = rangeStart; date <= rangeEnd; date = addDays(date, 1)) list.push(date);
    return list;
  }, [anchorDate, today]);

  const tallies = useMemo(() => {
    const byDate = new Map<string, { open: number; done: number }>();
    tasks.forEach((task) => {
      const tally = byDate.get(task.date) ?? { open: 0, done: 0 };
      if (task.completed) tally.done += 1;
      else tally.open += 1;
      byDate.set(task.date, tally);
    });
    return byDate;
  }, [tasks]);

  const centreOn = (date: string, smooth: boolean) => {
    const track = trackRef.current;
    const bead = track?.querySelector<HTMLElement>(`[data-date="${date}"]`);
    if (!track || !bead) return;
    const left = bead.offsetLeft - (track.clientWidth - bead.offsetWidth) / 2;
    track.scrollTo({ left, behavior: smooth ? 'smooth' : 'auto' });
  };

  // The light beam stands over today wherever the track has been scrolled to
  const placeTodayBeam = () => {
    const ribbon = ribbonRef.current;
    const track = trackRef.current;
    const bead = track?.querySelector<HTMLElement>(`[data-date="${today}"]`);
    if (!ribbon || !track || !bead) return;
    const x = track.offsetLeft + bead.offsetLeft + bead.offsetWidth / 2 - track.scrollLeft;
    ribbon.style.setProperty('--today-x', `${Math.round(x)}px`);
  };

  // Glide the focused (or today's) bead to the centre of the track
  useLayoutEffect(() => {
    const reduced = document.body.classList.contains('is-reduced-motion');
    centreOn(anchorDate, hasCentred.current && !reduced);
    hasCentred.current = true;
    placeTodayBeam();
  }, [anchorDate, days]);

  useEffect(() => {
    const handleResize = () => {
      centreOn(anchorDate, false);
      placeTodayBeam();
    };
    window.addEventListener('resize', handleResize);
    const track = trackRef.current;
    track?.addEventListener('scroll', placeTodayBeam, { passive: true });
    return () => {
      window.removeEventListener('resize', handleResize);
      track?.removeEventListener('scroll', placeTodayBeam);
    };
  }, [anchorDate]);

  const monthLabel = parse(anchorDate).toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  // Arrow keys move focus between beads without also stepping the day globally
  const handleTrackKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const beads = Array.from(trackRef.current?.querySelectorAll<HTMLButtonElement>('.day-bead') ?? []);
    const index = beads.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    event.stopPropagation();
    beads[index + (event.key === 'ArrowRight' ? 1 : -1)]?.focus();
  };

  return (
    <nav className="ribbon" aria-label="Path navigation" ref={ribbonRef}>
      <div className="lens-bar">
        <BrandMark />
        <ViewNav activeKey={activeLens} counts={lensCounts} showPlanner={showPlanner} onSelect={onSelectLens} />
        <div className="lens-tools">
          {/* The month is the picker: no second calendar button beside it */}
          <div className="picker-chip-wrap month-picker" title="Jump to a date">
            <button type="button" className="timeline-month" tabIndex={-1} aria-label={`Jump to a date in ${monthLabel}`}>
              {monthLabel}
            </button>
            <DatePicker ariaLabel="Jump to a date" value={focusDate ?? ''} onChange={onFocusDay} />
          </div>
        </div>
      </div>

      <div className="timeline">
        <span className="timeline-notch" aria-hidden="true" />
        <button
          type="button"
          className="timeline-step"
          aria-label="Previous week"
          title="Previous week · Q or ← steps one day"
          data-sfx="dateStep"
          onClick={() => onFocusDay(addDays(anchorDate, -7))}
        >
          <ChevronsLeft size={16} strokeWidth={2} aria-hidden="true" />
        </button>
        <div className="timeline-track" ref={trackRef} role="group" aria-label={`Days, ${monthLabel}`} onKeyDown={handleTrackKeyDown}>
          {days.map((date) => {
            const dateObj = parse(date);
            const weekday = (dateObj.getDay() + 6) % 7;
            const day = dateObj.getDate();
            const tally = tallies.get(date);
            const isFocused = date === focusDate;
            const isToday = date === today;
            const label = dateObj.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
            const summary = tally ? `, ${tally.open} open, ${tally.done} done` : ', nothing planned';
            return (
              <button
                key={date}
                type="button"
                data-date={date}
                data-drop-date={date}
                className={`day-bead ${isFocused ? 'is-focused' : ''} ${isToday ? 'is-today' : ''} ${date < today ? 'is-past' : ''} ${weekday >= 5 ? 'is-weekend' : ''} ${day === 1 ? 'is-month-start' : ''}`}
                aria-label={`${label}${summary}`}
                aria-current={isFocused ? 'date' : undefined}
                data-sfx="dateStep"
                onClick={() => onFocusDay(date)}
              >
                <span className="day-bead-weekday">{WEEKDAY_SHORT[weekday]}</span>
                <span className="day-bead-number">{day}</span>
                <span className="day-bead-marks" aria-hidden="true">
                  {tally && Array.from({ length: Math.min(3, tally.done + tally.open) }, (_, i) => (
                    <span key={`m${i}`} className={i < tally.open ? 'mark-open' : 'mark-done'} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="timeline-step"
          aria-label="Next week"
          title="Next week · E or → steps one day"
          data-sfx="dateStep"
          onClick={() => onFocusDay(addDays(anchorDate, 7))}
        >
          <ChevronsRight size={16} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>

      <span className="dock-beam" aria-hidden="true" />
    </nav>
  );
}
