import type { Box2D, Vec2 } from '../core/types';

export const WORLD: Box2D = Object.freeze({ minX: -160, maxX: 250, minZ: -280, maxZ: 140 });

export interface SpawnPoint extends Vec2 {
  y: number;
  yaw: number;
}

export const SPAWN: SpawnPoint = Object.freeze({ x: 0, z: 58, y: 1.7, yaw: 0 });

/** The contained garden water feature also excludes ambient grass and flowers. */
export const GARDEN_BASIN = Object.freeze({ x: -20, z: 112, radius: 2.2 });

export interface Region {
  name: string;
  x: number;
  z: number;
  radius: number;
}

/** The reference's concentrated scenes unfold along connected forest trails. */
export const REGIONS: readonly Region[] = Object.freeze([
  { name: '月光花拱门入口', x: 0, z: 58, radius: 18 },
  { name: '糖果巨型蘑菇森林', x: -45, z: -18, radius: 31 },
  { name: '仲夏动物庆典广场', x: 0, z: 0, radius: 28 },
  { name: '浅溪与风车水车谷', x: 48, z: 4, radius: 30 },
  { name: '古树驿站', x: 0, z: -48, radius: 27 },
  { name: '蘑菇灯笼集市', x: -112, z: 4, radius: 30 },
  { name: '林冠树屋聚落', x: 104, z: -48, radius: 32 },
  { name: '高山瀑布谷', x: 32, z: -181, radius: 92 },
  { name: '萤火花园', x: -28, z: 96, radius: 25 },
  { name: '东林蜜果园', x: 193, z: 58, radius: 26 },
  { name: '风车花田', x: 210, z: -42, radius: 29 }
]);
