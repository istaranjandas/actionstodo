// Low-poly flora: stylised pines along the path and up the slopes, and boulders at the bends and
// along the shore. Two instanced meshes carry the whole valley, so the cost is two draw calls.
import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { trailX } from '../trail';
import { useLivePalette } from './livePalette';
import { smoothstep } from './noise';
import { LAKE, terrainHeight } from './terrainShape';

const TREE_TARGET = 1450;
const BOULDER_TARGET = 210;
const TREELINE = 36;
// The road and its verges stay open, and the lake keeps a clearing of its own
const TRAIL_CLEARANCE = 7.6;
const LAKE_CLEARANCE = 1.24;

// Deterministic scatter: the same forest on every visit
function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Concatenate primitives into one flat-shaded geometry, baking a colour per part
function mergeParts(parts: { geometry: THREE.BufferGeometry; color: THREE.Color; matrix: THREE.Matrix4 }[]): THREE.BufferGeometry {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const vertex = new THREE.Vector3();
  const normal = new THREE.Vector3();
  parts.forEach(({ geometry, color, matrix }) => {
    const source = geometry.index ? geometry.toNonIndexed() : geometry;
    const position = source.getAttribute('position');
    const normalAttribute = source.getAttribute('normal');
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix);
    for (let i = 0; i < position.count; i++) {
      vertex.fromBufferAttribute(position, i).applyMatrix4(matrix);
      positions.push(vertex.x, vertex.y, vertex.z);
      normal.fromBufferAttribute(normalAttribute, i).applyMatrix3(normalMatrix).normalize();
      normals.push(normal.x, normal.y, normal.z);
      colors.push(color.r, color.g, color.b);
    }
    if (source !== geometry) source.dispose();
  });
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  merged.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  merged.computeBoundingSphere();
  return merged;
}

function buildTreeGeometry(): THREE.BufferGeometry {
  const trunkColor = new THREE.Color('#5b4633');
  // Three stacked skirts: the silhouette reads as a cypress-pine at any distance
  const tiers = [
    { radius: 1.18, height: 1.9, y: 1.55, color: new THREE.Color('#2c5f4b') },
    { radius: 0.92, height: 1.7, y: 2.6, color: new THREE.Color('#3a7459') },
    { radius: 0.62, height: 1.5, y: 3.55, color: new THREE.Color('#4c8d68') }
  ];
  const parts = [
    {
      geometry: new THREE.CylinderGeometry(0.13, 0.2, 1.8, 5),
      color: trunkColor,
      matrix: new THREE.Matrix4().makeTranslation(0, 0.9, 0)
    },
    ...tiers.map((tier, index) => ({
      geometry: new THREE.ConeGeometry(tier.radius, tier.height, index === 0 ? 7 : 6),
      color: tier.color,
      matrix: new THREE.Matrix4().makeTranslation(0, tier.y + tier.height / 2, 0)
    }))
  ];
  const merged = mergeParts(parts);
  parts.forEach((part) => part.geometry.dispose());
  return merged;
}

function buildBoulderGeometry(): THREE.BufferGeometry {
  const rock = new THREE.IcosahedronGeometry(1, 0);
  const merged = mergeParts([{ geometry: rock, color: new THREE.Color('#c3cec4'), matrix: new THREE.Matrix4() }]);
  rock.dispose();
  return merged;
}

function nearLake(x: number, z: number, margin: number): boolean {
  return Math.hypot(x - LAKE.x, z - LAKE.z) < LAKE.radius * margin;
}

function plantable(x: number, z: number, minHeight = -0.35): number | null {
  if (nearLake(x, z, LAKE_CLEARANCE)) return null;
  if (Math.abs(x - trailX(z)) < TRAIL_CLEARANCE) return null;
  const height = terrainHeight(x, z);
  if (height < minHeight || height > TREELINE) return null;
  return height;
}

interface Placement {
  position: [number, number, number];
  rotation: number;
  scale: number;
  tint: number;
}

