import * as THREE from 'three';
import {
  CAMERA,
  CAMERA_MODES,
  CAMERA_MODE_ORDER,
  PLAYER,
  clamp,
  damp,
  getRoadCurve,
  lerp,
  smoothstep,
} from '../config/constants.js';

const MODE_BLEND_DURATION = 0.45;
const CRASH_BLEND_DURATION = 0.35;
const MAX_STEP = 0.1;
const FOV_EPSILON = 0.01;
const ACCEL_LAMBDA = 4;
const ACCEL_LIMIT = 40;
const MIN_ACCEL_STEP = 1e-4;
const BUMP_MIN = -0.5;
const BUMP_MAX = 4;
const MAX_RELATIVE_YAW = 0.6;
const TWO_PI = Math.PI * 2;
const REFERENCE_ASPECT = 16 / 9;
const NARROW_FOV_WEIGHT = 0.5;
const NARROW_FOV_LIMIT = 100;

function fitFovToAspect(fov, aspect) {
  if (!(aspect > 0) || aspect >= REFERENCE_ASPECT) return fov;
  const halfVertical = THREE.MathUtils.degToRad(fov) * 0.5;
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * REFERENCE_ASPECT);
  const preserved = THREE.MathUtils.radToDeg(2 * Math.atan(Math.tan(halfHorizontal) / aspect));
  return Math.min(NARROW_FOV_LIMIT, lerp(fov, preserved, NARROW_FOV_WEIGHT));
}

const SHAKE = Object.freeze({
  POSITION: 0.6,
  ROTATION: 0.05,
  FREQUENCY: 18,
  DEPTH_RATIO: 0.5,
  SCRAPE_TRAUMA: 0.32,
});

const CHASE_RIG = Object.freeze({
  DISTANCE: 8.5,
  HEIGHT: 3.2,
  SPEED_PULLBACK: 1.1,
  SPEED_DROP: 0.22,
  ACCEL_PULLBACK: 0.03,
  ACCEL_PULLBACK_MIN: -0.6,
  ACCEL_PULLBACK_MAX: 0.9,
  CRASH_PULLBACK: 2.4,
  CRASH_RISE: 1.3,
  LATERAL_FOLLOW: 0.88,
  LOOK_NEAR: 12,
  LOOK_FAR: 35,
  LOOK_FAR_WEIGHT: 0.4,
  LOOK_NEAR_HEIGHT: 1.0,
  LOOK_FAR_HEIGHT: 1.6,
  LOOK_LATERAL_FOLLOW: 0.78,
  LOOK_FAR_LATERAL_RATIO: 0.6,
  YAW_LOOK_INFLUENCE: 0.45,
  LONGITUDINAL_LAMBDA: 6,
  VERTICAL_LAMBDA: 6,
  LATERAL_LAMBDA: 3.5,
  LOOK_LAMBDA: 5,
  ROLL_AMOUNT: 0.035,
  ROLL_LAMBDA: 5,
  FOV_MIN: CAMERA.FOV_MIN,
  FOV_MAX: CAMERA.FOV_MAX,
  FOV_ACCEL_BONUS: 0.06,
  FOV_ACCEL_BONUS_MAX: 1.5,
  FOV_LAMBDA: 2.5,
  SHAKE_POSITION_SCALE: 1,
});

const ISOMETRIC_RIG = Object.freeze({
  SIDE: 10,
  BEHIND: 18,
  HEIGHT: 20,
  SPEED_PULLBACK: 2.5,
  SPEED_RISE: 1.5,
  CRASH_PULLBACK: 2,
  CRASH_RISE: 2,
  LATERAL_FOLLOW: 0.3,
  LOOK_AHEAD: 20,
  LOOK_SPEED_AHEAD: 6,
  LOOK_HEIGHT: 0.4,
  LOOK_BUMP_RATIO: 0.5,
  LOOK_LATERAL_FOLLOW: 0.45,
  LONGITUDINAL_LAMBDA: 4,
  VERTICAL_LAMBDA: 4,
  LATERAL_LAMBDA: 3,
  LOOK_LAMBDA: 3,
  ROLL_AMOUNT: 0.008,
  ROLL_LAMBDA: 3,
  FOV_MIN: 50,
  FOV_MAX: 56,
  FOV_ACCEL_BONUS: 0.03,
  FOV_ACCEL_BONUS_MAX: 0.8,
  FOV_LAMBDA: 2,
  SHAKE_POSITION_SCALE: 1.2,
});

