import type { Region } from './config';

export function getRegionAt(
  position: { x: number; z: number },
  regions: readonly Region[]
): string | null {
  let nearest: Region | null = null;
  let nearestDistanceSquared = Infinity;

  for (const region of regions) {
    const dx = position.x - region.x;
    const dz = position.z - region.z;
    const distanceSquared = dx * dx + dz * dz;

    if (distanceSquared <= region.radius * region.radius && distanceSquared < nearestDistanceSquared) {
      nearest = region;
      nearestDistanceSquared = distanceSquared;
    }
  }

  return nearest?.name ?? null;
}
