import * as THREE from 'three';
import { easternTrailDistance } from '../easternForestLayout';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createLeafCluster } from '../../entities/foliage';
import { createMushroom } from '../../entities/props';
import { blossomGeometry, woodGrain } from '../../entities/festivalLandmarks';
import { CROSSINGS, FOREST_TRAILS, WATER_LEVEL, forestTrailDistance, getBridgeHeight, getTerrainHeight, seededRandom } from '../landscape';
import type { Box2D, UpdateFn } from '../../core/types';

const up=new THREE.Vector3(0,1,0);
const timber=new THREE.MeshStandardMaterial({color:0x735035,map:woodGrain(),roughness:1});
const planks=new THREE.MeshStandardMaterial({color:0x9c7447,map:woodGrain(),roughness:.94});
const darkWood=new THREE.MeshStandardMaterial({color:0x3f3828,map:woodGrain(),roughness:1});
const glass=new THREE.MeshStandardMaterial({color:0xffcb6e,emissive:0xffa333,emissiveIntensity:.7,roughness:.5});

const barkPixels=new Uint8Array(128*256*4);
for(let y=0;y<256;y++) for(let x=0;x<128;x++) {
  const grain=Math.sin(x*.61+Math.sin(y*.037)*1.7)+.45*Math.sin(x*1.47+y*.018);
  const cracks=Math.pow(Math.max(0,Math.cos(x*.3+Math.sin(y*.065))),12);
  const v=155+grain*25-cracks*46,i=(y*128+x)*4;
  barkPixels[i]=v;barkPixels[i+1]=v*.87;barkPixels[i+2]=v*.71;barkPixels[i+3]=255;
}
const barkMap=new THREE.DataTexture(barkPixels,128,256);barkMap.colorSpace=THREE.SRGBColorSpace;
barkMap.wrapS=barkMap.wrapT=THREE.RepeatWrapping;barkMap.repeat.set(2,3);barkMap.generateMipmaps=true;barkMap.minFilter=THREE.LinearMipmapLinearFilter;barkMap.magFilter=THREE.LinearFilter;barkMap.needsUpdate=true;
const bark=new THREE.MeshStandardMaterial({color:0xa78d66,map:barkMap,bumpMap:barkMap,bumpScale:.13,roughness:1});

function mesh(geometry:THREE.BufferGeometry,material:THREE.Material,name='woodwork') {
  const object=new THREE.Mesh(geometry,material);object.name=name;object.castShadow=true;object.receiveShadow=true;return object;
}
function beam(a:THREE.Vector3,b:THREE.Vector3,r:number,material:THREE.Material=timber) {
  const d=b.clone().sub(a),object=mesh(new THREE.CylinderGeometry(r*.72,r,d.length(),7),material);
  object.position.copy(a).add(b).multiplyScalar(.5);object.quaternion.setFromUnitVectors(up,d.normalize());return object;
}
function tube(points:THREE.Vector3[],radius:number,material:THREE.Material,segments=40) {
  return mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),segments,radius,5,false),material);
}

/** Static woodwork is merged by material per landmark, keeping visible details inexpensive. */
function batchStatic(root:THREE.Group) {
  root.updateMatrixWorld(true);
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>(),remove:THREE.Mesh[]=[];
  const inverse=root.matrixWorld.clone().invert();
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh) || object instanceof THREE.InstancedMesh || Array.isArray(object.material) || object.userData.animated) return;
    const geometry=object.geometry.clone().applyMatrix4(inverse.clone().multiply(object.matrixWorld));
    const normal=geometry.getAttribute('normal');
    if(!normal)geometry.computeVertexNormals();
    if(!geometry.getAttribute('uv'))geometry.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(geometry.getAttribute('position').count*2),2));
    for(const key of Object.keys(geometry.attributes))if(!['position','normal','uv'].includes(key))geometry.deleteAttribute(key);
    const list=batches.get(object.material)??[];list.push(geometry.index?geometry.toNonIndexed():geometry);batches.set(object.material,list);remove.push(object);
  });
  remove.forEach(object=>object.removeFromParent());
  for(const [material,geometries] of batches) {
    const combined=mergeGeometries(geometries,false);
    if(combined)root.add(mesh(combined,material,'batched-landmark-detail'));
    geometries.forEach(g=>g.dispose());
  }
}

