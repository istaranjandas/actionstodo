import * as THREE from 'three';
import { RendererManager } from './core/RendererManager.js';
import { PerformanceMonitor } from './systems/PerformanceMonitor.js';
import { RoadManager } from './world/RoadManager.js';
import { EnvironmentManager } from './world/EnvironmentManager.js';
import { PlayerCar } from './entities/PlayerCar.js';
import { CameraController } from './systems/CameraController.js';
import { TrafficManager } from './systems/TrafficManager.js';
import { CollisionSystem } from './systems/CollisionSystem.js';
import { ScoreManager } from './systems/ScoreManager.js';
import { SoundEngine } from './audio/SoundEngine.js';
import { InputManager } from './systems/InputManager.js';
import { UIManager } from './ui/UIManager.js';
import {
  CAMERA,
  CAMERA_MODE_ORDER,
  DIFFICULTY,
  GAME_MODES,
  GAME_STATES,
  NEAR_MISS,
  PLAYER,
  QUALITY_CONFIG,
  QUALITY_TIERS,
  STORAGE_KEYS,
  TIMING,
  UNLIMITED,
  clamp,
  damp,
  getRoadCurve,
} from './config/constants.js';

const MENU_CAMERA_FOV = 55;
const MENU_TRAFFIC_DIFFICULTY = 0.35;
const WRECK_ORBIT_RADIUS = 12;
const WRECK_ORBIT_HEIGHT = 4.5;
const WRECK_ORBIT_SPEED = 0.18;
const CLICK_SOUND_SPACING_MS = 90;

const storage = {
  read(key) {
    try {
      return typeof localStorage === 'undefined' ? null : localStorage.getItem(key);
    } catch {
      return null;
    }
  },
  write(key, value) {
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem(key, String(value));
    } catch {
      return;
    }
  },
};

function detectDefaultTier() {
  const coarsePointer = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const cores = navigator.hardwareConcurrency ?? 8;
  const memory = navigator.deviceMemory ?? 8;
  return coarsePointer || cores <= 4 || memory <= 4 ? QUALITY_TIERS.MEDIUM : QUALITY_TIERS.HIGH;
}

function loadSettings() {
  const storedTier = storage.read(STORAGE_KEYS.QUALITY);
  const storedAuto = storage.read(STORAGE_KEYS.AUTO_QUALITY);
  const storedCamera = storage.read(STORAGE_KEYS.CAMERA);
  const isAuto = storedAuto === null ? true : storedAuto === 'true';
  const manualTier = QUALITY_CONFIG[storedTier] ? storedTier : detectDefaultTier();
  return {
    isAuto,
    tier: isAuto ? detectDefaultTier() : manualTier,
    muted: storage.read(STORAGE_KEYS.MUTED) === 'true',
    cameraMode: CAMERA_MODE_ORDER.includes(storedCamera) ? storedCamera : CAMERA_MODE_ORDER[0],
    mode: storage.read(STORAGE_KEYS.MODE) === GAME_MODES.UNLIMITED ? GAME_MODES.UNLIMITED : GAME_MODES.STANDARD,
  };
}

class AlpineOverdriveGame {
  constructor(canvas, uiRoot) {
    this.settings = loadSettings();
    this.state = GAME_STATES.MENU;
    this.currentTier = this.settings.tier;
    this.lastFrameTime = 0;
    this.lastClickTime = 0;
    this.crashTimer = 0;
    this.flyoverZ = PLAYER.START_Z;
    this.flyoverTime = 0;
    this.wreckOrbitAngle = 0;
    this.cameraCurve = { x: 0, y: 0, dx: 0, dy: 0 };
    this.lookCurve = { x: 0, y: 0, dx: 0, dy: 0 };
    this.lookTarget = new THREE.Vector3();
    this.wreckTarget = new THREE.Vector3();

    this.rendererManager = new RendererManager(canvas, this.currentTier);
    this.scene = this.rendererManager.scene;
    this.camera = this.rendererManager.camera;

    this.performanceMonitor = new PerformanceMonitor((tier) => this.applyTier(tier, true), this.currentTier);
    this.performanceMonitor.setAutoMode(this.settings.isAuto);

    this.road = new RoadManager(this.scene);
    this.environment = new EnvironmentManager(this.scene);
    this.player = new PlayerCar(this.scene);
    this.cameraController = new CameraController(this.camera);
    this.cameraController.setMode(this.settings.cameraMode);
    this.traffic = new TrafficManager(this.scene);
    this.collision = new CollisionSystem();
    this.mode = this.settings.mode;
    this.score = new ScoreManager(this.mode);
    this.sound = new SoundEngine();
    this.sound.setMuted(this.settings.muted);

    this.input = new InputManager(uiRoot);
    this.ui = new UIManager(uiRoot, {
      onStart: () => this.withClick(() => this.startRun()),
      onPauseToggle: () => this.withClick(() => this.togglePause()),
      onRestart: () => this.withClick(() => this.startRun()),
      onMainMenu: () => this.withClick(() => this.enterMenu()),
      onQualityChange: (tier) => this.withClick(() => this.selectManualTier(tier)),
      onAutoQualityToggle: (enabled) => this.withClick(() => this.setAutoQuality(enabled)),
      onCameraCycle: () => this.withClick(() => this.cycleCamera()),
      onMuteToggle: () => this.toggleMute(),
      onModeChange: (mode) => this.withClick(() => this.selectMode(mode)),
      onEndRun: () => this.withClick(() => this.endUnlimitedRun()),
    });
    this.ui.setMuted(this.settings.muted);
    this.ui.setMode(this.mode, this.score.getHighScore());

    this.bindActions();
    this.bindLifecycle();
    this.applyTier(this.currentTier, false);
    this.enterMenu();

    this.tick = this.tick.bind(this);
    requestAnimationFrame(this.tick);
  }

