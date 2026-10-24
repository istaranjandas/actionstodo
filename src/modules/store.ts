// State Management & Firestore Cloud Sync
import type { User } from 'firebase/auth';
import { 
  db, 
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  writeBatch,
  setDoc
} from '../firebase';
import { getLocalISODate, getWeekDates } from './dateUtils';
import type { AppState, Task, ViewName } from '../types';

export const STORAGE_KEY = 'todo_do_tasks_v1';

export const state: AppState = {
  tasks: loadTasks(),
  currentUser: null,
  currentView: 'today',
  specificDateFilter: null,
  selectedAddDate: getLocalISODate(),
  selectedAddStart: '',
  selectedAddEnd: '',
  isTableView: false,
  unsubscribeFirestore: null
};

// Subscribers re-render React whenever state changes
const listeners = new Set<() => void>();
let stateVersion = 0;

export function subscribeStore(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getStoreVersion(): number {
  return stateVersion;
}

export function notifyStore(): void {
  stateVersion += 1;
  listeners.forEach(listener => listener());
}

export function setUiState(updates: Partial<AppState>): void {
  Object.assign(state, updates);
  notifyStore();
}

export function loadTasks(): Task[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load from localStorage', e);
  }
  return [];
}

export function saveLocalTasks(): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
}

// Sorting logic
export function sortTaskList(taskList: Task[], sortByTime = true): Task[] {
  return [...taskList].sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }

    if (sortByTime) {
      const aHasTime = Boolean(a.startTime);
      const bHasTime = Boolean(b.startTime);

      if (aHasTime && bHasTime) {
        const timeDiff = a.startTime.localeCompare(b.startTime);
        if (timeDiff !== 0) return timeDiff;
        if (a.endTime && b.endTime) {
          const endDiff = a.endTime.localeCompare(b.endTime);
          if (endDiff !== 0) return endDiff;
        }
      } else if (aHasTime && !bHasTime) {
        return -1;
      } else if (!aHasTime && bHasTime) {
        return 1;
      }
    }

    return a.createdAt - b.createdAt;
  });
}

// Filtering logic: the single source of truth for which tasks a view (or a picked date) contains.
// Lists, header counts and lens badges all derive from this.
export function filterTasks(tasks: Task[], view: ViewName, specificDate: string | null): Task[] {
  const today = getLocalISODate();

  if (specificDate) {
    return tasks.filter(t => t.date === specificDate);
  }

  switch (view) {
    case 'today':
      return tasks.filter(t => t.date === today);
    case 'this-week': {
      const currentWeekDates = getWeekDates(0);
      const start = currentWeekDates[0];
      const end = currentWeekDates[6];
      return tasks.filter(t => t.date >= start && t.date <= end);
    }
    case 'upcoming':
      return tasks.filter(t => t.date >= today);
    case 'completed':
      return tasks.filter(t => t.completed);
    case 'all':
    default:
      return tasks;
  }
}

export interface TaskTally {
  open: number;
  done: number;
  total: number;
}

export function tallyTasks(tasks: Task[]): TaskTally {
  const done = tasks.filter(t => t.completed).length;
  return { open: tasks.length - done, done, total: tasks.length };
}

export interface ViewSummary extends TaskTally {
  tasks: Task[];
}

// The one selector for a view: its task list and tally. The slate header, the day cards (which group
// these same tasks) and the ribbon's lens badges all read from it, so their numbers always agree.
export function summarizeView(tasks: Task[], view: ViewName, specificDate: string | null): ViewSummary {
  const viewTasks = filterTasks(tasks, view, specificDate);
  return { tasks: viewTasks, ...tallyTasks(viewTasks) };
}

// Cloud & Mutation Operations
export async function addTask(finalText: string, targetDate: string, finalStart = '', finalEnd = ''): Promise<void> {
  if (state.currentUser) {
    try {
      await addDoc(collection(db, 'tasks'), {
        text: finalText,
        date: targetDate,
        startTime: finalStart,
        endTime: finalEnd,
        completed: false,
        createdAt: Date.now(),
        uid: state.currentUser.uid
      });
    } catch (err) {
      console.error('Error adding cloud task:', err);
    }
  } else {
    const newTask: Task = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
      text: finalText,
      date: targetDate,
      startTime: finalStart,
      endTime: finalEnd,
      completed: false,
      createdAt: Date.now()
    };
    state.tasks = [...state.tasks, newTask];
    saveLocalTasks();
    notifyStore();
  }
}

export async function updateTaskItem(taskId: string, updates: Partial<Task>): Promise<void> {
  const index = state.tasks.findIndex(t => t.id === taskId);
  if (index !== -1) {
    // Replace the whole array in one step: React reads the snapshot it is handed
    state.tasks = state.tasks.map((task, i) => (i === index ? { ...task, ...updates } : task));
    saveLocalTasks();
    notifyStore();
    if (state.currentUser) {
      try {
        await updateDoc(doc(db, 'tasks', taskId), updates);
      } catch (err) {
        console.error('Error updating cloud task:', err);
      }
    }
  }
}

export async function deleteTaskItem(taskId: string): Promise<void> {
  // Optimistically remove from local state immediately
  state.tasks = state.tasks.filter(t => t.id !== taskId);
  saveLocalTasks();
  notifyStore();

  if (state.currentUser) {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      console.error('Error deleting cloud task:', err);
    }
  }
}

// Firestore Realtime Listener
export function initFirestoreSync(user: User): void {
  if (state.unsubscribeFirestore) {
    state.unsubscribeFirestore();
  }

  // Profile for the admin portal's user list
  setDoc(doc(db, 'users', user.uid), {
    name: user.displayName ?? '',
    email: user.email ?? '',
    lastSeen: Date.now()
  }, { merge: true }).catch(e => console.error('Profile save failed', e));

  // One-time migration of un-synced local offline tasks created before login
  const localOfflineTasks = state.tasks.filter(t => t.id && t.id.startsWith('task_'));
  if (localOfflineTasks.length > 0) {
    const batch = writeBatch(db);
    localOfflineTasks.forEach(localTask => {
      const newRef = doc(collection(db, 'tasks'));
      batch.set(newRef, {
        text: localTask.text,
        date: localTask.date,
        startTime: localTask.startTime || '',
        endTime: localTask.endTime || '',
        completed: Boolean(localTask.completed),
        createdAt: localTask.createdAt || Date.now(),
        uid: user.uid
      });
    });
    state.tasks = state.tasks.filter(t => !t.id.startsWith('task_'));
    saveLocalTasks();
    notifyStore();
    batch.commit().catch(err => console.error('Migration error:', err));
  }

  const q = query(collection(db, 'tasks'), where('uid', '==', user.uid));

  state.unsubscribeFirestore = onSnapshot(q, (snapshot) => {
    const cloudTasks = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }) as Task);

    state.tasks = cloudTasks;
    saveLocalTasks();
    notifyStore();
  }, (err) => {
    console.error('Firestore sync error:', err);
  });
}

export function stopFirestoreSync(): void {
  if (state.unsubscribeFirestore) {
    state.unsubscribeFirestore();
    state.unsubscribeFirestore = null;
  }
  state.tasks = loadTasks();
  notifyStore();
}
