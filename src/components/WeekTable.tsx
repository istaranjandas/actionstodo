// Week Matrix Schedule Table View
// Full-screen hourly grid: days across the top, hours down the left.
// Supports add (click a cell), edit (double-click task text), complete (checkbox),
// delete (×), re-time (click time pill) and drag & drop between days/hours.
import { useLayoutEffect, useRef, useState } from 'react';
import type { DragEvent } from 'react';
import { formatWeekRangeLabel, getLocalISODate, getWeekDates } from '../modules/dateUtils';
import { addMinutesToTime, formatTimeRangeDisplay, getDurationMinutes, parseTimeFromText } from '../modules/timeUtils';
import { logTask, moveTask, removeTask, renameTask, setTaskCompleted } from '../modules/taskActions';
import { useInlineTextEdit } from '../hooks/useInlineTextEdit';
import { useOpenTimePopover } from './TimePopover';
import { ListLinesIcon } from './Icons';
import type { Task } from '../types';

const DEFAULT_FIRST_HOUR = 7;
const DEFAULT_LAST_HOUR = 21;

interface WeekTableProps {
  tasks: Task[];
  weekOffset: number;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onThisWeek: () => void;
  onExitTable: () => void;
}

function formatHourLabel(h: number) {
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12} ${period}`;
}

async function handleAddTask(text: string, dateStr: string, start: string, end: string) {
  const parsed = parseTimeFromText(text);
  if (parsed) {
    await logTask(parsed.cleanText, dateStr, parsed.startTime, parsed.endTime);
  } else {
    await logTask(text, dateStr, start, end);
  }
}

export function WeekTable({ tasks, weekOffset, onPrevWeek, onNextWeek, onThisWeek, onExitTable }: WeekTableProps) {
  const weekDates = getWeekDates(weekOffset);
  const today = getLocalISODate();
  const scrollRef = useRef<HTMLDivElement>(null);
  const theadRef = useRef<HTMLTableSectionElement>(null);
  const allDayRowRef = useRef<HTMLTableRowElement>(null);
  const [addingCell, setAddingCell] = useState<string | null>(null);

  const weekTasks = tasks
    .filter(t => weekDates.includes(t.date))
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '') || (a.createdAt - b.createdAt));

  // Hour range: a sensible working day, stretched to include any task outside it
  let firstHour = DEFAULT_FIRST_HOUR;
  let lastHour = DEFAULT_LAST_HOUR;
  weekTasks.forEach(t => {
    if (!t.startTime) return;
    const h = parseInt(t.startTime.split(':')[0], 10);
    firstHour = Math.min(firstHour, h);
    lastHour = Math.max(lastHour, h);
  });

  // Row keys: '' = All day (untimed), otherwise 'HH'
  const rows = [{ key: '', label: 'All day' }];
  for (let h = firstHour; h <= lastHour; h++) {
    rows.push({ key: String(h).padStart(2, '0'), label: formatHourLabel(h) });
  }

  // Lets the sticky "All day" row sit directly under the sticky day headers
  useLayoutEffect(() => {
    if (scrollRef.current && theadRef.current) {
      scrollRef.current.style.setProperty('--matrix-head-h', `${theadRef.current.offsetHeight}px`);
    }
  });

  // First render: start near the working day / current hour
  useLayoutEffect(() => {
    const scrollEl = scrollRef.current;
    const header = theadRef.current;
    const allDayRow = allDayRowRef.current;
    if (!scrollEl || !header || !allDayRow) return;
    const nowHour = new Date().getHours();
    const targetHour = weekDates.includes(today) ? Math.max(firstHour, nowHour - 1) : DEFAULT_FIRST_HOUR + 1;
    const targetRow = scrollEl.querySelector(`.matrix-cell[data-hour="${String(targetHour).padStart(2, '0')}"]`);
    if (targetRow && targetRow.parentElement) {
      const offset = targetRow.parentElement.offsetTop - header.offsetHeight - allDayRow.offsetHeight;
      scrollEl.scrollTop = Math.max(0, offset);
    }
  }, []);

  const findTask = (id: string) => tasks.find(t => t.id === id);

  const handleCellDrop = (e: DragEvent<HTMLTableCellElement>, date: string, hour: string) => {
    e.preventDefault();
    e.currentTarget.classList.remove('is-drop-target');
    const task = findTask(e.dataTransfer.getData('text/task-id'));
    if (!task) return;

    let start = '';
    let end = '';
    if (hour) {
      const minutes = task.startTime ? task.startTime.slice(3, 5) : '00';
      const duration = task.startTime ? getDurationMinutes(task.startTime, task.endTime || addMinutesToTime(task.startTime, 30)) : 30;
      start = `${hour}:${minutes}`;
      end = addMinutesToTime(start, duration);
    }

    if (task.date === date && (task.startTime || '') === start) return;
    moveTask(task.id, { date, startTime: start, endTime: end });
  };

  const clearDropTargets = () => {
    scrollRef.current?.querySelectorAll('.is-drop-target').forEach(c => c.classList.remove('is-drop-target'));
  };

  return (
    <div className="week-table-container">
      <div className="week-table-header">
        <div className="week-table-title-group">
          <div className="week-date-nav">
            <button type="button" className="week-nav-btn" title="Previous Week" aria-label="Previous week" onClick={onPrevWeek}>‹</button>
            <span className="week-range-label">{formatWeekRangeLabel(weekDates)}</span>
            <button type="button" className="week-nav-btn" title="Next Week" aria-label="Next week" onClick={onNextWeek}>›</button>
            <button type="button" className="week-today-btn" onClick={onThisWeek}>This Week</button>
          </div>
          <span className="week-table-hint">Click a cell to add · Double-click a task to edit · Drag to move</span>
        </div>
        <button type="button" className="toolbar-btn" title="Back to list view" data-sfx="select" onClick={onExitTable}>
          <ListLinesIcon />
          <span>List View</span>
        </button>
      </div>

      <div className="week-table-scroll" ref={scrollRef} data-lenis-prevent>
        <table className="matrix-table">
          <thead ref={theadRef}>
            <tr>
              <th className="matrix-time-header">Time</th>
              {weekDates.map(dateStr => {
                const parts = dateStr.split('-').map(Number);
                const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
                const isToday = dateStr === today;
                return (
                  <th className={`matrix-date-header ${isToday ? 'is-today' : ''}`} key={dateStr}>
                    <span className="matrix-day-name">{dateObj.toLocaleDateString(undefined, { weekday: 'short' })}</span>
                    <span className="matrix-day-date">{dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    {isToday && <span className="today-tag">TODAY</span>}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr className={row.key ? '' : 'matrix-allday-row'} key={row.key || 'all-day'} ref={row.key ? undefined : allDayRowRef}>
                <th scope="row" className="matrix-time-col">{row.label}</th>
                {weekDates.map(dateStr => {
                  const cellKey = `${dateStr}|${row.key}`;
                  const cellTasks = weekTasks.filter(t => {
                    if (t.date !== dateStr) return false;
                    if (!row.key) return !t.startTime;
                    return Boolean(t.startTime) && t.startTime.slice(0, 2) === row.key;
                  });
                  return (
                    <td
                      key={cellKey}
                      className={`matrix-cell ${dateStr === today ? 'is-today-col' : ''}`}
                      data-date={dateStr}
                      data-hour={row.key}
                      onClick={(e) => {
                        if ((e.target as Element).closest('.matrix-task-item, .matrix-add-input')) return;
                        setAddingCell(cellKey);
                      }}
                      onDragOver={(e) => {
                        if (!e.dataTransfer.types.includes('text/task-id')) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        e.currentTarget.classList.add('is-drop-target');
                      }}
                      onDragLeave={(e) => {
                        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) e.currentTarget.classList.remove('is-drop-target');
                      }}
                      onDrop={(e) => handleCellDrop(e, dateStr, row.key)}
                    >
                      <div className="matrix-tasks-wrap">
                        {cellTasks.map(task => (
                          <MatrixTaskChip key={task.id} task={task} onDragFinished={clearDropTargets} />
                        ))}
                        {addingCell === cellKey && (
                          <InlineAddInput
                            onFinish={(text) => {
                              setAddingCell(null);
                              if (!text) return;
                              const start = row.key ? `${row.key}:00` : '';
                              const end = row.key ? addMinutesToTime(start, 30) : '';
                              handleAddTask(text, dateStr, start, end);
                            }}
                          />
                        )}
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function InlineAddInput({ onFinish }: { onFinish: (text: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const done = useRef(false);

  useLayoutEffect(() => {
    inputRef.current?.focus();
  }, []);

  const finish = (save: boolean) => {
    if (done.current) return;
    done.current = true;
    const text = inputRef.current ? inputRef.current.value.trim() : '';
    onFinish(save ? text : '');
  };

  return (
    <input
      ref={inputRef}
      type="text"
      className="matrix-add-input"
      placeholder="New task…"
      autoComplete="off"
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          finish(true);
        } else if (e.key === 'Escape') {
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
    />
  );
}

function MatrixTaskChip({ task, onDragFinished }: { task: Task; onDragFinished: () => void }) {
  const openTimePopover = useOpenTimePopover();
  const [justCompleted, setJustCompleted] = useState(false);
  const timeLabel = task.startTime ? formatTimeRangeDisplay(task.startTime, task.endTime) : '';

  // Inline text editing
  const { textRef, isEditing, startEditing, handleBlur, handleKeyDown } = useInlineTextEdit({
    text: task.text,
    onCommit: (newText) => {
      if (newText !== task.text) renameTask(task, newText);
    }
  });

  return (
    <div
      className={`matrix-task-item ${task.completed ? 'is-completed' : ''} ${justCompleted && task.completed ? 'is-just-completed' : ''} ${isEditing ? 'is-editing' : ''}`}
      data-id={task.id}
      draggable={!isEditing}
      onDragStart={(e) => {
        e.dataTransfer.setData('text/task-id', task.id);
        e.dataTransfer.effectAllowed = 'move';
        const chip = e.currentTarget;
        requestAnimationFrame(() => chip.classList.add('is-dragging'));
      }}
      onDragEnd={(e) => {
        e.currentTarget.classList.remove('is-dragging');
        onDragFinished();
      }}
    >
      <input
        type="checkbox"
        className="matrix-task-check"
        checked={task.completed}
        aria-label="Toggle completed"
        data-sfx="none"
        onChange={(e) => {
          const isDone = e.target.checked;
          setJustCompleted(isDone);
          setTaskCompleted(task, isDone);
        }}
      />
      <div className="matrix-task-body">
        <span
          className="matrix-task-text"
          spellCheck={false}
          title="Double-click to edit"
          ref={textRef}
          onDoubleClick={(e) => {
            e.stopPropagation();
            startEditing();
          }}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        {timeLabel && (
          <button
            type="button"
            className="matrix-task-time"
            title="Change time"
            data-sfx="none"
            onClick={(e) => {
              e.stopPropagation();
              openTimePopover(e.currentTarget, task.startTime, task.endTime, { type: 'task', taskId: task.id });
            }}
          >
            {timeLabel}
          </button>
        )}
      </div>
      <button
        type="button"
        className="matrix-task-del"
        title="Delete task"
        aria-label="Delete task"
        data-sfx="none"
        onClick={(e) => {
          e.stopPropagation();
          removeTask(task);
        }}
      >
        &times;
      </button>
    </div>
  );
}
