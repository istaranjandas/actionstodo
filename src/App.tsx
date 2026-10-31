// Main Application Shell & UI Coordinator
// Manual mode: a full-screen dashboard workspace — a compact day header, a focus-first task log,
// a quick-add command bar and a bottom lens dock. Game mode: the quest arena.
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CheckCheck } from 'lucide-react';
import { auth, onAuthStateChanged } from './firebase';
import { addDays, getLocalISODate } from './modules/dateUtils';
import { ensureRecurringOccurrences, initFirestoreSync, setUiState, state, stopFirestoreSync, summarizeView, updateTaskItem } from './modules/store';
import { setupTaskDragAndDrop } from './modules/listDrag';
import { moveTask } from './modules/taskActions';
import { countForView, daysFromToday, NAV_ITEMS } from './modules/navigation';
import type { NavKey } from './modules/navigation';
import { useDisplaySettings } from './modules/displaySettings';
import { THEME_KEY, applyThemeAttribute, readRenderedTheme } from './modules/theme';
import { useStore } from './hooks/useStore';
import { useMediaQuery } from './hooks/useMediaQuery';
import { DESKTOP_SCROLL_PANE_QUERY, NON_DESKTOP_QUERY, useMotionProfile } from './hooks/useMotionProfile';
import { readScrollTop, restoreScrollPosition, useSmoothScroll } from './hooks/useSmoothScroll';
import { useUiSounds } from './hooks/useUiSounds';
import { useGlobalShortcuts } from './hooks/useGlobalShortcuts';
import { usePreservedValue } from './hooks/usePreservedValue';
import { playUiSound } from './audio/uiSounds';
import { swellAmbientMusic } from './audio/ambientMusic';
import { rewardCompletedQuests } from './game/state/gameProgress';
import { FUTURE_DAY_LIMIT, PAST_DAY_LIMIT } from './world/trail';
import { Dock } from './components/Dock';
import { SystemMenu } from './components/SystemMenu';
import { DaySlate } from './components/DaySlate';
import { TaskFeed } from './components/TaskFeed';
import { TaskInspector } from './components/TaskInspector';
import { TaskSelectionContext } from './components/TaskSelection';
import { QuickAddForm } from './components/QuickAddForm';
import { Sheet } from './components/Sheet';
import { Toasts } from './components/Toasts';
import { ShortcutsOverlay } from './components/ShortcutsOverlay';
import { InspectorSlate } from './components/InspectorSlate';
import type { ViewportMode } from './components/ViewportModeToggle';
import { WeekTable } from './components/WeekTable';
import { TimePopover, TimePopoverContext } from './components/TimePopover';
import type { OpenTimePopover, TimePopoverHandle } from './components/TimePopover';
import type { Theme, TimePopoverContext as PopoverTarget, ViewName } from './types';

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
  const { prefersReducedMotion, isTouchDevice } = useMotionProfile();
  // Animations are off unless the System panel turns them on, so low-end machines stay responsive
  const { animationsEnabled } = useDisplaySettings();
  const reducedMotion = prefersReducedMotion || !animationsEnabled;
  const isNonDesktop = useMediaQuery(NON_DESKTOP_QUERY);
  const isWide = useMediaQuery(DESKTOP_SCROLL_PANE_QUERY);
  const isCompact = !isWide;
  const [theme, setTheme] = useState<Theme>(readRenderedTheme);
  const [weekOffset, setWeekOffset] = useState(0);
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
  const today = getLocalISODate();
  const isTableView = appState.isTableView && !isNonDesktop;
  // A picked date, or the Today lens, focuses one waypost; the other lenses frame a stretch of path
  const focusDate = isTableView ? null : specificDateFilter ?? (currentView === 'today' ? today : null);
  // One day reads as a single column; the multi-day lenses spread into a grid of day cards
  const isGridView = !isTableView && !focusDate;
  const activeLens: NavKey | null = isTableView ? 'planner' : specificDateFilter ? null : currentView;
  const viewKey = isTableView ? 'planner' : specificDateFilter ? `date:${specificDateFilter}` : currentView;
  const selectedTask = selectedTaskId ? tasks.find(t => t.id === selectedTaskId) ?? null : null;
  // Lens badges, the slate header and the day cards all count through summarizeView (store.ts).
  // `today` is a dependency so every count rolls over together at midnight.
  const lensCounts = useMemo(() => Object.fromEntries(NAV_ITEMS.map(item => [item.key, countForView(item.key, tasks)])), [tasks, today]);
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

  // --- Planner (week table) is desktop-only, as before ---
  useEffect(() => {
    if (isNonDesktop && state.isTableView) setUiState({ isTableView: false });
  }, [isNonDesktop]);

  useEffect(() => {
    document.body.classList.toggle('is-table-view', isTableView);
  }, [isTableView]);

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

  // Every move through the workspace is a small journey: the soundtrack breathes with it
  const journeyKey = viewKey;
  const previousJourneyKey = useRef(journeyKey);
  useEffect(() => {
    if (previousJourneyKey.current === journeyKey) return;
    previousJourneyKey.current = journeyKey;
    playUiSound('travel');
    swellAmbientMusic();
  }, [journeyKey]);

  // --- Navigation along the path ---
  const selectView = useCallback((view: ViewName) => {
    const updates: Parameters<typeof setUiState>[0] = { isTableView: false, currentView: view, specificDateFilter: null };
    if (state.specificDateFilter) {
      updates.selectedAddDate = getLocalISODate();
    }
    setUiState(updates);
  }, []);

  const selectLens = useCallback((key: NavKey) => {
    rememberScroll();
    if (key === 'planner') {
      if (!isNonDesktop) setUiState({ isTableView: true });
      return;
    }
    selectView(key);
  }, [isNonDesktop, rememberScroll, selectView]);

  // Focusing a day walks to its waypost; new tasks then go to that day
  const focusDay = useCallback((date: string) => {
    rememberScroll();
    if (date === getLocalISODate()) {
      setUiState({ isTableView: false, currentView: 'today', specificDateFilter: null, selectedAddDate: date });
    } else {
      setUiState({ isTableView: false, specificDateFilter: date, selectedAddDate: date });
    }
  }, [rememberScroll]);

  const stepDay = useCallback((step: 1 | -1) => {
    const base = state.specificDateFilter ?? getLocalISODate();
    const next = addDays(base, step);
    if (Math.abs(daysFromToday(next)) > Math.max(PAST_DAY_LIMIT, FUTURE_DAY_LIMIT)) return;
    playUiSound('select');
    focusDay(next);
  }, [focusDay]);

  // Back from a picked date or the planner to the lens underneath, with its scroll intact
  const returnToLens = useCallback(() => {
    rememberScroll();
    setUiState({ isTableView: false, specificDateFilter: null, selectedAddDate: getLocalISODate() });
  }, [rememberScroll]);

  const focusQuickAdd = useCallback(() => {
    if (state.isTableView) setUiState({ isTableView: false });
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

  // The world used to read focus and selection directly; the dashboard keeps selection in React
  const taskSelection = useMemo(() => ({ selectedTaskId, openTask }), [selectedTaskId, openTask]);

  const handleEscape = useCallback(() => {
    if (isShortcutsOpen) setIsShortcutsOpen(false);
    else if (selectedTaskId) closeTask();
    else if (state.specificDateFilter || state.isTableView) returnToLens();
  }, [isShortcutsOpen, selectedTaskId, closeTask, returnToLens]);

  useGlobalShortcuts(
    {
      onSelectNav: selectLens,
      onStepNav: stepDay,
      onNewTask: focusQuickAdd,
      onEscape: handleEscape,
      onToggleShortcuts: () => setIsShortcutsOpen(open => !open),
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
  const headerDate = isTableView ? null : focusDate ?? today;

  const lastSheetTask = usePreservedValue(selectedTask);

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

        {viewportMode === 'manual' && (
          <div className={`dashboard-shell ${isTableView ? 'is-planner' : ''} ${isGridView ? 'is-grid-view' : ''} ${selectedTask && !isCompact ? 'has-inspector' : ''}`}>
            <header className="dash-topbar">
              <div className="dash-brand">
                <span className="dash-brand-mark" aria-hidden="true">
                  <CheckCheck size={20} strokeWidth={2.4} />
                </span>
                <span className="dash-brand-copy">
                  <strong>Actionstodo</strong>
                  <span>Focus workspace</span>
                </span>
              </div>

              <div className="dash-topbar-actions">
                <SystemMenu
                  appState={appState}
                  theme={theme}
                  onSetTheme={applyTheme}
                  onEnterGameMode={() => changeViewportMode('game')}
                  onOpenControls={() => setIsShortcutsOpen(true)}
                />
              </div>
            </header>

            <div className="dash-main">
              {isTableView ? (
                <div className="planner-board">
                  <WeekTable
                    tasks={tasks}
                    weekOffset={weekOffset}
                    onPrevWeek={() => setWeekOffset(offset => offset - 1)}
                    onNextWeek={() => setWeekOffset(offset => offset + 1)}
                    onThisWeek={() => setWeekOffset(0)}
                    onExitTable={returnToLens}
                  />
                </div>
              ) : (
                <DaySlate
                  label="Task log"
                  layout={isGridView ? 'grid' : 'column'}
                  title={isGridView ? 'All tasks' : null}
                  summary={viewSummary}
                  isScrolled={isScrolled}
                  backLabel={backLabel}
                  onBack={returnToLens}
                  date={isGridView ? null : headerDate}
                  onPickDate={focusDay}
                  onPrevDay={() => stepDay(-1)}
                  onNextDay={() => stepDay(1)}
                  scrollRef={setScrollPane}
                  command={<QuickAddForm appState={appState} quickAddInputRef={quickAddInputRef} />}
                >
                  {/* Keyed by view so the log re-deploys whenever you move through the workspace */}
                  <TaskFeed key={viewKey} appState={appState} viewTasks={viewTasks} layout={isGridView ? 'grid' : 'column'} />
                </DaySlate>
              )}

              {!isCompact && !isTableView && <InspectorSlate task={selectedTask} onClose={closeTask} />}
            </div>

            <Dock
              activeLens={activeLens}
              lensCounts={lensCounts}
              showPlanner={!isNonDesktop}
              onSelectLens={selectLens}
            />
          </div>
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
