// Main Application Bootstrapper & UI Coordinator
import { auth, googleProvider, signInWithPopup, signOut, onAuthStateChanged } from './firebase.js';
import { getLocalISODate, addDays, formatShortDate, formatFriendlyDate } from './modules/dateUtils.js';
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
  TITLE_KEY, 
  SORT_TIME_KEY 
} from './modules/store.js';
import { setupTimePopover } from './modules/timePopover.js';
import { renderWeekScheduleTable } from './modules/weekTable.js';

// DOM Elements
const dateGroupsContainer = document.getElementById('dateGroupsContainer');
const googleSignInBtn = document.getElementById('googleSignInBtn');
const authUserWrap = document.getElementById('authUserWrap');
const userDisplayName = document.getElementById('userDisplayName');
const googleSignOutBtn = document.getElementById('googleSignOutBtn');

const quickAddInput = document.getElementById('quickAddInput');
const quickAddDateBtn = document.getElementById('quickAddDateBtn');
const quickAddDateLabel = document.getElementById('quickAddDateLabel');
const quickAddDateInput = document.getElementById('quickAddDateInput');
const quickAddTimeBtn = document.getElementById('quickAddTimeBtn');
const quickAddTimeLabel = document.getElementById('quickAddTimeLabel');
const clearQuickTimeBtn = document.getElementById('clearQuickTimeBtn');

const sortByTimeBtn = document.getElementById('sortByTimeBtn');
const sortByTimeLabel = document.getElementById('sortByTimeLabel');

const weekTableBtn = document.getElementById('weekTableBtn');
const weekTableBtnLabel = document.getElementById('weekTableBtnLabel');
const weekTableBtnIcon = document.getElementById('weekTableBtnIcon');

const planAheadDropdownWrap = document.getElementById('planAheadDropdownWrap');
const planAheadToolbarBtn = document.getElementById('planAheadToolbarBtn');
const planAheadToolbarLabel = document.getElementById('planAheadToolbarLabel');
const planTomorrowBtn = document.getElementById('planTomorrowBtn');
const planTomorrowLabel = document.getElementById('planTomorrowLabel');
const planDayAfterBtn = document.getElementById('planDayAfterBtn');
const planDayAfterLabel = document.getElementById('planDayAfterLabel');
const planNextWeekBtn = document.getElementById('planNextWeekBtn');
const planPickDateBtn = document.getElementById('planPickDateBtn');
const planPickDateInput = document.getElementById('planPickDateInput');
const planViewUpcomingBtn = document.getElementById('planViewUpcomingBtn');
const planViewUpcomingLabel = document.getElementById('planViewUpcomingLabel');

const dateFilterInput = document.getElementById('dateFilterInput');
const filterDropdownWrap = document.getElementById('filterDropdownWrap');
const filterDropdownBtn = document.getElementById('filterDropdownBtn');
const filterBtnLabel = document.getElementById('filterBtnLabel');
const filterMenuItems = document.querySelectorAll('.filter-menu-item');
const themeToggle = document.getElementById('themeToggle');

let currentWeekOffset = 0;

// --- Theme Management ---
function initTheme() {
  const savedTheme = localStorage.getItem(THEME_KEY);
  if (savedTheme) {
    document.documentElement.setAttribute('data-theme', savedTheme);
  } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
    document.documentElement.setAttribute('data-theme', 'dark');
  }
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme');
  const next = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
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

