// Admin portal: read-only view of every user's tasks. Access is enforced by Firestore rules (admins/{uid}).
import { useEffect, useMemo, useState } from 'react';
import type { User } from 'firebase/auth';
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged, db, collection, onSnapshot, doc } from '../firebase';
import type { Task } from '../types';
import './admin.css';

interface Profile {
  uid: string;
  name?: string;
  email?: string;
  lastSeen?: number;
}

type Filter = 'all' | 'open' | 'done';

function timeAgo(ms?: number): string {
  if (!ms) return 'unknown';
  const mins = Math.floor((Date.now() - ms) / 60000);
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function AdminPage() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [error, setError] = useState('');
  const [selectedUid, setSelectedUid] = useState<string | null>(null);
  const [userSearch, setUserSearch] = useState('');
  const [taskSearch, setTaskSearch] = useState('');
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => onAuthStateChanged(auth, (u) => {
    setUser(u);
    setAuthReady(true);
  }), []);

  // Admin check: your own admins/{uid} doc exists only if you were granted access
  useEffect(() => {
    if (!user) { setIsAdmin(null); return; }
    return onSnapshot(doc(db, 'admins', user.uid),
      (snap) => setIsAdmin(snap.exists()),
      () => setIsAdmin(false));
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    const unsubTasks = onSnapshot(collection(db, 'tasks'),
      (snap) => setTasks(snap.docs.map(d => ({ ...(d.data() as Task), id: d.id }))),
      (e) => setError(e.message));
    const unsubUsers = onSnapshot(collection(db, 'users'),
      (snap) => {
        const next: Record<string, Profile> = {};
        snap.docs.forEach(d => { next[d.id] = { ...(d.data() as Profile), uid: d.id }; });
        setProfiles(next);
      },
      (e) => setError(e.message));
    return () => { unsubTasks(); unsubUsers(); };
  }, [isAdmin]);

  // Users = saved profiles plus anyone who owns a task (covers users from before profiles existed)
  const users = useMemo(() => {
    const map = new Map<string, Profile & { total: number; done: number }>();
    Object.values(profiles).forEach(p => map.set(p.uid, { ...p, total: 0, done: 0 }));
    tasks.forEach(t => {
      if (!t.uid) return;
      const entry = map.get(t.uid) ?? { uid: t.uid, total: 0, done: 0 };
      entry.total += 1;
      if (t.completed) entry.done += 1;
      map.set(t.uid, entry);
    });
    const q = userSearch.trim().toLowerCase();
    return [...map.values()]
      .filter(u => !q || `${u.name ?? ''} ${u.email ?? ''} ${u.uid}`.toLowerCase().includes(q))
      .sort((a, b) => (a.name ?? a.email ?? a.uid).localeCompare(b.name ?? b.email ?? b.uid));
  }, [profiles, tasks, userSearch]);

  const selected = users.find(u => u.uid === selectedUid) ?? null;

  const userTasks = useMemo(() => {
    const q = taskSearch.trim().toLowerCase();
    return tasks
      .filter(t => t.uid === selectedUid)
      .filter(t => filter === 'all' || (filter === 'done' ? t.completed : !t.completed))
      .filter(t => !q || t.text.toLowerCase().includes(q))
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  }, [tasks, selectedUid, filter, taskSearch]);

  if (!authReady) return <div className="admin-msg">Loading…</div>;

  if (!user) {
    return (
      <div className="admin-msg">
        <p>Admin sign-in required.</p>
        <button onClick={() => signInWithPopup(auth, googleProvider)}>Sign in with Google</button>
      </div>
    );
  }

  if (isAdmin === null) return <div className="admin-msg">Checking access…</div>;

  if (!isAdmin) {
    return (
      <div className="admin-msg">
        <p>{user.email} is not an admin.</p>
        <p>To grant access, create Firestore document <code>admins/{user.uid}</code>.</p>
        <button onClick={() => signOut(auth)}>Sign out</button>
      </div>
    );
  }

  return (
    <div className="admin">
      <header className="admin-top">
        <strong>ACTIONSTODO · ADMIN</strong>
        <span>{user.email} <a href="/">Exit</a> <button onClick={() => signOut(auth)}>Sign out</button></span>
      </header>
      {error && <div className="admin-error">{error}</div>}
      <div className="admin-body">
        <aside className="admin-users">
          <h2>Users ({users.length})</h2>
          <input placeholder="Search…" value={userSearch} onChange={e => setUserSearch(e.target.value)} />
          <ul>
            {users.map(u => (
              <li key={u.uid}>
                <button className={u.uid === selectedUid ? 'is-active' : ''} onClick={() => setSelectedUid(u.uid)}>
                  <span>{u.name ?? u.email ?? u.uid.slice(0, 10)}</span>
                  <span className="admin-count">{u.total}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>
        <main className="admin-tasks">
          {!selected ? <p className="admin-empty">Select a user.</p> : (
            <>
              <div className="admin-user-head">
                <h2>{selected.name ?? 'Unnamed'} · {selected.email ?? selected.uid}</h2>
                <p>{selected.total} tasks · {selected.done} done · Last seen {timeAgo(selected.lastSeen)}</p>
              </div>
              <div className="admin-filters">
                <label>Filter{' '}
                  <select value={filter} onChange={e => setFilter(e.target.value as Filter)}>
                    <option value="all">All</option>
                    <option value="open">Open</option>
                    <option value="done">Done</option>
                  </select>
                </label>
                <input placeholder="Search tasks…" value={taskSearch} onChange={e => setTaskSearch(e.target.value)} />
              </div>
              <table>
                <thead><tr><th></th><th>Task</th><th>Date</th><th>Time</th></tr></thead>
                <tbody>
                  {userTasks.map(t => (
                    <tr key={t.id} className={t.completed ? 'is-done' : ''}>
                      <td>{t.completed ? '☑' : '☐'}</td>
                      <td>{t.text}</td>
                      <td>{t.date}</td>
                      <td>{t.startTime}{t.endTime ? `–${t.endTime}` : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {userTasks.length === 0 && <p className="admin-empty">No tasks.</p>}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
