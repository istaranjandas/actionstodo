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

function loadProgress(): StoredProgress {
  try {
    const raw = localStorage.getItem(PROGRESS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StoredProgress>;
      return {
        xp: Number(parsed.xp) || 0,
        rewardedTaskIds: Array.isArray(parsed.rewardedTaskIds) ? parsed.rewardedTaskIds : [],
        completionDays: Array.isArray(parsed.completionDays) ? parsed.completionDays : []
      };
    }
  } catch {
    return { xp: 0, rewardedTaskIds: [], completionDays: [] };
  }
  return { xp: 0, rewardedTaskIds: [], completionDays: [] };
}

let progress = loadProgress();
const rewardedTaskIds = new Set(progress.rewardedTaskIds);
let lastLevelUp: LevelUpEvent | null = null;
let snapshot = buildSnapshot();
const listeners = new Set<() => void>();

function persistProgress() {
  try {
    localStorage.setItem(PROGRESS_STORAGE_KEY, JSON.stringify(progress));
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

export function rewardCompletedQuests(tasks: Task[], { announceLevelUps }: { announceLevelUps: boolean }): void {
  const levelBefore = levelForXp(progress.xp);
  let changed = false;

  tasks.forEach((task) => {
    if (!task.completed || rewardedTaskIds.has(task.id)) return;
    rewardedTaskIds.add(task.id);
    progress.xp += XP_PER_QUEST;
    progress.completionDays.push(announceLevelUps ? getLocalISODate() : task.date || getLocalISODate());
    changed = true;
  });

  if (!changed) return;
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
  return () => listeners.delete(listener);
}

export function useGameProgress(): GameProgressSnapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => snapshot);
}

