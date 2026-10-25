import { fbm, ridgedFbm, smoothstep } from './noise';
import { trailX } from '../trail';

export const TERRAIN_WIDTH = 600;
export const TERRAIN_LENGTH = 780;
export const TERRAIN_SEGMENTS_X = 150;
export const TERRAIN_SEGMENTS_Z = 195;
export const TERRAIN_CENTER_Z = -130;
// The alpine lake the path curves past: wide enough to mirror the sky and the lighthouse
export const LAKE = { x: 25, z: -32, radius: 17, level: -0.4 };

// A long valley carved around the trail: a flat trail bed, meadows either side, ridges beyond,
// and mountains closing both ends so the path reads as a journey with a beginning and a horizon
export function terrainHeight(x: number, z: number): number {
  const corridor = Math.abs(x - trailX(z));
  const sideMask = smoothstep(16, 95, corridor);
  const endMask = smoothstep(380, 480, -z) + smoothstep(210, 260, z);
  const mountainMask = Math.min(1, sideMask + endMask);
  const ridges = ridgedFbm(x * 0.0105 + 3.1, z * 0.0105 - 1.7, 5);
  const hills = fbm(x * 0.045 + 7.3, z * 0.045 + 2.2, 3);
  let height = mountainMask * (ridges * 84 + 5) + hills * (1.6 + mountainMask * 7) - 1.2;

  const trailBed = 1 - smoothstep(2.4, 9, corridor);
  height = height * (1 - trailBed) + (-0.7 + hills * 0.35) * trailBed;

  // A shallow bowl under the water, with a soft shelf where the shore meets the meadow
  const lakeDistance = Math.hypot(x - LAKE.x, z - LAKE.z) / LAKE.radius;
  height -= (1 - smoothstep(0.22, 1.05, lakeDistance)) * 5.6;
  return height;
}
