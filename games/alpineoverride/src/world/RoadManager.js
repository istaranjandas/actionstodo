import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {
  ROAD,
  PALETTE,
  PLAYER,
  QUALITY_CONFIG,
  getRoadCurve,
  getTerrainHeight,
  clamp,
  smoothstep,
} from '../config/constants.js';

const SEGMENT_LENGTH = ROAD.SEGMENT_LENGTH;
const ROW_COUNT = ROAD.SEGMENTS_BEHIND + ROAD.VISIBLE_SEGMENTS + 1;
const SLOT_COUNT = ROW_COUNT * 2;
const BLOCK_COUNT = SLOT_COUNT - 1;
const ORIGIN_REBASE_DISTANCE = 2048;

const MARKING_LIFT = 0.015;
const SHOULDER_BLEND = 0.06;
const EDGE_LINE_CENTER = 7.85;
const LINE_HALF_WIDTH = ROAD.LINE_WIDTH * 0.5;
const CENTER_INNER = ROAD.CENTER_LINE_GAP * 0.5;
const CENTER_OUTER = CENTER_INNER + ROAD.LINE_WIDTH;
const DIVIDER_X = ROAD.LANE_WIDTH;
const MAX_DASH_PIECES = 2;
const DASH_EPSILON = 1e-4;
const HIDDEN_DEPTH = 0.6;

const WHEEL_TRACK_OFFSET = 0.8;
const WHEEL_TRACK_SPREAD = 0.32;
const LANE_COLUMN_OFFSETS = Object.freeze([0, 0.7, 1.2, 1.7, 2.0, 2.3, 2.8, 3.3]);
const REDUCED_LANE_OFFSETS = Object.freeze([0, 1.2, 2.0, 2.8]);

const KERB_PROFILE = Object.freeze([
  [ROAD.HALF_WIDTH - 0.02, -0.02],
  [ROAD.HALF_WIDTH + 0.04, 0.13],
  [ROAD.HALF_WIDTH + 0.27, 0.13],
  [ROAD.HALF_WIDTH + 0.36, -0.32],
]);

const RAIL_PROFILE = Object.freeze(
  [
    [0, 0.46],
    [-0.08, 0.5],
    [-0.08, 0.55],
    [-0.02, 0.6],
    [-0.08, 0.65],
    [-0.08, 0.7],
    [0, 0.74],
    [0.02, 0.74],
    [0.02, 0.46],
  ].map(([offset, y]) => [ROAD.BARRIER_X + offset, y]),
);

const TERRAIN_OFFSETS = Object.freeze([
  9.25, 10.2, 11, 12.2, 13.8, 16, 19, 23, 28, 34, 41, 49, 58, 68, 80, 94, 110, 128, 148, ROAD.TERRAIN_HALF_WIDTH,
]);
const TERRAIN_SIDE_COLUMNS = TERRAIN_OFFSETS.length;
const TERRAIN_COLUMN_XS = Float32Array.from(
  [...TERRAIN_OFFSETS].reverse().map((offset) => -offset).concat(TERRAIN_OFFSETS),
);

const REFLECTOR_AMBER_GAIN = 2.4;
const REFLECTOR_RED_GAIN = 2.2;
const REFLECTOR_ROW_INTERVAL = 3;
const POST_CAP_SHADE = 0.35;

const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

function hash2(a, b) {
  const s = Math.sin(a * 127.1 + b * 311.7) * 43758.5453123;
  return s - Math.floor(s);
}

const terrainSampleCurveA = { x: 0, y: 0, dx: 0, dy: 0 };
const terrainSampleCurveB = { x: 0, y: 0, dx: 0, dy: 0 };

export function sampleTerrainSurfaceY(localX, z) {
  const isRight = localX >= 0;
  const first = isRight ? TERRAIN_SIDE_COLUMNS : 0;
  const last = first + TERRAIN_SIDE_COLUMNS - 1;
  const x = clamp(localX, TERRAIN_COLUMN_XS[first], TERRAIN_COLUMN_XS[last]);
  let column = first;
  while (column < last - 1 && TERRAIN_COLUMN_XS[column + 1] < x) column++;
  const x0 = TERRAIN_COLUMN_XS[column];
  const x1 = TERRAIN_COLUMN_XS[column + 1];
  const s = clamp((x - x0) / (x1 - x0), 0, 1);
  const row = Math.floor(z / SEGMENT_LENGTH);
  const z0 = row * SEGMENT_LENGTH;
  const z1 = z0 + SEGMENT_LENGTH;
  const t = clamp((z - z0) / SEGMENT_LENGTH, 0, 1);
  const curveA = getRoadCurve(z0, terrainSampleCurveA);
  const curveB = getRoadCurve(z1, terrainSampleCurveB);
  const heightA = curveA.y + getTerrainHeight(x0, z0);
  const heightB = curveA.y + getTerrainHeight(x1, z0);
  const heightC = curveB.y + getTerrainHeight(x0, z1);
  const heightD = curveB.y + getTerrainHeight(x1, z1);
  if (s >= t) return heightA + s * (heightB - heightA) + t * (heightD - heightB);
  return heightA + t * (heightC - heightA) + s * (heightD - heightC);
}