const HOOD_RIG = Object.freeze({
  FORWARD: 0.9,
  HEIGHT: 1.05,
  LOOK_DISTANCE: 60,
  LOOK_HEIGHT: 0.7,
  YAW_LAMBDA: 12,
  ROLL_AMOUNT: 0.012,
  ROLL_LAMBDA: 8,
  VIBRATION_POSITION: 0.014,
  VIBRATION_ROLL: 0.0025,
  VIBRATION_PITCH: 0.0018,
  VIBRATION_BASE_RATE: 22,
  VIBRATION_SPEED_RATE: 38,
  CRASH_BACK: 6,
  CRASH_HEIGHT: 2.7,
  CRASH_LOOK_HEIGHT: 0.6,
  FOV_MIN: 66,
  FOV_MAX: 84,
  FOV_ACCEL_BONUS: 0.08,
  FOV_ACCEL_BONUS_MAX: 2,
  FOV_LAMBDA: 2.5,
  SHAKE_POSITION_SCALE: 0.5,
});

const WORLD_UP = new THREE.Vector3(0, 1, 0);
const VIEW_AXIS = new THREE.Vector3(0, 0, 1);
const IDENTITY_QUATERNION = new THREE.Quaternion();
const orientMatrix = new THREE.Matrix4();
const rollQuaternion = new THREE.Quaternion();
const nearLookPoint = new THREE.Vector3();
const farLookPoint = new THREE.Vector3();
const hoodMountPoint = new THREE.Vector3();
const hoodLookPoint = new THREE.Vector3();
const crashViewPoint = new THREE.Vector3();
const crashLookPoint = new THREE.Vector3();

const wrapAngle = (angle) => angle - TWO_PI * Math.round(angle / TWO_PI);

function layeredNoise(time, seed) {
  return (
    Math.sin(time + seed) * 0.5 +
    Math.sin(time * 2.173 + seed * 1.618) * 0.3 +
    Math.sin(time * 4.519 + seed * 2.414) * 0.2
  );
}

function orientPose(quaternion, position, lookTarget, roll) {
  orientMatrix.lookAt(position, lookTarget, WORLD_UP);
  quaternion.setFromRotationMatrix(orientMatrix);
  if (roll !== 0) quaternion.multiply(rollQuaternion.setFromAxisAngle(VIEW_AXIS, roll));
  return quaternion;
}

function resolveSpeedFov(settings, frame) {
  const accelBonus = clamp(frame.accel * settings.FOV_ACCEL_BONUS, 0, settings.FOV_ACCEL_BONUS_MAX);
  const cruiseFov = clamp(
    lerp(settings.FOV_MIN, settings.FOV_MAX, frame.speedNorm) + accelBonus,
    settings.FOV_MIN,
    settings.FOV_MAX,
  );
  return lerp(cruiseFov, settings.FOV_MIN, frame.crashWeight);
}

function createPose(fov) {
  return { position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), fov };
}

function copyPose(target, source) {
  target.position.copy(source.position);
  target.quaternion.copy(source.quaternion);
  target.fov = source.fov;
  return target;
}

class RoadSpace {
  constructor() {
    this.curve = { x: 0, y: 0, dx: 0, dy: 0 };
    this.curveFunction = getRoadCurve;
  }

  setCurveFunction(curveFunction) {
    this.curveFunction = typeof curveFunction === 'function' ? curveFunction : getRoadCurve;
  }

  sample(z) {
    return this.curveFunction(z, this.curve) ?? this.curve;
  }

  mapPoint(localX, z, height, target) {
    const curve = this.sample(z);
    return target.set(curve.x + localX, curve.y + height, z);
  }
}

class CameraRig {
  constructor(settings) {
    this.settings = settings;
    this.pose = createPose(settings.FOV_MIN);
    this.targetPosition = new THREE.Vector3();
    this.lookTarget = new THREE.Vector3();
    this.roll = 0;
    this.fov = settings.FOV_MIN;
    this.initialized = false;
    this.lastFrame = -1;
  }

