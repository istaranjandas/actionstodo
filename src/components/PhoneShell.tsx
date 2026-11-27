// Phones get a plain app instead of the 3D valley: a day screen (today by default) with what is left over
// from earlier, the day's schedule and the add-task bar at the thumb, and an All days screen that slides
// in over it. Rows tap open the existing details sheet; the mascot key opens the profile sheet.
import { useMemo, useState } from 'react';
import type { ReactNode, RefCallback } from 'react';
import { ArrowLeft, CalendarDays, Check, ChevronRight, Clock3, Repeat2 } from 'lucide-react';
import { addDays, formatFriendlyDate, formatShortDate, parseISODate } from '../modules/dateUtils';
import { formatTimeRangeDisplay } from '../modules/timeUtils';
import { repeatShortLabel } from '../modules/recurrence';
import { sortTaskList, tallyTasks, updateTaskItem } from '../modules/store';
import { taskDuration } from '../modules/listDrag';
import { setTaskCompleted } from '../modules/taskActions';
import { pushToast } from '../modules/toasts';
import { playUiSound } from '../audio/uiSounds';
import { useMinuteClock } from '../hooks/useMinuteClock';
import { useTaskSelection } from './TaskSelection';
import { DatePicker } from './DatePicker';
import type { Task } from '../types';

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
}

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

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

// ---------- Day screen ----------

function DayScreen({ tasks, today, focusDate, isPickedDate, dayTasks, onOpenAll }: Pick<PhoneShellProps, 'tasks' | 'today' | 'isPickedDate' | 'dayTasks' | 'onOpenAll'> & { focusDate: string }) {
  const nowMinutes = useMinuteClock();
  const isToday = focusDate === today;
  const sorted = useMemo(() => sortTaskList(dayTasks, true), [dayTasks]);
  const timed = sorted.filter(t => t.startTime);
  const anytime = sorted.filter(t => !t.startTime);
  const { done, total } = tallyTasks(dayTasks);
  const nowTask = isToday
    ? timed.find(t => !t.completed && toMinutes(t.startTime) <= nowMinutes && toMinutes(t.startTime) + taskDuration(t) > nowMinutes)
    : undefined;

  // One-off tasks left open on past days. Repeating tasks stay out: the series comes round again on its own.
  const carried = useMemo(
    () => (isToday ? sortTaskList(tasks.filter(t => t.date && t.date < today && !t.completed && !t.repeat && !t.isOccurrence)) : []),
    [tasks, today, isToday]
  );
  const otherDaysOpen = useMemo(() => tasks.filter(t => !t.completed && t.date !== focusDate).length, [tasks, focusDate]);

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
      {total > 0 && (
        <div className="phone-progress">
          <span className="phone-progress-label">
            <strong>{done}</strong> of <strong>{total}</strong> done
          </span>
          <span className="phone-progress-track" role="progressbar" aria-label="Done today" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
            <span className="phone-progress-fill" style={{ width: `${(done / total) * 100}%` }} />
          </span>
        </div>
      )}

      {carried.length > 0 && (
        <section className="phone-section" aria-labelledby="phone-carried-title">
          <div className="phone-section-head">
            <h2 className="phone-section-title" id="phone-carried-title">
              From earlier <span className="phone-section-count">{carried.length}</span>
            </h2>
            <button type="button" className="phone-text-btn" onClick={moveCarriedToToday}>
              Move to today
            </button>
          </div>
          <TaskList tasks={carried} showDate className="is-carried" />
        </section>
      )}

      {total === 0 && <p className="phone-empty">{isToday ? 'Nothing planned for today. Add a task below.' : 'Nothing planned for this day. Add a task below.'}</p>}

      {timed.length > 0 && (
        <section className="phone-section" aria-labelledby="phone-schedule-title">
          <div className="phone-section-head">
            <h2 className="phone-section-title" id="phone-schedule-title">
              Schedule <span className="phone-section-count">{timed.length}</span>
            </h2>
          </div>
          <TaskList tasks={timed} nowId={nowTask?.id} />
        </section>
      )}

      {anytime.length > 0 && (
        <section className="phone-section" aria-labelledby="phone-anytime-title">
          <div className="phone-section-head">
            <h2 className="phone-section-title" id="phone-anytime-title">
              Anytime <span className="phone-section-count">{anytime.length}</span>
            </h2>
          </div>
          <TaskList tasks={anytime} />
        </section>
      )}

      {!isPickedDate && (
        <section className="phone-section">
          <button type="button" className="phone-nav-row" data-sfx="open" aria-keyshortcuts="a" onClick={onOpenAll}>
            <span className="phone-nav-icon" aria-hidden="true">
              <CalendarDays size={18} strokeWidth={2} />
            </span>
            <span className="phone-nav-copy">
              <span className="phone-nav-title">All days</span>
              <span className="phone-nav-detail">{otherDaysOpen > 0 ? `${otherDaysOpen} open on other days` : 'Every past and upcoming day'}</span>
            </span>
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </section>
      )}
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
  const { today, focusDate, isPickedDate, isScrolled, scrollRef, onCloseAll, onBack, onPickDate, profile, composer } = props;
  const isAll = focusDate === null;
  const title = isAll ? 'All days' : formatFriendlyDate(focusDate).title;

  return (
    <div className={`phone-app ${isAll ? 'is-all' : 'is-day'}`}>
      <div className={`phone-screen ${isAll ? 'is-pushed' : ''}`} key={isAll ? 'all' : 'day'}>
        <header className={`phone-appbar ${isScrolled ? 'is-scrolled' : ''}`}>
          {(isAll || isPickedDate) && (
            <button type="button" className="phone-icon-btn" aria-label={isAll ? 'Back to today' : 'Back'} title="Back (Esc)" data-sfx="close" onClick={isAll ? onCloseAll : onBack}>
              <ArrowLeft size={22} strokeWidth={2} aria-hidden="true" />
            </button>
          )}
          <div className="phone-appbar-copy">
            {!isAll && (
              <div className="picker-chip-wrap phone-date">
                <span className="phone-date-label">{headerDateLine(focusDate, today)}</span>
                <DatePicker ariaLabel="Jump to a date" value={focusDate} onChange={onPickDate} />
              </div>
            )}
            <h1 className="phone-title">{title}</h1>
          </div>
          {profile}
        </header>

        <div className="phone-body" ref={scrollRef}>
          {isAll ? (
            <AllDaysScreen tasks={props.tasks} today={today} onPickDate={onPickDate} />
          ) : (
            <DayScreen {...props} focusDate={focusDate} />
          )}
        </div>

        {!isAll && <div className="phone-composer">{composer}</div>}
      </div>
    </div>
  );
}
