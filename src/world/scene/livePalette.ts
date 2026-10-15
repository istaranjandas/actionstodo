import { createContext, useContext } from 'react';
import * as THREE from 'three';
import { easeColor, easeNumber, sunDirection } from './palette';
import type { WorldPalette } from './palette';

const COLOR_KEYS = ['skyTop', 'skyUpper', 'skyEmber', 'skyHorizon', 'skyGlow', 'skyGround', 'sun', 'fog', 'hemiSky', 'hemiGround', 'terrainTint', 'terrainShade', 'terrainValley', 'terrainRock', 'terrainPeak', 'snow', 'cloud', 'cloudLit', 'mist', 'water', 'motes', 'beacon', 'marker', 'fill', 'roadColor', 'signpostWood'] as const;
const NUMBER_KEYS = ['sunElevation', 'sunAzimuth', 'sunIntensity', 'fogNear', 'fogFar', 'hemiIntensity', 'fillIntensity', 'beamOpacity', 'lampLightStrength', 'lanternGlow', 'markerGlow', 'poolStrength', 'focusLightStrength', 'shadowStrength', 'starOpacity', 'skyRimHorizonMinimum', 'waterGlintStrength', 'roadColorBlend'] as const;

type ColorKey = (typeof COLOR_KEYS)[number];
type NumberKey = (typeof NUMBER_KEYS)[number];

// One mutable palette eased every frame; scene parts read it instead of re-rendering on theme change
export interface LivePalette {
  colors: Record<ColorKey, THREE.Color>;
  numbers: Record<NumberKey, number>;
  sunDirection: THREE.Vector3;
}

const targetColor = new THREE.Color();

export function createLivePalette(palette: WorldPalette): LivePalette {
  const colors = Object.fromEntries(COLOR_KEYS.map((key) => [key, new THREE.Color(palette[key])])) as Record<ColorKey, THREE.Color>;
  const numbers = Object.fromEntries(NUMBER_KEYS.map((key) => [key, palette[key]])) as Record<NumberKey, number>;
  return { colors, numbers, sunDirection: sunDirection(palette) };
}

export function stepLivePalette(live: LivePalette, target: WorldPalette, delta: number, instant: boolean): void {
  COLOR_KEYS.forEach((key) => {
    targetColor.set(target[key]);
    if (instant) live.colors[key].copy(targetColor);
    else easeColor(live.colors[key], targetColor, delta, 1.8);
  });
  NUMBER_KEYS.forEach((key) => {
    live.numbers[key] = instant ? target[key] : easeNumber(live.numbers[key], target[key], delta, 1.8);
  });
  const elevation = THREE.MathUtils.degToRad(live.numbers.sunElevation);
  const azimuth = THREE.MathUtils.degToRad(live.numbers.sunAzimuth);
  live.sunDirection.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)).normalize();
}

export const LivePaletteContext = createContext<LivePalette | null>(null);

export function useLivePalette(): LivePalette {
  const live = useContext(LivePaletteContext);
  if (!live) throw new Error('useLivePalette must be used inside the world canvas');
  return live;
}