function writeYawMatrix(array, offset, cos, sin, x, y, z) {
  array[offset] = cos;
  array[offset + 1] = 0;
  array[offset + 2] = -sin;
  array[offset + 3] = 0;
  array[offset + 4] = 0;
  array[offset + 5] = 1;
  array[offset + 6] = 0;
  array[offset + 7] = 0;
  array[offset + 8] = sin;
  array[offset + 9] = 0;
  array[offset + 10] = cos;
  array[offset + 11] = 0;
  array[offset + 12] = x;
  array[offset + 13] = y;
  array[offset + 14] = z;
  array[offset + 15] = 1;
}

function pushStripQuad(pattern, a, b, vertsPerRow, flipped) {
  const c = a + vertsPerRow;
  const d = b + vertsPerRow;
  if (flipped) pattern.push(a, b, d, a, d, c);
  else pattern.push(a, d, b, a, c, d);
}

function pushRowQuad(pattern, base) {
  pattern.push(base, base + 3, base + 1, base, base + 2, base + 3);
}

export class AttributeUploadTracker {
  constructor(attribute, bandCount = 1) {
    this.attribute = attribute;
    this.bandSize = Math.max(1, Math.ceil(attribute.array.length / bandCount));
    this.ranges = [];
    this.active = [];
    for (let band = 0; band < bandCount; band++) {
      this.ranges.push({ start: 0, count: 0 });
      this.active.push(false);
    }
    this.fullPending = true;
    attribute.setUsage(THREE.DynamicDrawUsage);
    attribute.onUpload(() => this.handleUpload());
  }

  markFull() {
    this.attribute.clearUpdateRanges();
    for (let band = 0; band < this.active.length; band++) this.active[band] = false;
    this.fullPending = true;
    this.attribute.needsUpdate = true;
  }

  markRange(start, count) {
    this.attribute.needsUpdate = true;
    if (this.fullPending) return;
    const band = Math.min(this.ranges.length - 1, Math.floor(start / this.bandSize));
    const range = this.ranges[band];
    if (!this.active[band]) {
      range.start = start;
      range.count = count;
      this.active[band] = true;
      this.attribute.updateRanges.push(range);
      return;
    }
    const end = Math.max(range.start + range.count, start + count);
    if (start < range.start) range.start = start;
    range.count = end - range.start;
  }

  handleUpload() {
    this.attribute.clearUpdateRanges();
    for (let band = 0; band < this.active.length; band++) this.active[band] = false;
    this.fullPending = false;
  }
}

class RingRibbon {
  constructor(name, vertsPerRow, material, { normals = 'dynamic', colors = false } = {}) {
    this.vertsPerRow = vertsPerRow;
    this.rowStride = vertsPerRow * 3;
    this.geometry = new THREE.BufferGeometry();
    this.channels = [];
    this.rowPositions = this.addChannel('position');
    this.rowNormals = normals === 'dynamic' ? this.addChannel('normal') : null;
    this.rowColors = colors ? this.addChannel('color') : null;
    if (normals === 'static') {
      this.geometry.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(SLOT_COUNT * this.rowStride), 3));
    }
    this.patternLength = 0;
    this.mesh = new THREE.Mesh(this.geometry, material);
    this.mesh.name = name;
    this.mesh.frustumCulled = false;
    this.mesh.matrixAutoUpdate = false;
  }

  addChannel(attributeName) {
    const attribute = new THREE.BufferAttribute(new Float32Array(SLOT_COUNT * this.rowStride), 3);
    this.geometry.setAttribute(attributeName, attribute);
    const scratch = new Float32Array(this.rowStride);
    this.channels.push({ attribute, scratch, tracker: new AttributeUploadTracker(attribute, 2) });
    return scratch;
  }

  fillStaticNormals(rowNormals) {
    const attribute = this.geometry.getAttribute('normal');
    for (let slot = 0; slot < SLOT_COUNT; slot++) attribute.array.set(rowNormals, slot * this.rowStride);
    attribute.needsUpdate = true;
  }

  createIndex(pattern) {
    const vertexCount = SLOT_COUNT * this.vertsPerRow;
    const ArrayType = vertexCount > 65535 ? Uint32Array : Uint16Array;
    const array = new ArrayType(BLOCK_COUNT * pattern.length);
    let cursor = 0;
    for (let slot = 0; slot < BLOCK_COUNT; slot++) {
      const base = slot * this.vertsPerRow;
      for (let k = 0; k < pattern.length; k++) array[cursor++] = base + pattern[k];
    }
    return { attribute: new THREE.BufferAttribute(array, 1), patternLength: pattern.length };
  }

  useIndex(index) {
    if (this.geometry.index === index.attribute) return;
    this.geometry.setIndex(index.attribute);
    this.patternLength = index.patternLength;
  }

  setVisibleRows(farRow) {
    const firstSlot = positiveModulo(farRow, ROW_COUNT);
    this.geometry.setDrawRange(firstSlot * this.patternLength, (ROW_COUNT - 1) * this.patternLength);
  }

  commitRow(row) {
    const lower = positiveModulo(row, ROW_COUNT) * this.rowStride;
    const upper = lower + ROW_COUNT * this.rowStride;
    for (let i = 0; i < this.channels.length; i++) {
      const channel = this.channels[i];
      channel.attribute.array.set(channel.scratch, lower);
      channel.attribute.array.set(channel.scratch, upper);
      channel.tracker.markRange(lower, this.rowStride);
      channel.tracker.markRange(upper, this.rowStride);
    }
  }

  markFullUpload() {
    for (let i = 0; i < this.channels.length; i++) this.channels[i].tracker.markFull();
  }

  dispose() {
    this.geometry.dispose();
  }
}