function lantern(color=0xffc878):THREE.Group {
  const g=new THREE.Group();g.name='ribbed-paper-lantern';
  const paper=new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.55,roughness:.8});
  const body=mesh(new THREE.SphereGeometry(.33,12,10),paper);body.scale.set(1,1.35,1);g.add(body);
  for(const y of [-.4,.4]){const cap=mesh(new THREE.CylinderGeometry(.17,.2,.1,10),darkWood);cap.position.y=y;g.add(cap);}
  for(let i=0;i<6;i++) {
    const a=i*Math.PI/3;
    const points=Array.from({length:13},(_,j)=>{const t=j/12*Math.PI,r=Math.sin(t)*.335;return new THREE.Vector3(Math.cos(a)*r,Math.cos(t)*.435,Math.sin(a)*r);});
    g.add(tube(points,.012,darkWood,12));
  }
  const tassel=mesh(new THREE.CylinderGeometry(.026,.06,.2,6),planks);tassel.position.y=-.57;g.add(tassel);
  return g;
}

function festoon(points:THREE.Vector3[],count:number):THREE.Group {
  const g=new THREE.Group();g.name='lantern-festoon';const curve=new THREE.CatmullRomCurve3(points);
  g.add(mesh(new THREE.TubeGeometry(curve,48,.025,4,false),darkWood));
  const colors=[0xffc878,0xe4b5a7,0xb9d0ba,0xc79cba];
  for(let i=0;i<count;i++) {
    const p=curve.getPoint((i+.5)/count),lamp=lantern(colors[i%4]);lamp.position.copy(p);lamp.position.y-=.58;g.add(lamp);
    g.add(beam(p,p.clone().add(new THREE.Vector3(0,-.25,0)),.015,darkWood));
  }
  batchStatic(g);return g;
}

function windowArch():THREE.Group {
  const g=new THREE.Group();g.name='arched-glowing-window';
  const shape=new THREE.Shape();shape.moveTo(-.6,0);shape.lineTo(.6,0);shape.lineTo(.6,1);shape.absarc(0,1,.6,0,Math.PI,false);shape.lineTo(-.6,0);
  g.add(mesh(new THREE.ShapeGeometry(shape),glass));
  const points=[new THREE.Vector3(-.67,0,.05),new THREE.Vector3(-.67,1,.05)];
  for(let i=0;i<=16;i++){const a=Math.PI-i*Math.PI/16;points.push(new THREE.Vector3(Math.cos(a)*.67,1+Math.sin(a)*.67,.05));}
  points.push(new THREE.Vector3(.67,0,.05));g.add(tube(points,.085,timber,24));
  g.add(beam(new THREE.Vector3(0,0,.06),new THREE.Vector3(0,1.55,.06),.045));
  g.add(beam(new THREE.Vector3(-.59,.72,.06),new THREE.Vector3(.59,.72,.06),.045));return g;
}

