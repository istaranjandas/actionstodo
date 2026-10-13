import { memo, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { CuboidCollider, RigidBody } from '@react-three/rapier';
import type { RapierRigidBody } from '@react-three/rapier';
import { arenaRuntime, requestBurst } from '../state/arenaRuntime';
import { celebrateAtScreenPoint } from '../effects/celebrate';
import { playVictoryChime } from '../effects/arenaAudio';
import { relicAssets } from './relicAssets';
import type { RelicStatus } from './relicLayout';
import type { Task } from '../../types';

interface QuestRelicProps {
  task: Task;
  status: RelicStatus;
  spawn: [number, number];
  dropFromSky: boolean;
  animate: boolean;
  celebrate: boolean;
  onCompleteQuest: (taskId: string) => void;
}

const RELIC_HALF_HEIGHT = 0.85;
const LAUNCH_SPEED = 15;

export const QuestRelic = memo(function QuestRelic({ task, status, spawn, dropFromSky, animate, celebrate, onCompleteQuest }: QuestRelicProps) {
  const bodyRef = useRef<RapierRigidBody>(null);
  const crystalRef = useRef<THREE.Mesh>(null);
  const haloRef = useRef<THREE.Mesh>(null);
  const camera = useThree((state) => state.camera);
  const canvasElement = useThree((state) => state.gl.domElement);
  const awaitingLanding = useRef(dropFromSky);
  const wasCompleted = useRef(task.completed);
  const spinBoost = useRef(0);
  const focusMix = useRef(0);
  const phase = useMemo(() => Math.random() * Math.PI * 2, []);
  const spawnHeight = useMemo(() => (dropFromSky ? 12 + Math.random() * 4 : RELIC_HALF_HEIGHT + 0.02), [dropFromSky]);
  const projectionScratch = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const body = bodyRef.current;
    if (!body) return;
    arenaRuntime.relics.set(task.id, body);
    return () => {
      if (arenaRuntime.relics.get(task.id) === body) arenaRuntime.relics.delete(task.id);
    };
  }, [task.id]);

  useEffect(() => {
    const body = bodyRef.current;
    const justCompleted = task.completed && !wasCompleted.current;
    wasCompleted.current = task.completed;
    if (!justCompleted || !body) return;

    const position = body.translation();
    body.setLinvel({ x: (Math.random() - 0.5) * 3, y: LAUNCH_SPEED, z: (Math.random() - 0.5) * 3 }, true);
    awaitingLanding.current = true;
    spinBoost.current = 16;
    requestBurst('victory', { x: position.x, y: position.y + 0.6, z: position.z });
    playVictoryChime();

    if (celebrate) {
      projectionScratch.set(position.x, position.y + 0.8, position.z).project(camera);
      const bounds = canvasElement.getBoundingClientRect();
      celebrateAtScreenPoint({
        x: (bounds.left + ((projectionScratch.x + 1) / 2) * bounds.width) / window.innerWidth,
        y: (bounds.top + ((1 - projectionScratch.y) / 2) * bounds.height) / window.innerHeight
      });
    }
  }, [task.completed, camera, canvasElement, celebrate, projectionScratch]);

  useFrame((state, delta) => {
    const crystal = crystalRef.current;
    if (!crystal) return;
    const isFocused = arenaRuntime.focusedTaskId === task.id;
    focusMix.current = THREE.MathUtils.damp(focusMix.current, isFocused ? 1 : 0, 8, delta);
    spinBoost.current = spinBoost.current > 0.01 ? THREE.MathUtils.damp(spinBoost.current, 0, 1.2, delta) : 0;

    crystal.rotation.y += delta * ((animate ? 0.6 : 0) + spinBoost.current);
    crystal.position.y = animate ? Math.sin(state.clock.elapsedTime * 1.6 + phase) * 0.08 : 0;
    crystal.scale.setScalar(1 + focusMix.current * 0.12);
    haloRef.current?.scale.setScalar(1 + focusMix.current * 0.45);
  });

  const handleLanding = () => {
    if (!awaitingLanding.current || !bodyRef.current) return;
    awaitingLanding.current = false;
    const position = bodyRef.current.translation();
    requestBurst('dust', { x: position.x, y: 0.05, z: position.z });
  };

  const handleTap = (event: ThreeEvent<MouseEvent>) => {
    if (task.completed || arenaRuntime.focusedTaskId !== task.id) return;
    event.stopPropagation();
    onCompleteQuest(task.id);
  };

  return (
    <RigidBody
      ref={bodyRef}
      name="relic"
      colliders={false}
      position={[spawn[0], spawnHeight, spawn[1]]}
      enabledRotations={[false, false, false]}
      linearDamping={0.4}
      onCollisionEnter={handleLanding}
    >
      <CuboidCollider args={[0.42, RELIC_HALF_HEIGHT, 0.42]} restitution={0.35} density={6} friction={0.8} />
      <mesh ref={crystalRef} geometry={relicAssets.crystalGeometry} material={relicAssets.crystalMaterials[status]} onClick={handleTap} />
      <mesh
        ref={haloRef}
        geometry={relicAssets.haloGeometry}
        material={relicAssets.haloMaterials[status]}
        position={[0, -RELIC_HALF_HEIGHT + 0.03, 0]}
        rotation-x={-Math.PI / 2}
      />
    </RigidBody>
  );
});