  invalidate() {
    this.initialized = false;
  }

  isLive(frameIndex) {
    return this.initialized && this.lastFrame === frameIndex;
  }

  update(frame, roadSpace, deltaTime, frameIndex) {
    this.solve(frame, roadSpace, deltaTime, !this.initialized);
    this.initialized = true;
    this.lastFrame = frameIndex;
  }

  follow(current, target, lambda, deltaTime, snap) {
    return snap ? target : damp(current, target, lambda, deltaTime);
  }
}

class ChaseRig extends CameraRig {
  constructor() {
    super(CHASE_RIG);
    this.distance = CHASE_RIG.DISTANCE;
    this.height = CHASE_RIG.HEIGHT;
    this.lateral = 0;
    this.lookLateral = 0;
  }

  solve(frame, roadSpace, deltaTime, snap) {
    const settings = this.settings;
    const crashEase = smoothstep(0, 1, frame.crashWeight);
    const accelPullback = clamp(
      frame.accel * settings.ACCEL_PULLBACK,
      settings.ACCEL_PULLBACK_MIN,
      settings.ACCEL_PULLBACK_MAX,
    );
    const distanceTarget =
      settings.DISTANCE +
      frame.speedNorm * settings.SPEED_PULLBACK +
      accelPullback +
      crashEase * settings.CRASH_PULLBACK;
    const heightTarget =
      settings.HEIGHT - frame.speedNorm * settings.SPEED_DROP + crashEase * settings.CRASH_RISE + frame.bump;
    const lateralTarget = frame.localX * settings.LATERAL_FOLLOW;
    const lookLateralTarget =
      frame.localX * settings.LOOK_LATERAL_FOLLOW -
      Math.tan(frame.relativeYaw) * settings.LOOK_NEAR * settings.YAW_LOOK_INFLUENCE;

    this.distance = this.follow(this.distance, distanceTarget, settings.LONGITUDINAL_LAMBDA, deltaTime, snap);
    this.height = this.follow(this.height, heightTarget, settings.VERTICAL_LAMBDA, deltaTime, snap);
    this.lateral = this.follow(this.lateral, lateralTarget, settings.LATERAL_LAMBDA, deltaTime, snap);
    this.lookLateral = this.follow(this.lookLateral, lookLateralTarget, settings.LOOK_LAMBDA, deltaTime, snap);
    this.roll = this.follow(this.roll, -frame.lateralNorm * settings.ROLL_AMOUNT, settings.ROLL_LAMBDA, deltaTime, snap);
    this.fov = this.follow(this.fov, resolveSpeedFov(settings, frame), settings.FOV_LAMBDA, deltaTime, snap);

    roadSpace.mapPoint(lateralTarget, frame.carZ + distanceTarget, heightTarget, this.targetPosition);
    roadSpace.mapPoint(this.lateral, frame.carZ + this.distance, this.height, this.pose.position);
    roadSpace.mapPoint(
      this.lookLateral,
      frame.carZ - settings.LOOK_NEAR,
      settings.LOOK_NEAR_HEIGHT + frame.bump,
      nearLookPoint,
    );
    roadSpace.mapPoint(
      this.lookLateral * settings.LOOK_FAR_LATERAL_RATIO,
      frame.carZ - settings.LOOK_FAR,
      settings.LOOK_FAR_HEIGHT,
      farLookPoint,
    );
    this.lookTarget.lerpVectors(nearLookPoint, farLookPoint, settings.LOOK_FAR_WEIGHT);
    orientPose(this.pose.quaternion, this.pose.position, this.lookTarget, this.roll);
    this.pose.fov = this.fov;
  }
}

class IsometricRig extends CameraRig {
  constructor() {
    super(ISOMETRIC_RIG);
    this.behind = ISOMETRIC_RIG.BEHIND;
    this.height = ISOMETRIC_RIG.HEIGHT;
    this.side = ISOMETRIC_RIG.SIDE;
    this.lookAhead = ISOMETRIC_RIG.LOOK_AHEAD;
    this.lookLateral = 0;
  }

