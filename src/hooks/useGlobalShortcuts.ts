import { useEffect, useRef } from 'react';
import type { NavKey } from '../modules/navigation';
import { NAV_ITEMS } from '../modules/navigation';

export interface ShortcutHandlers {
  onSelectNav: (key: NavKey) => void;
  onStepNav: (step: 1 | -1) => void;
  onNewTask: () => void;
  onEscape: () => void;
  onToggleShortcuts: () => void;
  onFocusCalendar: () => void;
  onToday: () => void;
}

// Popovers that already close themselves on Escape
const SELF_DISMISSING_SELECTOR = '.time-popover.open, .settings-panel, .devil-popup.open, .creator-popup.open, .filter-dropdown-wrap.open';
// Anything that already does something with Enter (or sits in a dialog) keeps it
const INTERACTIVE_SELECTOR = 'button, a[href], summary, [role="button"], [role="listitem"], [role="dialog"], [tabindex], .sheet-panel, .inspector, .shortcuts-panel, .time-popover';

export function useGlobalShortcuts(handlers: ShortcutHandlers, enabled: boolean): void {
  const handlersRef = useRef(handlers);

  useEffect(() => {
    handlersRef.current = handlers;
  });

  useEffect(() => {
    if (!enabled) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const isTyping = Boolean(target?.closest('input, textarea, select, [contenteditable="true"]'));
      const current = handlersRef.current;

      if (event.key === 'Escape') {
        if (document.querySelector(SELF_DISMISSING_SELECTOR)) return;
        if (isTyping && target) {
          target.blur();
          return;
        }
        current.onEscape();
        return;
      }
      if (isTyping) return;

      // Arrow keys step the date too, unless focus sits in a control that uses arrows itself
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        if (target?.closest('.timeline-track, .view-nav-list, [role="listitem"], button, input, textarea, select, [contenteditable]')) return;
        current.onStepNav(event.key === 'ArrowRight' ? 1 : -1);
        event.preventDefault();
        return;
      }

      // Enter logs an objective only from "quiet" focus; rows, buttons and dialogs keep Enter for themselves
      if (event.key === 'Enter') {
        if (target && target !== document.body && target.closest(INTERACTIVE_SELECTOR)) return;
        current.onNewTask();
        event.preventDefault();
        return;
      }

      const navItem = NAV_ITEMS.find(item => item.shortcut === event.key);
      const key = event.key.toLowerCase();
      if (navItem) current.onSelectNav(navItem.key);
      else if (key === 'q') current.onStepNav(-1);
      else if (key === 'e') current.onStepNav(1);
      else if (key === 't' || key === 'n' || key === '/') current.onNewTask();
      else if (event.key === '?') current.onToggleShortcuts();
      else if (key === 'c') current.onFocusCalendar();
      else if (event.key === 'Home') current.onToday();
      else return;
      event.preventDefault();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [enabled]);
}
