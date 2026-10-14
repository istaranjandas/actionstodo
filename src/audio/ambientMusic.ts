// Generative ambient soundtrack: slow evolving pad chords, a breath of wind and the odd distant chime.
// Built from oscillators and filtered noise on the music bus, so it never needs an audio file.
import { getMusicOutput } from './soundEngine';
import type { AudioOutput } from './soundEngine';

const CHORD_PROGRESSION = [
  [110, 164.81, 196, 246.94, 329.63],
  [87.31, 130.81, 174.61, 220, 329.63],
  [98, 146.83, 196, 246.94, 293.66],
  [82.41, 123.47, 164.81, 196, 293.66]
];
const CHORD_SECONDS = 16;
const CHORD_ATTACK_SECONDS = 6;
const CHORD_RELEASE_SECONDS = 8;
const VOICE_GAIN = 0.035;
const FADE_IN_SECONDS = 4;
const FADE_OUT_SECONDS = 2.5;

interface AmbientSession {
  output: AudioOutput;
  master: GainNode;
  padFilter: BiquadFilterNode;
  padInput: GainNode;
  chimeInput: GainNode;
  sustainedNodes: AudioScheduledSourceNode[];
  timers: number[];
  chordIndex: number;
}

let session: AmbientSession | null = null;

function createReverbImpulse(context: AudioContext, seconds: number): AudioBuffer {
  const length = Math.floor(context.sampleRate * seconds);
  const impulse = context.createBuffer(2, length, context.sampleRate);
  for (let channel = 0; channel < 2; channel++) {
    const samples = impulse.getChannelData(channel);
    for (let i = 0; i < length; i++) samples[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, 3.2);
  }
  return impulse;
}

function playChord(active: AmbientSession) {
  const { context } = active.output;
  const startAt = context.currentTime + 0.05;
  const endAt = startAt + CHORD_SECONDS + CHORD_RELEASE_SECONDS;
  const notes = CHORD_PROGRESSION[active.chordIndex % CHORD_PROGRESSION.length];
  active.chordIndex += 1;

  notes.forEach((frequency) => {
    [
      { type: 'sine' as OscillatorType, detune: -7 },
      { type: 'triangle' as OscillatorType, detune: 7 }
    ].forEach(({ type, detune }) => {
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.type = type;
      oscillator.frequency.value = frequency;
      oscillator.detune.value = detune;
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.exponentialRampToValueAtTime(VOICE_GAIN, startAt + CHORD_ATTACK_SECONDS);
      envelope.gain.setValueAtTime(VOICE_GAIN, startAt + CHORD_SECONDS);
      envelope.gain.exponentialRampToValueAtTime(0.0001, endAt);
      oscillator.connect(envelope).connect(active.padInput);
      oscillator.start(startAt);
      oscillator.stop(endAt + 0.1);
    });
  });

  active.timers.push(window.setTimeout(() => playChord(active), CHORD_SECONDS * 1000));
}

function scheduleChime(active: AmbientSession) {
  const delayMs = 7000 + Math.random() * 6000;
  active.timers.push(
    window.setTimeout(() => {
      const { context } = active.output;
      const notes = CHORD_PROGRESSION[(active.chordIndex + CHORD_PROGRESSION.length - 1) % CHORD_PROGRESSION.length];
      const frequency = notes[1 + Math.floor(Math.random() * (notes.length - 1))] * 4;
      const startAt = context.currentTime + 0.05;
      const oscillator = context.createOscillator();
      const envelope = context.createGain();
      oscillator.frequency.value = frequency;
      envelope.gain.setValueAtTime(0.0001, startAt);
      envelope.gain.exponentialRampToValueAtTime(0.02, startAt + 0.03);
      envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + 3.2);
      oscillator.connect(envelope).connect(active.chimeInput);
      oscillator.start(startAt);
      oscillator.stop(startAt + 3.3);
      scheduleChime(active);
    }, delayMs)
  );
}

export function startAmbientMusic(): void {
  if (session) return;
  const output = getMusicOutput();
  if (!output) return;
  const { context, destination, noise } = output;
  const now = context.currentTime;

  const master = context.createGain();
  master.gain.setValueAtTime(0.0001, now);
  master.gain.exponentialRampToValueAtTime(1, now + FADE_IN_SECONDS);
  master.connect(destination);

  const reverb = context.createConvolver();
  reverb.buffer = createReverbImpulse(context, 3.5);
  const reverbReturn = context.createGain();
  reverbReturn.gain.value = 0.55;
  reverb.connect(reverbReturn).connect(master);

  const padFilter = context.createBiquadFilter();
  padFilter.type = 'lowpass';
  padFilter.frequency.value = 900;
  padFilter.Q.value = 0.4;
  padFilter.connect(master);
  padFilter.connect(reverb);

  const filterSweep = context.createOscillator();
  const sweepDepth = context.createGain();
  filterSweep.frequency.value = 0.035;
  sweepDepth.gain.value = 320;
  filterSweep.connect(sweepDepth).connect(padFilter.frequency);
  filterSweep.start(now);

  const padInput = context.createGain();
  padInput.connect(padFilter);

  const chimeInput = context.createGain();
  chimeInput.gain.value = 0.6;
  chimeInput.connect(reverb);
  chimeInput.connect(master);

  const wind = context.createBufferSource();
  const windFilter = context.createBiquadFilter();
  const windLevel = context.createGain();
  wind.buffer = noise;
  wind.loop = true;
  windFilter.type = 'bandpass';
  windFilter.frequency.value = 480;
  windFilter.Q.value = 0.35;
  windLevel.gain.value = 0.014;
  wind.connect(windFilter).connect(windLevel).connect(master);
  wind.start(now);

  session = { output, master, padFilter, padInput, chimeInput, sustainedNodes: [filterSweep, wind], timers: [], chordIndex: 0 };
  playChord(session);
  scheduleChime(session);
}

export function stopAmbientMusic(): void {
  const active = session;
  if (!active) return;
  session = null;
  active.timers.forEach((timer) => window.clearTimeout(timer));
  const { context } = active.output;
  const now = context.currentTime;
  active.master.gain.cancelScheduledValues(now);
  active.master.gain.setValueAtTime(Math.max(active.master.gain.value, 0.0001), now);
  active.master.gain.exponentialRampToValueAtTime(0.0001, now + FADE_OUT_SECONDS);
  active.sustainedNodes.forEach((node) => node.stop(now + FADE_OUT_SECONDS + 0.1));
  window.setTimeout(() => active.master.disconnect(), (FADE_OUT_SECONDS + 0.3) * 1000);
}

// Opens the pad's filter briefly so the soundtrack breathes with each camera flight
export function swellAmbientMusic(): void {
  if (!session) return;
  const { context } = session.output;
  const now = context.currentTime;
  const cutoff = session.padFilter.frequency;
  cutoff.cancelScheduledValues(now);
  cutoff.setValueAtTime(cutoff.value, now);
  cutoff.linearRampToValueAtTime(1500, now + 0.6);
  cutoff.linearRampToValueAtTime(900, now + 2.4);
}