  solve(frame, roadSpace, deltaTime, snap) {
    const settings = this.settings;
    const crashEase = smoothstep(0, 1, frame.crashWeight);
    const behindTarget =
      settings.BEHIND + frame.speedNorm * settings.SPEED_PULLBACK + crashEase * settings.CRASH_PULLBACK;
    const heightTarget =
      settings.HEIGHT + frame.speedNorm * settings.SPEED_RISE + crashEase * settings.CRASH_RISE + frame.bump;
    const sideTarget = settings.SIDE + frame.localX * settings.LATERAL_FOLLOW;
    const lookAheadTarget = settings.LOOK_AHEAD + frame.speedNorm * settings.LOOK_SPEED_AHEAD * (1 - crashEase);
    const lookLateralTarget = frame.localX * settings.LOOK_LATERAL_FOLLOW;

    this.behind = this.follow(this.behind, behindTarget, settings.LONGITUDINAL_LAMBDA, deltaTime, snap);
    this.height = this.follow(this.height, heightTarget, settings.VERTICAL_LAMBDA, deltaTime, snap);
    this.side = this.follow(this.side, sideTarget, settings.LATERAL_LAMBDA, deltaTime, snap);
    this.lookAhead = this.follow(this.lookAhead, lookAheadTarget, settings.LONGITUDINAL_LAMBDA, deltaTime, snap);
    this.lookLateral = this.follow(this.lookLateral, lookLateralTarget, settings.LOOK_LAMBDA, deltaTime, snap);
    this.roll = this.follow(this.roll, -frame.lateralNorm * settings.ROLL_AMOUNT, settings.ROLL_LAMBDA, deltaTime, snap);
    this.fov = this.follow(this.fov, resolveSpeedFov(settings, frame), settings.FOV_LAMBDA, deltaTime, snap);

    roadSpace.mapPoint(sideTarget, frame.carZ + behindTarget, heightTarget, this.targetPosition);
    roadSpace.mapPoint(this.side, frame.carZ + this.behind, this.height, this.pose.position);
    roadSpace.mapPoint(
      this.lookLateral,
      frame.carZ - this.lookAhead,
      settings.LOOK_HEIGHT + frame.bump * settings.LOOK_BUMP_RATIO,
      this.lookTarget,
    );
    orientPose(this.pose.quaternion, this.pose.position, this.lookTarget, this.roll);
    this.pose.fov = this.fov;
  }
}

class HoodRig extends CameraRig {
  constructor() {
    super(HOOD_RIG);
    this.relativeYaw = 0;
    this.vibrationPhase = 0;
  }

