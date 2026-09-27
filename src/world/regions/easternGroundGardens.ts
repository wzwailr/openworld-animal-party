import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { createLeafTexture, windMaterial } from '../../entities/foliage';
import { getTerrainHeight, isPath, seededRandom, smoothstep } from '../landscape';
import { EASTERN_WORK_PATHS, easternWorkPathDistance } from '../easternForestLayout';
import type { Box2D, QualityTier } from '../../core/types';

/** Bake compatible createLeafCluster sprites into local 40 m culling cells.
 * Leaf-number-first ordering preserves every crown when reducing the instance count.
 */
export function batchLeafClusters(clusters:readonly THREE.InstancedMesh[]) {
  const cells=new Map<string,THREE.InstancedMesh[]>();
  for(const cluster of clusters) {
    cluster.updateWorldMatrix(true,false);
    const p=new THREE.Vector3().setFromMatrixPosition(cluster.matrixWorld);
    const key=`${Math.floor(p.x/40)},${Math.floor(p.z/40)}`;
    const cell=cells.get(key)??[];cell.push(cluster);cells.set(key,cell);
  }
  const {material}=windMaterial(0xffffff,0,'canopy');
  material.map=createLeafTexture();material.alphaTest=.42;material.alphaToCoverage=true;
  const meshes:THREE.InstancedMesh[]=[],counts:number[]=[];
  const matrix=new THREE.Matrix4(),normal=new THREE.Vector3(),color=new THREE.Color();
  for(const [key,sources] of cells) {
    const count=sources.reduce((n,source)=>n+source.count,0),geometry=sources[0].geometry.clone();
    const normals=new Float32Array(count*3),mesh=new THREE.InstancedMesh(geometry,material,count);
    mesh.name=`eastern-canopy-cell:${key}`;mesh.castShadow=true;
    const normalMatrices=sources.map(source=>new THREE.Matrix3().getNormalMatrix(source.matrixWorld));
    let placed=0;
    for(let leaf=0;leaf<Math.max(...sources.map(source=>source.count));leaf++)for(let j=0;j<sources.length;j++) {
      const source=sources[j];if(leaf>=source.count)continue;
      source.getMatrixAt(leaf,matrix);matrix.premultiply(source.matrixWorld);mesh.setMatrixAt(placed,matrix);
      source.getColorAt(leaf,color);color.multiply((source.material as THREE.MeshStandardMaterial).color);mesh.setColorAt(placed,color);
      normal.fromBufferAttribute(source.geometry.getAttribute('aCanopyNormal'),leaf).applyMatrix3(normalMatrices[j]).normalize().toArray(normals,placed*3);
      placed++;
    }
    geometry.setAttribute('aCanopyNormal',new THREE.InstancedBufferAttribute(normals,3));
    mesh.computeBoundingBox();mesh.computeBoundingSphere();meshes.push(mesh);counts.push(count);
  }
  for(const source of clusters){source.removeFromParent();source.geometry.dispose();(source.material as THREE.Material).dispose();}
  return {meshes,setQuality(tier:QualityTier){
    meshes.forEach((mesh,i)=>{mesh.count=Math.floor(counts[i]*(tier==='high'?1:tier==='medium'?.8:.6));});
  }};
}

