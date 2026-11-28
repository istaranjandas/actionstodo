// Desktop gets the Lantern Path too: the day slate floats over a drawn valley in place of the 3D world.
// The slate is today's log (the task you are on, the schedule with a NOW line, Anytime and what was left
// on the trail) and its foot slides out into All days, a board of day cards. The big waypost burns for the
// task you are on, its plaque reads the time left, and the trail along the bottom walks the day
// (LanternPath.tsx). The add bar, details, profile panel and toasts are the app's own components.
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent, ReactNode, RefCallback } from 'react';
import { ArrowLeft, Check, ChevronDown, ChevronRight, CornerDownRight, Map as MapIcon, MoveHorizontal, Plus, X } from 'lucide-react';
import { addDays, formatFriendlyDate, formatShortDate, parseISODate } from '../modules/dateUtils';
import { formatTimeRangeDisplay } from '../modules/timeUtils';
import { parseTaskInput, repeatShortLabel } from '../modules/recurrence';
import { sortTaskList, tallyTasks, updateTaskItem } from '../modules/store';
import { logTask, removeTask, setTaskCompleted } from '../modules/taskActions';
import { prefillCommand } from '../modules/commandBar';
import { pushToast } from '../modules/toasts';
import { playUiSound } from '../audio/uiSounds';
import { useMinuteClock } from '../hooks/useMinuteClock';
import { useTaskSelection } from './TaskSelection';
import { DatePicker } from './DatePicker';
import { HorizonDial, LampGlyph, LanternPanorama, LanternSky, minutesLabel, readFocus, seeded, time12, toMinutes, useSecondClock, Waypost } from './LanternPath';
import type { Task, Theme } from '../types';

interface DesktopShellProps {
  tasks: Task[];
  today: string;
  // The day on the slate (today or a picked date); null while All days is open
  focusDate: string | null;
  isPickedDate: boolean;
  // The view's tasks from summarizeView: the day's tasks while a day is open
  dayTasks: Task[];
  // Open tasks on every other day, the count beside "Show all days"
  otherDaysOpen: number;
  scrollRef: RefCallback<HTMLElement>;
  // The way back from a picked date ("Back to today", or "Back to All" when picked from the board)
  backLabel: string | null;
  onToggleAllDays: () => void;
  onBack: () => void;
  onPickDate: (date: string) => void;
  profile: ReactNode;
  composer: ReactNode;
  inspector: ReactNode;
  isInspectorOpen: boolean;
  onCloseInspector: () => void;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
}

// The trail strip and the path keep the phone's geometry; these match lantern-desk.css
const STRIP_H = 46;
const PATH_H = 262;
const CARD_MIN = 330;
const CARD_GAP = 16;

const ageLabel = (date: string, today: string) => {
  const days = Math.round((parseISODate(today).getTime() - parseISODate(date).getTime()) / 86400000);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
};

const repeatMeta = (task: Task) => (task.repeat ? repeatShortLabel(task.repeat) : task.isOccurrence ? 'Repeats' : '');

// Where the slate's right edge sits before it is measured, mirroring --hud and --sl-w in lantern-desk.css
function estimateSlateEdge(): number {
  const w = window.innerWidth;
  if (w >= 1280) return 36 + 456;
  if (w >= 1025) return 24 + 420;
  return 16 + Math.min(420, w - 32);
}

// ---------- Rows ----------

// Up and down walk the rows of the slate (or the board); Space lights the lantern; Enter opens details
function onRowKeyDown(e: KeyboardEvent<HTMLLIElement>, task: Task, openTask: (id: string, viaKeyboard?: boolean) => void) {
  if (e.target !== e.currentTarget) return;
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
    const scope = e.currentTarget.closest('.sl-body, .bd-scroll');
    const rows = scope ? Array.from(scope.querySelectorAll<HTMLElement>('.dk-row')) : [];
    const next = rows[rows.indexOf(e.currentTarget) + (e.key === 'ArrowDown' ? 1 : -1)];
    next?.focus();
    e.preventDefault();
  } else if (e.key === ' ') {
    setTaskCompleted(task, !task.completed);
    e.preventDefault();
  } else if (e.key === 'Enter') {
    openTask(task.id, true);
    e.preventDefault();
  }
}

