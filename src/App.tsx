// Main Application Shell & UI Coordinator
import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { auth, onAuthStateChanged } from './firebase';
import { getLocalISODate } from './modules/dateUtils';
import { getFilteredTasks, initFirestoreSync, setUiState, state, stopFirestoreSync, THEME_KEY, updateTaskItem } from './modules/store';
import { useStore } from './hooks/useStore';
import { useMediaQuery } from './hooks/useMediaQuery';
import { DESKTOP_SCROLL_PANE_QUERY, NON_DESKTOP_QUERY, useMotionProfile } from './hooks/useMotionProfile';
import { scrollContentToTop, useSmoothScroll } from './hooks/useSmoothScroll';
import { InteractionPolishContext } from './hooks/useInteractionPolish';
import { setMotionPreference } from './hooks/useMotionPreference';
import { rewardCompletedQuests } from './game/state/gameProgress';
import { Sidebar } from './components/Sidebar';
import { MainTop } from './components/MainTop';
import { TaskFeed } from './components/TaskFeed';
import { QuickAddForm } from './components/QuickAddForm';
import type { ViewportMode } from './components/ViewportModeToggle';
import { WeekTable } from './components/WeekTable';
import { CreatorBadge } from './components/CreatorBadge';
import { TimePopover, TimePopoverContext } from './components/TimePopover';
import type { OpenTimePopover, TimePopoverHandle } from './components/TimePopover';
import type { Theme, TimePopoverContext as PopoverTarget, ViewName } from './types';

const HEADER_CONDENSE_OFFSET = 40;
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

