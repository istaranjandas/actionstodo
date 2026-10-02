// Week Matrix Schedule Table View
import { getLocalISODate, getWeekDates, formatWeekRangeLabel } from './dateUtils.js';
import { addMinutesToTime, formatTimeRangeDisplay } from './timeUtils.js';

export function renderWeekScheduleTable({
  container,
  tasks,
  weekOffset,
  onPrevWeek,
  onNextWeek,
  onThisWeek,
  onCellClick,
  onTaskClick
}) {
  const weekDates = getWeekDates(weekOffset);
  const today = getLocalISODate();
  const weekTasks = tasks.filter(t => weekDates.includes(t.date));

  // Extract unique time slots from week tasks
  const slotMap = new Map();
  let hasUntimed = false;

  weekTasks.forEach(t => {
    if (!t.startTime) {
      hasUntimed = true;
    } else {
      const end = t.endTime || addMinutesToTime(t.startTime, 30);
      const key = `${t.startTime}_${end}`;
      if (!slotMap.has(key)) {
        slotMap.set(key, {
          startTime: t.startTime,
          endTime: end,
          label: formatTimeRangeDisplay(t.startTime, end)
        });
      }
    }
  });

  const sortedSlots = Array.from(slotMap.values()).sort((a, b) => {
    return a.startTime.localeCompare(b.startTime);
  });

  if (hasUntimed) {
    sortedSlots.unshift({
      startTime: '',
      endTime: '',
      label: 'All Day'
    });
  }

  // 1st Row: Dates
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

  let matrixBodyHtml = '';

  if (sortedSlots.length === 0) {
    matrixBodyHtml = `
      <tr>
        <td colspan="8">
          <div class="empty-matrix-notice">No tasks scheduled for this week. Use the add bar above to create one.</div>
        </td>
      </tr>
    `;
  } else {
    matrixBodyHtml = sortedSlots.map(slot => {
      const cellsHtml = weekDates.map(dateStr => {
        const isToday = dateStr === today;
        const matchingTasks = weekTasks.filter(t => {
          if (t.date !== dateStr) return false;
          if (!slot.startTime) return !t.startTime;
          const tEnd = t.endTime || addMinutesToTime(t.startTime, 30);
          return t.startTime === slot.startTime && tEnd === slot.endTime;
        });

        let tasksContent = '';
        if (matchingTasks.length > 0) {
          tasksContent = `
            <div class="matrix-tasks-wrap">
              ${matchingTasks.map(t => `
                <div class="matrix-task-item ${t.completed ? 'is-completed' : ''}" data-id="${t.id}" title="${escapeHtml(t.text)}">
                  ${escapeHtml(t.text)}
                </div>
              `).join('')}
            </div>
          `;
        }

        return `
          <td class="matrix-cell ${isToday ? 'is-today-col' : ''}" data-date="${dateStr}" data-start="${slot.startTime}" data-end="${slot.endTime}">
            ${tasksContent}
          </td>
        `;
      }).join('');

      return `
        <tr>
          <th scope="row" class="matrix-time-col">${slot.label}</th>
          ${cellsHtml}
        </tr>
      `;
    }).join('');
  }

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
        </div>
      </div>

      <div class="week-table-scroll">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="matrix-time-header">Time Range</th>
              ${dateHeadersHtml}
            </tr>
          </thead>
          <tbody>
            ${matrixBodyHtml}
          </tbody>
        </table>
      </div>
    </div>
  `;

  // Navigation handlers
  const prevBtn = document.getElementById('weekPrevBtn');
  const nextBtn = document.getElementById('weekNextBtn');
  const thisWeekBtn = document.getElementById('weekThisWeekBtn');

  if (prevBtn && onPrevWeek) prevBtn.addEventListener('click', onPrevWeek);
  if (nextBtn && onNextWeek) nextBtn.addEventListener('click', onNextWeek);
  if (thisWeekBtn && onThisWeek) thisWeekBtn.addEventListener('click', onThisWeek);

  // Cell clicks
  container.querySelectorAll('.matrix-cell').forEach(cell => {
    cell.addEventListener('click', () => {
      if (onCellClick) {
        onCellClick(cell.dataset.date, cell.dataset.start, cell.dataset.end);
      }
    });
  });

  // Task item clicks
  container.querySelectorAll('.matrix-task-item').forEach(el => {
    el.addEventListener('click', (e) => {
      e.stopPropagation();
      if (onTaskClick) {
        onTaskClick(el.dataset.id);
      }
    });
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
