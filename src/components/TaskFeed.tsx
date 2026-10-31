import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { Check, ChevronRight, Pencil, Plus, Repeat2, Trash2 } from 'lucide-react';
import { formatFriendlyDate, formatShortDate, getLocalISODate } from '../modules/dateUtils';
import { addMinutesToTime, formatTimeRangeDisplay } from '../modules/timeUtils';
import { parseTaskInput, repeatBadgeLabel, repeatShortLabel } from '../modules/recurrence';
import { sortTaskList, tallyTasks, updateTaskItem } from '../modules/store';
import { getDropSlots } from '../modules/listDrag';
import { logTask, moveTask, removeTask, renameTask, setTaskCompleted } from '../modules/taskActions';
import { useInlineTextEdit } from '../hooks/useInlineTextEdit';
import { useMinuteClock } from '../hooks/useMinuteClock';
import { useOpenTimePopover } from './TimePopover';
import { useTaskSelection } from './TaskSelection';
import { ClockIcon } from './Icons';
import type { AppState, Task } from '../types';
import { DatePicker } from './DatePicker';

export type FeedLayout = 'column' | 'grid';

interface TaskFeedProps {
  appState: AppState;
  // The view's tasks from summarizeView, the same list the slate header and lens badges count
  viewTasks: Task[];
  layout: FeedLayout;
}

const EMPTY_MESSAGES: Record<string, string> = {
  upcoming: 'Nothing scheduled ahead. Add a task and pick a future date.',
  'this-week': 'Nothing planned for this week yet.',
  completed: 'No completed tasks yet. Finish one and it lands here.',
  all: 'No tasks yet. Add one above to get started.'
};

export function getSortedDateGroups(appState: AppState, filtered: Task[]): { dateKey: string; tasks: Task[] }[] {
  const today = getLocalISODate();

  // Group tasks by date
  const groupsMap = new Map<string, Task[]>();
  filtered.forEach(task => {
    const key = task.date || 'Undated';
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key)!.push(task);
  });

  // Collect unique dates
  const dateSet = new Set(groupsMap.keys());
  if (appState.specificDateFilter) {
    // Always show the picked day, even when empty, so tasks can be added to it
    dateSet.add(appState.specificDateFilter);
  } else if (appState.currentView === 'all' || appState.currentView === 'today') {
    dateSet.add(today);
  }

  // Sort dates:
  // In upcoming / this-week view: ascending forward in time
  // In all view: Today first, then upcoming days (ascending), then past days (descending)
  // Otherwise: descending
  const dateRank = (d: string) => (d === today ? 0 : d > today ? 1 : 2);
  const sortedDates = Array.from(dateSet).sort((a, b) => {
    if (a === 'Undated') return 1;
    if (b === 'Undated') return -1;
    if (appState.currentView === 'upcoming' || appState.currentView === 'this-week') {
      return a.localeCompare(b);
    }
    if (appState.currentView === 'all' && !appState.specificDateFilter) {
      const rankDiff = dateRank(a) - dateRank(b);
      if (rankDiff !== 0) return rankDiff;
      return dateRank(a) === 1 ? a.localeCompare(b) : b.localeCompare(a);
    }
    return b.localeCompare(a);
  });

  return sortedDates.map(dateKey => ({ dateKey, tasks: sortTaskList(groupsMap.get(dateKey) || [], true) }));
}

export function TaskFeed({ appState, viewTasks, layout }: TaskFeedProps) {
  const groups = useMemo(
    () => getSortedDateGroups(appState, viewTasks),
    [viewTasks, appState.currentView, appState.specificDateFilter]
  );
  const isTodayBoard = appState.currentView === 'today' && !appState.specificDateFilter;
  const isGrid = layout === 'grid';
  // Day cards take new tasks inline, except in Done (finished work only)
  const canAddInCard = isGrid && appState.currentView !== 'completed';

  if (isTodayBoard) {
    return <TodayBoard tasks={groups[0]?.tasks ?? []} />;
  }

  if (groups.length === 0) {
    return <div className="empty-state">{EMPTY_MESSAGES[appState.currentView] ?? 'No tasks found for this view.'}</div>;
  }

  return (
    <>
      {groups.map(({ dateKey, tasks }, index) => (
        <DateGroup key={dateKey} dateKey={dateKey} groupTasks={tasks} staggerIndex={index} isCard={isGrid} canAdd={canAddInCard} />
      ))}
    </>
  );
}

// ---------- Day sections ----------

interface DateGroupProps {
  dateKey: string;
  groupTasks: Task[];
  staggerIndex: number;
  isCard: boolean;
  canAdd: boolean;
}

