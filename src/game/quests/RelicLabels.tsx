import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { arenaRuntime } from '../state/arenaRuntime';
import { relicStatusFor } from './relicLayout';
import { getLocalISODate } from '../../modules/dateUtils';
import type { Task } from '../../types';

const LABEL_MAX_LENGTH = 30;
const LABEL_HEIGHT_ABOVE_RELIC = 1.5;
const XP_POPUP_DURATION_MS = 1400;
const LABEL_HIDE_DISTANCE = 30;

const truncateLabel = (text: string) => (text.length > LABEL_MAX_LENGTH ? `${text.slice(0, LABEL_MAX_LENGTH - 1)}…` : text);

export function RelicLabelLayer({ tasks }: { tasks: Task[] }) {
  const [xpPopupTaskIds, setXpPopupTaskIds] = useState<Set<string>>(() => new Set());
  const previousCompletion = useRef(new Map<string, boolean>());
  const today = getLocalISODate();

  useEffect(() => {
    const newlyCompleted = tasks.filter((task) => task.completed && previousCompletion.current.get(task.id) === false).map((task) => task.id);
    previousCompletion.current = new Map(tasks.map((task) => [task.id, task.completed]));
    if (newlyCompleted.length === 0) return;
    setXpPopupTaskIds((current) => new Set([...current, ...newlyCompleted]));
    const clearPopups = window.setTimeout(() => {
      setXpPopupTaskIds((current) => {
        const next = new Set(current);
        newlyCompleted.forEach((id) => next.delete(id));
        return next;
      });
    }, XP_POPUP_DURATION_MS);
    return () => window.clearTimeout(clearPopups);
  }, [tasks]);

  return (
    <div className="relic-label-layer" aria-hidden="true">
      {tasks.map((task) => (
        <div
          key={task.id}
          className="relic-label-anchor"
          ref={(element) => {
            if (element) arenaRuntime.labelAnchors.set(task.id, element);
            else arenaRuntime.labelAnchors.delete(task.id);
          }}
        >
          <div className={`relic-label is-${relicStatusFor(task, today)}`}>
            {truncateLabel(task.text)}
            {xpPopupTaskIds.has(task.id) && <span className="relic-xp-popup">+100 XP</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function RelicLabelProjector() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const worldPoint = useMemo(() => new THREE.Vector3(), []);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const lastWritten = useRef(new Map<string, string>());

  useFrame(() => {
    arenaRuntime.labelAnchors.forEach((anchor, taskId) => {
      const body = arenaRuntime.relics.get(taskId);
      const hide = () => {
        if (lastWritten.current.get(taskId) === 'hidden') return;
        anchor.style.opacity = '0';
        lastWritten.current.set(taskId, 'hidden');
      };
      if (!body) {
        hide();
        return;
      }
      const position = body.translation();
      worldPoint.set(position.x, position.y + LABEL_HEIGHT_ABOVE_RELIC, position.z);
      projected.copy(worldPoint).project(camera);
      const distance = camera.position.distanceTo(worldPoint);
      if (projected.z > 1 || Math.abs(projected.x) > 1.2 || Math.abs(projected.y) > 1.2 || distance > LABEL_HIDE_DISTANCE) {
        hide();
        return;
      }
      const scale = THREE.MathUtils.clamp(10 / distance, 0.62, 1.12);
      const opacity = THREE.MathUtils.clamp(1.7 - distance / 26, 0.35, 1);
      const isFocused = arenaRuntime.focusedTaskId === taskId;
      const screenX = ((projected.x + 1) / 2) * size.width;
      const screenY = ((1 - projected.y) / 2) * size.height;
      const transform = `translate3d(${screenX.toFixed(0)}px, ${screenY.toFixed(0)}px, 0) translate(-50%, -100%) scale(${(isFocused ? scale * 1.12 : scale).toFixed(2)})`;
      const nextOpacity = isFocused ? '1' : opacity.toFixed(1);
      const signature = transform + nextOpacity;
      if (lastWritten.current.get(taskId) === signature) return;
      lastWritten.current.set(taskId, signature);
      anchor.style.transform = transform;
      anchor.style.opacity = nextOpacity;
    });
  });

  return null;
}