function DeskRow({ task, meta, showTime, isNow }: { task: Task; meta?: string; showTime: boolean; isNow?: boolean }) {
  const { selectedTaskId, openTask } = useTaskSelection();
  const time = task.startTime ? formatTimeRangeDisplay(task.startTime, task.endTime) : '';
  return (
    <li
      className={`dk-row ${task.completed ? 'is-done' : ''} ${isNow ? 'is-now' : ''} ${selectedTaskId === task.id ? 'is-selected' : ''}`}
      data-id={task.id}
      tabIndex={0}
      draggable
      aria-label={`${task.text}${time ? `, ${time}` : ''}${task.completed ? ', done' : ''}`}
      onDragStart={(e) => {
        // listDrag.ts reads this payload and moves the task to the day card it is dropped on
        e.dataTransfer.setData('text/task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
      }}
      onKeyDown={(e) => onRowKeyDown(e, task, openTask)}
    >
      <button
        type="button"
        className="lp-lampbtn"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.completed ? `Mark “${task.text}” as not done` : `Mark “${task.text}” as done`}
        data-sfx="none"
        tabIndex={-1}
        onClick={() => setTaskCompleted(task, !task.completed)}
      >
        <LampGlyph />
      </button>
      <button type="button" className="lp-li-txt" data-sfx="open" tabIndex={-1} onClick={() => openTask(task.id)}>
        <span className="lp-li-title">{task.text}</span>
        {meta && <span className="lp-li-meta">{meta}</span>}
      </button>
      {showTime && time && <span className="dk-time">{time}</span>}
      <button type="button" className="dk-del" aria-label={`Delete “${task.text}”`} title="Delete" data-sfx="none" tabIndex={-1} onClick={() => removeTask(task)}>
        <X size={16} strokeWidth={2} aria-hidden="true" />
      </button>
    </li>
  );
}

// ---------- The slate ----------

