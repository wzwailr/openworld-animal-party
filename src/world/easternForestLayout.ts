/** Eastward trails share coordinates between rendering, planting and traversal. */
export const EASTERN_TRAILS: ReadonlyArray<{name:string;points:ReadonlyArray<readonly[number,number]>}> = [
  {name:'east-canopy-trail',points:[[104,-48],[128,-45],[151,-33],[178,-38],[210,-42]]},
  {name:'orchard-approach',points:[[99,28],[128,22],[159,27],[177,47],[193,58]]},
  {name:'windflower-loop',points:[[210,-42],[221,-18],[218,15],[202,36],[193,58]]},
];
export const EASTERN_CLEARINGS = [
  {x:193,z:58,radius:25}, {x:210,z:-42,radius:26},
] as const;
export function easternTrailDistance(x:number,z:number):number {
  let distance=Infinity;
  for(const trail of EASTERN_TRAILS)for(let i=1;i<trail.points.length;i++) {
    const [ax,az]=trail.points[i-1],[bx,bz]=trail.points[i],dx=bx-ax,dz=bz-az;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    distance=Math.min(distance,Math.hypot(x-ax-t*dx,z-az-t*dz));
  }
  return distance;
}
