import * as THREE from 'three';
import type { UpdateFn } from '../core/types';

/** Collect all per-frame update callbacks registered on an object tree via `userData.update`. */
export function collectAnimations(root: THREE.Object3D): UpdateFn[] {
  const animations: UpdateFn[] = [];
  root.traverse((object) => {
    const update = (object.userData as { update?: UpdateFn }).update;
    if (typeof update === 'function') animations.push(update);
  });
  return animations;
}
