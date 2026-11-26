import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PALETTE,
  LIGHTING,
  PLAYER,
  UNLIMITED,
  clamp,
  damp,
  lerp,
  smoothstep,
  getRoadCurve,
  getRoadYaw,
  getRoadPitch,
  isWrongWaySide,
} from '../config/constants.js';

const TWO_PI = Math.PI * 2;
const MAX_STEP = 0.1;

const WHEEL_RADIUS = 0.34;
const WHEEL_WIDTH = 0.26;
const WHEEL_TRACK = 0.79;
const FRONT_AXLE_Z = -1.38;
const REAR_AXLE_Z = 1.32;
const WHEEL_SEGMENTS = 16;
const SIDEWALL_WIDTH = 0.022;
const SIDEWALL_INSET = 0.045;
const MAX_WHEEL_STEER = 0.36;
const WHEEL_STEER_RESPONSE = 12;
const WHEEL_STEER_SPEED_FALLOFF = 0.45;

const ARCH_OUTER_RADIUS = 0.45;
const ARCH_INNER_RADIUS = 0.385;
const ARCH_OVERHANG = 0.14;
const ARCH_INNER_X = 0.83;
const ARCH_DEPTH = 0.125;

const CHASSIS_PIVOT_Y = 0.42;
const HEADING_YAW_FACTOR = 0.8;
const HEADING_MIN_SPEED = 10;
const STEER_SPEED_FLOOR = 0.9;
const STEER_SPEED_GAIN = 0.25;
const COAST_DECELERATION_RATIO = 0.6;
const SCRAPE_SPEED_BLEED = 7;
const SCRAPE_PUSH_THRESHOLD = 0.05;
const SCRAPE_VELOCITY_THRESHOLD = 0.01;
const ROLL_REFERENCE_VELOCITY = PLAYER.STEER_SPEED * 1.15;
const PITCH_ACCEL_REFERENCE = 26;
const ACCEL_SMOOTHING = 9;
const ROLL_STIFFNESS = 110;
const ROLL_DAMPING = 10.5;
const PITCH_STIFFNESS = 85;
const PITCH_DAMPING = 10;
const SPRING_STEP = 1 / 120;
const MAX_CHASSIS_ROLL = 0.32;
const MAX_CHASSIS_PITCH = 0.2;
const VIBRATION_HEIGHT = 0.0035;
const VIBRATION_ROLL = 0.0014;
const VIBRATION_PITCH = 0.0009;
const SCRAPE_VIBRATION_HEIGHT = 0.011;
const SCRAPE_VIBRATION_ROLL = 0.006;

const BRAKE_GLOW_RESPONSE = 14;
const CRASH_STOP_TIME = 1.1;
const CRASH_MIN_DECELERATION = 1;
const CRASH_SPIN_MIN = 0.9;
const CRASH_SPIN_MAX = 1.6;
const CRASH_SPIN_RESPONSE = 2.9;
const CRASH_ROLL_IMPULSE = 1.7;
const CRASH_PITCH_IMPULSE = 1.1;
const CRASH_SLIDE_SPEED = 4.5;
const CRASH_SLIDE_DECAY = 2.2;
const CRASH_STEER_RETURN = 6;
const CRASH_FLICKER_TIME = 0.75;
const CRASH_FLICKER_RATE = 24;
const CRASH_FLICKER_THRESHOLD = 0.42;

const HEADLIGHT_X = 0.5;
const HEADLIGHT_Y = 0.5;
const HEADLIGHT_Z = -2.12;
const TAIL_LIGHT_Y = 0.775;
const TAIL_LIGHT_Z = 2.24;

const SPOT_LIGHT = Object.freeze({
  INTENSITY: 120,
  DISTANCE: 75,
  ANGLE: 0.42,
  PENUMBRA: 0.55,
  DECAY: 1.4,
  REACH: 25,
  DROP: 1.6,
  SPREAD: 1.6,
});

const REAR_LIGHT = Object.freeze({
  INTENSITY: 1.6,
  BRAKE_INTENSITY: 7.5,
  DISTANCE: 7,
  DECAY: 1.5,
  Y: 0.62,
  Z: 2.75,
});

const REFLECTION_HEIGHT = 0.03;
const HEAD_GLOW = Object.freeze({ WIDTH: 0.62, LENGTH: 7.5, START_Z: -2.3, OPACITY: 0.24 });
const TAIL_GLOW = Object.freeze({ WIDTH: 0.5, LENGTH: 2.9, START_Z: 2.25, X: 0.62, OPACITY: 0.16, BRAKE_OPACITY: 0.52 });
const GLOW_NORMALIZER = 1.55;
const CONTACT_SHADOW = Object.freeze({ WIDTH: 2.5, LENGTH: 5.3, HEIGHT: 0.02, OPACITY: 0.62 });

const TRAIL_POINTS = 36;
const TRAIL_STRIDE = 6;
const TRAIL_VERTICES_PER_POINT = 4;
const TRAIL_COUNT = 2;
const TRAIL_SPACING = 0.38;
const TRAIL_HALF_SPAN = 0.68;
const TRAIL_WIDTH = 0.1;
const TRAIL_THICKNESS = 0.055;
const TRAIL_TAPER = 0.65;
const TRAIL_FADE_POWER = 1.5;
const TRAIL_CRUISE_LEVEL = 0.6;
const TRAIL_GAIN = 1.25;
const TRAIL_FADE_IN = 7;
const TRAIL_FADE_OUT = 2.6;
const TRAIL_CRASH_FADE = 5;
const TRAIL_VISIBILITY_EPSILON = 0.004;

const UP_AXIS = new THREE.Vector3(0, 1, 0);
const buildMatrix = new THREE.Matrix4();
const buildEuler = new THREE.Euler();
const buildQuaternion = new THREE.Quaternion();
const buildScale = new THREE.Vector3(1, 1, 1);
const buildPosition = new THREE.Vector3();
const buildDirection = new THREE.Vector3();

function transformGeometry(geometry, x, y, z, rotationX = 0, rotationY = 0, rotationZ = 0) {
  buildEuler.set(rotationX, rotationY, rotationZ, 'XYZ');
  buildQuaternion.setFromEuler(buildEuler);
  buildPosition.set(x, y, z);
  buildMatrix.compose(buildPosition, buildQuaternion, buildScale);
  return geometry.applyMatrix4(buildMatrix);
}

function createBox(width, height, depth, x, y, z, rotationX = 0, rotationY = 0, rotationZ = 0) {
  return transformGeometry(new THREE.BoxGeometry(width, height, depth), x, y, z, rotationX, rotationY, rotationZ);
}

function createMirroredBoxes(width, height, depth, x, y, z, rotationX = 0, rotationY = 0, rotationZ = 0) {
  return [
    createBox(width, height, depth, -x, y, z, rotationX, -rotationY, -rotationZ),
    createBox(width, height, depth, x, y, z, rotationX, rotationY, rotationZ),
  ];
}

