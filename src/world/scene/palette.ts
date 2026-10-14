import * as THREE from 'three';
import type { Theme } from '../../types';

// Dusk (dark theme) and daylight (light theme) share one valley; only the hour changes
export interface WorldPalette {
  // Sky bands, zenith down to the horizon: top → upper → ember → horizon, with glow toward the sun
  skyTop: string;
  skyUpper: string;
  skyEmber: string;
  skyHorizon: string;
  skyGlow: string;
  skyGround: string;
  sun: string;
  sunElevation: number;
  sunAzimuth: number;
  sunIntensity: number;
  fog: string;
  fogNear: number;
  fogFar: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fill: string;
  fillIntensity: number;
  // Terrain albedo tint, and the obsidian floor its unlit facets settle to (never pure black)
  terrainTint: string;
  terrainShade: string;
  snow: string;
  cloud: string;
  cloudLit: string;
  mist: string;
  water: string;
  motes: string;
  beacon: string;
  beamOpacity: number;
  lanternGlow: number;
  starOpacity: number;
}

// Both hours are golden hour over obsidian: no pale sky, no white haze. Daylight is the same light
// an hour earlier, the sun a little higher and the valley a little brighter.
export const WORLD_PALETTES: Record<Theme, WorldPalette> = {
  dark: {
    skyTop: '#07090e',
    skyUpper: '#111622',
    skyEmber: '#3b1806',
    skyHorizon: '#d97706',
    skyGlow: '#f59e0b',
    skyGround: '#07090e',
    sun: '#ffa53a',
    sunElevation: 3,
    sunAzimuth: 18,
    sunIntensity: 2.4,
    fog: '#0b0d13',
    fogNear: 70,
    fogFar: 470,
    hemiSky: '#1e293b',
    hemiGround: '#1a120b',
    hemiIntensity: 0.3,
    fill: '#1e293b',
    fillIntensity: 0.2,
    terrainTint: '#6b5a50',
    terrainShade: '#11131a',
    snow: '#c9b9a6',
    cloud: '#10131b',
    cloudLit: '#9a4a0c',
    mist: '#120e10',
    water: '#07090e',
    motes: '#ffcf96',
    beacon: '#f59e0b',
    beamOpacity: 0.3,
    lanternGlow: 1,
    starOpacity: 0.9
  },
  light: {
    skyTop: '#0d1220',
    skyUpper: '#1b2232',
    skyEmber: '#5a2a0c',
    skyHorizon: '#e08a1e',
    skyGlow: '#fbbf24',
    skyGround: '#0d1220',
    sun: '#ffc06a',
    sunElevation: 7,
    sunAzimuth: 22,
    sunIntensity: 2.8,
    fog: '#12141b',
    fogNear: 90,
    fogFar: 540,
    hemiSky: '#334155',
    hemiGround: '#2a1d10',
    hemiIntensity: 0.3,
    fill: '#334155',
    fillIntensity: 0.25,
    terrainTint: '#7d6a5e',
    terrainShade: '#161921',
    snow: '#d8cbb8',
    cloud: '#181c27',
    cloudLit: '#c2610f',
    mist: '#18130f',
    water: '#0a0e17',
    motes: '#ffd9a0',
    beacon: '#f59e0b',
    beamOpacity: 0.18,
    lanternGlow: 0.85,
    starOpacity: 0.35
  }
};

// Direction toward the sun from elevation/azimuth in degrees (azimuth 0 = straight down the valley, -Z)
export function sunDirection(palette: WorldPalette, target = new THREE.Vector3()): THREE.Vector3 {
  const elevation = THREE.MathUtils.degToRad(palette.sunElevation);
  const azimuth = THREE.MathUtils.degToRad(palette.sunAzimuth);
  return target.set(Math.sin(azimuth) * Math.cos(elevation), Math.sin(elevation), -Math.cos(azimuth) * Math.cos(elevation)).normalize();
}

// Frame-rate independent easing toward a target colour
export function easeColor(color: THREE.Color, target: THREE.Color, delta: number, speed = 2.2): void {
  color.lerp(target, 1 - Math.exp(-speed * delta));
}

export function easeNumber(current: number, target: number, delta: number, speed = 2.2): number {
  return current + (target - current) * (1 - Math.exp(-speed * delta));
}
