// Main Application Bootstrapper & UI Coordinator
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase.js';
import { getLocalISODate, formatShortDate, formatFriendlyDate } from './modules/dateUtils.js';
import { addMinutesToTime, formatTimeRangeDisplay, parseTimeFromText, getNextSmartSlot } from './modules/timeUtils.js';
import { 
  state, 
  getFilteredTasks, 
  sortTaskList, 
  addTask, 
  updateTaskItem, 
  deleteTaskItem, 
  clearCompletedTasks, 
  initFirestoreSync, 
  stopFirestoreSync, 
  THEME_KEY, 
  TITLE_KEY
} from './modules/store.js';
import { setupTimePopover } from './modules/timePopover.js';
import { renderWeekScheduleTable } from './modules/weekTable.js';
import { setupListDragAndDrop, renderDropSlotsHtml } from './modules/listDrag.js';
import { createMiniCalendar } from './modules/miniCalendar.js';
import { getWeekDates } from './modules/dateUtils.js';

// DOM Elements
const dateGroupsContainer = document.getElementById('dateGroupsContainer');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const authUserWrap = document.getElementById('authUserWrap');
const userDisplayName = document.getElementById('userDisplayName');
const googleSignOutBtn = document.getElementById('googleSignOutBtn');

const quickAddForm = document.getElementById('quickAddForm');
const quickAddInput = document.getElementById('quickAddInput');
const quickAddSaveBtn = document.getElementById('quickAddSaveBtn');
const quickAddDateLabel = document.getElementById('quickAddDateLabel');
const quickAddDateInput = document.getElementById('quickAddDateInput');
const quickAddTimeBtn = document.getElementById('quickAddTimeBtn');
const quickAddTimeLabel = document.getElementById('quickAddTimeLabel');
const clearQuickTimeBtn = document.getElementById('clearQuickTimeBtn');


const weekTableBtn = document.getElementById('weekTableBtn');
const weekTableBtnLabel = document.getElementById('weekTableBtnLabel');
const weekTableBtnIcon = document.getElementById('weekTableBtnIcon');

const dateFilterInput = document.getElementById('dateFilterInput');
const dateFilterLabel = document.getElementById('dateFilterLabel');
const clearDateFilterBtn = document.getElementById('clearDateFilterBtn');
const filterDropdownWrap = document.getElementById('filterDropdownWrap');
const filterDropdownBtn = document.getElementById('filterDropdownBtn');
const filterBtnLabel = document.getElementById('filterBtnLabel');
const filterMenuItems = document.querySelectorAll('.filter-menu-item');
const themeToggle = document.getElementById('themeToggle');

let currentWeekOffset = 0;

