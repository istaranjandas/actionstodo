import { useRef, useState } from 'react';
import type { RefObject } from 'react';
import { formatShortDate } from '../modules/dateUtils';
import { formatTimeRangeDisplay, getNextSmartSlot, parseTimeFromText } from '../modules/timeUtils';
import { addTask, setUiState } from '../modules/store';
import { useMagneticPull } from '../hooks/useInteractionPolish';
import { useOpenTimePopover } from './TimePopover';
import { CalendarIcon, ClockIcon, PlusIcon } from './Icons';
import type { AppState } from '../types';

interface QuickAddFormProps {
  appState: AppState;
  isPhone: boolean;
  quickAddInputRef: RefObject<HTMLInputElement | null>;
}

export function QuickAddForm({ appState, isPhone, quickAddInputRef }: QuickAddFormProps) {
  const { selectedAddDate, selectedAddStart, selectedAddEnd, tasks } = appState;
  const openTimePopover = useOpenTimePopover();
  const [quickAddText, setQuickAddText] = useState('');
  const saveBtnRef = useRef<HTMLButtonElement>(null);
  useMagneticPull(saveBtnRef, { strength: 0.35 });

  // --- Quick Add Time & Date Helpers ---
  const parsed = parseTimeFromText(quickAddText);
  let timeLabel: string;
  let timeIsActive = true;
  if (parsed) {
    timeLabel = `✨ ${formatTimeRangeDisplay(parsed.startTime, parsed.endTime)}`;
  } else if (selectedAddStart) {
    timeLabel = formatTimeRangeDisplay(selectedAddStart, selectedAddEnd);
  } else {
    const autoSlot = getNextSmartSlot(selectedAddDate, tasks);
    timeLabel = formatTimeRangeDisplay(autoSlot.startTime, autoSlot.endTime);
    timeIsActive = false;
  }

  // Quick Add Submit (Supports tap button, mobile keyboard Done/Go, and Enter key)
  const handleQuickAddSubmit = async (e?: { preventDefault(): void; stopPropagation(): void }) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    const rawVal = quickAddText.trim();
    if (!rawVal) return;

    const parsedInput = parseTimeFromText(rawVal);
    const text = parsedInput ? parsedInput.cleanText : rawVal;
    const start = parsedInput ? parsedInput.startTime : selectedAddStart;
    const end = parsedInput ? parsedInput.endTime : selectedAddEnd;

    setQuickAddText('');
    setUiState({ selectedAddStart: '', selectedAddEnd: '' });
    await addTask(text, selectedAddDate, start, end);
  };

  return (
    <form className="quick-add-box" onSubmit={handleQuickAddSubmit}>
      <div className="quick-add-input-row">
        <div className="quick-add-icon">
          <PlusIcon />
        </div>
        <input
          type="text"
          ref={quickAddInputRef}
          className="quick-add-input"
          placeholder={isPhone ? 'Add a task…' : 'Add a task…  try “Call Alex at 3pm”'}
          autoComplete="off"
          enterKeyHint="done"
          value={quickAddText}
          onChange={(e) => setQuickAddText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              handleQuickAddSubmit(e);
            }
          }}
        />

        <div className="quick-add-chips-row">
          <div className="picker-chip-wrap">
            <button type="button" className="chip-btn" title="Select task date" tabIndex={-1}>
              <CalendarIcon size={12} />
              <span>{formatShortDate(selectedAddDate)}</span>
            </button>
            <input
              type="date"
              className="chip-date-input"
              aria-label="Select date"
              value={selectedAddDate}
              onChange={(e) => {
                if (e.target.value) setUiState({ selectedAddDate: e.target.value });
              }}
            />
          </div>

          <div className="picker-chip-wrap">
            <button
              type="button"
              className={`chip-btn ${timeIsActive ? 'is-active' : ''}`}
              title="Select planned completion time range (30m default)"
              onClick={(e) => {
                e.stopPropagation();
                openTimePopover(e.currentTarget, selectedAddStart, selectedAddEnd, { type: 'quick' });
              }}
            >
              <ClockIcon size={11} />
              <span id="quickAddTimeLabel">{timeLabel}</span>
            </button>
            <button
              type="button"
              className="clear-chip-btn"
              style={{ display: timeIsActive ? 'inline-flex' : 'none' }}
              title="Remove time"
              onClick={(e) => {
                e.stopPropagation();
                setUiState({ selectedAddStart: '', selectedAddEnd: '' });
              }}
            >
              &times;
            </button>
          </div>
        </div>

        <button type="submit" className="quick-add-save-btn" title="Add task" ref={saveBtnRef}>
          <span>Add</span>
          <kbd className="btn-kbd">↵</kbd>
        </button>
      </div>
    </form>
  );
}
