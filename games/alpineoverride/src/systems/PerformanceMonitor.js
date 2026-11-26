import { PERFORMANCE, QUALITY_CONFIG, QUALITY_TIERS, QUALITY_TIER_ORDER } from '../config/constants.js';

const MAX_VALID_DELTA = 0.25;
const MIN_SAMPLES_FOR_FPS = 5;
const DEFAULT_FPS = 60;
const FALLBACK_TIER = QUALITY_TIERS.MEDIUM;

const resolveTier = (tier) =>
  typeof tier === 'string' && Object.prototype.hasOwnProperty.call(QUALITY_CONFIG, tier) ? tier : FALLBACK_TIER;

export class PerformanceMonitor {
  constructor(onTierChangeCallback, initialTier = QUALITY_TIERS.HIGH) {
    this.onTierChange = typeof onTierChangeCallback === 'function' ? onTierChangeCallback : null;
    this.sampleCapacity = PERFORMANCE.SAMPLE_FRAMES;
    this.samples = new Float32Array(this.sampleCapacity);
    this.sampleCount = 0;
    this.sampleIndex = 0;
    this.sampleSum = 0;
    this.gameplayStreak = 0;
    this.cooldownElapsed = 0;
    this.lastFps = DEFAULT_FPS;
    this.autoMode = false;
    this.currentTier = resolveTier(initialTier);
  }

  update(rawDeltaTime, isGameplayActive = true) {
    if (!isGameplayActive) this.gameplayStreak = 0;

    if (!(rawDeltaTime > 0) || rawDeltaTime > MAX_VALID_DELTA) return;

    this.pushSample(rawDeltaTime);
    this.cooldownElapsed += rawDeltaTime;

    if (!isGameplayActive) return;

    if (this.gameplayStreak < this.sampleCapacity) this.gameplayStreak += 1;

    if (this.shouldDowngrade()) this.downgrade();
  }

  pushSample(deltaTime) {
    const samples = this.samples;
    if (this.sampleCount === this.sampleCapacity) {
      this.sampleSum -= samples[this.sampleIndex];
    } else {
      this.sampleCount += 1;
    }

    samples[this.sampleIndex] = deltaTime;
    this.sampleSum += samples[this.sampleIndex];
    this.sampleIndex += 1;

    if (this.sampleIndex === this.sampleCapacity) {
      this.sampleIndex = 0;
      let exactSum = 0;
      for (let index = 0; index < this.sampleCount; index += 1) exactSum += samples[index];
      this.sampleSum = exactSum;
    }

    if (this.sampleCount >= MIN_SAMPLES_FOR_FPS && this.sampleSum > 0) {
      this.lastFps = this.sampleCount / this.sampleSum;
    }
  }

  shouldDowngrade() {
    return (
      this.autoMode &&
      this.gameplayStreak >= this.sampleCapacity &&
      this.sampleCount >= this.sampleCapacity &&
      this.cooldownElapsed >= PERFORMANCE.DOWNGRADE_COOLDOWN &&
      this.lastFps < PERFORMANCE.FPS_THRESHOLD &&
      QUALITY_TIER_ORDER.indexOf(this.currentTier) > 0
    );
  }

  downgrade() {
    const nextTier = QUALITY_TIER_ORDER[QUALITY_TIER_ORDER.indexOf(this.currentTier) - 1];
    this.currentTier = nextTier;
    this.clearSamples();
    this.cooldownElapsed = 0;
    if (this.onTierChange) this.onTierChange(nextTier);
  }

  clearSamples() {
    this.samples.fill(0);
    this.sampleCount = 0;
    this.sampleIndex = 0;
    this.sampleSum = 0;
    this.gameplayStreak = 0;
  }

  getFPS() {
    return Math.round(this.lastFps);
  }

  setAutoMode(enabled) {
    const nextState = Boolean(enabled);
    if (nextState && !this.autoMode) {
      this.cooldownElapsed = 0;
      this.gameplayStreak = 0;
    }
    this.autoMode = nextState;
  }

  isAutoMode() {
    return this.autoMode;
  }

  setManualTier(tier) {
    this.currentTier = resolveTier(tier);
    this.clearSamples();
    this.cooldownElapsed = 0;
  }

  getCurrentTier() {
    return this.currentTier;
  }
}
