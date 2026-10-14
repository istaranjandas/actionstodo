// Interface sounds: short, quiet and tonally related so the console feels like one instrument
import { getEffectsOutput, playNoise, playTone } from './soundEngine';
import type { AudioOutput } from './soundEngine';

export type UiSound = 'hover' | 'hoverRow' | 'click' | 'select' | 'dateStep' | 'open' | 'close' | 'toggleOn' | 'toggleOff' | 'add' | 'complete' | 'reopen' | 'remove' | 'drop' | 'travel';

// The same sound fired twice inside this window is one gesture, not two
// Rows get a longer guard so sweeping the pointer down a mission log ticks, rather than buzzes
const REPEAT_GUARD_MS: Partial<Record<UiSound, number>> = { hover: 60, hoverRow: 110, dateStep: 45, drop: 120, complete: 120, travel: 400 };
const DEFAULT_REPEAT_GUARD_MS = 35;
const lastPlayedAt = new Map<UiSound, number>();

function keyPress(output: AudioOutput, at: number, weight = 1) {
  playNoise(output, { startAt: at, duration: 0.03, gain: 0.16 * weight, frequency: 2600, q: 1.4 });
  playTone(output, { frequency: 190, glideTo: 95, startAt: at, duration: 0.06, gain: 0.2 * weight });
}

