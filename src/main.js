// Main Application Bootstrapper & UI Coordinator
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase.js';
import { getLocalISODate, formatShortDate, formatFriendlyDate, getWeekDates } from './modules/dateUtils.js';
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
import { soundFx } from './modules/audioFx.js';
import { setupInteractiveEffects } from './modules/interactiveEffects.js';

// Initialize interactive 3D vector effects (mouse follower, trailing sparks, click bursts, 3D card tilt)
const interactiveEffects = setupInteractiveEffects();

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
const soundToggle = document.getElementById('soundToggle');
const soundToggleIcon = document.getElementById('soundToggleIcon');

const scene3dContainer = document.getElementById('scene3dContainer');
const focusTotal = document.getElementById('focusTotal');
const focusRemaining = document.getElementById('focusRemaining');
const focusCompletion = document.getElementById('focusCompletion');
const focusProgressText = document.getElementById('focusProgressText');

let currentWeekOffset = 0;

// Dynamically initialize the compact architectural focus scene without blocking interaction.
let threeScene = null;
if (scene3dContainer) {
  import('./modules/threeScene.js')
    .then(({ createThreeScene }) => {
      threeScene = createThreeScene(scene3dContainer);
      const currentTheme = document.documentElement.getAttribute('data-theme') || 'dark';
      if (threeScene) {
        threeScene.setTheme(currentTheme);
        updateTelemetryHUD();
      }
    })
    .catch((err) => {
      console.warn('Three.js scene deferred load fallback:', err);
    });
}