  solve(frame, roadSpace, deltaTime, snap) {
    const settings = this.settings;
    this.relativeYaw = this.follow(this.relativeYaw, frame.relativeYaw, settings.YAW_LAMBDA, deltaTime, snap);
    this.fov = this.follow(this.fov, resolveSpeedFov(settings, frame), settings.FOV_LAMBDA, deltaTime, snap);
    this.vibrationPhase +=
      deltaTime * (settings.VIBRATION_BASE_RATE + settings.VIBRATION_SPEED_RATE * frame.speedNorm);

    const phase = this.vibrationPhase;
    const intensity = frame.speedNorm * frame.speedNorm * (1 - frame.crashWeight);
    const vibrationHeight =
      intensity * settings.VIBRATION_POSITION * (Math.sin(phase) * 0.6 + Math.sin(phase * 2.37 + 1.1) * 0.4);
    const vibrationRoll =
      intensity * settings.VIBRATION_ROLL * (Math.sin(phase * 1.73 + 0.4) * 0.7 + Math.sin(phase * 3.11 + 2.2) * 0.3);
    const vibrationPitch =
      intensity *
      settings.VIBRATION_PITCH *
      (Math.sin(phase * 1.29 + 2.9) * 0.65 + Math.sin(phase * 2.83 + 0.7) * 0.35);

    const rollTarget = -frame.lateralNorm * settings.ROLL_AMOUNT;
    this.roll = this.follow(this.roll, rollTarget, settings.ROLL_LAMBDA, deltaTime, snap);

    const heading = frame.roadYaw + this.relativeYaw;
    hoodMountPoint.set(
      frame.carX - Math.sin(heading) * settings.FORWARD,
      frame.carY + settings.HEIGHT - frame.roadDy * settings.FORWARD + vibrationHeight,
      frame.carZ - Math.cos(heading) * settings.FORWARD,
    );
    roadSpace.mapPoint(
      frame.localX - Math.tan(this.relativeYaw) * settings.LOOK_DISTANCE,
      frame.carZ - settings.LOOK_DISTANCE,
      settings.LOOK_HEIGHT + frame.bump + vibrationPitch * settings.LOOK_DISTANCE,
      hoodLookPoint,
    );

    const position = this.pose.position;
    if (frame.crashWeight > 0) {
      const retreat = smoothstep(0, 1, frame.crashWeight);
      const remaining = 1 - frame.crashWeight;
      const rise = 1 - remaining * remaining * remaining;
      roadSpace.mapPoint(frame.localX, frame.carZ + settings.CRASH_BACK, settings.CRASH_HEIGHT + frame.bump, crashViewPoint);
      crashLookPoint.set(frame.carX, frame.carY + settings.CRASH_LOOK_HEIGHT, frame.carZ);
      position.lerpVectors(hoodMountPoint, crashViewPoint, retreat);
      position.y = lerp(hoodMountPoint.y, crashViewPoint.y, rise);
      this.lookTarget.lerpVectors(hoodLookPoint, crashLookPoint, retreat);
    } else {
      position.copy(hoodMountPoint);
      this.lookTarget.copy(hoodLookPoint);
    }

    this.targetPosition.copy(position);
    orientPose(this.pose.quaternion, position, this.lookTarget, this.roll + vibrationRoll);
    this.pose.fov = this.fov;
  }
}

export class CameraController {
  constructor(camera) {
    this.camera = camera;
    this.roadSpace = new RoadSpace();
    this.rigs = {
      [CAMERA_MODES.CHASE]: new ChaseRig(),
      [CAMERA_MODES.ISOMETRIC]: new IsometricRig(),
      [CAMERA_MODES.HOOD]: new HoodRig(),
    };
    this.mode = CAMERA_MODES.CHASE;
    this.blendFromMode = null;
    this.blendElapsed = 0;
    this.blendWeight = 1;
    this.residualPosition = new THREE.Vector3();
    this.residualQuaternion = new THREE.Quaternion();
    this.residualFov = 0;
    this.blendQuaternion = new THREE.Quaternion();
    this.basePose = createPose(camera.fov);
    this.basePose.position.copy(camera.position);
    this.basePose.quaternion.copy(camera.quaternion);
    this.shakeOffset = new THREE.Vector3();
    this.shakeEuler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.shakeQuaternion = new THREE.Quaternion();
    this.frame = {
      carX: 0,
      carY: 0,
      carZ: 0,
      localX: 0,
      roadYaw: 0,
      roadDy: 0,
      bump: 0,
      speedNorm: 0,
      accel: 0,
      lateralNorm: 0,
      relativeYaw: 0,
      crashWeight: 0,
      crashed: false,
    };
    this.previousSpeed = 0;
    this.trauma = 0;
    this.noiseTime = 0;
    this.frameIndex = 0;
    this.needsSnap = true;
  }

  cycleMode() {
    const index = CAMERA_MODE_ORDER.indexOf(this.mode);
    this.setMode(CAMERA_MODE_ORDER[(index + 1) % CAMERA_MODE_ORDER.length]);
    return this.mode;
  }

  setMode(mode) {
    if (!CAMERA_MODE_ORDER.includes(mode) || mode === this.mode) return this.mode;
    const previousMode = this.mode;
    const previousRig = this.rigs[previousMode];
    this.mode = mode;

    if (this.needsSnap || !previousRig.isLive(this.frameIndex)) {
      this.blendFromMode = null;
      this.blendWeight = 1;
      this.rigs[mode].invalidate();
      return this.mode;
    }

    const fromPose = previousRig.pose;
    this.residualPosition.subVectors(this.basePose.position, fromPose.position);
    this.residualQuaternion.copy(fromPose.quaternion).invert().premultiply(this.basePose.quaternion);
    this.residualFov = this.basePose.fov - fromPose.fov;
    this.blendFromMode = previousMode;
    this.blendElapsed = 0;
    this.blendWeight = 0;
    const nextRig = this.rigs[mode];
    if (!nextRig.isLive(this.frameIndex)) nextRig.invalidate();
    return this.mode;
  }

