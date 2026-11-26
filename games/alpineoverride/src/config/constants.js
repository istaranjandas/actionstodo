export const GAME_STATES = Object.freeze({
  MENU: 'MENU',
  PLAYING: 'PLAYING',
  PAUSED: 'PAUSED',
  GAMEOVER: 'GAMEOVER',
});

export const GAME_MODES = Object.freeze({
  STANDARD: 'STANDARD',
  UNLIMITED: 'UNLIMITED',
});

export const UNLIMITED = Object.freeze({
  GHOST_DURATION: 1.8,
  GHOST_HOLD: 0.2,
  GHOST_FLICKER_RATE: 14,
  IMPACT_SPEED_RETAIN: 0.88,
  IMPACT_YAW: 0.32,
  IMPACT_YAW_RECOVERY: 3.2,
  IMPACT_SHOVE: 6,
  IMPACT_TRAUMA: 0.55,
  IMPACT_HAZARD_DURATION: 2.4,
});

export const PALETTE = Object.freeze({
  SKY: 0x1b2631,
  FOG: 0x1b2631,
  HEMI_SKY: 0x8fa8be,
  HEMI_GROUND: 0x11171d,
  MOONLIGHT: 0xdce8f2,

  ASPHALT: 0x16191e,
  SHOULDER: 0x20242a,
  CURB: 0x3a4148,
  LANE_WHITE: 0xe6eaee,
  CENTER_AMBER: 0xffb800,
  GUARDRAIL: 0x8a96a3,
  GUARDRAIL_POST: 0x48515a,

  GROUND: 0x1e2925,
  GROUND_DARK: 0x161f1c,
  SNOW: 0xd6e0ea,
  PINE_DARK: 0x173328,
  PINE_MID: 0x1f4335,
  PINE_LIGHT: 0x2a5643,
  TRUNK: 0x3a2a20,
  ROCK: 0x4a5561,
  ROCK_DARK: 0x333c46,
  MOUNTAIN: 0x2b3946,
  MOUNTAIN_FAR: 0x324252,
  MOUNTAIN_SNOW: 0xb9c7d4,

  PLAYER_BODY: 0xe8401f,
  PLAYER_ACCENT: 0x15181c,
  VEHICLE_PAINTS: Object.freeze([
    0x2e4a62, 0x8c1c24, 0xc9ced3, 0x1f2d26, 0xd9a441, 0x3b3f46, 0xe9edf0, 0x5a6e7f, 0x6b2e3a, 0x2a3f4f,
  ]),
  TRUCK_CABS: Object.freeze([0xb8bec4, 0x8c1c24, 0x2e4a62, 0xd9a441, 0xe9edf0]),
  TRUCK_TRAILERS: Object.freeze([0xd8dde2, 0x9aa4ad, 0x3b3f46, 0xc9ced3]),
  GLASS: 0x0c1117,
  TRIM: 0x111418,
  TIRE: 0x0e1012,
  RIM: 0x9aa4ad,
  CHROME: 0xc8d0d8,

  HEADLIGHT: 0xffbe55,
  TAILLIGHT: 0xff1e38,
  BRAKE_TRAIL: 0xff1e38,

  UI: Object.freeze({
    WHITE: '#f4f6f8',
    SLATE: '#7f8c9a',
    ORANGE: '#ff3b1d',
    AMBER: '#ffb800',
    HAIRLINE: 'rgba(255,255,255,0.15)',
    OVERLAY: 'rgba(17,23,29,0.55)',
    INK: '#0b0f13',
    SKY: '#1b2631',
  }),
});

export const LIGHTING = Object.freeze({
  TONE_MAPPING_EXPOSURE: 1.1,
  HEMI_INTENSITY: 1.15,
  MOON_INTENSITY: 1.35,
  ENVIRONMENT_INTENSITY: 0.35,
  HEADLIGHT_EMISSIVE: 2.5,
  TAILLIGHT_EMISSIVE: 3.0,
  BRAKE_EMISSIVE: 6.5,
});