// --- Audio FX Toggle Management ---
function updateSoundIcon(enabled) {
  if (!soundToggle || !soundToggleIcon) return;
  if (enabled) {
    soundToggle.classList.remove('is-muted');
    soundToggle.setAttribute('title', 'Audio FX: Enabled');
    soundToggleIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
    `;
  } else {
    soundToggle.classList.add('is-muted');
    soundToggle.setAttribute('title', 'Audio FX: Muted');
    soundToggleIcon.innerHTML = `
      <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
      <line x1="23" y1="9" x2="17" y2="15"></line>
      <line x1="17" y1="9" x2="23" y2="15"></line>
    `;
  }
}

if (soundToggle) {
  updateSoundIcon(soundFx.isEnabled());
  soundToggle.addEventListener('click', () => {
    const isNowOn = soundFx.toggle();
    updateSoundIcon(isNowOn);
  });
}

// --- Theme Management ---
function updateThemeIcon(theme) {
  if (!themeToggle) return;
  if (theme === 'dark') {
    themeToggle.setAttribute('title', 'Switch to Light mode');
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
    themeToggle.setAttribute('title', 'Switch to Dark mode');
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
  let activeTheme = 'dark'; // AAA Game cinematic default
  if (savedTheme) {
    activeTheme = savedTheme;
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: light)').matches) {
    activeTheme = 'light';
  }
  document.documentElement.setAttribute('data-theme', activeTheme);
  updateThemeIcon(activeTheme);
  if (threeScene) {
    threeScene.setTheme(activeTheme);
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  updateThemeIcon(next);
  if (threeScene) {
    threeScene.setTheme(next);
  }
  soundFx.playClick();
}

if (themeToggle) {
  themeToggle.addEventListener('click', toggleTheme);
}

// --- Honest task summary for the focus window ---
function updateTelemetryHUD() {
  const allTasks = state.tasks || [];
  const total = allTasks.length;
  const completed = allTasks.filter(t => t.completed).length;
  const active = total - completed;
  const rate = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (focusTotal) focusTotal.textContent = String(total);
  if (focusRemaining) focusRemaining.textContent = String(active);
  if (focusCompletion) focusCompletion.textContent = `${rate}%`;
  if (focusProgressText) {
    focusProgressText.textContent = total ? `${completed} of ${total} completed` : 'No tasks yet';
  }
  if (threeScene && typeof threeScene.updateProgress === 'function') {
    threeScene.updateProgress(completed, total);
  }
}

// --- Time Popover Setup ---
const popover = setupTimePopover({
  getState: () => state,
  onTimeApplied: (start, end, context) => {
    soundFx.playClick();
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
      soundFx.playClick();
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
  soundFx.playClick();
  state.selectedAddStart = '';
  state.selectedAddEnd = '';
  updateQuickAddTimeDisplay();
});

quickAddTimeBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  soundFx.playClick();
  popover.openTimePopover(quickAddTimeBtn, state.selectedAddStart, state.selectedAddEnd, { type: 'quick' });
});

// Quick Add Submit (Supports click, keyboard Done/Go, and Enter key)
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
  soundFx.playAdd();
  if (threeScene) {
    threeScene.triggerPulse();
  }
  if (interactiveEffects) {
    const rect = quickAddInput.getBoundingClientRect();
    interactiveEffects.spawnBurst(rect.left + rect.width / 2, rect.top + rect.height / 2, true);
  }

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
    soundFx.playClick();
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
    viewSubtitleEl.textContent = sub || '';
  } else {
    viewTitleEl.textContent = VIEW_TITLES[state.currentView] || 'Tasks';
    const dateFormatted = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
    viewSubtitleEl.textContent = dateFormatted;
  }
}

const miniCalendarEl = document.getElementById('miniCalendar');
const miniCalendar = miniCalendarEl
  ? createMiniCalendar({
      container: miniCalendarEl,
      onPick: (dateStr) => {
        soundFx.playClick();
        setDateFilter(dateStr === state.specificDateFilter ? null : dateStr);
      }
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
  updateTelemetryHUD();
}

filterDropdownBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  soundFx.playClick();
  filterDropdownWrap.classList.toggle('open');
});

filterMenuItems.forEach(btn => {
  btn.addEventListener('click', () => {
    soundFx.playClick();
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

// Transparent date inputs trigger native picker
document.addEventListener('click', (e) => {
  const input = e.target.closest && e.target.closest('.chip-date-input');
  if (!input) return;
  try {
    if (typeof input.showPicker === 'function') {
      input.showPicker();
    }
  } catch (err) {}
});

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
  soundFx.playClick();
  setDateFilter(e.target.value);
});

if (clearDateFilterBtn) {
  clearDateFilterBtn.addEventListener('click', () => {
    soundFx.playClick();
    setDateFilter(null);
  });
}

// --- Main Render Logic ---
function renderTasks() {
  updateSidebar();
  const focusWindowEl = document.getElementById('focusWindow');
  if (state.isTableView && !isNonDesktopDevice()) {
    if (focusWindowEl) focusWindowEl.style.display = 'none';
    renderWeekScheduleTable({
      container: dateGroupsContainer,
      tasks: state.tasks,
      weekOffset: currentWeekOffset,
      onPrevWeek: () => {
        soundFx.playClick();
        currentWeekOffset -= 1;
        renderTasks();
      },
      onNextWeek: () => {
        soundFx.playClick();
        currentWeekOffset += 1;
        renderTasks();
      },
      onThisWeek: () => {
        soundFx.playClick();
        currentWeekOffset = 0;
        renderTasks();
      },
      onExitTable: () => {
        soundFx.playClick();
        state.isTableView = false;
        updateViewModeDisplay();
        renderTasks();
      },
      onAddTask: async (text, dateStr, start, end) => {
        soundFx.playAdd();
        if (threeScene) threeScene.triggerPulse();
        const parsed = parseTimeFromText(text);
        if (parsed) {
          await addTask(parsed.cleanText, dateStr, parsed.startTime, parsed.endTime);
        } else {
          await addTask(text, dateStr, start, end);
        }
        renderTasks();
      },
      onToggleComplete: async (taskId, completed) => {
        if (completed) {
          soundFx.playComplete();
          if (threeScene) threeScene.triggerPulse();
          if (interactiveEffects) {
            interactiveEffects.spawnCelebration(window.innerWidth / 2, 280);
          }
        } else {
          soundFx.playClick();
        }
        await updateTaskItem(taskId, { completed });
        renderTasks();
      },
      onEditText: async (taskId, newText) => {
        if (!newText) {
          soundFx.playDelete();
          await deleteTaskItem(taskId);
        } else {
          soundFx.playClick();
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
        soundFx.playDelete();
        await deleteTaskItem(taskId);
        renderTasks();
      },
      onMoveTask: async (taskId, dateStr, start, end) => {
        soundFx.playClick();
        await updateTaskItem(taskId, { date: dateStr, startTime: start, endTime: end });
        renderTasks();
      },
      onTimeClick: (triggerEl, task) => {
        soundFx.playClick();
        popover.openTimePopover(triggerEl, task.startTime, task.endTime, { type: 'task', taskId: task.id });
      }
    });
    return;
  }

  if (focusWindowEl) focusWindowEl.style.display = 'none';

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
    dateSet.add(state.specificDateFilter);
  } else if (state.currentView === 'all' || state.currentView === 'today') {
    dateSet.add(today);
  }

  if (dateSet.size === 0) {
    dateGroupsContainer.innerHTML = `
      <div class="empty-state">
        No tasks found. Add a task above to get started.
      </div>
    `;
    return;
  }

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
      <span class="date-group-count">${completedCount} of ${groupTasks.length}</span>
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
      const isChecked = checkbox.checked;
      if (isChecked) {
        soundFx.playComplete();
        if (threeScene) threeScene.triggerPulse();
        if (interactiveEffects) {
          const rect = checkbox.getBoundingClientRect();
          interactiveEffects.spawnCelebration(rect.left + rect.width / 2, rect.top - 12);
        }
      } else {
        soundFx.playClick();
      }
      await updateTaskItem(task.id, { completed: isChecked });
      renderTasks();
    });

    // 1-Click Micro-Nudge Back (-30m)
    const nudgePrev = row.querySelector('.nudge-prev');
    nudgePrev.addEventListener('click', async (e) => {
      e.stopPropagation();
      soundFx.playClick();
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
      soundFx.playClick();
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
      soundFx.playClick();
      popover.openTimePopover(timePill, task.startTime, task.endTime, { type: 'task', taskId: task.id });
    });

    // Inline edit text: double-click to edit
    const textEl = row.querySelector('.task-text');
    let editCancelled = false;
    row.addEventListener('dblclick', (e) => {
      if (e.target.closest('button, input') || textEl.isContentEditable) return;
      soundFx.playClick();
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
        soundFx.playClick();
        const parsed = parseTimeFromText(newText);
        if (parsed) {
          await updateTaskItem(task.id, { text: parsed.cleanText, startTime: parsed.startTime, endTime: parsed.endTime });
        } else {
          await updateTaskItem(task.id, { text: newText });
        }
        renderTasks();
      } else if (!newText) {
        soundFx.playDelete();
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

    // Date picker
    const datePicker = row.querySelector('.task-row-date-picker');
    datePicker.addEventListener('change', async (e) => {
      if (e.target.value) {
        soundFx.playClick();
        await updateTaskItem(task.id, { date: e.target.value });
        renderTasks();
      }
    });

    // Delete
    const delBtn = row.querySelector('.delete-btn');
    delBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      soundFx.playDelete();
      await deleteTaskItem(task.id);
      renderTasks();
    });

    taskListEl.appendChild(row);
  });

  const inlineAdd = groupEl.querySelector('.inline-add-row');
  inlineAdd.addEventListener('click', () => {
    soundFx.playClick();
    focusInlineAdd(dateKey);
  });

  return groupEl;
}

setupListDragAndDrop({
  container: dateGroupsContainer,
  getTask: (id) => state.tasks.find(t => t.id === id),
  onMove: async (taskId, updates) => {
    soundFx.playClick();
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
    soundFx.playClick();
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
    soundFx.playClick();
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
if (window.matchMedia('(max-width: 680px)').matches) {
  quickAddInput.placeholder = 'Add a task…';
}
initTheme();
updateQuickAddDateDisplay();
updateQuickAddTimeDisplay();
updateViewModeDisplay();
updateFilterDisplay();

// --- Creator Dossier Dock & Modal ---
const creatorBadgeDock = document.getElementById('creatorBadgeDock');
const creatorBoyBtn = document.getElementById('creatorBoyBtn');
const creatorPopup = document.getElementById('creatorPopup');
const creatorPopupCloseBtn = document.getElementById('creatorPopupCloseBtn');
const creatorCopyEmailBtn = document.getElementById('creatorCopyEmailBtn');
const creatorCopyLabel = document.getElementById('creatorCopyLabel');

if (creatorBoyBtn && creatorPopup) {
  creatorBoyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    soundFx.playClick();
    creatorPopup.classList.toggle('open');
  });

  if (creatorPopupCloseBtn) {
    creatorPopupCloseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      soundFx.playClick();
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
    soundFx.playClick();
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

// --- Friendly reminder modal ---
const devilLogoBtn = document.getElementById('devilLogoBtn');
const devilPopup = document.getElementById('devilPopup');
const devilPopupClose = document.getElementById('devilPopupClose');
const devilPopupAckBtn = document.getElementById('devilPopupAckBtn');

if (devilLogoBtn && devilPopup) {
  devilLogoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    soundFx.playClick();
    devilPopup.classList.toggle('open');
  });

  if (devilPopupClose) {
    devilPopupClose.addEventListener('click', (e) => {
      e.stopPropagation();
      soundFx.playClick();
      devilPopup.classList.remove('open');
    });
  }

  if (devilPopupAckBtn) {
    devilPopupAckBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      soundFx.playClick();
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
