// The lenses, in menu order. Planner is the week table (desktop only, as before).
// Each lens carries the title and subtitle the area label shows, so nav and headings cannot drift.
import { formatWeekRangeLabel, getLocalISODate, getWeekDates, isoDateParts } from './dateUtils';
import { summarizeView } from './store';
import type { Task, ViewName } from '../types';

export type NavKey = ViewName | 'planner';

export interface NavItem {
  key: NavKey;
  label: string;
  shortcut: string;
  // Heading shown over the world when this lens is active
  title: string;
  subtitle: () => string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'today', label: 'Today', shortcut: '1', title: 'Today', subtitle: () => 'The waypost you are standing on' },
  { key: 'upcoming', label: 'Upcoming', shortcut: '2', title: 'Upcoming', subtitle: () => 'The path ahead' },
  { key: 'this-week', label: 'Week', shortcut: '3', title: 'This week', subtitle: () => formatWeekRangeLabel(getWeekDates(0)) },
  { key: 'all', label: 'All', shortcut: '4', title: 'All dates', subtitle: () => 'Every waypost on the path' },
  { key: 'completed', label: 'Done', shortcut: '5', title: 'Done', subtitle: () => 'Lanterns already lit' },
  { key: 'planner', label: 'Planner', shortcut: '6', title: 'Planner', subtitle: () => formatWeekRangeLabel(getWeekDates(0)) }
];

// Lens badges read the same summarizeView selector as the lists and the slate header:
// open tasks for every lens, completed tasks for Done
export function countForView(view: NavKey, tasks: Task[]): number | null {
  if (view === 'planner') return null;
  const summary = summarizeView(tasks, view, null);
  return view === 'completed' ? summary.done : summary.open;
}

export function daysFromToday(isoDate: string): number {
  const { year, month, day } = isoDateParts(isoDate);
  const now = isoDateParts(getLocalISODate());
  const msPerDay = 86400000;
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(now.year, now.month - 1, now.day)) / msPerDay);
}
