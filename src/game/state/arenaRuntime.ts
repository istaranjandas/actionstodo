import { useSyncExternalStore } from 'react';
import type { RapierRigidBody } from '@react-three/rapier';

export type BurstKind = 'victory' | 'dust';

export interface BurstRequest {
  kind: BurstKind;
  x: number;
  y: number;
  z: number;
}

export const arenaRuntime = {
  player: null as RapierRigidBody | null,
  relics: new Map<string, RapierRigidBody>(),
  labelAnchors: new Map<string, HTMLElement>(),
  pendingBursts: [] as BurstRequest[],
  focusedTaskId: null as string | null,
  cameraYaw: 0,
  cameraDistance: 10
};

export function requestBurst(kind: BurstKind, position: { x: number; y: number; z: number }): void {
  arenaRuntime.pendingBursts.push({ kind, x: position.x, y: position.y, z: position.z });
}

export interface QuestBeacon {
  taskId: string;
  text: string;
  distance: number;
  isUrgent: boolean;
}

export interface QuestSignals {
  nearestInRange: QuestBeacon | null;
  questLog: QuestBeacon[];
}

let questSignals: QuestSignals = { nearestInRange: null, questLog: [] };
const questListeners = new Set<() => void>();

const beaconsMatch = (a: QuestBeacon[], b: QuestBeacon[]) =>
  a.length === b.length && a.every((beacon, index) => beacon.taskId === b[index].taskId && beacon.distance === b[index].distance && beacon.text === b[index].text);

export function publishQuestSignals(next: QuestSignals): void {
  const sameNearest = questSignals.nearestInRange?.taskId === next.nearestInRange?.taskId;
  if (sameNearest && beaconsMatch(questSignals.questLog, next.questLog)) return;
  questSignals = next;
  questListeners.forEach((listener) => listener());
}

export function useQuestSignals(): QuestSignals {
  return useSyncExternalStore(
    (listener) => {
      questListeners.add(listener);
      return () => questListeners.delete(listener);
    },
    () => questSignals,
    () => questSignals
  );
}
