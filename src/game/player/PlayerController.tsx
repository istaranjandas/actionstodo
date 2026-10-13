import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { CapsuleCollider, RigidBody, useRapier } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { RobotAvatar } from './RobotAvatar';
import { gameInput, readMovementAxes } from '../input/gameInput';
import { arenaRuntime, requestBurst } from '../state/arenaRuntime';
import { PLAYER_SPAWN } from '../world/arenaPalette';

interface PlayerControllerProps {
  animate: boolean;
}

const WALK_SPEED = 5.6;
const SPRINT_SPEED = 9.6;
const GROUND_ACCELERATION = 14;
const AIR_ACCELERATION = 4.5;
const JUMP_SPEED = 7.8;
const COYOTE_TIME = 0.12;
const JUMP_BUFFER_TIME = 0.15;
const CAPSULE_HALF_HEIGHT = 0.45;
const CAPSULE_RADIUS = 0.4;
const GROUND_PROBE_LENGTH = CAPSULE_HALF_HEIGHT + CAPSULE_RADIUS + 0.12;
const FALL_RESPAWN_HEIGHT = -14;
const SHADOW_PROBE_LENGTH = 24;

const blobShadowGeometry = new THREE.CircleGeometry(0.5, 20);
const blobShadowMaterial = new THREE.MeshBasicMaterial({ color: '#000000', transparent: true, opacity: 0.35, depthWrite: false });

export function releasePlayerGpuResources(): void {
  blobShadowGeometry.dispose();
  blobShadowMaterial.dispose();
}

const shortestAngle = (from: number, to: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

export function PlayerController({ animate }: PlayerControllerProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const avatarRef = useRef<THREE.Group>(null);
  const blobShadowRef = useRef<THREE.Mesh>(null);
  const { rapier, world } = useRapier();
  const motion = useRef({ heading: Math.PI, lean: 0, tilt: 0, speedRatio: 0, airTime: 0, jumpBufferedFor: 0, wasGrounded: true });
  const probeRay = useMemo(() => new rapier.Ray({ x: 0, y: 0, z: 0 }, { x: 0, y: -1, z: 0 }), [rapier]);

  useEffect(() => {
    arenaRuntime.player = bodyRef.current;
    return () => {
      arenaRuntime.player = null;
    };
  }, []);

  useFrame((_, rawDelta) => {
    const body = bodyRef.current;
    const avatar = avatarRef.current;
    if (!body || !avatar) return;
    const delta = Math.min(rawDelta, 1 / 20);
    const state = motion.current;
    const position = body.translation();

    if (position.y < FALL_RESPAWN_HEIGHT) {
      body.setTranslation({ x: PLAYER_SPAWN[0], y: PLAYER_SPAWN[1] + 4, z: PLAYER_SPAWN[2] }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      return;
    }

    probeRay.origin = { x: position.x, y: position.y, z: position.z };
    const groundHit = world.castRay(probeRay, SHADOW_PROBE_LENGTH, true, undefined, undefined, undefined, body);
    const isGrounded = groundHit !== null && groundHit.timeOfImpact <= GROUND_PROBE_LENGTH;
    const blobShadow = blobShadowRef.current;
    if (blobShadow) {
      blobShadow.visible = groundHit !== null;
      if (groundHit) {
        const heightAboveGround = Math.max(0, groundHit.timeOfImpact - CAPSULE_HALF_HEIGHT - CAPSULE_RADIUS);
        blobShadow.position.set(position.x, position.y - groundHit.timeOfImpact + 0.02, position.z);
        blobShadow.scale.setScalar(Math.max(0.35, 1 - heightAboveGround * 0.12));
        blobShadowMaterial.opacity = Math.max(0.08, 0.35 - heightAboveGround * 0.04);
      }
    }
    state.airTime = isGrounded ? 0 : state.airTime + delta;

    if (isGrounded && !state.wasGrounded && body.linvel().y < -6) {
      requestBurst('dust', { x: position.x, y: position.y - GROUND_PROBE_LENGTH + 0.1, z: position.z });
    }
    state.wasGrounded = isGrounded;

    const { forward, right, sprint } = readMovementAxes();
    const yaw = arenaRuntime.cameraYaw;
    const forwardX = -Math.sin(yaw);
    const forwardZ = -Math.cos(yaw);
    let moveX = forwardX * forward - forwardZ * right;
    let moveZ = forwardZ * forward + forwardX * right;
    const moveLength = Math.hypot(moveX, moveZ);
    if (moveLength > 1) {
      moveX /= moveLength;
      moveZ /= moveLength;
    }

    const targetSpeed = sprint ? SPRINT_SPEED : WALK_SPEED;
    const velocity = body.linvel();
    const acceleration = isGrounded ? GROUND_ACCELERATION : AIR_ACCELERATION;
    const nextVelocityX = THREE.MathUtils.damp(velocity.x, moveX * targetSpeed, acceleration, delta);
    const nextVelocityZ = THREE.MathUtils.damp(velocity.z, moveZ * targetSpeed, acceleration, delta);
    let nextVelocityY = velocity.y;

    if (gameInput.jumpRequested) {
      state.jumpBufferedFor = JUMP_BUFFER_TIME;
      gameInput.jumpRequested = false;
    }
    if (state.jumpBufferedFor > 0 && state.airTime <= COYOTE_TIME) {
      nextVelocityY = JUMP_SPEED;
      state.jumpBufferedFor = 0;
      state.airTime = COYOTE_TIME + 0.01;
    }
    state.jumpBufferedFor = Math.max(0, state.jumpBufferedFor - delta);

    body.setLinvel({ x: nextVelocityX, y: nextVelocityY, z: nextVelocityZ }, true);

    const planarSpeed = Math.hypot(nextVelocityX, nextVelocityZ);
    state.speedRatio = THREE.MathUtils.clamp(planarSpeed / SPRINT_SPEED, 0, 1);

    if (planarSpeed > 0.4) {
      const targetHeading = Math.atan2(nextVelocityX, nextVelocityZ);
      const turn = shortestAngle(state.heading, targetHeading);
      state.heading += turn * (1 - Math.exp(-10 * delta));
      state.lean = THREE.MathUtils.damp(state.lean, THREE.MathUtils.clamp(-turn * 0.6, -0.35, 0.35), 8, delta);
    } else {
      state.lean = THREE.MathUtils.damp(state.lean, 0, 8, delta);
    }
    state.tilt = THREE.MathUtils.damp(state.tilt, state.speedRatio * 0.22 * (isGrounded ? 1 : 0.4), 6, delta);

    avatar.rotation.set(state.tilt, state.heading, state.lean, 'YXZ');
  });

  return (
    <>
    <mesh ref={blobShadowRef} geometry={blobShadowGeometry} material={blobShadowMaterial} rotation-x={-Math.PI / 2} renderOrder={1} />
    <RigidBody
      ref={bodyRef}
      name="player"
      colliders={false}
      position={PLAYER_SPAWN}
      enabledRotations={[false, false, false]}
      linearDamping={0.15}
      ccd
    >
      <CapsuleCollider args={[CAPSULE_HALF_HEIGHT, CAPSULE_RADIUS]} friction={0} />
      <RobotAvatar ref={avatarRef} animate={animate} getSpeedRatio={() => motion.current.speedRatio} />
    </RigidBody>
    </>
  );
}
