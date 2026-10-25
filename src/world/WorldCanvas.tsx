// The living valley behind the task console. Loaded lazily; renders on demand so the GPU idles when nothing moves.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { routeThreeConsole } from '../canvas/consoleFilters';
import { cameraPoseFor } from './worldViews';
import type { WorldLens } from './worldViews';
import type { WorldDay } from './worldBridge';
import { isWorldIdle, worldInput } from './worldInput';
import { WORLD_PALETTES } from './scene/palette';
import { createLivePalette, LivePaletteContext, stepLivePalette, useLivePalette } from './scene/livePalette';
import { Sky } from './scene/Sky';
import { Terrain } from './scene/Terrain';
import { Foliage } from './scene/Foliage';
import { Atmosphere } from './scene/Atmosphere';
import { Beacon } from './scene/Beacon';
import { Trail } from './scene/Trail';
import { DayPosts } from './scene/DayPosts';
import { Projector } from './scene/Projector';
import { CameraRig } from './scene/CameraRig';
import type { Theme } from '../types';

routeThreeConsole();

export interface WorldCanvasProps {
  lens: WorldLens;
  focusOffset: number;
  weekStartOffset: number;
  days: WorldDay[];
  theme: Theme;
  reducedMotion: boolean;
  isCompact: boolean;
  onReady: () => void;
  onContextLost: () => void;
}

const IDLE_FRAME_INTERVAL_MS = 1000 / 30;
const RESOLUTION_STEPS = [0.6, 0.8, 1, 1.25, 1.5];
const SAMPLE_SECONDS = 2;

// Drives the demand loop: full rate while in use, 30 fps when idle, nothing in a hidden tab.
// With reduced motion nothing animates, so frames are drawn only briefly after input (hover, selection).
const STILL_ACTIVITY_WINDOW_MS = 1500;