if (quickAddDateBtn && quickAddDateInput) {
  quickAddDateBtn.addEventListener('click', () => {
    try {
      quickAddDateInput.showPicker();
    } catch (e) {
      quickAddDateInput.click();
    }
  });

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

// Quick Add Submit
quickAddInput.addEventListener('keydown', async (e) => {
  if (e.key === 'Enter') {
    const rawVal = quickAddInput.value.trim();
    if (!rawVal) return;

    const parsed = parseTimeFromText(rawVal);
    const text = parsed ? parsed.cleanText : rawVal;
    const start = parsed ? parsed.startTime : state.selectedAddStart;
    const end = parsed ? parsed.endTime : state.selectedAddEnd;

    const today = getLocalISODate();
    if (state.selectedAddDate > today && state.currentView === 'all') {
      state.currentView = 'upcoming';
      updateFilterDisplay();
    }

    await addTask(text, state.selectedAddDate, start, end);
    quickAddInput.value = '';
    state.selectedAddStart = '';
    state.selectedAddEnd = '';
    updateQuickAddTimeDisplay();
    renderTasks();
  }
});

// --- View Mode & Table Toggle ---
function updateViewModeDisplay() {
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

weekTableBtn.addEventListener('click', () => {
  state.isTableView = !state.isTableView;
  updateViewModeDisplay();
  renderTasks();
});

// --- Sort by Time Toggle ---
function updateSortBtnDisplay() {
  if (state.sortByTime) {
    sortByTimeBtn.classList.add('active');
    sortByTimeLabel.textContent = 'Time sorted';
  } else {
    sortByTimeBtn.classList.remove('active');
    sortByTimeLabel.textContent = 'Sort by time';
  }
}

sortByTimeBtn.addEventListener('click', () => {
  state.sortByTime = !state.sortByTime;
  localStorage.setItem(SORT_TIME_KEY, state.sortByTime ? 'true' : 'false');
  updateSortBtnDisplay();
  renderTasks();
});

// --- Plan Ahead Toolbar Dropdown ---
if (planAheadToolbarBtn) {
  planAheadToolbarBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    planAheadDropdownWrap.classList.toggle('open');
  });
}

if (planTomorrowBtn) {
  planTomorrowBtn.addEventListener('click', () => {
    const today = getLocalISODate();
    state.selectedAddDate = addDays(today, 1);
    updateQuickAddDateDisplay();
    planAheadDropdownWrap.classList.remove('open');
    quickAddInput.focus();
  });
}

if (planDayAfterBtn) {
  planDayAfterBtn.addEventListener('click', () => {
    const today = getLocalISODate();
    state.selectedAddDate = addDays(today, 2);
    updateQuickAddDateDisplay();
    planAheadDropdownWrap.classList.remove('open');
    quickAddInput.focus();
  });
}

if (planNextWeekBtn) {
  planNextWeekBtn.addEventListener('click', () => {
    const today = getLocalISODate();
    state.selectedAddDate = addDays(today, 7);
    updateQuickAddDateDisplay();
    planAheadDropdownWrap.classList.remove('open');
    quickAddInput.focus();
  });
}

if (planPickDateBtn && planPickDateInput) {
  planPickDateBtn.addEventListener('click', () => {
    try {
      planPickDateInput.showPicker();
    } catch (e) {
      planPickDateInput.click();
    }
  });

  planPickDateInput.addEventListener('change', (e) => {
    if (e.target.value) {
      state.selectedAddDate = e.target.value;
      updateQuickAddDateDisplay();
      planAheadDropdownWrap.classList.remove('open');
      quickAddInput.focus();
    }
  });
}

if (planViewUpcomingBtn) {
  planViewUpcomingBtn.addEventListener('click', () => {
    state.isTableView = false;
    state.currentView = 'upcoming';
    state.specificDateFilter = null;
    planAheadDropdownWrap.classList.remove('open');
    updateViewModeDisplay();
    updateFilterDisplay();
    renderTasks();
  });
}

document.addEventListener('click', (e) => {
  if (planAheadDropdownWrap && !planAheadDropdownWrap.contains(e.target)) {
    planAheadDropdownWrap.classList.remove('open');
  }
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
  } else if (state.specificDateFilter) {
    filterBtnLabel.textContent = `Filter: ${formatShortDate(state.specificDateFilter)}`;
    filterDropdownBtn.classList.add('active');
  } else if (state.currentView !== 'all') {
    const viewLabels = {
      today: 'Today',
      'this-week': 'This Week',
      upcoming: 'Upcoming',
      completed: 'Completed'
    };
    filterBtnLabel.textContent = `Filter: ${viewLabels[state.currentView] || state.currentView}`;
    filterDropdownBtn.classList.add('active');
  } else {
    filterBtnLabel.textContent = 'Filter';
    filterDropdownBtn.classList.remove('active');
  }
}

filterDropdownBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  filterDropdownWrap.classList.toggle('open');
});

filterMenuItems.forEach(btn => {
  btn.addEventListener('click', () => {
    state.isTableView = false;
    state.currentView = btn.dataset.view;
    state.specificDateFilter = null;
    dateFilterInput.value = '';
    filterDropdownWrap.classList.remove('open');
    updateViewModeDisplay();
    updateFilterDisplay();
    renderTasks();
  });
});