/** Original small tiling stonework: staggered joints, worn edges and quiet grain. */
export function createMillMasonryTexture(): THREE.DataTexture {
  const width=768,height=384,data=new Uint8Array(width*height*4);
  const hash=(x:number,y:number)=>{
    // Wrap stone IDs too: the texture's cylinder seam must not change its tint.
    const n=Math.sin(((x%24+24)%24)*127.1+((y%12+12)%12)*311.7)*43758.5453;
    return n-Math.floor(n);
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const px=x/(width-1)*width,py=y/(height-1)*height;
    const v=py+1.6*Math.sin(px/width*Math.PI*24)+.8*Math.sin(px/width*Math.PI*62);
    const row=Math.floor(v/32),u=px+(row%2)*16+hash(0,row)*8+2.4*Math.sin(py/height*Math.PI*12);
    const col=Math.floor(u/32),fx=(u%32+32)%32,fy=(v%32+32)%32,edge=Math.min(fx,32-fx,fy,32-fy);
    const noise=Math.sin(px*Math.PI/8)*Math.cos(py*Math.PI/8)*2;
    const weather=Math.sin(px/width*Math.PI*6+Math.sin(py/height*Math.PI*4))*Math.cos(py/height*Math.PI*8)*7;
    const stone=205+hash(col,row)*23+noise+weather;
    const value=Math.round(THREE.MathUtils.lerp(174,stone,smoothstep(.55,2.9,edge)));
    const i=(y*width+x)*4;data[i]=value;data[i+1]=value;data[i+2]=value;data[i+3]=255;
  }
  const texture=new THREE.DataTexture(data,width,height);
  texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
  texture.magFilter=THREE.LinearFilter;texture.minFilter=THREE.LinearMipmapLinearFilter;
  texture.generateMipmaps=true;texture.anisotropy=4;texture.needsUpdate=true;
  return texture;
}

function shrubGeometry(): THREE.BufferGeometry {
  const parts:THREE.BufferGeometry[]=[],random=seededRandom(4301);
  for(let i=0;i<54;i++) {
    const a=i*2.399,r=Math.sqrt(random())*.65,h=.22+(1-r/.9)*(.25+random()*.5);
    const leaf=new THREE.PlaneGeometry(.68,.68);
    leaf.rotateX(-Math.PI/2+(random()-.5)*1.3);leaf.rotateY(a);leaf.rotateZ((random()-.5)*.6);
    leaf.translate(Math.cos(a)*r,h,Math.sin(a)*r);parts.push(leaf);
  }
  const geometry=mergeGeometries(parts);parts.forEach(g=>g.dispose());
  geometry.computeBoundingBox();geometry.translate(0,-geometry.boundingBox!.min.y,0);
  return geometry;
}

/** Small flower spikes have their own green stems; no oversized floating discs. */
function herbGeometry(): THREE.BufferGeometry {
  const parts:THREE.BufferGeometry[]=[];
  const tint=(g:THREE.BufferGeometry,color:number)=>{
    const c=new THREE.Color(color),values:number[]=[];
    for(let i=0;i<g.attributes.position.count;i++)values.push(c.r,c.g,c.b);
    g.setAttribute('color',new THREE.Float32BufferAttribute(values,3));parts.push(g);
  };
  for(let i=0;i<3;i++) {
    const a=i*2.4,x=Math.cos(a)*.15,z=Math.sin(a)*.15,h=.65+(i%3)*.12;
    tint(new THREE.CylinderGeometry(.009,.018,h,4).translate(x,h/2,z),0x68854c);
    for(let j=0;j<13;j++) {
      const flower=new THREE.OctahedronGeometry(1,0);
      const angle=j*2.4,spread=.055*(1-j/17);
      flower.scale(.042-j*.0015,.044,.039-j*.0012);
      flower.translate(x+Math.cos(angle)*spread,h-.3+j*.028,z+Math.sin(angle)*spread);
      tint(flower,j%2?0xa998bc:0x8476a1);
    }
    for(const side of [-1,1]) {
      const leaf=new THREE.OctahedronGeometry(1,0).scale(.035,.015,.21);
      leaf.rotateX(side*.35);leaf.rotateY(a);leaf.translate(x+Math.sin(a)*side*.09,.2,z+Math.cos(a)*side*.09);
      tint(leaf,0x647d48);
    }
  }
  const compatible=parts.map(g=>g.index?g.toNonIndexed():g);
  const geometry=mergeGeometries(compatible);new Set([...parts,...compatible]).forEach(g=>g.dispose());return geometry;
}

