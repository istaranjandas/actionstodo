// Time Popover Modal Handling (1-Click Presets, Duration Pills, Micro-Nudges)
import { createContext, forwardRef, useCallback, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { addMinutesToTime, getDurationMinutes, getNextSmartSlot } from '../modules/timeUtils';
import { state } from '../modules/store';
import type { TimePopoverContext as PopoverTarget } from '../types';

export type OpenTimePopover = (triggerEl: HTMLElement, startVal: string, endVal: string, context: PopoverTarget) => void;

export const TimePopoverContext = createContext<OpenTimePopover>(() => {});

export function useOpenTimePopover(): OpenTimePopover {
  return useContext(TimePopoverContext);
}

export interface TimePopoverHandle {
  open: OpenTimePopover;
}

interface TimePopoverProps {
  onTimeApplied: (start: string, end: string, context: PopoverTarget) => void;
}

const DURATION_PILLS = [
  { mins: 15, label: '15m' },
  { mins: 30, label: '30m' },
  { mins: 45, label: '45m' },
  { mins: 60, label: '1h' },
  { mins: 90, label: '1.5h' }
];

const GRID_GROUPS = [
  {
    label: 'Morning',
    slots: [['08:00', '8:00 AM'], ['08:30', '8:30 AM'], ['09:00', '9:00 AM'], ['09:30', '9:30 AM'], ['10:00', '10:00 AM'], ['10:30', '10:30 AM'], ['11:00', '11:00 AM'], ['11:30', '11:30 AM']]
  },
  {
    label: 'Afternoon',
    slots: [['12:00', '12:00 PM'], ['12:30', '12:30 PM'], ['13:00', '1:00 PM'], ['13:30', '1:30 PM'], ['14:00', '2:00 PM'], ['14:30', '2:30 PM'], ['15:00', '3:00 PM'], ['15:30', '3:30 PM'], ['16:00', '4:00 PM'], ['16:30', '4:30 PM'], ['17:00', '5:00 PM'], ['17:30', '5:30 PM']]
  },
  {
    label: 'Evening',
    slots: [['18:00', '6:00 PM'], ['18:30', '6:30 PM'], ['19:00', '7:00 PM'], ['20:00', '8:00 PM']]
  }
];

function formatDurationBadge(mins: number): string {
  return mins >= 60 && mins % 60 === 0
    ? `${mins / 60}h`
    : mins > 60
      ? `${Math.floor(mins / 60)}h ${mins % 60}m`
      : `${mins} mins`;
}

export const TimePopover = forwardRef<TimePopoverHandle, TimePopoverProps>(function TimePopover({ onTimeApplied }, ref) {
  const popoverRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [position, setPosition] = useState<CSSProperties>({});
  const [startValue, setStartValue] = useState('');
  const [endValue, setEndValue] = useState('');
  const activeContext = useRef<PopoverTarget | null>(null);

  const closeTimePopover = useCallback(() => {
    setIsOpen(false);
    setPosition({});
    activeContext.current = null;
  }, []);

  useImperativeHandle(ref, () => ({
    open(triggerEl, startVal, endVal, context) {
      activeContext.current = context;

      if (!startVal) {
        const autoSlot = getNextSmartSlot(state.selectedAddDate, state.tasks);
        startVal = autoSlot.startTime;
        endVal = autoSlot.endTime;
      }

      if (!endVal) {
        endVal = addMinutesToTime(startVal, 30);
      }

      setStartValue(startVal);
      setEndValue(endVal);

      if (window.innerWidth <= 680) {
        setPosition({});
      } else {
        const rect = triggerEl.getBoundingClientRect();
        let top = rect.bottom + 6;
        let left = rect.left;

        if (left + 330 > window.innerWidth) {
          left = window.innerWidth - 336;
        }
        if (top + 340 > window.innerHeight) {
          top = Math.max(10, rect.top - 336);
        }

        setPosition({ top: `${top}px`, left: `${Math.max(12, left)}px` });
      }

      setIsOpen(true);
    }
  }), []);

  const applyPopoverTime = (start: string, end: string) => {
    if (!activeContext.current) return;
    onTimeApplied(start, end, activeContext.current);
  };

  const durationMins = getDurationMinutes(startValue, endValue);

  const setRange = (start: string, end: string) => {
    setStartValue(start);
    setEndValue(end);
  };

  // 1-Click Fast Grid Selection
  const handleGridSlot = (newStart: string) => {
    const currentMins = getDurationMinutes(startValue, endValue) || 30;
    const newEnd = addMinutesToTime(newStart, currentMins);
    applyPopoverTime(newStart, newEnd);
    closeTimePopover();
  };

  // 1-Click Micro-Nudge in Popover
  const handleNudge = (minutes: number) => {
    const currentStart = startValue || '09:00';
    const duration = getDurationMinutes(currentStart, endValue);
    const newStart = addMinutesToTime(currentStart, minutes);
    const newEnd = addMinutesToTime(newStart, duration);
    setRange(newStart, newEnd);
    applyPopoverTime(newStart, newEnd);
  };

  // 1-Click Duration Selection
  const handleDuration = (mins: number) => {
    const currentStart = startValue || '09:00';
    const newEnd = addMinutesToTime(currentStart, mins);
    setEndValue(newEnd);
    applyPopoverTime(currentStart, newEnd);
  };

  // Manual inputs change
  const handleStartChange = (newStart: string) => {
    const activePill = DURATION_PILLS.find(pill => pill.mins === durationMins);
    const duration = activePill ? activePill.mins : 30;
    const newEnd = addMinutesToTime(newStart, duration);
    setRange(newStart, newEnd);
    applyPopoverTime(newStart, newEnd);
  };

  const handleEndChange = (newEnd: string) => {
    setEndValue(newEnd);
    applyPopoverTime(startValue, newEnd);
  };

  useEffect(() => {
    if (!isOpen) return;
    const handleDocumentClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        closeTimePopover();
      }
    };
    const handleKeydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') closeTimePopover();
    };
    document.addEventListener('click', handleDocumentClick);
    document.addEventListener('keydown', handleKeydown);
    return () => {
      document.removeEventListener('click', handleDocumentClick);
      document.removeEventListener('keydown', handleKeydown);
    };
  }, [isOpen, closeTimePopover]);

  return (
    <>
      <div
        className={`popover-backdrop ${isOpen ? 'open' : ''}`}
        id="popoverBackdrop"
        onClick={(e) => {
          e.stopPropagation();
          closeTimePopover();
        }}
      />

      <div className={`time-popover ${isOpen ? 'open' : ''}`} id="timePopover" ref={popoverRef} style={position} data-lenis-prevent>
        <div className="popover-header">
          <span className="popover-title">1-Click Slot Picker</span>
          <div className="popover-header-actions">
            <button type="button" className="popover-nudge-btn" title="Nudge back 30 mins" onClick={() => handleNudge(-30)}>-30m</button>
            <button type="button" className="popover-nudge-btn" title="Nudge forward 30 mins" onClick={() => handleNudge(30)}>+30m</button>
            <button
              type="button"
              className="popover-close-btn"
              title="Close"
              aria-label="Close slot picker"
              onClick={(e) => {
                e.stopPropagation();
                closeTimePopover();
              }}
            >
              &times;
            </button>
          </div>
        </div>

        <div className="popover-durations-row">
          <div className="duration-pills">
            {DURATION_PILLS.map(pill => (
              <button
                key={pill.mins}
                type="button"
                className={`duration-pill ${pill.mins === durationMins ? 'active' : ''}`}
                onClick={() => handleDuration(pill.mins)}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>

        <div className="popover-grid-section">
          {GRID_GROUPS.map(group => (
            <div className="grid-group" key={group.label}>
              <span className="grid-group-label">{group.label}</span>
              <div className="grid-slots">
                {group.slots.map(([time, label]) => (
                  <button
                    key={time}
                    type="button"
                    className={`grid-slot-btn ${time === startValue ? 'active' : ''}`}
                    onClick={() => handleGridSlot(time)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        <details className="popover-custom-details">
          <summary className="popover-custom-summary">Custom precise time...</summary>
          <div className="popover-inputs" style={{ marginTop: 8 }}>
            <div className="popover-field">
              <span className="popover-label">Start</span>
              <input
                type="time"
                className="popover-time-control"
                step={300}
                value={startValue}
                onChange={(e) => handleStartChange(e.target.value)}
              />
            </div>
            <span className="popover-arrow">→</span>
            <div className="popover-field">
              <span className="popover-label">End</span>
              <input
                type="time"
                className="popover-time-control"
                step={300}
                value={endValue}
                onChange={(e) => handleEndChange(e.target.value)}
              />
            </div>
          </div>
        </details>

        <div className="popover-footer">
          <button
            type="button"
            className="popover-clear-btn"
            onClick={() => {
              applyPopoverTime('', '');
              closeTimePopover();
            }}
          >
            Remove time
          </button>
          <span className="popover-badge">{formatDurationBadge(durationMins)}</span>
        </div>
      </div>
    </>
  );
});