function createBeam(start, end, thickness) {
  buildPosition.set(start[0] + end[0], start[1] + end[1], start[2] + end[2]).multiplyScalar(0.5);
  buildDirection.set(end[0] - start[0], end[1] - start[1], end[2] - start[2]);
  const length = buildDirection.length();
  buildQuaternion.setFromUnitVectors(UP_AXIS, buildDirection.normalize());
  buildMatrix.compose(buildPosition, buildQuaternion, buildScale);
  return new THREE.BoxGeometry(thickness, length, thickness).applyMatrix4(buildMatrix);
}

function createMirroredBeams(start, end, thickness) {
  return [
    createBeam([-start[0], start[1], start[2]], [-end[0], end[1], end[2]], thickness),
    createBeam(start, end, thickness),
  ];
}

function toPositionOnly(geometry) {
  const source = geometry.index ? geometry.toNonIndexed() : geometry;
  if (source !== geometry) geometry.dispose();
  for (const name of Object.keys(source.attributes)) {
    if (name !== 'position') source.deleteAttribute(name);
  }
  source.morphAttributes = {};
  return source;
}

function mergeParts(parts) {
  const prepared = parts.map(toPositionOnly);
  const merged = mergeGeometries(prepared, false);
  for (const geometry of prepared) geometry.dispose();
  merged.computeVertexNormals();
  merged.computeBoundingSphere();
  return merged;
}