function NowCard({ timed, onMarkDone }: { timed: Task[]; onMarkDone: (task: Task) => void }) {
  const { openTask } = useTaskSelection();
  const nowMinutes = useSecondClock(true) / 60000;
  const focus = readFocus(timed, nowMinutes);

  if (!focus.task) {
    if (focus.state !== 'rest') return null;
    return (
      <section className="sl-now is-calm" aria-labelledby="sl-now-title">
        <p className="sl-now-k">
          <Check size={13} strokeWidth={2.6} aria-hidden="true" />
          All lit
        </p>
        <h2 className="sl-now-t" id="sl-now-title">Every lantern on today’s path is lit</h2>
      </section>
    );
  }

  const task = focus.task;
  const range = formatTimeRangeDisplay(task.startTime, task.endTime);
  const leftMs = Math.max(0, (focus.start + focus.duration - nowMinutes) * 60000);
  const left = Math.min(1, leftMs / (focus.duration * 60000));
  const seconds = Math.ceil(leftMs / 1000);
  const kicker = focus.state === 'running' ? 'Now' : focus.state === 'ready' ? 'Next' : 'Unlit';

  return (
    <section className="sl-now" aria-labelledby="sl-now-title">
      <p className="sl-now-k">{kicker} · {range}</p>
      <h2 className="sl-now-t" id="sl-now-title">{task.text}</h2>
      <div className="sl-now-row">
        {focus.state === 'running' ? (
          <>
            <span className="sl-now-mm" aria-label={`${minutesLabel(leftMs / 60000)} left`}>
              {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')}
            </span>
            <span className="lp-unit">
              left
              <br />
              of {minutesLabel(focus.duration)}
            </span>
          </>
        ) : focus.state === 'ready' ? (
          <span className="lp-unit">
            Next on the path
            <br />
            starts in <b>{minutesLabel(focus.start - nowMinutes)}</b>
          </span>
        ) : (
          <span className="lp-unit">
            Its time has passed,
            <br />
            <b>still unlit</b>
          </span>
        )}
      </div>
      {focus.state === 'running' && (
        <div className="sl-burn" aria-hidden="true">
          <i style={{ width: `${(left * 100).toFixed(2)}%` }} />
        </div>
      )}
      <div className="sl-now-acts">
        <button type="button" className="lp-btn lp-btn-amber" data-sfx="none" onClick={() => onMarkDone(task)}>
          <Check size={17} strokeWidth={2.2} aria-hidden="true" />
          Mark done
        </button>
        <button type="button" className="lp-btn lp-btn-chip" data-sfx="open" onClick={() => openTask(task.id)}>
          Details
        </button>
      </div>
    </section>
  );
}

function Schedule({ timed, isToday }: { timed: Task[]; isToday: boolean }) {
  const nowMinutes = useMinuteClock();
  const focus = isToday ? readFocus(timed, nowMinutes) : null;
  const nowId = focus?.state === 'running' ? focus.task?.id : undefined;
  // The NOW line sits before the first lantern still ahead of you
  const aheadIndex = isToday ? timed.findIndex(t => toMinutes(t.startTime) > nowMinutes) : -1;
  const nowLine = (
    <li className="dk-nowline" aria-hidden="true" key="now">
      <span>NOW · {time12(nowMinutes)}</span>
    </li>
  );
  return (
    <ul className="lp-trail-list dk-list">
      {timed.flatMap((task, i) => {
        const row = <DeskRow key={task.id} task={task} showTime isNow={task.id === nowId} />;
        return i === aheadIndex ? [nowLine, row] : [row];
      })}
      {isToday && aheadIndex === -1 && nowLine}
    </ul>
  );
}

const STARTERS_TODAY = ['Gym at 6pm', 'Call Alex at 5pm', 'Buy groceries'];
const STARTERS_LATER = ['Dentist at 10am', 'Plan the week', 'Walk at 7am'];

function EmptyDay({ isToday }: { isToday: boolean }) {
  return (
    <div className="sl-emptycard">
      <LampGlyph />
      <h3>{isToday ? 'No lanterns on today’s path' : 'Nothing planned yet'}</h3>
      <p>{isToday ? 'Place one above. Give it a time to put it on the path, or none to carry it in your pack.' : 'Place a lantern above to plan this day.'}</p>
      <div className="sl-tries">
        {(isToday ? STARTERS_TODAY : STARTERS_LATER).map(text => (
          <button key={text} type="button" className="sl-try" data-sfx="select" onClick={() => prefillCommand(text)}>
            {text}
          </button>
        ))}
      </div>
    </div>
  );
}

function SlateBody({ tasks, today, day, dayTasks, onMarkDone }: { tasks: Task[]; today: string; day: string; dayTasks: Task[]; onMarkDone: (task: Task) => void }) {
  const isToday = day === today;
  const sorted = useMemo(() => sortTaskList(dayTasks, true), [dayTasks]);
  const timed = useMemo(() => sorted.filter(t => t.startTime), [sorted]);
  const anytime = sorted.filter(t => !t.startTime);

  // One-off tasks left open on past days. Repeating tasks stay out: the series comes round again on its own.
  const carried = useMemo(
    () => (isToday ? sortTaskList(tasks.filter(t => t.date && t.date < today && !t.completed && !t.repeat && !t.isOccurrence)) : []),
    [tasks, today, isToday]
  );

  const moveCarriedToToday = () => {
    const moved = carried.map(t => ({ id: t.id, date: t.date }));
    playUiSound('drop');
    moved.forEach(({ id }) => void updateTaskItem(id, { date: today }));
    pushToast({
      message: moved.length === 1 ? 'Moved to today' : `${moved.length} tasks moved to today`,
      tone: 'neutral',
      actionLabel: 'Undo',
      onAction: () => moved.forEach(({ id, date }) => void updateTaskItem(id, { date }))
    });
  };

  return (
    <>
      {isToday && <NowCard timed={timed} onMarkDone={onMarkDone} />}

      {timed.length > 0 && (
        <section className="sl-sec" aria-labelledby="sl-schedule">
          <div className="sl-sec-h">
            <h2 id="sl-schedule">Schedule</h2>
            <span className="n">{timed.length}</span>
          </div>
          <Schedule timed={timed} isToday={isToday} />
        </section>
      )}

      {anytime.length > 0 && (
        <section className="sl-sec" aria-labelledby="sl-anytime">
          <div className="sl-sec-h">
            <h2 id="sl-anytime">Anytime</h2>
            <span className="n">{anytime.length}</span>
          </div>
          <p className="sl-sub">In your pack. No set time {isToday ? 'today' : 'on this day'}.</p>
          <ul className="lp-trail-list dk-list">
            {anytime.map(task => <DeskRow key={task.id} task={task} meta={repeatMeta(task)} showTime={false} />)}
          </ul>
        </section>
      )}

      {carried.length > 0 && (
        <section className="sl-sec" aria-labelledby="sl-carried">
          <div className="sl-sec-h">
            <h2 id="sl-carried">Left on the trail</h2>
            <span className="n">{carried.length}</span>
            <button type="button" className="sl-move" data-sfx="none" onClick={moveCarriedToToday}>
              <CornerDownRight size={15} strokeWidth={1.8} aria-hidden="true" />
              Move all to today
            </button>
          </div>
          <p className="sl-sub">{carried.length === 1 ? 'One lantern' : `${carried.length} lanterns`} from earlier days, still unlit.</p>
          <ul className="lp-trail-list dk-list">
            {carried.map(task => <DeskRow key={task.id} task={task} meta={`${formatShortDate(task.date)} · ${ageLabel(task.date, today)}`} showTime={false} />)}
          </ul>
        </section>
      )}

      {dayTasks.length === 0 && carried.length === 0 && <EmptyDay isToday={isToday} />}
    </>
  );
}

// ---------- The world ----------

// The big waypost: it burns for the task you are on; its plaque, bolted to the pole, reads the time left
function DeskPost({ timed, isToday, day, dayCount, bloom }: { timed: Task[]; isToday: boolean; day: string; dayCount: number; bloom: boolean }) {
  const nowMinutes = useSecondClock(isToday) / 60000;
  const focus = isToday ? readFocus(timed, nowMinutes) : null;
  const leftMs = focus ? Math.max(0, (focus.start + focus.duration - nowMinutes) * 60000) : 0;
  const left = focus?.state === 'running' ? Math.min(1, leftMs / (focus.duration * 60000)) : 1;
  const seconds = Math.ceil(leftMs / 1000);

  let kicker: string;
  let body: ReactNode;
  let calm = false;
  if (!focus) {
    kicker = formatFriendlyDate(day).title;
    const first = timed.length ? ` · first ${time12(toMinutes(timed[0].startTime))}` : '';
    body = <span className="dk-plaque-s">{dayCount ? `${dayCount} ${dayCount === 1 ? 'lantern' : 'lanterns'}${first}` : 'nothing planned'}</span>;
    calm = true;
  } else if (focus.state === 'running') {
    kicker = 'Now';
    body = (
      <span className="dk-plaque-v">
        {Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, '0')} <small>left</small>
      </span>
    );
  } else if (focus.state === 'ready') {
    kicker = `Next · ${time12(focus.start)}`;
    body = <span className="dk-plaque-s">in {minutesLabel(focus.start - nowMinutes)}</span>;
  } else if (focus.state === 'missed') {
    kicker = `Unlit · ${time12(focus.start)}`;
    body = <span className="dk-plaque-s">its time has passed</span>;
  } else if (focus.state === 'rest') {
    kicker = 'All lit';
    body = <span className="dk-plaque-s">rest well</span>;
    calm = true;
  } else {
    kicker = 'Today';
    body = <span className="dk-plaque-s">no lanterns yet</span>;
    calm = true;
  }

  return (
    <div className="dk-post" aria-hidden="true">
      <Waypost state={focus?.state ?? 'ready'} left={left} bloom={bloom} />
      <div className={`dk-plaque ${calm ? 'is-calm' : ''}`}>
        <span className="dk-plaque-k">{kicker}</span>
        {body}
      </div>
    </div>
  );
}

