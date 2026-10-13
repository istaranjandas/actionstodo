import { useEffect, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { formatFriendlyDate, formatShortDate } from '../modules/dateUtils';
import { useMagneticPull } from '../hooks/useInteractionPolish';
import { QuickAddForm } from './QuickAddForm';
import { ViewportModeToggle } from './ViewportModeToggle';
import type { ViewportMode } from './ViewportModeToggle';
import { CalendarIcon, ChevronDownIcon, FilterIcon, ListLinesIcon, TableGridIcon } from './Icons';
import type { AppState, ViewName } from '../types';

interface MainTopProps {
  appState: AppState;
  isCondensed: boolean;
  isPhone: boolean;
  quickAddInputRef: RefObject<HTMLInputElement | null>;
  onSelectView: (view: ViewName) => void;
  onSetDateFilter: (dateStr: string | null) => void;
  onToggleTableView: () => void;
  viewportMode: ViewportMode;
  onChangeViewportMode: (mode: ViewportMode) => void;
}

const VIEW_TITLES: Record<ViewName, string> = {
  all: 'All dates',
  today: 'Today',
  'this-week': 'This week',
  upcoming: 'Upcoming',
  completed: 'Completed'
};

const FILTER_VIEWS: { view: ViewName; label: string }[] = [
  { view: 'all', label: 'All Dates' },
  { view: 'today', label: 'Today' },
  { view: 'this-week', label: 'This Week' },
  { view: 'upcoming', label: 'Upcoming' },
  { view: 'completed', label: 'Completed' }
];

const FILTER_LABELS: Record<ViewName, string> = {
  all: 'All Dates',
  today: 'Today',
  'this-week': 'This Week',
  upcoming: 'Upcoming',
  completed: 'Completed'
};

export function MainTop({ appState, isCondensed, isPhone, quickAddInputRef, onSelectView, onSetDateFilter, onToggleTableView, viewportMode, onChangeViewportMode }: MainTopProps) {
  const { currentView, specificDateFilter, isTableView } = appState;
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const filterWrapRef = useRef<HTMLDivElement>(null);
  const weekTableBtnRef = useRef<HTMLButtonElement>(null);
  useMagneticPull(weekTableBtnRef, { strength: 0.25 });

  useEffect(() => {
    if (!isFilterOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (filterWrapRef.current && !filterWrapRef.current.contains(e.target as Node)) {
        setIsFilterOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [isFilterOpen]);

  // --- Main pane title ---
  let title: string;
  let subtitle: string;
  if (specificDateFilter) {
    const friendly = formatFriendlyDate(specificDateFilter);
    title = friendly.title;
    subtitle = friendly.sub;
  } else {
    title = VIEW_TITLES[currentView] || 'Tasks';
    subtitle = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }

  // --- Filter Dropdown Navigation ---
  let filterLabel = 'Filter';
  let filterActive = false;
  let dateFilterLabel = 'Pick date';
  if (!isTableView && specificDateFilter) {
    filterLabel = `Filter: ${formatShortDate(specificDateFilter)}`;
    filterActive = true;
    dateFilterLabel = formatShortDate(specificDateFilter);
  } else if (!isTableView && currentView !== 'all') {
    filterLabel = `Filter: ${FILTER_LABELS[currentView] || currentView}`;
    filterActive = true;
  }


  return (
    <div className={`main-top ${isCondensed ? 'is-condensed' : ''}`}>
      <div className="main-header">
        <div className="main-title-wrap">
          <span className="main-subtitle">{subtitle}</span>
          <h1 className="main-title">{title}</h1>
        </div>

        <nav className="view-toolbar">
          <div className="toolbar-actions">
            <ViewportModeToggle mode={viewportMode} onChange={onChangeViewportMode} />
            <button
              className={`toolbar-btn ${isTableView ? 'active' : ''}`}
              id="weekTableBtn"
              title="Toggle Weekly Table view"
              ref={weekTableBtnRef}
              onClick={onToggleTableView}
            >
              {isTableView ? <ListLinesIcon /> : <TableGridIcon />}
              <span>{isTableView ? 'List View' : 'Week Table'}</span>
            </button>

            <div className="picker-chip-wrap" title="Filter by specific date">
              <button type="button" className="toolbar-btn" tabIndex={-1}>
                <CalendarIcon size={12} />
                <span>{dateFilterLabel}</span>
              </button>
              <input
                type="date"
                className="chip-date-input"
                aria-label="Filter by date"
                value={specificDateFilter || ''}
                onChange={(e) => onSetDateFilter(e.target.value || null)}
              />
            </div>
            <button
              type="button"
              className="clear-chip-btn"
              id="clearDateFilterBtn"
              style={{ display: !isTableView && specificDateFilter ? 'inline-flex' : 'none' }}
              title="Show all dates"
              aria-label="Clear picked date"
              onClick={() => onSetDateFilter(null)}
            >
              &times;
            </button>

            <div className={`filter-dropdown-wrap ${isFilterOpen ? 'open' : ''}`} id="filterDropdownWrap" ref={filterWrapRef}>
              <button
                type="button"
                className={`toolbar-btn ${filterActive ? 'active' : ''}`}
                title="Filter tasks"
                onClick={(e) => {
                  e.stopPropagation();
                  setIsFilterOpen(open => !open);
                }}
              >
                <FilterIcon />
                <span>{filterLabel}</span>
                <ChevronDownIcon />
              </button>

              <div className="filter-dropdown-menu" id="filterDropdownMenu">
                {FILTER_VIEWS.map(({ view, label }) => {
                  const isMatch = !isTableView && !specificDateFilter && view === currentView;
                  return (
                    <button
                      key={view}
                      type="button"
                      className={`filter-menu-item ${isMatch ? 'active' : ''}`}
                      data-view={view}
                      onClick={() => {
                        setIsFilterOpen(false);
                        onSelectView(view);
                      }}
                    >
                      <span className="filter-item-icon">{isMatch ? '✓' : ''}</span>
                      <span className="filter-item-text">{label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </nav>
      </div>

      <QuickAddForm appState={appState} isPhone={isPhone} quickAddInputRef={quickAddInputRef} />
    </div>
  );
}
