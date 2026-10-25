import { Fragment, memo, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';
import { ChevronRight, Plus } from 'lucide-react';
import { formatFriendlyDate, formatShortDate, getLocalISODate } from '../modules/dateUtils';
import { addMinutesToTime, formatTimeRangeDisplay, parseTimeFromText } from '../modules/timeUtils';
import { sortTaskList, tallyTasks, updateTaskItem } from '../modules/store';
import { getDropSlots, taskDuration } from '../modules/listDrag';
import { logTask, moveTask, removeTask, renameTask, setTaskCompleted } from '../modules/taskActions';
import { useInlineTextEdit } from '../hooks/useInlineTextEdit';
import { useMinuteClock } from '../hooks/useMinuteClock';
import { prefillCommand } from '../modules/commandBar';
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
  // The DONE toggle in the slate header: off means finished rows stay hidden
  hideCompleted: boolean;
}

const EMPTY_MESSAGES: Record<string, string> = {
  upcoming: 'Nothing scheduled ahead. Add a task and pick a future date.',
  'this-week': 'Nothing planned for this week yet.',
  completed: 'No completed tasks yet. Finish one and it lands here.',
  all: 'No tasks yet. Log one below, or press N.'
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

export function TaskFeed({ appState, viewTasks, layout, hideCompleted }: TaskFeedProps) {
  const groups = useMemo(
    () => getSortedDateGroups(appState, viewTasks),
    [viewTasks, appState.currentView, appState.specificDateFilter]
  );
  const isTodayBoard = appState.currentView === 'today' && !appState.specificDateFilter;
  const isGrid = layout === 'grid';
  // Day cards take new tasks inline, except in Done (finished work only)
  const canAddInCard = isGrid && appState.currentView !== 'completed';

  // Hiding done work drops it from the rows (and drops a day that has nothing left open)
  const visibleGroups = useMemo(
    () =>
      hideCompleted
        ? groups
            .map(group => ({ ...group, tasks: group.tasks.filter(task => !task.completed) }))
            .filter(group => group.tasks.length > 0)
        : groups,
    [groups, hideCompleted]
  );
  const somethingHidden = hideCompleted && groups.some(group => group.tasks.some(task => task.completed));

  if (isTodayBoard) {
    const todayTasks = visibleGroups[0]?.tasks ?? [];
    return <TodayBoard tasks={todayTasks} allDone={todayTasks.length === 0 && somethingHidden} />;
  }

  if (visibleGroups.length === 0) {
    return (
      <div className="empty-state">
        {somethingHidden ? 'Everything here is done. Click DONE to show it.' : EMPTY_MESSAGES[appState.currentView] ?? 'No tasks found for this view.'}
      </div>
    );
  }

  return (
    <>
      {visibleGroups.map(({ dateKey, tasks }, index) => (
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
  const progressPercent = total ? Math.round((completedCount / total) * 100) : 0;
  const today = getLocalISODate();
  const dayTone = dateKey === today ? 'is-today' : dateKey < today ? 'is-past' : '';
  const isDated = dateKey !== 'Undated';

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
        {groupTasks.map(task => (
          <TaskRow key={task.id} task={task} />
        ))}
        {groupTasks.length === 0 && <div className="date-group-empty">{canAdd ? 'Nothing planned yet.' : 'Nothing planned yet — log one above.'}</div>}
      </div>
      <DropSlots dateKey={dateKey} tasks={groupTasks} />
      {canAdd && isDated && <DayCardAdd date={dateKey} dayLabel={title} />}
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
    const parsed = parseTimeFromText(raw);
    setText('');
    void logTask(parsed ? parsed.cleanText : raw, date, parsed?.startTime ?? '', parsed?.endTime ?? '');
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
        placeholder="New task… try “at 3pm”"
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

function formatGap(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function formatClock(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  return `${hours % 12 || 12}:${String(minutes % 60).padStart(2, '0')} ${hours >= 12 ? 'PM' : 'AM'}`;
}

// Chips offered when the day is empty: one click drops the phrase into the command bar
const STARTERS = ['Deep work block at 9am', 'Call Alex at 3pm', 'Evening review at 7pm'];

function ClearHorizon() {
  return (
    <div className="clear-horizon">
      <span className="clear-horizon-kicker">Clear horizon</span>
      <p className="clear-horizon-text">Nothing logged for today. Start with one of these, or type your own above.</p>
      <div className="clear-horizon-chips">
        {STARTERS.map((text) => (
          <button key={text} type="button" className="clear-horizon-chip" data-sfx="select" onClick={() => prefillCommand(text)}>
            <Plus size={12} strokeWidth={2.4} aria-hidden="true" />
            <span>{text}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function TodayBoard({ tasks, allDone }: { tasks: Task[]; allDone: boolean }) {
  const today = getLocalISODate();
  const nowMinutes = useMinuteClock();
  const { openTask } = useTaskSelection();
  const timed = tasks.filter(t => t.startTime);
  const anytime = tasks.filter(t => !t.startTime);
  // Only a task still ahead (or running) earns the banner; an empty day says nothing at all
  const nextUp = timed.find(t => !t.completed && toMinutes(t.startTime) + taskDuration(t) > nowMinutes);
  const markerIndex = timed.findIndex(t => toMinutes(t.startTime) > nowMinutes);

  let nextUpTiming = '';
  if (nextUp) {
    const start = toMinutes(nextUp.startTime);
    nextUpTiming = start > nowMinutes
      ? `Starts in ${formatGap(start - nowMinutes)}`
      : `In progress · ends in ${formatGap(start + taskDuration(nextUp) - nowMinutes)}`;
  }

  return (
    <section className="date-group today-board is-today" data-date={today} data-drop-date={today}>
      {nextUp && (
        <button type="button" className="next-up" data-sfx="open" onClick={() => openTask(nextUp.id)}>
          <span className="next-up-label">Next up</span>
          <span className="next-up-text">{nextUp.text}</span>
          <span className="next-up-meta">
            <span className="next-up-time">{formatTimeRangeDisplay(nextUp.startTime, nextUp.endTime)}</span>
            <span className="next-up-eta">{nextUpTiming}</span>
          </span>
          <ChevronRight className="next-up-chevron" size={18} aria-hidden="true" />
        </button>
      )}

      {tasks.length === 0 ? (
        allDone ? (
          <div className="clear-horizon is-quiet">
            <span className="clear-horizon-kicker">All clear</span>
            <p className="clear-horizon-text">Everything logged today is done. Click DONE above to show it.</p>
          </div>
        ) : (
          <ClearHorizon />
        )
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
  const timeDisplay = hasTime ? formatTimeRangeDisplay(task.startTime, task.endTime) : '+ 30m';
  const isSelected = selectedTaskId === task.id;

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
      title="Click for details · Double-click to rename · Drag to move"
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
          className="task-action-btn delete-btn"
          title="Delete task"
          aria-label="Delete task"
          data-sfx="none"
          tabIndex={-1}
          onClick={(e) => {
            e.stopPropagation();
            removeTask(task);
          }}
        >
          &times;
        </button>
      </div>

      <button
        type="button"
        className="task-open-btn"
        aria-label="Open task details"
        title="Details (Enter)"
        data-sfx="open"
        tabIndex={-1}
        onClick={(e) => {
          e.stopPropagation();
          openTask(task.id);
        }}
      >
        <ChevronRight size={16} strokeWidth={2.2} aria-hidden="true" />
      </button>
    </div>
  );
});
