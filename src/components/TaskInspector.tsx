// Task details: an in-world editing screen for one task (side console on desktop, bottom sheet on phones)
import { useEffect, useRef, useState } from 'react';
import { CalendarDays, Check, Clock3, RotateCcw, Trash2, X } from 'lucide-react';
import { formatShortDate } from '../modules/dateUtils';
import { formatTimeRangeDisplay, getDurationMinutes } from '../modules/timeUtils';
import { updateTaskItem } from '../modules/store';
import { moveTask, removeTask, renameTask, setTaskCompleted } from '../modules/taskActions';
import { useOpenTimePopover } from './TimePopover';
import type { Task } from '../types';
import { DatePicker } from './DatePicker';

const DELETE_CONFIRM_MS = 3000;

interface TaskInspectorProps {
  task: Task;
  isClosing: boolean;
  onClose: () => void;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
}

export function TaskInspector({ task, isClosing, onClose }: TaskInspectorProps) {
  const openTimePopover = useOpenTimePopover();
  const [draft, setDraft] = useState(task.text);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const confirmTimer = useRef<number | undefined>(undefined);

  // Follow edits made elsewhere (inline rename, cloud sync) unless the user is typing here
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setDraft(task.text);
  }, [task.text]);

  useEffect(() => () => window.clearTimeout(confirmTimer.current), []);

  const commitTitle = () => {
    const nextText = draft.trim();
    if (!nextText) {
      setDraft(task.text);
      return;
    }
    renameTask(task, nextText);
  };

  const requestDelete = () => {
    if (isConfirmingDelete) {
      removeTask(task);
      onClose();
      return;
    }
    setIsConfirmingDelete(true);
    window.clearTimeout(confirmTimer.current);
    confirmTimer.current = window.setTimeout(() => setIsConfirmingDelete(false), DELETE_CONFIRM_MS);
  };

  const hasTime = Boolean(task.startTime);
  const createdLabel = new Date(task.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

  return (
    <section className={`inspector ${isClosing ? 'is-closing' : ''} ${task.completed ? 'is-done' : ''}`} aria-label="Task details">
      <div className="inspector-header">
        <span className="inspector-kicker">Task details</span>
        <button type="button" className="inspector-close" aria-label="Close details (Esc)" data-sfx="close" onClick={onClose}>
          <X size={15} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      <label className="inspector-field-label" htmlFor={`inspector-title-${task.id}`}>Title</label>
      <textarea
        id={`inspector-title-${task.id}`}
        ref={titleRef}
        className="inspector-title"
        rows={2}
        value={draft}
        spellCheck={false}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commitTitle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === 'Escape') {
            e.stopPropagation();
            setDraft(task.text);
            requestAnimationFrame(() => titleRef.current?.blur());
          }
        }}
      />

      <button
        type="button"
        className={`inspector-status ${task.completed ? 'is-done' : ''}`}
        data-sfx="none"
        onClick={() => setTaskCompleted(task, !task.completed)}
      >
        {task.completed ? <RotateCcw size={16} strokeWidth={2.2} aria-hidden="true" /> : <Check size={16} strokeWidth={2.6} aria-hidden="true" />}
        <span>{task.completed ? 'Completed · Reopen' : 'Mark complete'}</span>
        <kbd className="btn-kbd">Space</kbd>
      </button>

      <div className="inspector-grid">
        <div className="inspector-field">
          <span className="inspector-field-label">
            <CalendarDays size={13} aria-hidden="true" /> Date
          </span>
          <div className="picker-chip-wrap inspector-date">
            <button type="button" className="inspector-value-btn" tabIndex={-1}>{formatShortDate(task.date)}</button>
            <DatePicker
              value={task.date}
              ariaLabel="Task date"
              onChange={(date) => moveTask(task.id, { date })}
            />
          </div>
        </div>

        <div className="inspector-field">
          <span className="inspector-field-label">
            <Clock3 size={13} aria-hidden="true" /> Time
          </span>
          <div className="inspector-time-row">
            <button
              type="button"
              className="inspector-value-btn"
              data-sfx="none"
              onClick={(e) => openTimePopover(e.currentTarget, task.startTime, task.endTime, { type: 'task', taskId: task.id })}
            >
              {hasTime ? formatTimeRangeDisplay(task.startTime, task.endTime) : 'Add a time'}
            </button>
            {hasTime && (
              <button type="button" className="clear-chip-btn" aria-label="Remove time" title="Remove time" onClick={() => updateTaskItem(task.id, { startTime: '', endTime: '' })}>
                &times;
              </button>
            )}
          </div>
        </div>
      </div>

      <dl className="inspector-meta">
        {hasTime && (
          <div>
            <dt>Duration</dt>
            <dd>{formatDuration(getDurationMinutes(task.startTime, task.endTime))}</dd>
          </div>
        )}
        <div>
          <dt>Logged</dt>
          <dd>{createdLabel}</dd>
        </div>
        <div>
          <dt>Saved</dt>
          <dd>{task.uid ? 'Cloud sync' : 'This device'}</dd>
        </div>
      </dl>

      <button type="button" className={`inspector-delete ${isConfirmingDelete ? 'is-confirming' : ''}`} data-sfx={isConfirmingDelete ? 'none' : 'click'} onClick={requestDelete}>
        <Trash2 size={15} strokeWidth={2} aria-hidden="true" />
        <span>{isConfirmingDelete ? 'Press again to delete' : 'Delete task'}</span>
      </button>
    </section>
  );
}