const CLOUDS = (() => {
  const r = seeded(31);
  return Array.from({ length: 7 }, (_, i) => {
    const scale = 0.55 + r() * 0.85;
    return { top: 6 + r() * 36, left: i * 15 - 6 + r() * 8, width: Math.round(220 * scale), t: 90 + r() * 90, dl: -r() * 90 };
  });
})();

// Far mountains (two hazy ranges with sharp peaks) and slow day clouds, so the sky has depth on any width
function Scenery() {
  const [width, setWidth] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const { w, near, far } = useMemo(() => {
    const total = Math.ceil(width) + 40;
    const H = 440;
    const range = (base: number, amp: number, seed: number, f1: number, f2: number) => {
      let d = `M0,${H}`;
      for (let x = 0; x <= total; x += 8) {
        const y = base - amp * (0.62 * (1 - Math.abs(Math.sin(x * f1 + seed))) + 0.28 * (1 - Math.abs(Math.sin(x * f2 + seed * 2.3))) + 0.1 * Math.sin(x * 0.021 + seed));
        d += ` L${x},${y.toFixed(1)}`;
      }
      return `${d} L${total},${H} Z`;
    };
    return { w: total, far: range(300, 230, 0.7, 0.0016, 0.0043), near: range(372, 170, 2.1, 0.0023, 0.0061) };
  }, [width]);

  return (
    <>
      <svg className="dk-far" viewBox={`0 0 ${w} 440`} preserveAspectRatio="none" aria-hidden="true">
        <path className="f1" d={far} />
        <path className="f2" d={near} />
      </svg>
      <div className="dk-clouds" aria-hidden="true">
        {CLOUDS.map((c, i) => (
          <svg
            key={i}
            className="dk-cloud"
            viewBox="0 0 220 70"
            style={{ top: `${c.top.toFixed(1)}%`, left: `${c.left.toFixed(1)}%`, width: c.width, '--t': `${c.t.toFixed(0)}s`, '--dl': `${c.dl.toFixed(0)}s` } as CSSProperties}
          >
            <ellipse cx="70" cy="46" rx="62" ry="20" />
            <ellipse cx="118" cy="34" rx="46" ry="28" />
            <ellipse cx="160" cy="48" rx="50" ry="18" />
            <ellipse cx="104" cy="54" rx="86" ry="14" />
          </svg>
        ))}
      </div>
    </>
  );
}

