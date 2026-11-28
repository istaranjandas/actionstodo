// Shared Web Audio graph: one context, an effects bus and a music bus, both behind a soft limiter.
// Every sound is synthesised here at runtime, so there are no audio files to license or download.

// Fixed levels that sit politely under other apps
const EFFECTS_BUS_LEVEL = 0.3;
const MUSIC_BUS_LEVEL = 0.12;

interface AudioGraph {
  context: AudioContext;
  effects: GainNode;
  music: GainNode;
  noise: AudioBuffer;
}

export interface AudioOutput {
  context: AudioContext;
  destination: AudioNode;
  noise: AudioBuffer;
}

let graph: AudioGraph | null = null;
const unlockListeners = new Set<() => void>();

// Browsers without navigator.userActivation (older Safari) only count once a real gesture is seen
const userActivation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
let gestureSeen = false;
if (!userActivation) {
  const markGesture = () => {
    gestureSeen = true;
    ['pointerdown', 'keydown', 'touchend'].forEach((type) => window.removeEventListener(type, markGesture, true));
  };
  ['pointerdown', 'keydown', 'touchend'].forEach((type) => window.addEventListener(type, markGesture, true));
}

function hasUserActivation(): boolean {
  return userActivation ? userActivation.hasBeenActive : gestureSeen;
}

// Listeners (the music) wait for a running context, so nothing queues up against a frozen clock.
// Re-announced after each resume (e.g. an iOS interruption); listeners must be idempotent.
function announceUnlockIfRunning() {
  if (!graph || graph.context.state !== 'running') return;
  unlockListeners.forEach((listener) => listener());
}

function createNoiseBuffer(context: AudioContext): AudioBuffer {
  const buffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
  const samples = buffer.getChannelData(0);
  for (let i = 0; i < samples.length; i++) samples[i] = Math.random() * 2 - 1;
  return buffer;
}

// Browsers only allow audio after a user gesture, so the graph is built lazily on the first one
function ensureGraph(): AudioGraph | null {
  if (graph) {
    // 'interrupted' (iOS after a lock or call) needs a resume just like 'suspended'
    if (graph.context.state !== 'running' && graph.context.state !== 'closed') void graph.context.resume().catch(() => undefined);
    return graph;
  }
  if (!hasUserActivation() || typeof window.AudioContext !== 'function') return null;

  const context = new AudioContext({ latencyHint: 'interactive' });
  const limiter = context.createDynamicsCompressor();
  limiter.threshold.value = -12;
  limiter.knee.value = 10;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;
  limiter.connect(context.destination);

  const effects = context.createGain();
  const music = context.createGain();
  effects.gain.value = EFFECTS_BUS_LEVEL;
  // The music bus fades in rather than starting at full level
  music.gain.value = 0;
  music.gain.setTargetAtTime(MUSIC_BUS_LEVEL, context.currentTime, 0.6);
  effects.connect(limiter);
  music.connect(limiter);

  graph = { context, effects, music, noise: createNoiseBuffer(context) };
  context.addEventListener('statechange', announceUnlockIfRunning);
  if (context.state === 'suspended') void context.resume().catch(() => undefined);
  announceUnlockIfRunning();
  return graph;
}

export function unlockAudio(): void {
  ensureGraph();
}

export function isAudioUnlocked(): boolean {
  return graph !== null && graph.context.state === 'running';
}

export function onAudioUnlocked(listener: () => void): () => void {
  unlockListeners.add(listener);
  return () => unlockListeners.delete(listener);
}

export function getEffectsOutput(): AudioOutput | null {
  const active = ensureGraph();
  return active ? { context: active.context, destination: active.effects, noise: active.noise } : null;
}

export function getMusicOutput(): AudioOutput | null {
  const active = ensureGraph();
  return active ? { context: active.context, destination: active.music, noise: active.noise } : null;
}

export interface ToneOptions {
  frequency: number;
  startAt: number;
  duration: number;
  type?: OscillatorType;
  gain: number;
  attack?: number;
  glideTo?: number;
  detune?: number;
}

export function playTone(output: AudioOutput, { frequency, startAt, duration, type = 'sine', gain, attack = 0.006, glideTo, detune = 0 }: ToneOptions): void {
  const { context, destination } = output;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.detune.value = detune;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  if (glideTo) oscillator.frequency.exponentialRampToValueAtTime(glideTo, startAt + duration);
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(gain, startAt + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(envelope).connect(destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.05);
}

export interface NoiseOptions {
  startAt: number;
  duration: number;
  gain: number;
  filterType?: BiquadFilterType;
  frequency: number;
  sweepTo?: number;
  q?: number;
  attack?: number;
}

export function playNoise(output: AudioOutput, { startAt, duration, gain, filterType = 'bandpass', frequency, sweepTo, q = 1, attack = 0.004 }: NoiseOptions): void {
  const { context, destination, noise } = output;
  const source = context.createBufferSource();
  const filter = context.createBiquadFilter();
  const envelope = context.createGain();
  source.buffer = noise;
  filter.type = filterType;
  filter.Q.value = q;
  filter.frequency.setValueAtTime(frequency, startAt);
  if (sweepTo) filter.frequency.exponentialRampToValueAtTime(sweepTo, startAt + duration);
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(gain, startAt + attack);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  source.connect(filter).connect(envelope).connect(destination);
  // Random offset, kept short enough that the buffer outlasts the sound and its fade
  source.start(startAt, Math.random() * Math.max(0, Math.min(1.5, noise.duration - duration - 0.05)));
  source.stop(startAt + duration + 0.05);
}