export const ROAD = Object.freeze({
  WIDTH: 18,
  LANE_COUNT: 4,
  LANE_WIDTH: 4.0,
  SHOULDER_WIDTH: 1.0,
  SEGMENT_LENGTH: 4,
  VISIBLE_SEGMENTS: 90,
  SEGMENTS_BEHIND: 12,
  HALF_WIDTH: 9,
  LANES_HALF_WIDTH: 8,
  BARRIER_X: 9.4,
  TERRAIN_FLAT_HALF_WIDTH: 11,
  TERRAIN_HALF_WIDTH: 170,
  DASH_LENGTH: 3,
  DASH_PERIOD: 12,
  CENTER_LINE_GAP: 0.18,
  LINE_WIDTH: 0.14,
});

export const LANE_X = Object.freeze([-6.0, -2.0, 2.0, 6.0]);

export const LANE_DIRECTION = Object.freeze([1, 1, -1, -1]);

export const ONCOMING_LANES = Object.freeze([0, 1]);
export const SAME_DIRECTION_LANES = Object.freeze([2, 3]);

export const isOncomingLane = (lane) => lane === 0 || lane === 1;
export const isWrongWaySide = (localX) => localX < 0;

const CURVE_X_LAYERS = Object.freeze([
  { amplitude: 42, frequency: 0.0024, phase: 0.0 },
  { amplitude: 18, frequency: 0.0061, phase: 1.3 },
  { amplitude: 4, frequency: 0.0137, phase: 0.4 },
]);

const CURVE_Y_LAYERS = Object.freeze([
  { amplitude: 10, frequency: 0.0033, phase: 0.7 },
  { amplitude: 3, frequency: 0.0097, phase: 2.1 },
]);

export function getRoadCurve(z, target = { x: 0, y: 0, dx: 0, dy: 0 }) {
  let x = 0;
  let dx = 0;
  for (const { amplitude, frequency, phase } of CURVE_X_LAYERS) {
    const angle = z * frequency + phase;
    x += amplitude * Math.sin(angle);
    dx += amplitude * frequency * Math.cos(angle);
  }
  let y = 0;
  let dy = 0;
  for (const { amplitude, frequency, phase } of CURVE_Y_LAYERS) {
    const angle = z * frequency + phase;
    y += amplitude * Math.sin(angle);
    dy += amplitude * frequency * Math.cos(angle);
  }
  target.x = x;
  target.y = y;
  target.dx = dx;
  target.dy = dy;
  return target;
}

export const getRoadYaw = (dx) => Math.atan(dx);
export const getRoadPitch = (dy) => -Math.atan(dy);

const scratchCurve = { x: 0, y: 0, dx: 0, dy: 0 };

export function getRoadFrame(localX, z, target = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0 }) {
  const curve = getRoadCurve(z, scratchCurve);
  target.x = curve.x + localX;
  target.y = curve.y;
  target.z = z;
  target.yaw = getRoadYaw(curve.dx);
  target.pitch = getRoadPitch(curve.dy);
  return target;
}

export function getTerrainHeight(localX, z) {
  const outward = Math.abs(localX) - ROAD.TERRAIN_FLAT_HALF_WIDTH;
  if (outward <= 0) return -0.2;
  const side = localX < 0 ? -1 : 1;
  const ramp = smoothstep(0, 30, outward);
  const rise = outward * 0.32 * ramp;
  const undulation =
    3.2 * Math.sin(z * 0.013 + side * 1.7) * Math.sin(localX * 0.05 + z * 0.004) +
    1.4 * Math.sin(z * 0.031 + localX * 0.09);
  return -0.2 + rise + undulation * smoothstep(0, 20, outward);
}