function createLoftGeometry(sections) {
  const ringSize = sections[0].points.length;
  const positions = [];
  const centers = sections.map(({ z, points }) => {
    const center = new THREE.Vector3(0, 0, z);
    for (const [x, y] of points) {
      center.x += x / ringSize;
      center.y += y / ringSize;
    }
    return center;
  });
  const loftCenter = new THREE.Vector3();
  for (const center of centers) loftCenter.addScaledVector(center, 1 / centers.length);

  const edgeA = new THREE.Vector3();
  const edgeB = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const reference = new THREE.Vector3();
  const corners = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3()];

  const pushTriangle = (a, b, c, origin) => {
    edgeA.subVectors(b, a);
    edgeB.subVectors(c, a);
    normal.crossVectors(edgeA, edgeB);
    if (normal.lengthSq() < 1e-12) return;
    outward.copy(a).add(b).add(c).multiplyScalar(1 / 3).sub(origin);
    const facesOut = normal.dot(outward) >= 0;
    const second = facesOut ? b : c;
    const third = facesOut ? c : b;
    positions.push(a.x, a.y, a.z, second.x, second.y, second.z, third.x, third.y, third.z);
  };

  const setCorner = (target, section, index) => {
    const [x, y] = section.points[index % ringSize];
    return target.set(x, y, section.z);
  };

  for (let s = 0; s < sections.length - 1; s += 1) {
    reference.addVectors(centers[s], centers[s + 1]).multiplyScalar(0.5);
    for (let p = 0; p < ringSize; p += 1) {
      setCorner(corners[0], sections[s], p);
      setCorner(corners[1], sections[s], p + 1);
      setCorner(corners[2], sections[s + 1], p + 1);
      setCorner(corners[3], sections[s + 1], p);
      pushTriangle(corners[0], corners[1], corners[2], reference);
      pushTriangle(corners[0], corners[2], corners[3], reference);
    }
  }

  for (const capIndex of [0, sections.length - 1]) {
    const section = sections[capIndex];
    for (let p = 0; p < ringSize; p += 1) {
      setCorner(corners[0], section, p);
      setCorner(corners[1], section, p + 1);
      pushTriangle(centers[capIndex], corners[0], corners[1], loftCenter);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function createArchGeometry(side, axleZ) {
  const start = -ARCH_OVERHANG;
  const end = Math.PI + ARCH_OVERHANG;
  const shape = new THREE.Shape();
  shape.absarc(0, 0, ARCH_OUTER_RADIUS, start, end, false);
  shape.lineTo(Math.cos(end) * ARCH_INNER_RADIUS, Math.sin(end) * ARCH_INNER_RADIUS);
  shape.absarc(0, 0, ARCH_INNER_RADIUS, end, start, true);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, { depth: ARCH_DEPTH, bevelEnabled: false, curveSegments: 4 });
  geometry.rotateY(Math.PI / 2);
  geometry.translate(side > 0 ? ARCH_INNER_X : -ARCH_INNER_X - ARCH_DEPTH, WHEEL_RADIUS, axleZ);
  return geometry;
}

function bodySection(z, bottomY, bottomHalf, sillY, sideHalf, beltY, deckHalf, deckY) {
  return {
    z,
    points: [
      [-bottomHalf, bottomY],
      [bottomHalf, bottomY],
      [sideHalf, sillY],
      [sideHalf, beltY],
      [deckHalf, deckY],
      [-deckHalf, deckY],
      [-sideHalf, beltY],
      [-sideHalf, sillY],
    ],
  };
}

function cabinSection(z, baseY, baseHalf, topY, topHalf) {
  return {
    z,
    points: [
      [-baseHalf, baseY],
      [baseHalf, baseY],
      [topHalf, topY],
      [-topHalf, topY],
    ],
  };
}

const BODY_SECTIONS = Object.freeze([
  bodySection(-2.2, 0.22, 0.58, 0.26, 0.7, 0.36, 0.56, 0.42),
  bodySection(-2.02, 0.18, 0.7, 0.24, 0.8, 0.5, 0.68, 0.56),
  bodySection(-1.45, 0.17, 0.74, 0.24, 0.85, 0.6, 0.72, 0.67),
  bodySection(-0.6, 0.17, 0.74, 0.24, 0.86, 0.68, 0.74, 0.77),
  bodySection(0.5, 0.17, 0.74, 0.24, 0.87, 0.7, 0.75, 0.8),
  bodySection(1.35, 0.17, 0.74, 0.25, 0.88, 0.72, 0.74, 0.83),
  bodySection(1.95, 0.2, 0.7, 0.28, 0.85, 0.74, 0.7, 0.87),
  bodySection(2.2, 0.26, 0.64, 0.32, 0.8, 0.72, 0.66, 0.85),
]);

const CABIN_SECTIONS = Object.freeze([
  cabinSection(-0.62, 0.75, 0.72, 0.79, 0.68),
  cabinSection(0.12, 0.77, 0.73, 1.17, 0.57),
  cabinSection(0.62, 0.78, 0.73, 1.17, 0.57),
  cabinSection(1.42, 0.81, 0.7, 0.855, 0.66),
]);

const ROOF_SECTIONS = Object.freeze([
  cabinSection(0.08, 1.16, 0.585, PLAYER.HEIGHT, 0.54),
  cabinSection(0.66, 1.16, 0.585, PLAYER.HEIGHT, 0.54),
]);

const HEADLIGHT_SLOPE = -Math.atan2(0.14, 0.18);
const HOOD_SLOPE = -Math.atan2(0.1, 0.85);

function buildBodyGeometry() {
  const parts = [createLoftGeometry(BODY_SECTIONS), createLoftGeometry(ROOF_SECTIONS)];
  for (const axleZ of [FRONT_AXLE_Z, REAR_AXLE_Z]) {
    parts.push(createArchGeometry(-1, axleZ), createArchGeometry(1, axleZ));
  }
  parts.push(
    ...createMirroredBeams([0.68, 0.79, -0.62], [0.57, 1.17, 0.12], 0.05),
    ...createMirroredBeams([0.73, 0.78, 0.42], [0.57, 1.17, 0.42], 0.045),
    ...createMirroredBeams([0.57, 1.17, 0.62], [0.66, 0.855, 1.42], 0.05),
    ...createMirroredBoxes(0.12, 0.085, 0.11, 0.895, 0.89, -0.44),
  );
  return mergeParts(parts);
}

function buildAccentGeometry() {
  const parts = [
    createBox(1.72, 0.035, 0.24, 0, 0.165, -2.09),
    createBox(1.04, 0.1, 0.05, 0, 0.29, -2.215),
    createBox(1.34, 0.1, 0.24, 0, 0.2, 2.08),
    createBox(1.76, 0.035, 0.36, 0, 1.085, 2.02, -0.06),
    ...createMirroredBoxes(0.16, 0.02, 0.14, 0.66, 0.33, -2.18, 0, 0, 0.22),
    ...createMirroredBoxes(0.07, 0.11, 1.8, 0.875, 0.225, -0.03),
    ...createMirroredBoxes(0.02, 0.1, 0.32, 0.866, 0.47, -0.78),
    ...createMirroredBoxes(0.05, 0.22, 0.14, 0.48, 0.97, 1.98),
    ...createMirroredBoxes(0.03, 0.14, 0.4, 0.88, 1.075, 2.02),
    ...createMirroredBoxes(0.24, 0.02, 0.34, 0.3, 0.715, -1.12, HOOD_SLOPE),
    ...createMirroredBoxes(0.1, 0.03, 0.05, 0.79, 0.86, -0.42),
  ];
  for (const x of [-0.5, -0.25, 0, 0.25, 0.5]) parts.push(createBox(0.025, 0.13, 0.22, x, 0.19, 2.1));
  return mergeParts(parts);
}

function buildGlassGeometry() {
  const parts = [createLoftGeometry(CABIN_SECTIONS)];
  for (const x of [-0.36, 0.36]) {
    parts.push(transformGeometry(new THREE.CylinderGeometry(0.052, 0.06, 0.14, 8), x, 0.27, 2.14, Math.PI / 2));
  }
  return mergeParts(parts);
}

function buildHeadlightGeometry() {
  return mergeParts([
    ...createMirroredBoxes(0.3, 0.045, 0.19, 0.46, 0.495, -2.11, HEADLIGHT_SLOPE),
    ...createMirroredBoxes(0.07, 0.03, 0.17, 0.27, 0.48, -2.12, HEADLIGHT_SLOPE),
    ...createMirroredBoxes(0.18, 0.035, 0.04, 0.6, 0.31, -2.205),
  ]);
}

function buildTaillightGeometry() {
  return mergeParts([
    createBox(1.44, 0.055, 0.04, 0, TAIL_LIGHT_Y, 2.215),
    createBox(0.5, 0.018, 0.02, 0, 1.118, 2.19),
    ...createMirroredBoxes(0.2, 0.1, 0.045, 0.64, TAIL_LIGHT_Y - 0.01, 2.218),
  ]);
}

function buildTyreGeometry() {
  const treadWidth = WHEEL_WIDTH - SIDEWALL_WIDTH * 2;
  const wallOffset = (WHEEL_WIDTH - SIDEWALL_WIDTH) * 0.5;
  const innerRadius = WHEEL_RADIUS - SIDEWALL_INSET;
  const tread = new THREE.CylinderGeometry(WHEEL_RADIUS, WHEEL_RADIUS, treadWidth, WHEEL_SEGMENTS, 1, true);
  const outerWall = new THREE.CylinderGeometry(innerRadius, WHEEL_RADIUS, SIDEWALL_WIDTH, WHEEL_SEGMENTS);
  const innerWall = new THREE.CylinderGeometry(WHEEL_RADIUS, innerRadius, SIDEWALL_WIDTH, WHEEL_SEGMENTS);
  return mergeParts([
    transformGeometry(tread, 0, 0, 0, 0, 0, -Math.PI / 2),
    transformGeometry(outerWall, wallOffset, 0, 0, 0, 0, -Math.PI / 2),
    transformGeometry(innerWall, -wallOffset, 0, 0, 0, 0, -Math.PI / 2),
  ]);
}

function buildRimGeometry() {
  const faceX = WHEEL_WIDTH * 0.5;
  const parts = [
    transformGeometry(new THREE.TorusGeometry(0.215, 0.024, 4, WHEEL_SEGMENTS), faceX + 0.004, 0, 0, 0, Math.PI / 2),
    transformGeometry(new THREE.CylinderGeometry(0.055, 0.075, 0.06, 8), faceX + 0.01, 0, 0, 0, 0, -Math.PI / 2),
  ];
  const spokeCount = 5;
  for (let index = 0; index < spokeCount; index += 1) {
    const baseAngle = (index / spokeCount) * TWO_PI;
    for (const offset of [-0.13, 0.13]) {
      const spoke = new THREE.BoxGeometry(0.026, 0.17, 0.034);
      spoke.translate(0, 0.125, 0);
      spoke.rotateX(baseAngle + offset);
      spoke.translate(faceX + 0.006, 0, 0);
      parts.push(spoke);
    }
  }
  return mergeParts(parts);
}

function createGlowStrip(width, length, centerX, centerZ, color, nearSign) {
  const geometry = new THREE.PlaneGeometry(width, length, 4, 10);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 3);
  const halfWidth = width * 0.5;
  for (let index = 0; index < position.count; index += 1) {
    const across = position.getX(index) / halfWidth;
    const nearness = clamp(0.5 + (nearSign * position.getZ(index)) / length, 0, 1);
    const lateral = (1 - across * across) ** 2;
    const longitudinal = nearness ** 1.5 * (1 - nearness ** 10) * GLOW_NORMALIZER;
    const strength = clamp(lateral * longitudinal, 0, 1);
    colors[index * 3] = color.r * strength;
    colors[index * 3 + 1] = color.g * strength;
    colors[index * 3 + 2] = color.b * strength;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.translate(centerX, REFLECTION_HEIGHT, centerZ);
  return geometry;
}

function createMirroredGlowStrips(width, length, x, centerZ, colorHex, nearSign) {
  const color = new THREE.Color(colorHex);
  const strips = [
    createGlowStrip(width, length, -x, centerZ, color, nearSign),
    createGlowStrip(width, length, x, centerZ, color, nearSign),
  ];
  const merged = mergeGeometries(strips, false);
  for (const strip of strips) strip.dispose();
  merged.computeBoundingSphere();
  return merged;
}

function createContactShadowGeometry() {
  const geometry = new THREE.PlaneGeometry(CONTACT_SHADOW.WIDTH, CONTACT_SHADOW.LENGTH, 6, 12);
  geometry.rotateX(-Math.PI / 2);
  const position = geometry.attributes.position;
  const colors = new Float32Array(position.count * 4);
  for (let index = 0; index < position.count; index += 1) {
    const u = position.getX(index) / (CONTACT_SHADOW.WIDTH * 0.5);
    const v = position.getZ(index) / (CONTACT_SHADOW.LENGTH * 0.5);
    const distance = (u ** 4 + v ** 4) ** 0.25;
    colors[index * 4 + 3] = (1 - smoothstep(0.42, 1, distance)) * CONTACT_SHADOW.OPACITY;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 4));
  geometry.translate(0, CONTACT_SHADOW.HEIGHT, 0);
  return geometry;
}