function elderTree(x:number,z:number,scale:number,homes=false):THREE.Group {
  const g=new THREE.Group();g.name=homes?'inhabited-elder-tree':'buttressed-forest-elder';g.position.set(x,getTerrainHeight(x,z),z);g.scale.setScalar(scale);
  const geometry=new THREE.CylinderGeometry(.7,2.15,24,22,22),p=geometry.attributes.position;
  for(let i=0;i<p.count;i++) {
    const y=p.getY(i)+12,a=Math.atan2(p.getZ(i),p.getX(i));
    const ridges=1+.08*Math.sin(a*11+y*.4)+Math.max(0,1-y/6)*.3*Math.cos(a*7);
    p.setXYZ(i,p.getX(i)*ridges+Math.sin(y*.16)*.55,y,p.getZ(i)*ridges+Math.cos(y*.23)*.35);
  }
  geometry.computeVertexNormals();g.add(mesh(geometry,bark,'furrowed-living-trunk'));
  for(let i=0;i<7;i++) {
    const a=i*2.4;
    g.add(tube([new THREE.Vector3(Math.cos(a)*.9,4,Math.sin(a)*.9),new THREE.Vector3(Math.cos(a)*2.5,.7,Math.sin(a)*2.5),new THREE.Vector3(Math.cos(a)*5,.07,Math.sin(a)*5)],.32,bark,15));
    const y=13+(i%3)*2,end=new THREE.Vector3(Math.cos(a)*7,y+4,Math.sin(a)*7);
    g.add(tube([new THREE.Vector3(0,y-3,0),new THREE.Vector3(Math.cos(a)*3,y,Math.sin(a)*3),end],.38,bark,18));
    const crown=createLeafCluster(5.2+(i%2),i%3?0x63713a:0x8a8f43,i*14+Math.round(x));crown.position.copy(end).add(new THREE.Vector3(0,1,0));g.add(crown);
  }
  if(homes) for(let floor=0;floor<3;floor++) {
    const y=2.4+floor*4.7,a=floor%2?.65:-.18;
    const home=new THREE.Group();home.position.set(Math.sin(a)*1.7,y,Math.cos(a)*1.7);home.rotation.y=a;g.add(home);
    const frame=windowArch();frame.scale.setScalar(1.1);frame.position.z=.23;home.add(frame);
    const balcony=mesh(new THREE.CylinderGeometry(1.8,1.85,.2,18,1,false,0,Math.PI),planks);balcony.rotation.y=-Math.PI/2;balcony.position.set(0,-.15,.38);home.add(balcony);
    const rail:THREE.Vector3[]=[];
    for(let i=0;i<=10;i++) {
      const theta=-Math.PI/2+i*Math.PI/10,bx=Math.sin(theta)*1.76,bz=Math.cos(theta)*1.76+.38;
      home.add(beam(new THREE.Vector3(bx,-.05,bz),new THREE.Vector3(bx,.9,bz),.045));rail.push(new THREE.Vector3(bx,.9,bz));
    }
    home.add(tube(rail,.065,timber,24));
    for(const side of [-1,1])home.add(beam(new THREE.Vector3(side*.7,-1.25,.1),new THREE.Vector3(side*1.35,-.25,1.1),.12));
    const lamp=lantern();lamp.position.set(1.1,1.9,.4);home.add(lamp);
  }
  batchStatic(g);return g;
}

function flowerBeds(x:number,z:number,radius:number,count=80):THREE.Group {
  const g=new THREE.Group();g.name='fern-and-flower-border';
  const petals=new THREE.InstancedMesh(blossomGeometry(),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.88,side:THREE.DoubleSide}),count);
  const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.02,.03,.5,4).translate(0,.25,0),new THREE.MeshStandardMaterial({color:0x596b36,roughness:1}),count);
  const rng=seededRandom(Math.abs(Math.round(x*29+z*13))),dummy=new THREE.Object3D(),c=new THREE.Color();
  for(let i=0;i<count;i++) {
    const a=rng()*Math.PI*2,r=radius*(.7+rng()*.35),px=x+Math.cos(a)*r,pz=z+Math.sin(a)*r,py=getTerrainHeight(px,pz),s=.7+rng();
    dummy.position.set(px,py,pz);dummy.scale.setScalar(s);dummy.updateMatrix();stems.setMatrixAt(i,dummy.matrix);
    dummy.position.y+=.48*s;dummy.rotation.set(.3*rng(),a,0);dummy.updateMatrix();petals.setMatrixAt(i,dummy.matrix);
    petals.setColorAt(i,c.setHex([0xa385bf,0xc59ac6,0xffd88c,0xeacdae][i%4]));
  }
  petals.castShadow=true;g.add(petals,stems);return g;
}

