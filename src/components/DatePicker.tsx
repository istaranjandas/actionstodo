// Themed calendar popover: a transparent trigger sits over its chip (like the old native date input)
// and opens a HUD month grid with quick picks and full keyboard control.
import { useEffect, useRef, useState } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addDays, getLocalISODate } from '../modules/dateUtils';
import { playUiSound } from '../audio/uiSounds';
import { useAnchoredPlacement } from '../hooks/useAnchoredPlacement';

interface DatePickerProps {
  value: string;
  onChange: (isoDate: string) => void;
  ariaLabel: string;
  className?: string;
  tabIndex?: number;
}

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function parseISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addMonths(iso: string, count: number): string {
  const d = parseISO(iso);
  const target = new Date(d.getFullYear(), d.getMonth() + count, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(d.getDate(), lastDay));
  return getLocalISODate(target);
}

// Monday-first, always six rows so the panel never changes height between months
function getMonthGrid(iso: string): string[] {
  const d = parseISO(iso);
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const lead = (first.getDay() + 6) % 7;
  const start = addDays(getLocalISODate(first), -lead);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

function getNextMonday(today: string): string {
  const day = parseISO(today).getDay();
  return addDays(today, ((8 - day) % 7) || 7);
}

function formatRelative(iso: string, today: string): string {
  const diff = Math.round((parseISO(iso).getTime() - parseISO(today).getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  return diff > 0 ? `In ${diff} days` : `${-diff} days ago`;
}

export function DatePicker({ value, onChange, ariaLabel, className = '', tabIndex }: DatePickerProps) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [cursor, setCursor] = useState(value || getLocalISODate());
  const [focusCursor, setFocusCursor] = useState(false);
  const placement = useAnchoredPlacement(isOpen ? triggerRef.current : null, panelRef);

  const today = getLocalISODate();
  const selected = value || '';
  const cursorDate = parseISO(cursor);
  const viewMonth = cursorDate.getMonth();
  const monthLabel = cursorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  const grid = getMonthGrid(cursor);

  const open = () => {
    setCursor(value || today);
    setFocusCursor(true);
    setIsOpen(true);
  };

  const close = (withSound: boolean) => {
    if (withSound) playUiSound('close');
    setIsOpen(false);
    triggerRef.current?.focus({ preventScroll: true });
  };

  const pick = (iso: string) => {
    onChange(iso);
    close(false);
  };

  // Keyboard focus follows the cursor day (on open and on arrow moves)
  useEffect(() => {
    if (!isOpen || !focusCursor) return;
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${cursor}"]`)?.focus({ preventScroll: true });
    setFocusCursor(false);
  }, [isOpen, focusCursor, cursor]);

  const moveCursor = (next: string) => {
    setCursor(next);
    setFocusCursor(true);
  };

  const handleGridKeyDown = (e: ReactKeyboardEvent) => {
    const day = (cursorDate.getDay() + 6) % 7;
    const moves: Record<string, () => string> = {
      ArrowLeft: () => addDays(cursor, -1),
      ArrowRight: () => addDays(cursor, 1),
      ArrowUp: () => addDays(cursor, -7),
      ArrowDown: () => addDays(cursor, 7),
      PageUp: () => addMonths(cursor, e.shiftKey ? -12 : -1),
      PageDown: () => addMonths(cursor, e.shiftKey ? 12 : 1),
      Home: () => addDays(cursor, -day),
      End: () => addDays(cursor, 6 - day)
    };
    const move = moves[e.key];
    if (!move) return;
    e.preventDefault();
    playUiSound('dateStep');
    moveCursor(move());
  };

  const quickPicks = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'Next week', date: getNextMonday(today) }
  ];

  const portalTarget = typeof document !== 'undefined' ? document.querySelector('.hud-portal') ?? document.body : null;

  return (
    <>
      <button
        type="button"
        ref={triggerRef}
        className={`chip-date-input ${className}`}
        aria-label={ariaLabel}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        tabIndex={tabIndex}
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
      />

      {isOpen && portalTarget && createPortal(
        <>
          <div
            className="popover-backdrop open"
            onClick={(e) => {
              e.stopPropagation();
              close(true);
            }}
          />
          <div
            className="time-popover date-popover open"
            role="dialog"
            aria-label={ariaLabel}
            ref={panelRef}
            style={placement}
            data-lenis-prevent
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                e.stopPropagation();
                close(true);
              }
            }}
          >
            <div className="popover-header">
              <span className="popover-title date-popover-month" aria-live="polite">{monthLabel}</span>
              <div className="popover-header-actions">
                <button type="button" className="popover-nudge-btn date-popover-step" title="Previous month (PgUp)" aria-label="Previous month" data-sfx="dateStep" onClick={() => setCursor(addMonths(cursor, -1))}>
                  <ChevronLeft size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
                <button type="button" className="popover-nudge-btn date-popover-step" title="Next month (PgDn)" aria-label="Next month" data-sfx="dateStep" onClick={() => setCursor(addMonths(cursor, 1))}>
                  <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
                </button>
                <button type="button" className="popover-close-btn" title="Close" aria-label="Close calendar" data-sfx="none" onClick={() => close(true)}>
                  &times;
                </button>
              </div>
            </div>

            <div className="duration-pills">
              {quickPicks.map(quick => (
                <button
                  key={quick.label}
                  type="button"
                  className={`duration-pill ${quick.date === selected ? 'active' : ''}`}
                  data-sfx="select"
                  onClick={() => pick(quick.date)}
                >
                  {quick.label}
                </button>
              ))}
            </div>

            <div className="date-grid" role="grid" aria-label={monthLabel} ref={gridRef} onKeyDown={handleGridKeyDown}>
              <div className="date-grid-row date-grid-head" role="row">
                {WEEKDAYS.map((day, i) => (
                  <span key={day} className={`date-grid-weekday ${i >= 5 ? 'is-weekend' : ''}`} role="columnheader" aria-label={day}>{day.slice(0, 2)}</span>
                ))}
              </div>
              {Array.from({ length: 6 }, (_, row) => (
                <div className="date-grid-row" role="row" key={row}>
                  {grid.slice(row * 7, row * 7 + 7).map((iso, col) => {
                    const d = parseISO(iso);
                    const classes = [
                      'date-cell',
                      d.getMonth() !== viewMonth && 'is-outside',
                      col >= 5 && 'is-weekend',
                      iso === today && 'is-today',
                      iso === selected && 'is-selected'
                    ].filter(Boolean).join(' ');
                    return (
                      <button
                        key={iso}
                        type="button"
                        role="gridcell"
                        className={classes}
                        data-date={iso}
                        data-sfx="select"
                        tabIndex={iso === cursor ? 0 : -1}
                        aria-selected={iso === selected}
                        aria-current={iso === today ? 'date' : undefined}
                        aria-label={d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })}
                        onClick={() => pick(iso)}
                      >
                        {d.getDate()}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>

            <div className="popover-footer">
              <span className="date-popover-selected">
                {selected ? parseISO(selected).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : 'No date'}
              </span>
              {selected && <span className="popover-badge">{formatRelative(selected, today)}</span>}
            </div>
          </div>
        </>,
        portalTarget
      )}
    </>
  );
}
