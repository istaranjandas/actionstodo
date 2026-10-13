import { useMemo, useRef } from 'react';
import { QuestRelic } from './QuestRelic';
import { layoutRelics, relicStatusFor } from './relicLayout';
import { getLocalISODate } from '../../modules/dateUtils';
import type { Task } from '../../types';

interface QuestRelicsProps {
  tasks: Task[];
  animate: boolean;
  celebrate: boolean;
  onCompleteQuest: (taskId: string) => void;
}

export function QuestRelics({ tasks, animate, celebrate, onCompleteQuest }: QuestRelicsProps) {
  const arenaOpenedAt = useRef(Date.now());
  const placements = useMemo(() => layoutRelics(tasks), [tasks]);
  const today = getLocalISODate();

  return (
    <>
      {tasks.map((task) => (
        <QuestRelic
          key={task.id}
          task={task}
          status={relicStatusFor(task, today)}
          spawn={placements.get(task.id) ?? [0, 0]}
          dropFromSky={task.createdAt > arenaOpenedAt.current}
          animate={animate}
          celebrate={celebrate}
          onCompleteQuest={onCompleteQuest}
        />
      ))}
    </>
  );
}
