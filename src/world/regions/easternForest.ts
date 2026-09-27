import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createBarkTexture, createLeafCluster, grassGeometry, windMaterial } from '../../entities/foliage';
import { blossomGeometry, woodGrain } from '../../entities/festivalLandmarks';
import { getTerrainHeight, isPath, seededRandom } from '../landscape';
import { easternTrailDistance, easternWorkPathDistance } from '../easternForestLayout';
import { batchLeafClusters, createEasternGroundGardens, createMillMasonryTexture } from './easternGroundGardens';
import type { Box2D, QualityTier, UpdateFn } from '../../core/types';

/** Two activity clearings, connected by the shared east loop; no elevated fake floors. */
export function createEasternForest() {
  const group=new THREE.Group();group.name='eastern-living-forest';
  const orchard=new THREE.Group();orchard.name='region:orchard';
  const meadow=new THREE.Group();meadow.name='region:windmill-meadow';
  const edge=new THREE.Group();edge.name='eastern-woodland-edge';group.add(orchard,meadow,edge);
  const colliders:Box2D[]=[],animations:UpdateFn[]=[];
  const canopies:THREE.InstancedMesh[]=[];
  const wood=new THREE.MeshStandardMaterial({color:0x947651,map:woodGrain(),roughness:.87});
  const dark=new THREE.MeshStandardMaterial({color:0x65523a,map:createBarkTexture(),roughness:1});
  const stone=new THREE.MeshStandardMaterial({color:0xa5a38a,roughness:1});
  const cloth=new THREE.MeshStandardMaterial({color:0xe6d8ac,roughness:1,side:THREE.DoubleSide});
  const roof=new THREE.MeshStandardMaterial({color:0x9f6753,roughness:.93});
  const green=new THREE.MeshStandardMaterial({color:0x6b8370,roughness:.88,side:THREE.DoubleSide});
  const gold=new THREE.MeshStandardMaterial({color:0xd2b25f,metalness:.25,roughness:.52});
  const batches=new Map<THREE.Group,Map<THREE.Material,THREE.BufferGeometry[]>>();
  const add=(root:THREE.Group,geometry:THREE.BufferGeometry,material:THREE.Material,x:number,y:number,z:number,rotation=new THREE.Euler())=>{
    geometry.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(rotation),new THREE.Vector3(1,1,1)));
    const map=batches.get(root)??new Map<THREE.Material,THREE.BufferGeometry[]>();
    const list=map.get(material)??[];list.push(geometry);map.set(material,list);batches.set(root,map);
  };
  const box=(root:THREE.Group,x:number,y:number,z:number,w:number,h:number,d:number,mat=wood)=>add(root,new THREE.BoxGeometry(w,h,d),mat,x,y,z);
  const beam=(root:THREE.Group,a:THREE.Vector3,b:THREE.Vector3,r:number,mat=dark)=>{
    const geo=new THREE.CylinderGeometry(r*.78,r,a.distanceTo(b),8);
    const q=new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),b.clone().sub(a).normalize());
    const middle=a.clone().add(b).multiplyScalar(.5);geo.applyQuaternion(q);add(root,geo,mat,middle.x,middle.y,middle.z);
  };
  const block=(x:number,z:number,r:number)=>colliders.push({minX:x-r,maxX:x+r,minZ:z-r,maxZ:z+r});
  const basket=(root:THREE.Group,x:number,z:number)=>{
    const y=getTerrainHeight(x,z);
    add(root,new THREE.CylinderGeometry(.55,.39,.65,16,1,true),wood,x,y+.33,z);
    for(let j=0;j<5;j++)add(root,new THREE.TorusGeometry(.4+j*.032,.02,4,20),dark,x,y+.08+j*.12,z,new THREE.Euler(Math.PI/2,0,0));
    for(let j=0;j<7;j++)add(root,new THREE.SphereGeometry(.16,10,8),roof,x+Math.cos(j*2.4)*.28,y+.62+(j%2)*.1,z+Math.sin(j*2.4)*.28);
  };
  const tree=(root:THREE.Group,x:number,z:number,size:number,fruit=false)=>{
    if(easternTrailDistance(x,z)<4.5)return;
    const y=getTerrainHeight(x,z),height=fruit?3.6:7.5;
    add(root,new THREE.CylinderGeometry(.16*size,.43*size,height*size,10,4),dark,x,y+height*size/2-.12,z);block(x,z,.43*size);
    for(let i=0;i<3;i++){
      const a=i*2.4,end=new THREE.Vector3(x+Math.cos(a)*1.4*size,y+(height+.5+i*.4)*size,z+Math.sin(a)*1.4*size);
      beam(root,new THREE.Vector3(x,y+height*.62*size,z),end,.14*size);
      const crown=createLeafCluster((fruit?2.3:3.2)*size,fruit?(i%2?0x7c9348:0x698440):0x617a45,Math.round(x*31+z*17+i*63));
      crown.position.copy(end);crown.name=fruit?'orchard-fruit-canopy':'east-forest-canopy';root.add(crown);
      canopies.push(crown);
      if(fruit)for(let j=0;j<9;j++) {
        const angle=j*2.4,r=(1.1+(j%3)*.3)*size;
        const fruitGeo=new THREE.SphereGeometry(.13*size,10,8);fruitGeo.scale(1,.9,1);
        add(root,fruitGeo,j%3?roof:gold,end.x+Math.cos(angle)*r,end.y-.85*size+(j%3)*.4,end.z+Math.sin(angle)*r);
      }
    }
  };
  for(const x of [174,184,203,216])for(const z of [48,65,81])tree(orchard,x,z,.95+((x+z)%3)*.07,true);
  // An open press shelter, with separate post colliders: visitors can enter it.
  const sx=189,sz=77,sy=getTerrainHeight(sx,sz),shelter=new THREE.Group();shelter.name='orchard-cider-shelter';orchard.add(shelter);
  for(const dx of [-3.2,3.2])for(const dz of [-2.1,2.1]){
    const x=sx+dx,z=sz+dz,g=getTerrainHeight(x,z);
    beam(shelter,new THREE.Vector3(x,g-.12,z),new THREE.Vector3(x,sy+3.7,z),.12);block(x,z,.14);
  }
  const canopy=new THREE.PlaneGeometry(7.4,5.2,14,12).rotateX(-Math.PI/2),cp=canopy.attributes.position;
  for(let i=0;i<cp.count;i++)cp.setY(i,Math.cos(cp.getX(i)*Math.PI/7.4)*.7);
  canopy.computeVertexNormals();add(shelter,canopy,green,sx,sy+3.6,sz);
  for(let i=0;i<8;i++)box(shelter,sx,sy+1.05,sz-1.35+i*.15,4.5,.13,.13);
  for(const dx of [-1.85,1.85])for(const dz of [-1.2,-.3]){
    const x=sx+dx,z=sz+dz;beam(shelter,new THREE.Vector3(x,getTerrainHeight(x,z)-.1,z),new THREE.Vector3(x,sy+1,z),.065);
  }
  colliders.push({minX:sx-2.25,maxX:sx+2.25,minZ:sz-1.5,maxZ:sz-.15});
  // A timber screw press and tools establish work, not just storage props.
  add(shelter,new THREE.CylinderGeometry(.6,.65,.55,16,1,true),wood,sx,sy+1.4,sz-.85);
  beam(shelter,new THREE.Vector3(sx,sy+1.2,sz-.85),new THREE.Vector3(sx,sy+2.7,sz-.85),.075,gold);
  beam(shelter,new THREE.Vector3(sx-.7,sy+2.7,sz-.85),new THREE.Vector3(sx+.7,sy+2.7,sz-.85),.065);
  basket(shelter,185,75);basket(shelter,192,75.3);basket(orchard,181,67);
  const picnic=new THREE.Group();picnic.name='orchard-picnic-corner';orchard.add(picnic);
  const py=getTerrainHeight(207,77);
  box(picnic,207,py+1,77,3.6,.16,1.6);
  for(const x of [205.6,208.4])for(const z of [76.5,77.5])beam(picnic,new THREE.Vector3(x,getTerrainHeight(x,z)-.15,z),new THREE.Vector3(x,py+.93,z),.08);
  for(const z of [75.5,78.5]){box(picnic,207,py+.5,z,3.9,.13,.45);for(const x of [205.5,208.5])beam(picnic,new THREE.Vector3(x,getTerrainHeight(x,z)-.1,z),new THREE.Vector3(x,py+.45,z),.07);}
  block(207,77,2.1);box(picnic,207,py+1.1,77,1.8,.012,1.5,cloth);basket(picnic,211,78);

  const mill=new THREE.Group();mill.name='meadow-grain-mill';meadow.add(mill);
  const mx=210,mz=-57,my=getTerrainHeight(mx,mz);
  const stoneMap=createMillMasonryTexture();
  const masonry=new THREE.Mesh(new THREE.CylinderGeometry(1.6,2.7,7.4,40,8),new THREE.MeshStandardMaterial({color:0xc0b69b,map:stoneMap,bumpMap:stoneMap,bumpScale:.065,roughness:.96}));
  masonry.name='windmill-masonry';masonry.position.set(mx,my+3.7,mz);masonry.castShadow=true;masonry.receiveShadow=true;mill.add(masonry);block(mx,mz,2.8);
  add(mill,new THREE.ConeGeometry(2.3,3.1,32),roof,mx,my+8.85,mz);
  box(mill,mx,my+1,mz+2.6,1.1,2,.08,dark);
  box(mill,mx-.22,my+1,mz+2.66,.035,1.8,.025,wood);
  const window=new THREE.Mesh(new THREE.CircleGeometry(.42,24),new THREE.MeshStandardMaterial({color:0xd5b777,emissive:0x9b6f2d,emissiveIntensity:.3}));
  window.position.set(mx,my+4.9,mz+2.05);mill.add(window);
  const rotor=new THREE.Group();rotor.name='eastern-windmill-sails';rotor.position.set(mx,my+7,mz+2.25);mill.add(rotor);
  for(let i=0;i<4;i++){
    const blade=new THREE.Group();blade.rotation.z=i*Math.PI/2;rotor.add(blade);
    const mast=new THREE.Mesh(new THREE.BoxGeometry(.13,4.8,.13),dark);mast.position.y=2.4;blade.add(mast);
    const shape=new THREE.Shape();shape.moveTo(.12,1.2);shape.lineTo(1.2,1.5);shape.lineTo(.83,4.7);shape.lineTo(.12,4.7);shape.closePath();
    const sail=new THREE.Mesh(new THREE.ShapeGeometry(shape),cloth);sail.position.z=.02;sail.castShadow=true;blade.add(sail);
    for(let j=0;j<6;j++){const rib=new THREE.Mesh(new THREE.BoxGeometry(.95-j*.04,.035,.05),wood);rib.position.set(.54,1.5+j*.56,.05);blade.add(rib);}
  }
  animations.push(time=>{rotor.rotation.z=-time*.18;});
  const granary=new THREE.Group();granary.name='meadow-grain-drying-yard';meadow.add(granary);
  for(const x of [197,200,203]) {
    const y=getTerrainHeight(x,-64);
    add(granary,new THREE.CylinderGeometry(.45,.65,.9,12),cloth,x,y+.45,-64);
    add(granary,new THREE.TorusGeometry(.32,.05,5,16),dark,x,y+.9,-64,new THREE.Euler(Math.PI/2,0,0));
  }
  for(const x of [194,201]){const y=getTerrainHeight(x,-61);beam(granary,new THREE.Vector3(x,y-.15,-61),new THREE.Vector3(x,my+2.7,-61),.1);block(x,-61,.12);}
  beam(granary,new THREE.Vector3(194,my+2.7,-61),new THREE.Vector3(201,my+2.7,-61),.07);
  for(let i=0;i<8;i++)add(granary,new THREE.ConeGeometry(.15,.65,7),gold,194.6+i*.8,my+2.1,-61,new THREE.Euler(Math.PI,0,0));
  const rest=new THREE.Group();rest.name='windflower-resting-nook';meadow.add(rest);
  const ry=getTerrainHeight(225,-32);
  box(rest,225,ry+.6,-32,4,.16,.7);
  box(rest,225,ry+1.1,-32.3,4,.5,.1);
  for(const x of [223.6,226.4])beam(rest,new THREE.Vector3(x,getTerrainHeight(x,-32)-.1,-32),new THREE.Vector3(x,ry+.55,-32),.14);
  colliders.push({minX:223,maxX:227,minZ:-32.4,maxZ:-31.6});
  // Distinct sheltering woodland, not an even wall of identical trees.
  for(let i=0;i<27;i++) {
    const a=i*2.4,x=168+(i%7)*12+Math.sin(a)*3,z=-91+Math.floor(i/7)*66+Math.cos(a)*5;
    if(Math.hypot(x-193,z-58)>30&&Math.hypot(x-210,z+42)>30)tree(edge,x,z,1.05+(i%3)*.17);
  }
  for(const [x,z] of [[164,74],[164,-62],[225,79],[237,48],[234,-68],[234,-32]])tree(edge,x,z,1.1);
  // Back and outer edge are an irregular, multi-height woodland, preserving
  // open activity clearings while hiding the map's straight geometric edge.
  const edgeRandom=seededRandom(641);
  for(let i=0;i<42;i++){
    const x=i%2?166+edgeRandom()*85:240+edgeRandom()*23;
    const z=i%2?-104+edgeRandom()*17:-110+edgeRandom()*239;
    tree(edge,x,z,.9+edgeRandom()*.7);
  }
  // Layered southern woodland closes the orchard's formerly bare horizon.
  // A separate seed leaves every pre-existing tree and path unchanged.
  const southernRandom=seededRandom(4303);
  for(let i=0;i<24;i++){
    const x=163+(i%8)*12+southernRandom()*5,z=102+Math.floor(i/8)*13+southernRandom()*6;
    tree(edge,x,z,.95+southernRandom()*.8);
  }
  // Roof ribs, a shaded porch and a low garden wall give the landmark readable
  // construction from the path, not merely a cylinder and rotating cross.
  for(let i=0;i<20;i++){
    const a=i*Math.PI/10;
    beam(mill,new THREE.Vector3(mx,my+10.4,mz),new THREE.Vector3(mx+Math.cos(a)*2.27,my+7.4,mz+Math.sin(a)*2.27),.025,dark);
  }
  for(const dx of [-1.5,1.5]){const x=mx+dx,z=mz+4.5;beam(mill,new THREE.Vector3(x,getTerrainHeight(x,z)-.15,z),new THREE.Vector3(x,my+2.6,z),.09);block(x,z,.12);}
  const porchRoof=new THREE.PlaneGeometry(3.5,2.3).rotateX(-Math.PI*.43);
  add(mill,porchRoof,green,mx,my+2.85,mz+3.55);
  for(let i=0;i<18;i++){
    const x=193+i*1.5,z=-74+Math.sin(i*.23)*2;
    const y=getTerrainHeight(x,z);add(granary,new THREE.DodecahedronGeometry(.7,1),stone,x,y+.25,z,new THREE.Euler(i*.4,i*.9,0));
  }
  const gardens=createEasternGroundGardens(colliders);group.add(gardens.group);animations.push(gardens.update);
  // Flowers are interleaved by patch so reduced quality retains both destinations.
  const rng=seededRandom(927),count=2400,flowers=new THREE.InstancedMesh(blossomGeometry(),new THREE.MeshStandardMaterial({color:0xffffff,roughness:.95,side:THREE.DoubleSide}),count);
  const stems=new THREE.InstancedMesh(new THREE.CylinderGeometry(.018,.03,.55,4).translate(0,.275,0),new THREE.MeshStandardMaterial({color:0x657740,roughness:1}),count);
  flowers.name='eastern-meadow-flowers';stems.name='eastern-flower-stems';flowers.castShadow=true;flowers.receiveShadow=true;
  const patches=[[199,-32,13,8],[223,-53,9,11],[204,-76,16,7],[187,42,12,5],[214,67,8,5],[174,86,9,5],[183,-18,11,18]];
  const dummy=new THREE.Object3D(),color=new THREE.Color();let placed=0;
  for(let i=0;i<count;i++){
    const [cx,cz,rx,rz]=patches[i%patches.length],a=rng()*Math.PI*2,r=Math.sqrt(rng()),x=cx+Math.cos(a)*r*rx,z=cz+Math.sin(a)*r*rz;
    if(isPath(x,z,.8)||easternWorkPathDistance(x,z)<1.65||colliders.some(b=>x>b.minX-1&&x<b.maxX+1&&z>b.minZ-1&&z<b.maxZ+1))continue;
    const s=.6+rng()*.85,y=getTerrainHeight(x,z);dummy.position.set(x,y,z);dummy.rotation.set(0,a,0);dummy.scale.setScalar(s);dummy.updateMatrix();stems.setMatrixAt(placed,dummy.matrix);
    dummy.position.y+=.54*s;dummy.rotation.x=.15*Math.sin(a);dummy.updateMatrix();flowers.setMatrixAt(placed,dummy.matrix);
    flowers.setColorAt(placed++,color.setHex([0xb6a0c4,0xc6b4d0,0xe5d8aa,0xc88f9a][i%4]));
  }
  flowers.count=stems.count=placed;group.add(flowers,stems);
  const grassWind=windMaterial(0xffffff,.19,'up');grassWind.material.vertexColors=true;
  const grass=new THREE.InstancedMesh(grassGeometry(),grassWind.material,13000);grass.name='eastern-field-grass';grass.receiveShadow=true;
  const grassRandom=seededRandom(928);let grassCount=0;
  for(let i=0;i<13000;i++){
    const patch=patches[i%patches.length];
    const x=i%2?patch[0]+(grassRandom()-.5)*patch[2]*2.5:160+grassRandom()*90;
    const z=i%2?patch[1]+(grassRandom()-.5)*patch[3]*2.5:-104+grassRandom()*220;
    if(isPath(x,z,.6)||easternWorkPathDistance(x,z)<1.6||colliders.some(b=>x>b.minX-.4&&x<b.maxX+.4&&z>b.minZ-.4&&z<b.maxZ+.4))continue;
    dummy.position.set(x,getTerrainHeight(x,z)-.025,z);dummy.rotation.set(0,grassRandom()*Math.PI*2,0);dummy.scale.setScalar(.7+grassRandom()*.9);dummy.updateMatrix();grass.setMatrixAt(grassCount++,dummy.matrix);
  }
  grass.count=grassCount;group.add(grass);animations.push(time=>{grassWind.time.value=time;});
  for(const [root,byMaterial] of batches)for(const [material,parts] of byMaterial){
    const nonIndexed=parts.map(g=>g.index?g.toNonIndexed():g);
    const combined=mergeGeometries(nonIndexed,false);
    if(combined){const mesh=new THREE.Mesh(combined,material);mesh.name='crafted-east-detail';mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh);}
    new Set([...parts,...nonIndexed]).forEach(g=>g.dispose());
  }
  const crowns=batchLeafClusters(canopies);group.add(...crowns.meshes);
  return {group,colliders,animations,setQuality(tier:QualityTier){crowns.setQuality(tier);gardens.setQuality(tier);flowers.count=stems.count=tier==='low'?Math.min(650,placed):tier==='medium'?Math.min(1300,placed):placed;grass.count=tier==='low'?Math.min(3500,grassCount):tier==='medium'?Math.min(7000,grassCount):grassCount;}};
}
