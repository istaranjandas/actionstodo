import { getLocalISODate } from '../../modules/dateUtils';
import { ISLAND_RADIUS, JUMP_PAD_POSITIONS, PLAYER_SPAWN } from '../world/arenaPalette';
import type { Task } from '../../types';

export type RelicStatus = 'urgent' | 'normal' | 'completed';

export const MAX_ARENA_RELICS = 28;
const MIN_RELIC_SPACING = 2.6;
const INNER_CLEAR_RADIUS = 3.2;
const OUTER_MARGIN = 3.2;
const PLACEMENT_ATTEMPTS = 40;

export function relicStatusFor(task: Task, today = getLocalISODate()): RelicStatus {
  if (task.completed) return 'completed';
  return task.date && task.date <= today ? 'urgent' : 'normal';
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export function selectArenaTasks(tasks: Task[]): Task[] {
  const today = getLocalISODate();
  const open = tasks
    .filter((task) => !task.completed)
    .sort((a, b) => Math.abs(Date.parse(a.date || today) - Date.parse(today)) - Math.abs(Date.parse(b.date || today) - Date.parse(today)));
  const completed = tasks.filter((task) => task.completed).sort((a, b) => b.createdAt - a.createdAt);
  return [...open, ...completed].slice(0, MAX_ARENA_RELICS);
}

export function layoutRelics(tasks: Task[]): Map<string, [number, number]> {
  const placements = new Map<string, [number, number]>();
  const occupied: [number, number][] = [
    [PLAYER_SPAWN[0], PLAYER_SPAWN[2]],
    ...JUMP_PAD_POSITIONS.map(([x, , z]) => [x, z] as [number, number])
  ];
  const usableRadius = ISLAND_RADIUS - OUTER_MARGIN;

  [...tasks]
    .sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id))
    .forEach((task) => {
      const random = seededRandom(hashString(task.id));
      let chosen: [number, number] = [0, 0];
      for (let attempt = 0; attempt < PLACEMENT_ATTEMPTS; attempt++) {
        const angle = random() * Math.PI * 2;
        const radius = INNER_CLEAR_RADIUS + Math.sqrt(random()) * (usableRadius - INNER_CLEAR_RADIUS);
        const candidate: [number, number] = [Math.cos(angle) * radius, Math.sin(angle) * radius];
        chosen = candidate;
        const isClear = occupied.every(([x, z]) => Math.hypot(candidate[0] - x, candidate[1] - z) >= MIN_RELIC_SPACING);
        if (isClear) break;
      }
      occupied.push(chosen);
      placements.set(task.id, chosen);
    });

  return placements;
}