function createTrailGeometry() {
  const vertexCount = TRAIL_COUNT * TRAIL_POINTS * TRAIL_VERTICES_PER_POINT;
  const positionAttribute = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
  const colorAttribute = new THREE.BufferAttribute(new Float32Array(vertexCount * 3), 3);
  positionAttribute.setUsage(THREE.DynamicDrawUsage);
  colorAttribute.setUsage(THREE.DynamicDrawUsage);
  const indices = [];
  for (let trail = 0; trail < TRAIL_COUNT; trail += 1) {
    const base = trail * TRAIL_POINTS * TRAIL_VERTICES_PER_POINT;
    for (let point = 0; point < TRAIL_POINTS - 1; point += 1) {
      const current = base + point * TRAIL_VERTICES_PER_POINT;
      const next = current + TRAIL_VERTICES_PER_POINT;
      indices.push(current, current + 1, next + 1, current, next + 1, next);
      indices.push(current + 2, current + 3, next + 3, current + 2, next + 3, next + 2);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setIndex(indices);
  geometry.setAttribute('position', positionAttribute);
  geometry.setAttribute('color', colorAttribute);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), TRAIL_POINTS * TRAIL_SPACING + TRAIL_HALF_SPAN + 1);
  return geometry;
}

function createGlowMaterial(opacity, side = THREE.FrontSide) {
  return new THREE.MeshBasicMaterial({
    color: 0xffffff,
    vertexColors: true,
    transparent: true,
    opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    fog: false,
    side,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
}

function createMaterials() {
  const standard = (color, roughness, metalness, extra = {}) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, flatShading: true, ...extra });
  return {
    body: standard(PALETTE.PLAYER_BODY, 0.35, 0.45),
    accent: standard(PALETTE.PLAYER_ACCENT, 0.55, 0.35),
    glass: standard(PALETTE.GLASS, 0.06, 0.85),
    headlight: standard(PALETTE.HEADLIGHT, 0.3, 0.1, {
      emissive: PALETTE.HEADLIGHT,
      emissiveIntensity: LIGHTING.HEADLIGHT_EMISSIVE,
    }),
    taillight: standard(PALETTE.TAILLIGHT, 0.35, 0.1, {
      emissive: PALETTE.TAILLIGHT,
      emissiveIntensity: LIGHTING.TAILLIGHT_EMISSIVE,
    }),
    tire: standard(PALETTE.TIRE, 0.92, 0),
    rim: standard(PALETTE.RIM, 0.28, 0.85),
    headGlow: createGlowMaterial(HEAD_GLOW.OPACITY),
    tailGlow: createGlowMaterial(TAIL_GLOW.OPACITY),
    trail: createGlowMaterial(1, THREE.DoubleSide),
    contactShadow: new THREE.MeshBasicMaterial({
      color: 0xffffff,
      vertexColors: true,
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1,
    }),
  };
}

function crashFlickerNoise(step) {
  const value = Math.sin(step * 78.233 + 1.7) * 43758.5453;
  return value - Math.floor(value);
}

export class PlayerCar {
  constructor(scene) {
    this.scene = scene ?? null;
    this.materials = createMaterials();
    this.geometries = [];
    this.visualObjects = [];

    this.group = new THREE.Group();
    this.group.name = 'PlayerCar';
    this.group.rotation.order = 'YXZ';
    this.chassis = new THREE.Group();
    this.chassis.position.y = CHASSIS_PIVOT_Y;
    this.bodyRoot = new THREE.Group();
    this.bodyRoot.position.y = -CHASSIS_PIVOT_Y;
    this.chassis.add(this.bodyRoot);
    this.group.add(this.chassis);

    this.buildBody();
    this.buildWheels();
    this.buildGroundEffects();
    this.buildLights();
    this.buildTrails();

    this.curve = { x: 0, y: 0, dx: 0, dy: 0 };
    this.curveFn = getRoadCurve;
    this.trailAnchor = new THREE.Vector3(0, TAIL_LIGHT_Y, TAIL_LIGHT_Z);
    this.trailCenter = new THREE.Vector3();
    this.trailRight = new THREE.Vector3(1, 0, 0);

    this.isVisible = true;
    this.dynamicLightsEnabled = true;
    this.reflectionsEnabled = true;
    this.lightLevel = 1;

    this.bounds = {
      worldX: 0,
      localX: 0,
      y: 0,
      z: 0,
      width: PLAYER.WIDTH,
      length: PLAYER.LENGTH,
      speed: 0,
      maxSpeed: PLAYER.BASE_MAX_SPEED,
      speedRatio: 0,
      isBraking: false,
      isWrongWay: false,
      yaw: 0,
      lateralVelocity: 0,
      isCrashed: false,
      isScraping: false,
      isGhost: false,
    };

    this.ghostRemaining = 0;
    this.impactYaw = 0;

    if (this.scene) {
      this.scene.add(this.group);
      this.scene.add(this.trailMesh);
    }
    this.reset();
  }

  addGeometry(geometry) {
    this.geometries.push(geometry);
    return geometry;
  }

  createBodyMesh(geometry, material, castShadow) {
    const mesh = new THREE.Mesh(this.addGeometry(geometry), material);
    mesh.castShadow = castShadow;
    this.bodyRoot.add(mesh);
    this.visualObjects.push(mesh);
    return mesh;
  }

