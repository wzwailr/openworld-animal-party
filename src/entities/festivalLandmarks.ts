import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { getBridgeHeight, getTerrainHeight, getWalkHeight, getRampHeight, stageFront, seededRandom } from '../world/landscape';
import type { Box2D } from '../core/types';
import { createLeafCluster, createLeafTexture } from './foliage';

const palette = new Map<number, THREE.MeshStandardMaterial>();
let timberTexture: THREE.DataTexture | undefined;
export function woodGrain(): THREE.DataTexture {
  if (timberTexture) return timberTexture;
  const pixels = new Uint8Array(128 * 128 * 4);
  const rng = seededRandom(614);
  for (let y=0;y<128;y++) for(let x=0;x<128;x++) {
    const grain=Math.sin(x*.72+Math.sin(y*.042)*2.2+Math.sin(x*.17)*1.7);
    const c=Math.round(215 + grain*16 + rng()*17);
    const index=(y*128+x)*4;pixels[index]=pixels[index+1]=pixels[index+2]=c;pixels[index+3]=255;
  }
  timberTexture=new THREE.DataTexture(pixels,128,128,THREE.RGBAFormat);
  timberTexture.colorSpace=THREE.SRGBColorSpace;
  timberTexture.wrapS=timberTexture.wrapT=THREE.RepeatWrapping;
  timberTexture.magFilter=THREE.LinearFilter;timberTexture.minFilter=THREE.LinearMipmapLinearFilter;
  timberTexture.generateMipmaps=true;timberTexture.needsUpdate=true;
  return timberTexture;
}
function material(color: number) {
  if (!palette.has(color)) {
    const timber=[0xb39662,0xb29564,0x746345,0x827250,0x807a5b,0x827458,0x8d7957,0x6c6747,0x8c7957,0x786749].includes(color);
    palette.set(color,new THREE.MeshStandardMaterial({color,roughness:0.9,map:timber?woodGrain():null}));
  }
  return palette.get(color)!;
}
function mesh(g: THREE.BufferGeometry, color: number, x=0, y=0, z=0) {
  const m = new THREE.Mesh(g,material(color));
  m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;return m;
}
function tube(points: THREE.Vector3[], radius: number, color: number) {
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),64,radius,6,false),color);
}

export function blossomGeometry(): THREE.BufferGeometry {
  const petals: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 5; i++) {
    const angle = i * Math.PI * 0.4;
    const petal = new THREE.SphereGeometry(1, 8, 5);
    petal.scale(0.1, 0.035, 0.17);
    petal.rotateX(-0.18); petal.translate(0, 0.025, 0.13); petal.rotateY(angle);
    petals.push(petal);
  }
  const geometry = mergeGeometries(petals); petals.forEach(petal => petal.dispose());
  return geometry;
}