  bindActions() {
    this.input.onAction('CAMERA', () => {
      if (this.state === GAME_STATES.PLAYING) this.cycleCamera();
    });
    this.input.onAction('PAUSE', () => {
      if (this.state === GAME_STATES.PLAYING || this.state === GAME_STATES.PAUSED) this.togglePause();
    });
    this.input.onAction('MUTE', () => this.toggleMute());
    this.input.onAction('CONFIRM', () => {
      if (this.state === GAME_STATES.MENU || this.state === GAME_STATES.GAMEOVER) this.startRun();
      else if (this.state === GAME_STATES.PAUSED) this.togglePause();
    });
  }

  bindLifecycle() {
    const unlockAudio = () => this.sound.init();
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio);

    document.addEventListener('visibilitychange', () => {
      this.lastFrameTime = 0;
      if (document.hidden) {
        if (this.state === GAME_STATES.PLAYING && !this.player.getBounds().isCrashed) this.togglePause();
        this.sound.suspend();
      } else {
        this.sound.resume();
      }
    });
  }

  withClick(action) {
    this.sound.init();
    const now = performance.now();
    if (now - this.lastClickTime > CLICK_SOUND_SPACING_MS) this.sound.playClick();
    this.lastClickTime = now;
    action();
  }

  isAutoQuality() {
    return this.performanceMonitor.isAutoMode();
  }

  applyTier(tier, fromMonitor) {
    const config = QUALITY_CONFIG[tier] ?? QUALITY_CONFIG.MEDIUM;
    this.currentTier = config.id;
    if (!fromMonitor) this.performanceMonitor.setManualTier(config.id);
    this.rendererManager.applyQualityTier(config.id);
    this.road.setQualityTier(config.id);
    this.environment.setQualityTier(config.id);
    this.traffic.setQualityTier(config.id);
    this.player.setDynamicLights(config.dynamicLights);
    this.player.setLightReflections(config.lightReflections);
    this.ui?.setQualityState(config.id, this.isAutoQuality());
  }

  selectManualTier(tier) {
    if (!QUALITY_CONFIG[tier]) return;
    this.performanceMonitor.setAutoMode(false);
    storage.write(STORAGE_KEYS.AUTO_QUALITY, false);
    storage.write(STORAGE_KEYS.QUALITY, tier);
    this.applyTier(tier, false);
  }

  setAutoQuality(enabled) {
    this.performanceMonitor.setAutoMode(enabled);
    storage.write(STORAGE_KEYS.AUTO_QUALITY, enabled);
    if (!enabled) storage.write(STORAGE_KEYS.QUALITY, this.currentTier);
    this.ui.setQualityState(this.currentTier, enabled);
  }

  cycleCamera() {
    const mode = this.cameraController.cycleMode();
    storage.write(STORAGE_KEYS.CAMERA, mode);
  }

  toggleMute() {
    this.sound.init();
    const muted = !this.sound.isMuted();
    this.sound.setMuted(muted);
    storage.write(STORAGE_KEYS.MUTED, muted);
    this.ui.setMuted(muted);
    if (!muted) this.sound.playClick();
  }

  resetWorld() {
    this.player.reset();
    this.traffic.reset();
    this.collision.reset?.();
    this.score.reset();
    this.road.reset();
    this.environment.reset();
    this.input.reset();
  }

  enterMenu() {
    this.state = GAME_STATES.MENU;
    this.sound.stopEngine();
    this.sound.resume();
    this.input.setEnabled(false);
    this.player.setVisible(false);
    this.flyoverZ = this.player.getBounds().z;
    this.flyoverTime = 0;
    this.traffic.reset();
    this.camera.fov = MENU_CAMERA_FOV;
    this.camera.updateProjectionMatrix();
    this.ui.showMenu(this.score.getHighScore(), this.currentTier, this.isAutoQuality());
  }

  startRun() {
    this.sound.init();
    this.sound.resume();
    this.resetWorld();
    this.player.setVisible(true);
    this.cameraController.reset();
    this.input.setEnabled(true);
    this.crashTimer = 0;
    this.state = GAME_STATES.PLAYING;
    this.sound.startEngine();
    this.ui.showHUD();
  }

  togglePause() {
    if (this.state === GAME_STATES.PLAYING) {
      this.state = GAME_STATES.PAUSED;
      this.input.reset();
      this.sound.stopEngine();
      this.ui.showPause();
    } else if (this.state === GAME_STATES.PAUSED) {
      this.state = GAME_STATES.PLAYING;
      this.lastFrameTime = 0;
      this.input.reset();
      this.sound.resume();
      if (!this.player.getBounds().isCrashed) this.sound.startEngine();
      this.ui.showHUD();
    }
  }

  isUnlimited() {
    return this.mode === GAME_MODES.UNLIMITED;
  }

  selectMode(mode) {
    if (this.state !== GAME_STATES.MENU) return;
    this.mode = mode === GAME_MODES.UNLIMITED ? GAME_MODES.UNLIMITED : GAME_MODES.STANDARD;
    storage.write(STORAGE_KEYS.MODE, this.mode);
    this.score.setMode(this.mode);
    this.ui.setMode(this.mode, this.score.getHighScore());
  }

  endUnlimitedRun() {
    if (this.state === GAME_STATES.PAUSED && this.isUnlimited()) this.finishRun();
  }

  handleImpact(result) {
    this.player.triggerImpact(result.impactSide);
    if (result.crashedVehicle) this.traffic.notifyImpact(result.crashedVehicle);
    this.collision.releaseCrashLatch();
    const impacts = this.score.registerImpact();
    this.cameraController.addTrauma(UNLIMITED.IMPACT_TRAUMA);
    this.sound.playCrash();
    this.ui.flashCrash();
    this.ui.triggerImpactPopup(impacts);
  }

  handleCrash(result) {
    if (this.isUnlimited()) {
      this.handleImpact(result);
      return;
    }
    this.player.triggerCrash(result.impactSide);
    if (result.crashedVehicle) this.traffic.notifyCrash(result.crashedVehicle);
    this.cameraController.addTrauma(CAMERA.CRASH_TRAUMA);
    this.sound.playCrash();
    this.ui.flashCrash();
    this.input.setEnabled(false);
    this.crashTimer = 0;
  }

  handleNearMiss(nearMiss) {
    const reward = this.score.registerNearMiss(nearMiss.isOncoming);
    this.ui.triggerNearMissPopup(reward.pointsAdded, reward.multiplier, nearMiss.isOncoming);
    this.sound.playNearMiss(reward.currentCombo);
    this.cameraController.addTrauma(
      nearMiss.gap <= NEAR_MISS.ULTRA_CLOSE_GAP ? CAMERA.ULTRA_NEAR_MISS_TRAUMA : CAMERA.NEAR_MISS_TRAUMA,
    );
  }

  finishRun() {
    this.state = GAME_STATES.GAMEOVER;
    this.score.saveHighScore();
    this.sound.stopEngine();
    const bounds = this.player.getBounds();
    this.wreckOrbitAngle = Math.atan2(this.camera.position.x - bounds.worldX, this.camera.position.z - bounds.z);
    this.ui.showGameOver(this.score.getSummary());
  }

  updatePlaying(deltaTime) {
    this.player.update(deltaTime, this.input.getState(), getRoadCurve);
    const bounds = this.player.getBounds();
    const difficulty = clamp((PLAYER.START_Z - bounds.z) / DIFFICULTY.RAMP_DISTANCE, 0, 1);
    this.traffic.update(deltaTime, bounds.z, bounds.speed, difficulty, getRoadCurve, bounds.localX);

    if (bounds.isCrashed) {
      this.crashTimer += deltaTime;
    } else {
      const result = this.collision.check(bounds, this.traffic.getActiveVehicles(), bounds.isGhost);
      for (let index = 0; index < result.nearMisses.length; index += 1) {
        this.handleNearMiss(result.nearMisses[index]);
      }
      if (result.crashed) this.handleCrash(result);
      else if (result.overlapping) this.player.holdGhost();
    }

    this.score.update(deltaTime, bounds);
    this.road.update(bounds.z, deltaTime);
    this.environment.update(bounds.z, deltaTime);
    this.cameraController.update(deltaTime, bounds, getRoadCurve);
    this.rendererManager.setShadowFocus(bounds.worldX, bounds.y, bounds.z - 12);
    this.sound.updateEngine(bounds.speedRatio, bounds.isBraking);
    this.ui.updateHUD(
      this.score.getTelemetry(),
      this.performanceMonitor.getFPS(),
      this.currentTier,
      this.cameraController.getMode(),
      this.isAutoQuality(),
    );

    if (bounds.isCrashed && this.crashTimer >= TIMING.CRASH_SEQUENCE_DURATION) this.finishRun();
  }

  updateMenuFlyover(deltaTime) {
    this.flyoverTime += deltaTime;
    this.flyoverZ -= TIMING.MENU_FLYOVER_SPEED * deltaTime;
    const time = this.flyoverTime;
    const focusZ = this.flyoverZ;
    const lateral = Math.sin(time * 0.11) * 6.5;
    const height = 6.5 + Math.sin(time * 0.17 + 1.2) * 3;
    const cameraZ = focusZ + 10;
    const lookZ = focusZ - 55;
    const cameraCurve = getRoadCurve(cameraZ, this.cameraCurve);
    const lookCurve = getRoadCurve(lookZ, this.lookCurve);

    this.camera.position.set(cameraCurve.x + lateral, cameraCurve.y + height, cameraZ);
    this.lookTarget.set(lookCurve.x + lateral * 0.35, lookCurve.y + 1.2, lookZ);
    this.camera.lookAt(this.lookTarget);
    this.camera.rotateZ(Math.sin(time * 0.09) * 0.035);

    this.traffic.update(deltaTime, focusZ, TIMING.MENU_FLYOVER_SPEED, MENU_TRAFFIC_DIFFICULTY, getRoadCurve);
    this.road.update(focusZ, deltaTime);
    this.environment.update(focusZ, deltaTime);
    this.rendererManager.setShadowFocus(cameraCurve.x, cameraCurve.y, focusZ - 20);
  }

  updateGameOver(deltaTime) {
    const bounds = this.player.getBounds();
    this.wreckOrbitAngle += WRECK_ORBIT_SPEED * deltaTime;
    this.wreckTarget.set(
      bounds.worldX + Math.sin(this.wreckOrbitAngle) * WRECK_ORBIT_RADIUS,
      bounds.y + WRECK_ORBIT_HEIGHT,
      bounds.z + Math.cos(this.wreckOrbitAngle) * WRECK_ORBIT_RADIUS,
    );
    const alpha = 1 - Math.exp(-1.8 * deltaTime);
    this.camera.position.lerp(this.wreckTarget, alpha);
    this.lookTarget.set(bounds.worldX, bounds.y + 0.8, bounds.z);
    this.camera.lookAt(this.lookTarget);
    this.camera.fov = damp(this.camera.fov, MENU_CAMERA_FOV, 2, deltaTime);
    this.camera.updateProjectionMatrix();
    this.environment.update(bounds.z, deltaTime);
  }

  tick(now) {
    requestAnimationFrame(this.tick);
    const rawDelta = this.lastFrameTime ? (now - this.lastFrameTime) / 1000 : 1 / 60;
    this.lastFrameTime = now;
    const deltaTime = Math.min(Math.max(rawDelta, 0), TIMING.MAX_DELTA);

    const isGameplayActive = this.state === GAME_STATES.PLAYING && !this.player.getBounds().isCrashed;
    this.performanceMonitor.update(rawDelta, isGameplayActive);

    if (this.state === GAME_STATES.PLAYING) this.updatePlaying(deltaTime);
    else if (this.state === GAME_STATES.MENU) this.updateMenuFlyover(deltaTime);
    else if (this.state === GAME_STATES.GAMEOVER) this.updateGameOver(deltaTime);

    this.rendererManager.render();
  }
}

const game = new AlpineOverdriveGame(document.getElementById('game-canvas'), document.getElementById('ui-root'));

if (import.meta.env.DEV) window.__alpineOverdrive = game;