  getMode() {
    return this.mode;
  }

  addTrauma(amount) {
    if (!Number.isFinite(amount) || amount <= 0) return;
    this.trauma = Math.min(CAMERA.MAX_TRAUMA, this.trauma + amount);
  }

  getTrauma() {
    return this.trauma;
  }

  isBlending() {
    return this.blendFromMode !== null;
  }

  getTargetPosition(target) {
    return target.copy(this.rigs[this.mode].targetPosition);
  }

  reset() {
    this.needsSnap = true;
    this.trauma = 0;
    this.blendFromMode = null;
    this.blendElapsed = 0;
    this.blendWeight = 1;
    this.residualPosition.set(0, 0, 0);
    this.residualQuaternion.identity();
    this.residualFov = 0;
    this.shakeOffset.set(0, 0, 0);
    this.shakeQuaternion.identity();
    this.frame.accel = 0;
    this.frame.crashWeight = 0;
  }

  update(deltaTime, playerState, roadCurveFn) {
    if (!playerState || !Number.isFinite(playerState.z)) return;
    const step = Number.isFinite(deltaTime) ? clamp(deltaTime, 0, MAX_STEP) : 0;
    const snap = this.needsSnap;
    this.roadSpace.setCurveFunction(roadCurveFn);

    if (snap) {
      for (let index = 0; index < CAMERA_MODE_ORDER.length; index += 1) {
        this.rigs[CAMERA_MODE_ORDER[index]].invalidate();
      }
      this.blendFromMode = null;
      this.blendWeight = 1;
    }

    this.prepareFrame(step, playerState, snap);
    this.frameIndex += 1;

    const activeRig = this.rigs[this.mode];
    activeRig.update(this.frame, this.roadSpace, step, this.frameIndex);

    let shakeScale = activeRig.settings.SHAKE_POSITION_SCALE;
    if (this.blendFromMode !== null) {
      this.blendElapsed += step;
      if (this.blendElapsed >= MODE_BLEND_DURATION) {
        this.blendFromMode = null;
        this.blendWeight = 1;
      }
    }

    if (this.blendFromMode !== null) {
      const fromRig = this.rigs[this.blendFromMode];
      fromRig.update(this.frame, this.roadSpace, step, this.frameIndex);
      this.blendWeight = smoothstep(0, MODE_BLEND_DURATION, this.blendElapsed);
      this.composeBlend(fromRig.pose, activeRig.pose, this.blendWeight);
      shakeScale = lerp(fromRig.settings.SHAKE_POSITION_SCALE, shakeScale, this.blendWeight);
    } else {
      copyPose(this.basePose, activeRig.pose);
    }

    this.updateShake(step, playerState, shakeScale);
    this.applyToCamera(snap);
    this.needsSnap = false;
  }

