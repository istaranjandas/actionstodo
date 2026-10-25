import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useLivePalette } from './livePalette';

const NOISE_GLSL = /* glsl */ `
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x), u.y);
  }
  float fbm(vec2 p) {
    float sum = 0.0;
    float amplitude = 0.5;
    for (int i = 0; i < 5; i++) {
      sum += amplitude * noise(p);
      p *= 2.03;
      amplitude *= 0.5;
    }
    return sum;
  }
`;

const VEIL_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// Shared by clouds and valley mist: drifting fbm density, soft edges, underside lit by the sun
const VEIL_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform vec3 uLit;
  uniform float uTime;
  uniform float uSeed;
  uniform float uOpacity;
  uniform float uDensity;
  uniform float uDrift;
  varying vec2 vUv;
  ${NOISE_GLSL}
  void main() {
    vec2 drift = vec2(uTime * uDrift, uTime * uDrift * 0.25);
    float density = fbm(vUv * vec2(3.2, 1.6) + drift + uSeed);
    float edge = smoothstep(0.0, 0.46, vUv.x) * smoothstep(1.0, 0.54, vUv.x) * smoothstep(0.0, 0.48, vUv.y) * smoothstep(1.0, 0.42, vUv.y);
    float alpha = smoothstep(uDensity, uDensity + 0.32, density) * edge * uOpacity;
    vec3 color = mix(uLit, uColor, smoothstep(0.1, 0.75, vUv.y));
    gl_FragColor = vec4(color, alpha);
    #include <colorspace_fragment>
  }
`;

interface VeilSpec {
  position: [number, number, number];
  scale: [number, number];
  seed: number;
  opacity: number;
  density: number;
  kind: 'cloud' | 'mist';
}

const VEILS: VeilSpec[] = [
  { kind: 'cloud', position: [-160, 92, -330], scale: [260, 70], seed: 1.3, opacity: 0.85, density: 0.42 },
  { kind: 'cloud', position: [120, 110, -360], scale: [300, 80], seed: 4.7, opacity: 0.8, density: 0.45 },
  { kind: 'cloud', position: [300, 80, -160], scale: [240, 70], seed: 8.1, opacity: 0.75, density: 0.46 },
  { kind: 'cloud', position: [-300, 70, -120], scale: [240, 64], seed: 2.9, opacity: 0.7, density: 0.46 },
  // High, thin weather above the ridge line: the sky keeps moving even when nothing else does
  { kind: 'cloud', position: [-70, 128, -190], scale: [420, 84], seed: 11.4, opacity: 0.62, density: 0.48 },
  { kind: 'cloud', position: [150, 118, -150], scale: [380, 78], seed: 14.8, opacity: 0.58, density: 0.5 },
  { kind: 'cloud', position: [-240, 128, 40], scale: [380, 84], seed: 17.2, opacity: 0.45, density: 0.5 },
  { kind: 'mist', position: [0, 4, -70], scale: [260, 18], seed: 3.3, opacity: 0.24, density: 0.3 },
  { kind: 'mist', position: [20, 7, -140], scale: [340, 26], seed: 6.6, opacity: 0.3, density: 0.3 },
  { kind: 'mist', position: [-10, 12, -220], scale: [420, 34], seed: 9.2, opacity: 0.34, density: 0.28 },
  { kind: 'mist', position: [30, 6, -40], scale: [220, 16], seed: 12.7, opacity: 0.26, density: 0.32 }
];

function Veil({ spec, animate }: { spec: VeilSpec; animate: boolean }) {
  const live = useLivePalette();
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: VEIL_VERTEX,
        fragmentShader: VEIL_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        uniforms: {
          uColor: { value: new THREE.Color() },
          uLit: { value: new THREE.Color() },
          uTime: { value: 0 },
          uSeed: { value: spec.seed },
          uOpacity: { value: spec.opacity },
          uDensity: { value: spec.density },
          // Clouds drift slowly; mist pours a little faster through the valley
          uDrift: { value: spec.kind === 'cloud' ? 0.0042 : 0.009 }
        }
      }),
    [spec]
  );

  useFrame(({ clock }) => {
    const isCloud = spec.kind === 'cloud';
    material.uniforms.uColor.value.copy(isCloud ? live.colors.cloud : live.colors.mist);
    material.uniforms.uLit.value.copy(isCloud ? live.colors.cloudLit : live.colors.fog);
    if (animate) material.uniforms.uTime.value = clock.elapsedTime + spec.seed * 40;
  });

  // Turned toward the valley floor so each veil reads as a flat layer of depth
  const rotationY = Math.atan2(-spec.position[0], -spec.position[2]);
  return (
    <mesh position={spec.position} rotation={[0, rotationY, 0]} scale={[spec.scale[0], spec.scale[1], 1]} material={material}>
      <planeGeometry args={[1, 1]} />
    </mesh>
  );
}

const MOTE_COUNT = 320;

const MOTE_VERTEX = /* glsl */ `
  attribute float aSeed;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vGlow;
  void main() {
    vec3 drifted = position;
    drifted.x += sin(uTime * 0.11 + aSeed * 6.2831) * 1.6;
    drifted.y += mod(uTime * (0.12 + aSeed * 0.18) + aSeed * 14.0, 14.0) - 2.0;
    drifted.z += cos(uTime * 0.09 + aSeed * 4.0) * 1.4;
    vec4 mvPosition = modelViewMatrix * vec4(drifted, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    gl_PointSize = clamp((1.4 + aSeed * 2.4) * uPixelRatio * (36.0 / -mvPosition.z), 1.0, 9.0);
    vGlow = 0.45 + 0.55 * sin(uTime * (0.7 + aSeed) + aSeed * 30.0);
  }
`;

const MOTE_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uIntensity;
  varying float vGlow;
  void main() {
    float falloff = 1.0 - smoothstep(0.0, 0.5, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(uColor, falloff * falloff * vGlow * 0.55 * uIntensity);
    #include <colorspace_fragment>
  }
`;

// Dust and pollen drifting through the air in front of the camera
function Motes({ animate }: { animate: boolean }) {
  const live = useLivePalette();
  const geometry = useMemo(() => {
    const positions = new Float32Array(MOTE_COUNT * 3);
    const seeds = new Float32Array(MOTE_COUNT);
    for (let i = 0; i < MOTE_COUNT; i++) {
      const random = (offset: number) => Math.abs((Math.sin(i * 91.7 + offset) * 43758.5453) % 1);
      positions[i * 3] = -40 + random(1) * 90;
      positions[i * 3 + 1] = random(2) * 10;
      positions[i * 3 + 2] = -60 + random(3) * 80;
      seeds[i] = random(4);
    }
    const buffer = new THREE.BufferGeometry();
    buffer.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    buffer.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    return buffer;
  }, []);
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: MOTE_VERTEX,
        fragmentShader: MOTE_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color() }, uIntensity: { value: 1 }, uPixelRatio: { value: 1 } }
      }),
    []
  );

  useFrame(({ clock, gl }) => {
    material.uniforms.uColor.value.copy(live.colors.motes);
    material.uniforms.uPixelRatio.value = gl.getPixelRatio();
    material.uniforms.uIntensity.value = live.numbers.moteIntensity;
    if (animate) material.uniforms.uTime.value = clock.elapsedTime;
  });
  return <points geometry={geometry} material={material} frustumCulled={false} />;
}

export function Atmosphere({ animate }: { animate: boolean }) {
  return (
    <>
      {VEILS.map((spec) => (
        <Veil key={`${spec.kind}-${spec.seed}`} spec={spec} animate={animate} />
      ))}
      <Motes animate={animate} />
    </>
  );
}
