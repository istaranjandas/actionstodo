// Sidebar Mini Calendar
// Month grid (Mon-first). Days with open tasks get a dot; clicking a day picks it.
import { getLocalISODate } from './dateUtils.js';

export function createMiniCalendar({ container, onPick }) {
  const now = new Date();
  let viewYear = now.getFullYear();
  let viewMonth = now.getMonth();
  let lastSelected = null;
  let lastArgs = { tasks: [], selected: null };

  container.addEventListener('click', (e) => {
    const nav = e.target.closest('[data-cal-nav]');
    if (nav) {
      viewMonth += Number(nav.dataset.calNav);
      if (viewMonth < 0) { viewMonth = 11; viewYear -= 1; }
      if (viewMonth > 11) { viewMonth = 0; viewYear += 1; }
      render(lastArgs);
      return;
    }
    const day = e.target.closest('[data-cal-date]');
    if (day && onPick) onPick(day.dataset.calDate);
  });

  function render({ tasks, selected }) {
    lastArgs = { tasks, selected };

    // Jump to the month of a newly picked date
    if (selected && selected !== lastSelected) {
      const [y, m] = selected.split('-').map(Number);
      viewYear = y;
      viewMonth = m - 1;
    }
    lastSelected = selected;

    const today = getLocalISODate();
    const openDates = new Set(tasks.filter(t => !t.completed && t.date).map(t => t.date));
    const first = new Date(viewYear, viewMonth, 1);
    const lead = (first.getDay() + 6) % 7; // Monday-first offset
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const title = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

    let cells = '';
    for (let i = 0; i < lead; i++) cells += '<span class="cal-cell is-empty"></span>';
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = getLocalISODate(new Date(viewYear, viewMonth, d));
      const cls = [
        'cal-cell',
        iso === today ? 'is-today' : '',
        iso === selected ? 'is-selected' : '',
        openDates.has(iso) ? 'has-tasks' : ''
      ].join(' ');
      cells += `<button type="button" class="${cls}" data-cal-date="${iso}">${d}</button>`;
    }

    container.innerHTML = `
      <div class="cal-head">
        <span class="cal-title">${title}</span>
        <div class="cal-nav">
          <button type="button" data-cal-nav="-1" aria-label="Previous month">‹</button>
          <button type="button" data-cal-nav="1" aria-label="Next month">›</button>
        </div>
      </div>
      <div class="cal-grid">
        ${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(w => `<span class="cal-weekday">${w}</span>`).join('')}
        ${cells}
      </div>
    `;
  }

  return { render };
}
