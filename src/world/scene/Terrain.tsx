import { useMemo } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { useLivePalette } from './livePalette';
import type { LivePalette } from './livePalette';
import { smoothstep } from './noise';
import { LAKE, TERRAIN_CENTER_Z, TERRAIN_LENGTH, TERRAIN_SEGMENTS_X, TERRAIN_SEGMENTS_Z, TERRAIN_WIDTH, terrainHeight } from './terrainShape';

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
  const blends = new Float32Array(positions.count * 3);
  for (let i = 0; i < positions.count; i++) {
    const column = i % rowLength;
    const row = Math.floor(i / rowLength);
    const height = heights[i];
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const snowLine = 54 + Math.sin(x * 0.07) * 6 + Math.cos(z * 0.05) * 5;
    const neighbourAverage = (heightAt(column + 2, row) + heightAt(column - 2, row) + heightAt(column, row + 2) + heightAt(column, row - 2)) / 4;
    const occlusion = THREE.MathUtils.clamp(0.84 + (height - neighbourAverage) * 0.05, 0.55, 1.08) * (0.72 + 0.28 * smoothstep(-2, 16, height));
    blends[i * 3] = smoothstep(1.5, 20, height);
    blends[i * 3 + 1] = smoothstep(snowLine - 6, snowLine + 4, height);
    blends[i * 3 + 2] = occlusion;
  }
  plane.setAttribute('terrainBlend', new THREE.BufferAttribute(blends, 3));
  plane.computeVertexNormals();
  return plane;
}

const TERRAIN_COLOR_PARS = /* glsl */ `
  #include <common>
  attribute vec3 terrainBlend;
  uniform vec3 valleyColor;
  uniform vec3 rockColor;
  uniform vec3 peakColor;
`;

// three r186 widened vColor to vec4 for every colour path, so the tint must be assigned as vec4
const TERRAIN_COLOR_VERTEX = /* glsl */ `
  vec3 terrainTint = mix(mix(valleyColor, rockColor, terrainBlend.x), peakColor, terrainBlend.y) * terrainBlend.z;
  vColor = vec4(terrainTint, 1.0);
`;

function buildTerrainMaterial(live: LivePalette): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.94, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.valleyColor = { value: live.colors.terrainValley };
    shader.uniforms.rockColor = { value: live.colors.terrainRock };
    shader.uniforms.peakColor = { value: live.colors.terrainPeak };
    shader.vertexShader = shader.vertexShader.replace('#include <common>', TERRAIN_COLOR_PARS).replace('#include <color_vertex>', TERRAIN_COLOR_VERTEX);
  };
  return material;
}

const LAKE_VERTEX = /* glsl */ `
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  #include <fog_pars_vertex>
  void main() {
    vUv = uv;
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
  uniform float uGlintStrength;
  uniform float uTime;
  varying vec3 vWorldPosition;
  varying vec2 vUv;
  #include <fog_pars_fragment>
  void main() {
    vec3 toCamera = normalize(cameraPosition - vWorldPosition);
    float ripple = sin(vWorldPosition.x * 0.7 + uTime * 0.45) * 0.018 + sin(vWorldPosition.z * 1.1 - uTime * 0.33) * 0.018;
    vec3 normal = normalize(vec3(ripple, 1.0, ripple * 0.6));
    float fresnel = pow(1.0 - max(dot(toCamera, normal), 0.0), 4.0);
    // A narrow, feathered sun path: the lake mirrors a little of the burning rim, it never becomes it
    float glint = pow(max(dot(reflect(-toCamera, normal), uSunDirection), 0.0), 720.0);
    vec3 color = mix(uDeep, uSky, fresnel * 0.3);
    color += uSun * glint * uGlintStrength * 0.4;
    // Feather the shoreline so the water meets the valley instead of ending in a cut-out polygon
    float shore = smoothstep(0.52, 0.18, length(vUv - 0.5));
    gl_FragColor = vec4(color, shore);
    #include <colorspace_fragment>
    #include <fog_fragment>
  }
`;

export function Terrain({ animate }: { animate: boolean }) {
  const live = useLivePalette();
  const geometry = useMemo(buildTerrainGeometry, []);
  const material = useMemo(() => buildTerrainMaterial(live), [live]);

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
        transparent: true,
        depthWrite: false,
        fog: true,
        uniforms: THREE.UniformsUtils.merge([
          THREE.UniformsLib.fog,
          {
            uDeep: { value: new THREE.Color() },
            uSky: { value: new THREE.Color() },
            uSun: { value: new THREE.Color() },
            uSunDirection: { value: new THREE.Vector3() },
            uGlintStrength: { value: 1.8 },
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
    uniforms.uGlintStrength.value = live.numbers.waterGlintStrength;
    if (animate) uniforms.uTime.value = clock.elapsedTime;
  });

  return (
    <>
      <mesh geometry={geometry} material={material} receiveShadow />
      <mesh geometry={lakeGeometry} material={lakeMaterial} position={[LAKE.x, LAKE.level, LAKE.z]} />
    </>
  );
}
