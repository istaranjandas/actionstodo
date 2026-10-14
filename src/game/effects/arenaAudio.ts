// Arena cues share the console's audio engine, so they follow the same Settings toggles and volume
import { getEffectsOutput, playTone, unlockAudio } from '../../audio/soundEngine';

export function warmUpArenaAudio(): void {
  unlockAudio();
}

export function playVictoryChime(): void {
  const output = getEffectsOutput();
  if (!output) return;
  const startAt = output.context.currentTime + 0.02;
  [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => {
    const noteStart = startAt + index * 0.085;
    playTone(output, { frequency, startAt: noteStart, duration: 0.7, type: 'triangle', gain: 0.32, attack: 0.015 });
    playTone(output, { frequency: frequency * 2, startAt: noteStart, duration: 0.45, gain: 0.08, attack: 0.015 });
  });
  playTone(output, { frequency: 1567.98, startAt: startAt + 0.36, duration: 1.1, gain: 0.12, attack: 0.015 });
}

export function playLevelUpFanfare(): void {
  const output = getEffectsOutput();
  if (!output) return;
  const startAt = output.context.currentTime + 0.05;
  [392, 523.25, 659.25, 783.99, 1046.5, 1318.51].forEach((frequency, index) => {
    playTone(output, { frequency, startAt: startAt + index * 0.07, duration: 0.9, type: 'square', gain: 0.08, attack: 0.015 });
    playTone(output, { frequency, startAt: startAt + index * 0.07, duration: 1.1, type: 'triangle', gain: 0.24, attack: 0.015 });
  });
}

export function playJumpPadBoing(): void {
  const output = getEffectsOutput();
  if (!output) return;
  playTone(output, { frequency: 170, glideTo: 620, startAt: output.context.currentTime, duration: 0.32, gain: 0.4, attack: 0.02 });
}
