import { useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import { ArrowUp } from 'lucide-react';
import { gameInput } from '../input/gameInput';

const JOYSTICK_RADIUS = 48;

export function TouchControls() {
  const baseRef = useRef<HTMLDivElement>(null);
  const activePointer = useRef<number | null>(null);
  const [knobOffset, setKnobOffset] = useState({ x: 0, y: 0 });

  const updateFromPointer = (event: PointerEvent<HTMLDivElement>) => {
    const base = baseRef.current;
    if (!base) return;
    const bounds = base.getBoundingClientRect();
    let dx = event.clientX - (bounds.left + bounds.width / 2);
    let dy = event.clientY - (bounds.top + bounds.height / 2);
    const distance = Math.hypot(dx, dy);
    if (distance > JOYSTICK_RADIUS) {
      dx = (dx / distance) * JOYSTICK_RADIUS;
      dy = (dy / distance) * JOYSTICK_RADIUS;
    }
    setKnobOffset({ x: dx, y: dy });
    gameInput.touchMove.x = dx / JOYSTICK_RADIUS;
    gameInput.touchMove.y = -dy / JOYSTICK_RADIUS;
  };

  const releaseJoystick = () => {
    activePointer.current = null;
    setKnobOffset({ x: 0, y: 0 });
    gameInput.touchMove.x = 0;
    gameInput.touchMove.y = 0;
  };

  return (
    <div className="touch-controls">
      <div
        ref={baseRef}
        className="touch-joystick"
        aria-label="Movement joystick"
        role="application"
        onPointerDown={(event) => {
          event.stopPropagation();
          activePointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateFromPointer(event);
        }}
        onPointerMove={(event) => {
          if (activePointer.current === event.pointerId) updateFromPointer(event);
        }}
        onPointerUp={releaseJoystick}
        onPointerCancel={releaseJoystick}
      >
        <div className="touch-joystick-knob" style={{ transform: `translate(${knobOffset.x}px, ${knobOffset.y}px)` }} />
      </div>
      <button
        type="button"
        className="touch-jump-button"
        aria-label="Jump"
        onPointerDown={(event) => {
          event.stopPropagation();
          gameInput.jumpRequested = true;
        }}
      >
        <ArrowUp size={26} strokeWidth={2.6} aria-hidden="true" />
      </button>
    </div>
  );
}
