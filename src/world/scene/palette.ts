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
  skyRimHorizonMinimum: number;
  sun: string;
  sunElevation: number;
  sunAzimuth: number;
  sunIntensity: number;
  fog: string;
  // Exponential squared fog: aerial perspective that thickens with distance (no hard fog wall)
  fogDensity: number;
  hemiSky: string;
  hemiGround: string;
  hemiIntensity: number;
  fill: string;
  fillIntensity: number;
  // Terrain albedo tint, and the floor its unlit facets settle to (never pure black)
  terrainTint: string;
  terrainShade: string;
  terrainValley: string;
  terrainRock: string;
  terrainPeak: string;
  snow: string;
  // Foliage tints multiply the baked pine/boulder vertex colours
  foliage: string;
  boulder: string;
  // Self-lit floor for the flora, so night silhouettes keep a violet edge instead of going black
  foliageGlow: number;
  cloud: string;
  cloudLit: string;
  mist: string;
  water: string;
  waterGlintStrength: number;
  roadColor: string;
  roadColorBlend: number;
  roadLine: string;
  signpostWood: string;
  motes: string;
  moteIntensity: number;
  beacon: string;
  beamOpacity: number;
  lampLightStrength: number;
  lanternGlow: number;
  marker: string;
  markerGlow: number;
  poolStrength: number;
  focusLightStrength: number;
  shadowStrength: number;
  starOpacity: number;
}

// Dusk is twilight over indigo ridges. Daylight is golden hour in an alpine valley: sage meadows,
// terracotta peaks under a cerulean-to-peach sky, so the white HUD sits in a warm, breathing world.
export const WORLD_PALETTES: Record<Theme, WorldPalette> = {
  dark: {
    // Deep indigo zenith over a burning rim: shadows are blue-violet, never brown-black
    skyTop: '#10102e',
    skyUpper: '#1e1b4b',
    skyEmber: '#54205a',
    skyHorizon: '#f59e0b',
    skyGlow: '#fbbf24',
    skyGround: '#0b0a1e',
    skyRimHorizonMinimum: 0.34,
    sun: '#ffb057',
    sunElevation: 5,
    sunAzimuth: 14,
    sunIntensity: 2.5,
    fog: '#1a1840',
    fogDensity: 0.0038,
    hemiSky: '#524d9e',
    hemiGround: '#2a2560',
    hemiIntensity: 0.86,
    fill: '#241f52',
    fillIntensity: 0.2,
    terrainTint: '#b9b4d8',
    terrainShade: '#141233',
    terrainValley: '#2d2a63',
    terrainRock: '#312e81',
    terrainPeak: '#5b57a8',
    snow: '#b9b2e6',
    foliage: '#b6b0ec',
    boulder: '#3b3766',
    foliageGlow: 0.045,
    cloud: '#191636',
    cloudLit: '#a8501b',
    mist: '#1b1840',
    water: '#111c3e',
    waterGlintStrength: 1.5,
    roadColor: '#4b5768',
    roadColorBlend: 0.72,
    roadLine: '#f6d9a4',
    signpostWood: '#334155',
    motes: '#ffcf96',
    moteIntensity: 1.15,
    beacon: '#f59e0b',
    beamOpacity: 0.3,
    lampLightStrength: 1,
    lanternGlow: 1,
    marker: '#f59e0b',
    markerGlow: 1,
    poolStrength: 1,
    focusLightStrength: 1,
    shadowStrength: 0,
    starOpacity: 0.95
  },
  light: {
    // Cerulean zenith, peach band, gold at the rim — the Firewatch gradient
    skyTop: '#1b5e8c',
    skyUpper: '#4f8cb4',
    skyEmber: '#e8b489',
    skyHorizon: '#fde68a',
    skyGlow: '#ffd9a0',
    skyGround: '#dccfb8',
    skyRimHorizonMinimum: 0.86,
    sun: '#fff1d0',
    sunElevation: 9,
    sunAzimuth: 96,
    sunIntensity: 3.9,
    fog: '#cfdcd2',
    fogDensity: 0.0021,
    hemiSky: '#fff7ed',
    hemiGround: '#475569',
    hemiIntensity: 0.7,
    fill: '#cfe0e8',
    fillIntensity: 0.16,
    terrainTint: '#ffffff',
    terrainShade: '#2c443c',
    terrainValley: '#4f8a6e',
    terrainRock: '#3b6e5c',
    terrainPeak: '#b87042',
    snow: '#f7e3c8',
    foliage: '#ffffff',
    boulder: '#93a196',
    foliageGlow: 0,
    cloud: '#fdf7ee',
    cloudLit: '#f8dcb0',
    mist: '#e7ecdf',
    water: '#2f6f7f',
    waterGlintStrength: 2.6,
    roadColor: '#5a6878',
    roadColorBlend: 1,
    roadLine: '#f5e7c8',
    signpostWood: '#334155',
    motes: '#ffd9a0',
    moteIntensity: 0.85,
    beacon: '#f59e0b',
    beamOpacity: 0.04,
    lampLightStrength: 0.2,
    lanternGlow: 0.55,
    marker: '#e06d06',
    markerGlow: 0.15,
    poolStrength: 0,
    focusLightStrength: 0,
    shadowStrength: 0.8,
    starOpacity: 0
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