/** Original timber bandstand, not a generated or imported Zelda asset. */
export function createBandstand(): THREE.Group {
  const stage = new THREE.Group();stage.name='celebration-bandstand';
  const stone = mesh(new THREE.CylinderGeometry(6.65,6.85,0.65,64),0x909881,0,0.78,-2);
  stone.scale.z=0.65;stage.add(stone);
  const boards: THREE.BufferGeometry[]=[];
  for(let i=0;i<31;i++) {
    const x=-6.4+i*0.426;
    const length=Math.sqrt(Math.max(0,6.6**2-x*x))*1.3;
    boards.push(new THREE.BoxGeometry(0.41,0.18,length).translate(x,1.26,-2));
  }
  stage.add(mesh(mergeGeometries(boards),0xb39662));boards.forEach(g=>g.dispose());
  // Front timber ramp joins the exact walking surface.
  const rampGeometry = new THREE.PlaneGeometry(3.6, 1, 12, 16);
  const rp = rampGeometry.attributes.position;
  for (let i=0;i<rp.count;i++) {
    const x=rp.getX(i),t=rp.getY(i)+.5,start=stageFront(x),z=start+(6.8-start)*t;
    rp.setXYZ(i,x,getRampHeight(x,z)+.005,z);
  }
  rampGeometry.computeVertexNormals();
  const ramp=mesh(rampGeometry,0xb39662);ramp.material=material(0xb39662);(ramp.material as THREE.MeshStandardMaterial).side=THREE.DoubleSide;stage.add(ramp);
  const apron = new THREE.PlaneGeometry(22, 18, 220, 180).rotateX(-Math.PI/2).translate(0,0,-2);
  const ap=apron.attributes.position, apronColors:number[]=[], tint=new THREE.Color();
  for(let i=0;i<ap.count;i++) {
    const x=ap.getX(i),z=ap.getZ(i),y=getWalkHeight(x,z);
    ap.setY(i,y+.004);
    tint.setHex(0xa29d79).lerp(new THREE.Color(0x798449),Math.max(0,1-(y-getTerrainHeight(x,z))/.35));
    tint.multiplyScalar(.96+.04*Math.sin(x*3.1+z*2.7));apronColors.push(tint.r,tint.g,tint.b);
  }
  const apronFaces:number[]=[];
  const ai=apron.index!;
  for(let i=0;i<ai.count;i+=3) {
    const ids=[ai.getX(i),ai.getX(i+1),ai.getX(i+2)];
    const needed=ids.some(j=>{
      const x=ap.getX(j),z=ap.getZ(j);
      return Math.hypot(x,(z+2)/.65)>6.59 && !(Math.abs(x)<=1.8 && z>=stageFront(x) && z<=6.8)
        && getWalkHeight(x,z)>getTerrainHeight(x,z)+.002;
    });
    if(needed)apronFaces.push(...ids);
  }
  apron.setIndex(apronFaces);apron.setAttribute('color',new THREE.Float32BufferAttribute(apronColors,3));apron.computeVertexNormals();
  const apronMesh=new THREE.Mesh(apron,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));
  apronMesh.name='walkable-stage-apron';apronMesh.receiveShadow=true;stage.add(apronMesh);
  for(const side of [-1,1]) {
    stage.add(mesh(new THREE.CylinderGeometry(0.19,0.3,6,10),0x746345,side*5.7,3.55,-3.6));
    const arch: THREE.Vector3[]=[];
    for(let i=0;i<=24;i++) {
      const t=i/24, x=(t-0.5)*11.4;
      arch.push(new THREE.Vector3(x,6.3+Math.sin(t*Math.PI)*1.8,-3.6+side*0.15));
    }
    stage.add(tube(arch,0.11,0x827250));
  }
  // Soft cloth banners leave the conductor silhouette unobscured.
  for(const side of [-1,1]) {
    const cloth=mesh(new THREE.PlaneGeometry(1.15,3.3,3,12),0x3c7e7d,side*5.15,4.5,-3.7);
    cloth.material=new THREE.MeshStandardMaterial({color:0x3c7e7d,roughness:1,side:THREE.DoubleSide});
    const p=cloth.geometry.attributes.position;
    for(let i=0;i<p.count;i++)p.setZ(i,Math.sin(p.getY(i)*3)*0.12);
    cloth.geometry.computeVertexNormals();stage.add(cloth);
    const medallion=mesh(new THREE.TorusGeometry(0.28,0.024,6,28),0xe4c77f,side*5.15,4.8,-3.48);stage.add(medallion);
  }
  const backVine:THREE.Vector3[]=[];
  for(let i=0;i<35;i++){
    const a=Math.PI*i/34;
    backVine.push(new THREE.Vector3(Math.cos(a)*6.8,1.5,-2-Math.sin(a)*4.4));
  }
  stage.add(tube(backVine,0.13,0x587d45));
  for(let i=0;i<19;i++){
    const t=i/18,x=(t-.5)*11.4,y=6.3+Math.sin(t*Math.PI)*1.8;
    const leaf=createLeafCluster(.55,0x718e48,80+i);leaf.position.set(x,y,-3.6);stage.add(leaf);
    if(i%2===0)stage.add(mesh(blossomGeometry(),0xe4d9b0,x,y-.16,-3.2));
  }
  const footings: THREE.BufferGeometry[]=[];
  for(let i=0;i<44;i++) {
    const a=i/44*Math.PI*2, block=new THREE.BoxGeometry(.85,.28,.28);
    block.rotateY(-a-Math.PI/2);block.translate(Math.cos(a)*6.62,.83,-2+Math.sin(a)*4.33);footings.push(block);
  }
  const masonry=mesh(mergeGeometries(footings),0x939986);masonry.name='bandstand-stone-footings';stage.add(masonry);footings.forEach(g=>g.dispose());
  // Only visible structural posts block movement; there are no perimeter air walls.
  stage.userData.colliders=[-1,1].map(side=>({minX:side*5.7-.3,maxX:side*5.7+.3,minZ:-3.9,maxZ:-3.3})) satisfies Box2D[];
  return stage;
}

export function createCelebrationCake(): THREE.Group {
  const group=new THREE.Group();group.name='strawberry-celebration-cake';
  group.position.set(-9,getTerrainHeight(-9,6),6);
  group.add(mesh(new THREE.CylinderGeometry(2.4,2.65,.55,32),0x9c865c,0,.28));
  for(let tier=0;tier<3;tier++){
    const r=1.9-tier*.48, y=.57+tier*.72;
    group.add(mesh(new THREE.CylinderGeometry(r,r,.68,40),tier%2?0xe1aa9d:0xf1dfb5,0,y+.34));
    group.add(mesh(new THREE.CylinderGeometry(r+.04,r+.04,.1,40),0xffefcf,0,y+.72));
    for(let i=0;i<16;i++){
      const a=i*Math.PI/8;
      group.add(mesh(new THREE.SphereGeometry(.13,8,6),0xf5e7c4,Math.cos(a)*r,y+.6,Math.sin(a)*r));
      if(i%2===0){const berry=mesh(new THREE.SphereGeometry(.14,8,6),0xb94d46,Math.cos(a)*r*.88,y+.88,Math.sin(a)*r*.88);berry.scale.y=1.3;group.add(berry);}
    }
  }
  return group;
}

