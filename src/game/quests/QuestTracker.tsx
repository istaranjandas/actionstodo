import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { gameInput } from '../input/gameInput';
import { arenaRuntime, publishQuestSignals } from '../state/arenaRuntime';
import type { QuestBeacon } from '../state/arenaRuntime';
import { relicStatusFor } from './relicLayout';
import type { Task } from '../../types';

interface QuestTrackerProps {
  tasks: Task[];
  onCompleteQuest: (taskId: string) => void;
}

export const QUEST_INTERACT_RADIUS = 2.6;
const QUEST_LOG_SIZE = 5;
const PUBLISH_INTERVAL_SECONDS = 0.2;
const MAX_VERTICAL_REACH = 2.4;

export function QuestTracker({ tasks, onCompleteQuest }: QuestTrackerProps) {
  const tasksById = useRef(new Map<string, Task>());
  const lastPublishedAt = useRef(0);
  const lastFocusedId = useRef<string | null>(null);

  useEffect(() => {
    tasksById.current = new Map(tasks.map((task) => [task.id, task]));
  }, [tasks]);

  useEffect(
    () => () => {
      arenaRuntime.focusedTaskId = null;
      publishQuestSignals({ nearestInRange: null, questLog: [] });
    },
    []
  );

  useFrame((state) => {
    const player = arenaRuntime.player;
    if (!player) return;
    const playerPosition = player.translation();
    const beacons: (QuestBeacon & { verticalGap: number })[] = [];

    arenaRuntime.relics.forEach((body, taskId) => {
      const task = tasksById.current.get(taskId);
      if (!task || task.completed) return;
      const relicPosition = body.translation();
      beacons.push({
        taskId,
        text: task.text,
        distance: Math.hypot(relicPosition.x - playerPosition.x, relicPosition.z - playerPosition.z),
        isUrgent: relicStatusFor(task) === 'urgent',
        verticalGap: Math.abs(relicPosition.y - playerPosition.y)
      });
    });
    beacons.sort((a, b) => a.distance - b.distance);

    const closest = beacons[0];
    const nearestInRange = closest && closest.distance <= QUEST_INTERACT_RADIUS && closest.verticalGap <= MAX_VERTICAL_REACH ? closest : null;
    arenaRuntime.focusedTaskId = nearestInRange?.taskId ?? null;

    if (gameInput.interactRequested) {
      gameInput.interactRequested = false;
      if (nearestInRange) onCompleteQuest(nearestInRange.taskId);
    }

    const focusChanged = lastFocusedId.current !== arenaRuntime.focusedTaskId;
    if (!focusChanged && state.clock.elapsedTime - lastPublishedAt.current < PUBLISH_INTERVAL_SECONDS) return;
    lastPublishedAt.current = state.clock.elapsedTime;
    lastFocusedId.current = arenaRuntime.focusedTaskId;

    const toBeacon = ({ taskId, text, distance, isUrgent }: QuestBeacon): QuestBeacon => ({ taskId, text, distance: Math.round(distance), isUrgent });
    publishQuestSignals({
      nearestInRange: nearestInRange ? toBeacon(nearestInRange) : null,
      questLog: beacons.slice(0, QUEST_LOG_SIZE).map(toBeacon)
    });
  });

  return null;
}
