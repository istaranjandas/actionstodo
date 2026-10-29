// State Management & Firestore Cloud Sync
import type { User } from 'firebase/auth';
import { 
  db, 
  collection, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  writeBatch,
  setDoc
} from '../firebase';
import { addDays, getLocalISODate, getWeekDates } from './dateUtils';
import { occurrenceId, planOccurrences } from './recurrence';
import type { AppState, RepeatRule, Task, ViewName } from '../types';

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

// While a series is being rebuilt, its old future rows are still being deleted in Firestore.
// Generation skips it until that finishes so a late delete can never erase a fresh occurrence.
const resettingSeries = new Set<string>();

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
const TASK_BATCH_SIZE = 400;

function newTaskId(): string {
  return 'task_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

// Full-document writes (rather than updateDoc patches) keep optional series fields honest:
// clearing "repeat" actually removes it instead of leaving a stale value in Firestore.
function toFirestoreTask(task: Task, uid: string): Record<string, unknown> {
  const data: Record<string, unknown> = {
    text: task.text,
    date: task.date,
    startTime: task.startTime || '',
    endTime: task.endTime || '',
    completed: Boolean(task.completed),
    createdAt: task.createdAt || Date.now(),
    uid
  };
  if (task.repeat) data.repeat = task.repeat;
  if (task.repeatUntil) data.repeatUntil = task.repeatUntil;
  if (task.repeatGeneratedThrough) data.repeatGeneratedThrough = task.repeatGeneratedThrough;
  if (task.seriesId) data.seriesId = task.seriesId;
  if (task.isOccurrence) data.isOccurrence = true;
  return data;
}

function canWriteTask(task: Task, uid: string): boolean {
  return !task.uid || task.uid === uid;
}

async function commitTaskWrites(tasks: Task[]): Promise<void> {
  const uid = state.currentUser?.uid;
  if (!uid) return;
  const writable = tasks.filter(task => canWriteTask(task, uid));
  for (let start = 0; start < writable.length; start += TASK_BATCH_SIZE) {
    const batch = writeBatch(db);
    writable.slice(start, start + TASK_BATCH_SIZE).forEach(task => {
      batch.set(doc(db, 'tasks', task.id), toFirestoreTask(task, task.uid ?? uid));
    });
    try {
      await batch.commit();
    } catch (err) {
      console.error('Error writing cloud tasks:', err);
    }
  }
}

async function commitTaskDeletes(taskIds: string[]): Promise<void> {
  if (!state.currentUser || taskIds.length === 0) return;
  for (let start = 0; start < taskIds.length; start += TASK_BATCH_SIZE) {
    const batch = writeBatch(db);
    taskIds.slice(start, start + TASK_BATCH_SIZE).forEach(id => batch.delete(doc(db, 'tasks', id)));
    try {
      await batch.commit();
    } catch (err) {
      console.error('Error deleting cloud tasks:', err);
    }
  }
}

/**
 * Materialise every series out to the rolling horizon.
 *
 * Local state changes first so the interface never waits on the network; the same tasks are then
 * written in batches. Deterministic ids make the call safe to repeat after every snapshot.
 */
export function ensureRecurringOccurrences(): void {
  const today = getLocalISODate();
  const uid = state.currentUser?.uid;
  const existing = new Set(state.tasks.map(task => task.id));
  const created: Task[] = [];
  const masters: Task[] = [];

  state.tasks.forEach(master => {
    if (!master.repeat || !master.date || master.isOccurrence) return;
    if (resettingSeries.has(master.id)) return;
    // A cached task from another account (or from a signed-out cloud session) must not seed
    // rows under the current user's uid.
    if (master.uid && master.uid !== uid) return;

    const plan = planOccurrences(master, today);
    plan.dates.forEach(date => {
      const id = occurrenceId(master.id, date);
      if (existing.has(id)) return;
      existing.add(id);
      created.push({
        id,
        text: master.text,
        date,
        startTime: master.startTime,
        endTime: master.endTime,
        completed: false,
        createdAt: Date.now() + created.length,
        uid: master.uid ?? uid,
        seriesId: master.id,
        isOccurrence: true
      });
    });

    if (plan.through && plan.through > (master.repeatGeneratedThrough ?? '')) {
      masters.push({ ...master, repeatGeneratedThrough: plan.through });
    }
  });

  if (created.length === 0 && masters.length === 0) return;

  const masterById = new Map(masters.map(task => [task.id, task]));
  state.tasks = [
    ...state.tasks.map(task => masterById.get(task.id) ?? task),
    ...created
  ];
  saveLocalTasks();
  notifyStore();
  void commitTaskWrites([...masters, ...created]);
}

/**
 * Change (or clear) a series rule. Future incomplete days are rebuilt from the master's date;
 * completed history is never rewritten.
 */
export function setTaskRepeat(taskId: string, rule: RepeatRule | undefined, until = ''): void {
  const selected = state.tasks.find(item => item.id === taskId);
  if (!selected) return;

  // The repeat control may be opened from a generated day; it still edits the series master.
  let task = selected;
  if (selected.isOccurrence) {
    const master = selected.seriesId
      ? state.tasks.find(item => item.id === selected.seriesId && !item.isOccurrence)
      : undefined;
    if (!master) return;
    task = master;
  }

  const today = getLocalISODate();
  const stale = state.tasks.filter(item =>
    item.seriesId === task.id && item.isOccurrence && item.date >= today && !item.completed
  );
  const staleIds = new Set(stale.map(item => item.id));
  const next: Task = {
    ...task,
    repeat: rule,
    seriesId: rule ? task.id : undefined,
    repeatUntil: rule && until ? until : undefined,
    repeatGeneratedThrough: rule ? addDays(task.date, -1) : undefined
  };
  if (next.repeatUntil && next.repeatUntil < next.date) next.repeatUntil = next.date;

  if (rule) resettingSeries.add(task.id);

  state.tasks = state.tasks
    .filter(item => !staleIds.has(item.id))
    .map(item => (item.id === task.id ? next : item));
  saveLocalTasks();
  notifyStore();

  void (async () => {
    if (stale.length > 0) await commitTaskDeletes([...staleIds]);
    await commitTaskWrites([next]);
    resettingSeries.delete(task.id);
    if (rule) ensureRecurringOccurrences();
  })();
}

export async function addTask(
  finalText: string,
  targetDate: string,
  finalStart = '',
  finalEnd = '',
  repeat?: RepeatRule
): Promise<void> {
  const uid = state.currentUser?.uid;
  const id = newTaskId();
  const newTask: Task = {
    id,
    text: finalText,
    date: targetDate,
    startTime: finalStart,
    endTime: finalEnd,
    completed: false,
    createdAt: Date.now(),
    uid,
    repeat,
    seriesId: repeat ? id : undefined,
    repeatGeneratedThrough: repeat ? addDays(targetDate, -1) : undefined
  };

  state.tasks = [...state.tasks, newTask];
  saveLocalTasks();
  notifyStore();

  await commitTaskWrites([newTask]);
  if (repeat) ensureRecurringOccurrences();
}

export async function updateTaskItem(taskId: string, updates: Partial<Task>): Promise<void> {
  const task = state.tasks.find(item => item.id === taskId);
  if (!task) return;

  const today = getLocalISODate();
  const nextTask: Task = { ...task, ...updates };
  const dateChanged = updates.date !== undefined && updates.date !== task.date;

  const contentPatch: Partial<Task> = {};
  if (updates.text !== undefined) contentPatch.text = updates.text;
  if (updates.startTime !== undefined) contentPatch.startTime = updates.startTime;
  if (updates.endTime !== undefined) contentPatch.endTime = updates.endTime;
  const contentChanged = Object.keys(contentPatch).length > 0;

  // Moving a master shifts the whole series: rebuild the future rather than leave rows on the
  // old rhythm. Title/time edits, by contrast, flow through to the days already generated.
  const staleIds = new Set<string>();
  const futureOccurrences: Task[] = [];

  if (task.repeat && dateChanged) {
    state.tasks.forEach(item => {
      if (item.seriesId === task.id && item.isOccurrence && item.date >= today && !item.completed) {
        staleIds.add(item.id);
      }
    });
    if (nextTask.date) {
      nextTask.repeatGeneratedThrough = addDays(nextTask.date, -1);
      // A series can never end before it starts.
      if (nextTask.repeatUntil && nextTask.repeatUntil < nextTask.date) nextTask.repeatUntil = nextTask.date;
      resettingSeries.add(task.id);
    }
  } else if (task.repeat && contentChanged) {
    state.tasks.forEach(item => {
      if (item.seriesId === task.id && item.isOccurrence && item.date >= today && !item.completed) {
        futureOccurrences.push({ ...item, ...contentPatch });
      }
    });
  }

  const occurrenceById = new Map(futureOccurrences.map(item => [item.id, item]));
  state.tasks = state.tasks
    .filter(item => !staleIds.has(item.id))
    .map(item => {
      if (item.id === taskId) return nextTask;
      return occurrenceById.get(item.id) ?? item;
    });
  saveLocalTasks();
  notifyStore();

  if (staleIds.size > 0) await commitTaskDeletes([...staleIds]);
  await commitTaskWrites([nextTask, ...futureOccurrences]);

  if (task.repeat && dateChanged && nextTask.date) {
    resettingSeries.delete(task.id);
    ensureRecurringOccurrences();
  }
}

export async function deleteTaskItem(taskId: string): Promise<void> {
  const task = state.tasks.find(item => item.id === taskId);
  const today = getLocalISODate();
  const ids = new Set<string>([taskId]);
  const detached: Task[] = [];

  // Deleting a master stops the series. Future open days go with it, while past and completed
  // days stay as ordinary history rather than pointing at a series that no longer exists.
  // This also covers a series whose repeat was switched off earlier.
  const seriesItems = task ? state.tasks.filter(item => item.seriesId === task.id && item.isOccurrence) : [];
  seriesItems.forEach(item => {
    if (item.date >= today && !item.completed) {
      ids.add(item.id);
    } else {
      detached.push({ ...item, seriesId: undefined, isOccurrence: undefined });
    }
  });

  const detachedById = new Map(detached.map(item => [item.id, item]));
  state.tasks = state.tasks
    .filter(item => !ids.has(item.id))
    .map(item => detachedById.get(item.id) ?? item);
  saveLocalTasks();
  notifyStore();

  await commitTaskDeletes([...ids]);
  await commitTaskWrites(detached);
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

  // One-time migration of un-synced local offline tasks created before login.
  // Keep the local ids: a series master and its occurrences reference each other by id.
  const localOfflineTasks = state.tasks.filter(t => !t.uid && t.id.startsWith('task_'));
  if (localOfflineTasks.length > 0) {
    for (let start = 0; start < localOfflineTasks.length; start += TASK_BATCH_SIZE) {
      const batch = writeBatch(db);
      localOfflineTasks.slice(start, start + TASK_BATCH_SIZE).forEach(localTask => {
        batch.set(
          doc(db, 'tasks', localTask.id),
          toFirestoreTask({ ...localTask, uid: user.uid }, user.uid)
        );
      });
      batch.commit().catch(err => console.error('Migration error:', err));
    }
    const migratedIds = new Set(localOfflineTasks.map(t => t.id));
    state.tasks = state.tasks.filter(t => !migratedIds.has(t.id));
    saveLocalTasks();
    notifyStore();
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