  buildBody() {
    const { body, accent, glass, headlight, taillight } = this.materials;
    this.bodyMesh = this.createBodyMesh(buildBodyGeometry(), body, true);
    this.accentMesh = this.createBodyMesh(buildAccentGeometry(), accent, true);
    this.glassMesh = this.createBodyMesh(buildGlassGeometry(), glass, true);
    this.headlightMesh = this.createBodyMesh(buildHeadlightGeometry(), headlight, false);
    this.taillightMesh = this.createBodyMesh(buildTaillightGeometry(), taillight, false);
  }

  buildWheels() {
    const tyreGeometry = this.addGeometry(buildTyreGeometry());
    const rimGeometry = this.addGeometry(buildRimGeometry());
    const placements = [
      [-1, FRONT_AXLE_Z, true],
      [1, FRONT_AXLE_Z, true],
      [-1, REAR_AXLE_Z, false],
      [1, REAR_AXLE_Z, false],
    ];
    this.wheels = [];
    for (const [side, axleZ, isFront] of placements) {
      const pivot = new THREE.Group();
      pivot.position.set(side * WHEEL_TRACK, WHEEL_RADIUS, axleZ);
      const spin = new THREE.Group();
      const holder = new THREE.Group();
      if (side < 0) holder.rotation.y = Math.PI;
      const tyre = new THREE.Mesh(tyreGeometry, this.materials.tire);
      tyre.castShadow = true;
      const rim = new THREE.Mesh(rimGeometry, this.materials.rim);
      holder.add(tyre, rim);
      spin.add(holder);
      pivot.add(spin);
      this.group.add(pivot);
      this.visualObjects.push(pivot);
      this.wheels.push({ pivot, spin, isFront });
    }
  }

  buildGroundEffects() {
    this.contactShadow = new THREE.Mesh(this.addGeometry(createContactShadowGeometry()), this.materials.contactShadow);
    this.contactShadow.renderOrder = 1;
    this.group.add(this.contactShadow);
    this.visualObjects.push(this.contactShadow);

    const headCenterZ = HEAD_GLOW.START_Z - HEAD_GLOW.LENGTH * 0.5;
    const tailCenterZ = TAIL_GLOW.START_Z + TAIL_GLOW.LENGTH * 0.5;
    const headGeometry = createMirroredGlowStrips(
      HEAD_GLOW.WIDTH,
      HEAD_GLOW.LENGTH,
      HEADLIGHT_X,
      headCenterZ,
      PALETTE.HEADLIGHT,
      1,
    );
    const tailGeometry = createMirroredGlowStrips(
      TAIL_GLOW.WIDTH,
      TAIL_GLOW.LENGTH,
      TAIL_GLOW.X,
      tailCenterZ,
      PALETTE.TAILLIGHT,
      -1,
    );
    this.headReflection = new THREE.Mesh(this.addGeometry(headGeometry), this.materials.headGlow);
    this.tailReflection = new THREE.Mesh(this.addGeometry(tailGeometry), this.materials.tailGlow);
    for (const mesh of [this.headReflection, this.tailReflection]) {
      mesh.renderOrder = 2;
      this.group.add(mesh);
    }
  }

  buildLights() {
    this.headSpots = [];
    for (const side of [-1, 1]) {
      const spot = new THREE.SpotLight(
        PALETTE.HEADLIGHT,
        SPOT_LIGHT.INTENSITY,
        SPOT_LIGHT.DISTANCE,
        SPOT_LIGHT.ANGLE,
        SPOT_LIGHT.PENUMBRA,
        SPOT_LIGHT.DECAY,
      );
      spot.castShadow = false;
      spot.position.set(side * HEADLIGHT_X, HEADLIGHT_Y, HEADLIGHT_Z);
      spot.target.position.set(
        side * HEADLIGHT_X * SPOT_LIGHT.SPREAD,
        HEADLIGHT_Y - SPOT_LIGHT.DROP,
        HEADLIGHT_Z - SPOT_LIGHT.REACH,
      );
      this.bodyRoot.add(spot, spot.target);
      this.headSpots.push(spot);
    }
    this.rearLight = new THREE.PointLight(PALETTE.TAILLIGHT, REAR_LIGHT.INTENSITY, REAR_LIGHT.DISTANCE, REAR_LIGHT.DECAY);
    this.rearLight.castShadow = false;
    this.rearLight.position.set(0, REAR_LIGHT.Y, REAR_LIGHT.Z);
    this.bodyRoot.add(this.rearLight);
  }

  buildTrails() {
    this.trailGeometry = this.addGeometry(createTrailGeometry());
    this.trailPositions = this.trailGeometry.attributes.position;
    this.trailColors = this.trailGeometry.attributes.color;
    this.trailMesh = new THREE.Mesh(this.trailGeometry, this.materials.trail);
    this.trailMesh.name = 'PlayerBrakeTrails';
    this.trailMesh.frustumCulled = false;
    this.trailMesh.renderOrder = 3;
    this.trailMesh.visible = false;
    this.trailHistory = new Float32Array(TRAIL_POINTS * TRAIL_STRIDE);
    this.trailHead = 1;
    this.trailCount = 2;
    this.trailIntensity = 0;
    this.trailColor = new THREE.Color(PALETTE.BRAKE_TRAIL);
  }

  update(deltaTime, inputState, roadCurveFn) {
    if (!(deltaTime > 0)) return;
    const dt = Math.min(deltaTime, MAX_STEP);
    if (typeof roadCurveFn === 'function') this.curveFn = roadCurveFn;
    this.elapsed += dt;

    const previousSpeed = this.speed;
    if (this.isCrashed) this.updateCrashMotion(dt);
    else this.updateDriving(dt, inputState);
    this.z -= this.speed * dt;
    this.longitudinalAcceleration = damp(
      this.longitudinalAcceleration,
      (this.speed - previousSpeed) / dt,
      ACCEL_SMOOTHING,
      dt,
    );

    this.updateGhost(dt);
    this.updateChassis(dt);
    this.updateWheels(dt);
    this.placeOnRoad();
    this.updateLights(dt);
    this.updateTrail(dt);
    this.refreshBounds();
  }

