import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';
import {
  PALETTE,
  LIGHTING,
  VEHICLE_CLASSES,
  LANE_X,
  isOncomingLane,
  getRoadCurve,
  getRoadYaw,
  getRoadPitch,
  UNLIMITED,
} from '../config/constants.js';

const TWO_PI = Math.PI * 2;
const HALF_PI = Math.PI * 0.5;

const FREEZE_DURATION = 0.5;
const HAZARD_FREQUENCY = 1.5;
const HAZARD_DUTY = 0.5;

const WHEEL_SEGMENTS = 14;
const RIM_RATIO = 0.64;
const RIM_FACE_COLOR = 0x272c32;

const BLINKER_COLOR = 0xffa21a;
const BLINKER_EMISSIVE = 4.2;
const BLINKER_SIZE = Object.freeze([0.1, 0.07, 0.06]);

const CONE_LENGTH = 15;
const CONE_START_RADIUS = 0.09;
const CONE_END_RADIUS = 2.1;
const CONE_TILT = -0.065;
const CONE_SEGMENTS = 10;
const CONE_RINGS = 4;
const CONE_INTENSITY = 0.032;
const CONE_FALLOFF = 1.6;

const STREAK_LIFT = 0.035;
const STREAK_WIDTH = 0.34;
const STREAK_ROWS = 5;
const STREAK_OVERLAP = 0.25;
const STREAK_FALLOFF = 1.5;
const HEAD_STREAK_LENGTH = 6.5;
const TAIL_STREAK_LENGTH = 4.6;
const HEAD_STREAK_INTENSITY = 0.42;
const TAIL_STREAK_INTENSITY = 0.5;

const FOG_FADE_FRAGMENT = /* glsl */ `
#ifdef USE_FOG
  #ifdef FOG_EXP2
    float fogFactor = 1.0 - exp( - fogDensity * fogDensity * vFogDepth * vFogDepth );
  #else
    float fogFactor = smoothstep( fogNear, fogFar, vFogDepth );
  #endif
  gl_FragColor.rgb *= 1.0 - fogFactor;
#endif
`;

function createSurfaceMaterial(color, metalness, roughness, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, metalness, roughness, flatShading: true, ...extra });
}

function createLightFxMaterial() {
  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    forceSinglePass: true,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <fog_fragment>', FOG_FADE_FRAGMENT);
  };
  material.customProgramCacheKey = () => 'traffic-light-fx-fog-fade';
  return material;
}

const SHARED_MATERIALS = Object.freeze({
  glass: createSurfaceMaterial(PALETTE.GLASS, 0.85, 0.14),
  trim: createSurfaceMaterial(PALETTE.TRIM, 0.35, 0.68),
  chrome: createSurfaceMaterial(PALETTE.CHROME, 1, 0.24),
  head: createSurfaceMaterial(0x1c160c, 0.1, 0.35, {
    emissive: PALETTE.HEADLIGHT,
    emissiveIntensity: LIGHTING.HEADLIGHT_EMISSIVE,
  }),
  tail: createSurfaceMaterial(0x1c0609, 0.1, 0.4, {
    emissive: PALETTE.TAILLIGHT,
    emissiveIntensity: LIGHTING.TAILLIGHT_EMISSIVE,
  }),
  blinker: createSurfaceMaterial(0x1c1205, 0.1, 0.4, {
    emissive: BLINKER_COLOR,
    emissiveIntensity: BLINKER_EMISSIVE,
  }),
  wheel: new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.3, roughness: 0.78, flatShading: true }),
  lightFx: createLightFxMaterial(),
});

const paintMaterials = new Map();

function getPaintMaterial(color) {
  let material = paintMaterials.get(color);
  if (material === undefined) {
    material = createSurfaceMaterial(color, 0.5, 0.36);
    paintMaterials.set(color, material);
  }
  return material;
}

const helperMatrix = new THREE.Matrix4();
const helperQuaternion = new THREE.Quaternion();
const helperEuler = new THREE.Euler();
const helperPosition = new THREE.Vector3();
const helperScale = new THREE.Vector3(1, 1, 1);
const helperColor = new THREE.Color();

function place(geometry, x = 0, y = 0, z = 0, rotationX = 0, rotationY = 0, rotationZ = 0) {
  helperEuler.set(rotationX, rotationY, rotationZ, 'XYZ');
  helperQuaternion.setFromEuler(helperEuler);
  helperPosition.set(x, y, z);
  helperMatrix.compose(helperPosition, helperQuaternion, helperScale);
  return geometry.applyMatrix4(helperMatrix);
}

function box(width, height, depth, x, y, z, rotationX = 0, rotationY = 0, rotationZ = 0) {
  return place(new THREE.BoxGeometry(width, height, depth), x, y, z, rotationX, rotationY, rotationZ);
}

function mirroredBoxes(width, height, depth, x, y, z, rotationX = 0, rotationY = 0, rotationZ = 0) {
  return [
    box(width, height, depth, x, y, z, rotationX, rotationY, rotationZ),
    box(width, height, depth, -x, y, z, rotationX, -rotationY, -rotationZ),
  ];
}

function cylinderAlongZ(radius, length, segments, x, y, z) {
  return place(new THREE.CylinderGeometry(radius, radius, length, segments), x, y, z, HALF_PI, 0, 0);
}

function cylinderAlongY(radius, height, segments, x, y, z) {
  return place(new THREE.CylinderGeometry(radius, radius, height, segments), x, y, z);
}

