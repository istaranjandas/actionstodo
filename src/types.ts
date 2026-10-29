import type { User } from 'firebase/auth';

// A series is anchored by one master task. Occurrences reference it through seriesId;
// repeat itself only ever lives on the master, so generated days never start their own series.
export type RepeatRule = 'daily' | 'weekdays' | 'weekly' | 'monthly';

export interface Task {
  id: string;
  text: string;
  date: string;
  startTime: string;
  endTime: string;
  completed: boolean;
  createdAt: number;
  uid?: string;
  /** Set on the series master. */
  repeat?: RepeatRule;
  /** Inclusive last day of the series (local ISO date). */
  repeatUntil?: string;
  /** Master-only: the last day already materialised, so generation stays idempotent. */
  repeatGeneratedThrough?: string;
  /** The master task id shared by every occurrence, including the master. */
  seriesId?: string;
  /** True on generated days; false/absent on the master and one-off tasks. */
  isOccurrence?: boolean;
}

export type ViewName = 'all' | 'today' | 'this-week' | 'upcoming' | 'completed';

export type Theme = 'light' | 'dark';

export interface AppState {
  tasks: Task[];
  currentUser: User | null;
  currentView: ViewName;
  specificDateFilter: string | null;
  selectedAddDate: string;
  selectedAddStart: string;
  selectedAddEnd: string;
  isTableView: boolean;
  unsubscribeFirestore: (() => void) | null;
}

export type TimePopoverContext = { type: 'quick' } | { type: 'task'; taskId: string };
