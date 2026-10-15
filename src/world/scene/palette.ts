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
  terrainValley: string;
  terrainRock: string;
  terrainPeak: string;
  snow: string;
  cloud: string;
  cloudLit: string;
  mist: string;
  water: string;
  waterGlintStrength: number;
  roadColor: string;
  roadColorBlend: number;
  signpostWood: string;
  motes: string;
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

// Dusk is golden hour over obsidian. Daylight is a clear late morning: soft blue overhead fading to a
// warm ivory haze, sandstone slopes lit from the side, so the white HUD sits in a bright world.
export const WORLD_PALETTES: Record<Theme, WorldPalette> = {
  dark: {
    skyTop: '#07090e',
    skyUpper: '#111622',
    skyEmber: '#3b1806',
    skyHorizon: '#d97706',
    skyGlow: '#f59e0b',
    skyGround: '#07090e',
    skyRimHorizonMinimum: 0.3,
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
    terrainValley: '#5b5850',
    terrainRock: '#86827c',
    terrainPeak: '#f2f2f0',
    snow: '#c9b9a6',
    cloud: '#10131b',
    cloudLit: '#9a4a0c',
    mist: '#120e10',
    water: '#07090e',
    waterGlintStrength: 1.8,
    roadColor: '#7a869f',
    roadColorBlend: 0,
    signpostWood: '#4d3d2d',
    motes: '#ffcf96',
    beacon: '#f59e0b',
    beamOpacity: 0.3,
    lampLightStrength: 1,
    lanternGlow: 1,
    marker: '#f59e0b',
    markerGlow: 1,
    poolStrength: 1,
    focusLightStrength: 1,
    shadowStrength: 0,
    starOpacity: 0.9
  },
  light: {
    skyTop: '#4a789c',
    skyUpper: '#7ca1bc',
    skyEmber: '#b9c4c6',
    skyHorizon: '#ede2d0',
    skyGlow: '#f6e6c8',
    skyGround: '#e0d8c9',
    skyRimHorizonMinimum: 0.85,
    sun: '#fff3dc',
    sunElevation: 15,
    sunAzimuth: 100,
    sunIntensity: 4.8,
    fog: '#dfd7c8',
    fogNear: 170,
    fogFar: 620,
    hemiSky: '#64829e',
    hemiGround: '#5c4938',
    hemiIntensity: 0.6,
    fill: '#c9d6e3',
    fillIntensity: 0.18,
    terrainTint: '#ffffff',
    terrainShade: '#1c222b',
    terrainValley: '#b09576',
    terrainRock: '#9a9389',
    terrainPeak: '#ddd3c3',
    snow: '#ead8c0',
    cloud: '#f4f3ee',
    cloudLit: '#fffbf2',
    mist: '#e2dacb',
    water: '#2c6b8e',
    waterGlintStrength: 2.4,
    roadColor: '#7a869f',
    roadColorBlend: 1,
    signpostWood: '#261e18',
    motes: '#e2a336',
    beacon: '#f59e0b',
    beamOpacity: 0.04,
    lampLightStrength: 0.2,
    lanternGlow: 0.55,
    marker: '#e06d06',
    markerGlow: 0.15,
    poolStrength: 0,
    focusLightStrength: 0,
    shadowStrength: 0.75,
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
