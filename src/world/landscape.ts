import { valleyHeight, valleyTrailSample } from './highlandValleyLayout';
import { easternTrailDistance } from './easternForestLayout';

export const WATER_LEVEL = -0.48;
export const BRIDGE = { x: 48, z: 4, halfLength: 11, halfWidth: 2.3 } as const;
export const CROSSINGS = [BRIDGE,
  { x: riverCenter(-74), z: -74, halfLength: 14, halfWidth: 2.1 },
  { x: riverCenter(88), z: 88, halfLength: 14, halfWidth: 2.1 }
] as const;
export const HEADWATER_CHANNEL = [[35,-123,6.5],[35,-112,6.5],[39,-108,4],[45,-105,3],[49,-103,3]] as const;

/** Shared centre lines keep rendered dirt, vegetation exclusions and routes in agreement. */
export const FOREST_TRAILS: ReadonlyArray<{ name: string; points: ReadonlyArray<readonly [number, number]> }> = [
  { name: 'market-trail', points: [[-10,12],[-30,12],[-58,7],[-82,11],[-112,4]] },
  { name: 'old-forest-loop', points: [[-112,4],[-125,-24],[-108,-61],[-67,-80],[-25,-67],[-7,-54],[-4,-44]] },
  { name: 'headwater-trail', points: [[-4,-44],[-6,-58],[11,-69],[22,-83],[22,-108]] },
  { name: 'northern-crossing-trail', points: [[11,-69],[27,-74],[66,-74],[87,-60],[104,-48]] },
  { name: 'treehouse-trail-east', points: [[64,4],[83,-2],[94,-22],[104,-48]] },
  { name: 'flower-garden-trail', points: [[0,58],[-6,77],[-28,96],[-70,82],[-109,45],[-112,4]] },
  { name: 'southern-crossing-trail', points: [[-28,96],[1,91],[28,88],[69,88],[95,61],[99,28],[83,-2]] }
];

export function forestTrailDistance(x: number, z: number): number {
  let distance = Infinity;
  for (const trail of FOREST_TRAILS) for (let i=1;i<trail.points.length;i++) {
    const [ax,az]=trail.points[i-1], [bx,bz]=trail.points[i];
    const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    distance=Math.min(distance,Math.hypot(x-ax-t*dx,z-az-t*dz));
  }
  return distance;
}

