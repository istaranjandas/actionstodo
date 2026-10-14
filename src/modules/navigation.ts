// The lenses, in menu order. Planner is the week table (desktop only, as before).
import { getLocalISODate } from './dateUtils';
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
  { key: 'upcoming', label: 'Upcoming', shortcut: '2' },
  { key: 'this-week', label: 'Week', shortcut: '3' },
  { key: 'all', label: 'All', shortcut: '4' },
  { key: 'completed', label: 'Done', shortcut: '5' },
  { key: 'planner', label: 'Planner', shortcut: '6' }
];

// Lens badges read the same summarizeView selector as the lists and the slate header:
// open tasks for every lens, completed tasks for Done
export function countForView(view: NavKey, tasks: Task[]): number | null {
  if (view === 'planner') return null;
  const summary = summarizeView(tasks, view, null);
  return view === 'completed' ? summary.done : summary.open;
}

export function daysFromToday(isoDate: string): number {
  const [year, month, day] = isoDate.split('-').map(Number);
  const [todayYear, todayMonth, todayDay] = getLocalISODate().split('-').map(Number);
  const msPerDay = 86400000;
  return Math.round((Date.UTC(year, month - 1, day) - Date.UTC(todayYear, todayMonth - 1, todayDay)) / msPerDay);
}