function workPaths():THREE.Mesh[] {
  // One shared triangulation, partitioned by destination. A fork must not be
  // two almost coplanar ribbons: that creates depth/colour shimmer as you walk.
  const buffers=EASTERN_WORK_PATHS.map(()=>({vertices:[] as number[],colors:[] as number[]}));
  const soil=new THREE.Color(0xaa9871),edge=new THREE.Color(0x7d8d49),color=new THREE.Color();
  const points=EASTERN_WORK_PATHS.flatMap(path=>path.points),step=.25;
  const minX=Math.floor(Math.min(...points.map(p=>p[0]))-2),maxX=Math.ceil(Math.max(...points.map(p=>p[0]))+2);
  const minZ=Math.floor(Math.min(...points.map(p=>p[1]))-2),maxZ=Math.ceil(Math.max(...points.map(p=>p[1]))+2);
  const ownerAt=(x:number,z:number)=>{
    let distance=Infinity,owner=0;
    EASTERN_WORK_PATHS.forEach((path,index)=>{
      for(let i=1;i<path.points.length;i++){
        const [ax,az]=path.points[i-1],[bx,bz]=path.points[i],dx=bx-ax,dz=bz-az;
        const t=THREE.MathUtils.clamp(((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz),0,1);
        const d=Math.hypot(x-ax-t*dx,z-az-t*dz);if(d<distance){distance=d;owner=index;}
      }
    });
    return {owner,distance};
  };
  for(let x=minX;x<maxX;x+=step)for(let z=minZ;z<maxZ;z+=step){
    if(easternWorkPathDistance(x+step/2,z+step/2)>1.4)continue;
    const triangles=[[[x,z],[x,z+step],[x+step,z]],[[x+step,z],[x,z+step],[x+step,z+step]]];
    for(const triangle of triangles){
      const cx=triangle.reduce((sum,p)=>sum+p[0],0)/3,cz=triangle.reduce((sum,p)=>sum+p[1],0)/3;
      const {owner,distance}=ownerAt(cx,cz);if(distance>1.18)continue;
      const buffer=buffers[owner];
      for(const [px,pz] of triangle){
        buffer.vertices.push(px,getTerrainHeight(px,pz)+.028,pz);
        color.copy(soil).lerp(edge,smoothstep(.6,1.08,easternWorkPathDistance(px,pz))*.95).multiplyScalar(.95+Math.sin(px*3.7+pz*2.1)*.025);
        buffer.colors.push(color.r,color.g,color.b);
      }
    }
  }
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:1});
  return buffers.map((buffer,i)=>{
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(buffer.vertices,3));
    geometry.setAttribute('color',new THREE.Float32BufferAttribute(buffer.colors,3));geometry.computeVertexNormals();
    const mesh=new THREE.Mesh(geometry,material);mesh.name=EASTERN_WORK_PATHS[i].name;mesh.receiveShadow=true;return mesh;
  });
}