function mushroomHome(x:number,z:number,scale:number,capColor:number):THREE.Group {
  const home=createMushroom({x,y:getTerrainHeight(x,z),z,height:6.7,radius:4.4,scale,capColor,spots:true});
  home.name='mushroom-cottage';
  const doorway=windowArch();doorway.position.set(0,.15,1.5);doorway.scale.set(1.3,1.35,1);home.add(doorway);
  for(const side of [-1,1]) {const w=windowArch();w.scale.setScalar(.6);w.position.set(side*1.18,2.25,.83);w.rotation.y=side*.75;home.add(w);}
  const porch=mesh(new THREE.BoxGeometry(4,.25,2.4),planks);porch.position.set(0,.1,2);home.add(porch);
  for(let i=0;i<22;i++) {
    const a=i*Math.PI*2/22;
    home.add(beam(new THREE.Vector3(Math.cos(a)*1.15,6.1,Math.sin(a)*1.15),new THREE.Vector3(Math.cos(a)*4.13,6.67,Math.sin(a)*4.13),.025,planks));
  }
  const awning=mesh(new THREE.CylinderGeometry(2.6,2.6,.08,20,1,false,0,Math.PI),new THREE.MeshStandardMaterial({color:0x688178,roughness:1}));
  awning.rotation.set(0,-Math.PI/2,0);awning.scale.z=.7;awning.position.set(0,2.65,1.6);home.add(awning);
  for(const side of [-1,1]) {home.add(beam(new THREE.Vector3(side*2.3,.25,2.4),new THREE.Vector3(side*2.3,2.65,2.4),.09));const l=lantern();l.position.set(side*1.65,2.13,2.3);home.add(l);}
  batchStatic(home);return home;
}

function outerCrossing(crossing:typeof CROSSINGS[number]):{group:THREE.Group;colliders:Box2D[]} {
  const g=new THREE.Group();g.name=`forest-footbridge:${crossing.z}`;
  const {x,z,halfLength,halfWidth}=crossing,n=90,left=x-halfLength;
  for(let i=0;i<n;i++) {
    const px=left+(i+.5)*halfLength*2/n;
    const board=mesh(new THREE.BoxGeometry(halfLength*2/n+.018,.16,halfWidth*2),i%4?planks:timber);
    board.position.set(px,getBridgeHeight(px,crossing)-.08,z);
    board.rotation.z=Math.atan((getBridgeHeight(px+.05,crossing)-getBridgeHeight(px-.05,crossing))/.1);g.add(board);
  }
  for(const side of [-1,1]) {
    const points:THREE.Vector3[]=[];
    for(let i=0;i<=12;i++) {
      const px=left+i*halfLength*2/12,y=getBridgeHeight(px,crossing);
      g.add(beam(new THREE.Vector3(px,y-.1,z+side*halfWidth),new THREE.Vector3(px,y+1.15,z+side*halfWidth),.07));
      points.push(new THREE.Vector3(px,y+1.07,z+side*halfWidth));
      if(i%4===1){const l=lantern();l.scale.setScalar(.7);l.position.set(px,y+1.8,z+side*(halfWidth+.08));g.add(l);}
    }
    g.add(tube(points,.05,darkWood,60));
  }
  batchStatic(g);
  return {group:g,colliders:[-1,1].map(side=>({minX:left,maxX:x+halfLength,minZ:z+side*halfWidth-.08,maxZ:z+side*halfWidth+.08}))};
}