function DropSlots({ dateKey, tasks }: { dateKey: string; tasks: Task[] }) {
  const dropSlots = useMemo(() => (dateKey !== 'Undated' ? getDropSlots(tasks) : []), [dateKey, tasks]);
  if (dateKey === 'Undated') return null;
  return (
    <div className="drop-slots">
      <div className="drop-slots-hint">Drop on a time slot</div>
      <div className="drop-slots-grid">
        {dropSlots.map(slot => (
          <div key={slot.start} className={`drop-slot ${slot.isBusy ? 'is-busy' : ''}`} data-start={slot.start}>
            {formatTimeRangeDisplay(slot.start)}
          </div>
        ))}
      </div>
    </div>
  );
}

const DateGroup = memo(function DateGroup({ dateKey, groupTasks, staggerIndex, isCard, canAdd }: DateGroupProps) {
  const { title, sub } = formatFriendlyDate(dateKey);
  const { done: completedCount, total } = tallyTasks(groupTasks);
  const pendingTasks = groupTasks.filter(task => !task.completed);
  const completedTasks = groupTasks.filter(task => task.completed);
  const progressPercent = total ? Math.round((completedCount / total) * 100) : 0;
  const today = getLocalISODate();
  const dayTone = dateKey === today ? 'is-today' : dateKey < today ? 'is-past' : '';
  const isDated = dateKey !== 'Undated';
  // Past days have no inline entry point: the command bar above is where retro-logged work goes
  const canAddHere = canAdd && isDated && dateKey >= today;

  return (
    <section
      className={`date-group ${isCard ? 'day-card' : ''} ${dayTone}`}
      data-date={dateKey}
      data-drop-date={isDated ? dateKey : undefined}
      style={{ '--stagger-index': Math.min(staggerIndex, 8) } as CSSProperties}
    >
      {/* A day card names its own date; the single-day slate is already named by the area title */}
      {isCard && (
        <div className="date-group-header">
          <div className="date-group-title-wrap">
            <span className="date-group-name">{title}</span>
            <span className="date-group-subname">{sub}</span>
          </div>
          <div className="date-group-progress" title={`${completedCount} of ${total} done`}>
            <span className="date-group-meter" aria-hidden="true">
              <span className="date-group-meter-fill" style={{ width: `${progressPercent}%` }} />
            </span>
            <span className="date-group-count">{completedCount}/{total}</span>
          </div>
        </div>
      )}
      <div className="task-list" role="list" id={`group-list-${dateKey}`}>
        {pendingTasks.map(task => (
          <TaskRow key={task.id} task={task} />
        ))}
        {pendingTasks.length === 0 && (
          <div className="date-group-empty">{completedTasks.length ? 'All done for this day.' : canAddHere ? 'Nothing planned yet.' : 'Nothing planned yet — log one above.'}</div>
        )}
      </div>
      <CompletedTasks tasks={completedTasks} />
      <DropSlots dateKey={dateKey} tasks={groupTasks} />
      {canAddHere && <DayCardAdd date={dateKey} dayLabel={title} />}
    </section>
  );
});

