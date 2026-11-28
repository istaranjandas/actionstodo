// Main Application Shell & UI Coordinator
// Manual mode: the Lantern Path — a drawn valley where each task is a lantern on the day's trail. Desktop
// floats the day slate (and All days) over it (DesktopShell); phones get the same world as an app screen
// (PhoneShell).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, onAuthStateChanged } from './firebase';
import { addDays, getLocalISODate } from './modules/dateUtils';
import { ensureRecurringOccurrences, initFirestoreSync, setUiState, state, stopFirestoreSync, summarizeView, updateTaskItem } from './modules/store';
import { setupTaskDragAndDrop } from './modules/listDrag';
import { moveTask } from './modules/taskActions';
import { countForView, daysFromToday, NAV_ITEMS } from './modules/navigation';
import type { NavKey } from './modules/navigation';
import { THEME_KEY, applyThemeAttribute, readRenderedTheme } from './modules/theme';
import { useStore } from './hooks/useStore';
import { useMediaQuery } from './hooks/useMediaQuery';
import { COMPACT_QUERY, DESKTOP_SCROLL_PANE_QUERY, useMotionProfile } from './hooks/useMotionProfile';
import { readScrollTop, restoreScrollPosition, useSmoothScroll } from './hooks/useSmoothScroll';
import { useUiSounds } from './hooks/useUiSounds';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { usePreservedValue } from './hooks/usePreservedValue';
import { playUiSound } from './audio/uiSounds';
import { swellAmbientMusic } from './audio/ambientMusic';
import { clampDayOffset, FUTURE_DAY_LIMIT, PAST_DAY_LIMIT } from './world/trail';
import type { WorldLens } from './world/worldViews';
import { SystemMenu } from './components/SystemMenu';
import { PhoneShell } from './components/PhoneShell';
import { DesktopShell } from './components/DesktopShell';
import { TaskInspector } from './components/TaskInspector';
import { TaskSelectionContext } from './components/TaskSelection';
import { QuickAddForm } from './components/QuickAddForm';
import { Sheet } from './components/Sheet';
import { Toasts } from './components/Toasts';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { InspectorSlate } from './components/InspectorSlate';
import { TimePopover, TimePopoverContext } from './components/TimePopover';
import type { OpenTimePopover, TimePopoverHandle } from './components/TimePopover';
import type { Theme, TimePopoverContext as PopoverTarget, ViewName } from './types';

const HEADER_CONDENSE_OFFSET = 12;

