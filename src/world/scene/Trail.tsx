// The path itself: a worn stone ribbon along the valley floor, edged with glowing amber diamond waymarkers.
// Completing a task sends a surge of light along the markers and a warm glow across the stones.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { trailDistance, trailX } from '../trail';
import { subscribeWorldEvents } from '../worldEvents';
import { useLivePalette } from './livePalette';
import { terrainHeight } from './terrainShape';

const TRAIL_START_Z = 240;
const TRAIL_END_Z = -470;
const TRAIL_STEP = 2;
const TRAIL_HALF_WIDTH = 1.7;
const MARKER_SPACING = 9;
const MARKER_NEAR = 0.35;
const MARKER_FAR = 1;
const MARKER_FADE = 220;

function buildTrailGeometry(): THREE.BufferGeometry {
  const rows = Math.floor((TRAIL_START_Z - TRAIL_END_Z) / TRAIL_STEP) + 1;
  const positions = new Float32Array(rows * 3 * 3);
  const colors = new Float32Array(rows * 3 * 3);
  const indices: number[] = [];
  const color = new THREE.Color();
  // The two outer columns are shoulders: a shade darker, so the carriageway reads at a glance
  const columnShade = [0.64, 1, 0.64];
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
      const wear = (0.9 + Math.abs(Math.sin(row * 1.7 + column * 2.3)) * 0.1) * columnShade[column];
      color.setRGB(wear, wear, wear);
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

// Dashed centre line: a scenic pass reads as a road, not a grey strip
const ROAD_LINE_HALF_WIDTH = 0.085;
const ROAD_DASH = 3.4;
const ROAD_GAP = 4.6;

function buildRoadLineGeometry(): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const point = (z: number, lateral: number): [number, number, number] => {
    const centre = trailX(z);
    const dx = trailX(z - 1) - trailX(z + 1);
    const length = Math.hypot(dx, 2);
    const nx = 2 / length;
    const nz = dx / length;
    const x = centre + nx * lateral;
    const vz = z + nz * lateral;
    return [x, terrainHeight(x, vz) + 0.1, vz];
  };
  const push = (z: number, lateral: number) => {
    const [x, y, vz] = point(z, lateral);
    positions.push(x, y, vz);
    colors.push(1, 1, 1);
  };
  for (let z = TRAIL_START_Z - 12; z > TRAIL_END_Z + 12; z -= ROAD_DASH + ROAD_GAP) {
    const far = z - ROAD_DASH;
    push(z, -ROAD_LINE_HALF_WIDTH);
    push(z, ROAD_LINE_HALF_WIDTH);
    push(far, -ROAD_LINE_HALF_WIDTH);
    push(far, ROAD_LINE_HALF_WIDTH);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  return geometry;
}

const PULSE_DECAY_PER_SECOND = 1 / 1.2;
const HERO_PULSE = 0.16;
const heroMatrix = new THREE.Matrix4();
const heroPosition = new THREE.Vector3();
const heroRotation = new THREE.Quaternion();
const heroScaleVector = new THREE.Vector3();

export function Trail({ animate, focusOffset }: { animate: boolean; focusOffset: number }) {
  const live = useLivePalette();
  const geometry = useMemo(buildTrailGeometry, []);
  const lineGeometry = useMemo(buildRoadLineGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.96, flatShading: true }), []);
  const lineMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0, emissiveIntensity: 0.35 }),
    []
  );
  // Self-lit and untouched by tone mapping, so the markers read as glowing in the darkest dusk
  const markerMaterial = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);

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

  // The marker beside the focused day: the one that pulses, so the eye lands on where you stand
  const heroIndex = useMemo(() => {
    const heroZ = -trailDistance(focusOffset);
    let best = 0;
    let bestGap = Infinity;
    markers.forEach((marker, index) => {
      const gap = Math.abs(marker[2] - heroZ);
      if (gap < bestGap) {
        bestGap = gap;
        best = index;
      }
    });
    return best;
  }, [markers, focusOffset]);

  const markerMesh = useMemo(() => {
    // A slim upright diamond
    const diamond = new THREE.OctahedronGeometry(0.13, 0);
    diamond.scale(1, 1.55, 1);
    const mesh = new THREE.InstancedMesh(diamond, markerMaterial, markers.length);
    const matrix = new THREE.Matrix4();
    const shade = new THREE.Color();
    markers.forEach((position, index) => {
      mesh.setMatrixAt(index, matrix.makeTranslation(...position));
      // Future waymarkers dim with distance, so the path has depth instead of a uniform fence of lights
      const depth = Math.min(1, Math.abs(position[2] - TRAIL_START_Z) / MARKER_FADE);
      const brightness = MARKER_FAR - (MARKER_FAR - MARKER_NEAR) * depth;
      mesh.setColorAt(index, shade.setScalar(brightness));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
    mesh.castShadow = true;
    return mesh;
  }, [markers, markerMaterial]);

  // Completing a task sends a brief surge of warm light along the markers and the path
  const pulse = useRef(0);
  const heroScale = useRef(1);
  useEffect(
    () =>
      subscribeWorldEvents((event) => {
        if (event.type === 'complete' && animate) pulse.current = 1;
      }),
    [animate]
  );

  useFrame(({ clock }, delta) => {
    pulse.current = Math.max(0, pulse.current - Math.min(delta, 1 / 20) * PULSE_DECAY_PER_SECOND);
    material.color.copy(live.colors.terrainTint).lerp(live.colors.snow, 0.25).lerp(live.colors.roadColor, live.numbers.roadColorBlend);
    material.emissive.copy(live.colors.beacon);
    material.emissiveIntensity = pulse.current * 0.35;
    lineMaterial.color.copy(live.colors.roadLine);
    lineMaterial.emissive.copy(live.colors.roadLine);
    const glow = THREE.MathUtils.lerp(1, 0.55 + live.numbers.lanternGlow * 0.6 + pulse.current * 1.6, live.numbers.markerGlow);
    markerMaterial.color.copy(live.colors.marker).multiplyScalar(glow);

    // Only the hero marker breathes, and only while animations are on
    const target = animate ? 1 + Math.sin(clock.elapsedTime * 1.9) * HERO_PULSE : 1;
    if (Math.abs(target - heroScale.current) > 0.004) {
      heroScale.current = target;
      const [x, y, z] = markers[heroIndex];
      heroMatrix.compose(heroPosition.set(x, y, z), heroRotation, heroScaleVector.setScalar(target));
      markerMesh.setMatrixAt(heroIndex, heroMatrix);
      markerMesh.instanceMatrix.needsUpdate = true;
    }
  });

  return (
    <>
      <mesh geometry={geometry} material={material} receiveShadow />
      <mesh geometry={lineGeometry} material={lineMaterial} />
      <primitive object={markerMesh} />
    </>
  );
}
