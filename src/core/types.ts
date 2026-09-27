export type QualityTier = 'high' | 'medium' | 'low';

/** Axis-aligned box on the XZ plane, used for world bounds and static colliders. */
export interface Box2D {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Vec2 {
  x: number;
  z: number;
}

/** Common placement options for procedurally placed objects. */
export interface Placement {
  x?: number;
  y?: number;
  z?: number;
  scale?: number;
  rotationY?: number;
}

/** Per-frame animation callback receiving elapsed seconds. */
export type UpdateFn = (time: number) => void;