  updateDriving(dt, inputState) {
    const steer = clamp(Number(inputState?.steer) || 0, -1, 1);
    const throttle = clamp(Number(inputState?.throttle) || 0, 0, 1);
    const isBraking = Boolean(inputState?.brake);
    this.steerInput = steer;
    this.isBraking = isBraking;
    this.maxSpeed = Math.min(PLAYER.MAX_SPEED_CAP, this.maxSpeed + PLAYER.MAX_SPEED_GROWTH * dt);

    if (isBraking) {
      this.speed -= PLAYER.BRAKE_DECELERATION * dt;
    } else {
      const isBoosting = throttle > 0;
      const target = isBoosting ? this.maxSpeed : this.maxSpeed * PLAYER.CRUISE_RATIO;
      const rate = isBoosting ? Math.max(PLAYER.ACCELERATION, PLAYER.BOOST_ACCELERATION * throttle) : PLAYER.ACCELERATION;
      if (this.speed < target) this.speed = Math.min(target, this.speed + rate * dt);
      else this.speed = Math.max(target, this.speed - PLAYER.ACCELERATION * COAST_DECELERATION_RATIO * dt);
    }

    const speedRatio = clamp(this.speed / PLAYER.MAX_SPEED_CAP, 0, 1);
    const steerSpeed = PLAYER.STEER_SPEED * (STEER_SPEED_FLOOR + STEER_SPEED_GAIN * speedRatio);
    this.lateralVelocity = damp(this.lateralVelocity, steer * steerSpeed, PLAYER.STEER_RESPONSE, dt);
    this.integrateLateral(dt, steer);
    if (this.isScraping) this.speed -= SCRAPE_SPEED_BLEED * dt;
    this.speed = clamp(this.speed, PLAYER.MIN_SPEED, this.maxSpeed);
    this.headingYaw =
      -Math.atan2(this.lateralVelocity, Math.max(this.speed, HEADING_MIN_SPEED)) * HEADING_YAW_FACTOR;
  }

  integrateLateral(dt, push) {
    const limit = PLAYER.LATERAL_LIMIT;
    this.localX += this.lateralVelocity * dt;
    this.isScraping = false;
    if (this.localX >= limit) {
      this.localX = limit;
      this.isScraping = this.lateralVelocity > SCRAPE_VELOCITY_THRESHOLD || push > SCRAPE_PUSH_THRESHOLD;
      if (this.lateralVelocity > 0) this.lateralVelocity = 0;
    } else if (this.localX <= -limit) {
      this.localX = -limit;
      this.isScraping = this.lateralVelocity < -SCRAPE_VELOCITY_THRESHOLD || push < -SCRAPE_PUSH_THRESHOLD;
      if (this.lateralVelocity < 0) this.lateralVelocity = 0;
    }
  }

  updateCrashMotion(dt) {
    this.crashElapsed += dt;
    this.isBraking = false;
    this.speed = Math.max(0, this.speed - this.crashDeceleration * dt);
    this.crashYaw = damp(this.crashYaw, this.crashYawTarget, CRASH_SPIN_RESPONSE, dt);
    this.steerInput = damp(this.steerInput, 0, CRASH_STEER_RETURN, dt);
    this.lateralVelocity = damp(this.lateralVelocity, 0, CRASH_SLIDE_DECAY, dt);
    this.integrateLateral(dt, 0);
  }

  updateGhost(dt) {
    this.impactYaw = damp(this.impactYaw, 0, UNLIMITED.IMPACT_YAW_RECOVERY, dt);
    if (this.ghostRemaining > 0) this.ghostRemaining = Math.max(0, this.ghostRemaining - dt);
    this.chassis.visible =
      this.ghostRemaining <= 0 || Math.floor(this.elapsed * UNLIMITED.GHOST_FLICKER_RATE) % 2 === 0;
  }

  updateChassis(dt) {
    const rollTarget = this.isCrashed
      ? 0
      : -clamp(this.lateralVelocity / ROLL_REFERENCE_VELOCITY, -1, 1) * PLAYER.MAX_ROLL;
    const pitchTarget = clamp(this.longitudinalAcceleration / PITCH_ACCEL_REFERENCE, -1, 1) * PLAYER.MAX_PITCH;
    let remaining = dt;
    while (remaining > 1e-6) {
      const step = Math.min(SPRING_STEP, remaining);
      this.rollVelocity += (ROLL_STIFFNESS * (rollTarget - this.roll) - ROLL_DAMPING * this.rollVelocity) * step;
      this.roll += this.rollVelocity * step;
      this.pitchVelocity += (PITCH_STIFFNESS * (pitchTarget - this.pitch) - PITCH_DAMPING * this.pitchVelocity) * step;
      this.pitch += this.pitchVelocity * step;
      remaining -= step;
    }
    this.roll = clamp(this.roll, -MAX_CHASSIS_ROLL, MAX_CHASSIS_ROLL);
    this.pitch = clamp(this.pitch, -MAX_CHASSIS_PITCH, MAX_CHASSIS_PITCH);

    const speedRatio = clamp(this.speed / PLAYER.MAX_SPEED_CAP, 0, 1);
    const scrape = this.isScraping ? 1 : 0;
    const time = this.elapsed;
    const buzz = Math.sin(time * 61.3) * 0.6 + Math.sin(time * 97.1 + 1.3) * 0.4;
    const shimmer = Math.sin(time * 73.7 + 0.6);
    const sway = Math.sin(time * 83.9 + 2.2);
    this.chassis.position.y =
      CHASSIS_PIVOT_Y + buzz * (VIBRATION_HEIGHT * speedRatio + SCRAPE_VIBRATION_HEIGHT * scrape);
    this.chassis.rotation.set(
      this.pitch + shimmer * VIBRATION_PITCH * speedRatio,
      0,
      this.roll + sway * (VIBRATION_ROLL * speedRatio + SCRAPE_VIBRATION_ROLL * scrape),
    );
  }

  updateWheels(dt) {
    this.wheelSpin = (this.wheelSpin - (this.speed / WHEEL_RADIUS) * dt) % TWO_PI;
    this.steerVisual = damp(this.steerVisual, this.steerInput, WHEEL_STEER_RESPONSE, dt);
    const speedRatio = clamp(this.speed / PLAYER.MAX_SPEED_CAP, 0, 1);
    const steerAngle = -this.steerVisual * MAX_WHEEL_STEER * (1 - WHEEL_STEER_SPEED_FALLOFF * speedRatio);
    for (let index = 0; index < this.wheels.length; index += 1) {
      const wheel = this.wheels[index];
      wheel.spin.rotation.x = this.wheelSpin;
      wheel.pivot.rotation.y = wheel.isFront ? steerAngle : 0;
    }
  }

  placeOnRoad() {
    const curve = this.curve;
    const result = this.curveFn(this.z, curve);
    if (result && result !== curve) {
      curve.x = result.x;
      curve.y = result.y;
      curve.dx = result.dx;
      curve.dy = result.dy;
    }
    this.group.position.set(curve.x + this.localX, curve.y, this.z);
    this.group.rotation.set(
      getRoadPitch(curve.dy),
      getRoadYaw(curve.dx) + this.headingYaw + this.crashYaw + this.impactYaw,
      0,
    );
    this.group.updateMatrixWorld(true);
  }

  updateLights(dt) {
    this.brakeGlow = damp(this.brakeGlow, this.isBraking ? 1 : 0, BRAKE_GLOW_RESPONSE, dt);
    this.lightLevel = this.computeFlicker();
    this.applyLightLevels();
  }

