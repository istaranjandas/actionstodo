import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { gameInput } from '../input/gameInput';
import { arenaRuntime } from '../state/arenaRuntime';
import { PLAYER_SPAWN } from '../world/arenaPalette';

const MIN_DISTANCE = 6;
const MAX_DISTANCE = 18;
const HEIGHT_RATIO = 0.58;
const POSITION_SMOOTHING = 5.5;
const TARGET_SMOOTHING = 9;
const LOOK_AHEAD = 0.18;

export function ChaseCamera() {
  const camera = useThree((state) => state.camera);
  const smoothedTarget = useMemo(() => new THREE.Vector3(...PLAYER_SPAWN), []);
  const desiredPosition = useMemo(() => new THREE.Vector3(), []);
  const desiredTarget = useMemo(() => new THREE.Vector3(), []);

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    arenaRuntime.cameraYaw += gameInput.cameraYawDelta;
    gameInput.cameraYawDelta = 0;
    arenaRuntime.cameraDistance = THREE.MathUtils.clamp(arenaRuntime.cameraDistance + gameInput.cameraZoomDelta, MIN_DISTANCE, MAX_DISTANCE);
    gameInput.cameraZoomDelta = 0;

    const player = arenaRuntime.player;
    if (player) {
      const position = player.translation();
      const velocity = player.linvel();
      desiredTarget.set(position.x + velocity.x * LOOK_AHEAD, position.y + 0.6, position.z + velocity.z * LOOK_AHEAD);
    }

    smoothedTarget.x = THREE.MathUtils.lerp(smoothedTarget.x, desiredTarget.x, 1 - Math.exp(-TARGET_SMOOTHING * delta));
    smoothedTarget.y = THREE.MathUtils.lerp(smoothedTarget.y, desiredTarget.y, 1 - Math.exp(-TARGET_SMOOTHING * 0.6 * delta));
    smoothedTarget.z = THREE.MathUtils.lerp(smoothedTarget.z, desiredTarget.z, 1 - Math.exp(-TARGET_SMOOTHING * delta));

    const distance = arenaRuntime.cameraDistance;
    const yaw = arenaRuntime.cameraYaw;
    desiredPosition.set(
      smoothedTarget.x + Math.sin(yaw) * distance,
      smoothedTarget.y + distance * HEIGHT_RATIO,
      smoothedTarget.z + Math.cos(yaw) * distance
    );

    const blend = 1 - Math.exp(-POSITION_SMOOTHING * delta);
    camera.position.set(
      THREE.MathUtils.lerp(camera.position.x, desiredPosition.x, blend),
      THREE.MathUtils.lerp(camera.position.y, desiredPosition.y, blend),
      THREE.MathUtils.lerp(camera.position.z, desiredPosition.z, blend)
    );
    camera.lookAt(smoothedTarget);
  });

  return null;
}
