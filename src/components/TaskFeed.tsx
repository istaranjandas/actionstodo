import { memo, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';
import { formatFriendlyDate, formatShortDate, getLocalISODate } from '../modules/dateUtils';
import { addMinutesToTime, formatTimeRangeDisplay, parseTimeFromText } from '../modules/timeUtils';
import { deleteTaskItem, getFilteredTasks, sortTaskList, state, updateTaskItem } from '../modules/store';
import { getDropSlots, setupListDragAndDrop } from '../modules/listDrag';
import { useInlineTextEdit } from '../hooks/useInlineTextEdit';
import { useTiltCard } from '../hooks/useInteractionPolish';
import { useMasonrySpan } from '../hooks/useMasonrySpan';
import { useOpenTimePopover } from './TimePopover';
import { ClockIcon } from './Icons';
import type { AppState, Task } from '../types';

interface TaskFeedProps {
  appState: AppState;
  container: HTMLElement | null;
  onInlineAdd: (dateKey: string) => void;
}

export function getSortedDateGroups(appState: AppState): { dateKey: string; tasks: Task[] }[] {
  const today = getLocalISODate();
  const filtered = getFilteredTasks();

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

export function TaskFeed({ appState, container, onInlineAdd }: TaskFeedProps) {
  const groups = getSortedDateGroups(appState);

  useEffect(() => {
    if (!container) return;
    return setupListDragAndDrop({
      container,
      getTask: (id) => state.tasks.find(t => t.id === id),
      onMove: (taskId, updates) => {
        updateTaskItem(taskId, updates);
      }
    });
  }, [container]);

  if (groups.length === 0) {
    return (
      <div className="empty-state">
        No tasks found for this view. Press Enter in the input above to create one.
      </div>
    );
  }

  return (
    <>
      {groups.map(({ dateKey, tasks }, index) => (
        <DateGroup key={dateKey} dateKey={dateKey} groupTasks={tasks} onInlineAdd={onInlineAdd} staggerIndex={index} />
      ))}
    </>
  );
}

interface DateGroupProps {
  dateKey: string;
  groupTasks: Task[];
  onInlineAdd: (dateKey: string) => void;
  staggerIndex: number;
}

const DateGroup = memo(function DateGroup({ dateKey, groupTasks, onInlineAdd, staggerIndex }: DateGroupProps) {
  const groupRef = useRef<HTMLElement>(null);
  useTiltCard(groupRef);
  useMasonrySpan(groupRef);
  const { title, sub } = formatFriendlyDate(dateKey);
  const completedCount = groupTasks.filter(t => t.completed).length;
  const dropSlots = useMemo(() => (dateKey !== 'Undated' ? getDropSlots(groupTasks) : []), [dateKey, groupTasks]);

  return (
    <section className="date-group" data-date={dateKey} ref={groupRef} style={{ '--stagger-index': Math.min(staggerIndex, 8) } as CSSProperties}>
      <span className="card-glare" aria-hidden="true" />
      <div className="date-group-header">
        <div className="date-group-title-wrap">
          <span className="date-group-name">{title}</span>
          <span className="date-group-subname">{sub}</span>
        </div>
        <span className="date-group-count">{completedCount}/{groupTasks.length}</span>
      </div>
      <div className="task-list" id={`group-list-${dateKey}`}>
        {groupTasks.map(task => (
          <TaskRow key={task.id} task={task} />
        ))}
        {groupTasks.length === 0 && <div className="date-group-empty">Nothing planned yet. Add a task to get started.</div>}
      </div>
      {dateKey !== 'Undated' && (
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
      )}
      <div className="inline-add-row" data-date={dateKey} onClick={() => onInlineAdd(dateKey)}>
        <span className="inline-add-icon">+</span>
        <span>New task</span>
      </div>
    </section>
  );
});

function nudgeTaskTime(task: Task, minutes: number) {
  const baseStart = task.startTime || '09:00';
  const duration = (task.startTime && task.endTime) ? (parseInt(task.endTime.split(':')[0]) * 60 + parseInt(task.endTime.split(':')[1]) - (parseInt(baseStart.split(':')[0]) * 60 + parseInt(baseStart.split(':')[1]))) : 30;
  const newStart = addMinutesToTime(baseStart, minutes);
  const newEnd = addMinutesToTime(newStart, duration > 0 ? duration : 30);
  updateTaskItem(task.id, { startTime: newStart, endTime: newEnd });
}

const TaskRow = memo(function TaskRow({ task }: { task: Task }) {
  const openTimePopover = useOpenTimePopover();
  const hasTime = Boolean(task.startTime);
  const timeDisplay = hasTime ? formatTimeRangeDisplay(task.startTime, task.endTime) : '+ 30m';

  // Inline edit text: double-click to edit (single click + drag moves the task)
  const { textRef, isEditing, startEditing, handleBlur, handleKeyDown } = useInlineTextEdit({
    text: task.text,
    onCommit: (newText) => {
      if (newText && newText !== task.text) {
        const parsed = parseTimeFromText(newText);
        if (parsed) {
          updateTaskItem(task.id, { text: parsed.cleanText, startTime: parsed.startTime, endTime: parsed.endTime });
        } else {
          updateTaskItem(task.id, { text: newText });
        }
      } else if (!newText) {
        deleteTaskItem(task.id);
      }
    }
  });

  return (
    <div
      className={`task-row ${task.completed ? 'is-completed' : ''} ${isEditing ? 'is-editing' : ''}`}
      data-id={task.id}
      draggable={!isEditing}
      title="Drag to move · Double-click to edit"
      onDoubleClick={(e) => {
        if ((e.target as Element).closest('button, input') || isEditing) return;
        startEditing();
      }}
    >
      <span className="task-drag-handle" aria-hidden="true">⋮⋮</span>
      <div className="task-checkbox-wrap">
        <input
          type="checkbox"
          className="task-checkbox"
          checked={task.completed}
          aria-label="Toggle completed"
          onChange={(e) => updateTaskItem(task.id, { completed: e.target.checked })}
        />
      </div>

      <div className="task-time-wrap">
        <button
          type="button"
          className="time-nudge-btn nudge-prev"
          title="Move back 30m (1 click)"
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
          onKeyDown={handleKeyDown}
        />
      </div>

      <div className="task-meta">
        <div className="picker-chip-wrap">
          <button type="button" className="task-date-chip" title="Change task date" tabIndex={-1}>{formatShortDate(task.date)}</button>
          <input
            type="date"
            className="chip-date-input task-row-date-picker"
            value={task.date}
            aria-label="Change task date"
            onChange={(e) => {
              if (e.target.value) updateTaskItem(task.id, { date: e.target.value });
            }}
          />
        </div>
        <button
          type="button"
          className="task-action-btn delete-btn"
          title="Delete task"
          onClick={(e) => {
            e.stopPropagation();
            deleteTaskItem(task.id);
          }}
        >
          &times;
        </button>
      </div>
    </div>
  );
});
