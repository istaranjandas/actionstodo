import confetti from 'canvas-confetti';

const CONFETTI_COLORS = ['#ffc23d', '#ff6bd5', '#22d8ff', '#8b7bff', '#ffffff'];

export function celebrateAtScreenPoint(origin: { x: number; y: number }): void {
  const clampedOrigin = { x: Math.min(Math.max(origin.x, 0.05), 0.95), y: Math.min(Math.max(origin.y, 0.05), 0.95) };
  void confetti({
    particleCount: 90,
    spread: 72,
    startVelocity: 38,
    ticks: 180,
    scalar: 0.95,
    origin: clampedOrigin,
    colors: CONFETTI_COLORS,
    zIndex: 1600,
    disableForReducedMotion: false
  });
  void confetti({
    particleCount: 40,
    spread: 120,
    startVelocity: 24,
    decay: 0.92,
    scalar: 0.7,
    shapes: ['star'],
    origin: clampedOrigin,
    colors: ['#ffc23d', '#fff1b8'],
    zIndex: 1600,
    disableForReducedMotion: false
  });
}

export function celebrateLevelUp(): void {
  void confetti({
    particleCount: 160,
    spread: 100,
    startVelocity: 45,
    origin: { x: 0.5, y: 0.35 },
    colors: CONFETTI_COLORS,
    zIndex: 1600,
    disableForReducedMotion: false
  });
}