function createSurfaceLayout() {
  const columns = [];
  const add = (x, isShoulder, keepReduced) => columns.push({ x, isShoulder, keepReduced });
  const shoulderMid = (ROAD.LANES_HALF_WIDTH + ROAD.HALF_WIDTH) * 0.5;
  add(-ROAD.HALF_WIDTH, true, true);
  add(-shoulderMid, true, true);
  add(-ROAD.LANES_HALF_WIDTH - SHOULDER_BLEND, true, true);
  for (let lane = 0; lane < ROAD.LANE_COUNT; lane++) {
    const laneStart = -ROAD.LANES_HALF_WIDTH + lane * ROAD.LANE_WIDTH;
    for (const offset of LANE_COLUMN_OFFSETS) {
      add(laneStart + offset, false, REDUCED_LANE_OFFSETS.includes(offset));
    }
  }
  add(ROAD.LANES_HALF_WIDTH, false, true);
  add(ROAD.LANES_HALF_WIDTH + SHOULDER_BLEND, true, true);
  add(shoulderMid, true, true);
  add(ROAD.HALF_WIDTH, true, true);

  const count = columns.length;
  const xs = new Float32Array(count);
  const shoulder = new Uint8Array(count);
  const wear = new Float32Array(count);
  const fullPattern = [];
  const reducedPattern = [];
  let previousReduced = -1;
  for (let i = 0; i < count; i++) {
    const column = columns[i];
    xs[i] = column.x;
    shoulder[i] = column.isShoulder ? 1 : 0;
    if (!column.isShoulder) {
      const lanePosition = column.x + ROAD.LANES_HALF_WIDTH;
      const laneOffset = lanePosition - Math.floor(lanePosition / ROAD.LANE_WIDTH) * ROAD.LANE_WIDTH;
      const fromCentre = Math.abs(laneOffset - ROAD.LANE_WIDTH * 0.5);
      const trackDistance = (fromCentre - WHEEL_TRACK_OFFSET) / WHEEL_TRACK_SPREAD;
      const track = Math.exp(-trackDistance * trackDistance);
      const oilDistance = fromCentre / 0.35;
      const oil = Math.exp(-oilDistance * oilDistance);
      wear[i] = track * 0.18 + oil * 0.07;
    }
    if (i > 0) pushStripQuad(fullPattern, i - 1, i, count, false);
    if (column.keepReduced) {
      if (previousReduced >= 0) pushStripQuad(reducedPattern, previousReduced, i, count, false);
      previousReduced = i;
    }
  }
  return { count, xs, shoulder, wear, fullPattern, reducedPattern };
}

function createProfileLayout(rightPoints, closed) {
  const pointCount = rightPoints.length;
  const count = pointCount * 2;
  const xs = new Float32Array(count);
  const ys = new Float32Array(count);
  const normals = new Float32Array(count * 3);
  const segmentNormal = (from, to) => {
    const tx = to[0] - from[0];
    const ty = to[1] - from[1];
    const length = Math.hypot(tx, ty) || 1;
    return [-ty / length, tx / length];
  };
  for (let i = 0; i < pointCount; i++) {
    let nx = 0;
    let ny = 0;
    if (i > 0 || closed) {
      const [px, py] = segmentNormal(rightPoints[(i - 1 + pointCount) % pointCount], rightPoints[i]);
      nx += px;
      ny += py;
    }
    if (i < pointCount - 1 || closed) {
      const [px, py] = segmentNormal(rightPoints[i], rightPoints[(i + 1) % pointCount]);
      nx += px;
      ny += py;
    }
    const length = Math.hypot(nx, ny) || 1;
    nx /= length;
    ny /= length;
    const [x, y] = rightPoints[i];
    xs[i] = -x;
    ys[i] = y;
    normals[i * 3] = -nx;
    normals[i * 3 + 1] = ny;
    xs[pointCount + i] = x;
    ys[pointCount + i] = y;
    normals[(pointCount + i) * 3] = nx;
    normals[(pointCount + i) * 3 + 1] = ny;
  }
  const pattern = [];
  const segmentCount = closed ? pointCount : pointCount - 1;
  for (let j = 0; j < segmentCount; j++) {
    const next = (j + 1) % pointCount;
    pushStripQuad(pattern, j, next, count, true);
    pushStripQuad(pattern, pointCount + j, pointCount + next, count, false);
  }
  return { count, xs, ys, normals, pattern };
}

