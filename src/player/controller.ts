import { Euler, PerspectiveCamera } from 'three';
import { resolveSlopeMovement } from './slopeMovement';
import { SPAWN, WORLD, type SpawnPoint } from '../world/config';
import type { Box2D, Vec2 } from '../core/types';

const WALK_SPEED = 5.2;
const SPRINT_SPEED = 8;
const MAX_DELTA = 0.05;
const EYE_HEIGHT = 1.7;
const PLAYER_RADIUS = 0.45;
const LOOK_SENSITIVITY = 0.0025;
const LIFT_SPEED = 6;
const MAX_VIEW_HEIGHT = 160;
const MOVEMENT_KEYS = new Set(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Space', 'ControlLeft', 'ControlRight', 'KeyC', 'KeyR']);

export type LookMode = 'pointer-lock' | 'free-look';

interface ControllerOptions {
  camera: PerspectiveCamera;
  domElement: HTMLElement;
  colliders: readonly Box2D[];
  getGroundHeight: (x: number, z: number) => number;
  onLock?: (mode: LookMode) => void;
  onUnlock?: () => void;
  onHeightChange?: (elevation: number) => void;
}

export interface PlayerController {
  lock(): void;
  reset(spawn?: Pick<SpawnPoint, 'x' | 'z' | 'yaw'>): void;
  isLocked(): boolean;
  update(delta: number): void;
  dispose(): void;
}

export function computeMoveVector(
  keys: ReadonlySet<string>,
  yaw: number,
  speed: number,
  delta: number
): Vec2 {
  const forward = (keys.has('KeyW') ? 1 : 0) - (keys.has('KeyS') ? 1 : 0);
  const right = (keys.has('KeyD') ? 1 : 0) - (keys.has('KeyA') ? 1 : 0);
  const length = Math.hypot(forward, right) || 1;
  const distance = speed * delta;

  return {
    x: ((-Math.sin(yaw) * forward + Math.cos(yaw) * right) / length) * distance,
    z: ((-Math.cos(yaw) * forward - Math.sin(yaw) * right) / length) * distance
  };
}

export function createPlayerController({
  camera,
  domElement,
  colliders,
  getGroundHeight,
  onLock = () => {},
  onUnlock = () => {},
  onHeightChange = () => {}
}: ControllerOptions): PlayerController {
  const doc = domElement.ownerDocument;
  const view = doc.defaultView!;
  const keys = new Set<string>();
  const orientation = new Euler(0, 0, 0, 'YXZ');
  let mode: LookMode | null = null;
  let wantsRoam = false;
  let pendingLock = false;
  let disposed = false;
  let requestId = 0;
  let altitude: number | null = null;
  let pointer: { x: number; y: number } | undefined;
  let edgeTurn = 0;

  const clearInput = () => { keys.clear(); pointer = undefined; edgeTurn = 0; };
  const activate = (nextMode: LookMode) => {
    if (!wantsRoam || disposed || mode === nextMode) return;
    clearInput();
    mode = nextMode;
    onLock(nextMode);
  };
  const pause = () => {
    const wasActive = wantsRoam;
    wantsRoam = false;
    mode = null;
    clearInput();
    if (doc.pointerLockElement === domElement) doc.exitPointerLock();
    if (wasActive && !disposed) onUnlock();
  };
  const removeLockListeners = () => {
    doc.removeEventListener('pointerlockchange', handleLockChange);
    doc.removeEventListener('pointerlockerror', handleLockError);
  };
  const settleRequest = () => {
    pendingLock = false;
    if (disposed) removeLockListeners();
  };
  const handleLockChange = () => {
    if (doc.pointerLockElement === domElement) {
      settleRequest();
      if (wantsRoam && !disposed) activate('pointer-lock');
      else doc.exitPointerLock();
    } else if (mode === 'pointer-lock') {
      pause();
    }
  };
  const handleLockError = () => {
    settleRequest();
    if (!mode) activate('free-look');
  };
  const lock = () => {
    if (disposed || wantsRoam) return;
    wantsRoam = true;
    if (pendingLock) return;
    pendingLock = true;
    const attempt = ++requestId;
    const fallback = () => {
      if (attempt === requestId) handleLockError();
    };
    try {
      if (!domElement.requestPointerLock) { fallback(); return; }
      // The in-app browser can expose this API but reject it. Do not leave an
      // uncaught rejection or require the mouse button in that compatibility mode.
      const request = domElement.requestPointerLock();
      request?.then(handleLockChange, fallback);
    } catch {
      fallback();
    }
  };

  const reset = (spawn: Pick<SpawnPoint, 'x' | 'z' | 'yaw'> = SPAWN) => {
    altitude = null;
    clearInput();
    camera.position.set(spawn.x, getGroundHeight(spawn.x, spawn.z) + EYE_HEIGHT, spawn.z);
    camera.rotation.set(0, spawn.yaw, 0, 'YXZ');
    onHeightChange(0);
  };
  const turn = (dx: number, dy: number) => {
    orientation.setFromQuaternion(camera.quaternion);
    orientation.y -= dx * LOOK_SENSITIVITY;
    orientation.x = Math.max(-1.45, Math.min(1.45, orientation.x - dy * LOOK_SENSITIVITY));
    camera.quaternion.setFromEuler(orientation);
  };
  const lockedMouseMove = (event: MouseEvent) => {
    if (mode === 'pointer-lock') turn(event.movementX, event.movementY);
  };
  const freeMouseMove = (event: MouseEvent) => {
    if (mode !== 'free-look') return;
    if (pointer) turn(event.clientX - pointer.x, event.clientY - pointer.y);
    pointer = { x: event.clientX, y: event.clientY };
    const rect = domElement.getBoundingClientRect();
    const x = event.clientX - rect.left;
    edgeTurn = x < 18 ? -1 : x > rect.width - 18 ? 1 : 0;
  };
  const leave = () => { pointer = undefined; edgeTurn = 0; };
  const visibilityChange = () => { if (doc.hidden) pause(); };

  const onKeyDown = (event: KeyboardEvent) => {
    if (event.code === 'Escape') { pause(); return; }
    if (!mode || !MOVEMENT_KEYS.has(event.code)) return;
    event.preventDefault();
    if (event.code === 'KeyR') { reset(); return; }
    keys.add(event.code);
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (mode && MOVEMENT_KEYS.has(event.code)) event.preventDefault();
    keys.delete(event.code);
  };

  view.addEventListener('keydown', onKeyDown);
  view.addEventListener('keyup', onKeyUp);
  view.addEventListener('blur', pause);
  doc.addEventListener('visibilitychange', visibilityChange);
  doc.addEventListener('pointerlockchange', handleLockChange);
  doc.addEventListener('pointerlockerror', handleLockError);
  doc.addEventListener('mousemove', lockedMouseMove);
  domElement.addEventListener('mousemove', freeMouseMove);
  domElement.addEventListener('mouseleave', leave);

  return {
    lock,
    reset,
    isLocked: () => mode !== null,
    update(delta: number) {
      if (!mode) return;
      const dt = Math.max(0, Math.min(delta, MAX_DELTA));
      if (mode === 'free-look' && edgeTurn) turn(edgeTurn * dt * 1.4 / LOOK_SENSITIVITY, 0);
      const sprinting = keys.has('ShiftLeft') || keys.has('ShiftRight');
      const speed = sprinting ? SPRINT_SPEED : WALK_SPEED;
      const yaw = orientation.setFromQuaternion(camera.quaternion).y;
      const movement = computeMoveVector(keys, yaw, speed, dt);
      const next = resolveSlopeMovement(
        { x: camera.position.x, z: camera.position.z },
        { x: camera.position.x + movement.x, z: camera.position.z + movement.z },
        PLAYER_RADIUS,
        colliders,
        WORLD,
        getGroundHeight,
        altitude === null ? null : altitude - EYE_HEIGHT
      );
      const floor = getGroundHeight(next.x, next.z) + EYE_HEIGHT;
      const descending = keys.has('ControlLeft') || keys.has('ControlRight') || keys.has('KeyC');
      const lift = (keys.has('Space') ? 1 : 0) - (descending ? 1 : 0);
      if (lift || altitude !== null) {
        altitude = Math.max(floor, Math.min(Math.max(floor, MAX_VIEW_HEIGHT), (altitude ?? floor) + lift * LIFT_SPEED * dt));
        if (altitude <= floor && lift <= 0) altitude = null;
      }
      camera.position.set(next.x, altitude ?? floor, next.z);
      onHeightChange(camera.position.y - floor);
    },
    dispose() {
      disposed = true;
      pause();
      view.removeEventListener('keydown', onKeyDown);
      view.removeEventListener('keyup', onKeyUp);
      view.removeEventListener('blur', pause);
      doc.removeEventListener('visibilitychange', visibilityChange);
      // Legacy browsers only signal completion with events. Retain just these
      // listeners until an in-flight request settles so a late lock is released.
      if (!pendingLock) removeLockListeners();
      doc.removeEventListener('mousemove', lockedMouseMove);
      domElement.removeEventListener('mousemove', freeMouseMove);
      domElement.removeEventListener('mouseleave', leave);
    }
  };
}
