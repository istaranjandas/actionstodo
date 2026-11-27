// Phones get the Lantern Path instead of the 3D valley: the day is a trail through a valley, the task you
// are on burns in the focus lantern, and lighting a lantern marks its task done (LanternPath.tsx). The
// add-task bar sits at the thumb, and an All days screen slides in over the day. Rows tap open the
// existing details sheet; the mascot key opens the profile sheet.
import { useMemo, useState } from 'react';
import type { ReactNode, RefCallback } from 'react';
import { ArrowLeft, CalendarDays, Check, ChevronRight, Clock3, CornerDownRight, Map as MapIcon, MoveHorizontal, Repeat2 } from 'lucide-react';
import { addDays, formatFriendlyDate, formatShortDate, parseISODate } from '../modules/dateUtils';
import { formatTimeRangeDisplay } from '../modules/timeUtils';
import { repeatShortLabel } from '../modules/recurrence';
import { sortTaskList, tallyTasks, updateTaskItem } from '../modules/store';
import { setTaskCompleted } from '../modules/taskActions';
import { pushToast } from '../modules/toasts';
import { playUiSound } from '../audio/uiSounds';
import { useTaskSelection } from './TaskSelection';
import { DatePicker } from './DatePicker';
import type { Task, Theme } from '../types';
import { HorizonDial, LanternFocus, LanternPanorama, LanternSky, TrailList, WeekCairns } from './LanternPath';

type DaysFilter = 'open' | 'done' | 'all';

interface PhoneShellProps {
  tasks: Task[];
  today: string;
  // The day on screen (today or a picked date); null while All days is open
  focusDate: string | null;
  // A picked date, as opposed to today's own screen
  isPickedDate: boolean;
  dayTasks: Task[];
  isScrolled: boolean;
  scrollRef: RefCallback<HTMLElement>;
  onOpenAll: () => void;
  onCloseAll: () => void;
  onBack: () => void;
  onPickDate: (date: string) => void;
  profile: ReactNode;
  composer: ReactNode;
  theme: Theme;
  onSetTheme: (theme: Theme) => void;
}

// Monday-first, like the date picker
const weekStart = (date: string) => addDays(date, -((parseISODate(date).getDay() + 6) % 7));

const shortDay = (date: string) => parseISODate(date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

function headerDateLine(date: string, today: string): string {
  const d = parseISODate(date);
  const isNear = Math.abs(parseISODate(today).getTime() - d.getTime()) <= 86400000;
  return isNear
    ? d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })
    : d.toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
}

function groupByDate(list: Task[]): [string, Task[]][] {
  const byDate = new Map<string, Task[]>();
  list.forEach(task => {
    if (!byDate.has(task.date)) byDate.set(task.date, []);
    byDate.get(task.date)!.push(task);
  });
  return Array.from(byDate.entries()).map(([date, dayTasks]) => [date, sortTaskList(dayTasks, true)]);
}

// ---------- Task row ----------

function PhoneTaskRow({ task, showDate = false, isNow = false }: { task: Task; showDate?: boolean; isNow?: boolean }) {
  const { selectedTaskId, openTask } = useTaskSelection();
  const time = task.startTime ? formatTimeRangeDisplay(task.startTime, task.endTime) : '';
  const repeat = task.repeat ? repeatShortLabel(task.repeat) : task.isOccurrence ? 'Repeats' : '';
  const hasMeta = Boolean(time || repeat || showDate);
  const MetaIcon = showDate ? CalendarDays : time ? Clock3 : Repeat2;

  return (
    <div className={`phone-task ${task.completed ? 'is-done' : ''} ${isNow ? 'is-now' : ''} ${selectedTaskId === task.id ? 'is-selected' : ''}`} role="listitem" data-id={task.id}>
      <button
        type="button"
        className="phone-check"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.completed ? `Mark “${task.text}” as not done` : `Mark “${task.text}” as done`}
        data-sfx="none"
        onClick={() => setTaskCompleted(task, !task.completed)}
      >
        <span className="phone-check-box" aria-hidden="true">
          <Check size={14} strokeWidth={3} />
        </span>
      </button>
      <button type="button" className="phone-task-body" data-sfx="open" onClick={() => openTask(task.id)}>
        <span className="phone-task-title">{task.text}</span>
        {hasMeta && (
          <span className="phone-task-meta">
            {isNow ? <span className="phone-now-dot" aria-hidden="true" /> : <MetaIcon size={13} strokeWidth={2.2} aria-hidden="true" />}
            {isNow && <span>Now ·</span>}
            {showDate && <span>{formatShortDate(task.date)}</span>}
            {time && !showDate && <span>{time}</span>}
            {repeat && <span>· {repeat}</span>}
          </span>
        )}
      </button>
    </div>
  );
}