function createTerrainLayout() {
  const sideCount = TERRAIN_SIDE_COLUMNS;
  const count = sideCount * 2;
  const xs = TERRAIN_COLUMN_XS;
  const lower = new Uint8Array(count);
  const upper = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const sideStart = i < sideCount ? 0 : sideCount;
    lower[i] = i === sideStart ? i : i - 1;
    upper[i] = i === sideStart + sideCount - 1 ? i : i + 1;
  }
  const pattern = [];
  for (let i = 0; i < sideCount - 1; i++) {
    pushStripQuad(pattern, i, i + 1, count, false);
    pushStripQuad(pattern, sideCount + i, sideCount + i + 1, count, false);
  }
  return { count, xs, lower, upper, pattern };
}

function createLinePattern(vertsPerRow) {
  const pattern = [];
  pushStripQuad(pattern, 0, 1, vertsPerRow, false);
  pushStripQuad(pattern, 2, 3, vertsPerRow, false);
  return pattern;
}

function createWhitePattern(vertsPerRow) {
  const pattern = createLinePattern(vertsPerRow);
  for (let piece = 0; piece < MAX_DASH_PIECES * 2; piece++) pushRowQuad(pattern, 4 + piece * 4);
  return pattern;
}

function createPostGeometry() {
  const post = new THREE.BoxGeometry(0.12, 1.3, 0.1);
  post.translate(0.18, 0.15, 0);
  const spacer = new THREE.BoxGeometry(0.1, 0.3, 0.12);
  spacer.translate(0.07, 0.6, 0);
  const parts = [post, spacer];
  for (const part of parts) part.deleteAttribute('uv');
  const merged = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return merged;
}

function createReflectorGeometry() {
  const reflector = new THREE.BoxGeometry(0.09, 0.12, 0.05);
  reflector.translate(0.18, 0.86, 0);
  reflector.deleteAttribute('uv');
  return reflector;
}

function createRoadMaterials() {
  const markingOffset = { polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 };
  return {
    asphalt: new THREE.MeshStandardMaterial({
      name: 'RoadAsphalt',
      color: PALETTE.ASPHALT,
      roughness: 0.25,
      metalness: 0.15,
      vertexColors: true,
    }),
    amber: new THREE.MeshStandardMaterial({
      name: 'RoadCenterAmber',
      color: PALETTE.CENTER_AMBER,
      emissive: PALETTE.CENTER_AMBER,
      emissiveIntensity: 0.32,
      roughness: 0.45,
      metalness: 0,
      vertexColors: true,
      ...markingOffset,
    }),
    white: new THREE.MeshStandardMaterial({
      name: 'RoadLaneWhite',
      color: PALETTE.LANE_WHITE,
      emissive: PALETTE.LANE_WHITE,
      emissiveIntensity: 0.07,
      roughness: 0.42,
      metalness: 0,
      vertexColors: true,
      ...markingOffset,
    }),
    kerb: new THREE.MeshStandardMaterial({
      name: 'RoadKerb',
      color: PALETTE.CURB,
      roughness: 0.82,
      metalness: 0,
      flatShading: true,
    }),
    rail: new THREE.MeshStandardMaterial({
      name: 'RoadGuardrail',
      color: PALETTE.GUARDRAIL,
      roughness: 0.34,
      metalness: 0.72,
      flatShading: true,
    }),
    post: new THREE.MeshStandardMaterial({
      name: 'RoadGuardrailPost',
      color: PALETTE.GUARDRAIL_POST,
      roughness: 0.6,
      metalness: 0.45,
      flatShading: true,
    }),
    reflector: new THREE.MeshBasicMaterial({ name: 'RoadDelineator', color: 0xffffff }),
    terrain: new THREE.MeshLambertMaterial({
      name: 'RoadsideTerrain',
      color: 0xffffff,
      vertexColors: true,
      flatShading: true,
    }),
  };
}

