import { useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import type { IntersectionEnterPayload } from '@react-three/rapier';
import { requestBurst } from '../state/arenaRuntime';
import { playJumpPadBoing } from '../effects/arenaAudio';

interface JumpPadProps {
  position: [number, number, number];
  glowColor: string;
  animate: boolean;
}

const JUMP_PAD_LAUNCH_SPEED = 14;

export function JumpPad({ position, glowColor, animate }: JumpPadProps) {
  const ringRef = useRef<THREE.Mesh>(null);
  const chevronRef = useRef<THREE.Group>(null);
  const pulse = useRef(0);

  const launchPlayer = ({ other }: IntersectionEnterPayload) => {
    if (other.rigidBodyObject?.name !== 'player' || !other.rigidBody) return;
    const velocity = other.rigidBody.linvel();
    other.rigidBody.setLinvel({ x: velocity.x, y: JUMP_PAD_LAUNCH_SPEED, z: velocity.z }, true);
    requestBurst('dust', { x: position[0], y: 0.1, z: position[2] });
    playJumpPadBoing();
    pulse.current = 1;
  };

  useFrame((state, delta) => {
    pulse.current = Math.max(0, pulse.current - delta * 2.5);
    const ring = ringRef.current;
    if (ring) {
      const breathing = animate ? Math.sin(state.clock.elapsedTime * 3) * 0.05 : 0;
      ring.scale.setScalar(1 + breathing + pulse.current * 0.35);
    }
    if (chevronRef.current && animate) {
      chevronRef.current.position.y = 0.45 + ((state.clock.elapsedTime * 0.8) % 1) * 0.5;
    }
  });

  return (
    <group position={position}>
      <RigidBody type="fixed" colliders={false}>
        <CuboidCollider args={[1, 0.12, 1]} position={[0, 0.12, 0]} />
        <CuboidCollider sensor args={[0.95, 0.35, 0.95]} position={[0, 0.5, 0]} onIntersectionEnter={launchPlayer} />
      </RigidBody>
      <mesh position={[0, 0.12, 0]}>
        <cylinderGeometry args={[1.15, 1.25, 0.24, 20, 1]} />
        <meshLambertMaterial color="#3b3f5c" />
      </mesh>
      <mesh ref={ringRef} position={[0, 0.25, 0]} rotation-x={-Math.PI / 2}>
        <ringGeometry args={[0.62, 0.92, 24]} />
        <meshBasicMaterial color={glowColor} toneMapped={false} transparent opacity={0.9} />
      </mesh>
      <group ref={chevronRef} position={[0, 0.45, 0]}>
        <mesh rotation-x={-Math.PI / 2}>
          <ringGeometry args={[0.28, 0.36, 3, 1]} />
          <meshBasicMaterial color={glowColor} toneMapped={false} transparent opacity={0.65} side={THREE.DoubleSide} />
        </mesh>
      </group>
    </group>
  );
}