export function createBunting(): THREE.Group {
  const group=new THREE.Group();group.name='festival-pennant-lines';
  const colors=[0x4b9690,0xdfbd71,0xc7715e,0xf0dfad];
  for(const [ax,az,bx,bz] of [[-15,11,13,15],[-14,-12,22,-9],[20,-9,34,13]]){
    const points:THREE.Vector3[]=[];
    for(let i=0;i<=30;i++){
      const t=i/30;points.push(new THREE.Vector3(ax+(bx-ax)*t,9.1-Math.sin(t*Math.PI)*1.35,az+(bz-az)*t));
    }
    group.add(tube(points,.022,0x807a5b));
    for(const [x,z] of [[ax,az],[bx,bz]]){
      const h=9.1-getTerrainHeight(x,z);
      group.add(mesh(new THREE.CylinderGeometry(.07,.12,h,7),0x827458,x,getTerrainHeight(x,z)+h/2,z));
    }
    for(let i=1;i<17;i++){
      const t=i/17;
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([-.35,0,0,.35,0,0,0,-.68,.06],3));g.computeVertexNormals();
      const flag=mesh(g,colors[i%4],ax+(bx-ax)*t,9.1-Math.sin(t*Math.PI)*1.35,az+(bz-az)*t);
      flag.rotation.y=-Math.atan2(bz-az,bx-ax);flag.material=material(colors[i%4]);(flag.material as THREE.MeshStandardMaterial).side=THREE.DoubleSide;group.add(flag);
    }
  }
  return group;
}

export function createFlowerBridge(): THREE.Group {
  const group=new THREE.Group();group.name='flower-arch-bridge';
  const boards:THREE.BufferGeometry[]=[];
  for(let i=0;i<55;i++){
    const x=37+(i+.5)*.4,y=getBridgeHeight(x);
    const slope=(getBridgeHeight(x+.03)-getBridgeHeight(x-.03))/.06;
    const g=new THREE.BoxGeometry(.385,.16,4.6);g.rotateZ(Math.atan(slope));g.translate(x,y-.08,4);boards.push(g);
  }
  group.add(mesh(mergeGeometries(boards),0xb29564));boards.forEach(g=>g.dispose());
  for(const side of [-1,1]) {
    for(const height of [.35,1.2]){
      const points=Array.from({length:45},(_,i)=>{const x=37+i*.5;return new THREE.Vector3(x,getBridgeHeight(x)+height,4+side*2.3);});
      group.add(tube(points,.085,height>.5?0x8d7957:0x6c6747));
    }
    for(let i=0;i<12;i++){
      const x=37+i*2;group.add(mesh(new THREE.CylinderGeometry(.08,.11,1.45,7),0x8c7957,x,getBridgeHeight(x)+.65,4+side*2.3));
    }
    const beam=Array.from({length:45},(_,i)=>{const x=37+i*.5;return new THREE.Vector3(x,getBridgeHeight(x)-.32,4+side*1.65);});
    group.add(tube(beam,.2,0x786749));
  }
  const rng=seededRandom(448);
  const leafMaterial=new THREE.MeshStandardMaterial({color:0x719349,map:createLeafTexture(),alphaTest:.42,side:THREE.DoubleSide,roughness:1,alphaToCoverage:true});
  const leaves=new THREE.InstancedMesh(new THREE.PlaneGeometry(1.1,1.1).rotateX(-Math.PI/2),leafMaterial,480);
  const flowers=new THREE.InstancedMesh(blossomGeometry(),material(0xffffff),240);
  flowers.name='bridge-petal-blossoms';
  const centres=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(.065,1).scale(1,.55,1).translate(0,.068,0),material(0xd0a345),240);
  centres.name='bridge-flower-centres';
  const dummy=new THREE.Object3D(),c=new THREE.Color();
  for(let i=0;i<480;i++){
    const x=37+rng()*22,side=i%2?1:-1;
    dummy.position.set(x,getBridgeHeight(x)+1.12+(rng()-.5)*.45,4+side*(2.3+(rng()-.5)*.35));
    dummy.rotation.set(rng()*2,rng()*6,rng());dummy.scale.set(1.3,.5,.85);dummy.updateMatrix();leaves.setMatrixAt(i,dummy.matrix);
    if(i<240){
      dummy.position.y+=.14;dummy.rotation.set(side*.55+(rng()-.5)*.4,rng()*6.28,(rng()-.5)*.5);
      dummy.scale.setScalar(.7+rng()*.75);dummy.updateMatrix();
      flowers.setMatrixAt(i,dummy.matrix);centres.setMatrixAt(i,dummy.matrix);
      flowers.setColorAt(i,c.setHex([0xf3e6c9,0xc599c3,0xd8b5cc,0xe9d284][i%4]));
    }
  }
  group.add(leaves,flowers,centres);
  group.userData.colliders=[
    {minX:37,maxX:59,minZ:1.48,maxZ:1.72},
    {minX:37,maxX:59,minZ:6.28,maxZ:6.52}
  ] satisfies Box2D[];
  return group;
}