// "+ New task" at the foot of a day card: an inline command line already scoped to that card's day.
// Stays open after each entry so a day fills in quickly; Escape, or leaving it empty, closes it.
function DayCardAdd({ date, dayLabel }: { date: string; dayLabel: string }) {
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

  const submit = () => {
    const raw = text.trim();
    if (!raw) {
      close();
      return;
    }
    const parsed = parseTaskInput(raw);
    setText('');
    void logTask(parsed.cleanText, date, parsed.startTime, parsed.endTime, parsed.repeat);
  };

  if (!isOpen) {
    return (
      <button type="button" className="day-card-add" data-sfx="open" onClick={() => setIsOpen(true)}>
        <Plus size={13} strokeWidth={2.4} aria-hidden="true" />
        <span>New task</span>
      </button>
    );
  }

  return (
    <form
      className="day-card-add-form"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <Plus className="day-card-add-icon" size={13} strokeWidth={2.4} aria-hidden="true" />
      <input
        ref={inputRef}
        type="text"
        className="day-card-add-input"
        placeholder="New task… try “at 3pm” or “daily”"
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

// ---------- Today board ----------

const toMinutes = (time: string) => {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
};

function formatClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

// An empty day says one quiet line and stops; the command bar above is the only call to action
function TodayEmpty({ allDone }: { allDone: boolean }) {
  return <p className="today-empty">{allDone ? 'All done for today.' : 'No tasks for today. Add one above to start your day.'}</p>;
}

// Finished work is kept, but folded away: pending tasks own the board, completed ones wait below.
function CompletedTasks({ tasks }: { tasks: Task[] }) {
  const [isOpen, setIsOpen] = useState(false);
  const sectionRef = useRef<HTMLElement>(null);
  // Finished work sits below the pending log: opening it should bring the drawer into view
  useEffect(() => {
    if (isOpen) sectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [isOpen]);
  if (tasks.length === 0) return null;

  return (
    <section ref={sectionRef} className={`completed-section ${isOpen ? 'is-open' : ''}`}>
      <button
        type="button"
        className="completed-toggle"
        aria-expanded={isOpen}
        data-sfx="select"
        onClick={() => setIsOpen(open => !open)}
      >
        <span className="completed-toggle-icon" aria-hidden="true">
          <Check size={13} strokeWidth={2.6} />
        </span>
        <span className="completed-toggle-label">Completed</span>
        <span className="completed-count">{tasks.length}</span>
        <ChevronRight className="completed-chevron" size={15} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {isOpen && (
        <div className="task-list completed-list" role="list">
          {tasks.map(task => (
            <TaskRow key={task.id} task={task} />
          ))}
        </div>
      )}
    </section>
  );
}

function TodayBoard({ tasks }: { tasks: Task[] }) {
  const today = getLocalISODate();
  const nowMinutes = useMinuteClock();
  const pending = tasks.filter(task => !task.completed);
  const completed = tasks.filter(task => task.completed);
  const timed = pending.filter(t => t.startTime);
  const anytime = pending.filter(t => !t.startTime);
  const markerIndex = timed.findIndex(t => toMinutes(t.startTime) > nowMinutes);

  return (
    <section className="date-group today-board is-today" data-date={today} data-drop-date={today}>
      {pending.length === 0 ? (
        <TodayEmpty allDone={completed.length > 0} />
      ) : (
        <>
          {timed.length > 0 && (
            <>
              <div className="board-section-label">
                <span>Schedule</span>
                <span className="board-section-count">{timed.length}</span>
              </div>
              <div className="task-list is-schedule" role="list">
                {timed.map((task, index) => (
                  <Fragment key={task.id}>
                    {index === markerIndex && (
                      <div className="now-marker" role="presentation">
                        <span className="now-marker-label">Now · {formatClock(nowMinutes)}</span>
                      </div>
                    )}
                    <TaskRow task={task} />
                  </Fragment>
                ))}
                {markerIndex === -1 && (
                  <div className="now-marker" role="presentation">
                    <span className="now-marker-label">Now · {formatClock(nowMinutes)}</span>
                  </div>
                )}
              </div>
            </>
          )}

          {anytime.length > 0 && (
            <>
              <div className="board-section-label">
                <span>Anytime</span>
                <span className="board-section-count">{anytime.length}</span>
              </div>
              <div className="task-list" role="list">
                {anytime.map(task => (
                  <TaskRow key={task.id} task={task} />
                ))}
              </div>
            </>
          )}
        </>
      )}

      <CompletedTasks tasks={completed} />
      <DropSlots dateKey={today} tasks={tasks} />
    </section>
  );
}

// ---------- Task row ----------

function nudgeTaskTime(task: Task, minutes: number) {
  const baseStart = task.startTime || '09:00';
  const duration = (task.startTime && task.endTime) ? (parseInt(task.endTime.split(':')[0]) * 60 + parseInt(task.endTime.split(':')[1]) - (parseInt(baseStart.split(':')[0]) * 60 + parseInt(baseStart.split(':')[1]))) : 30;
  const newStart = addMinutesToTime(baseStart, minutes);
  const newEnd = addMinutesToTime(newStart, duration > 0 ? duration : 30);
  updateTaskItem(task.id, { startTime: newStart, endTime: newEnd });
}

// Arrow keys walk the visible rows in reading order
function focusSiblingRow(row: HTMLElement, step: 1 | -1) {
  const rows = Array.from(document.querySelectorAll<HTMLElement>('.date-groups .task-row'));
  const next = rows[rows.indexOf(row) + step];
  if (next) {
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
  }
}

const TaskRow = memo(function TaskRow({ task }: { task: Task }) {
  const openTimePopover = useOpenTimePopover();
  const { selectedTaskId, openTask } = useTaskSelection();
  const [justCompleted, setJustCompleted] = useState(false);
  const hasTime = Boolean(task.startTime);
  const timeDisplay = hasTime ? formatTimeRangeDisplay(task.startTime, task.endTime) : 'Anytime';
  const isSelected = selectedTaskId === task.id;
  const repeatLabel = repeatBadgeLabel(task);

  // Inline edit text: double-click (or F2) to edit; single click opens the details panel; drag moves the task
  const { textRef, isEditing, startEditing, handleBlur, handleKeyDown } = useInlineTextEdit({
    text: task.text,
    onCommit: (newText) => renameTask(task, newText)
  });

  const toggleCompleted = (completed: boolean) => {
    setJustCompleted(completed);
    setTaskCompleted(task, completed);
  };

  const handleRowKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target !== e.currentTarget) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      openTask(task.id, true);
    } else if (e.key === ' ') {
      e.preventDefault();
      toggleCompleted(!task.completed);
    } else if (e.key === 'F2') {
      e.preventDefault();
      startEditing();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      focusSiblingRow(e.currentTarget, e.key === 'ArrowDown' ? 1 : -1);
    }
  };

  return (
    <div
      className={`task-row ${task.completed ? 'is-completed' : ''} ${justCompleted && task.completed ? 'is-just-completed' : ''} ${isEditing ? 'is-editing' : ''} ${isSelected ? 'is-selected' : ''}`}
      data-id={task.id}
      role="listitem"
      tabIndex={0}
      aria-label={`${task.text}${hasTime ? `, ${timeDisplay}` : ''}${task.completed ? ', completed' : ''}`}
      aria-current={isSelected ? 'true' : undefined}
      draggable={!isEditing}
      title="Click to edit · Double-click to rename · Drag to move"
      onClick={(e) => {
        if ((e.target as Element).closest('button, input') || isEditing) return;
        openTask(task.id);
      }}
      onDoubleClick={(e) => {
        if ((e.target as Element).closest('button, input') || isEditing) return;
        startEditing();
      }}
      onKeyDown={handleRowKeyDown}
    >
      <span className="task-drag-handle" aria-hidden="true">⋮⋮</span>
      <div className="task-checkbox-wrap">
        <input
          type="checkbox"
          className="task-checkbox"
          checked={task.completed}
          aria-label={task.completed ? 'Mark as not done' : 'Mark as done'}
          data-sfx="none"
          tabIndex={-1}
          onChange={(e) => toggleCompleted(e.target.checked)}
        />
      </div>

      <div className="task-time-wrap">
        <button
          type="button"
          className="time-nudge-btn nudge-prev"
          title="Move back 30m (1 click)"
          aria-label="Move back 30 minutes"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            nudgeTaskTime(task, -30);
          }}
        >
          ‹
        </button>
        <button
          type="button"
          className={`task-time-pill ${hasTime ? 'is-set' : 'is-empty'}`}
          title="1-click slot picker"
          data-sfx="none"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            openTimePopover(e.currentTarget, task.startTime, task.endTime, { type: 'task', taskId: task.id });
          }}
        >
          <ClockIcon size={10} />
          <span>{timeDisplay}</span>
        </button>
        <button
          type="button"
          className="time-nudge-btn nudge-next"
          title="Move forward 30m (1 click)"
          aria-label="Move forward 30 minutes"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            nudgeTaskTime(task, 30);
          }}
        >
          ›
        </button>
      </div>

      <div className="task-main">
        <span
          className="task-text"
          spellCheck={false}
          ref={textRef}
          onBlur={handleBlur}
          onKeyDown={(e) => {
            e.stopPropagation();
            handleKeyDown(e);
          }}
        />
        {repeatLabel && (
          <span
            className={`task-repeat-badge ${task.repeat ? 'is-series' : ''}`}
            title={repeatLabel}
            aria-label={repeatLabel}
          >
            <Repeat2 size={11} strokeWidth={2.2} aria-hidden="true" />
            {task.repeat && <span>{repeatShortLabel(task.repeat)}</span>}
          </span>
        )}
      </div>

      <div className="task-meta">
        <div className="picker-chip-wrap">
          <button type="button" className="task-date-chip" title="Change task date" tabIndex={-1}>{formatShortDate(task.date)}</button>
          <DatePicker
            className="task-row-date-picker"
            value={task.date}
            ariaLabel="Change task date"
            tabIndex={-1}
            onChange={(date) => moveTask(task.id, { date })}
          />
        </div>
        <button
          type="button"
          className="task-action-btn edit-btn"
          title="Edit task"
          aria-label="Edit task"
          data-sfx="open"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            openTask(task.id);
          }}
        >
          <Pencil size={14} strokeWidth={2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="task-action-btn delete-btn"
          title={task.repeat ? 'Delete series' : task.isOccurrence ? 'Delete this day' : 'Delete task'}
          aria-label={task.repeat ? 'Delete series' : task.isOccurrence ? 'Delete this day' : 'Delete task'}
          data-sfx="none"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            removeTask(task);
          }}
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden="true" />
        </button>
      </div>
    </div>
  );
});