// ---------- All days: the board ----------

// "+ New task" at the foot of a day card: an inline line already scoped to that day (as in TaskFeed).
// It stays open after each entry so a day fills in quickly; Escape, or leaving it empty, closes it.
function CardAdd({ date, dayLabel }: { date: string; dayLabel: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [text, setText] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const close = () => {
    setText('');
    setIsOpen(false);
  };

  if (!isOpen) {
    return (
      <button type="button" className="bd-new" data-sfx="open" onClick={() => setIsOpen(true)}>
        <Plus size={16} strokeWidth={2} aria-hidden="true" />
        New task
      </button>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const raw = text.trim();
        if (!raw) {
          close();
          return;
        }
        const parsed = parseTaskInput(raw);
        setText('');
        void logTask(parsed.cleanText, date, parsed.startTime, parsed.endTime, parsed.repeat);
      }}
    >
      <input
        ref={inputRef}
        type="text"
        className="bd-new-in"
        placeholder="Name it, like “Gym at 6pm” or “daily”"
        aria-label={`New task for ${dayLabel}`}
        autoComplete="off"
        enterKeyHint="done"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          if (!text.trim()) close();
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            close();
          }
        }}
      />
    </form>
  );
}

interface DayCardData {
  date: string;
  list: Task[];
}

