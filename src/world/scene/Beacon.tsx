// The horizon landmark: a lighthouse at the far end of the trail whose beam sweeps the valley.
// It flares whenever a task is completed or added, answering from the distance.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { subscribeWorldEvents } from '../worldEvents';
import { useLivePalette } from './livePalette';
import { terrainHeight } from './terrainShape';

const TOWER_HEIGHT = 11;
const LAMP_HEIGHT = TOWER_HEIGHT + 0.9;
const BEAM_LENGTH = 90;
const BEAM_SPEED = 0.32;
const BEACON_POSITION: [number, number, number] = [30, 0, -205];

const BEAM_VERTEX = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const BEAM_FRAGMENT = /* glsl */ `
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float along = pow(vUv.y, 1.6);
    float core = 1.0 - abs(vUv.x - 0.5) * 2.0;
    gl_FragColor = vec4(uColor, along * smoothstep(0.0, 1.0, core) * uOpacity);
    #include <colorspace_fragment>
  }
`;

export function Beacon({ animate }: { animate: boolean }) {
  const live = useLivePalette();
  const beamPivot = useRef<THREE.Group>(null);
  const lampLight = useRef<THREE.PointLight>(null);
  const flare = useRef(0);
  const ground = useMemo(() => terrainHeight(BEACON_POSITION[0], BEACON_POSITION[2]), []);

  const towerMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#3c434a', roughness: 0.8, metalness: 0.15, flatShading: true }), []);
  const trimMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#d9d2c3', roughness: 0.7, flatShading: true }), []);
  const lampMaterial = useMemo(() => new THREE.MeshStandardMaterial({ color: '#2a2016', emissive: new THREE.Color('#ffb757'), emissiveIntensity: 2.4, roughness: 0.4 }), []);
  const beamMaterial = useMemo(
    () =>
      new THREE.ShaderMaterial({
        vertexShader: BEAM_VERTEX,
        fragmentShader: BEAM_FRAGMENT,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: new THREE.Color() }, uOpacity: { value: 0.15 } }
      }),
    []
  );
  const beamGeometry = useMemo(() => {
    // A flat fan pointing along +X from the lamp, widening with distance (uv.y = 1 at the lamp)
    const shape = new THREE.PlaneGeometry(1, BEAM_LENGTH, 1, 1);
    const position = shape.attributes.position as THREE.BufferAttribute;
    for (let i = 0; i < position.count; i++) {
      const isFar = position.getY(i) < 0;
      position.setX(i, position.getX(i) * (isFar ? 26 : 0.8));
    }
    shape.translate(0, -BEAM_LENGTH / 2, 0);
    shape.rotateZ(Math.PI / 2);
    return shape;
  }, []);
  useEffect(
    () =>
      subscribeWorldEvents((event) => {
        flare.current = Math.max(flare.current, event.type === 'complete' ? 1 : 0.55);
      }),
    []
  );

  useFrame(({ clock }, delta) => {
    const step = Math.min(delta, 1 / 20);
    if (beamPivot.current && animate) beamPivot.current.rotation.y = clock.elapsedTime * BEAM_SPEED;
    flare.current = Math.max(0, flare.current - step * 0.9);

    const blink = animate ? 0.85 + 0.15 * Math.sin(clock.elapsedTime * 2.6) : 1;
    lampMaterial.emissive.copy(live.colors.beacon);
    lampMaterial.emissiveIntensity = (2.2 + flare.current * 6) * blink;
    beamMaterial.uniforms.uColor.value.copy(live.colors.beacon);
    beamMaterial.uniforms.uOpacity.value = live.numbers.beamOpacity * (1 + flare.current * 2.5);
    if (lampLight.current) {
      lampLight.current.color.copy(live.colors.beacon);
      lampLight.current.intensity = (60 + flare.current * 420) * live.numbers.lampLightStrength;
    }

  });

  return (
    <group position={[BEACON_POSITION[0], ground - 0.4, BEACON_POSITION[2]]} scale={2.4}>
      <mesh material={towerMaterial} position={[0, 0.9, 0]}>
        <cylinderGeometry args={[2.4, 2.9, 1.8, 8]} />
      </mesh>
      <mesh material={towerMaterial} position={[0, TOWER_HEIGHT / 2 + 1.2, 0]}>
        <cylinderGeometry args={[0.95, 1.5, TOWER_HEIGHT - 1.2, 8]} />
      </mesh>
      <mesh material={trimMaterial} position={[0, TOWER_HEIGHT * 0.45, 0]}>
        <cylinderGeometry args={[1.32, 1.36, 0.7, 8]} />
      </mesh>
      <mesh material={trimMaterial} position={[0, TOWER_HEIGHT + 0.1, 0]}>
        <cylinderGeometry args={[1.6, 1.6, 0.35, 8]} />
      </mesh>
      <mesh material={lampMaterial} position={[0, LAMP_HEIGHT, 0]}>
        <cylinderGeometry args={[0.9, 0.9, 1.3, 8]} />
      </mesh>
      <mesh material={towerMaterial} position={[0, LAMP_HEIGHT + 1.2, 0]}>
        <coneGeometry args={[1.25, 1.2, 8]} />
      </mesh>
      <pointLight ref={lampLight} position={[0, LAMP_HEIGHT, 0]} distance={90} decay={2} />
      {/* Two opposed beams, each a crossed pair of fans so it has volume from any angle */}
      <group ref={beamPivot} position={[0, LAMP_HEIGHT, 0]}>
        {[0, Math.PI].map((angle) => (
          <group key={angle} rotation={[0, angle, -0.03]}>
            <mesh geometry={beamGeometry} material={beamMaterial} />
            <mesh geometry={beamGeometry} material={beamMaterial} rotation={[Math.PI / 2, 0, 0]} />
          </group>
        ))}
      </group>
    </group>
  );
}
