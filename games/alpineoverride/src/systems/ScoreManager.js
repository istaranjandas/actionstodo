import { GAME_MODES, NEAR_MISS, SCORE, STORAGE_KEYS } from '../config/constants.js';

const MS_TO_KMH = 3.6;
const COMBO_EXPIRY_EPSILON = 1e-6;

function getStorage() {
  try {
    if (typeof localStorage === 'undefined' || localStorage === null) return null;
    return localStorage;
  } catch {
    return null;
  }
}

const highScoreKeyFor = (mode) =>
  mode === GAME_MODES.UNLIMITED ? STORAGE_KEYS.HIGH_SCORE_UNLIMITED : STORAGE_KEYS.HIGH_SCORE;

function readStoredHighScore(key) {
  const storage = getStorage();
  if (!storage) return 0;
  try {
    const raw = storage.getItem(key);
    if (raw === null || raw === undefined) return 0;
    const value = Math.floor(Number(raw));
    return Number.isFinite(value) && value > 0 ? value : 0;
  } catch {
    return 0;
  }
}

function writeStoredHighScore(key, value) {
  const storage = getStorage();
  if (!storage) return false;
  try {
    storage.setItem(key, String(value));
    return true;
  } catch {
    return false;
  }
}

export class ScoreManager {
  constructor(mode = GAME_MODES.STANDARD) {
    this.mode = mode;
    this.storageKey = highScoreKeyFor(mode);
    this.highScore = readStoredHighScore(this.storageKey);
    this.runStartHighScore = this.highScore;

    this.telemetry = {
      score: 0,
      highScore: this.highScore,
      multiplier: 1,
      comboCount: 0,
      comboTimerRatio: 0,
      isWrongWay: false,
      speedKmh: 0,
      distanceKm: 0,
      impacts: 0,
    };

    this.summary = {
      score: 0,
      highScore: this.highScore,
      isNewHighScore: false,
      distanceKm: 0,
      topSpeedKmh: 0,
      nearMisses: 0,
      bestCombo: 0,
      wrongWaySeconds: 0,
      durationSeconds: 0,
      impacts: 0,
      mode,
    };

    this.nearMissResult = { pointsAdded: 0, currentCombo: 0, multiplier: 1 };

    this.resetRunState();
  }

  resetRunState() {
    this.score = 0;
    this.distance = 0;
    this.durationSeconds = 0;
    this.topSpeed = 0;
    this.wrongWaySeconds = 0;
    this.comboCount = 0;
    this.comboTimer = 0;
    this.nearMissCount = 0;
    this.impactCount = 0;
    this.bestCombo = 0;
    this.speed = 0;
    this.isWrongWay = false;
    this.isCrashed = false;
  }

  getMultiplier() {
    const comboMultiplier = this.comboCount > 1 ? this.comboCount : 1;
    return comboMultiplier * (this.isWrongWay ? SCORE.WRONG_WAY_MULTIPLIER : 1);
  }

  update(deltaTime, playerBounds) {
    if (!playerBounds) return;
    const speed = playerBounds.speed;
    this.speed = Number.isFinite(speed) && speed > 0 ? speed : 0;
    this.isWrongWay = playerBounds.isWrongWay === true;
    this.isCrashed = playerBounds.isCrashed === true;

    if (this.isCrashed || !Number.isFinite(deltaTime) || deltaTime <= 0) return;

    const currentSpeed = this.speed;
    const travelled = currentSpeed * deltaTime;

    this.durationSeconds += deltaTime;
    this.distance += travelled;
    if (currentSpeed > this.topSpeed) this.topSpeed = currentSpeed;
    if (this.isWrongWay) this.wrongWaySeconds += deltaTime;

    if (this.comboCount > 0) {
      this.comboTimer -= deltaTime;
      if (this.comboTimer <= COMBO_EXPIRY_EPSILON) {
        this.comboTimer = 0;
        this.comboCount = 0;
      }
    }

    this.score +=
      travelled * SCORE.POINTS_PER_METER * (currentSpeed / SCORE.REFERENCE_SPEED) * this.getMultiplier();
  }

  registerNearMiss(isOncoming) {
    const result = this.nearMissResult;
    if (this.isCrashed) {
      result.pointsAdded = 0;
      result.currentCombo = this.comboCount;
      result.multiplier = this.getMultiplier();
      return result;
    }

    this.comboCount = Math.min(NEAR_MISS.MAX_COMBO, this.comboCount + 1);
    this.comboTimer = NEAR_MISS.COMBO_DECAY_TIME;

    const pointsAdded = Math.round(
      NEAR_MISS.BASE_POINTS * this.comboCount * (isOncoming ? SCORE.WRONG_WAY_MULTIPLIER : 1),
    );
    this.score += pointsAdded;
    this.nearMissCount += 1;
    if (this.comboCount > this.bestCombo) this.bestCombo = this.comboCount;

    result.pointsAdded = pointsAdded;
    result.currentCombo = this.comboCount;
    result.multiplier = this.getMultiplier();
    return result;
  }

  registerImpact() {
    this.comboCount = 0;
    this.comboTimer = 0;
    this.impactCount += 1;
    return this.impactCount;
  }

  setMode(mode) {
    const nextMode = mode === GAME_MODES.UNLIMITED ? GAME_MODES.UNLIMITED : GAME_MODES.STANDARD;
    this.mode = nextMode;
    this.storageKey = highScoreKeyFor(nextMode);
    this.highScore = readStoredHighScore(this.storageKey);
    this.runStartHighScore = this.highScore;
    this.summary.mode = nextMode;
  }

  getTelemetry() {
    const telemetry = this.telemetry;
    const score = Math.floor(this.score);
    telemetry.score = score;
    telemetry.highScore = score > this.highScore ? score : this.highScore;
    telemetry.multiplier = this.getMultiplier();
    telemetry.comboCount = this.comboCount;
    telemetry.comboTimerRatio =
      this.comboCount > 0 ? Math.min(1, Math.max(0, this.comboTimer / NEAR_MISS.COMBO_DECAY_TIME)) : 0;
    telemetry.isWrongWay = this.isWrongWay;
    telemetry.speedKmh = Math.round(this.speed * MS_TO_KMH);
    telemetry.distanceKm = this.distance / 1000;
    telemetry.impacts = this.impactCount;
    return telemetry;
  }

  getSummary() {
    const summary = this.summary;
    const score = Math.floor(this.score);
    summary.score = score;
    summary.highScore = score > this.highScore ? score : this.highScore;
    summary.isNewHighScore = score > this.runStartHighScore;
    summary.distanceKm = this.distance / 1000;
    summary.topSpeedKmh = Math.round(this.topSpeed * MS_TO_KMH);
    summary.nearMisses = this.nearMissCount;
    summary.bestCombo = this.bestCombo;
    summary.wrongWaySeconds = this.wrongWaySeconds;
    summary.durationSeconds = this.durationSeconds;
    summary.impacts = this.impactCount;
    return summary;
  }

  saveHighScore() {
    const stored = readStoredHighScore(this.storageKey);
    if (stored > this.highScore) this.highScore = stored;
    const score = Math.floor(this.score);
    if (score <= this.highScore) return false;
    this.highScore = score;
    writeStoredHighScore(this.storageKey, score);
    return true;
  }

  getHighScore() {
    return this.highScore;
  }

  reset() {
    const stored = readStoredHighScore(this.storageKey);
    if (stored > this.highScore) this.highScore = stored;
    this.runStartHighScore = this.highScore;
    this.resetRunState();
  }
}
