// Task operations with their feedback: sound, a light in the world and a confirmation toast.
// Persistence stays in store.ts; these wrappers only add acknowledgement around it.
import { addTask, deleteTaskItem, updateTaskItem } from './store';
import { formatShortDate } from './dateUtils';
import { formatTimeRangeDisplay, parseTimeFromText } from './timeUtils';
import { pushToast } from './toasts';
import { playUiSound } from '../audio/uiSounds';
import { emitWorldEvent } from '../world/worldEvents';
import type { Task } from '../types';

export function setTaskCompleted(task: Task, completed: boolean): void {
  playUiSound(completed ? 'complete' : 'reopen');
  void updateTaskItem(task.id, { completed });
  if (!completed) return;
  emitWorldEvent({ type: 'complete', taskId: task.id });
  pushToast({
    message: 'Task completed',
    detail: task.text,
    tone: 'success',
    actionLabel: 'Undo',
    onAction: () => {
      playUiSound('reopen');
      void updateTaskItem(task.id, { completed: false });
    }
  });
}

export async function logTask(text: string, date: string, startTime: string, endTime: string): Promise<void> {
  playUiSound('add');
  emitWorldEvent({ type: 'add' });
  await addTask(text, date, startTime, endTime);
  const when = startTime ? `${formatShortDate(date)} · ${formatTimeRangeDisplay(startTime, endTime)}` : formatShortDate(date);
  pushToast({ message: 'Task added', detail: `${text} — ${when}`, tone: 'neutral' });
}

export function removeTask(task: Task): void {
  playUiSound('remove');
  void deleteTaskItem(task.id);
  pushToast({ message: 'Task deleted', detail: task.text, tone: 'danger' });
}

export function moveTask(taskId: string, updates: Partial<Task>): void {
  playUiSound('drop');
  void updateTaskItem(taskId, updates);
}

// Same rules as inline editing: "at 3pm" in the text sets the time; an empty title deletes the task
export function renameTask(task: Task, newText: string): void {
  if (!newText) {
    removeTask(task);
    return;
  }
  if (newText === task.text) return;
  const parsed = parseTimeFromText(newText);
  if (parsed) void updateTaskItem(task.id, { text: parsed.cleanText, startTime: parsed.startTime, endTime: parsed.endTime });
  else void updateTaskItem(task.id, { text: newText });
}
