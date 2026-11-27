// Main Application Shell & UI Coordinator
// Manual mode: the lantern path — a 3D valley where each day is a waypost and each task a lantern —
// with a day slate, a details slate and the path ribbon floating in it. Phones get a plain app screen
// instead (PhoneShell). Game mode: the quest arena.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { auth, onAuthStateChanged } from './firebase';
import { addDays, getLocalISODate, getWeekDates } from './modules/dateUtils';
import { ensureRecurringOccurrences, initFirestoreSync, setUiState, sortTaskList, state, stopFirestoreSync, summarizeView, updateTaskItem } from './modules/store';
import { setupTaskDragAndDrop } from './modules/listDrag';
import { moveTask } from './modules/taskActions';
import { countForView, daysFromToday, NAV_ITEMS } from './modules/navigation';
import type { NavKey } from './modules/navigation';
import { useDisplaySettings } from './modules/displaySettings';
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
import { rewardCompletedQuests } from './game/state/gameProgress';
import { WorldStage } from './world/WorldStage';
import { worldBridge } from './world/worldBridge';
import type { WorldDay } from './world/worldBridge';
import { clampDayOffset, FUTURE_DAY_LIMIT, PAST_DAY_LIMIT } from './world/trail';
import type { WorldLens } from './world/worldViews';
import { SystemMenu } from './components/SystemMenu';
import { DaySlate } from './components/DaySlate';
import { PhoneShell } from './components/PhoneShell';
import { WorldLabels } from './components/WorldLabels';
import { TaskFeed } from './components/TaskFeed';
import { TaskInspector } from './components/TaskInspector';
import { TaskSelectionContext } from './components/TaskSelection';
import { QuickAddForm } from './components/QuickAddForm';
import { Sheet } from './components/Sheet';
import { Toasts } from './components/Toasts';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { InspectorSlate } from './components/InspectorSlate';
import type { ViewportMode } from './components/ViewportModeToggle';
import { TimePopover, TimePopoverContext } from './components/TimePopover';
import type { OpenTimePopover, TimePopoverHandle } from './components/TimePopover';
import type { Task, Theme, TimePopoverContext as PopoverTarget, ViewName } from './types';

const HEADER_CONDENSE_OFFSET = 12;
const VIEWPORT_MODE_KEY = 'actionstodo_viewport_mode';
const BULK_SYNC_THRESHOLD = 3;

const GameArena = lazy(() => import('./game/GameArena'));

function readInitialViewportMode(): ViewportMode {
  try {
    return localStorage.getItem(VIEWPORT_MODE_KEY) === 'game' ? 'game' : 'manual';
  } catch {
    return 'manual';
  }
}

