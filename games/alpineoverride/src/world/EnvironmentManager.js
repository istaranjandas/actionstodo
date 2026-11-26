import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  PALETTE,
  PLAYER,
  QUALITY_CONFIG,
  MAX_TREE_COUNT,
  MAX_ROCK_COUNT,
  getRoadCurve,
  createSeededRandom,
  clamp,
  damp,
  smoothstep,
} from '../config/constants.js';
import { AttributeUploadTracker, sampleTerrainSurfaceY } from './RoadManager.js';

const SCATTER_NEAR_MARGIN = 40;
const SCATTER_FAR_MARGIN = 80;
const SCATTER_JITTER = 0.9;
const ORIGIN_REBASE_DISTANCE = 2048;

const TREE_SEED = 0x51a7e3;
const ROCK_SEED = 0x2b0d39;
const MOUNTAIN_SEED = 0x7c4127;
const SNOW_SEED = 0x5e0f11;

const TREE_MIN_X = 12.5;
const TREE_MAX_X = 140;
const TREE_CANOPY_RADIUS = 2.3;
const TREE_CLEARANCE_X = 9.8;

const ROCK_CLUSTER_MIN_X = 11.4;
const ROCK_CLUSTER_MAX_X = 13.5;
const ROCK_FIELD_MAX_X = 70;

const PINE_TIERS = Object.freeze([
  { radius: 2.3, height: 2.9, base: 1.3, segments: 7, twist: 0, offsetX: 0.05, offsetZ: -0.04, snow: 0.55 },
  { radius: 1.85, height: 2.6, base: 2.65, segments: 7, twist: 0.45, offsetX: -0.07, offsetZ: 0.05, snow: 0.6 },
  { radius: 1.4, height: 2.3, base: 3.9, segments: 6, twist: 0.9, offsetX: 0.06, offsetZ: 0.03, snow: 0.68 },
  { radius: 0.9, height: 2.1, base: 5.0, segments: 6, twist: 1.4, offsetX: -0.03, offsetZ: -0.05, snow: 0.8 },
]);

const MOUNTAIN_SLOTS = Math.max(...Object.values(QUALITY_CONFIG).map((config) => config.mountainCount));
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5));
const MOUNTAIN_SKIRT_DEPTH = -140;
const MOUNTAIN_RING_HEIGHTS = Object.freeze([0, 0.32, 0.6, 0.84]);
const MOUNTAIN_RING_RADII = Object.freeze([1.25, 1.0, 0.66, 0.38, 0.16]);
const MOUNTAIN_LIGHT = new THREE.Vector3(-0.5, 0.6, 0.35).normalize();
const MOUNTAIN_LAYERS = Object.freeze([
  {
    rock: PALETTE.MOUNTAIN,
    minDistance: 760,
    maxDistance: 900,
    minBase: 150,
    maxBase: 240,
    minHeight: 140,
    maxHeight: 250,
    haze: 0.4,
    phase: 0.35,
  },
  {
    rock: PALETTE.MOUNTAIN_FAR,
    minDistance: 960,
    maxDistance: 1080,
    minBase: 200,
    maxBase: 290,
    minHeight: 230,
    maxHeight: 360,
    haze: 0.6,
    phase: 1.95,
  },
]);
const MOUNTAIN_FOLLOW_X = 0.35;
const MOUNTAIN_DROP = 25;
const MOUNTAIN_HEIGHT_LAMBDA = 0.8;

const SNOW_COUNTS = Object.freeze({ LOW: 0, MEDIUM: 400, HIGH: 900 });
const SNOW_MAX = Math.max(...Object.values(SNOW_COUNTS));
const SNOW_MIN_X = -30;
const SNOW_MAX_X = 30;
const SNOW_MIN_Y = -1;
const SNOW_MAX_Y = 17;
const SNOW_MIN_Z = -80;
const SNOW_MAX_Z = 14;
const SNOW_WIDTH = SNOW_MAX_X - SNOW_MIN_X;
const SNOW_HEIGHT = SNOW_MAX_Y - SNOW_MIN_Y;
const SNOW_DEPTH = SNOW_MAX_Z - SNOW_MIN_Z;
const SNOW_WIND = 0.7;
const SNOW_GUST = 0.55;
const SNOW_SWAY = 0.45;

