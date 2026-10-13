import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { RelicStatus } from './relicLayout';

export const RELIC_COLORS: Record<RelicStatus, string> = {
  urgent: '#ff3352',
  normal: '#22d8ff',
  completed: '#ffc23d'
};

function buildCrystalGeometry(): THREE.BufferGeometry {
  const shaft = new THREE.CylinderGeometry(0.34, 0.4, 1.0, 6, 1);
  const crown = new THREE.ConeGeometry(0.34, 0.44, 6, 1);
  crown.translate(0, 0.72, 0);
  const base = new THREE.ConeGeometry(0.4, 0.24, 6, 1);
  base.rotateX(Math.PI);
  base.translate(0, -0.62, 0);
  const merged = mergeGeometries([shaft.toNonIndexed(), crown.toNonIndexed(), base.toNonIndexed()]);
  merged.computeVertexNormals();
  [shaft, crown, base].forEach((part) => part.dispose());
  return merged;
}

export const relicAssets = {
  crystalGeometry: buildCrystalGeometry(),
  haloGeometry: new THREE.RingGeometry(0.55, 0.78, 24),
  crystalMaterials: {
    urgent: new THREE.MeshLambertMaterial({ color: RELIC_COLORS.urgent, emissive: RELIC_COLORS.urgent, emissiveIntensity: 0.55, flatShading: true }),
    normal: new THREE.MeshLambertMaterial({ color: RELIC_COLORS.normal, emissive: RELIC_COLORS.normal, emissiveIntensity: 0.5, flatShading: true }),
    completed: new THREE.MeshLambertMaterial({ color: RELIC_COLORS.completed, emissive: RELIC_COLORS.completed, emissiveIntensity: 0.75, flatShading: true })
  } satisfies Record<RelicStatus, THREE.Material>,
  haloMaterials: {
    urgent: new THREE.MeshBasicMaterial({ color: RELIC_COLORS.urgent, transparent: true, opacity: 0.6, depthWrite: false, blending: THREE.AdditiveBlending }),
    normal: new THREE.MeshBasicMaterial({ color: RELIC_COLORS.normal, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending }),
    completed: new THREE.MeshBasicMaterial({ color: RELIC_COLORS.completed, transparent: true, opacity: 0.7, depthWrite: false, blending: THREE.AdditiveBlending })
  } satisfies Record<RelicStatus, THREE.Material>
};

export function releaseRelicGpuResources(): void {
  relicAssets.crystalGeometry.dispose();
  relicAssets.haloGeometry.dispose();
  Object.values(relicAssets.crystalMaterials).forEach((material) => material.dispose());
  Object.values(relicAssets.haloMaterials).forEach((material) => material.dispose());
}