function TaskList({ tasks, nowId, showDate, className = '' }: { tasks: Task[]; nowId?: string; showDate?: boolean; className?: string }) {
  return (
    <div className={`phone-list ${className}`} role="list">
      {tasks.map(task => (
        <PhoneTaskRow key={task.id} task={task} isNow={task.id === nowId} showDate={showDate} />
      ))}
    </div>
  );
}

// ---------- Day screen: the Lantern Path ----------

const ageLabel = (date: string, today: string) => {
  const days = Math.round((parseISODate(today).getTime() - parseISODate(date).getTime()) / 86400000);
  if (days < 7) return days === 1 ? 'yesterday' : `${days} days ago`;
  const weeks = Math.floor(days / 7);
  return weeks === 1 ? 'a week ago' : `${weeks} weeks ago`;
};

function DayScreen({ tasks, today, focusDate, isPickedDate, dayTasks, onOpenAll, onPickDate }: Pick<PhoneShellProps, 'tasks' | 'today' | 'isPickedDate' | 'dayTasks' | 'onOpenAll' | 'onPickDate'> & { focusDate: string }) {
  const isToday = focusDate === today;
  const sorted = useMemo(() => sortTaskList(dayTasks, true), [dayTasks]);
  const timed = useMemo(() => sorted.filter(t => t.startTime), [sorted]);
  const anytime = sorted.filter(t => !t.startTime);
  const { done, total } = tallyTasks(dayTasks);

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

  const anytimeMeta = (task: Task) => (task.repeat ? repeatShortLabel(task.repeat) : task.isOccurrence ? 'Repeats' : '');

  return (
    <>
      {isToday && <LanternFocus timed={timed} today={today} />}
      <LanternPanorama timed={timed} isToday={isToday} tasks={dayTasks} />

      <div className="lp-ground">
        {timed.length > 0 && (
          <p className="lp-hint">
            <MoveHorizontal size={16} strokeWidth={1.8} aria-hidden="true" />
            Swipe the path to walk the day. Tap a lantern to light it.
          </p>
        )}

        <section className="lp-sec" aria-labelledby="lp-walk-title">
          <div className="lp-walk-head">
            <h2 className="lp-h" id="lp-walk-title">
              {total === 0 ? 'Nothing planned yet' : `${done} of ${total} ${total === 1 ? 'lantern' : 'lanterns'} lit`}
            </h2>
            {!isPickedDate && (
              <button type="button" className="lp-alldays" data-sfx="open" aria-keyshortcuts="a" onClick={onOpenAll}>
                All days
                <MapIcon size={18} strokeWidth={1.7} aria-hidden="true" />
              </button>
            )}
          </div>
          <WeekCairns tasks={tasks} today={today} focusDate={focusDate} onPickDate={onPickDate} />
        </section>

        {carried.length > 0 && (
          <section className="lp-sec" aria-labelledby="lp-carried-title">
            <h2 className="lp-h" id="lp-carried-title">Left on the trail</h2>
            <p className="lp-sub">
              {carried.length === 1 ? 'One lantern' : `${carried.length} lanterns`} from earlier days, still unlit.
            </p>
            <TrailList tasks={carried} meta={task => `${formatShortDate(task.date)} · ${ageLabel(task.date, today)}`} />
            <button type="button" className="lp-btn-move" data-sfx="none" onClick={moveCarriedToToday}>
              <CornerDownRight size={19} strokeWidth={1.8} aria-hidden="true" />
              Move all to today
            </button>
          </section>
        )}

        {anytime.length > 0 && (
          <section className="lp-sec" aria-labelledby="lp-pack-title">
            <h2 className="lp-h" id="lp-pack-title">Anytime</h2>
            <p className="lp-sub">In your pack. No set time {isToday ? 'today' : 'on this day'}.</p>
            <TrailList tasks={anytime} meta={anytimeMeta} />
          </section>
        )}

        {total === 0 && carried.length === 0 && (
          <p className="lp-empty">{isToday ? 'Place a lantern below to start today’s path.' : 'Place a lantern below to plan this day.'}</p>
        )}
      </div>
    </>
  );
}

