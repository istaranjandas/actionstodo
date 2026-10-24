// The desktop details slate: floats beside the day slate while its lantern is ringed in the world.
// It keeps the last task it was given so the panel can animate out with its content still in place.
import { TaskInspector } from './TaskInspector';
import { usePresence } from '../hooks/usePresence';
import { usePreservedValue } from '../hooks/usePreservedValue';
import type { Task } from '../types';

interface InspectorSlateProps {
  task: Task | null;
  onClose: () => void;
}

export function InspectorSlate({ task, onClose }: InspectorSlateProps) {
  const lastTask = usePreservedValue(task);
  const { isMounted, isClosing } = usePresence(Boolean(task), 200);
  if (!isMounted || !lastTask) return null;
  return (
    <div className="inspector-slate">
      <TaskInspector key={lastTask.id} task={lastTask} isClosing={isClosing} onClose={onClose} />
    </div>
  );
}