export class RoadManager {
  constructor(scene) {
    this.scene = scene;
    this.tier = 'HIGH';
    this.nearRow = null;
    this.farRow = 0;
    this.originZ = 0;
    this.curve = { x: 0, y: 0, dx: 0, dy: 0 };
    this.nextCurve = { x: 0, y: 0, dx: 0, dy: 0 };
    this.scratchColor = new THREE.Color();

    const asphalt = new THREE.Color(PALETTE.ASPHALT);
    const shoulder = new THREE.Color(PALETTE.SHOULDER);
    this.shoulderTint = new THREE.Color(shoulder.r / asphalt.r, shoulder.g / asphalt.g, shoulder.b / asphalt.b);
    this.groundColor = new THREE.Color(PALETTE.GROUND);
    this.groundDarkColor = new THREE.Color(PALETTE.GROUND_DARK);
    this.gravelColor = new THREE.Color(PALETTE.CURB).lerp(new THREE.Color(PALETTE.GROUND_DARK), 0.45);
    this.snowColor = new THREE.Color(PALETTE.SNOW);

    this.surfaceLayout = createSurfaceLayout();
    this.kerbLayout = createProfileLayout(KERB_PROFILE, false);
    this.railLayout = createProfileLayout(RAIL_PROFILE, true);
    this.terrainLayout = createTerrainLayout();
    this.terrainHeights = new Float64Array(this.terrainLayout.count);

    this.materials = createRoadMaterials();
    this.group = new THREE.Group();
    this.group.name = 'RoadManager';
    this.group.matrixAutoUpdate = false;

    this.surface = new RingRibbon('RoadSurface', this.surfaceLayout.count, this.materials.asphalt, { colors: true });
    this.surfaceIndices = {
      full: this.surface.createIndex(this.surfaceLayout.fullPattern),
      reduced: this.surface.createIndex(this.surfaceLayout.reducedPattern),
    };
    this.surface.useIndex(this.surfaceIndices.full);
    this.surface.mesh.receiveShadow = true;

    this.centerLine = new RingRibbon('RoadCenterLine', 4, this.materials.amber, { colors: true });
    this.centerLine.useIndex(this.centerLine.createIndex(createLinePattern(4)));
    this.centerLine.mesh.receiveShadow = true;

    const whiteVerts = 4 + MAX_DASH_PIECES * 2 * 4;
    this.laneLines = new RingRibbon('RoadLaneLines', whiteVerts, this.materials.white, { colors: true });
    this.laneLines.useIndex(this.laneLines.createIndex(createWhitePattern(whiteVerts)));
    this.laneLines.mesh.receiveShadow = true;

    this.kerb = new RingRibbon('RoadKerb', this.kerbLayout.count, this.materials.kerb, { normals: 'static' });
    this.kerb.useIndex(this.kerb.createIndex(this.kerbLayout.pattern));
    this.kerb.fillStaticNormals(this.kerbLayout.normals);
    this.kerb.mesh.receiveShadow = true;

    this.rail = new RingRibbon('RoadGuardrail', this.railLayout.count, this.materials.rail, { normals: 'static' });
    this.rail.useIndex(this.rail.createIndex(this.railLayout.pattern));
    this.rail.fillStaticNormals(this.railLayout.normals);
    this.rail.mesh.castShadow = true;
    this.rail.mesh.receiveShadow = true;

    this.terrain = new RingRibbon('RoadsideTerrain', this.terrainLayout.count, this.materials.terrain, { colors: true });
    this.terrain.useIndex(this.terrain.createIndex(this.terrainLayout.pattern));
    this.terrain.mesh.receiveShadow = true;

    this.ribbons = [this.terrain, this.surface, this.kerb, this.centerLine, this.laneLines, this.rail];

    this.postGeometry = createPostGeometry();
    this.reflectorGeometry = createReflectorGeometry();
    const postCount = ROW_COUNT * 2;
    this.posts = new THREE.InstancedMesh(this.postGeometry, this.materials.post, postCount);
    this.posts.name = 'RoadGuardrailPosts';
    this.posts.frustumCulled = false;
    this.posts.matrixAutoUpdate = false;
    this.posts.castShadow = true;
    this.postMatrices = this.posts.instanceMatrix;
    this.postTracker = new AttributeUploadTracker(this.postMatrices, 1);

    this.reflectors = new THREE.InstancedMesh(this.reflectorGeometry, this.materials.reflector, postCount);
    this.reflectors.name = 'RoadDelineators';
    this.reflectors.frustumCulled = false;
    this.reflectors.matrixAutoUpdate = false;
    this.reflectors.instanceMatrix = this.postMatrices;
    this.reflectorAmber = new THREE.Color(PALETTE.CENTER_AMBER).multiplyScalar(REFLECTOR_AMBER_GAIN);
    this.reflectorRed = new THREE.Color(PALETTE.TAILLIGHT).multiplyScalar(REFLECTOR_RED_GAIN);
    this.postCapColor = new THREE.Color(PALETTE.GUARDRAIL_POST).multiplyScalar(POST_CAP_SHADE);
    this.reflectorColors = new THREE.InstancedBufferAttribute(new Float32Array(postCount * 3), 3);
    this.reflectors.instanceColor = this.reflectorColors;
    this.reflectorTracker = new AttributeUploadTracker(this.reflectorColors, 1);

    for (const ribbon of this.ribbons) this.group.add(ribbon.mesh);
    this.group.add(this.posts, this.reflectors);
    if (scene) scene.add(this.group);

    this.setQualityTier(this.tier);
    this.reset();
  }

  update(playerZ, deltaTime = 0) {
    if (!Number.isFinite(playerZ)) return;
    const nearRow = Math.floor(playerZ / SEGMENT_LENGTH) + ROAD.SEGMENTS_BEHIND;
    if (nearRow === this.nearRow) return;
    const farRow = nearRow - (ROW_COUNT - 1);
    if (this.nearRow === null || Math.abs(nearRow - this.nearRow) >= ROW_COUNT) {
      this.rebuild(nearRow);
      return;
    }
    if (Math.abs(nearRow * SEGMENT_LENGTH - this.originZ) > ORIGIN_REBASE_DISTANCE) {
      this.shiftOrigin(nearRow * SEGMENT_LENGTH);
    }
    if (nearRow < this.nearRow) {
      for (let row = this.farRow - 1; row >= farRow; row--) this.writeRow(row);
    } else {
      for (let row = this.nearRow + 1; row <= nearRow; row++) this.writeRow(row);
    }
    this.nearRow = nearRow;
    this.farRow = farRow;
    this.applyDrawRanges();
  }