export function smoothstep(a: number, b: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - a) / (b - a)));
  return t * t * (3 - 2 * t);
}
export function riverCenter(z: number): number {
  return 48 + Math.sin((z - 4) * 0.045) * 2.8;
}
/** Keep the authored crossing fixed, then widen the banks into asymmetric coves. */
export function riverHalfWidth(z: number, side: number): number {
  const blend = smoothstep(5, 16, Math.abs(z - BRIDGE.z));
  const bay = (center: number, radius: number) => Math.exp(-(((z - center) / radius) ** 2));
  return 7.75 + blend * (side < 0 ? 3 * bay(-25, 17) - 0.8 * bay(36, 14) : 2 * bay(35, 20) - 1.1 * bay(-28, 15));
}
export function riverBankDistance(x: number, z: number): number {
  const dx = x - riverCenter(z);
  return Math.abs(dx) - riverHalfWidth(z, Math.sign(dx));
}
export function getTerrainHeight(x: number, z: number): number {
  const hill = (cx: number, cz: number, r: number, h: number) =>
    h * Math.exp(-((x - cx) ** 2 + (z - cz) ** 2) / (r * r));
  const plaza = smoothstep(12, 28, Math.hypot(x, z));
  const rolling = 0.45 + plaza * (0.4 * Math.sin(x * 0.09) * Math.cos(z * 0.075)
    + hill(-42, -42, 23, 9) + hill(17, -62, 20, 11) + hill(-58, 26, 25, 6)
    + hill(77, -27, 20, 8) + hill(74, 57, 24, 6)
    + hill(-130,-97,25,17) + hill(113,-100,28,20) + hill(-140,89,26,11)
    + hill(131,64,23,16) + hill(7,-132,24,18));
  const dx = x - riverCenter(z);
  const bank = smoothstep(4.8, 9.3, Math.abs(dx) * 7.75 / riverHalfWidth(z, Math.sign(dx)));
  let height=-1.7 * (1 - bank) + rolling * bank;
  if(z < -98 && z > -132 && x>25 && x<57) for(let i=1;i<HEADWATER_CHANNEL.length;i++) {
    const [ax,az,aw]=HEADWATER_CHANNEL[i-1],[bx,bz,bw]=HEADWATER_CHANNEL[i];
    const dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    const d=Math.hypot(x-ax-t*dx,z-az-t*dz),width=aw+(bw-aw)*t;
    const edge=smoothstep(width-1.8,width+.8,d);
    height=Math.min(height,-1.3*(1-edge)+height*edge);
  }
  return valleyHeight(x,z,height);
}
/** Same deck surface for timber geometry, rail posts and the player. */
export function getBridgeHeight(x: number, crossing: { x: number; z: number; halfLength: number } = BRIDGE): number {
  const left=crossing.x-crossing.halfLength,right=crossing.x+crossing.halfLength;
  const t = Math.max(0, Math.min(1, (x - left) / (right-left)));
  return getTerrainHeight(left, crossing.z) * (1 - t) + getTerrainHeight(right, crossing.z) * t
    + Math.sin(t * Math.PI) * 1.4;
}
export function stageFront(zeroBasedX: number): number {
  return -2 + 0.65 * Math.sqrt(Math.max(0, 6.6 ** 2 - zeroBasedX ** 2));
}
export function getRampHeight(x: number, z: number): number {
  const start = stageFront(x);
  const t = Math.max(0, Math.min(1, (z - start) / (6.8 - start)));
  return 1.35 + (getTerrainHeight(x, 6.8) - 1.35) * t;
}
/** Visible earthen apron lets visitors step off every open side of the low stage. */
export function getStageApronHeight(x: number, z: number): number {
  const ground = getTerrainHeight(x, z);
  const radius = Math.hypot(x, (z + 2) / .65);
  const apron = Math.max(ground, ground + (1.35 - ground) * (1 - Math.max(0, Math.min(1, (radius - 6.6) / 3.6))));
  // The wooden ramp has tapered shoulders as well: its former vertical side
  // produced an invisible slope barrier even below knee height.
  if (Math.abs(x) < 3.4 && z >= stageFront(Math.min(1.8, Math.abs(x))) && z <= 6.8) {
    const shoulder = Math.max(0, Math.min(1, (Math.abs(x) - 1.8) / 1.6));
    const ramp = getRampHeight(Math.max(-1.8, Math.min(1.8, x)), z);
    return Math.max(apron, ground + (ramp - ground) * (1 - shoulder));
  }
  return apron;
}
export function getWalkHeight(x: number, z: number): number {
  for (const crossing of CROSSINGS) if (Math.abs(z-crossing.z)<=crossing.halfWidth && Math.abs(x-crossing.x)<=crossing.halfLength) return getBridgeHeight(x,crossing);
  if (Math.hypot(x, (z + 2) / 0.65) < 6.6) return 1.35;
  if (Math.abs(x) <= 1.8 && z >= stageFront(x) && z <= 6.8) {
    return getRampHeight(x, z);
  }
  if (Math.abs(x) < 11 && z > -10 && z < 7) return getStageApronHeight(x,z);
  return getTerrainHeight(x, z);
}
export function pathCenter(z: number): number {
  return Math.sin(z * 0.072) * 4 * smoothstep(10, 28, z);
}
export function isOriginalPath(x: number, z: number, margin = 0): boolean {
  return Math.hypot(x, z) < 13 + margin
    || (z >= 0 && Math.abs(x - pathCenter(z)) < 2.1 + margin)
    || (x >= 0 && Math.abs(z - 4) < 2.5 + margin)
    || (z < 0 && z > -49 && Math.abs(x - Math.sin(z * 0.06) * 5) < 1.8 + margin)
    || forestTrailDistance(x,z)<2.05+margin
    || (z<-107 && valleyTrailSample(x,z).distance<2.3+margin);
}
export function isPath(x:number,z:number,margin=0):boolean {
  return isOriginalPath(x,z,margin) || easternTrailDistance(x,z)<2.05+margin;
}
export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}