// ---------- All days screen ----------

function DayBlock({ date, tasks, today, onPickDate }: { date: string; tasks: Task[]; today: string; onPickDate: (date: string) => void }) {
  const { title, sub } = formatFriendlyDate(date);
  return (
    <div className={`phone-day ${date === today ? 'is-today' : ''}`}>
      <button type="button" className="phone-day-head" data-sfx="open" title="Open this day" onClick={() => onPickDate(date)}>
        <span className="phone-day-name">{title}</span>
        <span className="phone-day-date">{sub}</span>
        <span className="phone-day-count">{tasks.length}</span>
      </button>
      <TaskList tasks={tasks} />
    </div>
  );
}

function AllDaysScreen({ tasks, today, onPickDate }: Pick<PhoneShellProps, 'tasks' | 'today' | 'onPickDate'>) {
  const [filter, setFilter] = useState<DaysFilter>('open');
  const [openWeeks, setOpenWeeks] = useState<Set<string>>(() => new Set());
  const { open: openCount, done: doneCount } = tallyTasks(tasks);

  const visible = useMemo(
    () => tasks.filter(t => (filter === 'all' ? true : filter === 'open' ? !t.completed : t.completed)),
    [tasks, filter]
  );
  const ahead = useMemo(() => groupByDate(visible.filter(t => t.date > today)).sort(([a], [b]) => a.localeCompare(b)), [visible, today]);
  const todayTasks = useMemo(() => sortTaskList(visible.filter(t => t.date === today), true), [visible, today]);
  const past = useMemo(() => groupByDate(visible.filter(t => t.date && t.date < today)).sort(([a], [b]) => b.localeCompare(a)), [visible, today]);
  const undated = useMemo(() => visible.filter(t => !t.date), [visible]);
  // Open work stays in plain sight; finished weeks fold into one line each
  const weeks = useMemo(() => {
    const byWeek = new Map<string, [string, Task[]][]>();
    past.forEach(entry => {
      const key = weekStart(entry[0]);
      if (!byWeek.has(key)) byWeek.set(key, []);
      byWeek.get(key)!.push(entry);
    });
    return Array.from(byWeek.entries());
  }, [past]);

  const toggleWeek = (key: string) =>
    setOpenWeeks(current => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const filters: [DaysFilter, string, number | null][] = [
    ['open', 'Open', openCount],
    ['done', 'Done', doneCount],
    ['all', 'Everything', null]
  ];
  const isEmpty = !ahead.length && !todayTasks.length && !past.length && !undated.length;

  return (
    <>
      <div className="phone-chips" role="group" aria-label="Show">
        {filters.map(([key, label, count]) => (
          <button key={key} type="button" className="phone-chip" aria-pressed={filter === key} data-sfx="select" onClick={() => setFilter(key)}>
            {label}
            {count !== null && <span className="phone-chip-count">{count}</span>}
          </button>
        ))}
      </div>

      {ahead.length > 0 && (
        <section className="phone-section">
          <div className="phone-section-head"><h2 className="phone-section-title">Coming up</h2></div>
          <div className="phone-list">
            {ahead.map(([date, dayTasks]) => <DayBlock key={date} date={date} tasks={dayTasks} today={today} onPickDate={onPickDate} />)}
          </div>
        </section>
      )}

      {(todayTasks.length > 0 || (filter === 'open' && past.length > 0)) && (
        <section className="phone-section">
          <div className="phone-section-head">
            <h2 className="phone-section-title">{filter === 'open' && past.length > 0 ? 'Today and overdue' : 'Today'}</h2>
          </div>
          <div className="phone-list">
            {todayTasks.length > 0 && <DayBlock date={today} tasks={todayTasks} today={today} onPickDate={onPickDate} />}
            {filter === 'open' && past.map(([date, dayTasks]) => <DayBlock key={date} date={date} tasks={dayTasks} today={today} onPickDate={onPickDate} />)}
          </div>
        </section>
      )}

      {filter !== 'open' && weeks.length > 0 && (
        <section className="phone-section">
          <div className="phone-section-head"><h2 className="phone-section-title">Earlier</h2></div>
          <div className="phone-list">
            {weeks.map(([key, days]) => {
              const weekTasks = days.flatMap(([, dayTasks]) => dayTasks);
              const { open, done } = tallyTasks(weekTasks);
              const isOpen = openWeeks.has(key);
              return (
                <div className="phone-week" key={key}>
                  <button type="button" className="phone-week-head" aria-expanded={isOpen} data-sfx={isOpen ? 'close' : 'open'} onClick={() => toggleWeek(key)}>
                    <span className="phone-week-copy">
                      <span className="phone-week-range">{shortDay(key)} – {shortDay(addDays(key, 6))}</span>
                      <span className="phone-week-detail">
                        {done > 0 && <span className="is-done">{done} done</span>}
                        {open > 0 && <span className="is-open">{open} open</span>}
                      </span>
                    </span>
                    <ChevronRight size={20} aria-hidden="true" />
                  </button>
                  {isOpen && (
                    <div className="phone-week-body">
                      {days.map(([date, dayTasks]) => <DayBlock key={date} date={date} tasks={dayTasks} today={today} onPickDate={onPickDate} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {undated.length > 0 && (
        <section className="phone-section">
          <div className="phone-section-head"><h2 className="phone-section-title">No date</h2></div>
          <TaskList tasks={undated} />
        </section>
      )}

      {isEmpty && (
        <p className="phone-empty">
          {filter === 'open' ? 'Nothing open. Every task is done.' : filter === 'done' ? 'No finished tasks yet.' : 'No tasks yet.'}
        </p>
      )}
    </>
  );
}

// ---------- Shell ----------

export function PhoneShell(props: PhoneShellProps) {
  const { today, focusDate, isPickedDate, isScrolled, scrollRef, onCloseAll, onBack, onPickDate, profile, composer, theme, onSetTheme } = props;

  if (focusDate === null) {
    return (
      <div className="phone-app lp-app is-all">
        <div className="phone-screen is-pushed" key="all">
          <header className={`phone-appbar ${isScrolled ? 'is-scrolled' : ''}`}>
            <button type="button" className="phone-icon-btn" aria-label="Back to today" title="Back (Esc)" data-sfx="close" onClick={onCloseAll}>
              <ArrowLeft size={22} strokeWidth={2} aria-hidden="true" />
            </button>
            <div className="phone-appbar-copy">
              <h1 className="phone-title">All days</h1>
            </div>
            {profile}
          </header>
          <div className="phone-body" ref={scrollRef}>
            <AllDaysScreen tasks={props.tasks} today={today} onPickDate={onPickDate} />
          </div>
        </div>
      </div>
    );
  }

  const isToday = focusDate === today;
  return (
    <div className="phone-app lp-app is-day">
      <div className="phone-screen" key="day">
        <div className="phone-body lp-body" ref={scrollRef}>
          <div className="lp-scene">
            <LanternSky />
            <header className="lp-top">
              {isPickedDate && (
                <button type="button" className="phone-icon-btn lp-back" aria-label="Back" title="Back (Esc)" data-sfx="close" onClick={onBack}>
                  <ArrowLeft size={22} strokeWidth={2} aria-hidden="true" />
                </button>
              )}
              <div className="lp-date">
                <h1 className="lp-weekday">
                  {isToday ? parseISODate(focusDate).toLocaleDateString(undefined, { weekday: 'long' }) : formatFriendlyDate(focusDate).title}
                </h1>
                <div className="picker-chip-wrap phone-date">
                  <span className="phone-date-label">{headerDateLine(focusDate, today)}</span>
                  <DatePicker ariaLabel="Jump to a date" value={focusDate} onChange={onPickDate} />
                </div>
              </div>
              <div className="lp-top-actions">
                <HorizonDial theme={theme} onSetTheme={onSetTheme} />
                {profile}
              </div>
            </header>
            <DayScreen {...props} focusDate={focusDate} />
          </div>
        </div>

        <div className="phone-composer lp-placebar">{composer}</div>
      </div>
    </div>
  );
}
