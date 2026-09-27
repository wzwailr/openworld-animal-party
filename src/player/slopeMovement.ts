import type { Box2D, Vec2 } from '../core/types';
import { resolveMovement } from './collisions';

const MAX_GRADE = Math.tan(38 * Math.PI / 180);
const MAX_SAMPLE_DISTANCE = 0.05;

/** Keep terrain traversal and wall sliding subject to the same slope limit. */
export function resolveSlopeMovement(
  current: Vec2,
  desired: Vec2,
  radius: number,
  colliders: readonly Box2D[],
  bounds: Box2D,
  getGroundHeight: (x: number, z: number) => number,
  hoverFloor: number | null = null
): Vec2 {
  const dx = desired.x - current.x, dz = desired.z - current.z;
  const samples = Math.ceil(Math.hypot(dx, dz) / MAX_SAMPLE_DISTANCE);
  let position = current;
  // Bound the spatial interval even while sprinting: frame endpoints can sit on
  // equal-height ground on opposite sides of a narrow ridge or drop.
  for (let sample = 0; sample < samples; sample++) {
    const target = { x: position.x + dx / samples, z: position.z + dz / samples };
    const ground = getGroundHeight(position.x, position.z);
    let accepted = position;
    for (const candidate of [target, { x: target.x, z: position.z }, { x: position.x, z: target.z }]) {
      const next = resolveMovement(position, candidate, radius, colliders, bounds);
      const distance = Math.hypot(next.x - position.x, next.z - position.z);
      if (!distance) continue;
      const nextGround = getGroundHeight(next.x, next.z);
      // Use the actual ground gradient when it reaches the observer. Clamping
      // it to hoverFloor would let repeated tiny steps ratchet up a steep wall.
      const belowObserver = hoverFloor !== null && Math.max(ground, nextGround) <= hoverFloor + 1e-8;
      if (belowObserver || Math.abs(nextGround - ground) / distance < MAX_GRADE - 1e-8) {
        accepted = next;
        break;
      }
    }
    if (accepted === position) break;
    position = accepted;
  }
  return position;
}