export function App() {
  const appState = useStore();
  const { prefersReducedMotion, isTouchDevice } = useMotionProfile();
  const isWide = useMediaQuery(DESKTOP_SCROLL_PANE_QUERY);
  const isCompact = !isWide;
  // Phones get the Lantern Path as an app screen (PhoneShell); wider screens float the slate over it
  const isPhone = useMediaQuery(COMPACT_QUERY);
  const [theme, setTheme] = useState<Theme>(readRenderedTheme);
  const [scrollPane, setScrollPane] = useState<HTMLElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const timePopoverRef = useRef<TimePopoverHandle>(null);
  const scrollMemory = useRef(new Map<string, number>());

  const { tasks, currentView, specificDateFilter } = appState;
  // Held in state so the shell re-renders when the local date changes, even with no store update
  const [today, setToday] = useState(getLocalISODate);
  const todayRef = useRef(today);
  // A picked date, or the Today lens, opens one day on the slate; All days spreads into a board of day cards
  const focusDate = specificDateFilter ?? (currentView === 'today' ? today : null);
  const worldLens: WorldLens = focusDate ? 'day' : (currentView as WorldLens);
  const focusOffset = focusDate ? clampDayOffset(daysFromToday(focusDate)) : 0;
  const viewKey = specificDateFilter ? `date:${specificDateFilter}` : currentView;
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null;
  // Lens badges, the slate header and the day cards all count through summarizeView (store.ts).
  // `today` is a dependency so every count rolls over together at midnight.
  // Open tasks waiting on every other day: the count on the "Show all days" row under today's log
  const otherDaysOpen = useMemo(() => countForView('all', tasks)! - countForView('today', tasks)!, [tasks, today]);
  const viewSummary = useMemo(() => summarizeView(tasks, currentView, specificDateFilter), [tasks, currentView, specificDateFilter, today]);
  const viewTasks = viewSummary.tasks;

  // --- Recurring series ---
  // Materialise the rolling horizon whenever tasks arrive (login, a new series, a snapshot) and
  // once a minute so a tab left open overnight rolls into the new day without a refresh.
  useEffect(() => {
    ensureRecurringOccurrences();
    const timer = window.setInterval(ensureRecurringOccurrences, 60_000);
    return () => window.clearInterval(timer);
  }, [tasks]);

  // --- Midnight rollover ---
  // Checked on a timer and whenever the tab returns, since timers are throttled in the background.
  // Quick-add follows the new day only if it was still pointing at the old today.
  useEffect(() => {
    const checkDay = () => {
      const now = getLocalISODate();
      const previous = todayRef.current;
      if (now === previous) return;
      todayRef.current = now;
      if (state.selectedAddDate === previous) setUiState({ selectedAddDate: now });
      setToday(now);
    };
    const timer = window.setInterval(checkDay, 30_000);
    document.addEventListener('visibilitychange', checkDay);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', checkDay);
    };
  }, []);

  // --- Theme ("time of day") ---
  useEffect(() => {
    applyThemeAttribute(theme);
  }, [theme]);

  const applyTheme = useCallback((next: Theme) => {
    setTheme(next);
    try {
      localStorage.setItem(THEME_KEY, next);
    } catch {
      // Storage can be blocked; the theme still applies for this visit
    }
  }, []);

  // Upcoming, Week and Done left the dock; a stale lens falls back to today's log
  useEffect(() => {
    if (!NAV_ITEMS.some(item => item.key === currentView)) setUiState({ currentView: 'today' });
  }, [currentView]);

  // --- Drag & drop: day cards, the Today log and timeline beads all take dropped tasks ---
  useEffect(() => setupTaskDragAndDrop({
    getTask: (id) => state.tasks.find(t => t.id === id),
    onMove: moveTask
  }), []);

  // --- Firebase Authentication Lifecycle ---
  useEffect(() => {
    return onAuthStateChanged(auth, (user) => {
      setUiState({ currentUser: user });
      if (user) {
        initFirestoreSync(user);
      } else {
        stopFirestoreSync();
      }
    });
  }, []);

  // --- Motion & sound ---
  useUiSounds();

  const scroller = useSmoothScroll({
    scrollPane,
    usePaneAsScroller: true,
    smoothingEnabled: !prefersReducedMotion && !isTouchDevice
  });
  useEffect(() => {
    if (!scroller) return;
    const handleScroll = () => setIsScrolled(readScrollTop(scroller) > HEADER_CONDENSE_OFFSET);
    handleScroll();
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, [scroller]);

  // Each view keeps its own scroll position, so returning to it restores your place
  const viewKeyRef = useRef(viewKey);
  const rememberScroll = useCallback(() => {
    if (scroller) scrollMemory.current.set(viewKeyRef.current, readScrollTop(scroller));
  }, [scroller]);

  useEffect(() => {
    viewKeyRef.current = viewKey;
    if (!scroller) return;
    const savedTop = scrollMemory.current.get(viewKey) ?? 0;
    const frame = requestAnimationFrame(() => restoreScrollPosition(scroller, savedTop));
    return () => cancelAnimationFrame(frame);
  }, [viewKey, scroller]);

  // Every move along the path is a camera journey: the world flies, the soundtrack breathes with it
  const journeyKey = `${worldLens}:${focusOffset}`;
  const previousJourneyKey = useRef(journeyKey);
  useEffect(() => {
    if (previousJourneyKey.current === journeyKey) return;
    previousJourneyKey.current = journeyKey;
    playUiSound('travel');
    swellAmbientMusic();
  }, [journeyKey]);

  // --- Navigation along the path ---
  const selectView = useCallback((view: ViewName) => {
    const updates: Parameters<typeof setUiState>[0] = { currentView: view, specificDateFilter: null };
    if (state.specificDateFilter) {
      updates.selectedAddDate = getLocalISODate();
    }
    setUiState(updates);
  }, []);

  const selectLens = useCallback((key: NavKey) => {
    rememberScroll();
    selectView(key);
  }, [rememberScroll, selectView]);

  // Focusing a day walks to its waypost; new tasks then go to that day
  const focusDay = useCallback((date: string) => {
    rememberScroll();
    if (date === getLocalISODate()) {
      setUiState({ currentView: 'today', specificDateFilter: null, selectedAddDate: date });
    } else {
      setUiState({ specificDateFilter: date, selectedAddDate: date });
    }
  }, [rememberScroll]);

  const stepDay = useCallback((step: 1 | -1) => {
    const base = state.specificDateFilter ?? getLocalISODate();
    const next = addDays(base, step);
    if (Math.abs(daysFromToday(next)) > Math.max(PAST_DAY_LIMIT, FUTURE_DAY_LIMIT)) return;
    playUiSound('select');
    focusDay(next);
  }, [focusDay]);

  // Back from a picked date to the lens underneath, with its scroll intact
  const returnToLens = useCallback(() => {
    rememberScroll();
    setUiState({ specificDateFilter: null, selectedAddDate: getLocalISODate() });
  }, [rememberScroll]);

  const focusQuickAdd = useCallback(() => {
    window.setTimeout(() => quickAddInputRef.current?.focus(), 60);
  }, []);

  // --- Task selection & details ---
  const openTask = useCallback((taskId: string, viaKeyboard = false) => {
    setSelectedTaskId(taskId);
    if (viaKeyboard) requestAnimationFrame(() => document.querySelector<HTMLElement>('.inspector-title')?.focus());
  }, []);

  const closeTask = useCallback(() => {
    const taskId = selectedTaskId;
    setSelectedTaskId(null);
    if (taskId && document.activeElement?.closest('.inspector, .sheet-panel')) {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`.task-row[data-id="${taskId}"], .dk-row[data-id="${taskId}"]`)?.focus());
    }
  }, [selectedTaskId]);

  useEffect(() => {
    if (selectedTaskId && !tasks.some(t => t.id === selectedTaskId)) setSelectedTaskId(null);
  }, [tasks, selectedTaskId]);

  const taskSelection = useMemo(() => ({ selectedTaskId, openTask }), [selectedTaskId, openTask]);

  const handleEscape = useCallback(() => {
    if (isShortcutsOpen) setIsShortcutsOpen(false);
    else if (selectedTaskId) closeTask();
    else if (state.specificDateFilter) returnToLens();
    else if (state.currentView !== 'today') selectLens('today');
  }, [isShortcutsOpen, selectedTaskId, closeTask, returnToLens, selectLens]);

  // One tab: today's log opens into every day and folds back again
  const toggleAllDays = useCallback(() => {
    selectLens(state.currentView === 'all' && !state.specificDateFilter ? 'today' : 'all');
  }, [selectLens]);

  useGlobalShortcuts(
    {
      onSelectNav: selectLens,
      onStepNav: stepDay,
      onNewTask: focusQuickAdd,
      onEscape: handleEscape,
      onToggleShortcuts: () => setIsShortcutsOpen(open => !open),
      onToggleAllDays: toggleAllDays,
      onToday: () => focusDay(getLocalISODate())
    }
  );

  // --- Time Popover ---
  const openTimePopover = useCallback<OpenTimePopover>((triggerEl, start, end, context) => {
    timePopoverRef.current?.open(triggerEl, start, end, context);
  }, []);

  const handleTimeApplied = useCallback((start: string, end: string, context: PopoverTarget) => {
    if (context.type === 'quick') {
      setUiState({ selectedAddStart: start, selectedAddEnd: end });
    } else {
      updateTaskItem(context.taskId, { startTime: start, endTime: end });
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle('is-phone-app', isPhone);
  }, [isPhone]);

  // Wider screens float the slate over the same Lantern Path (DesktopShell)
  const isLanternDesk = !isPhone;
  useEffect(() => {
    document.body.classList.toggle('is-lantern-desk', isLanternDesk);
  }, [isLanternDesk]);

  // --- Where we are: the slate header names the day; the buttons only need the way back ---
  const backTargetLabel = NAV_ITEMS.find(item => item.key === currentView)?.label ?? 'path';
  const backLabel = specificDateFilter && currentView !== 'today' ? `Back to ${backTargetLabel}` : specificDateFilter ? 'Back to today' : null;

  const lastSheetTask = usePreservedValue(selectedTask);

  // The mascot key in the top-right corner: profile and settings
  const systemMenu = (
    <SystemMenu
      appState={appState}
      theme={theme}
      onSetTheme={applyTheme}
      onOpenControls={() => setIsShortcutsOpen(true)}
    />
  );

  return (
    <TaskSelectionContext.Provider value={taskSelection}>
      <TimePopoverContext.Provider value={openTimePopover}>
        {isPhone && (
          <PhoneShell
            tasks={tasks}
            today={today}
            focusDate={focusDate}
            isPickedDate={Boolean(specificDateFilter)}
            dayTasks={viewTasks}
            isScrolled={isScrolled}
            scrollRef={setScrollPane}
            onOpenAll={() => selectLens('all')}
            onCloseAll={() => selectLens('today')}
            onBack={returnToLens}
            onPickDate={focusDay}
            profile={systemMenu}
            composer={<QuickAddForm appState={appState} quickAddInputRef={quickAddInputRef} placeholder="Place a lantern, like “Call Alex at 5pm”" />}
            theme={theme}
            onSetTheme={applyTheme}
          />
        )}

        {isLanternDesk && (
          <DesktopShell
            tasks={tasks}
            today={today}
            focusDate={focusDate}
            isPickedDate={Boolean(specificDateFilter)}
            dayTasks={viewTasks}
            otherDaysOpen={otherDaysOpen}
            scrollRef={setScrollPane}
            backLabel={backLabel}
            onToggleAllDays={toggleAllDays}
            onBack={returnToLens}
            onPickDate={focusDay}
            profile={systemMenu}
            composer={<QuickAddForm appState={appState} quickAddInputRef={quickAddInputRef} placeholder="Place a lantern, like “Gym at 6pm”" />}
            inspector={!isCompact && <InspectorSlate task={selectedTask} onClose={closeTask} />}
            isInspectorOpen={!isCompact && Boolean(selectedTask)}
            onCloseInspector={closeTask}
            theme={theme}
            onSetTheme={applyTheme}
          />
        )}

        {/* On desktop the portal takes the Lantern tokens too, so toasts, popovers and sheets match the slate */}
        <div className={`hud-dark hud-portal ${isLanternDesk ? 'lp-app' : ''}`}>
          {isCompact && (
            <Sheet isOpen={Boolean(selectedTask)} label="Task details" onClose={closeTask}>
              {lastSheetTask && <TaskInspector key={lastSheetTask.id} task={lastSheetTask} isClosing={false} onClose={closeTask} />}
            </Sheet>
          )}
          <ShortcutsOverlay isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />
          <Toasts />
          <TimePopover ref={timePopoverRef} onTimeApplied={handleTimeApplied} />
        </div>
      </TimePopoverContext.Provider>
    </TaskSelectionContext.Provider>
  );
}
