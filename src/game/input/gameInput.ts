import { useEffect } from 'react';

export const gameInput = {
  pressedKeys: new Set<string>(),
  touchMove: { x: 0, y: 0 },
  jumpRequested: false,
  interactRequested: false,
  cameraYawDelta: 0,
  cameraZoomDelta: 0
};

const MOVEMENT_CODES = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ShiftLeft', 'ShiftRight']);
const PAGE_SCROLL_CODES = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

export function isTypingTarget(element: Element | null): boolean {
  if (!(element instanceof HTMLElement)) return false;
  if (element.isContentEditable) return true;
  const tag = element.tagName;
  if (tag === 'TEXTAREA' || tag === 'SELECT') return true;
  if (tag !== 'INPUT') return false;
  const type = (element as HTMLInputElement).type;
  return !['checkbox', 'radio', 'button', 'submit', 'range', 'color'].includes(type);
}

export function releaseAllInput(): void {
  gameInput.pressedKeys.clear();
  gameInput.touchMove.x = 0;
  gameInput.touchMove.y = 0;
  gameInput.jumpRequested = false;
  gameInput.interactRequested = false;
}

export function readMovementAxes(): { forward: number; right: number; sprint: boolean } {
  if (isTypingTarget(document.activeElement)) return { forward: 0, right: 0, sprint: false };
  const keys = gameInput.pressedKeys;
  const forward = (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) + gameInput.touchMove.y;
  const right = (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0) + gameInput.touchMove.x;
  const touchMagnitude = Math.hypot(gameInput.touchMove.x, gameInput.touchMove.y);
  const sprint = keys.has('ShiftLeft') || keys.has('ShiftRight') || touchMagnitude > 0.92;
  return { forward: Math.max(-1, Math.min(1, forward)), right: Math.max(-1, Math.min(1, right)), sprint };
}

export function useGameKeyboard(isEngaged: boolean): void {
  useEffect(() => {
    if (!isEngaged) {
      releaseAllInput();
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.ctrlKey || event.metaKey || event.altKey || isTypingTarget(document.activeElement)) return;
      if (PAGE_SCROLL_CODES.has(event.code)) event.preventDefault();
      if (MOVEMENT_CODES.has(event.code)) gameInput.pressedKeys.add(event.code);
      if (event.code === 'Space' && !event.repeat) gameInput.jumpRequested = true;
      if (event.code === 'KeyE' && !event.repeat) gameInput.interactRequested = true;
    };

    const handleKeyUp = (event: KeyboardEvent) => {
      gameInput.pressedKeys.delete(event.code);
    };

    const handleFocusChange = () => {
      if (isTypingTarget(document.activeElement)) releaseAllInput();
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', releaseAllInput);
    document.addEventListener('focusin', handleFocusChange);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', releaseAllInput);
      document.removeEventListener('focusin', handleFocusChange);
      releaseAllInput();
    };
  }, [isEngaged]);
}
