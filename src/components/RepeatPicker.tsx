// Repeat control for the details panel: a quiet field that unfolds into a schedule.
// The task it receives is always the series master, even when the inspector was opened from a
// generated day, so every change has one unambiguous anchor.
import { useEffect, useRef, useState } from 'react';
import { Check, Repeat2 } from 'lucide-react';
import { formatShortDate } from '../modules/dateUtils';
import { REPEAT_OPTIONS, repeatSummary } from '../modules/recurrence';
import { DatePicker } from './DatePicker';
import type { RepeatRule, Task } from '../types';

interface RepeatPickerProps {
  task: Task;
  onChange: (rule?: RepeatRule, until?: string) => void;
}

export function RepeatPicker({ task, onChange }: RepeatPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;

    const handlePointerDown = (event: PointerEvent) => {
      const target = event.target as Element;
      // The calendar renders in a portal outside this field; let it finish its pick.
      if (rootRef.current?.contains(target) || target.closest('.date-popover, .popover-backdrop')) return;
      setIsOpen(false);
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      setIsOpen(false);
    };

    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown, true);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown, true);
    };
  }, [isOpen]);

  return (
    <div className="repeat-field" ref={rootRef}>
      <button
        type="button"
        className={`inspector-value-btn repeat-trigger ${task.repeat ? 'is-set' : ''}`}
        aria-haspopup="true"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(open => !open)}
      >
        <Repeat2 size={13} strokeWidth={2.2} aria-hidden="true" />
        <span>{repeatSummary(task)}</span>
      </button>

      {isOpen && (
        <div className="repeat-picker" role="group" aria-label="Repeat schedule">
          <div className="repeat-options">
            {REPEAT_OPTIONS.map(option => {
              const isActive = task.repeat === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`repeat-option ${isActive ? 'is-active' : ''}`}
                  aria-pressed={isActive}
                  onClick={() => onChange(option.value, task.repeatUntil ?? '')}
                >
                  <span className="repeat-option-copy">
                    <span className="repeat-option-label">{option.label}</span>
                    <span className="repeat-option-hint">{option.hint}</span>
                  </span>
                  {isActive && <Check size={14} strokeWidth={2.6} aria-hidden="true" />}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className={`repeat-never ${task.repeat ? '' : 'is-active'}`}
            aria-pressed={!task.repeat}
            onClick={() => {
              onChange(undefined);
              setIsOpen(false);
            }}
          >
            Doesn&rsquo;t repeat
          </button>

          {task.repeat && (
            <div className="repeat-until">
              <span className="repeat-until-label">Ends</span>
              <div className="picker-chip-wrap repeat-until-picker">
                <button type="button" className="repeat-until-btn" tabIndex={-1}>
                  {task.repeatUntil ? formatShortDate(task.repeatUntil) : 'Never'}
                </button>
                <DatePicker
                  value={task.repeatUntil || task.date}
                  ariaLabel="Series end date"
                  className="repeat-until-date"
                  onChange={date => onChange(task.repeat, date)}
                />
              </div>
              {task.repeatUntil && (
                <button type="button" className="repeat-until-clear" title="Remove end date" onClick={() => onChange(task.repeat)}>
                  Clear
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