export function createEasternGroundGardens(colliders:readonly Box2D[]) {
  const group=new THREE.Group();group.name='eastern-ground-gardens';
  group.add(...workPaths());
  // Interleaved islands: lower quality thins each destination, never erases a region.
  const islands=[
    [174,57,5,10],[188,-28,9,5],[223,69,5,17],[230,-55,5,13],
    [187,90,20,4],[205,-82,18,5],[170,79,4,11],[180,-55,4,16],
    [225,47,7,6],[228,-23,5,8],[211,90,12,5],[220,-72,8,5],
    [180,60,3,5],[198,-39,5,5],[212,58,3,6],[219,-60,4,6],
  ];
  const random=seededRandom(4302),dummy=new THREE.Object3D(),color=new THREE.Color();
  const leaves=new THREE.MeshStandardMaterial({color:0xffffff,map:createLeafTexture(),roughness:1,
    alphaTest:.42,alphaToCoverage:true,side:THREE.DoubleSide,emissive:0x203522,emissiveIntensity:.16});
  const shrubs=new THREE.InstancedMesh(shrubGeometry(),leaves,360);shrubs.name='eastern-understory-shrubs';
  const herbWind=windMaterial(0xffffff,.08);herbWind.material.vertexColors=true;
  const herbs=new THREE.InstancedMesh(herbGeometry(),herbWind.material,1100);herbs.name='eastern-flowering-herbs';
  const footprint=(geometry:THREE.BufferGeometry)=>{
    geometry.computeBoundingBox();const b=geometry.boundingBox!;
    return Math.max(Math.hypot(b.min.x,b.min.z),Math.hypot(b.max.x,b.max.z));
  };
  const plant=(mesh:THREE.InstancedMesh,max:number,large:boolean)=>{
    const radius=footprint(mesh.geometry),vertex=new THREE.Vector3(),positions=mesh.geometry.attributes.position;let placed=0;
    for(let i=0;i<max*7&&placed<max;i++) {
      const [cx,cz,rx,rz]=islands[i%islands.length],a=random()*Math.PI*2,r=Math.sqrt(random());
      const x=cx+Math.cos(a)*r*rx,z=cz+Math.sin(a)*r*rz,s=large?.85+random()*.65:.7+random()*.65,extent=radius*s;
      if(isPath(x,z,extent+.3)||easternWorkPathDistance(x,z)<1.25+extent)continue;
      if(colliders.some(b=>x>b.minX-extent-.2&&x<b.maxX+extent+.2&&z>b.minZ-extent-.2&&z<b.maxZ+extent+.2))continue;
      dummy.position.set(x,getTerrainHeight(x,z)-.025,z);dummy.rotation.set(0,a,0);dummy.scale.set(s,large?s*(.72+random()*.35):s,s);dummy.updateMatrix();
      if(large){
        // The lowest leaf is off-centre. Fit the real footprint on sloping ground,
        // not an invisible origin which can leave the whole clump in mid-air.
        let clearance=Infinity;
        for(let j=0;j<positions.count;j++){
          vertex.fromBufferAttribute(positions,j).applyMatrix4(dummy.matrix);
          clearance=Math.min(clearance,vertex.y-getTerrainHeight(vertex.x,vertex.z));
        }
        dummy.position.y-=clearance+.025;dummy.updateMatrix();
      }
      mesh.setMatrixAt(placed,dummy.matrix);
      mesh.setColorAt(placed++,large?color.setHex([0x687c44,0x78934f,0x526d44,0x819852][i%4]):color.setScalar(.88+random()*.16));
    }
    mesh.count=placed;mesh.castShadow=large;mesh.receiveShadow=true;group.add(mesh);return placed;
  };
  const shrubCount=plant(shrubs,360,true),herbCount=plant(herbs,1100,false);
  // Mulch follows the terrain triangle-by-triangle rather than hovering as flat discs.
  const mulchParts:THREE.BufferGeometry[]=[];
  for(const x of [174,184,203,216])for(const z of [48,65,81]) {
    if(isPath(x,z,2.45))continue;
    const ring=new THREE.RingGeometry(.18,2.3,40,6).rotateX(-Math.PI/2),p=ring.attributes.position,values:number[]=[];
    for(let i=0;i<p.count;i++) {
      const lx=p.getX(i),lz=p.getZ(i),r=Math.hypot(lx,lz),a=Math.atan2(lz,lx);
      const px=x+lx*(1+Math.sin(a*5)*.09),pz=z+lz*(1+Math.cos(a*3)*.1);
      p.setXYZ(i,px,getTerrainHeight(px,pz)+.014,pz);
      color.setHex(0x827051).lerp(new THREE.Color(0x7b8c46),smoothstep(1.1,2.3,r));values.push(color.r,color.g,color.b);
    }
    ring.setAttribute('color',new THREE.Float32BufferAttribute(values,3));ring.computeVertexNormals();mulchParts.push(ring);
  }
  const mulch=new THREE.Mesh(mergeGeometries(mulchParts),new THREE.MeshStandardMaterial({vertexColors:true,roughness:1}));
  mulch.name='orchard-root-mulch';mulch.receiveShadow=true;group.add(mulch);mulchParts.forEach(g=>g.dispose());
  return {group,update(time:number){herbWind.time.value=time;},setQuality(tier:QualityTier){
    const factor=tier==='high'?1:tier==='medium'?.7:.4;
    shrubs.count=Math.floor(shrubCount*factor);herbs.count=Math.floor(herbCount*factor);
  }};
}
