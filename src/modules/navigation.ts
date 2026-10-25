// The lenses, in menu order: today's log, every date, and the week planner (desktop only).
// Upcoming, Week and Done are gone from the bar — Done became a toggle in the slate header.
import { getLocalISODate, isoDateParts } from './dateUtils';
import { summarizeView } from './store';
import type { Task, ViewName } from '../types';

export type NavKey = ViewName | 'planner';

export interface NavItem {
  key: NavKey;
  label: string;
  shortcut: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'today', label: 'Today', shortcut: '1' },
  { key: 'all', label: 'All', shortcut: '2' },
  { key: 'planner', label: 'Planner', shortcut: '3' }
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