export const PLAYER = Object.freeze({
  WIDTH: 1.9,
  HEIGHT: 1.2,
  LENGTH: 4.4,
  START_Z: 0,
  START_LOCAL_X: LANE_X[2],
  MIN_SPEED: 8,
  START_SPEED: 30,
  CRUISE_RATIO: 0.74,
  BASE_MAX_SPEED: 55,
  MAX_SPEED_CAP: 85,
  MAX_SPEED_GROWTH: 0.25,
  ACCELERATION: 11,
  BOOST_ACCELERATION: 18,
  BRAKE_DECELERATION: 34,
  STEER_SPEED: 14,
  STEER_RESPONSE: 9,
  LATERAL_LIMIT: 8.0,
  MAX_ROLL: 0.085,
  MAX_PITCH: 0.05,
  TRAIL_SPEED_RATIO: 0.8,
});

export const VEHICLE_CLASSES = Object.freeze({
  SPORTS: Object.freeze({
    id: 'SPORTS',
    width: 1.9,
    height: 1.15,
    length: 4.4,
    oncomingSpeed: Object.freeze([30, 38]),
    sameDirectionSpeed: Object.freeze([15, 17.5]),
    spawnWeight: 0.3,
    colors: Object.freeze([0x8c1c24, 0xd9a441, 0xe9edf0, 0x2e4a62, 0x6b2e3a]),
  }),
  SEDAN: Object.freeze({
    id: 'SEDAN',
    width: 1.85,
    height: 1.45,
    length: 4.8,
    oncomingSpeed: Object.freeze([24, 30]),
    sameDirectionSpeed: Object.freeze([13, 16]),
    spawnWeight: 0.48,
    colors: Object.freeze([0x2e4a62, 0xc9ced3, 0x1f2d26, 0x3b3f46, 0x5a6e7f, 0x2a3f4f, 0xe9edf0]),
  }),
  TRUCK: Object.freeze({
    id: 'TRUCK',
    width: 2.5,
    height: 3.8,
    length: 14.5,
    cabLength: 3.6,
    oncomingSpeed: Object.freeze([17, 22]),
    sameDirectionSpeed: Object.freeze([10, 13]),
    spawnWeight: 0.22,
    colors: PALETTE.TRUCK_CABS,
    trailerColors: PALETTE.TRUCK_TRAILERS,
  }),
});

export const VEHICLE_TYPES = Object.freeze(['SPORTS', 'SEDAN', 'TRUCK']);

export const TRAFFIC = Object.freeze({
  POOL_SIZE: Object.freeze({ SPORTS: 12, SEDAN: 16, TRUCK: 8 }),
  SPAWN_DISTANCE_AHEAD: 300,
  DESPAWN_DISTANCE_BEHIND: 45,
  MIN_SAME_LANE_GAP: 22,
  BASE_SPAWN_INTERVAL: 1.25,
  MIN_SPAWN_INTERVAL: 0.42,
  MAX_ACTIVE_BASE: 10,
  MAX_ACTIVE_PEAK: 26,
});

export const COLLISION = Object.freeze({
  HITBOX_FORGIVENESS: 0.88,
});

export const NEAR_MISS = Object.freeze({
  LATERAL_THRESHOLD: 1.35,
  LONGITUDINAL_THRESHOLD: 2.5,
  MIN_PLAYER_SPEED: 22,
  ULTRA_CLOSE_GAP: 0.45,
  COMBO_DECAY_TIME: 4.5,
  MAX_COMBO: 10,
  BASE_POINTS: 250,
});

export const SCORE = Object.freeze({
  POINTS_PER_METER: 1,
  REFERENCE_SPEED: 30,
  WRONG_WAY_MULTIPLIER: 2,
});

export const DIFFICULTY = Object.freeze({
  RAMP_DISTANCE: 9000,
});

export const CAMERA_MODES = Object.freeze({
  CHASE: 'CHASE',
  ISOMETRIC: 'ISOMETRIC',
  HOOD: 'HOOD',
});

export const CAMERA_MODE_ORDER = Object.freeze(['CHASE', 'ISOMETRIC', 'HOOD']);

