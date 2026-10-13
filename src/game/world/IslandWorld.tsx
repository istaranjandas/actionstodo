import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CylinderCollider, RigidBody } from '@react-three/rapier';
import { JumpPad } from './JumpPad';
import { ARENA_PALETTES, ISLAND_RADIUS, JUMP_PAD_POSITIONS } from './arenaPalette';
import { createIslandGridTexture } from './gridTexture';
import type { Theme } from '../../types';

interface IslandWorldProps {
  theme: Theme;
  animate: boolean;
}

const PILLAR_COUNT = 12;

export function IslandWorld({ theme, animate }: IslandWorldProps) {
  const palette = ARENA_PALETTES[theme];
  const pillarMeshRef = useRef<THREE.InstancedMesh>(null);
  const crownMeshRef = useRef<THREE.InstancedMesh>(null);
  const scratch = useMemo(() => ({ matrix: new THREE.Matrix4(), position: new THREE.Vector3(), rotation: new THREE.Quaternion(), scale: new THREE.Vector3(1, 1, 1), axis: new THREE.Vector3(0, 1, 0) }), []);

  const pillars = useMemo(
    () =>
      Array.from({ length: PILLAR_COUNT }, (_, index) => {
        const angle = (index / PILLAR_COUNT) * Math.PI * 2;
        const radius = ISLAND_RADIUS - 1.1;
        return {
          x: Math.cos(angle) * radius,
          z: Math.sin(angle) * radius,
          height: index % 3 === 0 ? 4.2 : index % 2 === 0 ? 2.8 : 3.4,
          phase: index * 0.9
        };
      }),
    []
  );

  const geometries = useMemo(
    () => ({
      islandTop: new THREE.CircleGeometry(ISLAND_RADIUS, 64),
      islandEdge: new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 0.97, 1, 64, 1, true),
      islandRock: new THREE.ConeGeometry(ISLAND_RADIUS * 0.97, 9.2, 24, 1),
      pillar: new THREE.CylinderGeometry(0.42, 0.55, 1, 6, 1),
      crown: new THREE.OctahedronGeometry(0.32, 0)
    }),
    []
  );

  const materials = useMemo(
    () => ({
      islandTop: new THREE.MeshLambertMaterial(),
      islandEdge: new THREE.MeshLambertMaterial({ flatShading: true }),
      islandRock: new THREE.MeshLambertMaterial({ flatShading: true }),
      pillar: new THREE.MeshLambertMaterial({ flatShading: true }),
      crown: new THREE.MeshBasicMaterial()
    }),
    []
  );

  const gridTexture = useMemo(
    () => createIslandGridTexture(palette.gridCell, palette.gridSection, palette.islandTop, (ISLAND_RADIUS * 2) / 5),
    [palette]
  );

  useEffect(() => {
    materials.islandTop.map = gridTexture;
    materials.islandTop.needsUpdate = true;
    return () => gridTexture.dispose();
  }, [materials, gridTexture]);

  useEffect(() => {
    materials.islandEdge.color.set(palette.islandRock);
    materials.islandRock.color.set(palette.islandRock);
    materials.pillar.color.set(palette.pillar);
    materials.crown.color.set(palette.pillarGlow);
  }, [materials, palette]);

  useEffect(
    () => () => {
      Object.values(geometries).forEach((geometry) => geometry.dispose());
      Object.values(materials).forEach((material) => material.dispose());
    },
    [geometries, materials]
  );

  useLayoutEffect(() => {
    const pillarMesh = pillarMeshRef.current;
    const crownMesh = crownMeshRef.current;
    if (!pillarMesh || !crownMesh) return;
    pillars.forEach((pillar, index) => {
      scratch.position.set(pillar.x, pillar.height / 2, pillar.z);
      scratch.scale.set(1, pillar.height, 1);
      scratch.rotation.identity();
      scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale);
      pillarMesh.setMatrixAt(index, scratch.matrix);

      scratch.position.set(pillar.x, pillar.height + 0.9, pillar.z);
      scratch.scale.set(1, 1, 1);
      scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale);
      crownMesh.setMatrixAt(index, scratch.matrix);
    });
    pillarMesh.instanceMatrix.needsUpdate = true;
    crownMesh.instanceMatrix.needsUpdate = true;
    pillarMesh.computeBoundingSphere();
    crownMesh.computeBoundingSphere();
  }, [pillars, scratch]);

  useFrame((state) => {
    const crownMesh = crownMeshRef.current;
    if (!animate || !crownMesh) return;
    const elapsed = state.clock.elapsedTime;
    pillars.forEach((pillar, index) => {
      scratch.position.set(pillar.x, pillar.height + 0.9 + Math.sin(elapsed * 1.2 + pillar.phase) * 0.18, pillar.z);
      scratch.rotation.setFromAxisAngle(scratch.axis, elapsed * 0.6 + pillar.phase);
      scratch.scale.set(1, 1, 1);
      scratch.matrix.compose(scratch.position, scratch.rotation, scratch.scale);
      crownMesh.setMatrixAt(index, scratch.matrix);
    });
    crownMesh.instanceMatrix.needsUpdate = true;
  });

  return (
    <>
      <color attach="background" args={[palette.sky]} />
      <fog attach="fog" args={[palette.fog, 26, 70]} />
      <hemisphereLight args={[palette.hemisphereSky, palette.hemisphereGround, 1.1]} />
      <directionalLight position={[14, 24, 10]} intensity={1.8} color={palette.sunColor} />
      <ambientLight intensity={0.45} color="#ffd8b0" />

      <RigidBody type="fixed" colliders={false} friction={1}>
        <CylinderCollider args={[0.5, ISLAND_RADIUS]} position={[0, -0.5, 0]} />
        {pillars.map((pillar, index) => (
          <CylinderCollider key={index} args={[pillar.height / 2, 0.55]} position={[pillar.x, pillar.height / 2, pillar.z]} />
        ))}
      </RigidBody>

      <mesh geometry={geometries.islandTop} material={materials.islandTop} position={[0, 0, 0]} rotation-x={-Math.PI / 2} />
      <mesh geometry={geometries.islandEdge} material={materials.islandEdge} position={[0, -0.5, 0]} />
      <mesh geometry={geometries.islandRock} material={materials.islandRock} position={[0, -5.6, 0]} rotation-x={Math.PI} />

      <instancedMesh ref={pillarMeshRef} args={[geometries.pillar, materials.pillar, PILLAR_COUNT]} />
      <instancedMesh ref={crownMeshRef} args={[geometries.crown, materials.crown, PILLAR_COUNT]} />

      {JUMP_PAD_POSITIONS.map((position) => (
        <JumpPad key={position.join(',')} position={position} glowColor={palette.jumpPadGlow} animate={animate} />
      ))}
    </>
  );
}
