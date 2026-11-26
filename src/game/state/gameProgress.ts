import { useSyncExternalStore } from 'react';
import { addDays, getLocalISODate } from '../../modules/dateUtils';
import type { Task } from '../../types';

export const XP_PER_QUEST = 100;
export const XP_PER_LEVEL = 500;

const PROGRESS_STORAGE_KEY = 'actionstodo_game_progress_v1';

interface StoredProgress {
  xp: number;
  rewardedTaskIds: string[];
  completionDays: string[];
}

export interface LevelUpEvent {
  level: number;
  id: number;
}

export interface GameProgressSnapshot {
  xp: number;
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  streakDays: number;
  completedToday: number;
  lastLevelUp: LevelUpEvent | null;
}

const STALE_CHECK_INTERVAL_MS = 60_000;

// The raw JSON this tab last loaded or saved, so a change by another tab can be told apart.
let lastStoredRaw: string | null = null;

function readStoredProgress(): StoredProgress | null {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (raw && raw !== lastStoredRaw) {
      lastStoredRaw = raw;
      const parsed = JSON.parse(raw) as Partial<StoredProgress>;
      return {
        xp: Number(parsed.xp) || 0,
        rewardedTaskIds: Array.isArray(parsed.rewardedTaskIds) ? parsed.rewardedTaskIds : [],
        completionDays: Array.isArray(parsed.completionDays) ? parsed.completionDays : []
      };
    }
  } catch {
    return null;
  }
  return null;
}

let progress = readStoredProgress() ?? { xp: 0, rewardedTaskIds: [], completionDays: [] };
const rewardedTaskIds = new Set(progress.rewardedTaskIds);
let lastLevelUp: LevelUpEvent | null = null;
let snapshot = buildSnapshot();
const listeners = new Set<() => void>();
let staleCheckTimer: number | undefined;

// Another tab may have saved since we loaded; adopt its copy so we never write over its rewards.
function syncFromStorage(): boolean {
  const stored = readStoredProgress();
  if (!stored) return false;
  progress = stored;
  rewardedTaskIds.clear();
  stored.rewardedTaskIds.forEach((id) => rewardedTaskIds.add(id));
  return true;
}

function persistProgress() {
  try {
    const raw = JSON.stringify(progress);
    localStorage.setItem(PROGRESS_STORAGE_KEY, raw);
    lastStoredRaw = raw;
  } catch {
    return;
  }
}

export function levelForXp(xp: number): number {
  return Math.floor(xp / XP_PER_LEVEL) + 1;
}

function countStreak(completionDays: Set<string>): number {
  const today = getLocalISODate();
  let cursor = completionDays.has(today) ? today : addDays(today, -1);
  let streak = 0;
  while (completionDays.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}

function buildSnapshot(): GameProgressSnapshot {
  const days = new Set(progress.completionDays);
  const today = getLocalISODate();
  return {
    xp: progress.xp,
    level: levelForXp(progress.xp),
    xpIntoLevel: progress.xp % XP_PER_LEVEL,
    xpForNextLevel: XP_PER_LEVEL,
    streakDays: countStreak(days),
    completedToday: progress.completionDays.filter((day) => day === today).length,
    lastLevelUp
  };
}

function publish() {
  snapshot = buildSnapshot();
  listeners.forEach((listener) => listener());
}

// The streak and today's count depend on the date, so recheck them while the HUD is open (e.g. past midnight).
function publishIfDayChanged() {
  const next = buildSnapshot();
  if (next.streakDays === snapshot.streakDays && next.completedToday === snapshot.completedToday) return;
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function handleStorage(event: StorageEvent) {
  if (event.key !== PROGRESS_STORAGE_KEY && event.key !== null) return;
  if (syncFromStorage()) publish();
}

export function isQuestRewarded(taskId: string): boolean {
  return rewardedTaskIds.has(taskId);
}

export function rewardCompletedQuests(tasks: Task[], { announceLevelUps }: { announceLevelUps: boolean }): void {
  const synced = syncFromStorage();
  const levelBefore = levelForXp(progress.xp);
  let changed = false;

  tasks.forEach((task) => {
    if (!task.completed || rewardedTaskIds.has(task.id)) return;
    rewardedTaskIds.add(task.id);
    progress.xp += XP_PER_QUEST;
    progress.completionDays.push(announceLevelUps ? getLocalISODate() : task.date || getLocalISODate());
    changed = true;
  });

  if (!changed) {
    if (synced) publish();
    return;
  }
  progress = { ...progress, rewardedTaskIds: [...rewardedTaskIds] };
  const levelAfter = levelForXp(progress.xp);
  if (announceLevelUps && levelAfter > levelBefore) {
    lastLevelUp = { level: levelAfter, id: Date.now() };
  }
  persistProgress();
  publish();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  if (listeners.size === 1) {
    staleCheckTimer = window.setInterval(publishIfDayChanged, STALE_CHECK_INTERVAL_MS);
    window.addEventListener('storage', handleStorage);
    window.addEventListener('focus', publishIfDayChanged);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size > 0) return;
    window.clearInterval(staleCheckTimer);
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener('focus', publishIfDayChanged);
  };
}

export function useGameProgress(): GameProgressSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