  setQualityTier(tier) {
    const config = QUALITY_CONFIG[tier] ?? QUALITY_CONFIG.HIGH;
    this.tier = config.id;
    this.surface.useIndex(this.tier === 'LOW' ? this.surfaceIndices.reduced : this.surfaceIndices.full);
    if (this.nearRow !== null) this.applyDrawRanges();
  }

  reset() {
    this.nearRow = null;
    this.update(PLAYER.START_Z, 0);
  }

  dispose() {
    if (this.scene) this.scene.remove(this.group);
    for (const ribbon of this.ribbons) ribbon.dispose();
    this.postGeometry.dispose();
    this.reflectorGeometry.dispose();
    this.posts.dispose();
    this.reflectors.dispose();
    for (const material of Object.values(this.materials)) material.dispose();
  }

  rebuild(nearRow) {
    this.originZ = nearRow * SEGMENT_LENGTH;
    this.group.position.set(0, 0, this.originZ);
    this.group.updateMatrix();
    this.nearRow = nearRow;
    this.farRow = nearRow - (ROW_COUNT - 1);
    for (const ribbon of this.ribbons) ribbon.markFullUpload();
    this.postTracker.markFull();
    this.reflectorTracker.markFull();
    for (let row = this.farRow; row <= this.nearRow; row++) this.writeRow(row);
    this.applyDrawRanges();
  }

  shiftOrigin(originZ) {
    const delta = originZ - this.originZ;
    this.originZ = originZ;
    this.group.position.set(0, 0, originZ);
    this.group.updateMatrix();
    for (let r = 0; r < this.ribbons.length; r++) {
      const ribbon = this.ribbons[r];
      const channel = ribbon.channels[0];
      const array = channel.attribute.array;
      for (let i = 2; i < array.length; i += 3) array[i] -= delta;
      channel.tracker.markFull();
    }
    const matrices = this.postMatrices.array;
    for (let i = 14; i < matrices.length; i += 16) matrices[i] -= delta;
    this.postTracker.markFull();
  }

  applyDrawRanges() {
    for (let i = 0; i < this.ribbons.length; i++) this.ribbons[i].setVisibleRows(this.farRow);
  }

  writeRow(row) {
    const z = row * SEGMENT_LENGTH;
    const curve = getRoadCurve(z, this.curve);
    const next = getRoadCurve(z + SEGMENT_LENGTH, this.nextCurve);
    const zRel = z - this.originZ;
    this.writeSurfaceRow(row, z, zRel, curve);
    this.writeCenterRow(row, zRel, curve);
    this.writeLaneLineRow(row, z, zRel, curve, next);
    this.writeProfileRow(this.kerb, this.kerbLayout, row, zRel, curve);
    this.writeProfileRow(this.rail, this.railLayout, row, zRel, curve);
    this.writeTerrainRow(row, z, zRel, curve);
    this.writePostRow(row, zRel, curve);
  }

  writeSurfaceRow(row, z, zRel, curve) {
    const layout = this.surfaceLayout;
    const ribbon = this.surface;
    const positions = ribbon.rowPositions;
    const normals = ribbon.rowNormals;
    const colors = ribbon.rowColors;
    const normalScale = 1 / Math.sqrt(1 + curve.dy * curve.dy);
    const normalZ = -curve.dy * normalScale;
    const tint = this.shoulderTint;
    const patchWave = Math.sin(z * 0.0041 + 1.9);
    for (let i = 0, o = 0; i < layout.count; i++, o += 3) {
      const x = layout.xs[i];
      positions[o] = curve.x + x;
      positions[o + 1] = curve.y;
      positions[o + 2] = zRel;
      normals[o] = 0;
      normals[o + 1] = normalScale;
      normals[o + 2] = normalZ;
      const dampWave =
        Math.sin(z * 0.019 + Math.sin(z * 0.0053) * 2.6 + x * 0.31) * Math.cos(x * 0.17 - z * 0.011 + 0.8);
      const damp = smoothstep(0.3, 0.85, dampWave);
      const grain = hash2(row, i) - 0.5;
      if (layout.shoulder[i] === 1) {
        const shade = (1 + grain * 0.16) * (1 - damp * 0.2);
        colors[o] = tint.r * shade;
        colors[o + 1] = tint.g * shade;
        colors[o + 2] = tint.b * shade;
      } else {
        const patch = smoothstep(0.55, 0.92, patchWave * Math.sin(z * 0.0127 + x * 0.05 + 0.4));
        const shade = clamp(1 - layout.wear[i] - damp * 0.26 + patch * 0.2 + grain * 0.08, 0.45, 1.3);
        colors[o] = shade;
        colors[o + 1] = shade;
        colors[o + 2] = shade * (1 + damp * 0.12);
      }
    }
    ribbon.commitRow(row);
  }

