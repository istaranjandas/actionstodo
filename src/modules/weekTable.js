// Week Matrix Schedule Table View
// Full-screen hourly grid: days across the top, hours down the left.
// Supports add (click a cell), edit (double-click task text), complete (checkbox),
// delete (×), re-time (click time pill) and drag & drop between days/hours.
import { getLocalISODate, getWeekDates, formatWeekRangeLabel } from './dateUtils.js';
import { addMinutesToTime, formatTimeRangeDisplay, getDurationMinutes } from './timeUtils.js';

const DEFAULT_FIRST_HOUR = 7;
const DEFAULT_LAST_HOUR = 21;

export function renderWeekScheduleTable({
  container,
  tasks,
  weekOffset,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onExitTable,
  onAddTask,
  onToggleComplete,
  onEditText,
  onDeleteTask,
  onMoveTask,
  onTimeClick
}) {
  const weekDates = getWeekDates(weekOffset);
  const today = getLocalISODate();
  const weekTasks = tasks
    .filter(t => weekDates.includes(t.date))
    .sort((a, b) => (a.startTime || '').localeCompare(b.startTime || '') || (a.createdAt - b.createdAt));

  // Hour range: a sensible working day, stretched to include any task outside it
  let firstHour = DEFAULT_FIRST_HOUR;
  let lastHour = DEFAULT_LAST_HOUR;
  weekTasks.forEach(t => {
    if (!t.startTime) return;
    const h = parseInt(t.startTime.split(':')[0], 10);
    firstHour = Math.min(firstHour, h);
    lastHour = Math.max(lastHour, h);
  });

  // Row keys: '' = All day (untimed), otherwise 'HH'
  const rows = [{ key: '', label: 'All day' }];
  for (let h = firstHour; h <= lastHour; h++) {
    rows.push({ key: String(h).padStart(2, '0'), label: formatHourLabel(h) });
  }

  const dateHeadersHtml = weekDates.map(dateStr => {
    const parts = dateStr.split('-').map(Number);
    const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
    const dayName = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
    const monthDay = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const isToday = dateStr === today;

    return `
      <th class="matrix-date-header ${isToday ? 'is-today' : ''}">
        <span class="matrix-day-name">${dayName}</span>
        <span class="matrix-day-date">${monthDay}</span>
        ${isToday ? '<span class="today-tag">TODAY</span>' : ''}
      </th>
    `;
  }).join('');

  const bodyHtml = rows.map(row => {
    const cellsHtml = weekDates.map(dateStr => {
      const cellTasks = weekTasks.filter(t => {
        if (t.date !== dateStr) return false;
        if (!row.key) return !t.startTime;
        return Boolean(t.startTime) && t.startTime.slice(0, 2) === row.key;
      });

      return `
        <td class="matrix-cell ${dateStr === today ? 'is-today-col' : ''}" data-date="${dateStr}" data-hour="${row.key}">
          <div class="matrix-tasks-wrap">
            ${cellTasks.map(renderTaskChip).join('')}
          </div>
        </td>
      `;
    }).join('');

    return `
      <tr class="${row.key ? '' : 'matrix-allday-row'}">
        <th scope="row" class="matrix-time-col">${row.label}</th>
        ${cellsHtml}
      </tr>
    `;
  }).join('');

  // Keep the scroll position across re-renders (complete / edit / drop)
  const prevScroll = container.querySelector('.week-table-scroll');
  const prevScrollTop = prevScroll ? prevScroll.scrollTop : null;

  container.innerHTML = `
    <div class="week-table-container">
      <div class="week-table-header">
        <div class="week-table-title-group">
          <div class="week-date-nav">
            <button type="button" class="week-nav-btn" id="weekPrevBtn" title="Previous Week">‹</button>
            <span class="week-range-label" id="weekRangeLabel">${formatWeekRangeLabel(weekDates)}</span>
            <button type="button" class="week-nav-btn" id="weekNextBtn" title="Next Week">›</button>
            <button type="button" class="week-today-btn" id="weekThisWeekBtn">This Week</button>
          </div>
          <span class="week-table-hint">Click a cell to add · Double-click a task to edit · Drag to move</span>
        </div>
        <button type="button" class="toolbar-btn" id="weekExitBtn" title="Back to list view">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
          <span>List View</span>
        </button>
      </div>

      <div class="week-table-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="matrix-time-header">Time</th>
              ${dateHeadersHtml}
            </tr>
          </thead>
          <tbody>
            ${bodyHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;

  const scrollEl = container.querySelector('.week-table-scroll');
  // Lets the sticky "All day" row sit directly under the sticky day headers
  scrollEl.style.setProperty('--matrix-head-h', `${container.querySelector('.matrix-table thead').offsetHeight}px`);
  if (prevScrollTop !== null) {
    scrollEl.scrollTop = prevScrollTop;
  }

  // Navigation
  const bind = (id, fn) => {
    const el = document.getElementById(id);
    if (el && fn) el.addEventListener('click', fn);
  };
  bind('weekPrevBtn', onPrevWeek);
  bind('weekNextBtn', onNextWeek);
  bind('weekThisWeekBtn', onThisWeek);
  bind('weekExitBtn', onExitTable);

  const findTask = (id) => tasks.find(t => t.id === id);

  // Cells: click empty space to add, and accept dropped tasks
  container.querySelectorAll('.matrix-cell').forEach(cell => {
    cell.addEventListener('click', (e) => {
      if (e.target.closest('.matrix-task-item, .matrix-add-input')) return;
      openInlineAdd(cell, onAddTask);
    });

    cell.addEventListener('dragover', (e) => {
      if (!e.dataTransfer.types.includes('text/task-id')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      cell.classList.add('is-drop-target');
    });

    cell.addEventListener('dragleave', (e) => {
      if (!cell.contains(e.relatedTarget)) cell.classList.remove('is-drop-target');
    });

    cell.addEventListener('drop', (e) => {
      e.preventDefault();
      cell.classList.remove('is-drop-target');
      const task = findTask(e.dataTransfer.getData('text/task-id'));
      if (!task || !onMoveTask) return;

      const { date, hour } = cell.dataset;
      let start = '';
      let end = '';
      if (hour) {
        const minutes = task.startTime ? task.startTime.slice(3, 5) : '00';
        const duration = task.startTime ? getDurationMinutes(task.startTime, task.endTime || addMinutesToTime(task.startTime, 30)) : 30;
        start = `${hour}:${minutes}`;
        end = addMinutesToTime(start, duration);
      }

      if (task.date === date && (task.startTime || '') === start) return;
      onMoveTask(task.id, date, start, end);
    });
  });

  // Task chips
  container.querySelectorAll('.matrix-task-item').forEach(chip => {
    const taskId = chip.dataset.id;
    const task = findTask(taskId);
    if (!task) return;

    chip.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/task-id', taskId);
      e.dataTransfer.effectAllowed = 'move';
      requestAnimationFrame(() => chip.classList.add('is-dragging'));
    });
    chip.addEventListener('dragend', () => {
      chip.classList.remove('is-dragging');
      container.querySelectorAll('.is-drop-target').forEach(c => c.classList.remove('is-drop-target'));
    });

    const checkbox = chip.querySelector('.matrix-task-check');
    checkbox.addEventListener('change', () => {
      if (onToggleComplete) onToggleComplete(taskId, checkbox.checked);
    });

    chip.querySelector('.matrix-task-del').addEventListener('click', (e) => {
      e.stopPropagation();
      if (onDeleteTask) onDeleteTask(taskId);
    });

    const timeBtn = chip.querySelector('.matrix-task-time');
    if (timeBtn) {
      timeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onTimeClick) onTimeClick(timeBtn, task);
      });
    }

    // Inline text editing
    const textEl = chip.querySelector('.matrix-task-text');
    let cancelled = false;
    textEl.addEventListener('dblclick', (e) => {
      e.stopPropagation();
      if (textEl.isContentEditable) return;
      cancelled = false;
      chip.draggable = false;
      chip.classList.add('is-editing');
      textEl.contentEditable = 'true';
      textEl.focus();
      placeCaretAtEnd(textEl);
    });
    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        textEl.blur();
      } else if (e.key === 'Escape') {
        cancelled = true;
        textEl.textContent = task.text;
        textEl.blur();
      }
    });
    textEl.addEventListener('blur', () => {
      textEl.contentEditable = 'false';
      chip.draggable = true;
      chip.classList.remove('is-editing');
      if (cancelled) return;
      const newText = textEl.textContent.trim();
      if (newText !== task.text && onEditText) onEditText(taskId, newText);
    });
  });

  // First render of a week: start near the working day / current hour
  if (prevScrollTop === null) {
    const nowHour = new Date().getHours();
    const targetHour = weekDates.includes(today) ? Math.max(firstHour, nowHour - 1) : DEFAULT_FIRST_HOUR + 1;
    const targetRow = container.querySelector(`.matrix-cell[data-hour="${String(targetHour).padStart(2, '0')}"]`);
    const allDayRow = container.querySelector('.matrix-allday-row');
    const header = container.querySelector('.matrix-table thead');
    if (targetRow && allDayRow && header) {
      const offset = targetRow.parentElement.offsetTop - header.offsetHeight - allDayRow.offsetHeight;
      scrollEl.scrollTop = Math.max(0, offset);
    }
  }
}

function renderTaskChip(t) {
  const timeLabel = t.startTime ? formatTimeRangeDisplay(t.startTime, t.endTime) : '';
  return `
    <div class="matrix-task-item ${t.completed ? 'is-completed' : ''}" data-id="${t.id}" draggable="true">
      <input type="checkbox" class="matrix-task-check" ${t.completed ? 'checked' : ''} aria-label="Toggle completed" />
      <div class="matrix-task-body">
        <span class="matrix-task-text" spellcheck="false" title="Double-click to edit">${escapeHtml(t.text)}</span>
        ${timeLabel ? `<button type="button" class="matrix-task-time" title="Change time">${timeLabel}</button>` : ''}
      </div>
      <button type="button" class="matrix-task-del" title="Delete task" aria-label="Delete task">&times;</button>
    </div>
  `;
}

function openInlineAdd(cell, onAddTask) {
  if (cell.querySelector('.matrix-add-input')) return;
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'matrix-add-input';
  input.placeholder = 'New task…';
  input.autocomplete = 'off';
  cell.querySelector('.matrix-tasks-wrap').appendChild(input);
  input.focus();

  let done = false;
  const finish = (save) => {
    if (done) return;
    done = true;
    const text = input.value.trim();
    input.remove();
    if (!save || !text || !onAddTask) return;
    const { date, hour } = cell.dataset;
    const start = hour ? `${hour}:00` : '';
    const end = hour ? addMinutesToTime(start, 30) : '';
    onAddTask(text, date, start, end);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      finish(true);
    } else if (e.key === 'Escape') {
      finish(false);
    }
  });
  input.addEventListener('blur', () => finish(true));
}

function formatHourLabel(h) {
  const period = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12} ${period}`;
}

function placeCaretAtEnd(el) {
  const range = document.createRange();
  range.selectNodeContents(el);
  range.collapse(false);
  const sel = window.getSelection();
  sel.removeAllRanges();
  sel.addRange(range);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
