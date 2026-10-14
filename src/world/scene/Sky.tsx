import { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useLivePalette } from './livePalette';

const SKY_RADIUS = 520;
const STAR_COUNT = 900;

const SKY_VERTEX = /* glsl */ `
  varying vec3 vDirection;
  void main() {
    vDirection = normalize(position);
    vec4 projected = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = projected.xyww;
  }
`;

const SKY_FRAGMENT = /* glsl */ `
  uniform vec3 uTop;
  uniform vec3 uUpper;
  uniform vec3 uEmber;
  uniform vec3 uHorizon;
  uniform vec3 uGlow;
  uniform vec3 uGround;
  uniform vec3 uSun;
  uniform vec3 uSunDirection;
  varying vec3 vDirection;

  float dither(vec2 co) {
    return fract(sin(dot(co, vec2(12.9898, 78.233))) * 43758.5453) - 0.5;
  }

  void main() {
    vec3 direction = normalize(vDirection);
    float height = direction.y;
    // How far round the horizon this direction is from the sun: the sunset side burns gold,
    // the far side settles into ember so the whole rim never goes pale
    vec2 viewFlat = direction.xz;
    vec2 sunFlat = uSunDirection.xz;
    float facing = (length(viewFlat) > 0.0001 && length(sunFlat) > 0.0001) ? max(dot(normalize(viewFlat), normalize(sunFlat)), 0.0) : 0.0;
    vec3 rim = mix(uHorizon, uGlow, pow(facing, 6.0));
    rim = mix(uEmber, rim, 0.3 + 0.7 * pow(facing, 1.6));
    float warmBand = 0.07 + 0.11 * pow(facing, 3.0);

    vec3 color = mix(rim, uEmber, smoothstep(0.0, warmBand, height));
    color = mix(color, uUpper, smoothstep(warmBand * 0.7, warmBand + 0.26, height));
    color = mix(color, uTop, smoothstep(0.32, 0.95, height));
    color = mix(uGround, color, smoothstep(-0.1, 0.0, height));

    float sunAmount = max(dot(direction, uSunDirection), 0.0);
    color += uSun * (pow(sunAmount, 6.0) * 0.18 + pow(sunAmount, 48.0) * 0.5);
    color = mix(color, uSun * 1.4, smoothstep(0.99935, 0.99965, sunAmount));
    color += uGlow * 0.22 * pow(facing, 2.0) * (1.0 - smoothstep(0.0, 0.035, abs(height)));
    color += dither(gl_FragCoord.xy) / 160.0;

    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
  }
`;

const STAR_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  uniform float uTime;
  uniform float uPixelRatio;
  varying float vTwinkle;
  void main() {
    vTwinkle = 0.62 + 0.38 * sin(uTime * (0.6 + aPhase * 0.9) + aPhase * 40.0);
    vec4 projected = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_Position = projected.xyww;
    gl_PointSize = aSize * uPixelRatio;
  }
`;

const STAR_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vTwinkle;
  void main() {
    float falloff = 1.0 - smoothstep(0.1, 0.5, length(gl_PointCoord - 0.5));
    gl_FragColor = vec4(vec3(0.92, 0.95, 1.0), falloff * uOpacity * vTwinkle);
  }
`;

function buildStarGeometry(): THREE.BufferGeometry {
  const positions = new Float32Array(STAR_COUNT * 3);
  const sizes = new Float32Array(STAR_COUNT);
  const phases = new Float32Array(STAR_COUNT);
  for (let i = 0; i < STAR_COUNT; i++) {
    // Deterministic scatter over the upper sky, denser toward the zenith
    const u = (Math.sin(i * 12.9898) * 43758.5453) % 1;
    const v = (Math.sin(i * 78.233) * 12543.1234) % 1;
    const azimuth = Math.abs(u) * Math.PI * 2;
    const elevation = Math.asin(0.06 + Math.abs(v) * 0.94);
    const radius = SKY_RADIUS * 0.94;
    positions[i * 3] = Math.cos(elevation) * Math.cos(azimuth) * radius;
    positions[i * 3 + 1] = Math.sin(elevation) * radius;
    positions[i * 3 + 2] = Math.cos(elevation) * Math.sin(azimuth) * radius;
    sizes[i] = 1.2 + Math.abs((Math.sin(i * 3.7) * 9.1) % 1) * (i % 17 === 0 ? 2.6 : 1.3);
    phases[i] = Math.abs((Math.sin(i * 1.3) * 5.7) % 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
  geometry.setAttribute('aPhase', new THREE.BufferAttribute(phases, 1));
  return geometry;
}

export function Sky({ animate }: { animate: boolean }) {
  const live = useLivePalette();
  const domeRef = useRef<THREE.Mesh>(null);
  const starsRef = useRef<THREE.Points>(null);

  const skyMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: SKY_VERTEX,
        fragmentShader: SKY_FRAGMENT,
        side: THREE.BackSide,
        depthWrite: false,
        toneMapped: false,
        uniforms: {
          uTop: { value: new THREE.Color() },
          uUpper: { value: new THREE.Color() },
          uEmber: { value: new THREE.Color() },
          uHorizon: { value: new THREE.Color() },
          uGlow: { value: new THREE.Color() },
          uGround: { value: new THREE.Color() },
          uSun: { value: new THREE.Color() },
          uSunDirection: { value: new THREE.Vector3() }
        }
      }),
    []
  );

  const starMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: STAR_VERTEX,
        fragmentShader: STAR_FRAGMENT,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        uniforms: { uTime: { value: 0 }, uOpacity: { value: 0 }, uPixelRatio: { value: 1 } }
      }),
    []
  );
  const starGeometry = useMemo(buildStarGeometry, []);
  const domeGeometry = useMemo(() => new THREE.SphereGeometry(SKY_RADIUS, 48, 24), []);

  useFrame(({ camera, clock, gl }) => {
    // The sky travels with the camera so it reads as infinitely far away
    domeRef.current?.position.copy(camera.position);
    starsRef.current?.position.copy(camera.position);
    const uniforms = skyMaterial.uniforms;
    uniforms.uTop.value.copy(live.colors.skyTop);
    uniforms.uUpper.value.copy(live.colors.skyUpper);
    uniforms.uEmber.value.copy(live.colors.skyEmber);
    uniforms.uHorizon.value.copy(live.colors.skyHorizon);
    uniforms.uGlow.value.copy(live.colors.skyGlow);
    uniforms.uGround.value.copy(live.colors.skyGround);
    uniforms.uSun.value.copy(live.colors.sun);
    uniforms.uSunDirection.value.copy(live.sunDirection);
    starMaterial.uniforms.uOpacity.value = live.numbers.starOpacity;
    starMaterial.uniforms.uPixelRatio.value = gl.getPixelRatio();
    if (animate) starMaterial.uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <>
      <mesh ref={domeRef} geometry={domeGeometry} material={skyMaterial} renderOrder={-2} frustumCulled={false} />
      <points ref={starsRef} geometry={starGeometry} material={starMaterial} renderOrder={-1} frustumCulled={false} />
    </>
  );
}
