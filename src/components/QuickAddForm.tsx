import { useEffect, useState } from 'react';
import type { RefObject } from 'react';
import { formatShortDate, getLocalISODate } from '../modules/dateUtils';
import { formatTimeRangeDisplay, getNextSmartSlot, parseTimeFromText } from '../modules/timeUtils';
import { COMMAND_PREFILL_EVENT } from '../modules/commandBar';
import { setUiState } from '../modules/store';
import { logTask } from '../modules/taskActions';
import { useOpenTimePopover } from './TimePopover';
import { CalendarIcon, ClockIcon } from './Icons';
import type { AppState } from '../types';
import { DatePicker } from './DatePicker';

interface QuickAddFormProps {
  appState: AppState;
  isPhone: boolean;
  quickAddInputRef: RefObject<HTMLInputElement | null>;
}

export function QuickAddForm({ appState, isPhone, quickAddInputRef }: QuickAddFormProps) {
  const { selectedAddDate, selectedAddStart, selectedAddEnd, tasks } = appState;
  const openTimePopover = useOpenTimePopover();
  const [quickAddText, setQuickAddText] = useState('');
  const [commitCount, setCommitCount] = useState(0);
  // The date only earns a chip once it is not today; a starter chip elsewhere can prefill the field
  const isTodayTarget = selectedAddDate === getLocalISODate();

  useEffect(() => {
    const handlePrefill = (event: Event) => setQuickAddText((event as CustomEvent<string>).detail);
    window.addEventListener(COMMAND_PREFILL_EVENT, handlePrefill);
    return () => window.removeEventListener(COMMAND_PREFILL_EVENT, handlePrefill);
  }, []);

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

    setCommitCount(count => count + 1);
    setQuickAddText('');
    setUiState({ selectedAddStart: '', selectedAddEnd: '' });
    await logTask(text, selectedAddDate, start, end);
  };

  return (
    // The command bar: a HUD prompt. T (or Enter from anywhere quiet) focuses it; Enter logs the objective.
    // Alternating pulse names restart the "objective logged" flash on every submit
    <form
      className={`quick-add-box command-bar ${quickAddText ? 'has-text' : ''}`}
      data-commit-pulse={commitCount ? (commitCount % 2) + 1 : undefined}
      onSubmit={handleQuickAddSubmit}
    >
      <div className="quick-add-input-row">
        <div className="quick-add-icon command-prompt" aria-hidden="true">
          <span className="command-caret">&gt;</span>
        </div>
        <input
          type="text"
          ref={quickAddInputRef}
          className="quick-add-input"
          placeholder={isPhone ? 'Log objective…' : 'Log objective… e.g. “Call Alex at 3pm”'}
          aria-label="Log a new task"
          aria-keyshortcuts="T"
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
            <button
              type="button"
              className={`chip-btn date-chip ${isTodayTarget ? 'is-icon' : ''}`}
              title={isTodayTarget ? 'Log to another day' : 'Select task date'}
              aria-label={isTodayTarget ? 'Select task date' : undefined}
              tabIndex={-1}
            >
              <CalendarIcon size={12} />
              {!isTodayTarget && <span>{formatShortDate(selectedAddDate)}</span>}
            </button>
            <DatePicker
              ariaLabel="Select date"
              value={selectedAddDate}
              onChange={(date) => setUiState({ selectedAddDate: date })}
            />
          </div>

          <div className="picker-chip-wrap">
            <button
              type="button"
              className={`chip-btn ${timeIsActive ? 'is-active' : ''}`}
              title="Select planned completion time range (30m default)"
              data-sfx="none"
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

        <button type="submit" className="quick-add-save-btn command-submit" title="Log objective (Enter) · press T to focus" aria-label="Add task" data-sfx="none">
          <span className="command-label">Log</span>
          <span className="command-key" aria-hidden="true">↵</span>
        </button>
      </div>
    </form>
  );
}
