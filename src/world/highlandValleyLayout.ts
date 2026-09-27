/** One physical layout shared by the visible mountain, stream and walkable route. */
export const VALLEY={minX:-55,maxX:125,minZ:-270,maxZ:-100} as const;
export const VALLEY_TRAIL:readonly (readonly [number,number,number])[]=[
  [22,4.3,-108],[5,8,-122],[-21,16,-137],[-32,23,-158],[-10,30,-176],
  [-31,38,-190],[-30,47,-218],[-6,54,-237],[14,60,-242],[20,66,-220],
  [4,73.2,-204],[18,79,-189],[26,80,-198]
];
/** X, water elevation, Z, half width. The 80→15 segment is the main fall. */
export const VALLEY_WATER:readonly (readonly [number,number,number,number])[]=[
  [40,80,-226,3.2],[40,80,-208,3.6],[39,80,-185,7],
  [42,15,-172,10],[43,15,-155,12],[44,15,-145,6],
  [42,6,-134,6],[39,6,-129,7],[35,-.48,-119,6.5],
  [35,-.48,-112,6.5],[39,-.48,-108,4],[45,-.48,-105,3],[49,-.48,-103,3]
];
const blend=(a:number,b:number,v:number)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const mix=(a:number,b:number,t:number)=>a+(b-a)*t;

function closest(x:number,z:number,line:ReadonlyArray<readonly number[]>) {
  let distance=Infinity,height=0,width=0;
  for(let i=1;i<line.length;i++) {
    const a=line[i-1],b=line[i],dx=b[0]-a[0],dz=b[2]-a[2];
    const t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)));
    const d=Math.hypot(x-a[0]-dx*t,z-a[2]-dz*t);
    if(d<distance){distance=d;height=mix(a[1],b[1],t);width=mix(a[3]??0,b[3]??0,t);}
  }
  return {distance,height,width};
}

export function valleyTrailSample(x:number,z:number) {
  const sample=closest(x,z,VALLEY_TRAIL);
  if(sample.distance>=3.6)return sample;
  const surface=trailSurfaceHeight(x,z);
  return surface===null?sample:{...sample,height:surface};
}

/** The same mitered cross-sections define the earth cut and visible path. */
function computeTrailMiter(index:number):readonly [number,number] {
  const point=VALLEY_TRAIL[index];
  const before=VALLEY_TRAIL[Math.max(0,index-1)],after=VALLEY_TRAIL[Math.min(VALLEY_TRAIL.length-1,index+1)];
  const unit=(a:readonly number[],b:readonly number[])=>{
    const dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
    return [dx/length,dz/length] as const;
  };
  const incoming=index===0?unit(point,after):unit(before,point);
  const outgoing=index===VALLEY_TRAIL.length-1?incoming:unit(point,after);
  const scale=1/(1+incoming[0]*outgoing[0]+incoming[1]*outgoing[1]);
  return [-(incoming[1]+outgoing[1])*scale,(incoming[0]+outgoing[0])*scale];
}
const TRAIL_MITERS=VALLEY_TRAIL.map((_,index)=>computeTrailMiter(index));
export function valleyTrailMiter(index:number):readonly [number,number] {return TRAIL_MITERS[index];}