export const CAMERA = Object.freeze({
  FOV_MIN: 60,
  FOV_MAX: 78,
  NEAR: 0.1,
  FAR: 1600,
  MAX_TRAUMA: 1,
  TRAUMA_DECAY: 1.6,
  CRASH_TRAUMA: 0.85,
  NEAR_MISS_TRAUMA: 0.12,
  ULTRA_NEAR_MISS_TRAUMA: 0.3,
});

export const QUALITY_TIERS = Object.freeze({
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
});

export const QUALITY_TIER_ORDER = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

export const QUALITY_CONFIG = Object.freeze({
  LOW: Object.freeze({
    id: 'LOW',
    label: 'POTATO',
    pixelRatio: 0.75,
    maxPixelRatio: 0.75,
    treeCount: 120,
    rockCount: 30,
    mountainCount: 14,
    drawDistance: 210,
    fogDensity: 0.0115,
    shadows: false,
    shadowMapSize: 0,
    dynamicLights: false,
    lightReflections: false,
    antialias: false,
    trailParticles: 24,
  }),
  MEDIUM: Object.freeze({
    id: 'MEDIUM',
    label: 'MEDIUM',
    pixelRatio: 1.0,
    maxPixelRatio: 1.0,
    treeCount: 320,
    rockCount: 80,
    mountainCount: 22,
    drawDistance: 300,
    fogDensity: 0.0085,
    shadows: false,
    shadowMapSize: 0,
    dynamicLights: true,
    lightReflections: true,
    antialias: true,
    trailParticles: 48,
  }),
  HIGH: Object.freeze({
    id: 'HIGH',
    label: 'HIGH',
    pixelRatio: null,
    maxPixelRatio: 2.0,
    treeCount: 640,
    rockCount: 160,
    mountainCount: 30,
    drawDistance: 380,
    fogDensity: 0.0068,
    shadows: true,
    shadowMapSize: 1024,
    dynamicLights: true,
    lightReflections: true,
    antialias: true,
    trailParticles: 72,
  }),
});

export const MAX_TREE_COUNT = QUALITY_CONFIG.HIGH.treeCount;
export const MAX_ROCK_COUNT = QUALITY_CONFIG.HIGH.rockCount;

export function resolvePixelRatio(tier) {
  const config = QUALITY_CONFIG[tier] ?? QUALITY_CONFIG.MEDIUM;
  const deviceRatio = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  return config.pixelRatio ?? Math.min(deviceRatio, config.maxPixelRatio);
}

export const PERFORMANCE = Object.freeze({
  FPS_THRESHOLD: 45,
  SAMPLE_FRAMES: 90,
  DOWNGRADE_COOLDOWN: 4,
});

export const STORAGE_KEYS = Object.freeze({
  HIGH_SCORE: 'alpine-overdrive:high-score',
  HIGH_SCORE_UNLIMITED: 'alpine-overdrive:high-score-unlimited',
  MODE: 'alpine-overdrive:mode',
  QUALITY: 'alpine-overdrive:quality',
  AUTO_QUALITY: 'alpine-overdrive:auto-quality',
  MUTED: 'alpine-overdrive:muted',
  CAMERA: 'alpine-overdrive:camera',
});

export const TIMING = Object.freeze({
  MAX_DELTA: 0.05,
  CRASH_SEQUENCE_DURATION: 1.6,
  MENU_FLYOVER_SPEED: 26,
});

export const clamp = (value, min, max) => (value < min ? min : value > max ? max : value);
export const lerp = (from, to, alpha) => from + (to - from) * alpha;
export const damp = (current, target, lambda, deltaTime) =>
  lerp(current, target, 1 - Math.exp(-lambda * deltaTime));
export const randomRange = (min, max, random = Math.random) => min + (max - min) * random();

export function smoothstep(edge0, edge1, value) {
  const t = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return t * t * (3 - 2 * t);
}

export function createSeededRandom(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const toCssColor = (hex) => `#${hex.toString(16).padStart(6, '0')}`;
