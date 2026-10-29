// Task operations with their feedback: sound, a light in the world and a confirmation toast.
// Persistence stays in store.ts; these wrappers only add acknowledgement around it.
import { addTask, deleteTaskItem, setTaskRepeat, updateTaskItem } from './store';
import { formatShortDate } from './dateUtils';
import { formatTimeRangeDisplay, parseTimeFromText } from './timeUtils';
import { repeatRuleLabel } from './recurrence';
import { pushToast } from './toasts';
import { playUiSound } from '../audio/uiSounds';
import { emitWorldEvent } from '../world/worldEvents';
import type { RepeatRule, Task } from '../types';

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

export async function logTask(
  text: string,
  date: string,
  startTime: string,
  endTime: string,
  repeat?: RepeatRule
): Promise<void> {
  playUiSound('add');
  emitWorldEvent({ type: 'add' });
  await addTask(text, date, startTime, endTime, repeat);
  const when = startTime ? `${formatShortDate(date)} · ${formatTimeRangeDisplay(startTime, endTime)}` : formatShortDate(date);
  const repeatNote = repeat ? ` · ${repeatRuleLabel(repeat)}` : '';
  pushToast({
    message: repeat ? 'Repeating task added' : 'Task added',
    detail: `${text} — ${when}${repeatNote}`,
    tone: repeat ? 'success' : 'neutral'
  });
}

export function removeTask(task: Task): void {
  playUiSound('remove');
  void deleteTaskItem(task.id);
  if (task.repeat) {
    pushToast({ message: 'Series deleted', detail: `${task.text} · future days removed`, tone: 'danger' });
  } else if (task.isOccurrence) {
    pushToast({ message: 'Day deleted', detail: `${task.text} · this day only`, tone: 'danger' });
  } else {
    pushToast({ message: 'Task deleted', detail: task.text, tone: 'danger' });
  }
}

/** Change the schedule of a series. Past days and completed work are left untouched. */
export function changeTaskRepeat(task: Task, rule?: RepeatRule, until = ''): void {
  const target = task.isOccurrence && task.seriesId ? task.seriesId : task.id;
  const sameRule = task.repeat === rule;
  const sameUntil = rule ? (task.repeatUntil ?? '') === until : true;
  if (sameRule && sameUntil) return;

  playUiSound(rule ? 'toggleOn' : 'toggleOff');
  setTaskRepeat(target, rule, until);
  if (!rule) {
    pushToast({ message: 'Repeat removed', detail: task.text, tone: 'neutral' });
  } else {
    const untilNote = until ? ` · until ${formatShortDate(until)}` : '';
    pushToast({ message: 'Repeat updated', detail: `${task.text} — ${repeatRuleLabel(rule)}${untilNote}`, tone: 'success' });
  }
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