  computeFlicker() {
    if (!this.isCrashed || this.crashElapsed >= CRASH_FLICKER_TIME) return 1;
    const noise = crashFlickerNoise(Math.floor(this.crashElapsed * CRASH_FLICKER_RATE));
    return noise > CRASH_FLICKER_THRESHOLD ? 1 : 0.12 + noise * 0.4;
  }

  applyLightLevels() {
    const level = this.lightLevel;
    const lightScale = this.isVisible ? level : 0;
    const { headlight, taillight, headGlow, tailGlow } = this.materials;
    headlight.emissiveIntensity = LIGHTING.HEADLIGHT_EMISSIVE * level;
    taillight.emissiveIntensity = lerp(LIGHTING.TAILLIGHT_EMISSIVE, LIGHTING.BRAKE_EMISSIVE, this.brakeGlow) * level;
    headGlow.opacity = HEAD_GLOW.OPACITY * level;
    tailGlow.opacity = lerp(TAIL_GLOW.OPACITY, TAIL_GLOW.BRAKE_OPACITY, this.brakeGlow) * level;
    for (let index = 0; index < this.headSpots.length; index += 1) {
      this.headSpots[index].intensity = SPOT_LIGHT.INTENSITY * lightScale;
    }
    this.rearLight.intensity = lerp(REAR_LIGHT.INTENSITY, REAR_LIGHT.BRAKE_INTENSITY, this.brakeGlow) * lightScale;
  }

  updateTrail(dt) {
    const isActive =
      !this.isCrashed && (this.isBraking || this.speed >= this.maxSpeed * PLAYER.TRAIL_SPEED_RATIO);
    const target = isActive ? (this.isBraking ? 1 : TRAIL_CRUISE_LEVEL) : 0;
    let response = target > this.trailIntensity ? TRAIL_FADE_IN : TRAIL_FADE_OUT;
    if (this.isCrashed) response = TRAIL_CRASH_FADE;
    this.trailIntensity = damp(this.trailIntensity, target, response, dt);
    this.sampleTrailAnchor();
    this.advanceTrailHistory();
    const isShown = this.isVisible && this.trailIntensity > TRAIL_VISIBILITY_EPSILON;
    this.trailMesh.visible = isShown;
    if (isShown) this.writeTrailGeometry();
  }

  sampleTrailAnchor() {
    const matrix = this.bodyRoot.matrixWorld;
    this.trailCenter.copy(this.trailAnchor).applyMatrix4(matrix);
    this.trailRight.setFromMatrixColumn(matrix, 0).normalize();
  }

  writeTrailSlot(offset, x, y, z, rightX, rightY, rightZ) {
    const history = this.trailHistory;
    history[offset] = x;
    history[offset + 1] = y;
    history[offset + 2] = z;
    history[offset + 3] = rightX;
    history[offset + 4] = rightY;
    history[offset + 5] = rightZ;
  }

  advanceTrailHistory() {
    const history = this.trailHistory;
    const center = this.trailCenter;
    const right = this.trailRight;
    let fixed = ((this.trailHead - 1 + TRAIL_POINTS) % TRAIL_POINTS) * TRAIL_STRIDE;
    let deltaX = center.x - history[fixed];
    let deltaY = center.y - history[fixed + 1];
    let deltaZ = center.z - history[fixed + 2];
    let distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
    let pushes = 0;
    while (distance >= TRAIL_SPACING && pushes < TRAIL_POINTS - 1) {
      const alpha = TRAIL_SPACING / distance;
      const offset = this.trailHead * TRAIL_STRIDE;
      this.writeTrailSlot(
        offset,
        history[fixed] + deltaX * alpha,
        history[fixed + 1] + deltaY * alpha,
        history[fixed + 2] + deltaZ * alpha,
        lerp(history[fixed + 3], right.x, alpha),
        lerp(history[fixed + 4], right.y, alpha),
        lerp(history[fixed + 5], right.z, alpha),
      );
      fixed = offset;
      this.trailHead = (this.trailHead + 1) % TRAIL_POINTS;
      if (this.trailCount < TRAIL_POINTS) this.trailCount += 1;
      deltaX = center.x - history[fixed];
      deltaY = center.y - history[fixed + 1];
      deltaZ = center.z - history[fixed + 2];
      distance = Math.sqrt(deltaX * deltaX + deltaY * deltaY + deltaZ * deltaZ);
      pushes += 1;
    }
    this.writeTrailSlot(this.trailHead * TRAIL_STRIDE, center.x, center.y, center.z, right.x, right.y, right.z);
  }

  writeTrailGeometry() {
    const history = this.trailHistory;
    const positions = this.trailPositions.array;
    const colors = this.trailColors.array;
    const color = this.trailColor;
    const strength = this.trailIntensity * TRAIL_GAIN;
    const lastPoint = TRAIL_POINTS - 1;
    const newestAge = this.trailCount - 1;
    let base = 0;
    for (let trail = 0; trail < TRAIL_COUNT; trail += 1) {
      const span = trail === 0 ? -TRAIL_HALF_SPAN : TRAIL_HALF_SPAN;
      for (let point = 0; point < TRAIL_POINTS; point += 1) {
        const age = point < newestAge ? point : newestAge;
        const offset = ((this.trailHead - age + TRAIL_POINTS) % TRAIL_POINTS) * TRAIL_STRIDE;
        const rightX = history[offset + 3];
        const rightY = history[offset + 4];
        const rightZ = history[offset + 5];
        const cornerX = history[offset] + rightX * span;
        const cornerY = history[offset + 1] + rightY * span;
        const cornerZ = history[offset + 2] + rightZ * span;
        const progress = point / lastPoint;
        const taper = 1 - TRAIL_TAPER * progress;
        const halfWidth = TRAIL_WIDTH * 0.5 * taper;
        const halfThickness = TRAIL_THICKNESS * 0.5 * taper;
        const fade = strength * (1 - progress) ** TRAIL_FADE_POWER;

        positions[base] = cornerX - rightX * halfWidth;
        positions[base + 1] = cornerY - rightY * halfWidth;
        positions[base + 2] = cornerZ - rightZ * halfWidth;
        positions[base + 3] = cornerX + rightX * halfWidth;
        positions[base + 4] = cornerY + rightY * halfWidth;
        positions[base + 5] = cornerZ + rightZ * halfWidth;
        positions[base + 6] = cornerX;
        positions[base + 7] = cornerY + halfThickness;
        positions[base + 8] = cornerZ;
        positions[base + 9] = cornerX;
        positions[base + 10] = cornerY - halfThickness;
        positions[base + 11] = cornerZ;

        const red = color.r * fade;
        const green = color.g * fade;
        const blue = color.b * fade;
        for (let corner = 0; corner < TRAIL_VERTICES_PER_POINT; corner += 1) {
          const colorOffset = base + corner * 3;
          colors[colorOffset] = red;
          colors[colorOffset + 1] = green;
          colors[colorOffset + 2] = blue;
        }
        base += TRAIL_VERTICES_PER_POINT * 3;
      }
    }
    this.trailPositions.needsUpdate = true;
    this.trailColors.needsUpdate = true;
    this.trailGeometry.boundingSphere.center.copy(this.trailCenter);
  }