  writeCenterRow(row, zRel, curve) {
    const ribbon = this.centerLine;
    const positions = ribbon.rowPositions;
    const normals = ribbon.rowNormals;
    const colors = ribbon.rowColors;
    const normalScale = 1 / Math.sqrt(1 + curve.dy * curve.dy);
    const normalZ = -curve.dy * normalScale;
    const y = curve.y + MARKING_LIFT;
    for (let i = 0, o = 0; i < 4; i++, o += 3) {
      const x = i === 0 ? -CENTER_OUTER : i === 1 ? -CENTER_INNER : i === 2 ? CENTER_INNER : CENTER_OUTER;
      positions[o] = curve.x + x;
      positions[o + 1] = y;
      positions[o + 2] = zRel;
      normals[o] = 0;
      normals[o + 1] = normalScale;
      normals[o + 2] = normalZ;
      const wear = 0.8 + 0.2 * hash2(row, i + 61);
      colors[o] = wear;
      colors[o + 1] = wear;
      colors[o + 2] = wear;
    }
    ribbon.commitRow(row);
  }

  writeLaneLineRow(row, z, zRel, curve, next) {
    const ribbon = this.laneLines;
    const positions = ribbon.rowPositions;
    const normals = ribbon.rowNormals;
    const colors = ribbon.rowColors;
    const normalScale = 1 / Math.sqrt(1 + curve.dy * curve.dy);
    const normalZ = -curve.dy * normalScale;
    for (let i = 0; i < ribbon.vertsPerRow * 3; i += 3) {
      normals[i] = 0;
      normals[i + 1] = normalScale;
      normals[i + 2] = normalZ;
    }

    const y = curve.y + MARKING_LIFT;
    for (let i = 0, o = 0; i < 4; i++, o += 3) {
      const x =
        i === 0
          ? -EDGE_LINE_CENTER - LINE_HALF_WIDTH
          : i === 1
            ? -EDGE_LINE_CENTER + LINE_HALF_WIDTH
            : i === 2
              ? EDGE_LINE_CENTER - LINE_HALF_WIDTH
              : EDGE_LINE_CENTER + LINE_HALF_WIDTH;
      positions[o] = curve.x + x;
      positions[o + 1] = y;
      positions[o + 2] = zRel;
      const wear = 0.78 + 0.22 * hash2(row, i + 17);
      colors[o] = wear;
      colors[o + 1] = wear;
      colors[o + 2] = wear;
    }

    const segmentEnd = z + SEGMENT_LENGTH;
    const firstDash = Math.ceil((z - ROAD.DASH_LENGTH) / ROAD.DASH_PERIOD);
    const lastDash = Math.floor(segmentEnd / ROAD.DASH_PERIOD);
    let piece = 0;
    for (let dash = firstDash; dash <= lastDash && piece < MAX_DASH_PIECES; dash++) {
      const dashStart = dash * ROAD.DASH_PERIOD;
      const start = Math.max(z, dashStart);
      const end = Math.min(segmentEnd, dashStart + ROAD.DASH_LENGTH);
      if (end - start <= DASH_EPSILON) continue;
      const wear = 0.74 + 0.26 * hash2(dash, 7);
      this.writeDashPiece(piece * 2, -DIVIDER_X, start - z, end - z, zRel, curve, next, wear);
      this.writeDashPiece(piece * 2 + 1, DIVIDER_X, start - z, end - z, zRel, curve, next, wear);
      piece++;
    }
    for (; piece < MAX_DASH_PIECES; piece++) {
      this.hideDashPiece(piece * 2, zRel, curve);
      this.hideDashPiece(piece * 2 + 1, zRel, curve);
    }
    ribbon.commitRow(row);
  }

  writeDashPiece(slot, centerX, startOffset, endOffset, zRel, curve, next, wear) {
    const positions = this.laneLines.rowPositions;
    const colors = this.laneLines.rowColors;
    const startT = startOffset / SEGMENT_LENGTH;
    const endT = endOffset / SEGMENT_LENGTH;
    const startX = curve.x + (next.x - curve.x) * startT;
    const endX = curve.x + (next.x - curve.x) * endT;
    const startY = curve.y + (next.y - curve.y) * startT + MARKING_LIFT;
    const endY = curve.y + (next.y - curve.y) * endT + MARKING_LIFT;
    const left = centerX - LINE_HALF_WIDTH;
    const right = centerX + LINE_HALF_WIDTH;
    const base = (4 + slot * 4) * 3;
    positions[base] = startX + left;
    positions[base + 1] = startY;
    positions[base + 2] = zRel + startOffset;
    positions[base + 3] = startX + right;
    positions[base + 4] = startY;
    positions[base + 5] = zRel + startOffset;
    positions[base + 6] = endX + left;
    positions[base + 7] = endY;
    positions[base + 8] = zRel + endOffset;
    positions[base + 9] = endX + right;
    positions[base + 10] = endY;
    positions[base + 11] = zRel + endOffset;
    for (let i = 0; i < 12; i++) colors[base + i] = wear;
  }