function hull(points) {
  return new ConvexGeometry(points.map(([x, y, z]) => new THREE.Vector3(x, y, z)));
}

function symmetricHull(halfPoints) {
  const points = [];
  for (const [x, y, z] of halfPoints) {
    points.push([x, y, z]);
    if (x !== 0) points.push([-x, y, z]);
  }
  return hull(points);
}

function mirroredHulls(halfPoints) {
  return [hull(halfPoints), hull(halfPoints.map(([x, y, z]) => [-x, y, z]))];
}

function sidePanels(outerPoints, depth) {
  const points = [];
  for (const [x, y, z] of outerPoints) {
    points.push([x, y, z], [x - depth, y, z]);
  }
  return mirroredHulls(points);
}

function loftStations(stations) {
  const parts = [];
  for (let index = 0; index < stations.length - 1; index += 1) {
    const halfPoints = [];
    for (const station of [stations[index], stations[index + 1]]) {
      for (const [x, y] of station.profile) halfPoints.push([x, y, station.z]);
    }
    parts.push(symmetricHull(halfPoints));
  }
  return parts;
}

function toPlainGeometry(geometry) {
  const plain = geometry.index !== null ? geometry.toNonIndexed() : geometry;
  if (plain !== geometry) geometry.dispose();
  for (const name of Object.keys(plain.attributes)) {
    if (name !== 'position') plain.deleteAttribute(name);
  }
  plain.morphAttributes = {};
  plain.clearGroups();
  plain.computeVertexNormals();
  return plain;
}

function colorize(geometry, intensityAt) {
  const position = geometry.attributes.position;
  const values = new Float32Array(position.count * 3);
  for (let index = 0; index < position.count; index += 1) {
    const intensity = intensityAt(position.getX(index), position.getY(index), position.getZ(index));
    values[index * 3] = helperColor.r * intensity;
    values[index * 3 + 1] = helperColor.g * intensity;
    values[index * 3 + 2] = helperColor.b * intensity;
  }
  geometry.setAttribute('color', new THREE.BufferAttribute(values, 3));
  return geometry;
}

function solidColored(geometry, hex) {
  const plain = toPlainGeometry(geometry);
  helperColor.setHex(hex);
  return colorize(plain, () => 1);
}

