// Lens selector: which stretch of the path the camera frames. Keys 1–6 pick a lens; ← → move focus inside it.
import { useLayoutEffect, useRef } from 'react';
import type { KeyboardEvent } from 'react';
import { CalendarRange, CheckCheck, Layers, LayoutGrid, MoveRight, Sun } from 'lucide-react';
import { NAV_ITEMS } from '../modules/navigation';
import type { NavKey } from '../modules/navigation';

const NAV_ICONS: Record<NavKey, typeof Sun> = {
  today: Sun,
  upcoming: MoveRight,
  'this-week': CalendarRange,
  all: Layers,
  completed: CheckCheck,
  planner: LayoutGrid
};

interface ViewNavProps {
  activeKey: NavKey | null;
  counts: Partial<Record<NavKey, number | null>>;
  showPlanner: boolean;
  onSelect: (key: NavKey) => void;
}

export function ViewNav({ activeKey, counts, showPlanner, onSelect }: ViewNavProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const items = NAV_ITEMS.filter(item => showPlanner || item.key !== 'planner');

  // The lit selection bar slides to whichever item is active
  useLayoutEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const place = () => {
      const active = list.querySelector<HTMLElement>('.view-nav-item.is-active');
      list.style.setProperty('--indicator-x', `${active ? active.offsetLeft : 0}px`);
      list.style.setProperty('--indicator-w', `${active ? active.offsetWidth : 0}px`);
      list.classList.toggle('has-active', Boolean(active));
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(list);
    return () => observer.disconnect();
  }, [activeKey, showPlanner]);

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    const buttons = Array.from(listRef.current?.querySelectorAll<HTMLButtonElement>('.view-nav-item') ?? []);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index === -1) return;
    event.preventDefault();
    const next = buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length];
    next.focus();
  };

  return (
    <div className="view-nav" role="group" aria-label="Lenses">
      <div className="view-nav-list" ref={listRef} onKeyDown={handleKeyDown}>
        <span className="view-nav-indicator" aria-hidden="true" />
        {items.map(({ key, label, shortcut }) => {
          const Icon = NAV_ICONS[key];
          const count = counts[key];
          const isActive = key === activeKey;
          return (
            <button
              key={key}
              type="button"
              className={`view-nav-item ${isActive ? 'is-active' : ''}`}
              aria-current={isActive ? 'page' : undefined}
              aria-keyshortcuts={shortcut}
              title={`${label} (${shortcut})`}
              data-sfx="select"
              onClick={() => onSelect(key)}
            >
              <Icon className="view-nav-icon" size={16} strokeWidth={2} aria-hidden="true" />
              <span className="view-nav-label">{label}</span>
              {count ? <span className="view-nav-count">{count}</span> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}
