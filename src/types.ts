import type { User } from 'firebase/auth';

export interface Task {
  id: string;
  text: string;
  date: string;
  startTime: string;
  endTime: string;
  completed: boolean;
  createdAt: number;
  uid?: string;
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
