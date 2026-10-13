import { forwardRef, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';

interface RobotAvatarProps {
  animate: boolean;
  getSpeedRatio: () => number;
}

export const robotAssets = {
  shellMaterial: new THREE.MeshLambertMaterial({ color: '#f4f1ff' }),
  trimMaterial: new THREE.MeshLambertMaterial({ color: '#3a3f66' }),
  visorMaterial: new THREE.MeshBasicMaterial({ color: '#2de2ff' }),
  coreMaterial: new THREE.MeshBasicMaterial({ color: '#ff6bd5' }),
  torsoGeometry: new THREE.CapsuleGeometry(0.36, 0.5, 4, 12),
  headGeometry: new THREE.SphereGeometry(0.3, 16, 12),
  visorGeometry: new THREE.SphereGeometry(0.22, 14, 10),
  coreGeometry: new THREE.SphereGeometry(0.1, 10, 8),
  antennaGeometry: new THREE.CylinderGeometry(0.018, 0.018, 0.22, 5),
  antennaTipGeometry: new THREE.SphereGeometry(0.055, 8, 6),
  armGeometry: new THREE.CapsuleGeometry(0.08, 0.32, 2, 6),
  footGeometry: new THREE.BoxGeometry(0.18, 0.16, 0.3)
};

export function releaseRobotGpuResources(): void {
  Object.values(robotAssets).forEach((resource) => resource.dispose());
}

export const RobotAvatar = forwardRef<THREE.Group, RobotAvatarProps>(function RobotAvatar({ animate, getSpeedRatio }, ref) {
  const bodyRef = useRef<THREE.Group>(null);
  const leftFootRef = useRef<THREE.Mesh>(null);
  const rightFootRef = useRef<THREE.Mesh>(null);
  const stride = useRef(0);

  useFrame((state, delta) => {
    const speedRatio = getSpeedRatio();
    if (speedRatio > 0.05) stride.current += delta * (4 + speedRatio * 10);
    if (bodyRef.current) {
      const idleBob = animate ? Math.sin(state.clock.elapsedTime * 2.2) * 0.03 : 0;
      bodyRef.current.position.y = idleBob + Math.abs(Math.sin(stride.current)) * 0.08 * speedRatio;
    }
    if (leftFootRef.current && rightFootRef.current) {
      leftFootRef.current.position.z = Math.sin(stride.current) * 0.22 * speedRatio;
      rightFootRef.current.position.z = -Math.sin(stride.current) * 0.22 * speedRatio;
    }
  });

  return (
    <group ref={ref}>
      <group ref={bodyRef}>
        <mesh geometry={robotAssets.torsoGeometry} material={robotAssets.shellMaterial} position={[0, -0.05, 0]} />
        <mesh geometry={robotAssets.coreGeometry} material={robotAssets.coreMaterial} position={[0, 0.02, 0.33]} />
        <mesh geometry={robotAssets.headGeometry} material={robotAssets.shellMaterial} position={[0, 0.62, 0]} />
        <mesh geometry={robotAssets.visorGeometry} material={robotAssets.visorMaterial} position={[0, 0.64, 0.18]} scale={[1, 0.55, 0.6]} />
        <mesh geometry={robotAssets.antennaGeometry} material={robotAssets.trimMaterial} position={[0, 0.98, 0]} />
        <mesh geometry={robotAssets.antennaTipGeometry} material={robotAssets.coreMaterial} position={[0, 1.11, 0]} />
        <mesh geometry={robotAssets.armGeometry} material={robotAssets.trimMaterial} position={[-0.42, 0.02, 0]} rotation-z={0.25} />
        <mesh geometry={robotAssets.armGeometry} material={robotAssets.trimMaterial} position={[0.42, 0.02, 0]} rotation-z={-0.25} />
      </group>
      <mesh ref={leftFootRef} geometry={robotAssets.footGeometry} material={robotAssets.trimMaterial} position={[-0.17, -0.72, 0]} />
      <mesh ref={rightFootRef} geometry={robotAssets.footGeometry} material={robotAssets.trimMaterial} position={[0.17, -0.72, 0]} />
    </group>
  );
});
