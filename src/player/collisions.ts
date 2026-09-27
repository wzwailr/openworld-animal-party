import type { Box2D, Vec2 } from '../core/types';

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function clampToBounds(position: Vec2, bounds: Box2D): Vec2 {
  return {
    x: clamp(position.x, bounds.minX, bounds.maxX),
    z: clamp(position.z, bounds.minZ, bounds.maxZ)
  };
}

export function circleIntersectsAabb(position: Vec2, radius: number, box: Box2D): boolean {
  const nearestX = clamp(position.x, box.minX, box.maxX);
  const nearestZ = clamp(position.z, box.minZ, box.maxZ);
  const dx = position.x - nearestX;
  const dz = position.z - nearestZ;
  return dx * dx + dz * dz <= radius * radius;
}

function intersectsAny(position: Vec2, radius: number, colliders: readonly Box2D[]): boolean {
  return colliders.some((box) => circleIntersectsAabb(position, radius, box));
}

/**
 * Resolve a desired 2D displacement against static AABB colliders and world bounds.
 * Falls back to axis-separated movement so the player can slide along walls.
 */
export function resolveMovement(
  current: Vec2,
  desired: Vec2,
  radius: number,
  colliders: readonly Box2D[],
  bounds: Box2D
): Vec2 {
  const target = clampToBounds(desired, bounds);
  if (!intersectsAny(target, radius, colliders)) return target;

  const xOnly = clampToBounds({ x: target.x, z: current.z }, bounds);
  if (!intersectsAny(xOnly, radius, colliders)) return xOnly;

  const zOnly = clampToBounds({ x: current.x, z: target.z }, bounds);
  if (!intersectsAny(zOnly, radius, colliders)) return zOnly;

  return clampToBounds(current, bounds);
}