function trailSurfaceHeight(x:number,z:number):number|null {
  const halfWidth=3.6;
  for(let i=1;i<VALLEY_TRAIL.length;i++) {
    const a=VALLEY_TRAIL[i-1],b=VALLEY_TRAIL[i],am=valleyTrailMiter(i-1),bm=valleyTrailMiter(i);
    const dx=b[0]-a[0],dz=b[2]-a[2],dmx=bm[0]-am[0],dmz=bm[1]-am[1];
    let t=Math.max(0,Math.min(1,((x-a[0])*dx+(z-a[2])*dz)/(dx*dx+dz*dz)));
    let offset=0;
    for(let iteration=0;iteration<6;iteration++) {
      const mx=am[0]+dmx*t,mz=am[1]+dmz*t;
      const rx=x-a[0]-dx*t-mx*offset,rz=z-a[2]-dz*t-mz*offset;
      const tx=dx+dmx*offset,tz=dz+dmz*offset,det=tx*mz-tz*mx;
      if(Math.abs(det)<1e-8)break;
      t+=(rx*mz-rz*mx)/det;
      offset+=(tx*rz-tz*rx)/det;
    }
    if(t>=-1e-8&&t<=1+1e-8&&Math.abs(offset)<=halfWidth+1e-8)
      return mix(a[1],b[1],Math.max(0,Math.min(1,t)));
  }
  return null;
}
export function valleyWaterSample(x:number,z:number) {return closest(x,z,VALLEY_WATER);}
export function valleyWaterHeight(x:number,z:number):number|null {
  if(z> -100 || z < -232 || x<24 || x>61)return null;
  const sample=valleyWaterSample(x,z);
  return sample.distance<sample.width-.35?sample.height:null;
}

export function valleyHeight(x:number,z:number,base:number):number {
  if(x<=VALLEY.minX||x>=VALLEY.maxX||z<=VALLEY.minZ||z>=VALLEY.maxZ)return base;
  const envelope=blend(-55,-31,x)*(1-blend(100,125,x))*blend(-270,-247,z)*(1-blend(-124,-108,z));
  const peak=(cx:number,cz:number,rx:number,rz:number,h:number)=>h*Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));
  // Two broad spurs reach south of the recessed fall channel. Their staggered
  // fronts interrupt the former straight cliff edge without changing the bed.
  const frontage=(center:number,radius:number,reach:number)=>reach*Math.exp(-(((x-center)/radius)**2));
  const front=-151+frontage(7,28,14)-frontage(40,17,11)+frontage(78,27,12);
  const shoulder=blend(front,front-39,z);
  const corrugation=Math.sin(x*.14+Math.sin(z*.071)*1.8)*3.8
    +Math.sin(z*.23+x*.11)*2.2+Math.sin(x*.51-z*.31)*1.1;
  const ridges=peak(5,-204,26,41,18)+peak(78,-210,28,43,24)+peak(-23,-211,20,27,12);
  const gullies=peak(36,-191,12,31,13)+peak(104,-201,11,27,8);
  const rawMountain=4+66*shoulder+ridges+(corrugation-gullies)*shoulder;
  const erosion=Math.pow(Math.max(0,Math.sin(rawMountain*.62+Math.sin(x*.19)*.5)),8)*2.5*shoulder;
  const mountain=rawMountain-erosion;
  let height=mix(base,mountain,envelope);
  // Broad terraces around the channel, then a narrower carved bed. The water
  // profile makes the rock wall and cascading water descend together.
  const water=valleyWaterSample(x,z);
  if(z< -108 && water.distance<water.width+12) {
    const basin=mix(water.height-1.8,water.height+.6,blend(water.width*.5,water.width,water.distance));
    height=mix(basin,height,blend(water.width-.4,water.width+12,water.distance));
  }
  const road=valleyTrailSample(x,z);
  // Wide earth shoulders avoid a narrow vertical trench around every switchback.
  if(road.distance<18)height=mix(road.height,height,blend(3.6,18,road.distance));
  // Blend the full road cross-section into the unchanged old forest floor.
  // A linear longitudinal ramp avoids the steep derivative of smoothstep at
  // the join while leaving the old forest floor at z >= -100 untouched.
  const joined=mix(base,height,blend(-100,-106,z));
  if(z<=-100&&z>=-107&&Math.abs(x-22)<4) {
    const along=Math.max(0,Math.min(1,(-100-z)/7));
    const ramp=mix(base,height,along);
    return mix(ramp,joined,blend(2.6,4,Math.abs(x-22)));
  }
  return joined;
}