function readInitialTheme(): Theme {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

export function App() {
  const appState = useStore();
  const { prefersReducedMotion, systemPrefersReducedMotion, isTouchDevice, hasFinePointer } = useMotionProfile();
  const isNonDesktop = useMediaQuery(NON_DESKTOP_QUERY);
  const usesScrollPane = useMediaQuery(DESKTOP_SCROLL_PANE_QUERY);
  const isPhone = useMediaQuery('(max-width: 680px)');
  const [theme, setTheme] = useState<Theme>(readInitialTheme);
  const [weekOffset, setWeekOffset] = useState(0);
  const [mainPane, setMainPane] = useState<HTMLElement | null>(null);
  const [feedContainer, setFeedContainer] = useState<HTMLElement | null>(null);
  const [isHeaderCondensed, setIsHeaderCondensed] = useState(false);
  const [viewportMode, setViewportMode] = useState<ViewportMode>(readInitialViewportMode);
  const hasRewardedInitialQuests = useRef(false);
  const rewardedCompletionCount = useRef(0);
  const quickAddInputRef = useRef<HTMLInputElement>(null);
  const timePopoverRef = useRef<TimePopoverHandle>(null);

  const isTableView = appState.isTableView && !isNonDesktop;

  // --- Theme Management ---
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme(current => {
      const next = current === 'dark' ? 'light' : 'dark';
      localStorage.setItem(THEME_KEY, next);
      return next;
    });
  }, []);

  // --- View Mode & Table Toggle ---
  useEffect(() => {
    if (isNonDesktop && state.isTableView) setUiState({ isTableView: false });
  }, [isNonDesktop]);

  useEffect(() => {
    // Table view is full-screen: CSS hides the toolbar and quick-add box
    document.body.classList.toggle('is-table-view', isTableView);
  }, [isTableView]);

  const toggleTableView = useCallback(() => {
    if (isNonDesktop) return;
    setUiState({ isTableView: !state.isTableView });
  }, [isNonDesktop]);

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

  // Transparent date inputs sit on top of their chip buttons, so clicks land on the input.
  // Open the native calendar from there (otherwise Chrome only focuses the hidden field).
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const input = e.target instanceof Element ? (e.target.closest('.chip-date-input') as HTMLInputElement | null) : null;
      if (!input) return;
      try {
        if (typeof input.showPicker === 'function') {
          input.showPicker();
        }
      } catch {
        return;
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, []);

  // --- Filter Navigation ---
  const selectView = useCallback((view: ViewName) => {
    const updates: Parameters<typeof setUiState>[0] = { isTableView: false, currentView: view, specificDateFilter: null };
    if (state.specificDateFilter) {
      updates.selectedAddDate = getLocalISODate();
    }
    setUiState(updates);
  }, []);

  // Picking a date shows that day's tasks and makes new tasks go to that day
  const setDateFilter = useCallback((dateStr: string | null) => {
    if (dateStr) {
      setUiState({ isTableView: false, specificDateFilter: dateStr, selectedAddDate: dateStr });
      quickAddInputRef.current?.focus();
    } else {
      setUiState({ specificDateFilter: null, selectedAddDate: getLocalISODate() });
    }
  }, []);

  const focusInlineAdd = useCallback((dateKey: string) => {
    setUiState({ selectedAddDate: dateKey });
    scrollContentToTop();
    window.setTimeout(() => {
      quickAddInputRef.current?.focus();
    }, 100);
  }, []);

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

  // --- Motion & 3D choreography ---
  const toggleMotion = useCallback(() => {
    const wantsReducedMotion = !prefersReducedMotion;
    setMotionPreference(wantsReducedMotion === systemPrefersReducedMotion ? 'auto' : wantsReducedMotion ? 'off' : 'on');
  }, [prefersReducedMotion, systemPrefersReducedMotion]);

  useEffect(() => {
    document.body.classList.toggle('is-reduced-motion', prefersReducedMotion);
  }, [prefersReducedMotion]);

  const motionAllowed = !prefersReducedMotion;
  const interactionPolish = useMemo(
    () => ({ tiltEnabled: motionAllowed && hasFinePointer, magneticEnabled: motionAllowed && hasFinePointer }),
    [motionAllowed, hasFinePointer]
  );
  const scroller = useSmoothScroll({
    scrollPane: mainPane,
    usePaneAsScroller: usesScrollPane,
    smoothingEnabled: motionAllowed && !isTouchDevice
  });
  useEffect(() => {
    if (!scroller) return;
    const readScrollTop = () => (scroller instanceof Window ? scroller.scrollY : scroller.scrollTop);
    const handleScroll = () => setIsHeaderCondensed(readScrollTop() > HEADER_CONDENSE_OFFSET);
    handleScroll();
    scroller.addEventListener('scroll', handleScroll, { passive: true });
    return () => scroller.removeEventListener('scroll', handleScroll);
  }, [scroller]);

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

  const questTasks = useMemo(
    () => getFilteredTasks(),
    [appState.tasks, appState.currentView, appState.specificDateFilter]
  );


  return (
    <InteractionPolishContext.Provider value={interactionPolish}>
      <TimePopoverContext.Provider value={openTimePopover}>
        {viewportMode === 'game' && (
          <div className="arena-fullscreen">
            <Suspense fallback={<div className="game-arena-loading">Summoning the quest arena…</div>}>
              <GameArena
                tasks={questTasks}
                theme={theme}
                prefersReducedMotion={prefersReducedMotion}
                isTouchDevice={isTouchDevice}
                onCompleteQuest={completeQuest}
                onChangeMode={changeViewportMode}
              >
                <div className="arena-quick-add">
                  <QuickAddForm appState={appState} isPhone={isPhone} quickAddInputRef={quickAddInputRef} />
                </div>
              </GameArena>
            </Suspense>
          </div>
        )}

        {viewportMode === 'manual' && (
        <div className="app-container">
          <Sidebar
            appState={appState}
            theme={theme}
            onToggleTheme={toggleTheme}
            isMotionEnabled={!prefersReducedMotion}
            onToggleMotion={toggleMotion}
            onSelectView={selectView}
            onPickDate={setDateFilter}
          />

          <section className="main-pane" ref={setMainPane}>
            <MainTop
              appState={appState}
              isCondensed={isHeaderCondensed}
              isPhone={isPhone}
              quickAddInputRef={quickAddInputRef}
              onSelectView={selectView}
              onSetDateFilter={setDateFilter}
              onToggleTableView={toggleTableView}
              viewportMode={viewportMode}
              onChangeViewportMode={changeViewportMode}
            />


            <main className="date-groups" id="dateGroupsContainer" ref={setFeedContainer}>
              {isTableView ? (
                <WeekTable
                  tasks={appState.tasks}
                  weekOffset={weekOffset}
                  onPrevWeek={() => setWeekOffset(offset => offset - 1)}
                  onNextWeek={() => setWeekOffset(offset => offset + 1)}
                  onThisWeek={() => setWeekOffset(0)}
                  onExitTable={() => setUiState({ isTableView: false })}
                />
              ) : (
                <TaskFeed appState={appState} container={feedContainer} onInlineAdd={focusInlineAdd} />
              )}
            </main>
          </section>
        </div>
        )}

        <TimePopover ref={timePopoverRef} onTimeApplied={handleTimeApplied} />
        <CreatorBadge />
      </TimePopoverContext.Provider>
    </InteractionPolishContext.Provider>
  );
}