dateFilterInput.addEventListener('change', (e) => {
  if (e.target.value) {
    state.isTableView = false;
    state.specificDateFilter = e.target.value;
    updateViewModeDisplay();
    updateFilterDisplay();
    renderTasks();
  } else {
    state.specificDateFilter = null;
    updateFilterDisplay();
    renderTasks();
  }
});

// --- Main Render Logic ---
function renderTasks() {
  if (state.isTableView) {
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
      onCellClick: (dateStr, start, end) => {
        state.selectedAddDate = dateStr;
        state.selectedAddStart = start || '';
        state.selectedAddEnd = end || '';
        updateQuickAddDateDisplay();
        updateQuickAddTimeDisplay();
        quickAddInput.focus();
      },
      onTaskClick: (taskId) => {
        const t = state.tasks.find(x => x.id === taskId);
        if (t) {
          updateTaskItem(taskId, { completed: !t.completed });
          renderTasks();
        }
      }
    });
    return;
  }

  const today = getLocalISODate();
  const tomorrow = addDays(today, 1);
  const filtered = getFilteredTasks();

  // Future task count for Plan ahead button
  const futureTasks = state.tasks.filter(t => t.date && t.date > today);
  if (planAheadToolbarLabel) {
    planAheadToolbarLabel.textContent = futureTasks.length > 0 
      ? `Plan ahead (${futureTasks.length})` 
      : 'Plan ahead';
  }

  if (planTomorrowLabel) planTomorrowLabel.textContent = `Tomorrow (${formatShortDate(tomorrow)})`;
  if (planDayAfterLabel) planDayAfterLabel.textContent = `Day after (${formatShortDate(addDays(today, 2))})`;
  if (planViewUpcomingLabel) planViewUpcomingLabel.textContent = futureTasks.length > 0 
    ? `View upcoming (${futureTasks.length})` 
    : 'View upcoming tasks';

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
  if ((state.currentView === 'all' || state.currentView === 'today') && !state.specificDateFilter) {
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
  // In all / standard view: descending (Today at top, then yesterday, then earlier days)
  const sortedDates = Array.from(dateSet).sort((a, b) => {
    if (a === 'Undated') return 1;
    if (b === 'Undated') return -1;
    if (state.currentView === 'upcoming' || state.currentView === 'this-week') {
      return a.localeCompare(b);
    }
    return b.localeCompare(a);
  });

  sortedDates.forEach(dateKey => {
    const groupTasks = groupsMap.get(dateKey) || [];
    const sortedGroupTasks = sortTaskList(groupTasks, state.sortByTime);
    const groupEl = renderDateGroupElement(dateKey, sortedGroupTasks);
    dateGroupsContainer.appendChild(groupEl);
  });
}

function renderDateGroupElement(dateKey, groupTasks) {
  const { title, sub } = formatFriendlyDate(dateKey);
  const groupEl = document.createElement('section');
  groupEl.className = 'date-group';

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

    const timeDisplay = hasTime 
      ? formatTimeRangeDisplay(task.startTime, task.endTime) 
      : '+ 30m';

    row.innerHTML = `
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
        <span class="task-text" contenteditable="true" spellcheck="false">${escapeHtml(task.text)}</span>
      </div>

      <div class="task-meta">
        <div class="picker-chip-wrap">
          <input type="date" class="hidden-input task-row-date-picker" value="${task.date}" />
          <button type="button" class="task-date-chip" title="Change task date">${formatShortDate(task.date)}</button>
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

    // Inline edit text
    const textEl = row.querySelector('.task-text');
    textEl.addEventListener('blur', async () => {
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
        focusInlineAdd(dateKey);
      }
    });

    // Date chip & picker
    const dateChip = row.querySelector('.task-date-chip');
    const datePicker = row.querySelector('.task-row-date-picker');
    dateChip.addEventListener('click', () => {
      try {
        datePicker.showPicker();
      } catch (err) {
        datePicker.click();
      }
    });

    datePicker.addEventListener('change', async (e) => {
      if (e.target.value) {
        await updateTaskItem(task.id, { date: e.target.value });
        renderTasks();
      }
    });

    // Delete
    const delBtn = row.querySelector('.delete-btn');
    delBtn.addEventListener('click', async () => {
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

function focusInlineAdd(dateKey) {
  state.selectedAddDate = dateKey;
  updateQuickAddDateDisplay();
  quickAddInput.focus();
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
updateSortBtnDisplay();
updateQuickAddDateDisplay();
updateQuickAddTimeDisplay();
updateViewModeDisplay();
updateFilterDisplay();
renderTasks();
