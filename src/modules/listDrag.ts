// List View Drag & Drop
// Drag a task from anywhere on its row: its own day, and any day card you hover, reveal time slots.
// Drop on a slot to set day + time (duration kept), or on a card to change only the day.
import { addMinutesToTime, getDurationMinutes } from './timeUtils';
import type { Task } from '../types';

const SLOT_FIRST_HOUR = 6;
const SLOT_LAST_HOUR = 22; // last slot starts at 22:30
const SLOT_MINUTES = 30;

const toMinutes = (t: string) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

export function taskDuration(task: Task): number {
  return task.startTime
    ? getDurationMinutes(task.startTime, task.endTime || addMinutesToTime(task.startTime, 30))
    : 30;
}

export interface DropSlot {
  start: string;
  isBusy: boolean;
}

// Hidden slot grid for one day group (shown via CSS only for the dragged task's day)
export function getDropSlots(groupTasks: Task[]): DropSlot[] {
  const busy = groupTasks
    .filter(t => t.startTime)
    .map(t => [toMinutes(t.startTime), toMinutes(t.startTime) + taskDuration(t)]);

  const slots: DropSlot[] = [];
  for (let mins = SLOT_FIRST_HOUR * 60; mins <= SLOT_LAST_HOUR * 60 + 30; mins += SLOT_MINUTES) {
    const start = `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
    const isBusy = busy.some(([s, e]) => mins < e && mins + SLOT_MINUTES > s);
    slots.push({ start, isBusy });
  }
  return slots;
}

interface ListDragOptions {
  container: HTMLElement;
  getTask: (id: string) => Task | undefined;
  onMove: (taskId: string, updates: Partial<Task>) => void;
}

interface DragState {
  task: Task;
  row: HTMLElement;
  group: HTMLElement;
  overGroup?: HTMLElement;
  overSlot?: HTMLElement | null;
}

export function setupListDragAndDrop({ container, getTask, onMove }: ListDragOptions): () => void {
  let drag: DragState | null = null;
  const closestFrom = (target: EventTarget | null, selector: string) =>
    target instanceof Element ? (target.closest(selector) as HTMLElement | null) : null;

  // Rows are draggable from anywhere; a row being text-edited (double-click) is not
  const handleDragStart = (e: DragEvent) => {
    const row = closestFrom(e.target, '.task-row');
    if (!row || !row.draggable) return;
    if (row.classList.contains('is-editing')) {
      e.preventDefault();
      return;
    }
    const task = getTask(row.dataset.id || '');
    const group = row.closest('.date-group') as HTMLElement | null;
    if (!task || !group || !e.dataTransfer) return;

    e.dataTransfer.setData('text/task-id', task.id);
    e.dataTransfer.effectAllowed = 'move';
    drag = { task, row, group };

    // Change layout on the next frame; doing it synchronously can cancel the drag
    requestAnimationFrame(() => {
      if (!drag) return;
      row.classList.add('is-dragging');
      group.classList.add('is-drag-source');
      if (task.startTime) {
        const current = group.querySelector(`.drop-slot[data-start="${task.startTime}"]`);
        if (current) current.classList.add('is-current');
      }
    });
  };

  const isDroppableGroup = (g: HTMLElement | null): g is HTMLElement =>
    Boolean(g && g.dataset.date && g.dataset.date !== 'Undated');

  const handleDragOver = (e: DragEvent) => {
    if (!drag) return;
    const group = closestFrom(e.target, '.date-group');
    if (!isDroppableGroup(group)) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';

    // Hovered day card reveals its own slots
    if (drag.overGroup !== group) {
      if (drag.overGroup) drag.overGroup.classList.remove('is-drag-over');
      group.classList.add('is-drag-over');
      drag.overGroup = group;
    }

    const slot = closestFrom(e.target, '.drop-slot');
    if (slot !== drag.overSlot) {
      if (drag.overSlot) drag.overSlot.classList.remove('is-drop-target');
      if (slot) slot.classList.add('is-drop-target');
      drag.overSlot = slot;
    }
  };

  const handleDrop = (e: DragEvent) => {
    if (!drag) return;
    const group = closestFrom(e.target, '.date-group');
    if (!isDroppableGroup(group)) return;
    const slot = closestFrom(e.target, '.drop-slot');
    const { task } = drag;
    const date = group.dataset.date as string;
    e.preventDefault();
    // The dragged row is re-rendered by onMove, so its dragend may never bubble here
    endDrag();

    if (slot) {
      const start = slot.dataset.start as string;
      if (task.date !== date || task.startTime !== start) {
        onMove(task.id, { date, startTime: start, endTime: addMinutesToTime(start, taskDuration(task)) });
      }
    } else if (task.date !== date) {
      onMove(task.id, { date });
    }
  };

  function endDrag() {
    if (drag) {
      drag.row.classList.remove('is-dragging');
      drag.group.classList.remove('is-drag-source');
      container.querySelectorAll('.is-drag-over').forEach(el => el.classList.remove('is-drag-over'));
      container.querySelectorAll('.is-drop-target, .is-current').forEach(el => el.classList.remove('is-drop-target', 'is-current'));
    }
    drag = null;
  }

  container.addEventListener('dragstart', handleDragStart);
  container.addEventListener('dragover', handleDragOver);
  container.addEventListener('drop', handleDrop);
  container.addEventListener('dragend', endDrag);

  return () => {
    container.removeEventListener('dragstart', handleDragStart);
    container.removeEventListener('dragover', handleDragOver);
    container.removeEventListener('drop', handleDrop);
    container.removeEventListener('dragend', endDrag);
  };
}
