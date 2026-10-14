// Maps world points onto the interface every frame: day labels over their posts and the lantern tooltip.
// Writes DOM only when values change.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { worldBridge } from '../worldBridge';

const LABEL_HIDE_DISTANCE = 125;
const LABEL_NEAR_DISTANCE = 9;
// The bottom timeline owns this band of the screen: labels fade out as they sink into it
const TIMELINE_SAFE_ZONE = 150;
const SAFE_ZONE_FADE = 48;

// 1 above the fade band, easing to 0 at the top edge of the timeline safe zone
function timelineFade(y: number, height: number): number {
  const edge = height - TIMELINE_SAFE_ZONE;
  return THREE.MathUtils.smoothstep(edge - y, 0, SAFE_ZONE_FADE);
}

function hideLabel(label: HTMLElement) {
  return () => {
    label.style.opacity = '0';
    label.style.visibility = 'hidden';
    label.style.pointerEvents = 'none';
  };
}

export function Projector() {
  const camera = useThree((state) => state.camera);
  const size = useThree((state) => state.size);
  const projected = useMemo(() => new THREE.Vector3(), []);
  const worldPoint = useMemo(() => new THREE.Vector3(), []);
  const written = useRef(new Map<object, string>());

  useEffect(() => {
    worldBridge.isActive = true;
    document.body.classList.add('has-world');
    return () => {
      worldBridge.isActive = false;
      document.body.classList.remove('has-world');
    };
  }, []);

  useFrame(() => {
    const write = (element: HTMLElement, signature: string, apply: () => void) => {
      if (written.current.get(element) === signature) return;
      written.current.set(element, signature);
      apply();
    };

    // Returns screen coordinates, or null when the point is behind the camera or far off screen
    const toScreen = (point: [number, number, number] | undefined) => {
      if (!point) return null;
      worldPoint.set(point[0], point[1], point[2]);
      projected.copy(worldPoint).project(camera);
      if (projected.z > 1 || Math.abs(projected.x) > 1.08 || Math.abs(projected.y) > 1.08) return null;
      return {
        x: ((projected.x + 1) / 2) * size.width,
        y: ((1 - projected.y) / 2) * size.height,
        distance: camera.position.distanceTo(worldPoint)
      };
    };

    worldBridge.dayLabels.forEach((label, date) => {
      const screen = toScreen(worldBridge.points.get(`day:${date}`));
      const isFocused = date === worldBridge.focusDate;
      // Far posts keep their lanterns but drop their labels (and posts right beside the camera too),
      // so neither the horizon nor the foreground clutters
      if (!screen || (!isFocused && (screen.distance > LABEL_HIDE_DISTANCE || screen.distance < LABEL_NEAR_DISTANCE))) {
        write(label, 'hidden', hideLabel(label));
        return;
      }
      // Keep labels out of the HUD's top band: the focused one docks just below it, others hide
      const topBand = size.width < 1025 ? 138 : 116;
      if (screen.y < topBand) {
        if (!isFocused) {
          write(label, 'hidden', hideLabel(label));
          return;
        }
        screen.y = topBand;
      }
      const scale = THREE.MathUtils.clamp(26 / screen.distance, 0.68, 1.1) * (isFocused ? 1.12 : 1);
      const fade = timelineFade(screen.y, size.height);
      if (fade <= 0.01) {
        write(label, 'hidden', hideLabel(label));
        return;
      }
      const opacity = (isFocused ? 1 : THREE.MathUtils.clamp(1.4 - screen.distance / LABEL_HIDE_DISTANCE, 0.25, 0.92)) * fade;
      const transform = `translate3d(${screen.x.toFixed(0)}px, ${screen.y.toFixed(0)}px, 0) translate(-50%, -100%) scale(${scale.toFixed(2)})`;
      write(label, transform + opacity.toFixed(2), () => {
        label.style.visibility = 'visible';
        label.style.pointerEvents = fade < 0.5 ? 'none' : '';
        label.style.transform = transform;
        label.style.opacity = opacity.toFixed(2);
        label.style.zIndex = String(Math.round(1000 - screen.distance));
      });
    });

    const hoverLabel = worldBridge.hoverLabel;
    if (hoverLabel) {
      const screen = worldBridge.hoveredTaskId ? toScreen(worldBridge.points.get(`task:${worldBridge.hoveredTaskId}`)) : null;
      const tooltipY = screen ? screen.y - 22 : 0;
      const fade = screen ? timelineFade(tooltipY, size.height) : 0;
      if (!screen || fade <= 0.01) {
        write(hoverLabel, 'hidden', () => hoverLabel.classList.remove('is-visible'));
      } else {
        const transform = `translate3d(${screen.x.toFixed(0)}px, ${tooltipY.toFixed(0)}px, 0) translate(-50%, -100%)`;
        write(hoverLabel, transform + fade.toFixed(2), () => {
          hoverLabel.style.transform = transform;
          hoverLabel.style.setProperty('--safe-zone-fade', fade.toFixed(2));
          hoverLabel.classList.add('is-visible');
        });
      }
    }
  });

  return null;
}
