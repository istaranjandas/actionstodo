// Wayposts and lanterns: every day with tasks gets a post beside the trail, every task a lantern.
// Open tasks hang dark; completing one ignites its lantern with a flash and a rising spray of sparks.
// All posts and lanterns are instanced, so a month of tasks is a handful of draw calls.
import { useEffect, useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { ThreeEvent } from '@react-three/fiber';
import { playUiSound } from '../../audio/uiSounds';
import { subscribeWorldEvents } from '../worldEvents';
import { worldBridge } from '../worldBridge';
import type { WorldDay } from '../worldBridge';
import { dayPostPlacement, LANTERNS_PER_POST, lanternSlot } from '../trail';
import { terrainHeight } from './terrainShape';
import { useLivePalette } from './livePalette';

const MAX_POSTS = 90;
const MAX_LANTERNS = MAX_POSTS * LANTERNS_PER_POST;
const POP_SECONDS = 0.6;
const BURST_POOL = 4;
const BURST_PARTICLES = 46;
const POOL_RADIUS = 7.5;

// A soft additive pool of lantern light on the ground under the focused post
const POOL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const POOL_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying vec2 vUv;
  void main() {
    float distanceFromCentre = length(vUv - 0.5) * 2.0;
    float falloff = pow(1.0 - smoothstep(0.0, 1.0, distanceFromCentre), 2.2);
    gl_FragColor = vec4(uColor * falloff * uStrength, 1.0);
  }
`;
const BURST_SECONDS = 1.8;

interface LanternRecord {
  taskId: string;
  text: string;
  lit: boolean;
  position: THREE.Vector3;
  index: number;
}

const WHITE = new THREE.Color('#ffffff');
const matrix = new THREE.Matrix4();
const quaternion = new THREE.Quaternion();
const scaleVector = new THREE.Vector3();
const positionVector = new THREE.Vector3();

function setInstance(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, scale = 1) {
  positionVector.set(x, y, z);
  scaleVector.setScalar(scale);
  matrix.compose(positionVector, quaternion, scaleVector);
  mesh.setMatrixAt(index, matrix);
}

const GLOW_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vFlicker;
  void main() {
    float seed = fract(sin(dot(position.xz, vec2(12.9898, 78.233))) * 43758.5453);
    vFlicker = 0.82 + 0.18 * sin(uTime * (5.0 + seed * 4.0) + seed * 30.0);
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp(uPixelRatio * 420.0 / -mvPosition.z, 4.0, 140.0);
  }
`;

const GLOW_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uStrength;
  varying float vFlicker;
  void main() {
    float falloff = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(uColor, falloff * falloff * uStrength * vFlicker);
    #include <colorspace_fragment>
  }
`;

const BURST_VERTEX = /* glsl */ `
  attribute vec3 aVelocity;
  attribute float aSeed;
  uniform float uAge;
  uniform float uPixelRatio;
  varying float vLife;
  void main() {
    float t = uAge;
    vec3 travelled = aVelocity * t + vec3(0.0, 1.6 * t - 1.1 * t * t, 0.0);
    vec4 mvPosition = modelViewMatrix * vec4(position + travelled, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    vLife = clamp(1.0 - t / ${BURST_SECONDS.toFixed(1)}, 0.0, 1.0);
    gl_PointSize = clamp((1.6 + aSeed * 2.2) * uPixelRatio * (40.0 / -mvPosition.z) * vLife, 0.0, 12.0);
  }
`;

const BURST_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  varying float vLife;
  void main() {
    float falloff = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(uColor, falloff * vLife);
    #include <colorspace_fragment>
  }
`;

function buildBurstGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(BURST_PARTICLES * 3);
  const velocities = new Float32Array(BURST_PARTICLES * 3);
  const seeds = new Float32Array(BURST_PARTICLES);
  for (let i = 0; i < BURST_PARTICLES; i++) {
    const random = (offset: number) => Math.abs((Math.sin(i * 37.17 + offset) * 43758.5453) % 1);
    const angle = random(1) * Math.PI * 2;
    const spread = 0.3 + random(2) * 1.4;
    velocities[i * 3] = Math.cos(angle) * spread;
    velocities[i * 3 + 1] = 0.8 + random(3) * 2.6;
    velocities[i * 3 + 2] = Math.sin(angle) * spread;
    seeds[i] = random(4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aVelocity', new THREE.BufferAttribute(velocities, 3));
  geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
  return geometry;
}

interface DayPostsProps {
  days: WorldDay[];
  animate: boolean;
}

export function DayPosts({ days, animate }: DayPostsProps) {
  const live = useLivePalette();
  const shafts = useRef<THREE.InstancedMesh>(null);
  const bases = useRef<THREE.InstancedMesh>(null);
  const finials = useRef<THREE.InstancedMesh>(null);
  const arms = useRef<THREE.InstancedMesh>(null);
  const strings = useRef<THREE.InstancedMesh>(null);
  const caps = useRef<THREE.InstancedMesh>(null);
  const darkLanterns = useRef<THREE.InstancedMesh>(null);
  const litLanterns = useRef<THREE.InstancedMesh>(null);
  const glowPoints = useRef<THREE.Points>(null);
  const focusLight = useRef<THREE.PointLight>(null);
  const flashLight = useRef<THREE.PointLight>(null);
  const lightPool = useRef<THREE.Mesh>(null);
  const selectionRing = useRef<THREE.Mesh>(null);
  const hoverRing = useRef<THREE.Mesh>(null);

  const lanterns = useRef(new Map<string, LanternRecord>());
  const darkIds = useRef<string[]>([]);
  const litIds = useRef<string[]>([]);
  const postDates = useRef<string[]>([]);
  const knownTaskIds = useRef<Set<string> | null>(null);
  const appearing = useRef(new Map<string, number>());
  const pendingIgnitions = useRef<string[]>([]);
  const igniting = useRef(new Map<string, number>());
  const flash = useRef({ intensity: 0 });
  const bursts = useRef<{ age: number; position: THREE.Vector3 }[]>(Array.from({ length: BURST_POOL }, () => ({ age: 99, position: new THREE.Vector3() })));
  const nextBurst = useRef(0);
  const litCountByDate = useRef(new Map<string, number>());

  const geometries = useMemo(() => {
    const shaft = new THREE.BoxGeometry(0.3, 4.6, 0.3).translate(0, 2.3, 0);
    const base = new THREE.CylinderGeometry(0.48, 0.66, 0.42, 6).translate(0, 0.21, 0);
    const finial = new THREE.ConeGeometry(0.26, 0.42, 4).translate(0, 4.8, 0);
    const arm = new THREE.BoxGeometry(2.6, 0.13, 0.15);
    const string = new THREE.CylinderGeometry(0.012, 0.012, 0.34, 3);
    const cap = new THREE.ConeGeometry(0.22, 0.17, 6);
    const lantern = new THREE.CylinderGeometry(0.16, 0.19, 0.36, 6);
    const ring = new THREE.RingGeometry(0.34, 0.4, 32);
    const pool = new THREE.CircleGeometry(POOL_RADIUS, 40).rotateX(-Math.PI / 2);
    return { shaft, base, finial, arm, string, cap, lantern, ring, pool };
  }, []);

  const materials = useMemo(
    () => ({
      wood: new THREE.MeshStandardMaterial({ color: '#4d3d2d', roughness: 0.86, flatShading: true }),
      stone: new THREE.MeshStandardMaterial({ color: '#6c6b64', roughness: 0.95, flatShading: true }),
      metal: new THREE.MeshStandardMaterial({ color: '#2c2c2d', roughness: 0.45, metalness: 0.6, flatShading: true }),
      darkGlass: new THREE.MeshStandardMaterial({ color: '#33383c', emissive: new THREE.Color('#ff9b4a'), emissiveIntensity: 0.1, roughness: 0.25, metalness: 0.1, flatShading: true }),
      litGlass: new THREE.MeshBasicMaterial({ color: '#ffd08a', toneMapped: false }),
      selection: new THREE.MeshBasicMaterial({ color: '#ffc677', transparent: true, opacity: 0.95, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
      hover: new THREE.MeshBasicMaterial({ color: '#ffffff', transparent: true, opacity: 0.7, side: THREE.DoubleSide, depthWrite: false, toneMapped: false }),
      pool: new THREE.ShaderMaterial({
        vertexShader: POOL_VERTEX,
        fragmentShader: POOL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        toneMapped: false,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        uniforms: { uColor: { value: new THREE.Color('#f59e0b') }, uStrength: { value: 0.5 } }
      }),
      glow: new THREE.ShaderMaterial({
        vertexShader: GLOW_VERTEX,
        fragmentShader: GLOW_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uPixelRatio: { value: 1 }, uColor: { value: new THREE.Color('#ffb757') }, uStrength: { value: 0.8 } }
      })
    }),
    []
  );

  const glowGeometry = useMemo(() => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(MAX_LANTERNS * 3), 3).setUsage(THREE.DynamicDrawUsage));
    geometry.setDrawRange(0, 0);
    return geometry;
  }, []);
  const burstGeometry = useMemo(buildBurstGeometry, []);
  const burstMaterials = useMemo(
    () =>
      Array.from({ length: BURST_POOL }, () =>
        new THREE.ShaderMaterial({
          vertexShader: BURST_VERTEX,
          fragmentShader: BURST_FRAGMENT,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          uniforms: { uAge: { value: 99 }, uColor: { value: new THREE.Color('#ffc677') }, uPixelRatio: { value: 1 } }
        })
      ),
    []
  );
  const burstGroups = useRef<(THREE.Object3D | null)[]>([]);

  // Rebuild every instance from the real task data whenever it changes
  useLayoutEffect(() => {
    const meshes = [shafts.current, bases.current, finials.current, arms.current, strings.current, caps.current, darkLanterns.current, litLanterns.current];
    if (meshes.some((mesh) => !mesh)) return;
    const [shaftMesh, baseMesh, finialMesh, armMesh, stringMesh, capMesh, darkMesh, litMesh] = meshes as THREE.InstancedMesh[];

    Array.from(worldBridge.points.keys()).forEach((key) => worldBridge.points.delete(key));
    const nextLanterns = new Map<string, LanternRecord>();
    const nextDark: string[] = [];
    const nextLit: string[] = [];
    const nextPostDates: string[] = [];
    const nextLitCounts = new Map<string, number>();
    let armCount = 0;
    let lanternCount = 0;
    const glowPositions = glowGeometry.attributes.position as THREE.BufferAttribute;

    days.slice(0, MAX_POSTS).forEach((day, postIndex) => {
      const post = dayPostPlacement(day.offset);
      const ground = terrainHeight(post.x, post.z);
      setInstance(shaftMesh, postIndex, post.x, ground, post.z);
      setInstance(baseMesh, postIndex, post.x, ground - 0.05, post.z);
      setInstance(finialMesh, postIndex, post.x, ground, post.z);
      nextPostDates[postIndex] = day.date;
      nextLitCounts.set(day.date, day.tasks.filter((task) => task.completed).length);
      worldBridge.points.set(`day:${day.date}`, [post.x, ground + 5.6, post.z]);

      const visibleTasks = day.tasks.slice(0, LANTERNS_PER_POST);
      setInstance(armMesh, armCount++, post.x - post.side * 1.2, ground + 3.97, post.z);
      if (visibleTasks.length > 6) setInstance(armMesh, armCount++, post.x - post.side * 1.2, ground + 3.02, post.z);

      visibleTasks.forEach((task, slotIndex) => {
        const [x, y, z] = lanternSlot(post, slotIndex);
        const position = new THREE.Vector3(x, ground + y, z);
        setInstance(stringMesh, lanternCount, x, position.y + 0.38, z);
        setInstance(capMesh, lanternCount, x, position.y + 0.26, z);
        lanternCount += 1;
        const list = task.completed ? nextLit : nextDark;
        const record: LanternRecord = { taskId: task.id, text: task.text, lit: task.completed, position, index: list.length };
        list.push(task.id);
        nextLanterns.set(task.id, record);
        worldBridge.points.set(`task:${task.id}`, [x, position.y, z]);
        if (task.completed) glowPositions.setXYZ(nextLit.length - 1, x, position.y, z);
      });
    });

    // New lanterns (after the first build) grow in on their string
    const now = performance.now() / 1000;
    if (knownTaskIds.current) {
      nextLanterns.forEach((_record, taskId) => {
        if (!knownTaskIds.current?.has(taskId)) appearing.current.set(taskId, now);
      });
    }
    knownTaskIds.current = new Set(nextLanterns.keys());

    nextDark.forEach((taskId, index) => {
      const record = nextLanterns.get(taskId)!;
      setInstance(darkMesh, index, record.position.x, record.position.y, record.position.z);
    });
    nextLit.forEach((taskId, index) => {
      const record = nextLanterns.get(taskId)!;
      setInstance(litMesh, index, record.position.x, record.position.y, record.position.z);
    });

    const counts: [THREE.InstancedMesh, number][] = [
      [shaftMesh, nextPostDates.length],
      [baseMesh, nextPostDates.length],
      [finialMesh, nextPostDates.length],
      [armMesh, armCount],
      [stringMesh, lanternCount],
      [capMesh, lanternCount],
      [darkMesh, nextDark.length],
      [litMesh, nextLit.length]
    ];
    counts.forEach(([mesh, count]) => {
      mesh.count = count;
      mesh.instanceMatrix.needsUpdate = true;
      mesh.computeBoundingSphere();
    });
    glowPositions.needsUpdate = true;
    glowGeometry.setDrawRange(0, nextLit.length);
    glowGeometry.computeBoundingSphere();

    lanterns.current = nextLanterns;
    darkIds.current = nextDark;
    litIds.current = nextLit;
    postDates.current = nextPostDates;
    litCountByDate.current = nextLitCounts;
  }, [days, glowGeometry]);

  useEffect(
    () =>
      subscribeWorldEvents((event) => {
        if (event.type === 'complete') pendingIgnitions.current.push(event.taskId);
      }),
    []
  );

  useEffect(
    () => () => {
      Array.from(worldBridge.points.keys()).forEach((key) => worldBridge.points.delete(key));
      document.body.style.removeProperty('cursor');
    },
    []
  );

  useFrame(({ clock, camera, gl }, delta) => {
    const step = Math.min(delta, 1 / 20);
    const now = performance.now() / 1000;
    const pixelRatio = gl.getPixelRatio();
    materials.glow.uniforms.uPixelRatio.value = pixelRatio;
    materials.glow.uniforms.uColor.value.copy(live.colors.beacon);
    materials.glow.uniforms.uStrength.value = live.numbers.lanternGlow;
    materials.litGlass.color.copy(live.colors.beacon).lerp(WHITE, 0.18);
    materials.wood.color.copy(live.colors.signpostWood);
    if (animate) materials.glow.uniforms.uTime.value = clock.elapsedTime;

    // Ignite lanterns that were just completed
    while (pendingIgnitions.current.length) {
      const taskId = pendingIgnitions.current.shift()!;
      const record = lanterns.current.get(taskId);
      if (!record) continue;
      igniting.current.set(taskId, now);
      flash.current.intensity = 1;
      if (flashLight.current) flashLight.current.position.copy(record.position);
      const burst = bursts.current[nextBurst.current];
      burst.age = 0;
      burst.position.copy(record.position);
      nextBurst.current = (nextBurst.current + 1) % BURST_POOL;
    }

    // Pop animations: new lanterns grow in, ignited ones swell then settle
    const animateScale = (registry: Map<string, number>, shape: (t: number) => number) => {
      registry.forEach((startedAt, taskId) => {
        const record = lanterns.current.get(taskId);
        const t = (now - startedAt) / POP_SECONDS;
        if (!record || t >= 1 || !animate) {
          registry.delete(taskId);
          if (record) applyScale(record, 1);
          return;
        }
        applyScale(record, shape(Math.max(0, t)));
      });
    };
    const applyScale = (record: LanternRecord, scale: number) => {
      const mesh = record.lit ? litLanterns.current : darkLanterns.current;
      if (!mesh) return;
      setInstance(mesh, record.index, record.position.x, record.position.y, record.position.z, scale);
      mesh.instanceMatrix.needsUpdate = true;
    };
    animateScale(appearing.current, (t) => 1 - Math.pow(1 - t, 3));
    animateScale(igniting.current, (t) => 1 + Math.sin(t * Math.PI) * 0.7);

    flash.current.intensity = Math.max(0, flash.current.intensity - step * 1.4);
    if (flashLight.current) flashLight.current.intensity = flash.current.intensity * 160;

    bursts.current.forEach((burst, index) => {
      burst.age += step;
      const points = burstGroups.current[index];
      const material = burstMaterials[index];
      material.uniforms.uAge.value = burst.age;
      material.uniforms.uPixelRatio.value = pixelRatio;
      material.uniforms.uColor.value.copy(live.colors.beacon);
      if (points) {
        points.visible = burst.age < BURST_SECONDS;
        points.position.copy(burst.position);
      }
    });

    // Warm light pools around the focused post, brighter the more of its lanterns are lit
    const focusPoint = worldBridge.focusDate ? worldBridge.points.get(`day:${worldBridge.focusDate}`) : undefined;
    const litCount = litCountByDate.current.get(worldBridge.focusDate ?? '') ?? 0;
    if (focusLight.current) {
      focusLight.current.visible = Boolean(focusPoint);
      if (focusPoint) {
        focusLight.current.position.set(focusPoint[0], focusPoint[1] - 2.4, focusPoint[2] + 0.8);
        focusLight.current.color.copy(live.colors.beacon);
        focusLight.current.intensity = (22 + litCount * 9) * live.numbers.lanternGlow * live.numbers.focusLightStrength;
      }
    }
    if (lightPool.current) {
      lightPool.current.visible = Boolean(focusPoint) && live.numbers.poolStrength > 0.001;
      if (focusPoint) {
        lightPool.current.position.set(focusPoint[0], terrainHeight(focusPoint[0], focusPoint[2]) + 0.14, focusPoint[2]);
        materials.pool.uniforms.uColor.value.copy(live.colors.beacon);
        materials.pool.uniforms.uStrength.value = (0.42 + Math.min(litCount, 6) * 0.05) * live.numbers.lanternGlow * live.numbers.poolStrength;
      }
    }

    // Rings mark the selected and hovered lanterns; they always face the camera
    const placeRing = (ring: THREE.Mesh | null, taskId: string | null, pulse: number) => {
      if (!ring) return;
      const record = taskId ? lanterns.current.get(taskId) : undefined;
      ring.visible = Boolean(record);
      if (!record) return;
      ring.position.copy(record.position);
      ring.quaternion.copy(camera.quaternion);
      ring.scale.setScalar(pulse);
    };
    const pulse = animate ? 1 + Math.sin(clock.elapsedTime * 3.2) * 0.08 : 1;
    placeRing(selectionRing.current, worldBridge.selectedTaskId, pulse);
    placeRing(hoverRing.current, worldBridge.hoveredTaskId !== worldBridge.selectedTaskId ? worldBridge.hoveredTaskId : null, 0.9);
  });

  // Instance ids are read at event time: the id lists are rebuilt after render
  const lanternIdAt = (event: ThreeEvent<PointerEvent | MouseEvent>, ids: () => string[]) =>
    event.instanceId === undefined ? null : ids()[event.instanceId] ?? null;

  const handleHover = (ids: () => string[]) => (event: ThreeEvent<PointerEvent>) => {
    event.stopPropagation();
    const taskId = lanternIdAt(event, ids);
    if (taskId === worldBridge.hoveredTaskId) return;
    worldBridge.hoveredTaskId = taskId;
    document.body.style.cursor = taskId ? 'pointer' : '';
    if (taskId) playUiSound('hover');
    if (worldBridge.hoverLabel && taskId) worldBridge.hoverLabel.textContent = lanterns.current.get(taskId)?.text ?? '';
  };

  const handleLeave = () => {
    worldBridge.hoveredTaskId = null;
    document.body.style.removeProperty('cursor');
  };

  const handleOpen = (ids: () => string[]) => (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const taskId = lanternIdAt(event, ids);
    if (taskId) worldBridge.onOpenTask(taskId);
  };

  const handlePostClick = (event: ThreeEvent<MouseEvent>) => {
    event.stopPropagation();
    const date = event.instanceId === undefined ? null : postDates.current[event.instanceId];
    if (date) worldBridge.onFocusDay(date);
  };

  return (
    <group>
      <instancedMesh
        ref={shafts}
        args={[geometries.shaft, materials.wood, MAX_POSTS]}
        castShadow
        onClick={handlePostClick}
        onPointerOver={() => (document.body.style.cursor = 'pointer')}
        onPointerOut={handleLeave}
      />
      <instancedMesh ref={bases} args={[geometries.base, materials.stone, MAX_POSTS]} castShadow />
      <instancedMesh ref={finials} args={[geometries.finial, materials.metal, MAX_POSTS]} castShadow />
      <instancedMesh ref={arms} args={[geometries.arm, materials.wood, MAX_POSTS * 2]} castShadow />
      <instancedMesh ref={strings} args={[geometries.string, materials.metal, MAX_LANTERNS]} />
      <instancedMesh ref={caps} args={[geometries.cap, materials.metal, MAX_LANTERNS]} castShadow />
      <instancedMesh
        ref={darkLanterns}
        args={[geometries.lantern, materials.darkGlass, MAX_LANTERNS]}
        castShadow
        onPointerMove={handleHover(() => darkIds.current)}
        onPointerOut={handleLeave}
        onClick={handleOpen(() => darkIds.current)}
      />
      <instancedMesh
        ref={litLanterns}
        args={[geometries.lantern, materials.litGlass, MAX_LANTERNS]}
        castShadow
        onPointerMove={handleHover(() => litIds.current)}
        onPointerOut={handleLeave}
        onClick={handleOpen(() => litIds.current)}
      />
      <points ref={glowPoints} geometry={glowGeometry} material={materials.glow} frustumCulled={false} />
      <mesh ref={selectionRing} geometry={geometries.ring} material={materials.selection} visible={false} renderOrder={5} />
      <mesh ref={hoverRing} geometry={geometries.ring} material={materials.hover} visible={false} renderOrder={5} />
      <mesh ref={lightPool} geometry={geometries.pool} material={materials.pool} visible={false} renderOrder={1} />
      <pointLight ref={focusLight} distance={22} decay={2} />
      <pointLight ref={flashLight} distance={26} decay={2} intensity={0} />
      {burstMaterials.map((material, index) => (
        <points
          key={index}
          ref={(points) => {
            burstGroups.current[index] = points;
          }}
          geometry={burstGeometry}
          material={material}
          frustumCulled={false}
          visible={false}
        />
      ))}
    </group>
  );
}