  hideDashPiece(slot, zRel, curve) {
    const positions = this.laneLines.rowPositions;
    const colors = this.laneLines.rowColors;
    const base = (4 + slot * 4) * 3;
    for (let i = 0; i < 12; i += 3) {
      positions[base + i] = curve.x;
      positions[base + i + 1] = curve.y - HIDDEN_DEPTH;
      positions[base + i + 2] = zRel;
      colors[base + i] = 0;
      colors[base + i + 1] = 0;
      colors[base + i + 2] = 0;
    }
  }

  writeProfileRow(ribbon, layout, row, zRel, curve) {
    const positions = ribbon.rowPositions;
    for (let i = 0, o = 0; i < layout.count; i++, o += 3) {
      positions[o] = curve.x + layout.xs[i];
      positions[o + 1] = curve.y + layout.ys[i];
      positions[o + 2] = zRel;
    }
    ribbon.commitRow(row);
  }

  writeTerrainRow(row, z, zRel, curve) {
    const layout = this.terrainLayout;
    const ribbon = this.terrain;
    const heights = this.terrainHeights;
    const positions = ribbon.rowPositions;
    const normals = ribbon.rowNormals;
    const colors = ribbon.rowColors;
    const color = this.scratchColor;
    for (let i = 0; i < layout.count; i++) heights[i] = getTerrainHeight(layout.xs[i], z);

    for (let i = 0, o = 0; i < layout.count; i++, o += 3) {
      const x = layout.xs[i];
      const height = heights[i];
      positions[o] = curve.x + x;
      positions[o + 1] = curve.y + height;
      positions[o + 2] = zRel;

      const lower = layout.lower[i];
      const upper = layout.upper[i];
      const slope = (heights[upper] - heights[lower]) / (layout.xs[upper] - layout.xs[lower]);
      const nx = -slope;
      const nz = slope * curve.dx - curve.dy;
      const inverseLength = 1 / Math.sqrt(nx * nx + 1 + nz * nz);
      normals[o] = nx * inverseLength;
      normals[o + 1] = inverseLength;
      normals[o + 2] = nz * inverseLength;

      const side = x < 0 ? -1 : 1;
      const absX = Math.abs(x);
      const outward = absX - ROAD.TERRAIN_FLAT_HALF_WIDTH;
      const broad = Math.sin(z * 0.017 + x * 0.041 + side) * Math.sin(z * 0.0061 - x * 0.023 + 1.7);
      const fine = Math.sin(z * 0.071 + x * 0.13 + 0.6) * Math.cos(z * 0.043 - x * 0.09);
      const grain = hash2(row, i + 101) - 0.5;
      color.lerpColors(this.groundDarkColor, this.groundColor, clamp(0.5 + 0.55 * broad + 0.25 * fine, 0, 1));
      const verge = 1 - smoothstep(-1.2, 0.8, outward);
      color.lerp(this.gravelColor, verge * 0.55);
      const bankWave = 0.5 + 0.5 * Math.sin(z * 0.037 + 2.2 * Math.sin(z * 0.0083 + side * 0.9) + side * 1.3);
      const bankZone = 1 - smoothstep(0.6, 2.8, Math.abs(absX - 11.8));
      const bank = smoothstep(0.35, 0.8, bankWave) * bankZone;
      const altitudeSnow = smoothstep(5.5, 14, height + 4 * broad + 2.2 * fine);
      const exposure = 1 - 0.55 * smoothstep(0.55, 1.2, Math.abs(slope));
      const snow = Math.max(bank * 0.8, altitudeSnow * exposure);
      color.lerp(this.snowColor, snow * 0.92);
      const shade = 1 + grain * 0.16;
      colors[o] = color.r * shade;
      colors[o + 1] = color.g * shade;
      colors[o + 2] = color.b * shade;
    }
    ribbon.commitRow(row);
  }

  writePostRow(row, zRel, curve) {
    const slot = positiveModulo(row, ROW_COUNT);
    const yaw = Math.atan(curve.dx);
    const cos = Math.cos(yaw);
    const sin = Math.sin(yaw);
    const offset = slot * 32;
    const array = this.postMatrices.array;
    writeYawMatrix(array, offset, -cos, -sin, curve.x - ROAD.BARRIER_X, curve.y, zRel);
    writeYawMatrix(array, offset + 16, cos, sin, curve.x + ROAD.BARRIER_X, curve.y, zRel);
    this.postTracker.markRange(offset, 32);

    const hasReflector = positiveModulo(row, REFLECTOR_ROW_INTERVAL) === 0;
    const left = hasReflector ? this.reflectorAmber : this.postCapColor;
    const right = hasReflector ? this.reflectorRed : this.postCapColor;
    const colors = this.reflectorColors.array;
    const colorOffset = slot * 6;
    colors[colorOffset] = left.r;
    colors[colorOffset + 1] = left.g;
    colors[colorOffset + 2] = left.b;
    colors[colorOffset + 3] = right.r;
    colors[colorOffset + 4] = right.g;
    colors[colorOffset + 5] = right.b;
    this.reflectorTracker.markRange(colorOffset, 6);
  }
}
