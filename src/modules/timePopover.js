// Time Popover Modal Handling (1-Click Presets, Duration Pills, Micro-Nudges)
import { addMinutesToTime, getDurationMinutes, getNextSmartSlot } from './timeUtils.js';

export function setupTimePopover({
  onTimeApplied,
  getState
}) {
  const timePopover = document.getElementById('timePopover');
  const popoverStartInput = document.getElementById('popoverStartInput');
  const popoverEndInput = document.getElementById('popoverEndInput');
  const popoverDurationBadge = document.getElementById('popoverDurationBadge');
  const popoverClearBtn = document.getElementById('popoverClearBtn');
  const popoverNudgeBack = document.getElementById('popoverNudgeBack');
  const popoverNudgeFwd = document.getElementById('popoverNudgeFwd');
  const durationPills = document.querySelectorAll('.duration-pill');
  const gridSlotBtns = document.querySelectorAll('.grid-slot-btn');

  let activePopoverContext = null;

  function openTimePopover(triggerEl, startVal, endVal, context) {
    activePopoverContext = context;
    const currentState = getState();

    if (!startVal) {
      const autoSlot = getNextSmartSlot(currentState.selectedAddDate, currentState.tasks);
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

  function applyPopoverTime(start, end) {
    if (!activePopoverContext) return;
    if (onTimeApplied) {
      onTimeApplied(start, end, activePopoverContext);
    }
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
  if (popoverNudgeBack) {
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
  }

  if (popoverNudgeFwd) {
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
  }

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

  // Manual inputs change
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

  return {
    openTimePopover,
    closeTimePopover
  };
}