export function App() {
  const appState = useStore();
  const { prefersReducedMotion, isTouchDevice, hasFinePointer } = useMotionProfile();
  // Animations are off unless the System panel turns them on, so low-end machines stay responsive
  const { animationsEnabled } = useDisplaySettings();
  const reducedMotion = prefersReducedMotion || !animationsEnabled;
  const isWide = useMediaQuery(DESKTOP_SCROLL_PANE_QUERY);
  const isCompact = !isWide;
  // Phones skip the 3D valley for a plain app screen (PhoneShell)
  const isPhone = useMediaQuery(COMPACT_QUERY);
  const [theme, setTheme] = useState<Theme>(readRenderedTheme);
  // "DONE" in the slate header is a toggle: finished work stays out of the log unless asked for
  const [showDone, setShowDone] = useState(true);
  const [scrollPane, setScrollPane] = useState<HTMLElement | null>(null);
  const [isScrolled, setIsScrolled] = useState(false);
  const [viewportMode, setViewportMode] = useState<ViewportMode>(readInitialViewportMode);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [isShortcutsOpen, setIsShortcutsOpen] = useState(false);
  const hasRewardedInitialQuests = useRef(false);
  const rewardedCompletionCount = useRef(0);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const timePopoverRef = useRef<TimePopoverHandle>(null);
  const scrollMemory = useRef(new Map<string, number>());

  const { tasks, currentView, specificDateFilter } = appState;
  // Held in state so the shell re-renders when the local date changes, even with no store update
  const [today, setToday] = useState(getLocalISODate);
  const todayRef = useRef(today);
  // A picked date, or the Today lens, focuses one waypost; the other lenses frame a stretch of path
  const focusDate = specificDateFilter ?? (currentView === 'today' ? today : null);
  // One day reads as a single column beside its waypost; the multi-day lenses spread into a grid of day cards
  const isGridView = !focusDate;
  const worldLens: WorldLens = focusDate ? 'day' : (currentView as WorldLens);
  const focusOffset = focusDate ? clampDayOffset(daysFromToday(focusDate)) : 0;
  const weekStartOffset = daysFromToday(getWeekDates(0)[0]);
  const viewKey = specificDateFilter ? `date:${specificDateFilter}` : currentView;
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null;
  // Lens badges, the slate header and the day cards all count through summarizeView (store.ts).
  // `today` is a dependency so every count rolls over together at midnight.
  // Open tasks waiting on every other day: the count on the "Show all days" row under today's log
  const otherDaysOpen = useMemo(() => countForView('all', tasks)! - countForView('today', tasks)!, [tasks, today]);
  const viewSummary = useMemo(() => summarizeView(tasks, currentView, specificDateFilter), [tasks, currentView, specificDateFilter, today]);
  const viewTasks = viewSummary.tasks;

  // Wayposts for every day on the path that has tasks, plus today and the focused day
  const worldDays = useMemo<WorldDay[]>(() => {
    const byDate = new Map<string, Task[]>();
    const isOnPath = (date: string) => {
      const offset = daysFromToday(date);
      return offset >= -PAST_DAY_LIMIT && offset <= FUTURE_DAY_LIMIT;
    };
    tasks.forEach(task => {
      if (!task.date || !isOnPath(task.date)) return;
      if (!byDate.has(task.date)) byDate.set(task.date, []);
      byDate.get(task.date)!.push(task);
    });
    [today, focusDate].forEach(date => {
      if (date && isOnPath(date) && !byDate.has(date)) byDate.set(date, []);
    });
    return Array.from(byDate.entries())
      .map(([date, dayTasks]) => ({
        date,
        offset: daysFromToday(date),
        tasks: sortTaskList(dayTasks, true).map(task => ({ id: task.id, text: task.text, completed: task.completed, startTime: task.startTime }))
      }))
      .sort((a, b) => a.offset - b.offset);
  }, [tasks, today, focusDate]);

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
  useEffect(() => {
    if (viewportMode !== 'manual') return;
    return setupTaskDragAndDrop({
      getTask: (id) => state.tasks.find(t => t.id === id),
      onMove: moveTask
    });
  }, [viewportMode]);

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

  // --- Motion, sound & 3D choreography ---
  useUiSounds();

  useEffect(() => {
    document.body.classList.toggle('is-reduced-motion', reducedMotion);
  }, [reducedMotion]);

  const motionAllowed = !reducedMotion;
  const scroller = useSmoothScroll({
    scrollPane,
    usePaneAsScroller: true,
    smoothingEnabled: motionAllowed && !isTouchDevice
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
      requestAnimationFrame(() => document.querySelector<HTMLElement>(`.task-row[data-id="${taskId}"]`)?.focus());
    }
  }, [selectedTaskId]);

  useEffect(() => {
    if (selectedTaskId && !tasks.some(t => t.id === selectedTaskId)) setSelectedTaskId(null);
  }, [tasks, selectedTaskId]);

  // The world reads focus and selection directly, and calls back into the interface on clicks
  useEffect(() => {
    worldBridge.focusDate = focusDate;
    worldBridge.selectedTaskId = selectedTaskId;
    worldBridge.onOpenTask = (taskId) => {
      playUiSound('open');
      openTask(taskId);
    };
    worldBridge.onFocusDay = focusDay;
  }, [focusDate, selectedTaskId, openTask, focusDay]);

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
    },
    viewportMode === 'manual'
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

  // --- Quest arena ---
  const changeViewportMode = useCallback((mode: ViewportMode) => {
    if (mode === 'game') void import('./game/effects/arenaAudio').then(({ warmUpArenaAudio }) => warmUpArenaAudio());
    setViewportMode(mode);
    try {
      localStorage.setItem(VIEWPORT_MODE_KEY, mode);
    } catch {
      return;
    }
  }, []);

  useEffect(() => {
    document.body.classList.toggle('is-game-mode', viewportMode === 'game');
  }, [viewportMode]);

  const isPhoneApp = isPhone && viewportMode === 'manual';
  useEffect(() => {
    document.body.classList.toggle('is-phone-app', isPhoneApp);
  }, [isPhoneApp]);

  useEffect(() => {
    const completedCount = appState.tasks.filter(task => task.completed).length;
    const newlyCompleted = completedCount - rewardedCompletionCount.current;
    const isBulkSync = newlyCompleted > BULK_SYNC_THRESHOLD;
    rewardCompletedQuests(appState.tasks, { announceLevelUps: hasRewardedInitialQuests.current && !isBulkSync });
    hasRewardedInitialQuests.current = true;
    rewardedCompletionCount.current = completedCount;
  }, [appState.tasks]);

  const completeQuest = useCallback((taskId: string) => {
    updateTaskItem(taskId, { completed: true });
  }, []);

  // --- Where we are: the slate header names the day; the buttons only need the way back ---
  const backTargetLabel = NAV_ITEMS.find(item => item.key === currentView)?.label ?? 'path';
  const backLabel = specificDateFilter && currentView !== 'today' ? `Back to ${backTargetLabel}` : specificDateFilter ? 'Back to today' : null;
  // The date the header shows: the focused day, or today's log
  const headerDate = focusDate ?? today;

  const lastSheetTask = usePreservedValue(selectedTask);

  // The mascot key in the top-right corner: profile, games and settings
  const systemMenu = (
    <SystemMenu
      appState={appState}
      theme={theme}
      onSetTheme={applyTheme}
      onEnterGameMode={() => changeViewportMode('game')}
      onOpenControls={() => setIsShortcutsOpen(true)}
    />
  );

  return (
    <TaskSelectionContext.Provider value={taskSelection}>
      <TimePopoverContext.Provider value={openTimePopover}>
        {viewportMode === 'game' && (
          <div className="arena-fullscreen">
            <Suspense fallback={<div className="game-arena-loading">Summoning the quest arena…</div>}>
              <GameArena
                tasks={viewTasks}
                theme={theme}
                prefersReducedMotion={reducedMotion}
                isTouchDevice={isTouchDevice}
                onCompleteQuest={completeQuest}
                onChangeMode={changeViewportMode}
              >
                <div className="arena-quick-add">
                  <QuickAddForm appState={appState} quickAddInputRef={quickAddInputRef} />
                </div>
              </GameArena>
            </Suspense>
          </div>
        )}

        {isPhoneApp && (
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

        {viewportMode === 'manual' && !isPhone && (
          <>
            <WorldStage
              lens={worldLens}
              focusOffset={focusOffset}
              weekStartOffset={weekStartOffset}
              days={worldDays}
              theme={theme}
              reducedMotion={reducedMotion}
              hasFinePointer={hasFinePointer}
              isCompact={isCompact}
              scroller={scroller}
            />

            <div className={`game-shell hud-dark ${isGridView ? 'is-grid-view' : ''} ${selectedTask && !isCompact ? 'has-inspector' : ''}`}>
              <WorldLabels days={worldDays} focusDate={focusDate} today={today} onFocusDay={focusDay} />
              {/* Multi-day boards dim and soften the world behind them so every row stays legible */}
              {isGridView && <div className="hud-scrim" aria-hidden="true" />}

              <DaySlate
                  label="Tasks"
                  layout={isGridView ? 'grid' : 'column'}
                  title={isGridView ? 'All tasks' : null}
                  summary={viewSummary}
                  isScrolled={isScrolled}
                  isDoneLens={!focusDate && currentView === 'completed'}
                  backLabel={backLabel}
                  onBack={returnToLens}
                  date={isGridView ? null : headerDate}
                  onPickDate={focusDay}
                  showDone={showDone}
                  onToggleDone={() => setShowDone(shown => !shown)}
                  scrollRef={setScrollPane}
                  command={<QuickAddForm appState={appState} quickAddInputRef={quickAddInputRef} />}
                  footer={
                    isGridView ? (
                      <button type="button" className="slate-expander is-back" data-sfx="close" aria-keyshortcuts="a" title="Back to today (A)" onClick={toggleAllDays}>
                        <span>Back to today</span>
                        <ChevronLeft size={15} strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    ) : !specificDateFilter ? (
                      <button type="button" className="slate-expander" data-sfx="open" aria-keyshortcuts="a" title="Show all days (A)" onClick={toggleAllDays}>
                        <span>Show all days</span>
                        {otherDaysOpen > 0 && <span className="slate-expander-count">{otherDaysOpen} more</span>}
                        <ChevronRight size={15} strokeWidth={2.2} aria-hidden="true" />
                      </button>
                    ) : null
                  }
                >
                  {/* Keyed by view so the log re-deploys whenever you move along the path */}
                  <TaskFeed key={viewKey} appState={appState} viewTasks={viewTasks} layout={isGridView ? 'grid' : 'column'} hideCompleted={!showDone} />
                </DaySlate>

              {!isCompact && <InspectorSlate task={selectedTask} onClose={closeTask} />}

              {systemMenu}
            </div>
          </>
        )}

        <div className="hud-dark hud-portal">
          {viewportMode === 'manual' && isCompact && (
            <Sheet isOpen={Boolean(selectedTask)} label="Task details" onClose={closeTask}>
              {lastSheetTask && <TaskInspector key={lastSheetTask.id} task={lastSheetTask} isClosing={false} onClose={closeTask} />}
            </Sheet>
          )}
          {viewportMode === 'manual' && <ShortcutsOverlay isOpen={isShortcutsOpen} onClose={() => setIsShortcutsOpen(false)} />}
          <Toasts />
          <TimePopover ref={timePopoverRef} onTimeApplied={handleTimeApplied} />
        </div>
      </TimePopoverContext.Provider>
    </TaskSelectionContext.Provider>
  );
}