  resetTrail() {
    this.sampleTrailAnchor();
    const center = this.trailCenter;
    const right = this.trailRight;
    for (let slot = 0; slot < TRAIL_POINTS; slot += 1) {
      this.writeTrailSlot(slot * TRAIL_STRIDE, center.x, center.y, center.z, right.x, right.y, right.z);
    }
    this.trailHead = 1;
    this.trailCount = 2;
    this.trailIntensity = 0;
    this.trailMesh.visible = false;
  }

  refreshBounds() {
    const bounds = this.bounds;
    bounds.worldX = this.curve.x + this.localX;
    bounds.localX = this.localX;
    bounds.y = this.curve.y;
    bounds.z = this.z;
    bounds.width = PLAYER.WIDTH;
    bounds.length = PLAYER.LENGTH;
    bounds.speed = this.speed;
    bounds.maxSpeed = this.maxSpeed;
    bounds.speedRatio = this.speed / PLAYER.MAX_SPEED_CAP;
    bounds.isBraking = this.isBraking;
    bounds.isWrongWay = isWrongWaySide(this.localX);
    bounds.yaw = this.group.rotation.y;
    bounds.lateralVelocity = this.lateralVelocity;
    bounds.isCrashed = this.isCrashed;
    bounds.isScraping = this.isScraping;
    bounds.isGhost = this.ghostRemaining > 0;
    return bounds;
  }

  getBounds() {
    return this.bounds;
  }

  triggerCrash(impactSide = 0) {
    if (this.isCrashed) return;
    const side = impactSide < 0 ? -1 : impactSide > 0 ? 1 : 0;
    const spinSign = side !== 0 ? side : Math.random() < 0.5 ? -1 : 1;
    this.isCrashed = true;
    this.isBraking = false;
    this.isScraping = false;
    this.crashElapsed = 0;
    this.crashDeceleration = Math.max(this.speed / CRASH_STOP_TIME, CRASH_MIN_DECELERATION);
    this.crashYawTarget = this.crashYaw + spinSign * lerp(CRASH_SPIN_MIN, CRASH_SPIN_MAX, Math.random());
    this.lateralVelocity =
      side !== 0 ? -side * CRASH_SLIDE_SPEED : (Math.random() - 0.5) * CRASH_SLIDE_SPEED * 0.6;
    this.rollVelocity += (side !== 0 ? side : spinSign * 0.5) * CRASH_ROLL_IMPULSE;
    this.pitchVelocity -= CRASH_PITCH_IMPULSE * (side === 0 ? 1 : 0.45);
    this.refreshBounds();
  }

  triggerImpact(impactSide = 0) {
    if (this.isCrashed) return;
    const side = impactSide < 0 ? -1 : impactSide > 0 ? 1 : 0;
    const spinSign = side !== 0 ? side : Math.random() < 0.5 ? -1 : 1;
    this.speed = Math.max(PLAYER.MIN_SPEED, this.speed * UNLIMITED.IMPACT_SPEED_RETAIN);
    this.impactYaw += spinSign * UNLIMITED.IMPACT_YAW;
    this.lateralVelocity += side !== 0 ? -side * UNLIMITED.IMPACT_SHOVE : 0;
    this.rollVelocity += spinSign * CRASH_ROLL_IMPULSE * 0.6;
    this.pitchVelocity -= CRASH_PITCH_IMPULSE * (side === 0 ? 0.8 : 0.35);
    this.ghostRemaining = UNLIMITED.GHOST_DURATION;
    this.refreshBounds();
  }

  holdGhost() {
    if (this.ghostRemaining > 0) this.ghostRemaining = Math.max(this.ghostRemaining, UNLIMITED.GHOST_HOLD);
  }

  setDynamicLights(enabled) {
    this.dynamicLightsEnabled = Boolean(enabled);
    for (let index = 0; index < this.headSpots.length; index += 1) {
      this.headSpots[index].visible = this.dynamicLightsEnabled;
    }
    this.rearLight.visible = this.dynamicLightsEnabled;
  }

  setLightReflections(enabled) {
    this.reflectionsEnabled = Boolean(enabled);
    this.applyReflectionVisibility();
  }

  applyReflectionVisibility() {
    const isShown = this.isVisible && this.reflectionsEnabled;
    this.headReflection.visible = isShown;
    this.tailReflection.visible = isShown;
  }

  setVisible(visible) {
    this.isVisible = Boolean(visible);
    for (let index = 0; index < this.visualObjects.length; index += 1) {
      this.visualObjects[index].visible = this.isVisible;
    }
    this.applyReflectionVisibility();
    const showTrail = this.isVisible && this.trailIntensity > TRAIL_VISIBILITY_EPSILON;
    this.trailMesh.visible = showTrail;
    if (showTrail) this.writeTrailGeometry();
    this.applyLightLevels();
  }

  reset() {
    this.z = PLAYER.START_Z;
    this.localX = PLAYER.START_LOCAL_X;
    this.speed = PLAYER.START_SPEED;
    this.maxSpeed = PLAYER.BASE_MAX_SPEED;
    this.lateralVelocity = 0;
    this.longitudinalAcceleration = 0;
    this.headingYaw = 0;
    this.crashYaw = 0;
    this.crashYawTarget = 0;
    this.crashElapsed = 0;
    this.crashDeceleration = 0;
    this.isCrashed = false;
    this.isBraking = false;
    this.isScraping = false;
    this.ghostRemaining = 0;
    this.impactYaw = 0;
    this.chassis.visible = true;
    this.steerInput = 0;
    this.steerVisual = 0;
    this.roll = 0;
    this.rollVelocity = 0;
    this.pitch = 0;
    this.pitchVelocity = 0;
    this.wheelSpin = 0;
    this.brakeGlow = 0;
    this.elapsed = 0;
    this.lightLevel = 1;

    this.chassis.position.set(0, CHASSIS_PIVOT_Y, 0);
    this.chassis.rotation.set(0, 0, 0);
    for (let index = 0; index < this.wheels.length; index += 1) {
      this.wheels[index].spin.rotation.x = 0;
      this.wheels[index].pivot.rotation.y = 0;
    }

    this.placeOnRoad();
    this.resetTrail();
    this.applyLightLevels();
    this.refreshBounds();
  }

  dispose() {
    this.group.removeFromParent();
    this.trailMesh.removeFromParent();
    for (const geometry of this.geometries) geometry.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
    this.geometries.length = 0;
  }
}
