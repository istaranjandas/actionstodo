// The path itself: a worn stone ribbon along the valley floor, edged with glowing amber diamond waymarkers.
// Completing a task sends a surge of light along the markers and a warm glow across the stones.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { trailX } from '../trail';
import { subscribeWorldEvents } from '../worldEvents';
import { useLivePalette } from './livePalette';
import { terrainHeight } from './terrainShape';

const TRAIL_START_Z = 240;
const TRAIL_END_Z = -470;
const TRAIL_STEP = 2;
const TRAIL_HALF_WIDTH = 1.7;
const MARKER_SPACING = 9;
const MARKER_AMBER = new THREE.Color('#f59e0b');

function buildTrailGeometry(): THREE.BufferGeometry {
  const rows = Math.floor((TRAIL_START_Z - TRAIL_END_Z) / TRAIL_STEP) + 1;
  const positions = new Float32Array(rows * 3 * 3);
  const colors = new Float32Array(rows * 3 * 3);
  const indices: number[] = [];
  const color = new THREE.Color();
  for (let row = 0; row < rows; row++) {
    const z = TRAIL_START_Z - row * TRAIL_STEP;
    const centre = trailX(z);
    const dx = trailX(z - 1) - trailX(z + 1);
    // Normal to the path direction keeps the width even through bends
    const length = Math.hypot(dx, 2);
    const nx = 2 / length;
    const nz = dx / length;
    [-1, 0, 1].forEach((lateral, column) => {
      const x = centre + nx * lateral * TRAIL_HALF_WIDTH;
      const vz = z + nz * lateral * TRAIL_HALF_WIDTH;
      const index = (row * 3 + column) * 3;
      positions[index] = x;
      positions[index + 1] = terrainHeight(x, vz) + (column === 1 ? 0.08 : 0.04);
      positions[index + 2] = vz;
      const wear = 0.82 + Math.abs(Math.sin(row * 1.7 + column * 2.3)) * 0.22;
      color.setRGB(0.62 * wear, 0.58 * wear, 0.52 * wear);
      colors[index] = color.r;
      colors[index + 1] = color.g;
      colors[index + 2] = color.b;
    });
    if (row < rows - 1) {
      for (let column = 0; column < 2; column++) {
        const a = row * 3 + column;
        const b = a + 1;
        const c = a + 3;
        const d = c + 1;
        indices.push(a, b, c, b, d, c);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const PULSE_DECAY_PER_SECOND = 1 / 1.2;

export function Trail({ animate }: { animate: boolean }) {
  const live = useLivePalette();
  const geometry = useMemo(buildTrailGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, flatShading: true }), []);
  // Self-lit and untouched by tone mapping, so the markers read as glowing in the darkest dusk
  const markerMaterial = useMemo(() => new THREE.MeshBasicMaterial({ color: MARKER_AMBER, toneMapped: false }), []);

  const markers = useMemo(() => {
    const placements: [number, number, number][] = [];
    for (let z = TRAIL_START_Z; z > TRAIL_END_Z; z -= MARKER_SPACING) {
      [-1, 1].forEach((side) => {
        const x = trailX(z) + side * (TRAIL_HALF_WIDTH + 0.35);
        placements.push([x, terrainHeight(x, z) + 0.2, z]);
      });
    }
    return placements;
  }, []);

  const markerMesh = useMemo(() => {
    // A slim upright diamond
    const diamond = new THREE.OctahedronGeometry(0.13, 0);
    diamond.scale(1, 1.55, 1);
    const mesh = new THREE.InstancedMesh(diamond, markerMaterial, markers.length);
    const matrix = new THREE.Matrix4();
    markers.forEach((position, index) => mesh.setMatrixAt(index, matrix.makeTranslation(...position)));
    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }, [markers, markerMaterial]);

  // Completing a task sends a brief surge of warm light along the markers and the path
  const pulse = useRef(0);
  useEffect(
    () =>
      subscribeWorldEvents((event) => {
        if (event.type === 'complete' && animate) pulse.current = 1;
      }),
    [animate]
  );

  useFrame((_, delta) => {
    pulse.current = Math.max(0, pulse.current - Math.min(delta, 1 / 20) * PULSE_DECAY_PER_SECOND);
    material.color.copy(live.colors.terrainTint).lerp(live.colors.snow, 0.25);
    material.emissive.copy(live.colors.beacon);
    material.emissiveIntensity = pulse.current * 0.35;
    const glow = 0.55 + live.numbers.lanternGlow * 0.6 + pulse.current * 1.6;
    markerMaterial.color.copy(MARKER_AMBER).multiplyScalar(glow);
  });

  return (
    <>
      <mesh geometry={geometry} material={material} />
      <primitive object={markerMesh} />
    </>
  );
}
