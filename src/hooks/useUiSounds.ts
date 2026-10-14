// One delegated listener set gives every control its sound, so components only opt out or pick a variant.
// <button data-sfx="select"> picks a sound, data-sfx="none" silences it (the component plays its own).
import { useEffect } from 'react';
import { startAmbientMusic, stopAmbientMusic } from '../audio/ambientMusic';
import { isAudioUnlocked, onAudioUnlocked, unlockAudio } from '../audio/soundEngine';
import { useSoundSettings } from '../audio/soundSettings';
import { isUiSound, playUiSound } from '../audio/uiSounds';

const CLICKABLE_SELECTOR = 'button, [role="button"], [role="switch"], [role="radio"], a[href], summary, .inline-add-row, .chip-date-input';
const HOVER_SELECTOR = [
  '.view-nav-item',
  '.day-bead',
  '.post-label',
  '.next-up',
  '.system-trigger',
  '.system-action',
  '.segmented-option',
  '.settings-switch',
  '.ribbon-tool',
  '.ribbon-step',
  '.timeline-step',
  '.slate-back',
  '.task-open-btn',
  '.quick-add-save-btn',
  '.toolbar-btn',
  '.week-nav-btn',
  '.week-today-btn',
  '.grid-slot-btn',
  '.duration-pill',
  '.inline-add-row',
  '.viewport-mode-option',
  '.hud-quest-log-toggle',
  '.day-card-add'
].join(', ');
// Rows and day cards are swept past in bulk, so they get the quieter, more widely spaced tick
const SOFT_HOVER_SELECTOR = '.task-row, .day-card';
const ANY_HOVER_SELECTOR = `${HOVER_SELECTOR}, ${SOFT_HOVER_SELECTOR}`;
const NAVIGATION_KEYS = new Set(['Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End']);

function closestElement(target: EventTarget | null, selector: string): HTMLElement | null {
  return target instanceof Element ? (target.closest(selector) as HTMLElement | null) : null;
}

function isDisabled(element: HTMLElement): boolean {
  return element.matches(':disabled') || element.getAttribute('aria-disabled') === 'true';
}

export function useUiSounds(): void {
  const { musicEnabled } = useSoundSettings();

  useEffect(() => {
    let hoveredElement: HTMLElement | null = null;
    let isKeyboardNavigating = false;

    const handlePointerDown = () => {
      isKeyboardNavigating = false;
      unlockAudio();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      unlockAudio();
      if (NAVIGATION_KEYS.has(event.key)) isKeyboardNavigating = true;
    };

    // Capture phase: many controls stop propagation, and their sound should still play
    const handleClick = (event: MouseEvent) => {
      const element = closestElement(event.target, CLICKABLE_SELECTOR);
      if (!element || isDisabled(element)) return;
      const variant = element.dataset.sfx;
      if (variant === 'none') return;
      if (isUiSound(variant)) playUiSound(variant);
      else if (element.classList.contains('chip-date-input')) playUiSound('open');
      else playUiSound('click');
    };

    const handlePointerOver = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse') return;
      // Dragging a task over rows and cards stays silent until the drop lands
      if (document.body.classList.contains('is-dragging-task')) return;
      const element = closestElement(event.target, ANY_HOVER_SELECTOR);
      if (element === hoveredElement) return;
      hoveredElement = element;
      if (!element || isDisabled(element)) return;
      playUiSound(element.matches(SOFT_HOVER_SELECTOR) ? 'hoverRow' : 'hover');
    };

    const handleFocusIn = (event: FocusEvent) => {
      if (!isKeyboardNavigating) return;
      const element = closestElement(event.target, `${ANY_HOVER_SELECTOR}, ${CLICKABLE_SELECTOR}, input, [tabindex]`);
      if (element) playUiSound(element.matches(SOFT_HOVER_SELECTOR) ? 'hoverRow' : 'hover');
    };

    document.addEventListener('pointerdown', handlePointerDown, true);
    document.addEventListener('keydown', handleKeyDown, true);
    document.addEventListener('click', handleClick, true);
    document.addEventListener('pointerover', handlePointerOver);
    document.addEventListener('focusin', handleFocusIn);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown, true);
      document.removeEventListener('keydown', handleKeyDown, true);
      document.removeEventListener('click', handleClick, true);
      document.removeEventListener('pointerover', handlePointerOver);
      document.removeEventListener('focusin', handleFocusIn);
    };
  }, []);

  // Ambient music plays only while enabled, unlocked by a gesture, and the tab is visible
  useEffect(() => {
    if (!musicEnabled) {
      stopAmbientMusic();
      return;
    }
    const syncWithVisibility = () => {
      if (document.visibilityState === 'visible' && isAudioUnlocked()) startAmbientMusic();
      else stopAmbientMusic();
    };
    syncWithVisibility();
    const stopListeningForUnlock = onAudioUnlocked(syncWithVisibility);
    document.addEventListener('visibilitychange', syncWithVisibility);
    return () => {
      stopListeningForUnlock();
      document.removeEventListener('visibilitychange', syncWithVisibility);
      stopAmbientMusic();
    };
  }, [musicEnabled]);
}
