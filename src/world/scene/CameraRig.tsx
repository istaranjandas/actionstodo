// Flies the camera between view vantage points with critically damped motion (no overshoot, no shake),
// lifts it into a gentle arc mid-flight, and adds pointer parallax plus a slow idle sway.
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { useFrame, useThree } from '@react-three/fiber';
import { worldInput } from '../worldInput';
import type { CameraPose } from '../worldViews';

const FLIGHT_SMOOTH_TIME = 0.95;
// Damped cursor parallax: how far the camera drifts and how far its aim follows the pointer
const PARALLAX_EASE = 2.6;
const PARALLAX_SHIFT = 1.3;
const PARALLAX_AIM = 4.5;
// Lean into sideways travel, like a walker taking a bend in the road
const BANK_PER_SPEED = 0.006;
const BANK_LIMIT = 0.05;
const WIDE_LAYOUT_MIN_WIDTH = 1025;
// Wide layouts: the slates sit on the left, so the focal point is framed at ~67% of the width.
// Narrow layouts: the slate is a drawer over the lower half, so the focal point rises to ~21% of the height.
const WIDE_FRAME_SHIFT = -0.17;
const COMPACT_FRAME_LIFT = 0.58;

const goalPosition = new THREE.Vector3();
const goalTarget = new THREE.Vector3();
const focusPoint = new THREE.Vector3();
const lookTarget = new THREE.Vector3();
const change = new THREE.Vector3();
const temp = new THREE.Vector3();
const inverseView = new THREE.Quaternion();

// Unity-style SmoothDamp: frame-rate independent, critically damped
function smoothDamp(current: THREE.Vector3, velocity: THREE.Vector3, target: THREE.Vector3, smoothTime: number, delta: number) {
  const omega = 2 / smoothTime;
  const x = omega * delta;
  const decay = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
  change.subVectors(current, target);
  temp.copy(velocity).addScaledVector(change, omega).multiplyScalar(delta);
  velocity.addScaledVector(temp, -omega).multiplyScalar(decay);
  current.copy(target).add(change.add(temp).multiplyScalar(decay));
}

interface CameraRigProps {
  pose: CameraPose;
  animate: boolean;
}

export function CameraRig({ pose, animate }: CameraRigProps) {
  const camera = useThree((state) => state.camera) as THREE.PerspectiveCamera;
  const width = useThree((state) => state.size.width);
  const aspect = useThree((state) => state.size.width / Math.max(1, state.size.height));
  const rig = useRef({
    position: new THREE.Vector3(...pose.position),
    target: new THREE.Vector3(...pose.target),
    positionVelocity: new THREE.Vector3(),
    targetVelocity: new THREE.Vector3(),
    pointer: new THREE.Vector2(),
    flightDistance: 0
  });

  useEffect(() => {
    const isWide = width >= WIDE_LAYOUT_MIN_WIDTH;
    camera.filmOffset = isWide ? WIDE_FRAME_SHIFT * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * aspect * camera.getFilmWidth() : 0;
    camera.updateProjectionMatrix();
  }, [camera, width, aspect]);

  useEffect(() => {
    rig.current.flightDistance = rig.current.position.distanceTo(goalPosition.set(...pose.position));
  }, [pose]);

  useFrame(({ clock }, delta) => {
    const state = rig.current;
    const step = Math.min(delta, 1 / 20);
    goalPosition.set(...pose.position);
    goalTarget.set(...pose.target);
    // Portrait phones see a narrow slice: aim at the focused post and rise above it so it stays in frame
    // (stepping straight back would walk into yesterday's post)
    const portrait = THREE.MathUtils.clamp((0.95 - aspect) * 1.8, 0, 1);
    if (portrait > 0 && pose.focus) {
      focusPoint.set(...pose.focus);
      goalTarget.lerp(focusPoint, portrait * 0.85);
      goalPosition.sub(goalTarget).multiplyScalar(1 + portrait * 0.15).add(goalTarget);
      goalPosition.y += portrait * 3;
    }

    if (animate) {
      smoothDamp(state.position, state.positionVelocity, goalPosition, FLIGHT_SMOOTH_TIME, step);
      smoothDamp(state.target, state.targetVelocity, goalTarget, FLIGHT_SMOOTH_TIME * 1.12, step);
      const easing = 1 - Math.exp(-PARALLAX_EASE * step);
      state.pointer.x += (worldInput.pointerX - state.pointer.x) * easing;
      state.pointer.y += (worldInput.pointerY - state.pointer.y) * easing;
    } else {
      state.position.copy(goalPosition);
      state.target.copy(goalTarget);
      state.positionVelocity.set(0, 0, 0);
      state.targetVelocity.set(0, 0, 0);
      state.pointer.set(0, 0);
    }

    // Rise over the valley while travelling, settling as the camera arrives
    const remaining = state.position.distanceTo(goalPosition);
    const arc = state.flightDistance > 0 ? Math.sin(Math.min(1, remaining / state.flightDistance) * Math.PI) * Math.min(5, state.flightDistance * 0.18) : 0;
    const time = clock.elapsedTime;
    const sway = animate ? 1 : 0;

    camera.position.set(
      state.position.x + state.pointer.x * PARALLAX_SHIFT + Math.sin(time * 0.071) * 0.55 * sway,
      state.position.y + arc - state.pointer.y * 0.45 + Math.sin(time * 0.113) * 0.2 * sway,
      state.position.z + Math.cos(time * 0.053) * 0.4 * sway
    );
    lookTarget.set(
      state.target.x + state.pointer.x * PARALLAX_AIM,
      state.target.y - state.pointer.y * 2 - worldInput.scroll * 3,
      state.target.z
    );
    camera.lookAt(lookTarget);
    if (animate) {
      // Sideways speed in camera space banks the view slightly while flying between menus
      temp.copy(state.positionVelocity).applyQuaternion(inverseView.copy(camera.quaternion).invert());
      camera.rotateZ(THREE.MathUtils.clamp(-temp.x * BANK_PER_SPEED, -BANK_LIMIT, BANK_LIMIT));
    }

    // Narrow layouts: an off-centre projection lifts the image without tilting the camera.
    // Re-applied every frame because resizes and resolution changes rebuild the projection.
    if (width < WIDE_LAYOUT_MIN_WIDTH && camera.projectionMatrix.elements[9] !== -COMPACT_FRAME_LIFT) {
      camera.projectionMatrix.elements[9] = -COMPACT_FRAME_LIFT;
      camera.projectionMatrixInverse.copy(camera.projectionMatrix).invert();
    }
  });

  return null;
}
