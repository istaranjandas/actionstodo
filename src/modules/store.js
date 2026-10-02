// State Management & Firestore Cloud Sync
import { 
  auth, 
  googleProvider, 
  db, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  writeBatch 
} from '../firebase.js';
import { getLocalISODate, getWeekDates } from './dateUtils.js';

export const STORAGE_KEY = 'todo_do_tasks_v1';
export const THEME_KEY = 'notion_minimal_theme';
export const TITLE_KEY = 'notion_minimal_title';
export const SORT_TIME_KEY = 'notion_minimal_sort_time_v2';

export const state = {
  tasks: loadTasks(),
  currentUser: null,
  currentView: 'all', // 'all', 'today', 'upcoming', 'completed', 'this-week'
  specificDateFilter: null,
  selectedAddDate: getLocalISODate(),
  selectedAddStart: '',
  selectedAddEnd: '',
  sortByTime: localStorage.getItem(SORT_TIME_KEY) !== 'false',
  isTableView: false,
  unsubscribeFirestore: null
};

export function loadTasks() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) {
    console.error('Failed to load from localStorage', e);
  }
  return [];
}

export function saveLocalTasks() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.tasks));
  } catch (e) {
    console.error('Failed to save to localStorage', e);
  }
}

// Sorting logic
export function sortTaskList(taskList, sortByTime = true) {
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

// Filtering logic
export function getFilteredTasks() {
  const today = getLocalISODate();

  if (state.specificDateFilter) {
    return state.tasks.filter(t => t.date === state.specificDateFilter);
  }

  switch (state.currentView) {
    case 'today':
      return state.tasks.filter(t => t.date === today);
    case 'this-week': {
      const currentWeekDates = getWeekDates(0);
      const start = currentWeekDates[0];
      const end = currentWeekDates[6];
      return state.tasks.filter(t => t.date >= start && t.date <= end);
    }
    case 'upcoming':
      return state.tasks.filter(t => t.date >= today);
    case 'completed':
      return state.tasks.filter(t => t.completed);
    case 'all':
    default:
      return state.tasks.filter(t => !t.date || t.date <= today);
  }
}

// Cloud & Mutation Operations
export async function addTask(finalText, targetDate, finalStart = '', finalEnd = '') {
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
    const newTask = {
      id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
      text: finalText,
      date: targetDate,
      startTime: finalStart,
      endTime: finalEnd,
      completed: false,
      createdAt: Date.now()
    };
    state.tasks.push(newTask);
    saveLocalTasks();
  }
}

export async function updateTaskItem(taskId, updates) {
  const task = state.tasks.find(t => t.id === taskId);
  if (task) {
    Object.assign(task, updates);
    saveLocalTasks();
    if (state.currentUser) {
      try {
        await updateDoc(doc(db, 'tasks', taskId), updates);
      } catch (err) {
        console.error('Error updating cloud task:', err);
      }
    }
  }
}

export async function deleteTaskItem(taskId) {
  // Optimistically remove from local state immediately
  state.tasks = state.tasks.filter(t => t.id !== taskId);
  saveLocalTasks();

  if (state.currentUser) {
    try {
      await deleteDoc(doc(db, 'tasks', taskId));
    } catch (err) {
      console.error('Error deleting cloud task:', err);
    }
  }
}

export async function clearCompletedTasks() {
  const completedTasks = state.tasks.filter(t => t.completed);
  if (completedTasks.length === 0) return;

  state.tasks = state.tasks.filter(t => !t.completed);
  saveLocalTasks();

  if (state.currentUser) {
    const batch = writeBatch(db);
    completedTasks.forEach(t => {
      batch.delete(doc(db, 'tasks', t.id));
    });
    await batch.commit();
  }
}

// Firestore Realtime Listener
export function initFirestoreSync(user, onSyncUpdate) {
  if (state.unsubscribeFirestore) {
    state.unsubscribeFirestore();
  }

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
    batch.commit().catch(err => console.error('Migration error:', err));
  }

  const q = query(collection(db, 'tasks'), where('uid', '==', user.uid));

  state.unsubscribeFirestore = onSnapshot(q, (snapshot) => {
    const cloudTasks = snapshot.docs.map(docSnap => ({
      id: docSnap.id,
      ...docSnap.data()
    }));

    state.tasks = cloudTasks;
    saveLocalTasks();
    if (onSyncUpdate) onSyncUpdate();
  }, (err) => {
    console.error('Firestore sync error:', err);
  });
}

export function stopFirestoreSync() {
  if (state.unsubscribeFirestore) {
    state.unsubscribeFirestore();
    state.unsubscribeFirestore = null;
  }
  state.tasks = loadTasks();
}
