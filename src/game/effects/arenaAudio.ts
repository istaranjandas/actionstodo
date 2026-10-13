let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation;
  if (activation && !activation.hasBeenActive) return null;
  if (typeof window.AudioContext !== 'function') return null;
  if (!audioContext) audioContext = new AudioContext();
  if (audioContext.state === 'suspended') void audioContext.resume();
  return audioContext;
}

export function warmUpArenaAudio(): void {
  getAudioContext();
}

function playTone(context: AudioContext, destination: AudioNode, frequency: number, startAt: number, duration: number, type: OscillatorType, peakGain: number) {
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = type;
  oscillator.frequency.setValueAtTime(frequency, startAt);
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(peakGain, startAt + 0.015);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + duration);
  oscillator.connect(envelope).connect(destination);
  oscillator.start(startAt);
  oscillator.stop(startAt + duration + 0.05);
}

function createMaster(context: AudioContext, volume: number): GainNode {
  const master = context.createGain();
  master.gain.value = volume;
  master.connect(context.destination);
  return master;
}

export function playVictoryChime(): void {
  const context = getAudioContext();
  if (!context) return;
  const master = createMaster(context, 0.32);
  const startAt = context.currentTime + 0.02;
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    const noteStart = startAt + index * 0.085;
    playTone(context, master, frequency, noteStart, 0.7, 'triangle', 0.5);
    playTone(context, master, frequency * 2, noteStart, 0.45, 'sine', 0.12);
  });
  playTone(context, master, 1567.98, startAt + 0.36, 1.1, 'sine', 0.18);
}

export function playLevelUpFanfare(): void {
  const context = getAudioContext();
  if (!context) return;
  const master = createMaster(context, 0.3);
  const startAt = context.currentTime + 0.05;
  [392, 523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((frequency, index) => {
    playTone(context, master, frequency, startAt + index * 0.07, 0.9, 'square', 0.12);
    playTone(context, master, frequency, startAt + index * 0.07, 1.1, 'triangle', 0.35);
  });
}

export function playJumpPadBoing(): void {
  const context = getAudioContext();
  if (!context) return;
  const master = createMaster(context, 0.22);
  const startAt = context.currentTime;
  const oscillator = context.createOscillator();
  const envelope = context.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.setValueAtTime(170, startAt);
  oscillator.frequency.exponentialRampToValueAtTime(620, startAt + 0.22);
  envelope.gain.setValueAtTime(0.0001, startAt);
  envelope.gain.exponentialRampToValueAtTime(0.7, startAt + 0.02);
  envelope.gain.exponentialRampToValueAtTime(0.0001, startAt + 0.32);
  oscillator.connect(envelope).connect(master);
  oscillator.start(startAt);
  oscillator.stop(startAt + 0.36);
}