function hash3(a, b, c) {
  const s = Math.sin(a * 12.9898 + b * 78.233 + c * 37.719) * 43758.5453123;
  return s - Math.floor(s);
}

const quantize = (value) => Math.round(value * 10000);

function wrapInto(value, min, span) {
  if (value >= min && value < min + span) return value;
  return value - Math.floor((value - min) / span) * span;
}

function finalizePart(geometry, colorize) {
  const part = geometry.index ? geometry.toNonIndexed() : geometry;
  if (part !== geometry) geometry.dispose();
  if (part.getAttribute('uv')) part.deleteAttribute('uv');
  part.computeVertexNormals();
  const positions = part.getAttribute('position');
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    colorize(positions.getX(i), positions.getY(i), positions.getZ(i), color);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  part.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return part;
}

function buildPineGeometry() {
  const foliage = new THREE.Color(PALETTE.PINE_MID);
  const snow = new THREE.Color(PALETTE.SNOW);
  const trunkColor = new THREE.Color(PALETTE.TRUNK);
  const shadedFoliage = new THREE.Color();
  const parts = [];

  const trunkHeight = 2.2;
  const trunk = new THREE.CylinderGeometry(0.13, 0.21, trunkHeight, 6, 1);
  trunk.translate(0, trunkHeight * 0.5, 0);
  parts.push(
    finalizePart(trunk, (x, y, z, out) => out.copy(trunkColor).multiplyScalar(0.7 + 0.3 * clamp(y / trunkHeight, 0, 1))),
  );

  PINE_TIERS.forEach((tier, tierIndex) => {
    const cone = new THREE.ConeGeometry(tier.radius, tier.height, tier.segments, 2, false);
    const positions = cone.getAttribute('position');
    const apexY = tier.height * 0.5;
    for (let i = 0; i < positions.count; i++) {
      const x = positions.getX(i);
      const y = positions.getY(i);
      const z = positions.getZ(i);
      if (y > apexY - 1e-4) continue;
      const qx = quantize(x);
      const qy = quantize(y);
      const qz = quantize(z);
      const radial = 1 + (hash3(qx, qy, qz + tierIndex) - 0.5) * 0.26;
      const lift = (hash3(qz, qx, qy + tierIndex) - 0.5) * 0.12 * tier.height;
      positions.setXYZ(i, x * radial, y + lift, z * radial);
    }
    cone.rotateY(tier.twist);
    cone.translate(tier.offsetX, tier.base + tier.height * 0.5, tier.offsetZ);
    parts.push(
      finalizePart(cone, (x, y, z, out) => {
        const t = clamp((y - tier.base) / tier.height, 0, 1);
        shadedFoliage.copy(foliage).multiplyScalar(0.58 + 0.5 * t);
        out.copy(shadedFoliage).lerp(snow, tier.snow * smoothstep(0.3, 1, t) * (t > 0.92 ? 1.12 : 0.7));
      }),
    );
  });

  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

function buildBoulderGeometry() {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  if (geometry.getAttribute('uv')) geometry.deleteAttribute('uv');
  const positions = geometry.getAttribute('position');
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const y = positions.getY(i);
    const z = positions.getZ(i);
    const qx = quantize(x);
    const qy = quantize(y);
    const qz = quantize(z);
    const radial = 0.78 + 0.44 * hash3(qx, qy, qz);
    const skew = 1 + (hash3(qy, qz, qx) - 0.5) * 0.3;
    const flatten = y < -0.35 ? 0.55 : 0.82;
    positions.setXYZ(i, x * radial * skew, y * radial * flatten, z * radial);
  }
  geometry.computeVertexNormals();

  const rock = new THREE.Color(PALETTE.ROCK);
  const snow = new THREE.Color(PALETTE.SNOW);
  const faceColor = new THREE.Color();
  const normals = geometry.getAttribute('normal');
  const colors = new Float32Array(positions.count * 3);
  for (let face = 0; face < positions.count; face += 3) {
    const centroidY = (positions.getY(face) + positions.getY(face + 1) + positions.getY(face + 2)) / 3;
    const normalY = normals.getY(face);
    const variation = 0.85 + 0.3 * hash3(face, 3, 11);
    faceColor.copy(rock).multiplyScalar(variation * (0.62 + 0.38 * smoothstep(-0.7, 0.4, centroidY)));
    const dusting = smoothstep(0.45, 0.85, normalY) * smoothstep(0.05, 0.45, centroidY);
    faceColor.lerp(snow, dusting * 0.8);
    for (let k = 0; k < 3; k++) {
      colors[(face + k) * 3] = faceColor.r;
      colors[(face + k) * 3 + 1] = faceColor.g;
      colors[(face + k) * 3 + 2] = faceColor.b;
    }
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geometry;
}

function appendPeak(target, centerX, centerZ, baseRadius, height, layer, random) {
  const segments = 8 + Math.floor(random() * 3);
  const phase = random() * Math.PI * 2;
  const rings = [];
  for (let ring = 0; ring < MOUNTAIN_RING_RADII.length; ring++) {
    const vertices = [];
    for (let k = 0; k < segments; k++) {
      const theta = (k / segments) * Math.PI * 2 + phase + (random() - 0.5) * 0.25;
      const ridge = ring > 0 ? 1 + 0.18 * Math.sin(theta * 2 + phase * 3) : 1;
      const jitter = ring === 0 ? 0.2 : 0.35;
      const radius = baseRadius * MOUNTAIN_RING_RADII[ring] * (1 + (random() - 0.5) * jitter) * ridge;
      const y =
        ring === 0 ? MOUNTAIN_SKIRT_DEPTH : MOUNTAIN_RING_HEIGHTS[ring - 1] * height * (1 + (random() - 0.5) * 0.12);
      vertices.push([centerX + Math.cos(theta) * radius, y, centerZ + Math.sin(theta) * radius]);
    }
    rings.push(vertices);
  }
  const apex = [
    centerX + (random() - 0.5) * 0.15 * baseRadius,
    height,
    centerZ + (random() - 0.5) * 0.15 * baseRadius,
  ];
  const snowLine = 0.5 + random() * 0.14;
  const snowPhase = random() * Math.PI * 2;

  const addFace = (a, b, c) => {
    const ux = b[0] - a[0];
    const uy = b[1] - a[1];
    const uz = b[2] - a[2];
    const vx = c[0] - a[0];
    const vy = c[1] - a[1];
    const vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const length = Math.hypot(nx, ny, nz) || 1;
    nx /= length;
    ny /= length;
    nz /= length;
    const gx = (a[0] + b[0] + c[0]) / 3;
    const gy = (a[1] + b[1] + c[1]) / 3;
    const gz = (a[2] + b[2] + c[2]) / 3;
    let second = b;
    let third = c;
    if ((gx - centerX) * nx + (gz - centerZ) * nz + ny * baseRadius * 0.2 < 0) {
      second = c;
      third = b;
      nx = -nx;
      ny = -ny;
      nz = -nz;
    }
    const heightRatio = gy / height;
    const angle = Math.atan2(gz - centerZ, gx - centerX);
    const localSnowLine = snowLine + 0.12 * Math.sin(angle * 3 + snowPhase) + 0.05 * Math.sin(angle * 7 - snowPhase);
    const isSnow = heightRatio > localSnowLine && ny > 0.18;
    const light = Math.max(0, nx * MOUNTAIN_LIGHT.x + ny * MOUNTAIN_LIGHT.y + nz * MOUNTAIN_LIGHT.z);
    const shade = 0.55 + 0.55 * light + 0.12 * ny;
    target.color.copy(isSnow ? target.snow : layer.rockColor).multiplyScalar(shade);
    const haze = layer.haze + (1 - layer.haze) * 0.55 * (1 - smoothstep(-0.1, 0.6, heightRatio));
    target.color.lerp(target.fog, clamp(haze, 0, 1));
    for (const vertex of [a, second, third]) {
      target.positions.push(vertex[0], vertex[1], vertex[2]);
      target.colors.push(target.color.r, target.color.g, target.color.b);
    }
  };

  for (let ring = 0; ring < rings.length - 1; ring++) {
    const lower = rings[ring];
    const upper = rings[ring + 1];
    for (let k = 0; k < segments; k++) {
      const next = (k + 1) % segments;
      addFace(lower[k], lower[next], upper[next]);
      addFace(lower[k], upper[next], upper[k]);
    }
  }
  const top = rings[rings.length - 1];
  for (let k = 0; k < segments; k++) addFace(top[k], top[(k + 1) % segments], apex);
}

function buildMountainGeometry() {
  const random = createSeededRandom(MOUNTAIN_SEED);
  const target = {
    positions: [],
    colors: [],
    color: new THREE.Color(),
    snow: new THREE.Color(PALETTE.MOUNTAIN_SNOW),
    fog: new THREE.Color(PALETTE.FOG),
  };
  const layers = MOUNTAIN_LAYERS.map((layer) => ({ ...layer, rockColor: new THREE.Color(layer.rock) }));
  const peakEnds = [];
  for (let i = 0; i < MOUNTAIN_SLOTS; i++) {
    const layer = layers[i % layers.length];
    const order = Math.floor(i / layers.length);
    const angle = order * GOLDEN_ANGLE + layer.phase + (random() - 0.5) * 0.2;
    const distance = layer.minDistance + random() * (layer.maxDistance - layer.minDistance);
    const baseRadius = layer.minBase + random() * (layer.maxBase - layer.minBase);
    const height = layer.minHeight + random() * (layer.maxHeight - layer.minHeight);
    const centerX = Math.sin(angle) * distance;
    const centerZ = -Math.cos(angle) * distance;
    appendPeak(target, centerX, centerZ, baseRadius, height, layer, random);
    if (random() < 0.65) {
      const side = random() < 0.5 ? -1 : 1;
      const spread = baseRadius * (0.7 + random() * 0.4);
      appendPeak(
        target,
        centerX + Math.cos(angle) * side * spread,
        centerZ + Math.sin(angle) * side * spread,
        baseRadius * 0.7,
        height * (0.55 + random() * 0.25),
        layer,
        random,
      );
    }
    peakEnds.push(target.positions.length / 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(target.positions), 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(target.colors), 3));
  return { geometry, peakEnds };
}

function createFlakeTexture() {
  const size = 32;
  const data = new Uint8Array(size * size * 4);
  const center = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const distance = Math.hypot(x - center, y - center) / (size * 0.5);
      const alpha = Math.pow(clamp(1 - distance, 0, 1), 1.6);
      const offset = (y * size + x) * 4;
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(alpha * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function describeTree(random, sample) {
  const scale = 0.7 + random();
  const minX = Math.max(TREE_MIN_X, TREE_CLEARANCE_X + TREE_CANOPY_RADIUS * scale);
  const magnitude = minX + (TREE_MAX_X - minX) * Math.pow(random(), 1.7);
  sample.localX = random() < 0.5 ? -magnitude : magnitude;
  const heightScale = 0.85 + random() * 0.35;
  sample.scaleX = scale;
  sample.scaleY = scale * heightScale;
  sample.scaleZ = scale;
  sample.yaw = random() * Math.PI * 2;
  sample.tiltX = (random() - 0.5) * 0.08;
  sample.tiltZ = (random() - 0.5) * 0.08;
  sample.sink = 0.3 * scale;
  sample.tintIndex = random() < 0.4 ? 0 : random() < 0.66 ? 1 : 2;
  sample.brightness = 0.88 + random() * 0.18;
}

function describeRock(random, sample) {
  let scale;
  if (random() < 0.35) {
    const magnitude = ROCK_CLUSTER_MIN_X + random() * (ROCK_CLUSTER_MAX_X - ROCK_CLUSTER_MIN_X);
    sample.localX = random() < 0.5 ? -magnitude : magnitude;
    scale = 0.3 + random() * 0.4;
  } else {
    const spread = random();
    const magnitude = ROCK_CLUSTER_MAX_X + (ROCK_FIELD_MAX_X - ROCK_CLUSTER_MAX_X) * spread * spread;
    sample.localX = random() < 0.5 ? -magnitude : magnitude;
    scale = (0.6 + random()) * (1 + spread * 1.6);
  }
  sample.scaleX = scale * (0.8 + random() * 0.5);
  sample.scaleY = scale * (0.55 + random() * 0.5);
  sample.scaleZ = scale * (0.8 + random() * 0.5);
  sample.yaw = random() * Math.PI * 2;
  sample.tiltX = (random() - 0.5) * 0.44;
  sample.tiltZ = (random() - 0.5) * 0.44;
  sample.sink = 0.3 * sample.scaleY;
  sample.tintIndex = random() < 0.5 ? 0 : random() < 0.7 ? 1 : 2;
  sample.brightness = 0.9 + random() * 0.15;
}

function createTints(reference, variants, softness) {
  const base = new THREE.Color(reference);
  return variants.map((hex) => {
    const variant = new THREE.Color(hex);
    return new THREE.Color(
      Math.pow(variant.r / base.r, softness),
      Math.pow(variant.g / base.g, softness),
      Math.pow(variant.b / base.b, softness),
    );
  });
}

class ScatterLayer {
  constructor(mesh, capacity, seed, describe, tints) {
    this.mesh = mesh;
    this.capacity = capacity;
    this.seed = seed;
    this.describe = describe;
    this.tints = tints;
    this.random = createSeededRandom(seed);
    this.count = 0;
    this.windowLength = 1;
    this.spacing = 1;
    this.originZ = 0;

    this.baseZ = new Float64Array(capacity);
    this.offsetZ = new Float32Array(capacity);
    this.localX = new Float32Array(capacity);
    this.scaleX = new Float32Array(capacity);
    this.scaleY = new Float32Array(capacity);
    this.scaleZ = new Float32Array(capacity);
    this.yaw = new Float32Array(capacity);
    this.tiltX = new Float32Array(capacity);
    this.tiltZ = new Float32Array(capacity);
    this.sink = new Float32Array(capacity);

    this.sample = {
      localX: 0,
      scaleX: 1,
      scaleY: 1,
      scaleZ: 1,
      yaw: 0,
      tiltX: 0,
      tiltZ: 0,
      sink: 0,
      tintIndex: 0,
      brightness: 1,
    };
    this.curve = { x: 0, y: 0, dx: 0, dy: 0 };
    this.position = new THREE.Vector3();
    this.quaternion = new THREE.Quaternion();
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.scale = new THREE.Vector3();
    this.matrix = new THREE.Matrix4();
    this.color = new THREE.Color();

    mesh.frustumCulled = false;
    mesh.matrixAutoUpdate = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
    this.matrixTracker = new AttributeUploadTracker(mesh.instanceMatrix, 1);
    this.colorTracker = new AttributeUploadTracker(mesh.instanceColor, 1);
  }

  reseed() {
    this.random = createSeededRandom(this.seed);
  }

  layout(playerZ, count, windowLength, originZ) {
    this.count = clamp(Math.floor(count), 0, this.capacity);
    this.windowLength = windowLength;
    this.spacing = windowLength / Math.max(1, this.count);
    this.setOrigin(originZ);
    this.mesh.count = this.count;
    this.matrixTracker.markFull();
    this.colorTracker.markFull();
    const nearLimit = playerZ + SCATTER_NEAR_MARGIN;
    for (let i = 0; i < this.count; i++) {
      this.baseZ[i] = nearLimit - (i + 0.5) * this.spacing;
      this.respawn(i);
    }
  }

  setOrigin(originZ) {
    this.originZ = originZ;
    this.mesh.position.set(0, 0, originZ);
    this.mesh.updateMatrix();
  }

  rebase(originZ) {
    const delta = originZ - this.originZ;
    this.setOrigin(originZ);
    const matrices = this.mesh.instanceMatrix.array;
    for (let i = 0, o = 14; i < this.count; i++, o += 16) matrices[o] -= delta;
    this.matrixTracker.markFull();
  }

  recycle(playerZ) {
    const nearLimit = playerZ + SCATTER_NEAR_MARGIN;
    const farLimit = nearLimit - this.windowLength;
    for (let i = 0; i < this.count; i++) {
      const base = this.baseZ[i];
      if (base > nearLimit) {
        this.baseZ[i] = base - Math.ceil((base - nearLimit) / this.windowLength) * this.windowLength;
      } else if (base <= farLimit) {
        this.baseZ[i] = base + Math.ceil((farLimit - base + 1e-6) / this.windowLength) * this.windowLength;
      } else {
        continue;
      }
      this.respawn(i);
      this.matrixTracker.markRange(i * 16, 16);
      this.colorTracker.markRange(i * 3, 3);
    }
  }

  respawn(index) {
    const sample = this.sample;
    this.describe(this.random, sample);
    this.offsetZ[index] = (this.random() - 0.5) * SCATTER_JITTER * this.spacing;
    this.localX[index] = sample.localX;
    this.scaleX[index] = sample.scaleX;
    this.scaleY[index] = sample.scaleY;
    this.scaleZ[index] = sample.scaleZ;
    this.yaw[index] = sample.yaw;
    this.tiltX[index] = sample.tiltX;
    this.tiltZ[index] = sample.tiltZ;
    this.sink[index] = sample.sink;
    const tint = this.tints[sample.tintIndex];
    this.color.setRGB(tint.r * sample.brightness, tint.g * sample.brightness, tint.b * sample.brightness);
    this.mesh.setColorAt(index, this.color);
    this.writeInstance(index);
  }

  writeInstance(index) {
    const z = this.baseZ[index] + this.offsetZ[index];
    const localX = this.localX[index];
    const curve = getRoadCurve(z, this.curve);
    this.position.set(
      curve.x + localX,
      sampleTerrainSurfaceY(localX, z) - this.sink[index],
      z - this.originZ,
    );
    this.euler.set(this.tiltX[index], this.yaw[index], this.tiltZ[index]);
    this.quaternion.setFromEuler(this.euler);
    this.scale.set(this.scaleX[index], this.scaleY[index], this.scaleZ[index]);
    this.matrix.compose(this.position, this.quaternion, this.scale);
    this.mesh.setMatrixAt(index, this.matrix);
  }

  dispose() {
    this.mesh.dispose();
  }
}

export class EnvironmentManager {
  constructor(scene) {
    this.scene = scene;
    this.tier = 'HIGH';
    this.config = QUALITY_CONFIG.HIGH;
    this.lastPlayerZ = null;
    this.originZ = 0;
    this.elapsed = 0;
    this.curve = { x: 0, y: 0, dx: 0, dy: 0 };

    this.group = new THREE.Group();
    this.group.name = 'EnvironmentManager';

    this.treeGeometry = buildPineGeometry();
    this.treeMaterial = new THREE.MeshLambertMaterial({
      name: 'AlpinePine',
      color: 0xffffff,
      vertexColors: true,
      flatShading: true,
    });
    const trees = new THREE.InstancedMesh(this.treeGeometry, this.treeMaterial, MAX_TREE_COUNT);
    trees.name = 'AlpinePines';
    trees.castShadow = true;
    this.trees = new ScatterLayer(
      trees,
      MAX_TREE_COUNT,
      TREE_SEED,
      describeTree,
      createTints(PALETTE.PINE_MID, [PALETTE.PINE_DARK, PALETTE.PINE_MID, PALETTE.PINE_LIGHT], 0.45),
    );

    this.rockGeometry = buildBoulderGeometry();
    this.rockMaterial = new THREE.MeshStandardMaterial({
      name: 'AlpineBoulder',
      color: 0xffffff,
      vertexColors: true,
      flatShading: true,
      roughness: 0.92,
      metalness: 0.02,
    });
    const rocks = new THREE.InstancedMesh(this.rockGeometry, this.rockMaterial, MAX_ROCK_COUNT);
    rocks.name = 'AlpineBoulders';
    rocks.castShadow = true;
    rocks.receiveShadow = true;
    this.rocks = new ScatterLayer(
      rocks,
      MAX_ROCK_COUNT,
      ROCK_SEED,
      describeRock,
      createTints(PALETTE.ROCK, [PALETTE.ROCK_DARK, PALETTE.ROCK, PALETTE.MOUNTAIN_FAR], 0.6),
    );

    const mountain = buildMountainGeometry();
    this.mountainGeometry = mountain.geometry;
    this.mountainPeakEnds = mountain.peakEnds;
    this.mountainMaterial = new THREE.MeshBasicMaterial({
      name: 'HorizonMountains',
      vertexColors: true,
      fog: false,
      toneMapped: false,
    });
    this.mountains = new THREE.Mesh(this.mountainGeometry, this.mountainMaterial);
    this.mountains.name = 'HorizonMountains';
    this.mountains.frustumCulled = false;
    this.mountains.matrixAutoUpdate = false;
    this.mountainY = 0;

    this.snowRandom = createSeededRandom(SNOW_SEED);
    this.snowPositions = new Float32Array(SNOW_MAX * 3);
    this.snowFall = new Float32Array(SNOW_MAX);
    this.snowPhase = new Float32Array(SNOW_MAX);
    this.snowGeometry = new THREE.BufferGeometry();
    this.snowAttribute = new THREE.BufferAttribute(this.snowPositions, 3).setUsage(THREE.DynamicDrawUsage);
    this.snowGeometry.setAttribute('position', this.snowAttribute);
    this.flakeTexture = createFlakeTexture();
    this.snowMaterial = new THREE.PointsMaterial({
      name: 'SnowFlurries',
      color: PALETTE.SNOW,
      size: 0.065,
      sizeAttenuation: true,
      map: this.flakeTexture,
      transparent: true,
      opacity: 0.85,
      alphaTest: 0.02,
      depthWrite: false,
    });
    this.snow = new THREE.Points(this.snowGeometry, this.snowMaterial);
    this.snow.name = 'SnowFlurries';
    this.snow.frustumCulled = false;
    this.snow.matrixAutoUpdate = false;
    this.snowCount = 0;
    this.snowAnchorX = 0;
    this.snowAnchorY = 0;
    this.snowAnchorZ = 0;

    this.group.add(this.trees.mesh, this.rocks.mesh, this.mountains, this.snow);
    if (scene) scene.add(this.group);

    this.applyTierSettings('HIGH');
    this.reset();
  }

  update(playerZ, deltaTime = 0) {
    if (!Number.isFinite(playerZ)) return;
    const dt = Number.isFinite(deltaTime) ? clamp(deltaTime, 0, 0.1) : 0;
    this.elapsed += dt;
    const jumped =
      this.lastPlayerZ === null || Math.abs(playerZ - this.lastPlayerZ) > this.trees.windowLength * 0.5;
    if (jumped) {
      this.layoutAll(playerZ);
    } else {
      if (Math.abs(playerZ - this.originZ) > ORIGIN_REBASE_DISTANCE) this.rebase(playerZ);
      this.trees.recycle(playerZ);
      this.rocks.recycle(playerZ);
    }
    const curve = getRoadCurve(playerZ, this.curve);
    this.updateMountains(playerZ, curve, jumped ? 0 : dt, jumped);
    this.updateSnow(playerZ, curve, dt, jumped);
    this.lastPlayerZ = playerZ;
  }

  setQualityTier(tier) {
    const config = QUALITY_CONFIG[tier] ?? QUALITY_CONFIG.HIGH;
    if (config.id === this.tier && this.lastPlayerZ !== null) return;
    this.applyTierSettings(config.id);
    const anchorZ = this.lastPlayerZ ?? PLAYER.START_Z;
    this.layoutAll(anchorZ);
    const curve = getRoadCurve(anchorZ, this.curve);
    this.updateMountains(anchorZ, curve, 0, true);
    this.updateSnow(anchorZ, curve, 0, true);
    this.lastPlayerZ = anchorZ;
  }

  reset() {
    this.trees.reseed();
    this.rocks.reseed();
    this.snowRandom = createSeededRandom(SNOW_SEED);
    this.elapsed = 0;
    this.lastPlayerZ = null;
    this.update(PLAYER.START_Z, 0);
  }

  dispose() {
    if (this.scene) this.scene.remove(this.group);
    this.trees.dispose();
    this.rocks.dispose();
    this.treeGeometry.dispose();
    this.rockGeometry.dispose();
    this.mountainGeometry.dispose();
    this.snowGeometry.dispose();
    this.flakeTexture.dispose();
    this.treeMaterial.dispose();
    this.rockMaterial.dispose();
    this.mountainMaterial.dispose();
    this.snowMaterial.dispose();
  }

  applyTierSettings(tier) {
    this.config = QUALITY_CONFIG[tier] ?? QUALITY_CONFIG.HIGH;
    this.tier = this.config.id;
    const visiblePeaks = clamp(this.config.mountainCount, 0, this.mountainPeakEnds.length);
    const vertexCount = visiblePeaks > 0 ? this.mountainPeakEnds[visiblePeaks - 1] : 0;
    this.mountainGeometry.setDrawRange(0, vertexCount);
    this.mountains.visible = vertexCount > 0;
    this.snowCount = SNOW_COUNTS[this.tier] ?? 0;
    this.snowGeometry.setDrawRange(0, this.snowCount);
    this.snow.visible = this.snowCount > 0;
  }

  layoutAll(playerZ) {
    const windowLength = this.config.drawDistance + SCATTER_NEAR_MARGIN + SCATTER_FAR_MARGIN;
    this.originZ = Math.round(playerZ);
    this.trees.layout(playerZ, this.config.treeCount, windowLength, this.originZ);
    this.rocks.layout(playerZ, this.config.rockCount, windowLength, this.originZ);
  }

  rebase(playerZ) {
    this.originZ = Math.round(playerZ);
    this.trees.rebase(this.originZ);
    this.rocks.rebase(this.originZ);
  }

  updateMountains(playerZ, curve, dt, snap) {
    const targetY = curve.y - MOUNTAIN_DROP;
    this.mountainY = snap ? targetY : damp(this.mountainY, targetY, MOUNTAIN_HEIGHT_LAMBDA, dt);
    this.mountains.position.set(curve.x * MOUNTAIN_FOLLOW_X, this.mountainY, playerZ);
    this.mountains.updateMatrix();
  }

  updateSnow(playerZ, curve, dt, snap) {
    this.snow.position.set(curve.x, curve.y, playerZ);
    this.snow.updateMatrix();
    if (this.snowCount === 0) {
      this.snowAnchorX = curve.x;
      this.snowAnchorY = curve.y;
      this.snowAnchorZ = playerZ;
      return;
    }
    const moveX = curve.x - this.snowAnchorX;
    const moveY = curve.y - this.snowAnchorY;
    const moveZ = playerZ - this.snowAnchorZ;
    this.snowAnchorX = curve.x;
    this.snowAnchorY = curve.y;
    this.snowAnchorZ = playerZ;
    if (snap || Math.abs(moveZ) > SNOW_DEPTH) {
      this.scatterSnow();
      return;
    }
    const random = this.snowRandom;
    const positions = this.snowPositions;
    const wind = SNOW_WIND + SNOW_GUST * Math.sin(this.elapsed * 0.37);
    const time = this.elapsed;
    for (let i = 0, o = 0; i < this.snowCount; i++, o += 3) {
      let x = positions[o] - moveX + (wind + Math.sin(time * 1.7 + this.snowPhase[i]) * SNOW_SWAY) * dt;
      let y = positions[o + 1] - moveY - this.snowFall[i] * dt;
      let z = positions[o + 2] - moveZ + Math.cos(time * 1.3 + this.snowPhase[i]) * SNOW_SWAY * 0.5 * dt;
      if (z >= SNOW_MAX_Z || z < SNOW_MIN_Z) {
        z = wrapInto(z, SNOW_MIN_Z, SNOW_DEPTH);
        x = SNOW_MIN_X + random() * SNOW_WIDTH;
        y = SNOW_MIN_Y + random() * SNOW_HEIGHT;
      }
      positions[o] = wrapInto(x, SNOW_MIN_X, SNOW_WIDTH);
      positions[o + 1] = wrapInto(y, SNOW_MIN_Y, SNOW_HEIGHT);
      positions[o + 2] = z;
    }
    this.snowAttribute.needsUpdate = true;
  }

  scatterSnow() {
    const random = this.snowRandom;
    const positions = this.snowPositions;
    for (let i = 0, o = 0; i < SNOW_MAX; i++, o += 3) {
      positions[o] = SNOW_MIN_X + random() * SNOW_WIDTH;
      positions[o + 1] = SNOW_MIN_Y + random() * SNOW_HEIGHT;
      positions[o + 2] = SNOW_MIN_Z + random() * SNOW_DEPTH;
      this.snowFall[i] = 0.8 + random() * 1.0;
      this.snowPhase[i] = random() * Math.PI * 2;
    }
    this.snowAttribute.needsUpdate = true;
  }
}
