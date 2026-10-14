// Deterministic value noise for terrain generation (same valley on every visit)
function hash(x: number, y: number): number {
  const h = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return h - Math.floor(h);
}

function smooth(t: number): number {
  return t * t * (3 - 2 * t);
}

export function valueNoise(x: number, y: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = smooth(x - xi);
  const yf = smooth(y - yi);
  const top = hash(xi, yi) + (hash(xi + 1, yi) - hash(xi, yi)) * xf;
  const bottom = hash(xi, yi + 1) + (hash(xi + 1, yi + 1) - hash(xi, yi + 1)) * xf;
  return top + (bottom - top) * yf;
}

export function fbm(x: number, y: number, octaves: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += valueNoise(x * frequency, y * frequency) * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.03;
  }
  return sum / norm;
}

// Ridged multifractal: sharp crests where the noise crosses its midpoint
export function ridgedFbm(x: number, y: number, octaves: number): number {
  let sum = 0;
  let amplitude = 0.5;
  let frequency = 1;
  let weight = 1;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    let ridge = 1 - Math.abs(valueNoise(x * frequency, y * frequency) * 2 - 1);
    ridge *= ridge * weight;
    weight = Math.min(1, ridge * 1.6);
    sum += ridge * amplitude;
    norm += amplitude;
    amplitude *= 0.5;
    frequency *= 2.1;
  }
  return sum / norm;
}

export function smoothstep(edge0: number, edge1: number, value: number): number {
  const t = Math.min(1, Math.max(0, (value - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}