function buildTrees(): Placement[] {
  const random = mulberry32(0x5eed1a7e);
  const trees: Placement[] = [];

  const place = (x: number, z: number, scaleBias: number) => {
    const height = plantable(x, z);
    if (height === null) return;
    trees.push({
      position: [x, height - 0.15, z],
      rotation: random() * Math.PI * 2,
      scale: (0.66 + random() * 0.74) * scaleBias,
      tint: 0.86 + random() * 0.3
    });
  };

  // Hedge rows beside the path: the corridor that frames the journey
  for (let z = 250; z > -455; z -= 4.6) {
    [-1, 1].forEach((side) => {
      if (random() > 0.78) return;
      const lateral = 7.2 + random() * random() * 28;
      place(trailX(z) + side * lateral + (random() - 0.5) * 3.4, z + (random() - 0.5) * 4, 0.95);
    });
  }

  // Meadows and the foot of the slopes
  for (let i = 0; i < TREE_TARGET * 2 && trees.length < TREE_TARGET; i++) {
    const x = -250 + random() * 500;
    const z = -400 + random() * 620;
    // Thin the forest with altitude so the ridge line stays bare rock
    const height = terrainHeight(x, z);
    if (height > 0 && random() > 1 - smoothstep(6, TREELINE, height) * 0.75) continue;
    place(x, z, 0.9);
  }

  return trees;
}

function buildBoulders(): Placement[] {
  const random = mulberry32(0xb0d1e5);
  const boulders: Placement[] = [];

  const place = (x: number, z: number) => {
    // Rocks may sit in the shallows; only trees keep to dry ground
    const height = plantable(x, z, -1.9);
    if (height === null) return;
    boulders.push({
      position: [x, height - 0.12, z],
      rotation: random() * Math.PI * 2,
      scale: 0.7 + random() * 1.7,
      tint: 0.82 + random() * 0.36
    });
  };

  // Bends in the path carry the rock clusters
  for (let z = 240; z > -450; z -= 7) {
    const bend = Math.abs(trailX(z - 5) - 2 * trailX(z) + trailX(z + 5));
    if (bend < 0.09 || random() > 0.55) continue;
    const side = random() > 0.5 ? 1 : -1;
    place(trailX(z) + side * (4.6 + random() * 3.4), z + (random() - 0.5) * 4);
  }

  // A broken shore around the water
  for (let i = 0; i < BOULDER_TARGET; i++) {
    const angle = random() * Math.PI * 2;
    const radius = LAKE.radius * (0.92 + random() * 0.34);
    place(LAKE.x + Math.cos(angle) * radius, LAKE.z + Math.sin(angle) * radius);
  }

  return boulders;
}

const scratchMatrix = new THREE.Matrix4();
const scratchQuaternion = new THREE.Quaternion();
const scratchPosition = new THREE.Vector3();
const scratchScale = new THREE.Vector3();
const scratchTint = new THREE.Color();
const WORLD_UP = new THREE.Vector3(0, 1, 0);

function buildInstanced(geometry: THREE.BufferGeometry, material: THREE.Material, placements: Placement[]): THREE.InstancedMesh {
  const mesh = new THREE.InstancedMesh(geometry, material, placements.length);
  placements.forEach((placement, index) => {
    scratchQuaternion.setFromAxisAngle(WORLD_UP, placement.rotation);
    scratchPosition.set(...placement.position);
    scratchScale.setScalar(placement.scale);
    scratchMatrix.compose(scratchPosition, scratchQuaternion, scratchScale);
    mesh.setMatrixAt(index, scratchMatrix);
    // A little hue variation keeps the canopy from reading as one flat green
    mesh.setColorAt(index, scratchTint.setScalar(placement.tint));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false;
  return mesh;
}

export function Foliage() {
  const live = useLivePalette();
  const treeGeometry = useMemo(buildTreeGeometry, []);
  const boulderGeometry = useMemo(buildBoulderGeometry, []);
  const treeMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.88, metalness: 0 }),
    []
  );
  const boulderMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.96, metalness: 0 }),
    []
  );
  const trees = useMemo(() => buildInstanced(treeGeometry, treeMaterial, buildTrees()), [treeGeometry, treeMaterial]);
  const boulders = useMemo(() => buildInstanced(boulderGeometry, boulderMaterial, buildBoulders()), [boulderGeometry, boulderMaterial]);

  useFrame(() => {
    // The palette tints the baked greens: identity by day, violet by dusk
    treeMaterial.color.copy(live.colors.foliage);
    boulderMaterial.color.copy(live.colors.boulder);
    treeMaterial.emissive.copy(live.colors.foliage).multiplyScalar(live.numbers.foliageGlow * 0.5);
    treeMaterial.emissiveIntensity = 1;
    boulderMaterial.emissive.copy(live.colors.boulder).multiplyScalar(live.numbers.foliageGlow * 0.5);
    boulderMaterial.emissiveIntensity = 1;
  });

  return (
    <>
      <primitive object={trees} />
      <primitive object={boulders} />
    </>
  );
}
