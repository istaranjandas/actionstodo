import type { Theme } from '../../types';

export const ISLAND_RADIUS = 20;
export const PLAYER_SPAWN: [number, number, number] = [0, 2.2, 7];
export const JUMP_PAD_POSITIONS: [number, number, number][] = [
  [-9, 0, -4],
  [10, 0, 3],
  [1, 0, -12]
];

export interface ArenaPalette {
  sky: string;
  fog: string;
  islandTop: string;
  islandRock: string;
  gridCell: string;
  gridSection: string;
  hemisphereSky: string;
  hemisphereGround: string;
  sunColor: string;
  pillar: string;
  pillarGlow: string;
  jumpPadGlow: string;
}

export const ARENA_PALETTES: Record<Theme, ArenaPalette> = {
  dark: {
    sky: '#0d0b1f',
    fog: '#15122e',
    islandTop: '#272a44',
    islandRock: '#181a2c',
    gridCell: '#383d68',
    gridSection: '#7a72ff',
    hemisphereSky: '#9aa4ff',
    hemisphereGround: '#3a2440',
    sunColor: '#ffe2c2',
    pillar: '#2f3352',
    pillarGlow: '#8b7bff',
    jumpPadGlow: '#36f1c8'
  },
  light: {
    sky: '#ffe7d1',
    fog: '#ffdcc0',
    islandTop: '#ece6f4',
    islandRock: '#b9aacb',
    gridCell: '#cfc4e4',
    gridSection: '#9d8bd8',
    hemisphereSky: '#fff4e4',
    hemisphereGround: '#c2acd8',
    sunColor: '#fff0dc',
    pillar: '#d9d0ea',
    pillarGlow: '#8f7bff',
    jumpPadGlow: '#13c9a0'
  }
};
