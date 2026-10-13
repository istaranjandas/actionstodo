import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { arenaRuntime } from '../state/arenaRuntime';
import type { BurstKind } from '../state/arenaRuntime';

interface Particle {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  life: number;
  decay: number;
  size: number;
  gravity: number;
  drag: number;
}

interface Shockwave {
  mesh: THREE.Mesh;
  life: number;
  maxScale: number;
}

const PARTICLE_POOL_SIZE = 260;
const SHOCKWAVE_POOL_SIZE = 8;
const VICTORY_COLORS = ['#ffd45c', '#ff8bdf', '#4fe6ff', '#ffffff'].map((hex) => new THREE.Color(hex).multiplyScalar(3.2));
const DUST_COLOR = new THREE.Color('#d8cfe8');

export function ArenaBursts() {
  const particlesRef = useRef<THREE.InstancedMesh>(null);
  const shockwaveGroupRef = useRef<THREE.Group>(null);
  const nextParticle = useRef(0);
  const nextShockwave = useRef(0);
  const isIdle = useRef(true);
  const particles = useMemo<Particle[]>(
    () =>
      Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
        position: new THREE.Vector3(),
        velocity: new THREE.Vector3(),
        life: 0,
        decay: 1,
        size: 0,
        gravity: 0,
        drag: 0
      })),
    []
  );
  const particleGeometry = useMemo(() => new THREE.OctahedronGeometry(1, 0), []);
  const particleMaterial = useMemo(() => new THREE.MeshBasicMaterial({ toneMapped: false }), []);
  const shockwaveGeometry = useMemo(() => new THREE.RingGeometry(0.82, 1, 56), []);
  const shockwaves = useMemo<Shockwave[]>(
    () =>
      Array.from({ length: SHOCKWAVE_POOL_SIZE }, () => {
        const mesh = new THREE.Mesh(
          shockwaveGeometry,
          new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0, depthWrite: false, toneMapped: false })
        );
        mesh.rotation.x = -Math.PI / 2;
        mesh.scale.setScalar(0.0001);
        return { mesh, life: 0, maxScale: 3 };
      }),
    [shockwaveGeometry]
  );
  const scratch = useMemo(() => ({ matrix: new THREE.Matrix4(), quaternion: new THREE.Quaternion(), scale: new THREE.Vector3() }), []);

  useLayoutEffect(() => {
    const mesh = particlesRef.current;
    if (!mesh) return;
    const neutral = new THREE.Color('#ffffff');
    for (let i = 0; i < PARTICLE_POOL_SIZE; i++) mesh.setColorAt(i, neutral);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, []);

  useEffect(() => {
    const group = shockwaveGroupRef.current;
    if (!group) return;
    shockwaves.forEach(({ mesh }) => group.add(mesh));
    return () => {
      shockwaves.forEach(({ mesh }) => {
        group.remove(mesh);
        (mesh.material as THREE.Material).dispose();
      });
    };
  }, [shockwaves]);

  useEffect(
    () => () => {
      particleGeometry.dispose();
      particleMaterial.dispose();
      shockwaveGeometry.dispose();
    },
    [particleGeometry, particleMaterial, shockwaveGeometry]
  );

  const emitParticles = (kind: BurstKind, origin: THREE.Vector3) => {
    const mesh = particlesRef.current;
    if (!mesh) return;
    const count = kind === 'victory' ? 70 : 22;
    for (let i = 0; i < count; i++) {
      const index = nextParticle.current;
      nextParticle.current = (nextParticle.current + 1) % particles.length;
      const particle = particles[index];
      particle.position.copy(origin);
      if (kind === 'victory') {
        particle.velocity.randomDirection().multiplyScalar(THREE.MathUtils.randFloat(3, 8));
        particle.velocity.y = Math.abs(particle.velocity.y) + 2;
        particle.gravity = 7;
        particle.drag = 1.4;
        particle.decay = THREE.MathUtils.randFloat(0.7, 1.1);
        particle.size = THREE.MathUtils.randFloat(0.05, 0.12);
        mesh.setColorAt(index, VICTORY_COLORS[i % VICTORY_COLORS.length]);
      } else {
        const angle = Math.random() * Math.PI * 2;
        const speed = THREE.MathUtils.randFloat(1.5, 3.5);
        particle.velocity.set(Math.cos(angle) * speed, THREE.MathUtils.randFloat(0.6, 1.8), Math.sin(angle) * speed);
        particle.gravity = 2.5;
        particle.drag = 3.2;
        particle.decay = THREE.MathUtils.randFloat(1.4, 2);
        particle.size = THREE.MathUtils.randFloat(0.07, 0.14);
        mesh.setColorAt(index, DUST_COLOR);
      }
      particle.life = 1;
    }
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  };

  const emitShockwave = (kind: BurstKind, origin: THREE.Vector3) => {
    const shockwave = shockwaves[nextShockwave.current];
    nextShockwave.current = (nextShockwave.current + 1) % shockwaves.length;
    shockwave.life = 1;
    shockwave.maxScale = kind === 'victory' ? 4.2 : 2.6;
    shockwave.mesh.position.set(origin.x, kind === 'victory' ? 0.06 : origin.y + 0.04, origin.z);
    (shockwave.mesh.material as THREE.MeshBasicMaterial).color.set(kind === 'victory' ? '#ffd45c' : '#efe7ff');
    shockwave.mesh.visible = true;
  };

  useFrame((_, rawDelta) => {
    const delta = Math.min(rawDelta, 1 / 20);
    const mesh = particlesRef.current;
    if (!mesh) return;

    if (isIdle.current && arenaRuntime.pendingBursts.length === 0) return;

    while (arenaRuntime.pendingBursts.length > 0) {
      const burst = arenaRuntime.pendingBursts.shift();
      if (!burst) break;
      const origin = new THREE.Vector3(burst.x, burst.y, burst.z);
      emitParticles(burst.kind, origin);
      emitShockwave(burst.kind, origin);
    }

    let aliveParticles = 0;
    for (let i = 0; i < particles.length; i++) {
      const particle = particles[i];
      if (particle.life > 0) {
        aliveParticles += 1;
        particle.life = Math.max(0, particle.life - delta * particle.decay);
        particle.velocity.multiplyScalar(Math.exp(-particle.drag * delta));
        particle.velocity.y -= particle.gravity * delta;
        particle.position.addScaledVector(particle.velocity, delta);
      }
      scratch.scale.setScalar(particle.size * Math.max(particle.life, 0));
      scratch.matrix.compose(particle.position, scratch.quaternion, scratch.scale);
      mesh.setMatrixAt(i, scratch.matrix);
    }
    mesh.visible = aliveParticles > 0;
    if (mesh.visible) mesh.instanceMatrix.needsUpdate = true;

    let activeShockwaves = 0;
    shockwaves.forEach((shockwave) => {
      if (shockwave.life <= 0) {
        shockwave.mesh.visible = false;
        return;
      }
      activeShockwaves += 1;
      shockwave.life = Math.max(0, shockwave.life - delta * 1.8);
      const progress = 1 - shockwave.life;
      shockwave.mesh.scale.setScalar(0.2 + progress * shockwave.maxScale);
      (shockwave.mesh.material as THREE.MeshBasicMaterial).opacity = shockwave.life * 0.85;
    });
    isIdle.current = aliveParticles === 0 && activeShockwaves === 0;
  });

  return (
    <>
      <instancedMesh ref={particlesRef} args={[particleGeometry, particleMaterial, PARTICLE_POOL_SIZE]} frustumCulled={false} />
      <group ref={shockwaveGroupRef} />
    </>
  );
}
