// Task Drag & Drop
// Drag a task from anywhere on its row: its own day, and any day card you hover, reveal time slots.
// Drop on a slot to set day + time (duration kept), or on a card or timeline bead to change only the day.
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

interface TaskDragOptions {
  getTask: (id: string) => Task | undefined;
  onMove: (taskId: string, updates: Partial<Task>) => void;
}

interface DragState {
  task: Task;
  row: HTMLElement | null;
  group: HTMLElement | null;
  overZone?: HTMLElement | null;
  overSlot?: HTMLElement | null;
}

const DROP_ZONE_SELECTOR = '[data-drop-date]';
const TASK_MIME = 'text/task-id';

// Drop zones live anywhere in the document: day cards in the feed, beads on the timeline ribbon.
// Any element with data-drop-date="YYYY-MM-DD" accepts a task; .date-group zones also offer time slots.
// Feed rows start drags here; other draggers (planner chips) only need to set the text/task-id payload.
export function setupTaskDragAndDrop({ getTask, onMove }: TaskDragOptions): () => void {
  let drag: DragState | null = null;
  const closestFrom = (target: EventTarget | null, selector: string) =>
    target instanceof Element ? (target.closest(selector) as HTMLElement | null) : null;

  const findZone = (target: EventTarget | null): HTMLElement | null => {
    const zone = closestFrom(target, DROP_ZONE_SELECTOR);
    return zone && /^\d{4}-\d{2}-\d{2}$/.test(zone.dataset.dropDate || '') ? zone : null;
  };

  const setHover = (zone: HTMLElement | null) => {
    if (!drag || drag.overZone === zone) return;
    drag.overZone?.classList.remove('is-drop-hover', 'is-drag-over');
    if (zone) {
      zone.classList.add('is-drop-hover');
      if (zone.classList.contains('date-group')) zone.classList.add('is-drag-over');
    }
    drag.overZone = zone;
  };

  const setSlot = (slot: HTMLElement | null) => {
    if (!drag || drag.overSlot === slot) return;
    drag.overSlot?.classList.remove('is-drop-target');
    slot?.classList.add('is-drop-target');
    drag.overSlot = slot;
  };

  // Rows are draggable from anywhere; a row being text-edited (double-click) is not
  const handleDragStart = (e: DragEvent) => {
    if (!e.dataTransfer) return;
    const row = closestFrom(e.target, '.date-groups .task-row');
    let task: Task | undefined;
    let group: HTMLElement | null = null;

    if (row) {
      if (!row.draggable || row.classList.contains('is-editing')) {
        e.preventDefault();
        return;
      }
      task = getTask(row.dataset.id || '');
      group = row.closest('.date-group');
      if (!task) return;
      e.dataTransfer.setData(TASK_MIME, task.id);
      e.dataTransfer.effectAllowed = 'move';
    } else {
      // Another surface (the planner) already put its task on the payload
      task = getTask(e.dataTransfer.getData(TASK_MIME));
      if (!task) return;
    }

    drag = { task, row, group };

    // Change layout on the next frame; doing it synchronously can cancel the drag
    requestAnimationFrame(() => {
      if (!drag) return;
      document.body.classList.add('is-dragging-task');
      row?.classList.add('is-dragging');
      group?.classList.add('is-drag-source');
      if (group && task.startTime) {
        group.querySelector(`.drop-slot[data-start="${task.startTime}"]`)?.classList.add('is-current');
      }
    });
  };

  const handleDragOver = (e: DragEvent) => {
    if (!drag) return;
    const zone = findZone(e.target);
    setHover(zone);
    if (!zone) {
      setSlot(null);
      return;
    }
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    // Time slots only count inside the hovered day card
    const slot = closestFrom(e.target, '.drop-slot');
    setSlot(slot && zone.contains(slot) ? slot : null);
  };

  const handleDrop = (e: DragEvent) => {
    if (!drag) return;
    const zone = findZone(e.target);
    if (!zone) return;
    const slot = closestFrom(e.target, '.drop-slot');
    const { task } = drag;
    const date = zone.dataset.dropDate as string;
    e.preventDefault();
    // The dragged row is re-rendered by onMove, so its dragend may never arrive
    endDrag();

    if (slot && zone.contains(slot)) {
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
      drag.row?.classList.remove('is-dragging');
      drag.group?.classList.remove('is-drag-source');
    }
    document.body.classList.remove('is-dragging-task');
    document.querySelectorAll('.is-drop-hover, .is-drag-over').forEach(el => el.classList.remove('is-drop-hover', 'is-drag-over'));
    document.querySelectorAll('.is-drop-target, .drop-slot.is-current').forEach(el => el.classList.remove('is-drop-target', 'is-current'));
    drag = null;
  }

  document.addEventListener('dragstart', handleDragStart);
  document.addEventListener('dragover', handleDragOver);
  document.addEventListener('drop', handleDrop);
  document.addEventListener('dragend', endDrag);

  return () => {
    endDrag();
    document.removeEventListener('dragstart', handleDragStart);
    document.removeEventListener('dragover', handleDragOver);
    document.removeEventListener('drop', handleDrop);
    document.removeEventListener('dragend', endDrag);
  };
}
