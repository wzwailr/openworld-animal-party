import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { blossomGeometry, woodGrain } from '../../entities/festivalLandmarks';
import { getTerrainHeight, isPath, WATER_LEVEL, seededRandom } from '../landscape';
import { GARDEN_BASIN } from '../config';
import type { Box2D, UpdateFn } from '../../core/types';

// Authored activity pockets sit alongside the existing routes. No raised deck is
// advertised as a walking surface: these additions do not change the height field.
const up = new THREE.Vector3(0, 1, 0);
const colors = {
  wood: 0x96724c, dark: 0x574832, pale: 0xc2a473, cream: 0xe5d4ac,
  teal: 0x63877c, rose: 0xb97569, leaf: 0x667d42, moss: 0x818b51,
  clay: 0xa97754, brass: 0xb6a064, berry: 0xae5151, violet: 0xa28bb5,
};
type Tone = keyof typeof colors;

function palette() {
  return Object.fromEntries(Object.entries(colors).map(([name, color]) => [name,
    new THREE.MeshStandardMaterial({ color, roughness: .9, side: THREE.DoubleSide,
      map: ['wood', 'dark', 'pale'].includes(name) ? woodGrain() : null }),
  ])) as Record<Tone, THREE.MeshStandardMaterial>;
}

export function createRegionEnrichment(): { group: THREE.Group; colliders: Box2D[]; animations: UpdateFn[] } {
  const group = new THREE.Group(); group.name = 'settlement-life-enrichment';
  const colliders: Box2D[] = [], animations: UpdateFn[] = [], mat = palette();
  const mesh = (g: THREE.BufferGeometry, tone: Tone, x=0, y=0, z=0) => {
    const m = new THREE.Mesh(g, mat[tone]); m.position.set(x,y,z);
    m.castShadow = true; m.receiveShadow = true; return m;
  };
  const box = (g: THREE.Group, w:number,h:number,d:number,x:number,y:number,z:number,tone:Tone='wood') => {
    const m=mesh(new THREE.BoxGeometry(w,h,d),tone,x,y,z);g.add(m);return m;
  };
  const rod = (g:THREE.Group,a:number[],b:number[],r:number,tone:Tone='dark') => {
    const start=new THREE.Vector3(...a),end=new THREE.Vector3(...b),v=end.clone().sub(start);
    const m=mesh(new THREE.CylinderGeometry(r*.82,r,v.length(),8),tone);
    m.position.copy(start).add(end).multiplyScalar(.5);m.quaternion.setFromUnitVectors(up,v.normalize());g.add(m);return m;
  };
  const tube = (g:THREE.Group,points:number[][],r:number,tone:Tone='dark') => {
    const curve=new THREE.CatmullRomCurve3(points.map(p=>new THREE.Vector3(...p)));
    const m=mesh(new THREE.TubeGeometry(curve,Math.max(12,points.length*3),r,5,false),tone);g.add(m);return m;
  };
  const sphere=(g:THREE.Group,x:number,y:number,z:number,sx:number,sy:number,sz:number,tone:Tone)=>{
    const m=mesh(new THREE.SphereGeometry(1,12,8),tone,x,y,z);m.scale.set(sx,sy,sz);g.add(m);return m;
  };
  const pot=(g:THREE.Group,x:number,y:number,z:number,r=.32)=>{
    g.add(mesh(new THREE.CylinderGeometry(r,r*.66,r*1.4,12,1,true),'clay',x,y+r*.7,z));
    const rim=mesh(new THREE.TorusGeometry(r,.035,5,16),'pale',x,y+r*1.4,z);rim.rotation.x=Math.PI/2;g.add(rim);
    g.add(mesh(new THREE.CylinderGeometry(r*.9,r*.9,.05,12),'dark',x,y+r*1.3,z));
  };
  const crate=(g:THREE.Group,x:number,y:number,z:number,w=1,d=.7)=>{
    for(const side of [-1,1]) {
      for(let row=0;row<3;row++)box(g,w,.14,.055,x,y+.1+row*.19,z+side*d/2,'pale');
      for(let row=0;row<3;row++)box(g,.06,.14,d,x+side*w/2,y+.1+row*.19,z,'wood');
      for(const front of [-1,1])box(g,.08,.65,.08,x+side*w/2,y+.28,z+front*d/2,'dark');
    }
    box(g,w,.08,d,x,y,z,'wood');
  };
  const bench=(g:THREE.Group,x:number,z:number,w=2.6,back=true)=>{
    for(let i=0;i<3;i++)box(g,w,.12,.19,x,.6,z+(i-1)*.22,'pale');
    for(const side of [-1,1])box(g,w*.31,.075,.54,x+side*w*.26,.71,z,side<0?'rose':'teal');
    for(const side of [-1,1])for(const front of [-1,1])rod(g,[x+side*(w/2-.3),-.28,z+front*.22],[x+side*(w/2-.34),.55,z+front*.22],.07);
    if(back)for(const side of [-1,1])rod(g,[x+side*(w/2-.25),.35,z-.29],[x+side*(w/2-.25),1.3,z-.36],.06);
    if(back)for(const y of [.95,1.2])box(g,w,.17,.06,x,y,z-.34,'wood');
  };
  const table=(g:THREE.Group,x:number,z:number,w=3,d=1.2)=>{
    for(let i=0;i<5;i++)box(g,w,.11,d/5-.015,x,1.12,z+(i-2)*d/5,'pale');
    for(const side of [-1,1])box(g,.08,.17,d,x+side*w/2,1.12,z,'dark');
    for(const side of [-1,1])for(const front of [-1,1])rod(g,[x+side*(w/2-.2),-.3,z+front*(d/2-.12)],[x+side*(w/2-.3),1.08,z+front*(d/2-.16)],.075);
    box(g,w-.3,.12,.12,x,.4,z,'dark');
  };
  const parcel=(g:THREE.Group,x:number,y:number,z:number,s=.55)=>{
    box(g,s,s*.7,s*.75,x,y+s*.35,z,'cream');
    box(g,s+.015,.035,s*.75+.015,x,y+s*.42,z,'dark');
    box(g,.04,s*.7+.012,s*.75+.02,x,y+s*.35,z,'pale');
    const label=box(g,s*.36,.012,s*.26,x+s*.15,y+s*.7+.012,z,'rose');label.rotation.y=.2;
  };
  const canopy=(g:THREE.Group,w=4.8,d=2.8,tone:Tone='teal')=>{
    for(const x of [-w/2+.2,w/2-.2])for(const z of [-d/2+.2,d/2-.2])rod(g,[x,-.4,z],[x,3.05,z],.075,'wood');
    const geo=new THREE.PlaneGeometry(w,d,20,10).rotateX(-Math.PI/2),p=geo.attributes.position;
    for(let i=0;i<p.count;i++)p.setY(i,3.1+Math.cos(p.getX(i)/w*Math.PI)*.42-Math.pow(p.getZ(i)/d,2)*.35);
    geo.computeVertexNormals();g.add(mesh(geo,tone));
    // Narrow cloth panels follow the same curved roof, so the striping reads
    // from the ground without floating above the shelter.
    for(let stripe=0;stripe<7;stripe++){
      const strip=new THREE.PlaneGeometry(w/14,d,2,10).rotateX(-Math.PI/2),p=strip.attributes.position;
      const centre=(stripe-3)*w/7;
      for(let i=0;i<p.count;i++){
        const x=p.getX(i)+centre;
        p.setXYZ(i,x,3.115+Math.cos(x/w*Math.PI)*.42-Math.pow(p.getZ(i)/d,2)*.35,p.getZ(i));
      }
      strip.computeVertexNormals();g.add(mesh(strip,stripe%2?'cream':'pale'));
    }
    for(let i=0;i<12;i++) {
      const x=(i+.5)/12*w-w/2;
      const hem=mesh(new THREE.SphereGeometry(1,8,6,0,Math.PI*2,0,Math.PI/2),i%2?'cream':tone,x,3.02,-d/2);
      hem.scale.set(w/24,.23,.04);hem.rotation.z=Math.PI;g.add(hem);
    }
    rod(g,[-w/2,3.08,-d/2],[w/2,3.08,-d/2],.04,'pale');
  };

  function batch(root:THREE.Group) {
    root.updateMatrixWorld(true);
    const inverse=root.matrixWorld.clone().invert(),batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),remove:THREE.Mesh[]=[];
    root.traverse(object=>{
      if(!(object instanceof THREE.Mesh)||object instanceof THREE.InstancedMesh||Array.isArray(object.material))return;
      const clone=object.geometry.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld));
      const geometry=clone.index?clone.toNonIndexed():clone;
      if(geometry!==clone)clone.dispose();
      if(!geometry.attributes.normal)geometry.computeVertexNormals();
      if(!geometry.attributes.uv)geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count*2),2));
      const items=batches.get(object.material)??[];items.push(geometry);batches.set(object.material,items);remove.push(object);
    });
    for(const object of remove){object.removeFromParent();object.geometry.dispose();}
    for(const [material,items] of batches){
      const geometry=mergeGeometries(items,false);items.forEach(item=>item.dispose());
      if(geometry){const m=new THREE.Mesh(geometry,material);m.name='batched-crafted-detail';m.castShadow=true;m.receiveShadow=true;root.add(m);}
    }
  }

  function clear(bounds:THREE.Box3) {
    for(let x=bounds.min.x;x<=bounds.max.x+.1;x+=.35)for(let z=bounds.min.z;z<=bounds.max.z+.1;z+=.35)
      if(isPath(x,z,.65)||getTerrainHeight(x,z)<WATER_LEVEL+.15)return false;
    return true;
  }
  function pocket(region:THREE.Group,name:string,x:number,z:number,build:(g:THREE.Group)=>void,solid=true,footprints?:Box2D[]) {
    const g=new THREE.Group();g.name=name;g.position.set(x,getTerrainHeight(x,z),z);build(g);
    g.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(g);
    // Keep authored paths, their entire shoulder, and the river approaches clear.
    if(!clear(bounds)){g.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});return;}
    g.userData.solid=solid;
    if(solid) {
      if(footprints)colliders.push(...footprints.map(b=>({minX:x+b.minX,maxX:x+b.maxX,minZ:z+b.minZ,maxZ:z+b.maxZ})));
      else colliders.push({minX:bounds.min.x,maxX:bounds.max.x,minZ:bounds.min.z,maxZ:bounds.max.z});
    }
    batch(g);region.add(g);
  }
  function plants(region:THREE.Group,cx:number,cz:number,rx:number,rz:number,seed:number,fern=false) {
    const rng=seededRandom(seed),positions:THREE.Vector3[]=[];
    for(let i=0;i<(fern?60:72);i++) {
      const a=rng()*Math.PI*2,r=Math.sqrt(rng()),x=cx+Math.cos(a)*r*rx,z=cz+Math.sin(a)*r*rz;
      if(!isPath(x,z,1.1)&&getTerrainHeight(x,z)>WATER_LEVEL+.3)positions.push(new THREE.Vector3(x,getTerrainHeight(x,z),z));
    }
    const root=new THREE.Group();root.name=fern?'layered-fern-colony':'cultivated-flower-border';
    const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.018,.025,.45,4).translate(0,.225,0),mat.leaf,positions.length);
    const frond=new THREE.BufferGeometry(),leafVertices:number[]=[],leafFaces:number[]=[];
    const frondY=(t:number)=>.12+.52*Math.sin(Math.PI*t)-.16*t;
    const addUpperFace=(a:number,b:number,c:number)=>{
      const ax=leafVertices[a*3],az=leafVertices[a*3+2];
      const bx=leafVertices[b*3],bz=leafVertices[b*3+2];
      const cx=leafVertices[c*3],cz=leafVertices[c*3+2];
      if((bz-az)*(cx-ax)-(bx-ax)*(cz-az)>0)leafFaces.push(a,b,c);
      else leafFaces.push(a,c,b);
    };
    // Curved, narrow rachis; ten pairs of separate lanceolate pinnae leave
    // visible gaps instead of reading as a broad folded leaf at eye level.
    for(let k=0;k<=5;k++){
      const t=k/5,z=.82*t,y=frondY(t),width=.012*(1-.6*t);
      leafVertices.push(-width,y,z,width,y,z);
    }
    for(let k=0;k<5;k++){const i=k*2;addUpperFace(i,i+2,i+1);addUpperFace(i+1,i+2,i+3);}
    for(let k=0;k<10;k++){
      const t=.1+k*.08,z=.82*t,y=frondY(t);
      const length=(.06+.2*Math.sin(Math.PI*(k+1)/11))*(1-.23*t);
      for(const side of [-1,1]){
        const start=leafVertices.length/3;
        leafVertices.push(
          side*.012,y,z,
          side*length*.52,y+.015,z-.014,
          side*length,y+.025,z+.025,
          side*length*.48,y+.014,z+.036
        );
        addUpperFace(start,start+1,start+3);
        addUpperFace(start+1,start+2,start+3);
      }
    }
    frond.setAttribute('position',new THREE.Float32BufferAttribute(leafVertices,3));
    frond.setIndex(leafFaces);frond.computeVertexNormals();
    const flowers=new THREE.InstancedMesh(fern?frond:blossomGeometry(),fern?mat.moss:mat.cream,positions.length* (fern?5:1));
    flowers.name=fern?'arched-fern-fronds':'flower-heads';
    if(!fern)frond.dispose();
    const dummy=new THREE.Object3D(),color=new THREE.Color();let planted=0;
    positions.forEach((p,i)=>{
      const s=.7+rng()*.7;dummy.position.copy(p);dummy.rotation.set(0,rng()*6.28,0);dummy.scale.setScalar(s);dummy.updateMatrix();
      if(Math.hypot(p.x-GARDEN_BASIN.x,p.z-GARDEN_BASIN.z)<GARDEN_BASIN.radius+1)return;
      stems.setMatrixAt(planted,dummy.matrix);
      for(let k=0;k<(fern?5:1);k++) {
        const a=k*2.4+i;
        dummy.position.copy(p).add(new THREE.Vector3(fern?Math.sin(a)*.25:0,fern?.2:.46*s,fern?Math.cos(a)*.25:0));
        dummy.rotation.set(fern?-.4:.2,a,0);dummy.updateMatrix();flowers.setMatrixAt(planted*(fern?5:1)+k,dummy.matrix);
        if(!fern)flowers.setColorAt(planted,color.setHex([0xe9c88b,0xc494ba,0xbd7273,0xd7d0b3][i%4]));
      }
      planted++;
    });
    stems.count=planted;flowers.count=planted*(fern?5:1);
    stems.castShadow=true;flowers.castShadow=true;root.add(stems,flowers);region.add(root);
  }
  const region=(name:string)=>{const r=new THREE.Group();r.name=`enrichment:${name}`;group.add(r);return r;};

  const entry=region('entry');
  pocket(entry,'entry-travel-court',-11,58,g=>{
    canopy(g,4.8,2.6,'cream');bench(g,0,.65,3.3);parcel(g,-1.4,.7,.5,.65);parcel(g,1.6,0,-.3,.8);
    box(g,1.6,1.15,.1,0,2.05,-1,'dark');
    for(let i=0;i<4;i++)box(g,1.2,.08,.02,0,2.4-i*.22,-.93,'cream');
    for(const side of [-1,1]){
      const seal=mesh(new THREE.CylinderGeometry(.19,.19,.025,12),'brass',side*.52,2.05,-.92);
      seal.rotation.x=Math.PI/2;g.add(seal);
      box(g,.7,.045,.04,side*.52,1.68,-.9,'pale');
    }
    pot(g,-2,0,.7,.4);rod(g,[-2,.5,.7],[-2,1.2,.7],.025,'leaf');g.add(mesh(blossomGeometry(),'rose',-2,1.25,.7));
  });
  for(const [x,z] of [[8,52],[9,62],[9,69]])pocket(entry,'flower-colonnade',x,z,g=>{
    for(const sx of [-1,1])rod(g,[sx*.8,-.25,0],[sx*.8,3.1,0],.11,'wood');
    tube(g,[[-.8,2.8,0],[-.6,3.5,0],[.6,3.5,0],[.8,2.8,0]],.1,'pale');
    for(let i=0;i<9;i++){const a=i*.9;tube(g,[[Math.cos(a)*.14-.8,i*.32,Math.sin(a)*.14],[Math.cos(a+.8)*.14-.8,i*.32+.3,Math.sin(a+.8)*.14]],.025,'leaf');g.add(mesh(blossomGeometry(),i%2?'rose':'cream',-.8+Math.cos(a)*.16,i*.32+.25,.12));}
  });
  plants(entry,-10,66,4,3,611);

  const forest=region('mushroom-forest');
  pocket(forest,'forest-fallen-log',-55,-24,g=>{
    const log=mesh(new THREE.CylinderGeometry(.56,.72,5.4,16,5),'dark',0,.45,0);log.rotation.z=Math.PI/2;g.add(log);
    for(const side of [-1,1]){const end=mesh(new THREE.CircleGeometry(.54,24),'pale',side*2.71,.45,0);end.rotation.y=side*Math.PI/2;g.add(end);
      for(const r of [.16,.31,.45]){const ring=mesh(new THREE.TorusGeometry(r,.013,4,24),'wood',side*2.72,.45,0);ring.rotation.y=Math.PI/2;g.add(ring);}}
    for(let i=0;i<8;i++){const x=-2+i*.53;sphere(g,x,.96,.1,.45,.11,.36,'moss');}
    for(let i=0;i<11;i++){
      const x=-2.35+i*.47;
      tube(g,[[x,.48,-.68],[x+.12,.65,-.61],[x+.22,.8,-.48]],.035,i%3?'wood':'pale');
    }
    for(let i=0;i<4;i++){
      const bracket=mesh(new THREE.SphereGeometry(.32,12,6,0,Math.PI,0,Math.PI/2),'cream',-1.55+i*.95,.62,-.6);
      bracket.scale.set(1,.24,.7);bracket.rotation.y=.25;g.add(bracket);
    }
    for(let i=0;i<5;i++){
      const x=-1.9+i*.82;rod(g,[x,.65,-.4],[x,1.18,-.52],.045,'cream');
      const cap=mesh(new THREE.SphereGeometry(.3,16,8,0,Math.PI*2,0,Math.PI/2),'rose',x,1.18,-.52);g.add(cap);
      for(let j=0;j<4;j++)sphere(g,x+Math.cos(j*1.7)*.14,1.34+Math.sin(j)*.025,-.52+Math.sin(j*1.7)*.14,.035,.012,.035,'cream');
      for(let j=0;j<12;j++){const a=j*Math.PI/6;rod(g,[x,1.18,-.52],[x+Math.cos(a)*.27,1.18,-.52+Math.sin(a)*.27],.009,'cream');}
    }
  });
  pocket(forest,'forager-sorting-nook',-38,-27,g=>{
    bench(g,0,0,2.5,false);crate(g,-.6,.7,0);pot(g,1.1,0,.4,.45);
    for(let i=0;i<7;i++)sphere(g,-.9+(i%3)*.28,1.32,-.2+Math.floor(i/3)*.2,.16,.09,.16,'clay');
    rod(g,[-1.4,0,.7],[-1.1,2.3,.7],.055);tube(g,[[-1.1,2.3,.7],[-.8,2.4,.7],[-.7,2.15,.7]],.035);
  });
  for(const [x,z,s] of [[-61,-22,43],[-48,-33,44],[-36,-18,45],[-58,-5,46]])plants(forest,x,z,3.8,2.8,s,true);

  const festival=region('festival');
  // These authored plaza footprints sit beside the bandstand. The broad plaza
  // is intentionally walkable, so the generic path-excluding pocket helper
  // would discard them; keep the centre ramp and northbound aisle open.
  const plazaFeature=(name:string,x:number,z:number,footprint:Box2D,build:(g:THREE.Group)=>void)=>{
    const g=new THREE.Group();g.name=name;g.position.set(x,getTerrainHeight(x,z),z);
    build(g);batch(g);festival.add(g);g.userData.solid=true;
    colliders.push({minX:x+footprint.minX,maxX:x+footprint.maxX,minZ:z+footprint.minZ,maxZ:z+footprint.maxZ});
  };
  for(const side of [-1,1]){
    plazaFeature('festival-stage-flower-box',side*8.2,-2,{minX:-1.45,maxX:1.45,minZ:-.55,maxZ:.55},g=>{
      box(g,2.8,.55,.9,0,.27,0,'wood');
      for(const x of [-1.22,1.22])box(g,.09,.63,.96,x,.3,0,'dark');
      for(let i=0;i<13;i++){
        const x=-1.2+(i%7)*.4,z=i<7?-.25:.2;
        rod(g,[x,.48,z],[x,.88+(i%3)*.13,z],.025,'leaf');
        sphere(g,x,.92+(i%3)*.13,z,.16,.13,.15,i%3?'rose':'cream');
      }
    });
    plazaFeature('festival-instrument-case',side*8.2,.3,{minX:-.62,maxX:.62,minZ:-.5,maxZ:.5},g=>{
      box(g,1.12,.28,.72,0,.18,0,'dark');
      box(g,1.05,.08,.65,0,.36,0,'wood');
      for(const x of [-.38,.38])box(g,.055,.34,.76,x,.22,0,'brass');
      const handle=mesh(new THREE.TorusGeometry(.19,.032,6,14,Math.PI),'brass',0,.47,.03);
      g.add(handle);
    });
  }
  for(const side of [-1,1])plazaFeature('festival-audience-court',side*7.7,10.5,
    {minX:-1.75,maxX:1.75,minZ:-2.55,maxZ:4},g=>{
      for(const z of [0,3.35]){
        const seat=new THREE.Group();seat.name='audience-facing-seat';seat.position.z=z;seat.rotation.y=Math.PI;
        bench(seat,0,0,2.8);g.add(seat);
      }
      table(g,0,-1.85,2.7,.9);
      for(const x of [-.65,.65]){
        g.add(mesh(new THREE.CylinderGeometry(.12,.1,.17,12),'cream',x,1.3,-1.85));
        sphere(g,x,1.4,-1.85,.07,.035,.07,'berry');
      }
    });
  pocket(festival,'festival-backstage',-13,-18,g=>{
    canopy(g,4.6,2.8,'rose');table(g,0,.4,3.7);
    for(let i=0;i<3;i++){
      const x=-1.3+i*1.2;
      sphere(g,x,1.56,.2,.29,.42,.12,'wood');sphere(g,x,1.82,.2,.23,.26,.1,'wood');
      for(const side of [-1,1])sphere(g,x+side*.1,1.58,.307,.03,.11,.012,'dark');
      rod(g,[x,1.73,.2],[x,2.65,.2],.036);box(g,.12,.23,.09,x,2.67,.2,'dark');
      for(let j=0;j<3;j++)rod(g,[x+(j-1)*.022,1.4,.33],[x+(j-1)*.022,2.55,.25],.006,'cream');
    }
    crate(g,-1.4,0,-.7);parcel(g,1.5,0,-.7,.65);
    for(let i=0;i<7;i++){
      const flag=mesh(new THREE.ConeGeometry(.14,.42,3),'cream',-1.8+i*.6,2.83,-1.35);
      flag.rotation.z=Math.PI;g.add(flag);
    }
  });
  pocket(festival,'festival-banquet',-17,1,g=>{
    table(g,0,0,4,1.5);bench(g,0,-1.15,3.8,false);bench(g,0,1.15,3.8,false);
    for(const x of [-1.35,0,1.35])for(const z of [-.44,.44]){
      g.add(mesh(new THREE.CylinderGeometry(.23,.2,.045,18),'cream',x,1.21,z));
      sphere(g,x,1.32,z,.17,.11,.13,'pale');pot(g,x+.31,1.2,z,.1);
    }
    for(let i=0;i<6;i++)sphere(g,-.5+i*.2,1.4,0,.13,.16,.13,i%2?'berry':'violet');
  });
  for(const [x,z] of [[-11,20],[11,19],[17,15]])pocket(festival,'audience-garden-bench',x,z,g=>{bench(g,0,0,3);pot(g,1.9,0,0,.3);});
  plants(festival,-18,19,3.5,3,101);

  const market=region('market');
  pocket(market,'market-produce-stall',-110,-8,g=>{
    canopy(g,5.1,2.9,'teal');table(g,0,-.3,4.6,1.4);
    for(let i=0;i<3;i++){
      crate(g,-1.5+i*1.5,1.2,-.3,1.2,.85);
      for(let k=0;k<12;k++)sphere(g,-1.85+i*1.5+(k%4)*.23,1.78+Math.floor(k/8)*.12,-.54+Math.floor(k/4)%2*.28,.15,.16,.15,i===0?'berry':i===1?'moss':'pale');
      if(i===1)for(let k=0;k<7;k++){
        const x=-.95+(k%4)*.22,z=-.56+Math.floor(k/4)*.28;
        sphere(g,x,1.99,z,.16,.045,.1,'leaf');
      }
      if(i===2)for(let k=0;k<7;k++){
        const root=mesh(new THREE.ConeGeometry(.095,.35,7),'clay',.5+(k%4)*.2,1.96,-.55+Math.floor(k/4)*.28);
        root.rotation.z=Math.PI;g.add(root);
      }
    }
    crate(g,-1.65,0,1);crate(g,-1.65,.66,1);pot(g,1.7,0,1,.45);
  });
  pocket(market,'market-bakery-courtyard',-101,-1,g=>{
    canopy(g,4.8,2.8,'rose');table(g,0,0,3.9);
    for(let i=0;i<8;i++){
      const x=-1.45+i%4*.85,z=-.3+Math.floor(i/4)*.55;
      sphere(g,x,1.35,z,.32,.17,.2,'pale');
      for(let j=0;j<3;j++){const slash=box(g,.035,.018,.22,x+(j-1)*.12,1.5,z,'cream');slash.rotation.y=.4;}
    }
    crate(g,-1.3,0,.7);parcel(g,1.4,0,.7,.8);
  });
  pocket(market,'market-potter-workbench',-123,7,g=>{
    table(g,0,0,3.5);for(let i=0;i<5;i++)pot(g,-1.3+i*.65,1.2,0,.2+(i%2)*.08);
    for(const x of [-1.1,1.1])pot(g,x,0,.9,.42);
    box(g,3.2,1.3,.12,0,1.95,-.9,'dark');
    for(const y of [1.45,2.05,2.65])box(g,3.3,.1,.6,0,y,-.75,'pale');
    for(let i=0;i<8;i++)pot(g,-1.2+(i%4)*.8,1.51+Math.floor(i/4)*.6,-.7,.19);
  });
  plants(market,-119,14,3,4,331);

  const village=region('village');
  pocket(village,'village-wash-garden',114,-55,g=>{
    for(const x of [-2.3,2.3])rod(g,[x,-.3,0],[x,2.7,0],.09,'wood');
    tube(g,[[-2.3,2.6,0],[0,2.34,0],[2.3,2.6,0]],.02);
    for(let i=0;i<5;i++){
      const cloth=new THREE.PlaneGeometry(.55,.8,6,8),p=cloth.attributes.position;
      for(let k=0;k<p.count;k++)p.setZ(k,Math.sin(p.getX(k)*14+p.getY(k)*3)*.08);
      cloth.computeVertexNormals();g.add(mesh(cloth,i%2?'cream':'teal',-1.7+i*.8,1.95,0));
      for(const side of [-1,1])box(g,.54,.045,.018,-1.7+i*.8,1.95+side*.25,.045,i%2?'rose':'cream');
      box(g,.035,.1,.05,-1.85+i*.8,2.38,0,'wood');
    }
    const tub=mesh(new THREE.CylinderGeometry(.7,.55,.7,16,1,true),'wood',-1.6,.35,.8);g.add(tub);
    for(const y of [.12,.58]){const hoop=mesh(new THREE.TorusGeometry(.58+y*.16,.025,4,20),'dark',-1.6,y,.8);hoop.rotation.x=Math.PI/2;g.add(hoop);}
    crate(g,1.3,0,.8);pot(g,1.3,.6,.8,.3);
  });
  pocket(village,'village-shared-kitchen',94,-38,g=>{
    table(g,0,0,4,1.3);for(const x of [-1.2,0,1.2])pot(g,x,1.2,0,.25);
    bench(g,0,1.2,3.3);crate(g,-1.4,0,-.9);
    rod(g,[-2,-.3,-.7],[-2,2.6,-.7],.09);rod(g,[2,-.3,-.7],[2,2.6,-.7],.09);
    rod(g,[-2,2.6,-.7],[2,2.6,-.7],.07);
    for(let i=0;i<5;i++)sphere(g,-1.5+i*.75,2.25,-.7,.16,.3,.12,'moss');
  });
  pocket(village,'village-kitchen-planters',111,-64,g=>{
    for(const x of [-1.5,0,1.5]){crate(g,x,0,0,1.1,1.5);for(let i=0;i<5;i++)sphere(g,x+(i%2-.5)*.3,.65,i*.22-.5,.28,.24,.32,'leaf');}
  });
  plants(village,121,-51,3,5,224);plants(village,96,-61,3,3,225);

  const station=region('station');
  pocket(station,'station-mail-workspace',-12,-51,g=>{
    canopy(g,5,3,'teal');table(g,0,.5,4);
    for(const x of [-1.6,-.8,0,.8,1.6])box(g,.07,1.6,.8,x,2,-.6,'wood');
    for(const y of [1.2,1.7,2.2,2.7])box(g,3.3,.075,.8,0,y,-.6,'pale');
    for(let i=0;i<12;i++){
      const x=-1.2+i%4*.8,y=1.28+Math.floor(i/4)*.5;
      parcel(g,x,y,-.5,.35);
      if(i%3===0){const stamp=mesh(new THREE.CircleGeometry(.075,10),'rose',x+.05,y+.25,-.36);g.add(stamp);}
    }
    for(let i=0;i<5;i++){const letter=box(g,.45,.025,.3,-1+i*.4,1.23+i*.02,.6,'cream');letter.rotation.y=i*.4;}
    sphere(g,1.45,.55,1,.43,.6,.33,'rose');tube(g,[[1.2,1.06,1],[1.45,1.16,1],[1.7,1.06,1]],.035);
  });
  pocket(station,'station-baggage-cart',8,-43,g=>{
    // Lean the complete cart along the local ground plane, then seat each actual
    // tire on the slightly curved terrain instead of grounding only its centre.
    const x=g.position.x,z=g.position.z;
    const slopeX=(getTerrainHeight(x+.85,z)-getTerrainHeight(x-.85,z))/1.7;
    const slopeZ=(getTerrainHeight(x,z+.8)-getTerrainHeight(x,z-.8))/1.6;
    g.quaternion.setFromUnitVectors(up,new THREE.Vector3(-slopeX,1,-slopeZ).normalize());
    g.updateMatrixWorld(true);
    const rimGeometry=new THREE.TorusGeometry(.4,.085,6,20);
    const rims=new THREE.InstancedMesh(rimGeometry,mat.dark,4);rims.name='cart-wheel-rims';rims.castShadow=true;rims.receiveShadow=true;
    const vertices=rimGeometry.attributes.position,wheelCenters:THREE.Vector3[]=[];
    const worldUp=new THREE.Vector3(0,1,0).applyQuaternion(g.quaternion),point=new THREE.Vector3();
    let wheelIndex=0;
    box(g,2.5,.14,1.4,0,.65,0,'pale');
    for(const x of [-.85,.85])for(const z of [-.8,.8]){
      const center=new THREE.Vector3(x,.4,z);
      for(let pass=0;pass<5;pass++) {
        let clearance=Infinity;
        for(let i=0;i<vertices.count;i++) {
          point.fromBufferAttribute(vertices,i).add(center).applyMatrix4(g.matrixWorld);
          clearance=Math.min(clearance,point.y-getTerrainHeight(point.x,point.z));
        }
        center.y-=clearance/worldUp.y;
      }
      rims.setMatrixAt(wheelIndex++,new THREE.Matrix4().makeTranslation(center.x,center.y,center.z));wheelCenters.push(center);
      for(let i=0;i<5;i++){const a=i*Math.PI/5;rod(g,[x+Math.sin(a)*.36,center.y+Math.cos(a)*.36,z],[x-Math.sin(a)*.36,center.y-Math.cos(a)*.36,z],.024,'pale');}
    }
    g.add(rims);
    for(let i=0;i<4;i+=2)rod(g,wheelCenters[i].toArray(),wheelCenters[i+1].toArray(),.055);
    for(let i=0;i<4;i++)parcel(g,-.7+(i%2)*1.15,.73+Math.floor(i/2)*.55,0,.8);
    rod(g,[1.2,.7,-.6],[2.3,1.1,-.6],.055);rod(g,[1.2,.7,.6],[2.3,1.1,.6],.055);
  });
  pocket(station,'station-waiting-bench',-13,-39,g=>{bench(g,0,0,3.6);parcel(g,1.1,.7,0,.7);pot(g,-2.2,0,0,.3);});
  plants(station,-16,-44,2.2,3.3,775);

  const stream=region('stream');
  pocket(stream,'stream-boat-workshop',65,19,g=>{
    // Dry-docked hull: ribs and open interior, visibly supported on trestles.
    for(const x of [-1.4,1.4]){rod(g,[x,-.3,-.8],[x,.8,.5],.1);rod(g,[x,-.3,.8],[x,.8,-.5],.1);}
    for(let i=0;i<9;i++){
      const x=-2.5+i*.625,w=.9*Math.sqrt(Math.max(.05,1-(x/2.8)**2));
      tube(g,[[x,1.5,-w],[x,.72,-w*.65],[x,.62,0],[x,.72,w*.65],[x,1.5,w]],.055,'pale');
    }
    for(const side of [-1,1])for(let row=0;row<4;row++){
      const y=.76+row*.22;
      tube(g,Array.from({length:13},(_,i)=>{const x=-2.65+i*5.3/12;return [x,y+Math.abs(x)*.09,side*(.3+row*.2)*Math.sqrt(Math.max(.03,1-(x/2.8)**2))];}),.09,'wood');
    }
    for(const side of [-1,1])tube(g,Array.from({length:15},(_,i)=>{
      const x=-2.65+i*5.3/14;
      return [x,1.57+Math.abs(x)*.09,side*.94*Math.sqrt(Math.max(.03,1-(x/2.8)**2))];
    }),.035,'dark');
    table(g,0,2,4.5,.75);for(let i=0;i<4;i++){rod(g,[-1.6+i,1.2,1.8],[-1.35+i,1.3,2.3],.035);box(g,.3,.07,.16,-1.35+i,1.3,2.3,'dark');}
    for(const x of [-2.7,2.7])rod(g,[x,-.25,-.5],[x,2.5,-.5],.09);
  });
  pocket(stream,'stream-mooring-workyard',62,30,g=>{
    for(const x of [-1.2,1.2])rod(g,[x,-.3,0],[x,1.25,0],.13,'wood');
    for(let i=0;i<7;i++){const coil=mesh(new THREE.TorusGeometry(.3+i*.035,.025,5,24),'pale',-.8,.16+i*.04,.55);coil.rotation.x=Math.PI/2;g.add(coil);}
    for(let i=0;i<5;i++)rod(g,[.75+i*.09,.67,.58],[.75+i*.09,.98,.58],.018,'moss');
    crate(g,.85,0,.65);rod(g,[-1.5,.8,-.5],[1.5,1.15,-.5],.045);box(g,.65,.12,.26,1.3,1.13,-.5,'pale');
  });
  // Individual dry bank boards follow the terrain; they are decorative workyard
  // edging, not a horizontal pier extending across the colliding water surface.
  pocket(stream,'stream-dry-bank-timber',38,26,g=>{
    for(let i=0;i<9;i++){const plank=box(g,.22,.13,2.5,-1+i*.25,.06,0,i%3?'wood':'dark');plank.rotation.y=.04*Math.sin(i);}
    crate(g,.5,.15,0,.75,.7);pot(g,-.6,.15,.5,.3);
  });
  plants(stream,62,11,2.6,3.3,447,true);

  const garden=region('garden');
  pocket(garden,'garden-pergola',-39,106,g=>{
    for(const x of [-2.4,2.4])for(const z of [-1.5,1.5])rod(g,[x,-.4,z],[x,3.4,z],.11,'wood');
    for(let i=0;i<8;i++)box(g,.12,.17,3.8,-2.7+i*.77,3.45,0,'pale');
    for(const x of [-1.6,0,1.6]){
      const shade=mesh(new THREE.PlaneGeometry(.52,2.7,4,10).rotateX(-Math.PI/2),'cream',x,3.55,0);
      const p=shade.geometry.attributes.position;
      for(let i=0;i<p.count;i++)p.setY(i,Math.sin(p.getZ(i)*3)*.045);
      shade.geometry.computeVertexNormals();g.add(shade);
    }
    for(const z of [-1.5,1.5])box(g,5.6,.2,.16,0,3.25,z,'wood');
    bench(g,0,-.9,3.8);pot(g,-1.9,0,1,.4);pot(g,1.9,0,1,.4);
    for(let i=0;i<18;i++){
      const x=-2.6+i*.3,z=Math.sin(i*.8)*1.5;
      sphere(g,x,3.52,z,.4,.13,.46,'leaf');g.add(mesh(blossomGeometry(),i%3?'violet':'cream',x,3.64,z));
      if(i%3===0)tube(g,[[x,3.5,z],[x+.15,3.1,z],[x+.1,2.7,z]],.025,'leaf');
    }
  },true,[
    ...[-2.4,2.4].flatMap(x=>[-1.5,1.5].map(z=>({minX:x-.14,maxX:x+.14,minZ:z-.14,maxZ:z+.14}))),
    {minX:-1.9,maxX:1.9,minZ:-1.3,maxZ:-.55},
    ...[-1.9,1.9].map(x=>({minX:x-.44,maxX:x+.44,minZ:.56,maxZ:1.44})),
  ]);
  pocket(garden,'garden-reflecting-basin',GARDEN_BASIN.x,GARDEN_BASIN.z,g=>{
    const basin=mesh(new THREE.CylinderGeometry(GARDEN_BASIN.radius,GARDEN_BASIN.radius-.3,.38,40,1,true),'clay',0,.19,0);g.add(basin);
    const rim=mesh(new THREE.TorusGeometry(GARDEN_BASIN.radius,.1,8,48),'pale',0,.37,0);rim.rotation.x=Math.PI/2;g.add(rim);
    const waterMaterial=new THREE.MeshStandardMaterial({color:0x779b8a,metalness:.25,roughness:.2,transparent:true,opacity:.86});
    const water=new THREE.Mesh(new THREE.CircleGeometry(GARDEN_BASIN.radius-.08,48),waterMaterial);water.rotation.x=-Math.PI/2;water.position.y=.3;g.add(water);
    for(let i=0;i<6;i++){const a=i*2.4;const pad=mesh(new THREE.CircleGeometry(.29,14),'leaf',Math.cos(a)*1.4,.32,Math.sin(a)*1.4);pad.rotation.x=-Math.PI/2;g.add(pad);}
    // Raised, shallow contained water avoids inventing a submerged walking plane.
    animations.push(time=>{waterMaterial.roughness=.22+Math.sin(time*.8)*.035;});
  });
  pocket(garden,'garden-reading-corner',-25,84,g=>{
    bench(g,0,0,3.2);table(g,0,1.1,1.2,.7);
    for(const side of [-1,1]){
      const page=box(g,.31,.015,.42,side*.16,1.19,1.1,'cream');page.rotation.z=side*.09;
      box(g,.025,.018,.4,side*.32,1.2,1.1,'dark');
    }
    pot(g,-1.9,0,0,.35);
    for(let i=0;i<4;i++){
      const x=-1.9+Math.cos(i*1.6)*.17,z=Math.sin(i*1.6)*.17;
      rod(g,[-1.9,.44,0],[x,.86,z],.018,'leaf');
      g.add(mesh(blossomGeometry(),i%2?'violet':'rose',x,.9,z));
    }
  });
  plants(garden,-36,113,4,3,229);plants(garden,-17,107,3,2,230);plants(garden,-43,100,3,3,231);
  return { group, colliders, animations };
}