// A rough height, so cards can be dealt into the shortest column without measuring them first
function estimateCardHeight({ date, list }: DayCardData, today: string): number {
  const rows = list.reduce((sum, t) => sum + 46 + (t.text.length > 28 ? 21 : 0) + (t.text.length > 56 ? 21 : 0), 0);
  return 58 + rows + (date && date >= today ? 44 : 0);
}

function DayCard({ date, list, today, onPickDate }: DayCardData & { today: string; onPickDate: (date: string) => void }) {
  const { title, sub } = formatFriendlyDate(date || null);
  const { done, total } = tallyTasks(list);
  const isPast = Boolean(date) && date < today;
  const meta = (t: Task) => (t.startTime ? formatTimeRangeDisplay(t.startTime, t.endTime) : t.repeat || t.isOccurrence ? repeatMeta(t) : isPast && !t.completed ? ageLabel(date, today) : '');
  const header = (
    <>
      <b>{title}</b>
      <span className="d">{sub}</span>
      <span className="dk-meter" aria-hidden="true">
        <i style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
      </span>
      <span className="c">{done}/{total}</span>
    </>
  );
  return (
    <article className={`bd-card ${date === today ? 'is-today' : ''} ${isPast ? 'is-past' : ''}`} aria-label={title} data-drop-date={date || undefined}>
      {date ? (
        <button type="button" className="bd-card-h" title="Open this day" data-sfx="open" onClick={() => onPickDate(date)}>
          {header}
        </button>
      ) : (
        <div className="bd-card-h">{header}</div>
      )}
      {list.length > 0 && (
        <ul className="lp-trail-list dk-list">
          {list.map(task => <DeskRow key={task.id} task={task} meta={meta(task)} showTime={false} />)}
        </ul>
      )}
      {date && date >= today && <CardAdd date={date} dayLabel={title} />}
    </article>
  );
}

