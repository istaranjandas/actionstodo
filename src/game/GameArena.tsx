import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { warmUpArenaAudio } from './effects/arenaAudio';
import type { ReactNode } from 'react';
import * as THREE from 'three';
import { Canvas } from '@react-three/fiber';
import { PerformanceMonitor, Preload } from '@react-three/drei';
import { Physics } from '@react-three/rapier';
import { IslandWorld } from './world/IslandWorld';
import { PlayerController, releasePlayerGpuResources } from './player/PlayerController';
import { releaseRobotGpuResources } from './player/RobotAvatar';
import { ChaseCamera } from './player/ChaseCamera';
import { QuestRelics } from './quests/QuestRelics';
import { QuestTracker } from './quests/QuestTracker';
import { RelicLabelLayer, RelicLabelProjector } from './quests/RelicLabels';
import { selectArenaTasks } from './quests/relicLayout';
import { releaseRelicGpuResources } from './quests/relicAssets';
import { ArenaBursts } from './effects/ArenaBursts';
import { GameHud } from './hud/GameHud';
import { TouchControls } from './hud/TouchControls';
import { gameInput, isTypingTarget, useGameKeyboard } from './input/gameInput';
import { routeThreeConsole, silenceRapierInitNotice } from '../canvas/consoleFilters';
import type { ViewportMode } from '../components/ViewportModeToggle';
import type { Task, Theme } from '../types';

routeThreeConsole();
silenceRapierInitNotice();

export interface GameArenaProps {
  tasks: Task[];
  theme: Theme;
  prefersReducedMotion: boolean;
  isTouchDevice: boolean;
  onCompleteQuest: (taskId: string) => void;
  onChangeMode: (mode: ViewportMode) => void;
  children?: ReactNode;
}

const DRAG_YAW_SENSITIVITY = 0.006;
const WHEEL_ZOOM_SENSITIVITY = 0.012;
// Capture only once a press becomes a drag, so taps still reach R3F's click handling on relics.
const DRAG_CAPTURE_THRESHOLD_PX = 4;
const RENDER_SCALE_STEPS = [0.5, 0.65, 0.8, 1];
const PERFORMANCE_WARMUP_MS = 2500;
const CELEBRATION_HOLD_MS = 2500;
const performanceBounds = (refreshRate: number): [number, number] => (refreshRate > 90 ? [55, 85] : [40, 54]);

function SceneReadySignal({ onReady }: { onReady: () => void }) {
  useEffect(() => {
    onReady();
  }, [onReady]);
  return null;
}

