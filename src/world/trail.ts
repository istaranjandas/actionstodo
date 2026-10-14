// The lantern path: days are wayposts along a trail through the valley.
// Today stands by the camera, future days recede ahead (-Z), past days lie behind (+Z).
// Pure math, shared by the 3D scene and the interface; no three.js import.
export const PAST_DAY_LIMIT = 21;
export const FUTURE_DAY_LIMIT = 60;
export const LANTERNS_PER_POST = 12;

const NEAR_DAYS = 7;
const NEAR_SPACING = 15;
const FAR_SPACING = 6.5;

export function clampDayOffset(offset: number): number {
  return Math.max(-PAST_DAY_LIMIT, Math.min(FUTURE_DAY_LIMIT, offset));
}

// Distance along the trail; the first week is spaced generously, later days compress into the distance
export function trailDistance(offset: number): number {
  const steps = Math.abs(clampDayOffset(offset));
  const distance = steps <= NEAR_DAYS ? steps * NEAR_SPACING : NEAR_DAYS * NEAR_SPACING + (steps - NEAR_DAYS) * FAR_SPACING;
  return Math.sign(offset) * distance;
}

export function trailX(z: number): number {
  return 6 * Math.sin(z * 0.019) + 3 * Math.sin(z * 0.051 + 1.3);
}

export interface PostPlacement {
  x: number;
  z: number;
  // Which side of the trail the post stands on (+1 right, -1 left); lantern arms reach over the trail
  side: 1 | -1;
}

export function dayPostPlacement(offset: number): PostPlacement {
  const z = -trailDistance(offset);
  const side = (((offset % 2) + 2) % 2 === 0 ? 1 : -1) as 1 | -1;
  return { x: trailX(z) + side * 3.4, z, side };
}

// Lantern slots hang from two arms: the upper reaches over the trail, the lower sits just beneath it
export function lanternSlot(post: PostPlacement, index: number): [number, number, number] {
  const row = index < 6 ? 0 : 1;
  const column = index % 6;
  const reach = 0.55 + column * 0.38;
  return [post.x - post.side * reach, 3.45 - row * 0.95 - (column % 2) * 0.1, post.z];
}