const SOUND_DESIGNS: Record<UiSound, (output: AudioOutput, at: number) => void> = {
  // Crisp ~15ms high-tech tick, low gain
  hover(output, at) {
    playTone(output, { frequency: 3400, startAt: at, duration: 0.015, type: 'triangle', gain: 0.02, attack: 0.001 });
  },
  // Quieter, slightly lower tick for sweeping across task rows and day cards
  hoverRow(output, at) {
    playTone(output, { frequency: 2700, startAt: at, duration: 0.012, type: 'triangle', gain: 0.013, attack: 0.001 });
  },
  click(output, at) {
    keyPress(output, at);
  },
  // Tactile low-mid mechanical thock (~45ms): a falling body plus a short filtered transient, no melody
  select(output, at) {
    playTone(output, { frequency: 210, glideTo: 130, startAt: at, duration: 0.045, gain: 0.26, attack: 0.002 });
    playNoise(output, { startAt: at, duration: 0.02, gain: 0.1, frequency: 1800, q: 1.2, attack: 0.001 });
  },
  // One notch along the timeline: the same thock, a touch higher and drier, like a detent
  dateStep(output, at) {
    playTone(output, { frequency: 250, glideTo: 160, startAt: at, duration: 0.045, gain: 0.22, attack: 0.002 });
    playNoise(output, { startAt: at, duration: 0.016, gain: 0.09, frequency: 2600, q: 1.6, attack: 0.001 });
  },
  open(output, at) {
    playNoise(output, { startAt: at, duration: 0.16, gain: 0.07, frequency: 700, sweepTo: 2800, q: 0.9, attack: 0.03 });
    playTone(output, { frequency: 440, glideTo: 660, startAt: at, duration: 0.14, gain: 0.06, attack: 0.02 });
  },
  close(output, at) {
    playNoise(output, { startAt: at, duration: 0.13, gain: 0.06, frequency: 2400, sweepTo: 600, q: 0.9, attack: 0.02 });
    playTone(output, { frequency: 620, glideTo: 392, startAt: at, duration: 0.12, gain: 0.05, attack: 0.015 });
  },
  toggleOn(output, at) {
    keyPress(output, at, 0.7);
    playTone(output, { frequency: 523.25, startAt: at, duration: 0.07, type: 'triangle', gain: 0.1 });
    playTone(output, { frequency: 783.99, startAt: at + 0.05, duration: 0.12, type: 'triangle', gain: 0.1 });
  },
  toggleOff(output, at) {
    keyPress(output, at, 0.7);
    playTone(output, { frequency: 783.99, startAt: at, duration: 0.07, type: 'triangle', gain: 0.09 });
    playTone(output, { frequency: 523.25, startAt: at + 0.05, duration: 0.12, type: 'triangle', gain: 0.08 });
  },
  add(output, at) {
    keyPress(output, at, 0.8);
    playNoise(output, { startAt: at, duration: 0.12, gain: 0.04, frequency: 1200, sweepTo: 4200, q: 0.8, attack: 0.02 });
    playTone(output, { frequency: 659.25, startAt: at + 0.02, duration: 0.09, type: 'triangle', gain: 0.12 });
    playTone(output, { frequency: 987.77, startAt: at + 0.08, duration: 0.18, type: 'triangle', gain: 0.11 });
  },
  // Mission complete: a two-note ascending chime (root, then the fifth), each with soft octave and twelfth partials
  complete(output, at) {
    keyPress(output, at, 0.6);
    [[659.25, 0.02, 0.5], [987.77, 0.13, 0.75]].forEach(([frequency, offset, duration]) => {
      playTone(output, { frequency, startAt: at + offset, duration, type: 'triangle', gain: 0.16, attack: 0.006 });
      playTone(output, { frequency: frequency * 2, startAt: at + offset, duration: duration * 0.75, gain: 0.035, attack: 0.006 });
      playTone(output, { frequency: frequency * 3, startAt: at + offset, duration: duration * 0.4, gain: 0.012, attack: 0.006 });
    });
  },
  reopen(output, at) {
    keyPress(output, at, 0.7);
    playTone(output, { frequency: 466.16, glideTo: 349.23, startAt: at, duration: 0.16, type: 'triangle', gain: 0.09 });
  },
  remove(output, at) {
    playNoise(output, { startAt: at, duration: 0.1, gain: 0.08, filterType: 'lowpass', frequency: 1400, sweepTo: 300, q: 0.7 });
    playTone(output, { frequency: 280, glideTo: 110, startAt: at, duration: 0.18, gain: 0.16 });
  },
  // Camera flight between views: a long airy swell with a soft rising tone underneath
  travel(output, at) {
    playNoise(output, { startAt: at, duration: 0.9, gain: 0.05, frequency: 320, sweepTo: 1500, q: 0.7, attack: 0.25 });
    playTone(output, { frequency: 196, glideTo: 293.66, startAt: at + 0.05, duration: 0.8, type: 'triangle', gain: 0.045, attack: 0.3 });
  },
  // Confirmation lock: a heavy seat, then a metallic latch snapping shut and a short confirm blip
  drop(output, at) {
    playTone(output, { frequency: 140, glideTo: 78, startAt: at, duration: 0.09, gain: 0.28, attack: 0.002 });
    playNoise(output, { startAt: at, duration: 0.05, gain: 0.07, filterType: 'lowpass', frequency: 800, q: 0.7, attack: 0.002 });
    playNoise(output, { startAt: at + 0.045, duration: 0.022, gain: 0.13, filterType: 'highpass', frequency: 3200, q: 0.9, attack: 0.001 });
    playTone(output, { frequency: 1318.5, startAt: at + 0.05, duration: 0.05, type: 'square', gain: 0.022, attack: 0.002 });
  }
};

export function playUiSound(sound: UiSound): void {
  const now = performance.now();
  const guard = REPEAT_GUARD_MS[sound] ?? DEFAULT_REPEAT_GUARD_MS;
  if (now - (lastPlayedAt.get(sound) ?? -Infinity) < guard) return;
  const output = getEffectsOutput();
  if (!output) return;
  lastPlayedAt.set(sound, now);
  SOUND_DESIGNS[sound](output, output.context.currentTime + 0.005);
}

// Named entry points for components that trigger sounds directly
export const playHover = () => playUiSound('hover');
export const playSelect = () => playUiSound('select');
export const playDateStep = () => playUiSound('dateStep');
export const playDrop = () => playUiSound('drop');
export const playComplete = () => playUiSound('complete');

export function isUiSound(value: string | undefined): value is UiSound {
  return Boolean(value && value in SOUND_DESIGNS);
}