function useDocumentVisible(): boolean {
  const [isVisible, setIsVisible] = useState(() => document.visibilityState === 'visible');
  useEffect(() => {
    const handleVisibility = () => setIsVisible(document.visibilityState === 'visible');
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);
  return isVisible;
}

export default function GameArena({ tasks, theme, prefersReducedMotion, isTouchDevice, onCompleteQuest, onChangeMode, children }: GameArenaProps) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null);
  const [renderScaleStep, setRenderScaleStep] = useState(isTouchDevice ? 2 : 3);
  const [isPerformanceWarm, setIsPerformanceWarm] = useState(false);
  const [isSceneReady, setIsSceneReady] = useState(false);
  const markSceneReady = useRef(() => setIsSceneReady(true)).current;
  const dragState = useRef<{ pointerId: number; startX: number; lastX: number; captured: boolean } | null>(null);
  const isVisible = useDocumentVisible();
  // Open relics shown at the last commit; one that turns completed is held in the arena so it can celebrate.
  const shownOpenIds = useRef<ReadonlySet<string>>(new Set());
  const [heldIds, setHeldIds] = useState<ReadonlySet<string>>(() => new Set());
  const arenaTasks = useMemo(() => {
    const keepIds = new Set(heldIds);
    tasks.forEach((task) => {
      if (task.completed && shownOpenIds.current.has(task.id)) keepIds.add(task.id);
    });
    return selectArenaTasks(tasks, keepIds);
  }, [tasks, heldIds]);
  const animate = !prefersReducedMotion;
  const renderScale = Math.min(RENDER_SCALE_STEPS[renderScaleStep], window.devicePixelRatio);

  useGameKeyboard(isVisible);

  useEffect(() => {
    const justCompleted = arenaTasks.filter((task) => task.completed && shownOpenIds.current.has(task.id)).map((task) => task.id);
    shownOpenIds.current = new Set(arenaTasks.filter((task) => !task.completed).map((task) => task.id));
    if (justCompleted.length === 0) return;
    setHeldIds((current) => new Set([...current, ...justCompleted]));
    window.setTimeout(() => {
      setHeldIds((current) => {
        const next = new Set(current);
        justCompleted.forEach((id) => next.delete(id));
        return next;
      });
    }, CELEBRATION_HOLD_MS);
  }, [arenaTasks]);

  useEffect(() => {
    if (!isSceneReady) return;
    const warmUp = window.setTimeout(() => setIsPerformanceWarm(true), PERFORMANCE_WARMUP_MS);
    return () => window.clearTimeout(warmUp);
  }, [isSceneReady]);

  useEffect(() => {
    warmUpArenaAudio();
    const startAudioOnFirstGesture = () => warmUpArenaAudio();
    window.addEventListener('pointerdown', startAudioOnFirstGesture, { once: true });
    window.addEventListener('keydown', startAudioOnFirstGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', startAudioOnFirstGesture);
      window.removeEventListener('keydown', startAudioOnFirstGesture);
    };
  }, []);

  useEffect(
    () => () => {
      releaseRelicGpuResources();
      releaseRobotGpuResources();
      releasePlayerGpuResources();
    },
    []
  );

  useEffect(() => {
    if (!container) return;
    const handleWheel = (event: WheelEvent) => {
      if (isTypingTarget(event.target as Element)) return;
      event.preventDefault();
      gameInput.cameraZoomDelta += event.deltaY * WHEEL_ZOOM_SENSITIVITY;
    };
    container.addEventListener('wheel', handleWheel, { passive: false });
    if (!isTypingTarget(document.activeElement)) container.focus({ preventScroll: true });
    return () => container.removeEventListener('wheel', handleWheel);
  }, [container]);

  return (
    <div
      ref={setContainer}
      className="game-arena"
      tabIndex={0}
      aria-label="Quest arena. Use W A S D to move, Space to jump, E to complete a quest."
      onPointerDown={(event) => {
        if (!(event.target instanceof HTMLCanvasElement)) return;
        container?.focus({ preventScroll: true });
        dragState.current = { pointerId: event.pointerId, startX: event.clientX, lastX: event.clientX, captured: false };
      }}
      onPointerMove={(event) => {
        const drag = dragState.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        if (event.buttons === 0) {
          dragState.current = null;
          return;
        }
        if (!drag.captured && Math.abs(event.clientX - drag.startX) > DRAG_CAPTURE_THRESHOLD_PX) {
          event.currentTarget.setPointerCapture(event.pointerId);
          drag.captured = true;
        }
        gameInput.cameraYawDelta -= (event.clientX - drag.lastX) * DRAG_YAW_SENSITIVITY;
        drag.lastX = event.clientX;
      }}
      onPointerUp={(event) => {
        if (dragState.current?.pointerId === event.pointerId) dragState.current = null;
      }}
      onPointerCancel={() => {
        dragState.current = null;
      }}
    >
      <Canvas
        frameloop={isVisible ? 'always' : 'never'}
        dpr={renderScale}
        camera={{ fov: 50, near: 0.5, far: 90, position: [0, 9, 17] }}
        gl={{ antialias: false, powerPreference: 'high-performance', stencil: false, depth: true, alpha: false }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.ACESFilmicToneMapping;
          gl.outputColorSpace = THREE.SRGBColorSpace;
        }}
      >
        <Suspense fallback={null}>
          <Physics gravity={[0, -22, 0]} paused={!isVisible}>
            <IslandWorld theme={theme} animate={animate} />
            <PlayerController animate={animate} />
            <QuestRelics tasks={arenaTasks} animate={animate} celebrate={animate} onCompleteQuest={onCompleteQuest} />
          </Physics>
          <ChaseCamera />
          <QuestTracker tasks={arenaTasks} onCompleteQuest={onCompleteQuest} />
          <RelicLabelProjector />
          <ArenaBursts />
          <Preload all />
          <SceneReadySignal onReady={markSceneReady} />
          {isPerformanceWarm && (
            <PerformanceMonitor
              bounds={performanceBounds}
              flipflops={6}
              onDecline={() => setRenderScaleStep((step) => Math.max(0, step - 1))}
              onIncline={() => setRenderScaleStep((step) => Math.min(RENDER_SCALE_STEPS.length - 1, step + 1))}
            />
          )}
        </Suspense>
      </Canvas>

      <RelicLabelLayer tasks={arenaTasks} />
      <GameHud onChangeMode={onChangeMode} isTouchDevice={isTouchDevice} celebrate={animate} />
      {isTouchDevice && <TouchControls />}
      {children}
    </div>
  );
}