function FrameDriver({ animate, signature }: { animate: boolean; signature: string }) {
  const invalidate = useThree((state) => state.invalidate);

  useEffect(() => {
    invalidate();
    let frame = 0;
    let lastFrameAt = 0;
    const loop = (now: number) => {
      frame = requestAnimationFrame(loop);
      if (document.visibilityState !== 'visible') return;
      if (!animate) {
        if (now - worldInput.lastActivityAt > STILL_ACTIVITY_WINDOW_MS || now - lastFrameAt < 50) return;
      } else if (isWorldIdle(now) && now - lastFrameAt < IDLE_FRAME_INTERVAL_MS - 1) {
        return;
      }
      lastFrameAt = now;
      invalidate();
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [animate, invalidate, signature]);

  return null;
}

// Steps resolution down on slow GPUs (and back up when there is headroom), judged only at full frame rate
function AdaptiveResolution({ enabled, startStep }: { enabled: boolean; startStep: number }) {
  const setDpr = useThree((state) => state.setDpr);
  const sample = useRef({ seconds: 0, frames: 0, step: startStep, goodWindows: 0 });

  useFrame((_, delta) => {
    if (!enabled || isWorldIdle()) return;
    const current = sample.current;
    current.seconds += delta;
    current.frames += 1;
    if (current.seconds < SAMPLE_SECONDS) return;
    const fps = current.frames / current.seconds;
    current.seconds = 0;
    current.frames = 0;
    const maxStep = RESOLUTION_STEPS.filter((value) => value <= Math.max(1, window.devicePixelRatio)).length - 1;
    if (fps < 44 && current.step > 0) {
      current.step -= 1;
      current.goodWindows = 0;
      setDpr(RESOLUTION_STEPS[current.step]);
    } else if (fps > 57) {
      current.goodWindows += 1;
      if (current.goodWindows >= 3 && current.step < maxStep) {
        current.step += 1;
        current.goodWindows = 0;
        setDpr(RESOLUTION_STEPS[current.step]);
      }
    }
  });

  return null;
}

const SHADOW_HALF_EXTENT = 64;
const SHADOW_MAP_SIZE = 2048;
const SHADOW_TEXEL = (SHADOW_HALF_EXTENT * 2) / SHADOW_MAP_SIZE;
const SHADOW_REACH = 28;
const SHADOW_REACH_PER_HEIGHT = 0.8;
const SHADOW_LIGHT_DISTANCE = 160;
const SUN_DISTANCE = 120;
const WORLD_UP = new THREE.Vector3(0, 1, 0);
const shadowCentre = new THREE.Vector3();
const viewDirection = new THREE.Vector3();
const lightRight = new THREE.Vector3();
const lightUp = new THREE.Vector3();

function placeShadowFrustum(sun: THREE.DirectionalLight, camera: THREE.Camera, towardSun: THREE.Vector3) {
  camera.getWorldDirection(viewDirection).setY(0);
  if (viewDirection.lengthSq() > 1e-6) viewDirection.normalize();
  shadowCentre.copy(camera.position).addScaledVector(viewDirection, SHADOW_REACH + camera.position.y * SHADOW_REACH_PER_HEIGHT).setY(0);
  lightRight.crossVectors(WORLD_UP, towardSun).normalize();
  lightUp.crossVectors(towardSun, lightRight);
  const across = Math.round(shadowCentre.dot(lightRight) / SHADOW_TEXEL) * SHADOW_TEXEL;
  const along = Math.round(shadowCentre.dot(lightUp) / SHADOW_TEXEL) * SHADOW_TEXEL;
  const depth = shadowCentre.dot(towardSun);
  shadowCentre.copy(lightRight).multiplyScalar(across).addScaledVector(lightUp, along).addScaledVector(towardSun, depth);
  sun.target.position.copy(shadowCentre);
  sun.position.copy(shadowCentre).addScaledVector(towardSun, SHADOW_LIGHT_DISTANCE);
}

function Lighting() {
  const live = useLivePalette();
  const sun = useRef<THREE.DirectionalLight>(null);
  const sky = useRef<THREE.HemisphereLight>(null);
  const fill = useRef<THREE.AmbientLight>(null);

  useLayoutEffect(() => {
    if (!sun.current) return;
    const shadow = sun.current.shadow;
    shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    shadow.bias = -0.0002;
    shadow.radius = 3;
    const shadowCamera = shadow.camera;
    shadowCamera.left = -SHADOW_HALF_EXTENT;
    shadowCamera.right = SHADOW_HALF_EXTENT;
    shadowCamera.top = SHADOW_HALF_EXTENT;
    shadowCamera.bottom = -SHADOW_HALF_EXTENT;
    shadowCamera.near = 1;
    shadowCamera.far = SHADOW_LIGHT_DISTANCE * 2;
    shadowCamera.updateProjectionMatrix();
  }, []);

  useFrame(({ camera }) => {
    if (sun.current) {
      const shadowStrength = live.numbers.shadowStrength;
      sun.current.castShadow = shadowStrength > 0.01;
      sun.current.shadow.intensity = shadowStrength;
      if (sun.current.castShadow) {
        placeShadowFrustum(sun.current, camera, live.sunDirection);
      } else {
        sun.current.position.copy(live.sunDirection).multiplyScalar(SUN_DISTANCE);
        sun.current.target.position.set(0, 0, 0);
      }
      sun.current.target.updateMatrixWorld();
      sun.current.color.copy(live.colors.sun);
      sun.current.intensity = live.numbers.sunIntensity;
    }
    if (sky.current) {
      sky.current.color.copy(live.colors.hemiSky);
      sky.current.groundColor.copy(live.colors.hemiGround);
      sky.current.intensity = live.numbers.hemiIntensity;
    }
    if (fill.current) {
      fill.current.color.copy(live.colors.fill);
      fill.current.intensity = live.numbers.fillIntensity;
    }
  });

  return (
    <>
      <directionalLight ref={sun} />
      <hemisphereLight ref={sky} />
      <ambientLight ref={fill} />
    </>
  );
}

function WorldScene({ lens, focusOffset, weekStartOffset, days, theme, reducedMotion, isCompact, onReady }: WorldCanvasProps) {
  // Created once; later theme changes ease the live palette instead of rebuilding it
  const live = useMemo(() => createLivePalette(WORLD_PALETTES[theme]), []);
  const scene = useThree((state) => state.scene);
  const fog = useMemo(() => new THREE.FogExp2('#151a2b', 0.0042), []);
  const hasSignalledReady = useRef(false);
  const animate = !reducedMotion;
  const pose = useMemo(() => cameraPoseFor(lens, focusOffset, weekStartOffset), [lens, focusOffset, weekStartOffset]);

  useLayoutEffect(() => {
    scene.fog = fog;
    return () => {
      scene.fog = null;
    };
  }, [scene, fog]);

  // Runs before every other frame callback so the whole scene reads one consistent palette
  useFrame((_, delta) => {
    stepLivePalette(live, WORLD_PALETTES[theme], Math.min(delta, 1 / 20), !hasSignalledReady.current || reducedMotion);
    fog.color.copy(live.colors.fog);
    fog.density = live.numbers.fogDensity;
  }, -1);

  useFrame(() => {
    if (hasSignalledReady.current) return;
    hasSignalledReady.current = true;
    requestAnimationFrame(onReady);
  });

  return (
    <LivePaletteContext.Provider value={live}>
      <Lighting />
      <Sky animate={animate} />
      <Terrain animate={animate} />
      <Foliage />
      <Trail animate={animate} focusOffset={focusOffset} />
      <DayPosts days={days} animate={animate} />
      <Atmosphere animate={animate} />
      <Beacon animate={animate} />
      <CameraRig pose={pose} animate={animate} />
      <Projector />
      <FrameDriver animate={animate} signature={`${lens}|${focusOffset}|${theme}|${days.length}`} />
      <AdaptiveResolution enabled={animate} startStep={isCompact ? 2 : 3} />
    </LivePaletteContext.Provider>
  );
}

export default function WorldCanvas(props: WorldCanvasProps) {
  const { isCompact, onContextLost } = props;
  const initialPose = cameraPoseFor(props.lens, props.focusOffset, props.weekStartOffset);

  return (
    <Canvas
      className="world-canvas"
      frameloop="demand"
      shadows="percentage"
      dpr={Math.min(window.devicePixelRatio || 1, isCompact ? 1 : 1.25)}
      camera={{ fov: 48, near: 0.5, far: 1400, position: initialPose.position }}
      gl={{ antialias: true, alpha: false, stencil: false, powerPreference: 'high-performance' }}
      onCreated={({ gl }) => {
        gl.toneMapping = THREE.ACESFilmicToneMapping;
        gl.toneMappingExposure = 1.05;
        gl.outputColorSpace = THREE.SRGBColorSpace;
        gl.domElement.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
          onContextLost();
        });
      }}
    >
      <WorldScene {...props} />
    </Canvas>
  );
}
