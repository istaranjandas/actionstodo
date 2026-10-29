// Recurring task rules.
//
// One task is the series master. The app materialises other days as ordinary task rows on a
// rolling horizon, so the calendar, planner and lantern path all show real tasks without the
// store ever holding an infinite list. Occurrence ids are deterministic, which makes generation
// idempotent across tabs, devices and Firestore snapshots.
import { addDays, formatShortDate, getLocalISODate, parseISODate } from './dateUtils';
import { parseTimeFromText } from './timeUtils';
import type { RepeatRule, Task } from '../types';

/** Matches the path's forward limit: two months of real rows is enough to plan around. */
export const REPEAT_HORIZON_DAYS = 60;

export const REPEAT_OPTIONS: Array<{ value: RepeatRule; label: string; hint: string }> = [
  { value: 'daily', label: 'Every day', hint: 'Daily' },
  { value: 'weekdays', label: 'Weekdays', hint: 'Mon–Fri' },
  { value: 'weekly', label: 'Every week', hint: 'Same weekday' },
  { value: 'monthly', label: 'Every month', hint: 'Same day of month' }
];

export function repeatRuleLabel(rule?: RepeatRule): string {
  switch (rule) {
    case 'daily':
      return 'Every day';
    case 'weekdays':
      return 'Weekdays';
    case 'weekly':
      return 'Every week';
    case 'monthly':
      return 'Every month';
    default:
      return 'Never';
  }
}

/** Compact label for the task-row badge. */
export function repeatShortLabel(rule?: RepeatRule): string {
  switch (rule) {
    case 'daily':
      return 'Daily';
    case 'weekdays':
      return 'Weekdays';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    default:
      return '';
  }
}

/** Short label used by the inspector's repeat field. */
export function repeatSummary(task: Task): string {
  if (!task.repeat) return 'Never';
  const until = task.repeatUntil ? ` · until ${formatShortDate(task.repeatUntil)}` : '';
  return `${repeatRuleLabel(task.repeat)}${until}`;
}

/** Tooltip/aria text for the repeat mark on a task row. */
export function repeatBadgeLabel(task: Task): string {
  if (task.repeat) return `Repeats ${repeatRuleLabel(task.repeat).toLowerCase()}`;
  if (task.isOccurrence) return 'Repeating task';
  return '';
}

export function occurrenceId(seriesId: string, date: string): string {
  return `${seriesId}__${date}`;
}

function daysInMonth(year: number, monthIndex: number): number {
  return new Date(year, monthIndex + 1, 0).getDate();
}

function matchesRule(rule: RepeatRule, dateISO: string, startISO: string): boolean {
  const date = parseISODate(dateISO);
  const start = parseISODate(startISO);

  switch (rule) {
    case 'daily':
      return true;
    case 'weekdays': {
      const day = date.getDay();
      return day >= 1 && day <= 5;
    }
    case 'weekly':
      return date.getDay() === start.getDay();
    case 'monthly': {
      // A series that starts on the 31st still lands on the last day of shorter months.
      const startDay = start.getDate();
      return date.getDate() === Math.min(startDay, daysInMonth(date.getFullYear(), date.getMonth()));
    }
    default:
      return false;
  }
}

export interface OccurrencePlan {
  /** Days to create, excluding the master's own day. */
  dates: string[];
  /** The horizon the master has now covered, even when every date already existed. */
  through: string;
}

/**
 * Work out which days a master still needs.
 *
 * Generation only moves forward and never back-fills days before today: a daily gym task set on
 * an old task should start today, not create a month of missed sessions. `repeatGeneratedThrough`
 * on the master is what keeps a skipped day skipped — once the horizon has passed it, deleting
 * that occurrence cannot bring it back.
 */
export function planOccurrences(master: Task, today: string = getLocalISODate()): OccurrencePlan {
  const empty: OccurrencePlan = { dates: [], through: master.repeatGeneratedThrough ?? '' };
  if (!master.repeat || !master.date) return empty;

  const start = master.date;
  const horizon = addDays(today, REPEAT_HORIZON_DAYS);
  const until = master.repeatUntil && master.repeatUntil < horizon ? master.repeatUntil : horizon;
  if (until < start) return empty;

  let from = master.repeatGeneratedThrough ? addDays(master.repeatGeneratedThrough, 1) : start;
  if (from < start) from = start;
  if (from < today) from = today;
  if (from > until) return empty;

  const dates: string[] = [];
  for (let date = from; date <= until; date = addDays(date, 1)) {
    if (date === start) continue;
    if (matchesRule(master.repeat, date, start)) dates.push(date);
  }
  return { dates, through: until };
}

/**
 * Natural-language recurrence in the command bar:
 * "gym every day at 6pm", "standup weekdays 9am", "rent monthly". The token is removed before
 * the time parser runs, so "every day" never gets mistaken for part of the title.
 */
const REPEAT_TOKENS: Array<{ rule: RepeatRule; pattern: RegExp }> = [
  { rule: 'weekdays', pattern: /\b(?:every\s+weekday|on\s+weekdays?|weekdays?)\b/gi },
  { rule: 'daily', pattern: /\b(?:every\s*day|everyday|daily)\b/gi },
  { rule: 'weekly', pattern: /\b(?:every\s+week|weekly|once\s+a\s+week)\b/gi },
  { rule: 'monthly', pattern: /\b(?:every\s+month|monthly|once\s+a\s+month)\b/gi }
];

export function parseRepeatFromText(raw: string): { cleanText: string; repeat?: RepeatRule } {
  let text = raw;
  let repeat: RepeatRule | undefined;

  for (const token of REPEAT_TOKENS) {
    token.pattern.lastIndex = 0;
    if (!token.pattern.test(text)) continue;
    token.pattern.lastIndex = 0;
    text = text.replace(token.pattern, ' ');
    repeat ??= token.rule;
  }

  return { cleanText: text.replace(/\s+/g, ' ').trim(), repeat };
}

/** One parse for every command line: recurrence first, then the existing time grammar. */
export function parseTaskInput(raw: string): {
  cleanText: string;
  startTime: string;
  endTime: string;
  repeat?: RepeatRule;
} {
  const recurring = parseRepeatFromText(raw);
  const timed = parseTimeFromText(recurring.cleanText);
  const cleanText = (timed ? timed.cleanText : recurring.cleanText).trim();
  return {
    // "every day at 6pm" on its own still needs a title to save.
    cleanText: cleanText || raw.trim(),
    startTime: timed?.startTime ?? '',
    endTime: timed?.endTime ?? '',
    repeat: recurring.repeat
  };
}
