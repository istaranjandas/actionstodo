import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useLivePalette } from './livePalette';
import { smoothstep } from './noise';
import { LAKE, TERRAIN_CENTER_Z, TERRAIN_LENGTH, TERRAIN_SEGMENTS_X, TERRAIN_SEGMENTS_Z, TERRAIN_WIDTH, terrainHeight } from './terrainShape';

const VALLEY_COLOR = new THREE.Color('#5b5850');
const ROCK_COLOR = new THREE.Color('#86827c');
const SNOW_COLOR = new THREE.Color('#f2f2f0');

// Low-poly faceted terrain (flatShading facets it); colour ramps by altitude and darkens in hollows
// as a baked ambient shadow. Heights are sampled once into a grid so neighbours are free to read.
function buildTerrainGeometry(): THREE.BufferGeometry {
  const plane = new THREE.PlaneGeometry(TERRAIN_WIDTH, TERRAIN_LENGTH, TERRAIN_SEGMENTS_X, TERRAIN_SEGMENTS_Z);
  plane.rotateX(-Math.PI / 2);
  plane.translate(0, 0, TERRAIN_CENTER_Z);
  const positions = plane.attributes.position as THREE.BufferAttribute;
  const rowLength = TERRAIN_SEGMENTS_X + 1;
  const heights = new Float32Array(positions.count);
  for (let i = 0; i < positions.count; i++) {
    heights[i] = terrainHeight(positions.getX(i), positions.getZ(i));
    positions.setY(i, heights[i]);
  }

  const heightAt = (column: number, row: number) =>
    heights[Math.min(TERRAIN_SEGMENTS_Z, Math.max(0, row)) * rowLength + Math.min(TERRAIN_SEGMENTS_X, Math.max(0, column))];
  const colors = new Float32Array(positions.count * 3);
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const column = i % rowLength;
    const row = Math.floor(i / rowLength);
    const height = heights[i];
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const snowLine = 54 + Math.sin(x * 0.07) * 6 + Math.cos(z * 0.05) * 5;
    color.copy(VALLEY_COLOR).lerp(ROCK_COLOR, smoothstep(1.5, 20, height)).lerp(SNOW_COLOR, smoothstep(snowLine - 6, snowLine + 4, height));
    const neighbourAverage = (heightAt(column + 2, row) + heightAt(column - 2, row) + heightAt(column, row + 2) + heightAt(column, row - 2)) / 4;
    const occlusion = THREE.MathUtils.clamp(0.84 + (height - neighbourAverage) * 0.05, 0.55, 1.08) * (0.72 + 0.28 * smoothstep(-2, 16, height));
    color.multiplyScalar(occlusion);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  plane.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  plane.computeVertexNormals();
  return plane;
}

const LAKE_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;
  #include <fog_pars_vertex>
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    vec4 mvPosition = viewMatrix * worldPosition;
    gl_Position = projectionMatrix * mvPosition;
    #include <fog_vertex>
  }
`;

const LAKE_FRAGMENT = /* glsl */ `
  uniform vec3 uDeep;
  uniform vec3 uSky;
  uniform vec3 uSun;
  uniform vec3 uSunDirection;
  uniform float uTime;
  varying vec3 vWorldPosition;
  #include <fog_pars_fragment>
  void main() {
    vec3 toCamera = normalize(cameraPosition - vWorldPosition);
    float ripple = sin(vWorldPosition.x * 0.8 + uTime * 0.55) * 0.025 + sin(vWorldPosition.z * 1.25 - uTime * 0.4) * 0.025;
    vec3 normal = normalize(vec3(ripple, 1.0, ripple * 0.6));
    float fresnel = pow(1.0 - max(dot(toCamera, normal), 0.0), 3.0);
    float glint = pow(max(dot(reflect(-toCamera, normal), uSunDirection), 0.0), 140.0);
    // Dark water that mirrors the burning horizon: warm gold at grazing angles, a sun-glint path on top
    vec3 color = mix(uDeep, uSky, 0.12 + fresnel * 0.7) + uSun * glint * 1.8;
    gl_FragColor = vec4(color, 1.0);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function Terrain({ animate }: { animate: boolean }) {
  const live = useLivePalette();
  const geometry = useMemo(buildTerrainGeometry, []);
  const material = useMemo(() => new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.94, metalness: 0 }), []);

  const lakeGeometry = useMemo(() => {
    const circle = new THREE.CircleGeometry(LAKE.radius * 1.35, 48);
    circle.rotateX(-Math.PI / 2);
    return circle;
  }, []);
  const lakeMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: LAKE_VERTEX,
        fragmentShader: LAKE_FRAGMENT,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uDeep: { value: new THREE.Color() },
            uSky: { value: new THREE.Color() },
            uSun: { value: new THREE.Color() },
            uSunDirection: { value: new THREE.Vector3() },
            uTime: { value: 0 }
          }
        ])
      }),
    []
  );

  useFrame(({ clock }) => {
    material.color.copy(live.colors.terrainTint);
    // Obsidian floor: facets the sun misses read as deep charcoal, never pure black or grey haze
    material.emissive.copy(live.colors.terrainShade);
    material.emissiveIntensity = 1;
    const uniforms = lakeMaterial.uniforms;
    uniforms.uDeep.value.copy(live.colors.water);
    uniforms.uSky.value.copy(live.colors.skyHorizon);
    uniforms.uSun.value.copy(live.colors.sun);
    uniforms.uSunDirection.value.copy(live.sunDirection);
    if (animate) uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <>
      <mesh geometry={geometry} material={material} />
      <mesh geometry={lakeGeometry} material={lakeMaterial} position={[LAKE.x, LAKE.level, LAKE.z]} />
    </>
  );
}
