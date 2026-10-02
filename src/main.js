import { 
  auth, 
  googleProvider, 
  db, 
  signInWithPopup, 
  signOut, 
  onAuthStateChanged,
  collection, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  doc, 
  query, 
  where, 
  onSnapshot, 
  writeBatch 
} from './firebase.js';

let currentUser = null;
let unsubscribeFirestore = null;


    // --- State & Storage ---
    const STORAGE_KEY = 'todo_do_tasks_v1';
    const THEME_KEY = 'notion_minimal_theme';
    const TITLE_KEY = 'notion_minimal_title';
    const SORT_TIME_KEY = 'notion_minimal_sort_time_v2';

    let currentView = 'all'; // 'all', 'today', 'upcoming', 'completed', 'date'
    let specificDateFilter = null;
    let selectedAddDate = getLocalISODate(new Date());
    let selectedAddStart = '';
    let selectedAddEnd = '';
    // Time sort is enabled by DEFAULT
    let sortByTime = localStorage.getItem(SORT_TIME_KEY) !== 'false';

    // Helper: Local YYYY-MM-DD
    function getLocalISODate(d = new Date()) {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return `${year}-${month}-${day}`;
    }

    function addDays(isoStr, count) {
      const parts = isoStr.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      d.setDate(d.getDate() + count);
      return getLocalISODate(d);
    }

    // Add minutes to "HH:mm"
    function addMinutesToTime(timeStr, minutesToAdd = 30) {
      if (!timeStr) return '';
      const [hStr, mStr] = timeStr.split(':');
      let totalMinutes = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + minutesToAdd;
      totalMinutes = (totalMinutes + 1440) % 1440;
      const h = Math.floor(totalMinutes / 60);
      const m = totalMinutes % 60;
      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Calculate duration in minutes between "HH:mm" and "HH:mm"
    function getDurationMinutes(startStr, endStr) {
      if (!startStr || !endStr) return 30;
      const [h1, m1] = startStr.split(':').map(Number);
      const [h2, m2] = endStr.split(':').map(Number);
      let diff = (h2 * 60 + m2) - (h1 * 60 + m1);
      if (diff <= 0) diff += 1440;
      return diff;
    }

    function getWeekDates(offsetWeeks = 0) {
      const now = new Date();
      const dayOfWeek = now.getDay();
      const diffToMon = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek;
      const monday = new Date(now);
      monday.setDate(now.getDate() + diffToMon + (offsetWeeks * 7));

      const days = [];
      for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(getLocalISODate(d));
      }
      return days;
    }

    // Default Seed Data: Clean empty list for new users
    function getDefaultTasks() {
      return [];
    }

        let tasks = loadTasks();

    function loadTasks() {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) return JSON.parse(raw);
      } catch (e) {
        console.error('Failed to load from localStorage', e);
      }
      return getDefaultTasks();
    }

        let diskFileHandle = null;
    let diskWriteTimeout = null;

    function saveTasks() {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
      } catch (e) {
        console.error('Failed to save to localStorage', e);
      }
      updateStats();
      if (diskFileHandle) {
        writeToDiskFile();
      }
    }

    // --- DOM Elements ---
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
    const filterDropdownMenu = document.getElementById('filterDropdownMenu');
    const filterMenuItems = document.querySelectorAll('.filter-menu-item');
    const themeToggle = document.getElementById('themeToggle');
    const clearCompletedBtn = document.getElementById('clearCompletedBtn');
    const resetSampleBtn = document.getElementById('resetSampleBtn');

    // Popover Elements
    const timePopover = document.getElementById('timePopover');
    const popoverStartInput = document.getElementById('popoverStartInput');
    const popoverEndInput = document.getElementById('popoverEndInput');
    const popoverDurationBadge = document.getElementById('popoverDurationBadge');
    const popoverClearBtn = document.getElementById('popoverClearBtn');
    const durationPills = document.querySelectorAll('.duration-pill');

    let activePopoverContext = null; // { type: 'quick' } or { type: 'task', taskId: string }

    // --- Theme Management ---
    function initTheme() {
      const savedTheme = localStorage.getItem(THEME_KEY);
      if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
      } else if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.setAttribute('data-theme', 'dark');
      }
      updateThemeIcon();
    }

    function toggleTheme() {
      const current = document.documentElement.getAttribute('data-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem(THEME_KEY, next);
      updateThemeIcon();
    }

    function updateThemeIcon() {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      themeToggle.innerHTML = isDark
        ? `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"></circle><line x1="12" y1="1" x2="12" y2="3"></line><line x1="12" y1="21" x2="12" y2="23"></line><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"></line><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"></line><line x1="1" y1="12" x2="3" y2="12"></line><line x1="21" y1="12" x2="23" y2="12"></line><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"></line><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"></line></svg>`
        : `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path></svg>`;
    }

    themeToggle.addEventListener('click', toggleTheme);

    // --- Date & Time Formatting Helpers ---
    function formatFriendlyDate(isoStr) {
      if (!isoStr) return { title: 'No Date', sub: '' };
      const today = getLocalISODate();
      const tomorrow = addDays(today, 1);
      const yesterday = addDays(today, -1);

      const parts = isoStr.split('-').map(Number);
      const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);

      const weekday = dateObj.toLocaleDateString(undefined, { weekday: 'short' });
      const monthDay = dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

      if (isoStr === today) {
        return { title: 'Today', sub: `${weekday}, ${monthDay}` };
      } else if (isoStr === tomorrow) {
        return { title: 'Tomorrow', sub: `${weekday}, ${monthDay}` };
      } else if (isoStr === yesterday) {
        return { title: 'Yesterday', sub: `${weekday}, ${monthDay}` };
      } else {
        const fullDay = dateObj.toLocaleDateString(undefined, { weekday: 'long' });
        return { title: fullDay, sub: `${monthDay}` };
      }
    }

    function formatShortDate(isoStr) {
      const today = getLocalISODate();
      if (isoStr === today) return 'Today';
      if (isoStr === addDays(today, 1)) return 'Tomorrow';
      if (isoStr === addDays(today, -1)) return 'Yesterday';
      const parts = isoStr.split('-').map(Number);
      const d = new Date(parts[0], parts[1] - 1, parts[2]);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    }

    function parseTimeComponent(timeStr) {
      if (!timeStr) return { formatted: '', period: '' };
      const [hStr, mStr] = timeStr.split(':');
      let h = parseInt(hStr, 10);
      const period = h >= 12 ? 'PM' : 'AM';
      h = h % 12 || 12;
      return { formatted: `${h}:${mStr}`, period };
    }

    function formatTimeRangeDisplay(startTime, endTime) {
      if (!startTime) return '';
      const s = parseTimeComponent(startTime);
      if (!endTime) return `${s.formatted} ${s.period}`;
      const e = parseTimeComponent(endTime);

      if (s.period === e.period) {
        return `${s.formatted} – ${e.formatted} ${e.period}`;
      }
      return `${s.formatted} ${s.period} – ${e.formatted} ${e.period}`;
    }

    // --- Quick Add Date Picker Setup ---
    function updateQuickAddDateDisplay() {
      quickAddDateLabel.textContent = formatShortDate(selectedAddDate);
      quickAddDateInput.value = selectedAddDate;
    }

    quickAddDateBtn.addEventListener('click', () => {
      try {
        quickAddDateInput.showPicker();
      } catch (e) {
        quickAddDateInput.click();
      }
    });

    quickAddDateInput.addEventListener('change', (e) => {
      if (e.target.value) {
        selectedAddDate = e.target.value;
        updateQuickAddDateDisplay();
      }
    });

    // --- Intelligent Natural Language Time Parsing & Smart Auto-Slotting ---
    function parseTimeFromText(text) {
      if (!text) return null;

      // Range regex: "10am-11am", "10:00 - 11:30", "2pm to 3:30pm", "9 to 10am", "2-3pm"
      const rangeRegex = /(?:at\s+|@\s*)?(\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\s*(?:-|–|to)\s*(\d{1,2}(?::\d{2})?\s*(?:am|pm)?)\b/i;
      const rangeMatch = text.match(rangeRegex);
      if (rangeMatch) {
        const start = normalizeTimeString(rangeMatch[1], rangeMatch[2]);
        const end = normalizeTimeString(rangeMatch[2]);
        if (start && end) {
          const cleanText = text.replace(rangeMatch[0], '').replace(/\s{2,}/g, ' ').trim();
          return { cleanText: cleanText || text, startTime: start, endTime: end, raw: rangeMatch[0] };
        }
      }

      // Single time regex: "at 2pm", "@ 3:30", "11:00am", "4pm", "at 14:00", "9am"
      const singleRegex = /(?:at\s+|@\s*)(\b\d{1,2}(?::\d{2})?\s*(?:am|pm)?\b)|(\b\d{1,2}(?::\d{2})?\s*(?:am|pm)\b)|(\b(?:[01]?\d|2[0-3]):[0-5]\d\b)/i;
      const match = text.match(singleRegex);
      if (match) {
        const matchedPart = match[1] || match[2] || match[3];
        const start = normalizeTimeString(matchedPart);
        if (start) {
          const cleanText = text.replace(match[0], '').replace(/\s{2,}/g, ' ').trim();
          return { cleanText: cleanText || text, startTime: start, endTime: addMinutesToTime(start, 30), raw: match[0] };
        }
      }

      return null;
    }

    function normalizeTimeString(str, hint = '') {
      if (!str) return null;
      str = str.trim().toLowerCase();
      let isPM = str.includes('pm');
      let isAM = str.includes('am');

      if (!isAM && !isPM && hint) {
        if (hint.toLowerCase().includes('pm')) isPM = true;
        if (hint.toLowerCase().includes('am')) isAM = true;
      }

      const clean = str.replace(/[a-z]/g, '').trim();
      let [hStr, mStr] = clean.split(':');
      let h = parseInt(hStr, 10);
      let m = mStr ? parseInt(mStr, 10) : 0;

      if (isNaN(h) || h < 0 || h > 24) return null;
      if (isNaN(m) || m < 0 || m > 59) return null;

      if (isPM && h < 12) h += 12;
      if (isAM && h === 12) h = 0;

      // If no am/pm specified and h is between 1 and 6, assume afternoon (e.g. "at 2" -> 2pm)
      if (!isAM && !isPM && h >= 1 && h <= 6) {
        h += 12;
      }

      return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    }

    // Auto-Cascading Slotting: Find the next chronological 30m slot on a date
    function getNextSmartSlot(dateStr) {
      const dayTasks = tasks
        .filter(t => t.date === dateStr && t.startTime)
        .sort((a, b) => (a.endTime || a.startTime).localeCompare(b.endTime || b.startTime));

      if (dayTasks.length > 0) {
        const latestTask = dayTasks[dayTasks.length - 1];
        const latestEnd = latestTask.endTime || addMinutesToTime(latestTask.startTime, 30);
        return {
          startTime: latestEnd,
          endTime: addMinutesToTime(latestEnd, 30)
        };
      }

      const today = getLocalISODate();
      if (dateStr === today) {
        const now = new Date();
        const curMin = now.getMinutes();
        let nextH = now.getHours();
        let nextM = curMin < 30 ? 30 : 0;
        if (curMin >= 30) nextH = (nextH + 1) % 24;
        const start = `${String(nextH).padStart(2, '0')}:${String(nextM).padStart(2, '0')}`;
        return {
          startTime: start,
          endTime: addMinutesToTime(start, 30)
        };
      }

      return {
        startTime: '09:00',
        endTime: '09:30'
      };
    }

    // --- Quick Add Time Display ---
    function updateQuickAddTimeDisplay() {
      const parsed = parseTimeFromText(quickAddInput.value);
      if (parsed) {
        quickAddTimeLabel.innerHTML = `✨ ${formatTimeRangeDisplay(parsed.startTime, parsed.endTime)}`;
        quickAddTimeBtn.classList.add('is-active');
        clearQuickTimeBtn.style.display = 'inline-flex';
      } else if (selectedAddStart) {
        quickAddTimeLabel.textContent = formatTimeRangeDisplay(selectedAddStart, selectedAddEnd);
        quickAddTimeBtn.classList.add('is-active');
        clearQuickTimeBtn.style.display = 'inline-flex';
      } else {
        const autoSlot = getNextSmartSlot(selectedAddDate);
        quickAddTimeLabel.textContent = formatTimeRangeDisplay(autoSlot.startTime, autoSlot.endTime);
        quickAddTimeBtn.classList.remove('is-active');
        clearQuickTimeBtn.style.display = 'none';
      }
    }

    // Real-time NLP Detection while typing
    quickAddInput.addEventListener('input', () => {
      updateQuickAddTimeDisplay();
    });

    clearQuickTimeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedAddStart = '';
      selectedAddEnd = '';
      updateQuickAddTimeDisplay();
    });

    // --- Time Popover Modal Handling ---
    const popoverNudgeBack = document.getElementById('popoverNudgeBack');
    const popoverNudgeFwd = document.getElementById('popoverNudgeFwd');
    const gridSlotBtns = document.querySelectorAll('.grid-slot-btn');

    function openTimePopover(triggerEl, startVal, endVal, context) {
      activePopoverContext = context;

      if (!startVal) {
        const autoSlot = getNextSmartSlot(selectedAddDate);
        startVal = autoSlot.startTime;
        endVal = autoSlot.endTime;
      }

      if (!endVal) {
        endVal = addMinutesToTime(startVal, 30);
      }

      popoverStartInput.value = startVal;
      popoverEndInput.value = endVal;
      updatePopoverDuration();
      highlightActiveGridSlot(startVal);

      const rect = triggerEl.getBoundingClientRect();
      let top = rect.bottom + 6;
      let left = rect.left;

      if (left + 330 > window.innerWidth) {
        left = window.innerWidth - 336;
      }
      if (top + 340 > window.innerHeight) {
        top = Math.max(10, rect.top - 336);
      }

      timePopover.style.top = `${top}px`;
      timePopover.style.left = `${Math.max(12, left)}px`;
      timePopover.classList.add('open');
    }

    function closeTimePopover() {
      timePopover.classList.remove('open');
      activePopoverContext = null;
    }

    function highlightActiveGridSlot(timeStr) {
      gridSlotBtns.forEach(btn => {
        if (btn.dataset.time === timeStr) {
          btn.classList.add('active');
        } else {
          btn.classList.remove('active');
        }
      });
    }

    function updatePopoverDuration() {
      const start = popoverStartInput.value;
      const end = popoverEndInput.value;
      const mins = getDurationMinutes(start, end);
      popoverDurationBadge.textContent = mins >= 60 && mins % 60 === 0 
        ? `${mins / 60}h` 
        : mins > 60 
          ? `${Math.floor(mins / 60)}h ${mins % 60}m` 
          : `${mins} mins`;

      durationPills.forEach(pill => {
        if (Number(pill.dataset.mins) === mins) {
          pill.classList.add('active');
        } else {
          pill.classList.remove('active');
        }
      });
    }

    // 1-Click Fast Grid Selection
    gridSlotBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const newStart = btn.dataset.time;
        const currentMins = getDurationMinutes(popoverStartInput.value, popoverEndInput.value) || 30;
        const newEnd = addMinutesToTime(newStart, currentMins);
        applyPopoverTime(newStart, newEnd);
        closeTimePopover();
      });
    });

    // 1-Click Micro-Nudge in Popover
    popoverNudgeBack.addEventListener('click', () => {
      const currentStart = popoverStartInput.value || '09:00';
      const duration = getDurationMinutes(currentStart, popoverEndInput.value);
      const newStart = addMinutesToTime(currentStart, -30);
      const newEnd = addMinutesToTime(newStart, duration);
      popoverStartInput.value = newStart;
      popoverEndInput.value = newEnd;
      updatePopoverDuration();
      highlightActiveGridSlot(newStart);
      applyPopoverTime(newStart, newEnd);
    });

    popoverNudgeFwd.addEventListener('click', () => {
      const currentStart = popoverStartInput.value || '09:00';
      const duration = getDurationMinutes(currentStart, popoverEndInput.value);
      const newStart = addMinutesToTime(currentStart, 30);
      const newEnd = addMinutesToTime(newStart, duration);
      popoverStartInput.value = newStart;
      popoverEndInput.value = newEnd;
      updatePopoverDuration();
      highlightActiveGridSlot(newStart);
      applyPopoverTime(newStart, newEnd);
    });

    // 1-Click Duration Selection
    durationPills.forEach(pill => {
      pill.addEventListener('click', () => {
        const mins = Number(pill.dataset.mins);
        const currentStart = popoverStartInput.value || '09:00';
        const newEnd = addMinutesToTime(currentStart, mins);
        popoverEndInput.value = newEnd;
        updatePopoverDuration();
        applyPopoverTime(currentStart, newEnd);
      });
    });

    // Manual custom inputs change
    popoverStartInput.addEventListener('change', () => {
      const activePill = document.querySelector('.duration-pill.active');
      const duration = activePill ? Number(activePill.dataset.mins) : 30;
      popoverEndInput.value = addMinutesToTime(popoverStartInput.value, duration);
      updatePopoverDuration();
      highlightActiveGridSlot(popoverStartInput.value);
      applyPopoverTime(popoverStartInput.value, popoverEndInput.value);
    });

    popoverEndInput.addEventListener('change', () => {
      updatePopoverDuration();
      applyPopoverTime(popoverStartInput.value, popoverEndInput.value);
    });

    // Clear time
    popoverClearBtn.addEventListener('click', () => {
      applyPopoverTime('', '');
      closeTimePopover();
    });

    function applyPopoverTime(start, end) {
      if (!activePopoverContext) return;

      if (activePopoverContext.type === 'quick') {
        selectedAddStart = start;
        selectedAddEnd = end;
        updateQuickAddTimeDisplay();
      } else if (activePopoverContext.type === 'task') {
        updateTaskItem(activePopoverContext.taskId, { startTime: start, endTime: end });
      }
    }

    quickAddTimeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      openTimePopover(quickAddTimeBtn, selectedAddStart, selectedAddEnd, { type: 'quick' });
    });

    document.addEventListener('click', (e) => {
      if (timePopover.classList.contains('open') && !timePopover.contains(e.target)) {
        closeTimePopover();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && timePopover.classList.contains('open')) {
        closeTimePopover();
      }
    });

    // --- Sort by Time Toggle ---
    function updateSortBtnDisplay() {
      if (sortByTime) {
        sortByTimeBtn.classList.add('active');
        sortByTimeLabel.textContent = 'Time sorted';
      } else {
        sortByTimeBtn.classList.remove('active');
        sortByTimeLabel.textContent = 'Sort by time';
      }
    }

    sortByTimeBtn.addEventListener('click', () => {
      sortByTime = !sortByTime;
      localStorage.setItem(SORT_TIME_KEY, sortByTime ? 'true' : 'false');
      updateSortBtnDisplay();
      renderTasks();
    });

    // --- Add Task (Intelligent Auto-Detection & Slotting) ---
    async function addTask(text, targetDate, startTime = '', endTime = '') {
      const clean = text.trim();
      if (!clean) return;

      const parsed = parseTimeFromText(clean);
      const finalText = parsed ? parsed.cleanText : clean;
      const finalStart = parsed ? parsed.startTime : (startTime || '');
      const finalEnd = parsed ? parsed.endTime : (endTime || (finalStart ? addMinutesToTime(finalStart, 30) : ''));

      const today = getLocalISODate();
      if (targetDate > today && currentView === 'all') {
        currentView = 'upcoming';
        updateFilterDisplay();
      }

      if (currentUser) {
        try {
          await addDoc(collection(db, 'tasks'), {
            text: finalText,
            date: targetDate,
            startTime: finalStart,
            endTime: finalEnd,
            completed: false,
            createdAt: Date.now(),
            uid: currentUser.uid
          });
        } catch (err) {
          console.error('Error adding cloud task:', err);
        }
      } else {
        const newTask = {
          id: 'task_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
          text: finalText,
          date: targetDate,
          startTime: finalStart,
          endTime: finalEnd,
          completed: false,
          createdAt: Date.now()
        };
        tasks.push(newTask);
        saveTasks();
        renderTasks();
      }
    }

    // --- Cloud Sync Helper Functions ---
    async function updateTaskItem(taskId, updates) {
      const task = tasks.find(t => t.id === taskId);
      if (task) {
        Object.assign(task, updates);
        if (currentUser) {
          try {
            await updateDoc(doc(db, 'tasks', taskId), updates);
          } catch (err) {
            console.error('Error updating cloud task:', err);
          }
        } else {
          saveTasks();
        }
        renderTasks();
      }
    }

    async function deleteTaskItem(taskId) {
      if (currentUser) {
        try {
          await deleteDoc(doc(db, 'tasks', taskId));
        } catch (err) {
          console.error('Error deleting cloud task:', err);
        }
      } else {
        tasks = tasks.filter(t => t.id !== taskId);
        saveTasks();
        renderTasks();
      }
    }


    quickAddInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addTask(quickAddInput.value, selectedAddDate, selectedAddStart, selectedAddEnd);
        quickAddInput.value = '';
        selectedAddStart = '';
        selectedAddEnd = '';
        updateQuickAddTimeDisplay();
      }
    });

    // --- Stats Update (Header stats removed) ---
    function updateStats() {
      // Intentionally empty: header stats removed as requested
    }

    // --- Filtering Logic ---
    function getFilteredTasks() {
      const today = getLocalISODate();

      if (specificDateFilter) {
        return tasks.filter(t => t.date === specificDateFilter);
      }

      switch (currentView) {
        case 'today':
          return tasks.filter(t => t.date === today);
        case 'this-week': {
          const currentWeekDates = getWeekDates(0);
          const start = currentWeekDates[0];
          const end = currentWeekDates[6];
          return tasks.filter(t => t.date >= start && t.date <= end);
        }
        case 'upcoming':
          return tasks.filter(t => t.date >= today);
        case 'completed':
          return tasks.filter(t => t.completed);
        case 'all':
        default:
          // Default list view: Today and previous days descending
          return tasks.filter(t => !t.date || t.date <= today);
      }
    }

    // --- Sorting Logic (Default: Chronological by Time) ---
    function sortTaskList(taskList) {
      return [...taskList].sort((a, b) => {
        if (a.date !== b.date) {
          return a.date.localeCompare(b.date);
        }

        if (sortByTime) {
          const aHasTime = Boolean(a.startTime);
          const bHasTime = Boolean(b.startTime);

          if (aHasTime && bHasTime) {
            const timeDiff = a.startTime.localeCompare(b.startTime);
            if (timeDiff !== 0) return timeDiff;
            if (a.endTime && b.endTime) {
              const endDiff = a.endTime.localeCompare(b.endTime);
              if (endDiff !== 0) return endDiff;
            }
          } else if (aHasTime && !bHasTime) {
            return -1;
          } else if (!aHasTime && bHasTime) {
            return 1;
          }
        }

        return a.createdAt - b.createdAt;
      });
    }

    // --- Render Logic (Descending Days: Today at top, followed by previous days) ---
    function renderTasks() {
      if (isTableView) {
        renderWeekTable();
        return;
      }

      const today = getLocalISODate();
      const tomorrow = addDays(today, 1);
      const filtered = getFilteredTasks();

      // Future task count for Plan ahead button
      const futureTasks = tasks.filter(t => t.date && t.date > today);
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
      if ((currentView === 'all' || currentView === 'today') && !specificDateFilter) {
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
      // In upcoming / this-week view: ascending forward in time (today, tomorrow, next day)
      // In all / standard view: descending (today at top, then yesterday, then earlier days)
      const sortedDates = Array.from(dateSet).sort((a, b) => {
        if (a === 'Undated') return 1;
        if (b === 'Undated') return -1;
        if (currentView === 'upcoming' || currentView === 'this-week') {
          return a.localeCompare(b); // Ascending forward in time
        }
        return b.localeCompare(a); // Descending: Today at top, then yesterday, then previous days
      });

      sortedDates.forEach(dateKey => {
        const groupTasks = groupsMap.get(dateKey) || [];
        const sortedGroupTasks = sortTaskList(groupTasks);
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

          <!-- Left-side Time Range Pill & Micro-Nudge Controls -->
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

          <!-- Task Main Text -->
          <div class="task-main">
            <span class="task-text" contenteditable="true" spellcheck="false">${escapeHtml(task.text)}</span>
          </div>

          <!-- Task Meta Actions (Date & Delete) -->
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
        checkbox.addEventListener('change', () => {
          updateTaskItem(task.id, { completed: checkbox.checked });
        });

        // 1-Click Micro-Nudge Back (-30m)
        const nudgePrev = row.querySelector('.nudge-prev');
        nudgePrev.addEventListener('click', (e) => {
          e.stopPropagation();
          const baseStart = task.startTime || '09:00';
          const duration = getDurationMinutes(baseStart, task.endTime);
          const newStart = addMinutesToTime(baseStart, -30);
          const newEnd = addMinutesToTime(newStart, duration);
          updateTaskItem(task.id, { startTime: newStart, endTime: newEnd });
        });

        // 1-Click Micro-Nudge Forward (+30m)
        const nudgeNext = row.querySelector('.nudge-next');
        nudgeNext.addEventListener('click', (e) => {
          e.stopPropagation();
          const baseStart = task.startTime || '09:00';
          const duration = getDurationMinutes(baseStart, task.endTime);
          const newStart = addMinutesToTime(baseStart, 30);
          const newEnd = addMinutesToTime(newStart, duration);
          updateTaskItem(task.id, { startTime: newStart, endTime: newEnd });
        });

        // Open 1-Click Time Grid
        const timePill = row.querySelector('.task-time-pill');
        timePill.addEventListener('click', (e) => {
          e.stopPropagation();
          openTimePopover(timePill, task.startTime, task.endTime, { type: 'task', taskId: task.id });
        });

        // Inline edit text
        const textEl = row.querySelector('.task-text');
        textEl.addEventListener('blur', () => {
          const newText = textEl.textContent.trim();
          if (newText && newText !== task.text) {
            const parsed = parseTimeFromText(newText);
            if (parsed) {
              updateTaskItem(task.id, { text: parsed.cleanText, startTime: parsed.startTime, endTime: parsed.endTime });
            } else {
              updateTaskItem(task.id, { text: newText });
            }
          } else if (!newText) {
            deleteTaskItem(task.id);
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

        datePicker.addEventListener('change', (e) => {
          if (e.target.value) {
            updateTaskItem(task.id, { date: e.target.value });
          }
        });

        // Delete
        const delBtn = row.querySelector('.delete-btn');
        delBtn.addEventListener('click', () => {
          deleteTaskItem(task.id);
        });

        taskListEl.appendChild(row);
      });

      const inlineAdd = groupEl.querySelector('.inline-add-row');
      inlineAdd.addEventListener('click', () => {
        focusInlineAdd(dateKey);
      });

      return groupEl;
    }

        function escapeHtml(text) {
      const div = document.createElement('div');
      div.textContent = text;
      return div.innerHTML;
    }

    function focusInlineAdd(dateKey) {
      selectedAddDate = dateKey;
      updateQuickAddDateDisplay();
      quickAddInput.focus();
    }

    // --- Filter Dropdown Navigation ---
    function updateFilterDisplay() {
      filterMenuItems.forEach(item => {
        const isMatch = !isTableView && !specificDateFilter && item.dataset.view === currentView;
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

      if (isTableView) {
        filterBtnLabel.textContent = 'Filter';
        filterDropdownBtn.classList.remove('active');
      } else if (specificDateFilter) {
        filterBtnLabel.textContent = `Filter: ${formatShortDate(specificDateFilter)}`;
        filterDropdownBtn.classList.add('active');
      } else if (currentView !== 'all') {
        const viewLabels = {
          today: 'Today',
          'this-week': 'This Week',
          upcoming: 'Upcoming',
          completed: 'Completed'
        };
        filterBtnLabel.textContent = `Filter: ${viewLabels[currentView] || currentView}`;
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
        isTableView = false;
        currentView = btn.dataset.view;
        specificDateFilter = null;
        dateFilterInput.value = '';
        filterDropdownWrap.classList.remove('open');
        updateViewModeDisplay();
        updateFilterDisplay();
        renderTasks();
      });
    });

    dateFilterInput.addEventListener('change', (e) => {
      if (e.target.value) {
        isTableView = false;
        specificDateFilter = e.target.value;
        updateViewModeDisplay();
        updateFilterDisplay();
        renderTasks();
      } else {
        specificDateFilter = null;
        updateFilterDisplay();
        renderTasks();
      }
    });

    document.addEventListener('click', (e) => {
      if (filterDropdownWrap && !filterDropdownWrap.contains(e.target)) {
        filterDropdownWrap.classList.remove('open');
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && filterDropdownWrap && filterDropdownWrap.classList.contains('open')) {
        filterDropdownWrap.classList.remove('open');
      }
    });

    // --- Persistent Storage & Backup Logic ---
    const syncFileBtn = document.getElementById('syncFileBtn');
    const exportBtn = document.getElementById('exportBtn');
    const importBtn = document.getElementById('importBtn');
    const importFileInput = document.getElementById('importFileInput');
    const storageStatusText = document.getElementById('storageStatusText');

    // Request browser storage persistence to prevent OS eviction
    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {});
    }

    // Direct Disk File Sync (File System Access API)
    async function writeToDiskFile() {
      if (!diskFileHandle) return;
      clearTimeout(diskWriteTimeout);
      diskWriteTimeout = setTimeout(async () => {
        try {
          const writable = await diskFileHandle.createWritable();
          await writable.write(JSON.stringify(tasks, null, 2));
          await writable.close();
          storageStatusText.textContent = `● Synced to ${diskFileHandle.name}`;
        } catch (err) {
          console.warn('Could not write to disk file', err);
          storageStatusText.textContent = `Sync failed (${diskFileHandle.name})`;
        }
      }, 250);
    }

    async function connectDiskFile() {
      if (!window.showSaveFilePicker && !window.showOpenFilePicker) {
        alert('Your browser does not support the File System Access API. Use the Export / Import buttons below to backup and restore your files across browser resets.');
        return;
      }

      try {
        diskFileHandle = await window.showSaveFilePicker({
          suggestedName: 'tasks.json',
          types: [{
            description: 'JSON Data File',
            accept: { 'application/json': ['.json'] }
          }]
        });

        // If file already has data, load it; otherwise save current tasks into it
        const file = await diskFileHandle.getFile();
        if (file.size > 0) {
          const content = await file.text();
          try {
            const parsed = JSON.parse(content);
            if (Array.isArray(parsed)) {
              tasks = parsed;
              saveTasks();
              renderTasks();
            }
          } catch (e) {
            // write current tasks to file
            writeToDiskFile();
          }
        } else {
          writeToDiskFile();
        }

        storageStatusText.textContent = `● Synced to ${diskFileHandle.name}`;
        syncFileBtn.textContent = 'Linked: ' + diskFileHandle.name;
        syncFileBtn.classList.add('active');
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(err);
          alert('Could not link file: ' + err.message);
        }
      }
    }

    if (syncFileBtn) syncFileBtn.addEventListener('click', connectDiskFile);

    // 1-Click JSON Export
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        const blob = new Blob([JSON.stringify(tasks, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `todo-do-backup-${getLocalISODate()}.json`;
        a.click();
        URL.revokeObjectURL(url);
      });
    }

    // 1-Click JSON Import
    if (importBtn && importFileInput) {
      importBtn.addEventListener('click', () => {
        importFileInput.click();
      });

      importFileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
          try {
            const imported = JSON.parse(event.target.result);
            if (Array.isArray(imported)) {
              tasks = imported;
              saveTasks();
              renderTasks();
              alert(`Successfully loaded ${imported.length} tasks!`);
            } else {
              alert('Invalid backup format: expected an array of tasks.');
            }
          } catch (err) {
            alert('Error parsing JSON backup file.');
          }
        };
        reader.readAsText(file);
        importFileInput.value = '';
      });
    }

    // --- Footer Actions ---
    if (clearCompletedBtn) {
      clearCompletedBtn.addEventListener('click', () => {
        tasks = tasks.filter(t => !t.completed);
        saveTasks();
        renderTasks();
      });
    }

    if (resetSampleBtn) {
      resetSampleBtn.addEventListener('click', () => {
        tasks = getDefaultTasks();
        saveTasks();
        renderTasks();
      });
    }

    // --- Global Shortcuts ---
    window.addEventListener('keydown', (e) => {
      if (e.key === '/' && document.activeElement !== quickAddInput && document.activeElement.getAttribute('contenteditable') !== 'true') {
        e.preventDefault();
        quickAddInput.focus();
      }
    });

    // --- Notion-Style Inline Weekly Table Logic ---
    const weekTableBtn = document.getElementById('weekTableBtn');
    const weekTableBtnLabel = document.getElementById('weekTableBtnLabel');
    const weekTableBtnIcon = document.getElementById('weekTableBtnIcon');
    let isTableView = false;
    let currentWeekOffset = 0;

    function formatWeekRangeLabel(dates) {
      if (!dates || dates.length < 7) return '';
      const startParts = dates[0].split('-').map(Number);
      const endParts = dates[6].split('-').map(Number);
      const startObj = new Date(startParts[0], startParts[1] - 1, startParts[2]);
      const endObj = new Date(endParts[0], endParts[1] - 1, endParts[2]);

      const startMonth = startObj.toLocaleDateString(undefined, { month: 'short' });
      const endMonth = endObj.toLocaleDateString(undefined, { month: 'short' });
      const year = endObj.getFullYear();

      if (startMonth === endMonth) {
        return `${startMonth} ${startObj.getDate()} – ${endObj.getDate()}, ${year}`;
      }
      return `${startMonth} ${startObj.getDate()} – ${endMonth} ${endObj.getDate()}, ${year}`;
    }

    function updateViewModeDisplay() {
      if (isTableView) {
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
      isTableView = !isTableView;
      updateViewModeDisplay();
      renderTasks();
    });

    if (planAheadToolbarBtn) {
      planAheadToolbarBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        planAheadDropdownWrap.classList.toggle('open');
      });
    }

    if (planTomorrowBtn) {
      planTomorrowBtn.addEventListener('click', () => {
        const today = getLocalISODate();
        selectedAddDate = addDays(today, 1);
        updateQuickAddDateDisplay();
        planAheadDropdownWrap.classList.remove('open');
        quickAddInput.focus();
      });
    }

    if (planDayAfterBtn) {
      planDayAfterBtn.addEventListener('click', () => {
        const today = getLocalISODate();
        selectedAddDate = addDays(today, 2);
        updateQuickAddDateDisplay();
        planAheadDropdownWrap.classList.remove('open');
        quickAddInput.focus();
      });
    }

    if (planNextWeekBtn) {
      planNextWeekBtn.addEventListener('click', () => {
        const today = getLocalISODate();
        selectedAddDate = addDays(today, 7);
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
          selectedAddDate = e.target.value;
          updateQuickAddDateDisplay();
          planAheadDropdownWrap.classList.remove('open');
          quickAddInput.focus();
        }
      });
    }

    if (planViewUpcomingBtn) {
      planViewUpcomingBtn.addEventListener('click', () => {
        isTableView = false;
        currentView = 'upcoming';
        specificDateFilter = null;
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
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && planAheadDropdownWrap && planAheadDropdownWrap.classList.contains('open')) {
        planAheadDropdownWrap.classList.remove('open');
      }
    });

    function renderWeekTable() {
      const weekDates = getWeekDates(currentWeekOffset);
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

      dateGroupsContainer.innerHTML = `
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

      // Week navigation
      document.getElementById('weekPrevBtn').addEventListener('click', () => {
        currentWeekOffset--;
        renderWeekTable();
      });
      document.getElementById('weekNextBtn').addEventListener('click', () => {
        currentWeekOffset++;
        renderWeekTable();
      });
      document.getElementById('weekThisWeekBtn').addEventListener('click', () => {
        currentWeekOffset = 0;
        renderWeekTable();
      });

      // Clicking a task toggles completed state
      dateGroupsContainer.querySelectorAll('.matrix-task-item').forEach(item => {
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          const taskId = item.dataset.id;
          const task = tasks.find(t => t.id === taskId);
          if (task) {
            task.completed = !task.completed;
            saveTasks();
            updateStats();
            renderWeekTable();
          }
        });
      });

      // Clicking an empty cell selects date/time and focuses add input
      dateGroupsContainer.querySelectorAll('.matrix-cell').forEach(cell => {
        cell.addEventListener('click', () => {
          const dateStr = cell.dataset.date;
          const startTime = cell.dataset.start;
          const endTime = cell.dataset.end;
          selectedAddDate = dateStr;
          if (startTime) {
            selectedAddStart = startTime;
            selectedAddEnd = endTime;
          }
          updateQuickAddDateDisplay();
          updateQuickAddTimeDisplay();
          quickAddInput.focus();
        });
      });
    }

    // Initial setup
    initTheme();
    updateQuickAddDateDisplay();
    updateQuickAddTimeDisplay();
    updateSortBtnDisplay();
    updateViewModeDisplay();
    updateFilterDisplay();
    updateStats();
    renderTasks();
  

    // --- Firebase Auth & Firestore Sync Lifecycle ---
    function updateAuthUI() {
      if (currentUser) {
        if (googleSignInBtn) googleSignInBtn.style.display = 'none';
        if (authUserWrap) authUserWrap.style.display = 'inline-flex';
        if (userDisplayName) {
          userDisplayName.textContent = currentUser.displayName || currentUser.email || 'User';
        }
      } else {
        if (googleSignInBtn) googleSignInBtn.style.display = 'inline-flex';
        if (authUserWrap) authUserWrap.style.display = 'none';
      }
    }

    function initFirestoreSync(user) {
      if (unsubscribeFirestore) {
        unsubscribeFirestore();
      }

      if (storageStatusText) storageStatusText.textContent = 'Syncing cloud tasks...';

      const q = query(collection(db, 'tasks'), where('uid', '==', user.uid));

      unsubscribeFirestore = onSnapshot(q, async (snapshot) => {
        const cloudTasks = snapshot.docs.map(docSnap => ({
          id: docSnap.id,
          ...docSnap.data()
        }));

        // If cloud is empty but local had tasks, migrate them seamlessly
        if (cloudTasks.length === 0 && tasks.length > 0) {
          const batch = writeBatch(db);
          tasks.forEach(localTask => {
            const newRef = doc(collection(db, 'tasks'));
            batch.set(newRef, {
              text: localTask.text,
              date: localTask.date,
              startTime: localTask.startTime || '',
              endTime: localTask.endTime || '',
              completed: Boolean(localTask.completed),
              createdAt: localTask.createdAt || Date.now(),
              uid: user.uid
            });
          });
          await batch.commit();
          return;
        }

        tasks = cloudTasks;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(tasks));
        renderTasks();
        if (storageStatusText) {
          storageStatusText.textContent = `● Cloud Live (${user.email || 'Active'})`;
        }
      }, (err) => {
        console.error('Firestore sync error:', err);
        if (storageStatusText) {
          storageStatusText.textContent = 'Cloud offline (saved locally)';
        }
      });
    }

    if (googleSignInBtn) {
      googleSignInBtn.addEventListener('click', async () => {
        try {
          await signInWithPopup(auth, googleProvider);
        } catch (err) {
          if (err.code !== 'auth/popup-closed-by-user') {
            console.error('Sign in error:', err);
            alert('Sign-in error: ' + err.message);
          }
        }
      });
    }

    if (googleSignOutBtn) {
      googleSignOutBtn.addEventListener('click', async () => {
        try {
          await signOut(auth);
        } catch (err) {
          console.error('Sign out error:', err);
        }
      });
    }

    onAuthStateChanged(auth, (user) => {
      currentUser = user;
      updateAuthUI();
      if (user) {
        initFirestoreSync(user);
      } else {
        if (unsubscribeFirestore) {
          unsubscribeFirestore();
          unsubscribeFirestore = null;
        }
        tasks = loadTasks();
        renderTasks();
        if (storageStatusText) {
          storageStatusText.textContent = 'Auto-saved locally (Sign in to sync)';
        }
      }
    });