export function createExpandedForest() {
  const group=new THREE.Group();group.name='expanded-forest-world';const colliders:Box2D[]=[],animations:UpdateFn[]=[];
  const addTree=(root:THREE.Group,x:number,z:number,s:number,homes:boolean)=>{
    root.add(elderTree(x,z,s,homes));colliders.push({minX:x-2.1*s,maxX:x+2.1*s,minZ:z-2.1*s,maxZ:z+2.1*s});
  };
  const center=new THREE.Group();center.name='forest-celebration-canopy';
  for(const [x,z,s,homes] of [[-24,-18,1.05,0],[26,-20,1.18,1],[69,-22,1.15,1],[-23,29,.9,0],[25,39,1,0],[-39,4,1.1,0]])addTree(center,x,z,s,Boolean(homes));
  center.add(mushroomHome(-29,-5,1.5,0xb96d3f),flowerBeds(-17,7,3.5,95),flowerBeds(16,-4,4,95));
  center.add(festoon([new THREE.Vector3(-24,9,12),new THREE.Vector3(-3,7,17),new THREE.Vector3(24,10,12)],11));
  center.add(festoon([new THREE.Vector3(-19,9,-19),new THREE.Vector3(3,7,-17),new THREE.Vector3(26,11,-20)],10));
  group.add(center);
  const market=new THREE.Group();market.name='region:lantern-hamlet';
  for(const [x,z,s,color] of [[-127,-9,1.2,0xbf7640],[-101,-9,1,0xa46550],[-128,14,.8,0xb78b52],[-102,20,.9,0x9b755a]]) {
    market.add(mushroomHome(x,z,s,color),flowerBeds(x,z,5*s));colliders.push({minX:x-1.6*s,maxX:x+1.6*s,minZ:z-1.6*s,maxZ:z+1.6*s});
  }
  addTree(market,-135,1,1.3,false);addTree(market,-88,23,1.15,false);
  market.add(festoon([new THREE.Vector3(-132,11,2),new THREE.Vector3(-111,7,5),new THREE.Vector3(-94,10,8)],13));group.add(market);
  const village=new THREE.Group();village.name='region:canopy-village';
  for(const [x,z,s] of [[91,-48,1.25],[115,-41,1.4],[104,-69,1.2]]) {addTree(village,x,z,s,true);village.add(flowerBeds(x,z,5*s));}
  village.add(festoon([new THREE.Vector3(91,12,-48),new THREE.Vector3(103,8,-44),new THREE.Vector3(115,12,-41)],10));group.add(village);
  const garden=new THREE.Group();garden.name='region:firefly-garden';
  for(const [x,z] of [[-42,95],[-14,102],[-33,112]])addTree(garden,x,z,.8,false);
  for(let i=0;i<6;i++){const a=i*Math.PI/3;garden.add(flowerBeds(-28+Math.cos(a)*7,96+Math.sin(a)*7,2.4,90));}
  garden.add(festoon([new THREE.Vector3(-42,7,95),new THREE.Vector3(-28,5,96),new THREE.Vector3(-14,7,102)],9));group.add(garden);
  for(const crossing of CROSSINGS.slice(1)){const bridge=outerCrossing(crossing);group.add(bridge.group);colliders.push(...bridge.colliders);}
  // Small repeated trail markers provide scale and direction without introducing another UI system.
  const markers=new THREE.Group();markers.name='forest-trail-markers';
  for(const trail of FOREST_TRAILS) for(let i=1;i<trail.points.length;i++) {
    const [x,z]=trail.points[i],[ax,az]=trail.points[i-1],dx=x-ax,dz=z-az,length=Math.hypot(dx,dz);
    const candidates=[3.2,-3.2,4.5,-4.5,6,-6].map(offset=>({x:x-dz/length*offset,z:z+dx/length*offset}));
    const position=candidates.find(p=>forestTrailDistance(p.x,p.z)>2.7 && easternTrailDistance(p.x,p.z)>2.7 && getTerrainHeight(p.x,p.z)>WATER_LEVEL);
    if(!position)continue; // At a crowded junction it is better to omit a sign than obstruct another path.
    const y=getTerrainHeight(position.x,position.z);
    markers.add(beam(new THREE.Vector3(position.x,y,position.z),new THREE.Vector3(position.x,y+1.65,position.z),.085));
    const arrow=mesh(new THREE.BoxGeometry(.85,.28,.08),planks);arrow.position.set(position.x,y+1.4,position.z);arrow.rotation.y=Math.atan2(dx,dz);markers.add(arrow);
    colliders.push({minX:position.x-.12,maxX:position.x+.12,minZ:position.z-.12,maxZ:position.z+.12});
  }
  batchStatic(markers);group.add(markers);
  return {group,colliders,animations};
}