  prepareFrame(deltaTime, playerState, snap) {
    const frame = this.frame;
    const curve = this.roadSpace.sample(playerState.z);
    const roadX = curve.x;
    const roadY = curve.y;
    frame.carZ = playerState.z;
    frame.localX = Number.isFinite(playerState.localX)
      ? playerState.localX
      : Number.isFinite(playerState.worldX)
        ? playerState.worldX - roadX
        : 0;
    frame.carX = Number.isFinite(playerState.worldX) ? playerState.worldX : roadX + frame.localX;
    frame.carY = Number.isFinite(playerState.y) ? playerState.y : roadY;
    frame.roadDy = curve.dy;
    frame.roadYaw = Math.atan(curve.dx);
    frame.bump = clamp(frame.carY - roadY, BUMP_MIN, BUMP_MAX);

    const speed = Number.isFinite(playerState.speed) ? playerState.speed : PLAYER.MIN_SPEED;
    frame.speedNorm = clamp((speed - PLAYER.MIN_SPEED) / (PLAYER.MAX_SPEED_CAP - PLAYER.MIN_SPEED), 0, 1);

    const crashed = Boolean(playerState.isCrashed);
    frame.crashed = crashed;
    if (snap) {
      frame.accel = 0;
      frame.crashWeight = crashed ? 1 : 0;
    } else {
      if (deltaTime > MIN_ACCEL_STEP) {
        const rawAccel = crashed ? 0 : clamp((speed - this.previousSpeed) / deltaTime, -ACCEL_LIMIT, ACCEL_LIMIT);
        frame.accel = damp(frame.accel, rawAccel, ACCEL_LAMBDA, deltaTime);
      }
      frame.crashWeight = crashed ? Math.min(1, frame.crashWeight + deltaTime / CRASH_BLEND_DURATION) : 0;
    }
    this.previousSpeed = speed;

    const lateralVelocity = Number.isFinite(playerState.lateralVelocity) ? playerState.lateralVelocity : 0;
    frame.lateralNorm = crashed ? 0 : clamp(lateralVelocity / PLAYER.STEER_SPEED, -1, 1);
    const yaw = Number.isFinite(playerState.yaw) ? playerState.yaw : frame.roadYaw;
    frame.relativeYaw = crashed
      ? 0
      : clamp(wrapAngle(yaw - frame.roadYaw), -MAX_RELATIVE_YAW, MAX_RELATIVE_YAW);
  }

  composeBlend(fromPose, toPose, weight) {
    const residualWeight = 1 - weight;
    const base = this.basePose;
    const fromHeight = fromPose.position.y + this.residualPosition.y * residualWeight;
    const toHeight = toPose.position.y;
    const heightWeight =
      toHeight < fromHeight ? weight * weight * weight : 1 - residualWeight * residualWeight * residualWeight;

    base.position
      .copy(fromPose.position)
      .addScaledVector(this.residualPosition, residualWeight)
      .lerp(toPose.position, weight);
    base.position.y = lerp(fromHeight, toHeight, heightWeight);

    this.blendQuaternion
      .slerpQuaternions(IDENTITY_QUATERNION, this.residualQuaternion, residualWeight)
      .multiply(fromPose.quaternion);
    base.quaternion.slerpQuaternions(this.blendQuaternion, toPose.quaternion, weight);
    base.fov = lerp(fromPose.fov + this.residualFov * residualWeight, toPose.fov, weight);
  }

  updateShake(deltaTime, playerState, positionScale) {
    if (playerState.isScraping) this.trauma = Math.max(this.trauma, SHAKE.SCRAPE_TRAUMA);
    this.noiseTime += deltaTime * SHAKE.FREQUENCY;
    const shake = this.trauma * this.trauma;

    if (shake > 0) {
      const time = this.noiseTime;
      const positionAmount = SHAKE.POSITION * shake * positionScale;
      const rotationAmount = SHAKE.ROTATION * shake;
      this.shakeOffset
        .set(
          layeredNoise(time, 0) * positionAmount,
          layeredNoise(time, 17.3) * positionAmount,
          layeredNoise(time, 41.9) * positionAmount * SHAKE.DEPTH_RATIO,
        )
        .applyQuaternion(this.basePose.quaternion);
      this.shakeEuler.set(
        layeredNoise(time, 63.1) * rotationAmount,
        layeredNoise(time, 88.7) * rotationAmount,
        layeredNoise(time, 112.4) * rotationAmount,
      );
      this.shakeQuaternion.setFromEuler(this.shakeEuler);
    } else {
      this.shakeOffset.set(0, 0, 0);
      this.shakeQuaternion.identity();
    }

    this.trauma = Math.max(0, this.trauma - CAMERA.TRAUMA_DECAY * deltaTime);
  }

  applyToCamera(forceProjection) {
    const camera = this.camera;
    camera.position.copy(this.basePose.position).add(this.shakeOffset);
    camera.quaternion.copy(this.basePose.quaternion).multiply(this.shakeQuaternion);
    const fov = fitFovToAspect(this.basePose.fov, camera.aspect);
    if (forceProjection || Math.abs(camera.fov - fov) > FOV_EPSILON) {
      camera.fov = fov;
      camera.updateProjectionMatrix();
    }
  }
}