// --- Theme Management ---
function updateThemeIcon(theme) {
  if (!themeToggle) return;
  if (theme === 'dark') {
    themeToggle.setAttribute('title', 'Switch to Light Mode');
    themeToggle.setAttribute('aria-label', 'Switch to Light Mode');
    themeToggle.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="12" cy="12" r="5"></circle>
        <line x1="12" y1="1" x2="12" y2="3"></line>
        <line x1="12" y1="21" x2="12" y2="23"></line>
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line>
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line>
        <line x1="1" y1="12" x2="3" y2="12"></line>
        <line x1="21" y1="12" x2="23" y2="12"></line>
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line>
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line>
      </svg>
    `;
  } else {
    themeToggle.setAttribute('title', 'Switch to Dark Mode');
    themeToggle.setAttribute('aria-label', 'Switch to Dark Mode');
    themeToggle.innerHTML = `
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
      </svg>
    `;
  }
}

function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  let activeTheme = 'light';
  if (savedTheme) {
    activeTheme = savedTheme;
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    activeTheme = 'dark';
  }
  document.documentElement.setAttribute('data-theme', activeTheme);
  updateThemeIcon(activeTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon(next);
}

if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

// --- Time Popover Setup ---
const popover = setupTimePopover({
  getState: () => state,
  onTimeApplied: (start, end, context) => {
    if (context.type === 'quick') {
      state.selectedAddStart = start;
      state.selectedAddEnd = end;
      updateQuickAddTimeDisplay();
    } else if (context.type === 'task') {
      updateTaskItem(context.taskId, { startTime: start, endTime: end });
      renderTasks();
    }
  }
});

// --- Quick Add Time & Date Helpers ---
function updateQuickAddDateDisplay() {
  quickAddDateLabel.textContent = formatShortDate(state.selectedAddDate);
  quickAddDateInput.value = state.selectedAddDate;
}

if (quickAddDateInput) {
  quickAddDateInput.addEventListener('change', (e) => {
    if (e.target.value) {
      state.selectedAddDate = e.target.value;
      updateQuickAddDateDisplay();
    }
  });
}

function updateQuickAddTimeDisplay() {
  const parsed = parseTimeFromText(quickAddInput.value);
  if (parsed) {
    quickAddTimeLabel.innerHTML = `✨ ${formatTimeRangeDisplay(parsed.startTime, parsed.endTime)}`;
    quickAddTimeBtn.classList.add('is-active');
    clearQuickTimeBtn.style.display = 'inline-flex';
  } else if (state.selectedAddStart) {
    quickAddTimeLabel.textContent = formatTimeRangeDisplay(state.selectedAddStart, state.selectedAddEnd);
    quickAddTimeBtn.classList.add('is-active');
    clearQuickTimeBtn.style.display = 'inline-flex';
  } else {
    const autoSlot = getNextSmartSlot(state.selectedAddDate, state.tasks);
    quickAddTimeLabel.textContent = formatTimeRangeDisplay(autoSlot.startTime, autoSlot.endTime);
    quickAddTimeBtn.classList.remove('is-active');
    clearQuickTimeBtn.style.display = 'none';
  }
}

quickAddInput.addEventListener('input', updateQuickAddTimeDisplay);

clearQuickTimeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  state.selectedAddStart = '';
  state.selectedAddEnd = '';
  updateQuickAddTimeDisplay();
});

quickAddTimeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  popover.openTimePopover(quickAddTimeBtn, state.selectedAddStart, state.selectedAddEnd, { type: 'quick' });
});

// Quick Add Submit (Supports tap button, mobile keyboard Done/Go, and Enter key)
async function handleQuickAddSubmit(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  const rawVal = quickAddInput.value.trim();
  if (!rawVal) return;

  const parsed = parseTimeFromText(rawVal);
  const text = parsed ? parsed.cleanText : rawVal;
  const start = parsed ? parsed.startTime : state.selectedAddStart;
  const end = parsed ? parsed.endTime : state.selectedAddEnd;

  await addTask(text, state.selectedAddDate, start, end);
  quickAddInput.value = '';
  state.selectedAddStart = '';
  state.selectedAddEnd = '';
  updateQuickAddTimeDisplay();
  renderTasks();
}

if (quickAddForm) {
  quickAddForm.addEventListener('submit', handleQuickAddSubmit);
}

quickAddInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    handleQuickAddSubmit(e);
  }
});

if (quickAddSaveBtn) {
  quickAddSaveBtn.addEventListener('click', handleQuickAddSubmit);
}

// --- View Mode & Table Toggle ---
export function isNonDesktopDevice() {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(max-width: 1024px), (hover: none) and (pointer: coarse)').matches;
}

function updateViewModeDisplay() {
  if (isNonDesktopDevice()) {
    state.isTableView = false;
  }
  // Table view is full-screen: CSS hides the toolbar and quick-add box
  document.body.classList.toggle('is-table-view', state.isTableView);
  if (!weekTableBtn) return;
  if (state.isTableView) {
    weekTableBtn.classList.add('active');
    if (weekTableBtnLabel) weekTableBtnLabel.textContent = 'List View';
    if (weekTableBtnIcon) {
      weekTableBtnIcon.innerHTML = `
        <line x1="3" y1="6" x2="21" y2="6"></line>
        <line x1="3" y1="12" x2="21" y2="12"></line>
        <line x1="3" y1="18" x2="21" y2="18"></line>
      `;
    }
  } else {
    weekTableBtn.classList.remove('active');
    if (weekTableBtnLabel) weekTableBtnLabel.textContent = 'Week Table';
    if (weekTableBtnIcon) {
      weekTableBtnIcon.innerHTML = `
        <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
        <line x1="3" y1="9" x2="21" y2="9"></line>
        <line x1="3" y1="15" x2="21" y2="15"></line>
        <line x1="9" y1="3" x2="9" y2="21"></line>
        <line x1="15" y1="3" x2="15" y2="21"></line>
      `;
    }
  }
  updateFilterDisplay();
}

if (weekTableBtn) {
  weekTableBtn.addEventListener('click', () => {
    if (isNonDesktopDevice()) return;
    state.isTableView = !state.isTableView;
    updateViewModeDisplay();
    renderTasks();
  });
}

window.addEventListener('resize', () => {
  if (isNonDesktopDevice() && state.isTableView) {
    state.isTableView = false;
    updateViewModeDisplay();
    renderTasks();
  }
});

document.addEventListener('click', (e) => {
  if (filterDropdownWrap && !filterDropdownWrap.contains(e.target)) {
    filterDropdownWrap.classList.remove('open');
  }
});

// --- Filter Dropdown Navigation ---
function updateFilterDisplay() {
  filterMenuItems.forEach(item => {
    const isMatch = !state.isTableView && !state.specificDateFilter && item.dataset.view === state.currentView;
    if (isMatch) {
      item.classList.add('active');
      const icon = item.querySelector('.filter-item-icon');
      if (icon) icon.textContent = '✓';
    } else {
      item.classList.remove('active');
      const icon = item.querySelector('.filter-item-icon');
      if (icon) icon.textContent = '';
    }
  });

  if (state.isTableView) {
    filterBtnLabel.textContent = 'Filter';
    filterDropdownBtn.classList.remove('active');
    if (dateFilterLabel) dateFilterLabel.textContent = 'Pick date';
  } else if (state.specificDateFilter) {
    filterBtnLabel.textContent = `Filter: ${formatShortDate(state.specificDateFilter)}`;
    filterDropdownBtn.classList.add('active');
    if (dateFilterLabel) dateFilterLabel.textContent = formatShortDate(state.specificDateFilter);
  } else if (state.currentView !== 'all') {
    const viewLabels = {
      today: 'Today',
      'this-week': 'This Week',
      upcoming: 'Upcoming',
      completed: 'Completed'
    };
    filterBtnLabel.textContent = `Filter: ${viewLabels[state.currentView] || state.currentView}`;
    filterDropdownBtn.classList.add('active');
    if (dateFilterLabel) dateFilterLabel.textContent = 'Pick date';
  } else {
    filterBtnLabel.textContent = 'Filter';
    filterDropdownBtn.classList.remove('active');
    if (dateFilterLabel) dateFilterLabel.textContent = 'Pick date';
  }

  if (clearDateFilterBtn) {
    clearDateFilterBtn.style.display = (!state.isTableView && state.specificDateFilter) ? 'inline-flex' : 'none';
  }

  updateViewTitle();
}

// --- Main pane title & sidebar ---
const viewTitleEl = document.getElementById('viewTitle');
const viewSubtitleEl = document.getElementById('viewSubtitle');
const VIEW_TITLES = {
  all: 'All dates',
  today: 'Today',
  'this-week': 'This week',
  upcoming: 'Upcoming',
  completed: 'Completed'
};

function updateViewTitle() {
  if (!viewTitleEl) return;
  if (state.specificDateFilter) {
    const { title, sub } = formatFriendlyDate(state.specificDateFilter);
    viewTitleEl.textContent = title;
    viewSubtitleEl.textContent = sub;
  } else {
    viewTitleEl.textContent = VIEW_TITLES[state.currentView] || 'Tasks';
    viewSubtitleEl.textContent = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
}

const miniCalendarEl = document.getElementById('miniCalendar');
const miniCalendar = miniCalendarEl
  ? createMiniCalendar({
      container: miniCalendarEl,
      onPick: (dateStr) => setDateFilter(dateStr === state.specificDateFilter ? null : dateStr)
    })
  : null;

const sidebarCounts = {
  countAll: () => true,
  countToday: (t, today) => t.date === today,
  countWeek: (t, today, week) => t.date >= week[0] && t.date <= week[6],
  countUpcoming: (t, today) => t.date >= today
};

function updateSidebar() {
  const today = getLocalISODate();
  const week = getWeekDates(0);
  const open = state.tasks.filter(t => !t.completed);
  Object.entries(sidebarCounts).forEach(([id, match]) => {
    const el = document.getElementById(id);
    if (!el) return;
    const n = open.filter(t => match(t, today, week)).length;
    el.textContent = n ? String(n) : '';
  });
  const doneEl = document.getElementById('countCompleted');
  if (doneEl) {
    const n = state.tasks.length - open.length;
    doneEl.textContent = n ? String(n) : '';
  }
  if (miniCalendar) miniCalendar.render({ tasks: state.tasks, selected: state.specificDateFilter });
}

filterDropdownBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  filterDropdownWrap.classList.toggle('open');
});

filterMenuItems.forEach(btn => {
  btn.addEventListener('click', () => {
    state.isTableView = false;
    state.currentView = btn.dataset.view;
    if (state.specificDateFilter) {
      state.selectedAddDate = getLocalISODate();
      updateQuickAddDateDisplay();
      updateQuickAddTimeDisplay();
    }
    state.specificDateFilter = null;
    dateFilterInput.value = '';
    if (dateFilterLabel) dateFilterLabel.textContent = 'Pick date';
    filterDropdownWrap.classList.remove('open');
    updateViewModeDisplay();
    updateFilterDisplay();
    renderTasks();
  });
});

// Transparent date inputs sit on top of their chip buttons, so clicks land on the input.
// Open the native calendar from there (otherwise Chrome only focuses the hidden field).
document.addEventListener('click', (e) => {
  const input = e.target.closest && e.target.closest('.chip-date-input');
  if (!input) return;
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    }
  } catch (err) {}
});

// Picking a date shows that day's tasks and makes new tasks go to that day
function setDateFilter(dateStr) {
  if (dateStr) {
    state.isTableView = false;
    state.specificDateFilter = dateStr;
    state.selectedAddDate = dateStr;
  } else {
    state.specificDateFilter = null;
    state.selectedAddDate = getLocalISODate();
    dateFilterInput.value = '';
  }
  updateQuickAddDateDisplay();
  updateQuickAddTimeDisplay();
  updateViewModeDisplay();
  renderTasks();
  if (dateStr) quickAddInput.focus();
}

dateFilterInput.addEventListener('change', (e) => {
  setDateFilter(e.target.value);
});

if (clearDateFilterBtn) {
  clearDateFilterBtn.addEventListener('click', () => setDateFilter(null));
}

// --- Main Render Logic ---
function renderTasks() {
  updateSidebar();
  if (state.isTableView && !isNonDesktopDevice()) {
    renderWeekScheduleTable({
      container: dateGroupsContainer,
      tasks: state.tasks,
      weekOffset: currentWeekOffset,
      onPrevWeek: () => {
        currentWeekOffset -= 1;
        renderTasks();
      },
      onNextWeek: () => {
        currentWeekOffset += 1;
        renderTasks();
      },
      onThisWeek: () => {
        currentWeekOffset = 0;
        renderTasks();
      },
      onExitTable: () => {
        state.isTableView = false;
        updateViewModeDisplay();
        renderTasks();
      },
      onAddTask: async (text, dateStr, start, end) => {
        const parsed = parseTimeFromText(text);
        if (parsed) {
          await addTask(parsed.cleanText, dateStr, parsed.startTime, parsed.endTime);
        } else {
          await addTask(text, dateStr, start, end);
        }
        renderTasks();
      },
      onToggleComplete: async (taskId, completed) => {
        await updateTaskItem(taskId, { completed });
        renderTasks();
      },
      onEditText: async (taskId, newText) => {
        if (!newText) {
          await deleteTaskItem(taskId);
        } else {
          const parsed = parseTimeFromText(newText);
          if (parsed) {
            await updateTaskItem(taskId, { text: parsed.cleanText, startTime: parsed.startTime, endTime: parsed.endTime });
          } else {
            await updateTaskItem(taskId, { text: newText });
          }
        }
        renderTasks();
      },
      onDeleteTask: async (taskId) => {
        await deleteTaskItem(taskId);
        renderTasks();
      },
      onMoveTask: async (taskId, dateStr, start, end) => {
        await updateTaskItem(taskId, { date: dateStr, startTime: start, endTime: end });
        renderTasks();
      },
      onTimeClick: (triggerEl, task) => {
        popover.openTimePopover(triggerEl, task.startTime, task.endTime, { type: 'task', taskId: task.id });
      }
    });
    return;
  }

  const today = getLocalISODate();
  const filtered = getFilteredTasks();

  dateGroupsContainer.innerHTML = '';

  // Group tasks by date
  const groupsMap = new Map();
  filtered.forEach(task => {
    const key = task.date || 'Undated';
    if (!groupsMap.has(key)) groupsMap.set(key, []);
    groupsMap.get(key).push(task);
  });

  // Collect unique dates
  const dateSet = new Set(groupsMap.keys());
  if (state.specificDateFilter) {
    // Always show the picked day, even when empty, so tasks can be added to it
    dateSet.add(state.specificDateFilter);
  } else if (state.currentView === 'all' || state.currentView === 'today') {
    dateSet.add(today);
  }

  if (dateSet.size === 0) {
    dateGroupsContainer.innerHTML = `
      <div class="empty-state">
        No tasks found for this view. Press Enter in the input above to create one.
      </div>
    `;
    return;
  }

  // Sort dates:
  // In upcoming / this-week view: ascending forward in time
  // In all view: Today first, then upcoming days (ascending), then past days (descending)
  // Otherwise: descending
  const dateRank = (d) => (d === today ? 0 : d > today ? 1 : 2);
  const sortedDates = Array.from(dateSet).sort((a, b) => {
    if (a === 'Undated') return 1;
    if (b === 'Undated') return -1;
    if (state.currentView === 'upcoming' || state.currentView === 'this-week') {
      return a.localeCompare(b);
    }
    if (state.currentView === 'all' && !state.specificDateFilter) {
      const rankDiff = dateRank(a) - dateRank(b);
      if (rankDiff !== 0) return rankDiff;
      return dateRank(a) === 1 ? a.localeCompare(b) : b.localeCompare(a);
    }
    return b.localeCompare(a);
  });

  sortedDates.forEach(dateKey => {
    const groupTasks = groupsMap.get(dateKey) || [];
    const sortedGroupTasks = sortTaskList(groupTasks, true);
    const groupEl = renderDateGroupElement(dateKey, sortedGroupTasks);
    dateGroupsContainer.appendChild(groupEl);
  });
}

function renderDateGroupElement(dateKey, groupTasks) {
  const { title, sub } = formatFriendlyDate(dateKey);
  const groupEl = document.createElement('section');
  groupEl.className = 'date-group';
  groupEl.dataset.date = dateKey;

  const completedCount = groupTasks.filter(t => t.completed).length;

  groupEl.innerHTML = `
    <div class="date-group-header">
      <div class="date-group-title-wrap">
        <span class="date-group-name">${title}</span>
        <span class="date-group-subname">${sub}</span>
      </div>
      <span class="date-group-count">${completedCount}/${groupTasks.length}</span>
    </div>
    <div class="task-list" id="group-list-${dateKey}"></div>
    ${dateKey !== 'Undated' ? renderDropSlotsHtml(dateKey, groupTasks) : ''}
    <div class="inline-add-row" data-date="${dateKey}">
      <span class="inline-add-icon">+</span>
      <span>New task</span>
    </div>
  `;

  const taskListEl = groupEl.querySelector('.task-list');

  groupTasks.forEach(task => {
    const row = document.createElement('div');
    const hasTime = Boolean(task.startTime);
    row.className = `task-row ${task.completed ? 'is-completed' : ''}`;
    row.dataset.id = task.id;
    row.draggable = true;
    row.title = 'Drag to move · Double-click to edit';

    const timeDisplay = hasTime 
      ? formatTimeRangeDisplay(task.startTime, task.endTime) 
      : '+ 30m';

    row.innerHTML = `
      <span class="task-drag-handle" aria-hidden="true">⋮⋮</span>
      <div class="task-checkbox-wrap">
        <input type="checkbox" class="task-checkbox" ${task.completed ? 'checked' : ''} aria-label="Toggle completed" />
      </div>

      <div class="task-time-wrap">
        <button type="button" class="time-nudge-btn nudge-prev" title="Move back 30m (1 click)">‹</button>
        <button type="button" class="task-time-pill ${hasTime ? 'is-set' : 'is-empty'}" title="1-click slot picker">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          <span>${timeDisplay}</span>
        </button>
        <button type="button" class="time-nudge-btn nudge-next" title="Move forward 30m (1 click)">›</button>
      </div>

      <div class="task-main">
        <span class="task-text" spellcheck="false">${escapeHtml(task.text)}</span>
      </div>

      <div class="task-meta">
        <div class="picker-chip-wrap">
          <button type="button" class="task-date-chip" title="Change task date" tabindex="-1">${formatShortDate(task.date)}</button>
          <input type="date" class="chip-date-input task-row-date-picker" value="${task.date}" aria-label="Change task date" />
        </div>
        <button type="button" class="task-action-btn delete-btn" title="Delete task">&times;</button>
      </div>
    `;

    // Event: Toggle completed
    const checkbox = row.querySelector('.task-checkbox');
    checkbox.addEventListener('change', async () => {
      await updateTaskItem(task.id, { completed: checkbox.checked });
      renderTasks();
    });

    // 1-Click Micro-Nudge Back (-30m)
    const nudgePrev = row.querySelector('.nudge-prev');
    nudgePrev.addEventListener('click', async (e) => {
      e.stopPropagation();
      const baseStart = task.startTime || '09:00';
      const duration = (task.startTime && task.endTime) ? (parseInt(task.endTime.split(':')[0]) * 60 + parseInt(task.endTime.split(':')[1]) - (parseInt(baseStart.split(':')[0]) * 60 + parseInt(baseStart.split(':')[1]))) : 30;
      const newStart = addMinutesToTime(baseStart, -30);
      const newEnd = addMinutesToTime(newStart, duration > 0 ? duration : 30);
      await updateTaskItem(task.id, { startTime: newStart, endTime: newEnd });
      renderTasks();
    });

    // 1-Click Micro-Nudge Forward (+30m)
    const nudgeNext = row.querySelector('.nudge-next');
    nudgeNext.addEventListener('click', async (e) => {
      e.stopPropagation();
      const baseStart = task.startTime || '09:00';
      const duration = (task.startTime && task.endTime) ? (parseInt(task.endTime.split(':')[0]) * 60 + parseInt(task.endTime.split(':')[1]) - (parseInt(baseStart.split(':')[0]) * 60 + parseInt(baseStart.split(':')[1]))) : 30;
      const newStart = addMinutesToTime(baseStart, 30);
      const newEnd = addMinutesToTime(newStart, duration > 0 ? duration : 30);
      await updateTaskItem(task.id, { startTime: newStart, endTime: newEnd });
      renderTasks();
    });

    // Open 1-Click Time Grid
    const timePill = row.querySelector('.task-time-pill');
    timePill.addEventListener('click', (e) => {
      e.stopPropagation();
      popover.openTimePopover(timePill, task.startTime, task.endTime, { type: 'task', taskId: task.id });
    });

    // Inline edit text: double-click to edit (single click + drag moves the task)
    const textEl = row.querySelector('.task-text');
    let editCancelled = false;
    row.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, input') || textEl.isContentEditable) return;
      editCancelled = false;
      row.draggable = false;
      row.classList.add('is-editing');
      textEl.contentEditable = 'true';
      textEl.focus();
      const range = document.createRange();
      range.selectNodeContents(textEl);
      range.collapse(false);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
    });

    textEl.addEventListener('blur', async () => {
      textEl.contentEditable = 'false';
      row.draggable = true;
      row.classList.remove('is-editing');
      if (editCancelled) return;
      const newText = textEl.textContent.trim();
      if (newText && newText !== task.text) {
        const parsed = parseTimeFromText(newText);
        if (parsed) {
          await updateTaskItem(task.id, { text: parsed.cleanText, startTime: parsed.startTime, endTime: parsed.endTime });
        } else {
          await updateTaskItem(task.id, { text: newText });
        }
        renderTasks();
      } else if (!newText) {
        await deleteTaskItem(task.id);
        renderTasks();
      }
    });

    textEl.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        textEl.blur();
      } else if (e.key === 'Escape') {
        editCancelled = true;
        textEl.textContent = task.text;
        textEl.blur();
      }
    });

    // Date picker (calendar opens via the shared .chip-date-input click handler)
    const datePicker = row.querySelector('.task-row-date-picker');
    datePicker.addEventListener('change', async (e) => {
      if (e.target.value) {
        await updateTaskItem(task.id, { date: e.target.value });
        renderTasks();
      }
    });

    // Delete
    const delBtn = row.querySelector('.delete-btn');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      await deleteTaskItem(task.id);
      renderTasks();
    });

    taskListEl.appendChild(row);
  });

  const inlineAdd = groupEl.querySelector('.inline-add-row');
  inlineAdd.addEventListener('click', () => {
    focusInlineAdd(dateKey);
  });

  return groupEl;
}

setupListDragAndDrop({
  container: dateGroupsContainer,
  getTask: (id) => state.tasks.find(t => t.id === id),
  onMove: async (taskId, updates) => {
    await updateTaskItem(taskId, updates);
    renderTasks();
  }
});

function focusInlineAdd(dateKey) {
  state.selectedAddDate = dateKey;
  updateQuickAddDateDisplay();
  window.scrollTo({ top: 0, behavior: 'smooth' });
  setTimeout(() => {
    quickAddInput.focus();
  }, 100);
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// --- Firebase Authentication Lifecycle ---
function updateAuthUI() {
  if (state.currentUser) {
    if (googleSignInBtn) googleSignInBtn.style.display = 'none';
    if (authUserWrap) authUserWrap.style.display = 'inline-flex';
    if (userDisplayName) {
      userDisplayName.textContent = state.currentUser.displayName || state.currentUser.email || 'User';
    }
  } else {
    if (googleSignInBtn) googleSignInBtn.style.display = 'inline-flex';
    if (authUserWrap) authUserWrap.style.display = 'none';
  }
}

if (googleSignInBtn) {
  googleSignInBtn.addEventListener('click', async () => {
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err) {
      if (err.code !== 'auth/popup-closed-by-user') {
        console.error('Sign-in error:', err);
        alert('Could not sign in: ' + err.message);
      }
    }
  });
}

if (googleSignOutBtn) {
  googleSignOutBtn.addEventListener('click', async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error('Sign-out error:', err);
    }
  });
}

onAuthStateChanged(auth, (user) => {
  state.currentUser = user;
  updateAuthUI();
  if (user) {
    initFirestoreSync(user, () => {
      renderTasks();
    });
  } else {
    stopFirestoreSync();
    renderTasks();
  }
});

// Initial boot
initTheme();
updateQuickAddDateDisplay();
updateQuickAddTimeDisplay();
updateViewModeDisplay();
updateFilterDisplay();

// --- Creator Boy Badge & Popup Modal ---
const creatorBadgeDock = document.getElementById('creatorBadgeDock');
const creatorBoyBtn = document.getElementById('creatorBoyBtn');
const creatorPopup = document.getElementById('creatorPopup');
const creatorPopupCloseBtn = document.getElementById('creatorPopupCloseBtn');
const creatorCopyEmailBtn = document.getElementById('creatorCopyEmailBtn');
const creatorCopyLabel = document.getElementById('creatorCopyLabel');

if (creatorBoyBtn && creatorPopup) {
  creatorBoyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    creatorPopup.classList.toggle('open');
  });

  if (creatorPopupCloseBtn) {
    creatorPopupCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      creatorPopup.classList.remove('open');
    });
  }

  document.addEventListener('click', (e) => {
    if (creatorPopup.classList.contains('open') && !creatorPopup.contains(e.target) && !creatorBoyBtn.contains(e.target)) {
      creatorPopup.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && creatorPopup.classList.contains('open')) {
      creatorPopup.classList.remove('open');
    }
  });
}

if (creatorCopyEmailBtn && creatorCopyLabel) {
  creatorCopyEmailBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const email = 'istaranjandas@gmail.com';
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(email);
      }
      creatorCopyLabel.textContent = 'Copied!';
      setTimeout(() => {
        creatorCopyLabel.textContent = 'Copy';
      }, 2000);
    } catch (err) {
      creatorCopyLabel.textContent = 'Copied!';
      setTimeout(() => {
        creatorCopyLabel.textContent = 'Copy';
      }, 2000);
    }
  });
}
// --- Devil Mascot Warning Popup ---
const devilLogoBtn = document.getElementById('devilLogoBtn');
const devilPopup = document.getElementById('devilPopup');
const devilPopupClose = document.getElementById('devilPopupClose');
const devilPopupAckBtn = document.getElementById('devilPopupAckBtn');

if (devilLogoBtn && devilPopup) {
  devilLogoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    devilPopup.classList.toggle('open');
  });

  if (devilPopupClose) {
    devilPopupClose.addEventListener('click', (e) => {
      e.stopPropagation();
      devilPopup.classList.remove('open');
    });
  }

  if (devilPopupAckBtn) {
    devilPopupAckBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      devilPopup.classList.remove('open');
    });
  }

  document.addEventListener('click', (e) => {
    if (devilPopup.classList.contains('open') && !devilPopup.contains(e.target) && !devilLogoBtn.contains(e.target)) {
      devilPopup.classList.remove('open');
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && devilPopup.classList.contains('open')) {
      devilPopup.classList.remove('open');
    }
  });
}

renderTasks();