function mergePlain(parts) {
  const flat = parts.flat().filter(Boolean);
  if (flat.length === 0) return null;
  const plain = flat.map(toPlainGeometry);
  const merged = mergeGeometries(plain, false);
  for (const geometry of plain) geometry.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

function mergeColored(parts) {
  const merged = mergeGeometries(parts, false);
  for (const geometry of parts) geometry.dispose();
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

const clampUnit = (value) => (value < 0 ? 0 : value > 1 ? 1 : value);

const axleGeometryCache = new Map();

function getAxleGeometry(radius, width, halfTrack, spokeCount) {
  const key = `${radius}|${width}|${halfTrack}|${spokeCount}`;
  const cached = axleGeometryCache.get(key);
  if (cached !== undefined) return cached;

  const rimRadius = radius * RIM_RATIO;
  const spokeLength = rimRadius * 0.92;
  const parts = [];
  for (const side of [-1, 1]) {
    const centerX = side * halfTrack;
    const faceX = centerX + side * width * 0.5;
    parts.push(
      solidColored(
        place(new THREE.CylinderGeometry(radius, radius, width, WHEEL_SEGMENTS), centerX, 0, 0, 0, 0, HALF_PI),
        PALETTE.TIRE,
      ),
    );
    parts.push(
      solidColored(
        place(
          new THREE.CylinderGeometry(rimRadius, rimRadius, 0.03, WHEEL_SEGMENTS),
          faceX + side * 0.005,
          0,
          0,
          0,
          0,
          HALF_PI,
        ),
        RIM_FACE_COLOR,
      ),
    );
    for (let spoke = 0; spoke < spokeCount; spoke += 1) {
      const angle = (spoke / spokeCount) * TWO_PI;
      parts.push(
        solidColored(
          box(
            0.035,
            spokeLength,
            rimRadius * 0.24,
            faceX + side * 0.02,
            Math.cos(angle) * spokeLength * 0.5,
            Math.sin(angle) * spokeLength * 0.5,
            angle,
          ),
          PALETTE.RIM,
        ),
      );
    }
    parts.push(
      solidColored(
        place(new THREE.CylinderGeometry(radius * 0.16, radius * 0.16, 0.06, 8), faceX + side * 0.03, 0, 0, 0, 0, HALF_PI),
        PALETTE.CHROME,
      ),
    );
  }
  const geometry = mergeColored(parts);
  axleGeometryCache.set(key, geometry);
  return geometry;
}

function buildConeGeometry(x, y, z) {
  const geometry = toPlainGeometry(
    new THREE.CylinderGeometry(CONE_START_RADIUS, CONE_END_RADIUS, CONE_LENGTH, CONE_SEGMENTS, CONE_RINGS, true),
  );
  helperColor.setHex(PALETTE.HEADLIGHT);
  colorize(
    geometry,
    (px, py) => CONE_INTENSITY * Math.pow(clampUnit((py + CONE_LENGTH * 0.5) / CONE_LENGTH), CONE_FALLOFF),
  );
  geometry.rotateX(HALF_PI);
  geometry.translate(0, 0, -CONE_LENGTH * 0.5);
  geometry.rotateX(CONE_TILT);
  geometry.translate(x, y, z);
  return geometry;
}

function buildStreakGeometry(x, nearZ, direction, length, hex, intensity) {
  const geometry = toPlainGeometry(new THREE.PlaneGeometry(STREAK_WIDTH, length, 1, STREAK_ROWS));
  const nearY = direction * length * 0.5;
  helperColor.setHex(hex);
  colorize(geometry, (px, py) => intensity * Math.pow(1 - clampUnit(((nearY - py) * direction) / length), STREAK_FALLOFF));
  geometry.rotateX(-HALF_PI);
  geometry.translate(x, STREAK_LIFT, nearZ + direction * length * 0.5);
  return geometry;
}

function buildLightFxGeometry(headlights, taillights) {
  const parts = [];
  for (const [x, y, z] of headlights) {
    parts.push(buildConeGeometry(x, y, z));
    parts.push(
      buildStreakGeometry(x, z + STREAK_OVERLAP, -1, HEAD_STREAK_LENGTH, PALETTE.HEADLIGHT, HEAD_STREAK_INTENSITY),
    );
  }
  for (const [x, , z] of taillights) {
    parts.push(
      buildStreakGeometry(x, z - STREAK_OVERLAP, 1, TAIL_STREAK_LENGTH, PALETTE.TAILLIGHT, TAIL_STREAK_INTENSITY),
    );
  }
  return parts.length > 0 ? mergeColored(parts) : null;
}

function buildBlinkerGeometry(positions) {
  if (!positions || positions.length === 0) return null;
  return mergePlain(positions.map(([x, y, z]) => box(BLINKER_SIZE[0], BLINKER_SIZE[1], BLINKER_SIZE[2], x, y, z)));
}

function buildSportsDesign() {
  const paint = [
    ...loftStations([
      { z: -2.2, profile: [[0.64, 0.2], [0.72, 0.3], [0.56, 0.38]] },
      { z: -1.78, profile: [[0.74, 0.16], [0.9, 0.46], [0.68, 0.57]] },
      { z: -0.95, profile: [[0.74, 0.16], [0.92, 0.58], [0.64, 0.66]] },
      { z: 0.5, profile: [[0.76, 0.16], [0.9, 0.6], [0.68, 0.66]] },
      { z: 1.3, profile: [[0.76, 0.16], [0.95, 0.7], [0.74, 0.78]] },
      { z: 2.2, profile: [[0.72, 0.24], [0.93, 0.64], [0.7, 0.74]] },
    ]),
    ...mirroredHulls([
      [0.93, 0.47, -1.86],
      [0.93, 0.47, -0.9],
      [0.9, 0.67, -1.7],
      [0.9, 0.67, -1.06],
      [0.6, 0.7, -1.66],
      [0.6, 0.7, -1.1],
      [0.6, 0.47, -1.86],
      [0.6, 0.47, -0.9],
    ]),
    ...mirroredHulls([
      [0.95, 0.5, 0.82],
      [0.95, 0.5, 1.84],
      [0.94, 0.72, 0.98],
      [0.94, 0.72, 1.64],
      [0.62, 0.8, 1.0],
      [0.62, 0.8, 1.62],
      [0.62, 0.5, 0.82],
      [0.62, 0.5, 1.84],
    ]),
    symmetricHull([
      [0.535, 1.07, -0.1],
      [0.51, 1.15, -0.02],
      [0.49, 1.15, 0.38],
      [0.505, 1.07, 0.46],
    ]),
    ...sidePanels(
      [
        [0.71, 0.62, -0.78],
        [0.71, 0.62, -0.66],
        [0.545, 1.08, -0.1],
        [0.545, 1.08, 0.0],
      ],
      0.06,
    ),
    ...sidePanels(
      [
        [0.7, 0.66, 0.66],
        [0.7, 0.7, 1.04],
        [0.515, 1.08, 0.46],
        [0.515, 1.08, 0.3],
      ],
      0.07,
    ),
    ...mirroredBoxes(0.16, 0.08, 0.18, 0.84, 0.74, -0.55),
    ...mirroredBoxes(0.12, 0.03, 0.05, 0.74, 0.71, -0.55),
  ];

  const glass = [
    symmetricHull([
      [0.7, 0.62, -0.78],
      [0.53, 1.08, -0.08],
      [0.5, 1.09, 0.42],
      [0.68, 0.7, 0.98],
    ]),
  ];

  const trim = [
    box(1.6, 0.04, 0.4, 0, 0.11, -2.14),
    box(1.0, 0.1, 0.1, 0, 0.25, -2.19),
    ...sidePanels(
      [
        [0.88, 0.14, -0.94],
        [0.88, 0.14, 0.84],
        [0.9, 0.3, -0.94],
        [0.9, 0.3, 0.84],
      ],
      0.16,
    ),
    ...sidePanels(
      [
        [0.92, 0.32, 0.38],
        [0.92, 0.32, 0.86],
        [0.94, 0.54, 0.86],
        [0.93, 0.5, 0.52],
      ],
      0.14,
    ),
    box(1.3, 0.14, 0.32, 0, 0.2, 2.08),
    ...[0.5, 0.18, -0.18, -0.5].map((x) => box(0.025, 0.1, 0.3, x, 0.12, 2.08)),
    symmetricHull([
      [0.84, 0.97, 1.86],
      [0.84, 1.0, 1.86],
      [0.84, 1.03, 2.22],
      [0.84, 1.07, 2.22],
    ]),
    ...mirroredBoxes(0.03, 0.17, 0.44, 0.855, 1.0, 2.04),
    ...mirroredBoxes(0.05, 0.3, 0.12, 0.42, 0.86, 2.02),
    box(0.5, 0.02, 0.22, 0, 0.63, -1.3),
    ...[1.45, 1.6, 1.75].map((z) => box(0.9, 0.025, 0.05, 0, 0.775, z)),
  ];

  const chrome = [0.26, 0.38, -0.26, -0.38].map((x) => cylinderAlongZ(0.045, 0.14, 8, x, 0.2, 2.2));

  const head = mirroredHulls([
    [0.4, 0.4, -2.17],
    [0.66, 0.37, -2.15],
    [0.42, 0.475, -1.99],
    [0.7, 0.45, -1.99],
    [0.4, 0.43, -2.17],
    [0.66, 0.4, -2.15],
    [0.42, 0.505, -1.99],
    [0.7, 0.48, -1.99],
  ]);

  const tail = [box(1.72, 0.07, 0.05, 0, 0.6, 2.215), ...mirroredBoxes(0.22, 0.05, 0.05, 0.74, 0.66, 2.205)];

  return {
    parts: { paint, glass, trim, chrome, head, tail },
    axles: [
      { radius: 0.32, width: 0.24, halfTrack: 0.8, spokes: 5, z: -1.38 },
      { radius: 0.34, width: 0.3, halfTrack: 0.8, spokes: 5, z: 1.3 },
    ],
    headlights: [
      [0.55, 0.43, -2.12],
      [-0.55, 0.43, -2.12],
    ],
    taillights: [
      [0.6, 0.6, 2.24],
      [-0.6, 0.6, 2.24],
    ],
    blinkers: [
      [0.7, 0.3, -2.19],
      [-0.7, 0.3, -2.19],
      [0.86, 0.52, 2.2],
      [-0.86, 0.52, 2.2],
    ],
  };
}

function buildSedanDesign() {
  const paint = [
    ...loftStations([
      { z: -2.34, profile: [[0.8, 0.3], [0.86, 0.56], [0.76, 0.74]] },
      { z: -2.1, profile: [[0.8, 0.26], [0.92, 0.66], [0.84, 0.8]] },
      { z: -0.86, profile: [[0.8, 0.26], [0.925, 0.68], [0.86, 0.87]] },
      { z: 1.02, profile: [[0.8, 0.26], [0.925, 0.68], [0.86, 0.91]] },
      { z: 2.12, profile: [[0.8, 0.28], [0.92, 0.66], [0.84, 0.89]] },
      { z: 2.34, profile: [[0.8, 0.34], [0.86, 0.62], [0.78, 0.85]] },
    ]),
    ...sidePanels(
      [
        [0.925, 0.3, -1.04],
        [0.925, 0.3, 1.04],
        [0.925, 0.66, -1.04],
        [0.925, 0.66, 1.04],
      ],
      0.14,
    ),
    ...sidePanels(
      [
        [0.9, 0.3, -2.3],
        [0.92, 0.3, -1.86],
        [0.92, 0.64, -1.86],
        [0.88, 0.6, -2.3],
      ],
      0.14,
    ),
    ...sidePanels(
      [
        [0.92, 0.3, 1.86],
        [0.9, 0.32, 2.3],
        [0.88, 0.6, 2.3],
        [0.92, 0.64, 1.86],
      ],
      0.14,
    ),
    symmetricHull([
      [0.675, 1.38, -0.16],
      [0.65, 1.45, -0.06],
      [0.65, 1.45, 0.58],
      [0.675, 1.38, 0.68],
    ]),
    ...sidePanels(
      [
        [0.855, 0.86, -0.86],
        [0.855, 0.86, -0.76],
        [0.675, 1.39, -0.14],
        [0.675, 1.39, -0.05],
      ],
      0.05,
    ),
    ...sidePanels(
      [
        [0.855, 0.87, 0.14],
        [0.855, 0.87, 0.26],
        [0.675, 1.39, 0.14],
        [0.675, 1.39, 0.26],
      ],
      0.05,
    ),
    ...sidePanels(
      [
        [0.855, 0.88, 0.8],
        [0.855, 0.9, 1.05],
        [0.675, 1.39, 0.66],
        [0.675, 1.39, 0.5],
      ],
      0.06,
    ),
    ...mirroredBoxes(0.12, 0.1, 0.16, 0.98, 0.95, -0.66),
    ...mirroredBoxes(0.12, 0.03, 0.06, 0.9, 0.92, -0.66),
  ];

  const glass = [
    symmetricHull([
      [0.84, 0.85, -0.86],
      [0.66, 1.39, -0.12],
      [0.66, 1.39, 0.62],
      [0.84, 0.89, 1.04],
    ]),
  ];

  const trim = [
    symmetricHull([
      [0.9, 0.24, -2.22],
      [0.9, 0.5, -2.22],
      [0.86, 0.26, -2.4],
      [0.86, 0.48, -2.4],
    ]),
    symmetricHull([
      [0.9, 0.26, 2.22],
      [0.9, 0.52, 2.22],
      [0.86, 0.28, 2.4],
      [0.86, 0.5, 2.4],
    ]),
    box(0.86, 0.15, 0.06, 0, 0.6, -2.34),
    ...mirroredBoxes(0.05, 0.08, 2.0, 0.93, 0.32, 0),
  ];

  const chrome = [
    box(0.9, 0.025, 0.07, 0, 0.685, -2.335),
    box(0.84, 0.02, 0.07, 0, 0.6, -2.345),
    ...mirroredBoxes(0.03, 0.03, 1.9, 0.855, 0.87, 0.09),
    ...mirroredBoxes(0.03, 0.03, 0.12, 0.935, 0.62, -0.35),
    ...mirroredBoxes(0.03, 0.03, 0.12, 0.935, 0.62, 0.55),
    box(0.46, 0.12, 0.02, 0, 0.4, 2.41),
    cylinderAlongZ(0.045, 0.12, 8, 0.5, 0.26, 2.38),
  ];

  const head = mirroredBoxes(0.36, 0.11, 0.08, 0.62, 0.64, -2.32);

  const tail = [...mirroredBoxes(0.36, 0.13, 0.08, 0.64, 0.72, 2.32), box(0.5, 0.04, 0.04, 0, 0.74, 2.345)];

  return {
    parts: { paint, glass, trim, chrome, head, tail },
    axles: [
      { radius: 0.32, width: 0.22, halfTrack: 0.8, spokes: 6, z: -1.45 },
      { radius: 0.32, width: 0.22, halfTrack: 0.8, spokes: 6, z: 1.45 },
    ],
    headlights: [
      [0.62, 0.64, -2.36],
      [-0.62, 0.64, -2.36],
    ],
    taillights: [
      [0.64, 0.72, 2.36],
      [-0.64, 0.72, 2.36],
    ],
    blinkers: [
      [0.84, 0.56, -2.33],
      [-0.84, 0.56, -2.33],
      [0.86, 0.6, 2.33],
      [-0.86, 0.6, 2.33],
    ],
  };
}

const TRUCK_LAYOUT = Object.freeze({
  KINGPIN_Z: -2.85,
  CAB_CENTER_OFFSET: 5.45,
  TRAILER_CENTER_OFFSET: 1.8,
  TRAILER_FRONT: -0.8,
  TRAILER_REAR: 10.1,
});

const truckCabFaceZ = (y) => -7.15 + (y - 0.98) * (0.15 / 2.44);

function buildTruckDesign() {
  const paint = [
    symmetricHull([
      [1.1, 0.98, -7.15],
      [1.22, 0.98, -6.88],
      [1.22, 0.98, -4.62],
      [1.08, 3.42, -7.0],
      [1.2, 3.48, -6.76],
      [1.2, 3.48, -4.62],
    ]),
    symmetricHull([
      [1.12, 3.4, -6.92],
      [1.18, 3.4, -4.62],
      [1.06, 3.62, -6.62],
      [1.0, 3.8, -6.05],
      [1.1, 3.8, -4.62],
    ]),
  ];

  const glass = [
    symmetricHull([
      [1.0, 2.15, truckCabFaceZ(2.15) - 0.025],
      [1.0, 2.15, truckCabFaceZ(2.15) + 0.03],
      [0.98, 3.18, truckCabFaceZ(3.18) - 0.025],
      [0.98, 3.18, truckCabFaceZ(3.18) + 0.03],
    ]),
    ...sidePanels(
      [
        [1.235, 2.2, -6.8],
        [1.235, 2.2, -5.95],
        [1.225, 3.15, -6.7],
        [1.225, 3.15, -5.95],
      ],
      0.05,
    ),
  ];

  const trim = [
    symmetricHull([
      [1.06, 3.3, -7.24],
      [1.06, 3.36, -7.24],
      [1.08, 3.44, truckCabFaceZ(3.44) + 0.02],
      [1.08, 3.34, truckCabFaceZ(3.34) + 0.02],
    ]),
    box(1.7, 0.9, 0.06, 0, 1.6, truckCabFaceZ(1.6) - 0.01),
    box(2.48, 0.52, 0.3, 0, 0.74, -7.1),
    box(2.2, 0.08, 0.36, 0, 0.46, -7.08),
    ...mirroredBoxes(0.16, 0.3, 6.1, 0.48, 0.82, -4.15),
    ...mirroredBoxes(0.5, 0.55, 0.03, 0.97, 0.58, -1.55),
    ...mirroredBoxes(0.6, 0.05, 2.5, 0.96, 1.1, -2.85),
    box(1.2, 0.12, 1.1, 0, 1.13, -2.75),
    box(2.0, 0.05, 1.0, 0, 1.02, -4.1),
    ...mirroredBoxes(0.18, 0.04, 0.04, 1.29, 2.95, -6.78),
    ...mirroredBoxes(0.07, 0.44, 0.2, 1.36, 2.7, -6.78),
  ];

  const chrome = [
    ...[1.3, 1.5, 1.7, 1.9].map((y) => box(1.56, 0.05, 0.05, 0, y, truckCabFaceZ(y) - 0.04)),
    box(0.5, 0.09, 0.05, 0, 2.02, truckCabFaceZ(2.02) - 0.04),
    cylinderAlongZ(0.3, 1.2, 12, 0.92, 0.86, -5.1),
    cylinderAlongZ(0.3, 1.2, 12, -0.92, 0.86, -5.1),
    cylinderAlongY(0.09, 2.5, 10, 1.0, 2.45, -4.42),
    cylinderAlongY(0.09, 2.5, 10, -1.0, 2.45, -4.42),
    cylinderAlongY(0.11, 0.08, 10, 1.0, 3.72, -4.42),
    cylinderAlongY(0.11, 0.08, 10, -1.0, 3.72, -4.42),
    ...mirroredBoxes(0.03, 0.05, 0.24, 1.235, 1.95, -6.05),
    box(2.3, 0.04, 0.03, 0, 0.98, -7.255),
  ];

  const head = [
    ...mirroredBoxes(0.4, 0.16, 0.05, 0.84, 0.8, -7.26),
    ...[-0.6, -0.3, 0, 0.3, 0.6].map((x) => box(0.13, 0.06, 0.06, x, 3.43, -7.1)),
    ...mirroredBoxes(0.04, 0.08, 0.14, 1.225, 1.1, -6.9),
  ];

  const trailerCenter = (TRUCK_LAYOUT.TRAILER_FRONT + TRUCK_LAYOUT.TRAILER_REAR) * 0.5;
  const trailerLength = TRUCK_LAYOUT.TRAILER_REAR - TRUCK_LAYOUT.TRAILER_FRONT;
  const rear = TRUCK_LAYOUT.TRAILER_REAR;

  const trailerPaint = [box(2.5, 2.55, trailerLength, 0, 2.525, trailerCenter)];

  const trailerTrim = [
    ...mirroredBoxes(0.04, 0.1, trailerLength, 1.26, 3.75, trailerCenter),
    ...mirroredBoxes(0.04, 0.14, trailerLength, 1.26, 1.32, trailerCenter),
    ...[0.8, 2.4, 4.0, 5.6, 7.2, 8.8].flatMap((z) => mirroredBoxes(0.03, 2.3, 0.07, 1.262, 2.53, z)),
    ...mirroredBoxes(0.08, 2.55, 0.08, 1.24, 2.525, TRUCK_LAYOUT.TRAILER_FRONT + 0.02),
    ...mirroredBoxes(0.1, 2.55, 0.1, 1.22, 2.525, rear - 0.03),
    box(2.0, 0.18, 8.6, 0, 1.16, 5.7),
    ...mirroredBoxes(0.04, 0.6, 4.4, 1.2, 0.84, 4.5),
    ...mirroredBoxes(0.12, 0.85, 0.12, 0.85, 0.72, 1.9),
    ...mirroredBoxes(0.3, 0.06, 0.3, 0.85, 0.3, 1.9),
    box(0.04, 2.4, 0.03, 0, 2.52, rear + 0.015),
    ...[-0.85, -0.35, 0.35, 0.85].map((x) => box(0.045, 2.3, 0.045, x, 2.52, rear + 0.03)),
    box(2.5, 0.14, 0.06, 0, 3.72, rear + 0.02),
    box(2.5, 0.16, 0.08, 0, 1.33, rear + 0.02),
    box(2.4, 0.22, 0.1, 0, 1.08, rear - 0.06),
    box(2.2, 0.12, 0.12, 0, 0.62, rear - 0.12),
    ...mirroredBoxes(0.08, 0.5, 0.08, 0.8, 0.9, rear - 0.15),
    ...mirroredBoxes(0.5, 0.5, 0.03, 0.97, 0.55, rear - 0.65),
  ];

  const trailerTail = [
    ...mirroredBoxes(0.36, 0.13, 0.04, 0.84, 1.08, rear + 0.005),
    ...mirroredBoxes(0.1, 0.06, 0.05, 1.12, 3.7, rear + 0.07),
    ...[-0.25, 0, 0.25].map((x) => box(0.09, 0.06, 0.05, x, 3.7, rear + 0.07)),
    ...mirroredBoxes(0.04, 0.07, 0.14, 1.27, 3.6, rear - 0.4),
  ];

  return {
    parts: { paint, glass, trim, chrome, head, tail: null },
    axles: [
      { radius: 0.52, width: 0.32, halfTrack: 1.08, spokes: 6, z: -6.35 },
      { radius: 0.52, width: 0.56, halfTrack: 0.96, spokes: 6, z: -3.45 },
      { radius: 0.52, width: 0.56, halfTrack: 0.96, spokes: 6, z: -2.25 },
    ],
    headlights: [
      [0.84, 0.8, -7.28],
      [-0.84, 0.8, -7.28],
    ],
    taillights: [],
    blinkers: [
      [1.14, 0.8, -7.26],
      [-1.14, 0.8, -7.26],
    ],
    cabOffset: TRUCK_LAYOUT.CAB_CENTER_OFFSET,
    trailerOffset: TRUCK_LAYOUT.TRAILER_CENTER_OFFSET,
    trailer: {
      pivotZ: TRUCK_LAYOUT.KINGPIN_Z,
      parts: { paint: trailerPaint, glass: null, trim: trailerTrim, chrome: null, head: null, tail: trailerTail },
      axles: [
        { radius: 0.52, width: 0.56, halfTrack: 0.96, spokes: 6, z: rear - 2.65 },
        { radius: 0.52, width: 0.56, halfTrack: 0.96, spokes: 6, z: rear - 1.4 },
      ],
      headlights: [],
      taillights: [
        [0.84, 1.08, rear + 0.02],
        [-0.84, 1.08, rear + 0.02],
      ],
      blinkers: [
        [1.12, 1.08, rear + 0.01],
        [-1.12, 1.08, rear + 0.01],
      ],
    },
  };
}

const MATERIAL_SLOTS = Object.freeze(['paint', 'glass', 'trim', 'chrome', 'head', 'tail']);

const DESIGN_BUILDERS = Object.freeze({
  SPORTS: buildSportsDesign,
  SEDAN: buildSedanDesign,
  TRUCK: buildTruckDesign,
});

function finalizeSection(section) {
  const geometries = {};
  for (const slot of MATERIAL_SLOTS) {
    const parts = section.parts[slot];
    geometries[slot] = parts && parts.length > 0 ? mergePlain(parts) : null;
  }
  return {
    geometries,
    axles: (section.axles ?? []).map((axle) => ({
      geometry: getAxleGeometry(axle.radius, axle.width, axle.halfTrack, axle.spokes),
      radius: axle.radius,
      z: axle.z,
    })),
    lightFx: buildLightFxGeometry(section.headlights ?? [], section.taillights ?? []),
    blinkers: buildBlinkerGeometry(section.blinkers),
  };
}

const blueprintCache = new Map();

function getBlueprint(type) {
  let blueprint = blueprintCache.get(type);
  if (blueprint === undefined) {
    const design = DESIGN_BUILDERS[type]();
    blueprint = {
      root: finalizeSection(design),
      trailer: design.trailer ? { ...finalizeSection(design.trailer), pivotZ: design.trailer.pivotZ } : null,
      cabOffset: design.cabOffset ?? 0,
      trailerOffset: design.trailerOffset ?? 0,
    };
    blueprintCache.set(type, blueprint);
  }
  return blueprint;
}

function createStaticMesh(parent, geometry, material) {
  if (!geometry) return null;
  const mesh = new THREE.Mesh(geometry, material);
  mesh.matrixAutoUpdate = false;
  mesh.updateMatrix();
  parent.add(mesh);
  return mesh;
}

export class TrafficVehicle {
  constructor(type, id) {
    const spec = VEHICLE_CLASSES[type] ?? VEHICLE_CLASSES.SEDAN;
    this.id = id;
    this.type = spec.id;
    this.width = spec.width;
    this.length = spec.length;
    this.height = spec.height;
    this.lane = 2;
    this.localX = LANE_X[2];
    this.worldX = this.localX;
    this.y = 0;
    this.z = 0;
    this.speed = 0;
    this.cruiseSpeed = 0;
    this.isOncoming = false;
    this.nearMissAwarded = false;
    this.active = false;
    this.frozen = false;
    this.freezeTime = 0;
    this.freezeDeceleration = 0;
    this.hazardsOn = false;
    this.impactTime = 0;
    this.abreastCap = Infinity;
    this.abreastBoost = 0;
    this.lightFxEnabled = true;
    this.shadowsEnabled = false;
    this.paintColor = spec.colors[0];
    this.trailerColor = spec.trailerColors ? spec.trailerColors[0] : spec.colors[0];
    this.curve = { x: 0, y: 0, dx: 0, dy: 0 };
    this.probeCurve = { x: 0, y: 0, dx: 0, dy: 0 };

    for (const color of spec.colors) getPaintMaterial(color);
    if (spec.trailerColors) {
      for (const color of spec.trailerColors) getPaintMaterial(color);
    }

    const blueprint = getBlueprint(this.type);
    this.cabOffset = blueprint.cabOffset;
    this.trailerOffset = blueprint.trailerOffset;

    this.group = new THREE.Group();
    this.group.name = `traffic-${this.type.toLowerCase()}-${id}`;
    this.group.rotation.order = 'YXZ';
    this.group.visible = false;

    this.axles = [];
    this.blinkerMeshes = [];
    this.lightFxMeshes = [];
    this.shadowMeshes = [];

    this.bodyMesh = this.buildSection(this.group, blueprint.root, getPaintMaterial(this.paintColor));

    this.trailerPivot = null;
    this.trailerMesh = null;
    if (blueprint.trailer) {
      this.trailerPivot = new THREE.Group();
      this.trailerPivot.name = `${this.group.name}-trailer`;
      this.trailerPivot.position.set(0, 0, blueprint.trailer.pivotZ);
      this.group.add(this.trailerPivot);
      this.trailerMesh = this.buildSection(this.trailerPivot, blueprint.trailer, getPaintMaterial(this.trailerColor));
    }

    this.setLightFx(true);
    this.setShadows(false);
  }

  buildSection(parent, section, paintMaterial) {
    const { geometries } = section;
    const paintMesh = createStaticMesh(parent, geometries.paint, paintMaterial);
    if (paintMesh) this.shadowMeshes.push(paintMesh);
    createStaticMesh(parent, geometries.glass, SHARED_MATERIALS.glass);
    createStaticMesh(parent, geometries.trim, SHARED_MATERIALS.trim);
    createStaticMesh(parent, geometries.chrome, SHARED_MATERIALS.chrome);
    createStaticMesh(parent, geometries.head, SHARED_MATERIALS.head);
    createStaticMesh(parent, geometries.tail, SHARED_MATERIALS.tail);

    for (const axle of section.axles) {
      const mesh = new THREE.Mesh(axle.geometry, SHARED_MATERIALS.wheel);
      mesh.position.set(0, axle.radius, axle.z);
      parent.add(mesh);
      this.axles.push({ mesh, radius: axle.radius, angle: 0 });
    }

    const blinkers = createStaticMesh(parent, section.blinkers, SHARED_MATERIALS.blinker);
    if (blinkers) {
      blinkers.visible = false;
      this.blinkerMeshes.push(blinkers);
    }

    const lightFx = createStaticMesh(parent, section.lightFx, SHARED_MATERIALS.lightFx);
    if (lightFx) this.lightFxMeshes.push(lightFx);

    return paintMesh;
  }

  activate(lane, z, speed, paintColor, trailerColor) {
    const laneIndex = Number.isInteger(lane) && lane >= 0 && lane < LANE_X.length ? lane : 2;
    this.lane = laneIndex;
    this.localX = LANE_X[laneIndex];
    this.isOncoming = isOncomingLane(laneIndex);
    this.z = Number.isFinite(z) ? z : 0;
    this.speed = Number.isFinite(speed) ? Math.max(0, speed) : 0;
    this.cruiseSpeed = this.speed;
    this.nearMissAwarded = false;
    this.frozen = false;
    this.freezeTime = 0;
    this.freezeDeceleration = 0;
    this.impactTime = 0;
    this.setHazards(false);
    for (let index = 0; index < this.axles.length; index += 1) {
      const axle = this.axles[index];
      axle.angle = 0;
      axle.mesh.rotation.x = 0;
    }
    if (paintColor !== undefined && paintColor !== null) this.applyPaint(paintColor, trailerColor);
    this.active = true;
    this.group.visible = true;
    this.syncTransform(getRoadCurve);
  }

  applyPaint(paintColor, trailerColor) {
    this.paintColor = paintColor;
    if (this.bodyMesh) this.bodyMesh.material = getPaintMaterial(paintColor);
    if (this.trailerMesh) {
      if (trailerColor !== undefined && trailerColor !== null) this.trailerColor = trailerColor;
      this.trailerMesh.material = getPaintMaterial(this.trailerColor);
    }
  }

  deactivate() {
    this.active = false;
    this.frozen = false;
    this.speed = 0;
    this.cruiseSpeed = 0;
    this.impactTime = 0;
    this.setHazards(false);
    this.group.visible = false;
  }

  markImpact() {
    if (!this.active || this.frozen) return;
    this.nearMissAwarded = true;
    this.impactTime = UNLIMITED.IMPACT_HAZARD_DURATION;
  }

  freeze() {
    if (!this.active || this.frozen) return;
    this.frozen = true;
    this.freezeTime = 0;
    this.freezeDeceleration = Math.max(this.speed / FREEZE_DURATION, 1);
    this.cruiseSpeed = 0;
    this.setHazards(true);
  }

  update(deltaTime, roadCurveFn) {
    if (!this.active) return;
    this.advance(deltaTime);
    this.syncTransform(roadCurveFn);
  }

  advance(deltaTime) {
    if (!this.active) return;
    const dt = Number.isFinite(deltaTime) && deltaTime > 0 ? deltaTime : 0;
    if (this.frozen) {
      this.freezeTime += dt;
      this.speed = Math.max(0, this.speed - this.freezeDeceleration * dt);
      this.setHazards((this.freezeTime * HAZARD_FREQUENCY) % 1 < HAZARD_DUTY);
    } else if (this.impactTime > 0) {
      this.impactTime = Math.max(0, this.impactTime - dt);
      this.setHazards(this.impactTime > 0 && (this.impactTime * HAZARD_FREQUENCY) % 1 < HAZARD_DUTY);
    }
    const distance = this.speed * dt;
    this.z += this.isOncoming ? distance : -distance;
    for (let index = 0; index < this.axles.length; index += 1) {
      const axle = this.axles[index];
      axle.angle = (axle.angle - distance / axle.radius) % TWO_PI;
      axle.mesh.rotation.x = axle.angle;
    }
  }

  syncTransform(roadCurveFn) {
    const sample = typeof roadCurveFn === 'function' ? roadCurveFn : getRoadCurve;
    const curve = sample(this.z, this.curve);
    this.worldX = curve.x + this.localX;
    this.y = curve.y;
    let yaw = getRoadYaw(curve.dx);
    let pitch = getRoadPitch(curve.dy);
    if (this.trailerPivot !== null) {
      const travel = this.isOncoming ? 1 : -1;
      const cabYaw = getRoadYaw(sample(this.z + travel * this.cabOffset, this.probeCurve).dx);
      const trailerYaw = getRoadYaw(sample(this.z - travel * this.trailerOffset, this.probeCurve).dx);
      yaw = cabYaw;
      this.trailerPivot.rotation.y = trailerYaw - cabYaw;
    }
    if (this.isOncoming) {
      yaw += Math.PI;
      pitch = -pitch;
    }
    this.group.position.set(this.worldX, this.y, this.z);
    this.group.rotation.set(pitch, yaw, 0);
  }

  setHazards(enabled) {
    if (this.hazardsOn === enabled) return;
    this.hazardsOn = enabled;
    for (let index = 0; index < this.blinkerMeshes.length; index += 1) {
      this.blinkerMeshes[index].visible = enabled;
    }
  }

  setLightFx(enabled) {
    this.lightFxEnabled = enabled === true;
    for (let index = 0; index < this.lightFxMeshes.length; index += 1) {
      this.lightFxMeshes[index].visible = this.lightFxEnabled;
    }
  }

  setShadows(enabled) {
    this.shadowsEnabled = enabled === true;
    for (let index = 0; index < this.shadowMeshes.length; index += 1) {
      this.shadowMeshes[index].castShadow = this.shadowsEnabled;
    }
  }
}