function Board({ tasks, today, isOpen, composer, scrollRef, onPickDate }: { tasks: Task[]; today: string; isOpen: boolean; composer: ReactNode; scrollRef?: RefCallback<HTMLElement>; onPickDate: (date: string) => void }) {
  const gridRef = useRef<HTMLDivElement>(null);
  const [columnCount, setColumnCount] = useState(3);
  const { open, done } = tallyTasks(tasks);

  useLayoutEffect(() => {
    const el = gridRef.current;
    if (!el) return;
    const measure = () => setColumnCount(Math.max(1, Math.floor((el.clientWidth + CARD_GAP) / (CARD_MIN + CARD_GAP))));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Today first, then the days ahead, then the past (newest first), then anything without a date
  const cards = useMemo<DayCardData[]>(() => {
    const byDate = new Map<string, Task[]>([[today, []], [addDays(today, 1), []]]);
    tasks.forEach(task => {
      const key = task.date || '';
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key)!.push(task);
    });
    const rank = (d: string) => (d === today ? 0 : !d ? 3 : d > today ? 1 : 2);
    return Array.from(byDate.entries())
      .sort(([a], [b]) => rank(a) - rank(b) || (rank(a) === 1 ? a.localeCompare(b) : b.localeCompare(a)))
      .map(([date, list]) => ({ date, list: sortTaskList(list, true) }));
  }, [tasks, today]);

  // Each card goes to the shortest column, so short days fill in beside long ones with no holes
  const columns = useMemo(() => {
    const cols = Array.from({ length: columnCount }, () => ({ height: 0, cards: [] as DayCardData[] }));
    cards.forEach(card => {
      const target = cols.reduce((a, b) => (b.height < a.height ? b : a));
      target.cards.push(card);
      target.height += estimateCardHeight(card, today) + CARD_GAP;
    });
    return cols.map(col => col.cards);
  }, [cards, columnCount, today]);

  return (
    <section className="bd" aria-label="All days" aria-hidden={!isOpen} inert={!isOpen}>
      <header className="bd-head">
        <h2 className="bd-title">All days</h2>
        <p className="bd-tally">
          <b>{open}</b> open · <b className="is-lit">{done}</b> lit
        </p>
        <div className="dk-place phone-composer">{isOpen && composer}</div>
      </header>
      <div className="bd-scroll" ref={scrollRef}>
        <div className="bd-grid" ref={gridRef}>
          {columns.map((col, i) => (
            <div className="bd-col" key={i}>
              {col.map(card => <DayCard key={card.date || 'undated'} {...card} today={today} onPickDate={onPickDate} />)}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------- Shell ----------

export function DesktopShell(props: DesktopShellProps) {
  const { tasks, today, focusDate, isPickedDate, dayTasks, otherDaysOpen, scrollRef, backLabel, onToggleAllDays, onBack, onPickDate, profile, composer, inspector, isInspectorOpen, onCloseInspector, theme, onSetTheme } = props;
  const isAll = focusDate === null;
  // While All days is open, the slate (hidden behind the board) and the world keep today
  const day = focusDate ?? today;
  const isToday = day === today;
  const slateTasks = useMemo(() => (focusDate ? dayTasks : tasks.filter(t => t.date === today)), [focusDate, dayTasks, tasks, today]);
  const timed = useMemo(() => sortTaskList(slateTasks, true).filter(t => t.startTime), [slateTasks]);
  const { open, done } = tallyTasks(slateTasks);

  // Lighting the task you are on blooms the big lantern jade for a moment
  const [bloom, setBloom] = useState(false);
  const bloomTimer = useRef(0);
  useEffect(() => () => window.clearTimeout(bloomTimer.current), []);
  const markDone = (task: Task) => {
    window.clearTimeout(bloomTimer.current);
    setBloom(true);
    bloomTimer.current = window.setTimeout(() => setBloom(false), 1250);
    setTaskCompleted(task, true);
  };

  // How far the slate reaches over the path: the traveller stands in the open part beside it
  const slateRef = useRef<HTMLElement>(null);
  const [edge, setEdge] = useState(() => ({ right: estimateSlateEdge(), covers: true }));
  useLayoutEffect(() => {
    const el = slateRef.current;
    if (!el) return;
    const measure = () => {
      const rect = el.getBoundingClientRect();
      const next = { right: Math.round(rect.right), covers: rect.bottom > window.innerHeight - STRIP_H - PATH_H + 90 };
      setEdge(prev => (prev.right === next.right && prev.covers === next.covers ? prev : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    window.addEventListener('resize', measure);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  const cover = !isAll && edge.covers ? edge.right : 0;

  // The slate's list fades at whichever edge has more to show, instead of being cut off
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [fade, setFade] = useState({ top: false, bottom: false });
  const updateFade = () => {
    const el = bodyRef.current;
    if (!el) return;
    const next = { top: el.scrollTop > 2, bottom: el.scrollTop + el.clientHeight < el.scrollHeight - 2 };
    setFade(prev => (prev.top === next.top && prev.bottom === next.bottom ? prev : next));
  };
  useLayoutEffect(updateFade);
  // Stable, so React does not detach and re-attach the app's scroll pane on every render
  const setBody = useCallback(
    (el: HTMLDivElement | null) => {
      bodyRef.current = el;
      if (!isAll) scrollRef(el);
    },
    [isAll, scrollRef]
  );

  const d = parseISODate(day);
  const title = isToday ? 'Today' : formatFriendlyDate(day).title;
  const dateLine = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <div className={`lp-app dk-root ${isAll ? 'is-all' : ''}`}>
      <div className="dk-world">
        <LanternSky />
        <Scenery />
        <DeskPost timed={timed} isToday={isToday} day={day} dayCount={slateTasks.length} bloom={bloom} />
        <LanternPanorama timed={timed} isToday={isToday} tasks={slateTasks} cover={cover} leadIn={edge.right} pointerWalk />
        <div className="dk-strip">
          {timed.length > 0 && (
            <span className="dk-strip-hint">
              <MoveHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
              Scroll or drag the path to walk the day. Click a lantern to light it.
            </span>
          )}
          <span className="dk-strip-keys">
            <span><kbd className="kbd">Q</kbd><kbd className="kbd">E</kbd> walk days</span>
            <span><kbd className="kbd">A</kbd> all days</span>
          </span>
        </div>
        <div className="dk-world-scrim" />
      </div>

      <aside className="sl" ref={slateRef} aria-label={title} aria-hidden={isAll} inert={isAll} data-drop-date={day}>
        <header className="sl-head">
          {isPickedDate && (
            <button type="button" className="sl-back" aria-label={backLabel ?? 'Back'} title={`${backLabel ?? 'Back'} (Esc)`} data-sfx="close" onClick={onBack}>
              <ArrowLeft size={19} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          <div className="sl-date">
            <h1 className="sl-weekday">{title}</h1>
            <div className="picker-chip-wrap sl-datewrap">
              <span className="sl-datebtn">
                {dateLine}
                <ChevronDown size={15} strokeWidth={2} aria-hidden="true" />
              </span>
              <DatePicker ariaLabel="Jump to a date" value={day} onChange={onPickDate} />
            </div>
          </div>
          <p className="sl-tally">
            <b>{open}</b> open · <b className="is-lit">{done}</b> lit
            <span className="dk-meter" aria-hidden="true">
              <i style={{ width: `${slateTasks.length ? (done / slateTasks.length) * 100 : 0}%` }} />
            </span>
          </p>
        </header>
        <div className="dk-place phone-composer">{!isAll && composer}</div>
        <div className={`sl-body ${fade.top ? 'dk-fade-t' : ''} ${fade.bottom ? 'dk-fade-b' : ''}`} ref={setBody} onScroll={updateFade}>
          <SlateBody tasks={tasks} today={today} day={day} dayTasks={slateTasks} onMarkDone={markDone} />
        </div>
        <footer className="sl-foot">
          {isPickedDate ? (
            <button type="button" className="sl-expander" title={`${backLabel ?? 'Back'} (Esc)`} data-sfx="close" onClick={onBack}>
              <ArrowLeft className="chev is-back" size={18} strokeWidth={2.2} aria-hidden="true" />
              <span className="grow">{backLabel ?? 'Back'}</span>
              <kbd className="kbd">Esc</kbd>
            </button>
          ) : (
            <button type="button" className="sl-expander" aria-keyshortcuts="a" title="Show all days (A)" data-sfx="open" onClick={onToggleAllDays}>
              <MapIcon className="dk-map" size={18} strokeWidth={1.7} aria-hidden="true" />
              <span className="grow">Show all days</span>
              {otherDaysOpen > 0 && <span className="sl-pill">{otherDaysOpen} more</span>}
              <kbd className="kbd">A</kbd>
              <ChevronRight className="chev" size={18} strokeWidth={2.2} aria-hidden="true" />
            </button>
          )}
        </footer>
      </aside>

      <Board tasks={tasks} today={today} isOpen={isAll} composer={composer} scrollRef={isAll ? scrollRef : undefined} onPickDate={onPickDate} />
      <button type="button" className="bd-back" tabIndex={isAll ? 0 : -1} aria-hidden={!isAll} title="Back to today (A)" data-sfx="close" onClick={onToggleAllDays}>
        <ArrowLeft size={18} strokeWidth={2.2} aria-hidden="true" />
        Back to today
        <kbd className="kbd">A</kbd>
      </button>

      <div className="dk-keys-tr">
        <HorizonDial theme={theme} onSetTheme={onSetTheme} />
        {profile}
      </div>

      <div className={`dk-scrim ${isInspectorOpen ? 'is-open' : ''}`} aria-hidden="true" onClick={onCloseInspector} />
      {inspector}
    </div>
  );
}
