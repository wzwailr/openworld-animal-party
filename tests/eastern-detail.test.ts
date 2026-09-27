import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { Box3, Matrix4, Raycaster, Vector3 } from 'three';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {createEasternForest}=await import('../src/world/regions/easternForest.ts');
const {getTerrainHeight,isPath}=await import('../src/world/landscape.ts');
const {resolveSlopeMovement}=await import('../src/player/slopeMovement.ts');
const {WORLD}=await import('../src/world/config.ts');

const workPaths=[
  {name:'orchard-work-path',points:[[193,58],[195,68],[189,73.5]]},
  {name:'orchard-picnic-path',points:[[195,68],[202,72],[207,73.5]]},
  {name:'mill-work-path',points:[[210,-42],[207,-47],[210,-50],[210,-53.3]]},
  {name:'mill-yard-path',points:[[207,-47],[201,-52],[197,-58]]},
];
function distanceToWorkPath(x:number,z:number){
  let d=Infinity;
  for(const {points} of workPaths)for(let i=1;i<points.length;i++){
    const [ax,az]=points[i-1],[bx,bz]=points[i],dx=bx-ax,dz=bz-az;
    const t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));
    d=Math.min(d,Math.hypot(x-ax-dx*t,z-az-dz*t));
  }
  return d;
}

test('work paths lead from the loop to the press, picnic and mill on supported walkable ground',()=>{
  const east=createEasternForest();east.group.updateMatrixWorld(true);const ray=new Raycaster();
  for(const {name,points} of workPaths){
    const path=east.group.getObjectByName(name);assert.ok(path,`missing work access: ${name}`);
    for(let i=1;i<points.length;i++){
      const [ax,az]=points[i-1],[bx,bz]=points[i],n=Math.ceil(Math.hypot(bx-ax,bz-az)/.1);
      const x=(ax+bx)/2,z=(az+bz)/2;
      ray.set(new Vector3(x,50,z),new Vector3(0,-1,0));
      const hit=ray.intersectObject(path,true)[0];
      assert.ok(hit&&Math.abs(hit.point.y-getTerrainHeight(x,z))<.06,'path floats above walk surface');
      const length=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/length,nz=(bx-ax)/length;
      for(const reverse of [false,true])for(const lane of [-.45,0,.45]){
        let p={x:(reverse?bx:ax)+nx*lane,z:(reverse?bz:az)+nz*lane};
        const dx=(reverse?ax-bx:bx-ax)/n,dz=(reverse?az-bz:bz-az)/n;
        for(let step=0;step<n;step++)p=resolveSlopeMovement(p,{x:p.x+dx,z:p.z+dz},.45,east.colliders,WORLD,getTerrainHeight);
        assert.ok(Math.hypot(p.x-(reverse?ax:bx)-nx*lane,p.z-(reverse?az:bz)-nz*lane)<.12,`${name} is blocked at segment ${i}, lane ${lane}`);
      }
    }
  }
});

test('work path corners have one supported surface, not overlapping strips that shimmer',()=>{
  const east=createEasternForest();east.group.updateMatrixWorld(true);
  const ray=new Raycaster(new Vector3(207.4,20,-46.8),new Vector3(0,-1,0));
  const hits=ray.intersectObject(east.group.getObjectByName('mill-work-path')!);
  assert.equal(hits.length,1,'overlapping coplanar strips at the mill approach corner');
});

test('forks share a single surface across both named paths, including their shoulders',()=>{
  const east=createEasternForest();east.group.updateMatrixWorld(true);const ray=new Raycaster();
  const paths=workPaths.map(p=>east.group.getObjectByName(p.name)!);
  for(const [cx,cz] of [[195,68],[207,-47]])for(let x=-.8;x<=.8;x+=.2)for(let z=-.8;z<=.8;z+=.2){
    const px=cx+x+.031,pz=cz+z+.023;
    ray.set(new Vector3(px,20,pz),new Vector3(0,-1,0));
    const hits=ray.intersectObjects(paths).length;
    assert.ok(hits<=1,`fork has overlapping surfaces at ${px},${pz}`);
    if(distanceToWorkPath(px,pz)<.95)assert.equal(hits,1,`fork core has a hole at ${px},${pz}`);
  }
});

test('new understory is grounded and keeps its full footprint out of trails and work areas at all quality tiers',()=>{
  const east=createEasternForest(),matrix=new Matrix4(),p=new Vector3(),scale=new Vector3();
  for(const tier of ['high','medium','low'] as const){
    east.setQuality(tier);
    for(const name of ['eastern-understory-shrubs','eastern-flowering-herbs']){
      const mesh=east.group.getObjectByName(name);assert.ok(mesh?.isInstancedMesh,`missing ${name}`);
      mesh.geometry.computeBoundingBox();const bounds=mesh.geometry.boundingBox as Box3;
      const radius=Math.max(...[bounds.min,bounds.max].map(v=>Math.hypot(v.x,v.z)));
      let north=0,south=0;
      for(let i=0;i<mesh.count;i++){
        mesh.getMatrixAt(i,matrix);p.setFromMatrixPosition(matrix);scale.setFromMatrixScale(matrix);
        const r=radius*Math.max(scale.x,scale.z);
        assert.ok(!isPath(p.x,p.z,r+.25),`${name} intrudes into main trail`);
        assert.ok(distanceToWorkPath(p.x,p.z)>1.2+r,`${name} covers work path`);
        assert.ok(!east.colliders.some(b=>p.x>b.minX-r-.15&&p.x<b.maxX+r+.15&&p.z>b.minZ-r-.15&&p.z<b.maxZ+r+.15),'plant intersects furniture');
        if(name==='eastern-flowering-herbs')assert.ok(Math.abs(p.y-getTerrainHeight(p.x,p.z))<.055,'herb stems float');
        if(p.z<0)north++;else south++;
      }
      assert.ok(north>20&&south>20,`${tier} dropped one destination's planting`);
    }
  }
});

test('shrub foliage itself meets the ground, not just its invisible instance origin',()=>{
  const east=createEasternForest(),shrubs=east.group.getObjectByName('eastern-understory-shrubs');
  const matrix=new Matrix4(),vertex=new Vector3(),position=shrubs.geometry.attributes.position;
  for(let i=0;i<shrubs.count;i++) {
    shrubs.getMatrixAt(i,matrix);let clearance=Infinity;
    for(let j=0;j<position.count;j++){
      vertex.fromBufferAttribute(position,j).applyMatrix4(matrix);
      clearance=Math.min(clearance,vertex.y-getTerrainHeight(vertex.x,vertex.z));
    }
    assert.ok(clearance<=.025&&clearance>-.12,`shrub ${i} visible-base clearance ${clearance}`);
  }
});

test('understory quality reduction is reversible and uses a bounded number of render batches',()=>{
  const east=createEasternForest(),detail=east.group.getObjectByName('eastern-ground-gardens');
  assert.ok(detail,'missing shared ground-layer builder');
  let batches=0,triangles=0;detail.traverse(o=>{if(o.isMesh){batches++;triangles+=(o.geometry.index?.count??o.geometry.attributes.position.count)/3*(o.isInstancedMesh?o.count:1);}});
  assert.ok(batches<=16,`too many new detail draw calls: ${batches}`);
  assert.ok(triangles<600000,`near-field planting costs ${triangles} triangles`);
  const shrubs=east.group.getObjectByName('eastern-understory-shrubs'),high=shrubs.count;
  east.setQuality('low');assert.ok(shrubs.count>0&&shrubs.count<high);
  east.setQuality('high');assert.equal(shrubs.count,high);
});

test('windmill masonry has continuous tileable surface relief rather than scattered boxes on a blank wall',()=>{
  const east=createEasternForest(),wall=east.group.getObjectByName('windmill-masonry');
  assert.ok(wall?.material.map&&wall.material.bumpMap,'missing masonry surface');
  const {data,width,height}=wall.material.map.image;let min=255,max=0,seam=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const v=data[(y*width+x)*4];min=Math.min(min,v);max=Math.max(max,v);
    if(x===0)seam=Math.max(seam,Math.abs(v-data[(y*width+width-1)*4]));
  }
  assert.ok(min>80&&max-min>20,'masonry contrast is clipped or blank');
  assert.ok(seam<18,`cylinder's closing seam has ${seam}-level discontinuity`);
});

test('eastern tree crowns are spatially batched and thin all cells instead of adding one draw call per lobe',()=>{
  const east=createEasternForest();let crownDraws=0,leaves=0;
  east.group.traverse(o=>{
    if(o.isInstancedMesh&&o.geometry.getAttribute('aCanopyNormal')){crownDraws++;leaves+=o.count;}
  });
  assert.ok(leaves>30000,'canopy was removed to meet draw budget');
  assert.ok(crownDraws<=36,`${crownDraws} separate tree-lobe batches`);
  const counts:number[]=[];
  east.group.traverse(o=>{if(o.isInstancedMesh&&o.geometry.getAttribute('aCanopyNormal'))counts.push(o.count);});
  east.setQuality('low');let index=0;
  east.group.traverse(o=>{
    if(o.isInstancedMesh&&o.geometry.getAttribute('aCanopyNormal')){
      assert.ok(o.count>0&&o.count<counts[index++],'quality did not reduce every canopy cell');
    }
  });
});

test('spatial crown batching preserves the leaf transforms, tint and shading normals',async()=>{
  const {batchLeafClusters}=await import('../src/world/regions/easternGroundGardens.ts');
  assert.equal(typeof batchLeafClusters,'function','missing spatial batching');
  const {createLeafCluster}=await import('../src/entities/foliage.ts');
  const {Group,Color}=await import('three');
  const root=new Group(),a=createLeafCluster(2.4,0x617a45,718),b=createLeafCluster(1.4,0x789a4f,992);
  a.position.set(10,3,15);b.position.set(16,5,13);root.add(a,b);root.updateMatrixWorld(true);
  const samples=[a,b].flatMap(source=>[0,71,179].map(index=>{
    const matrix=new Matrix4();source.getMatrixAt(index,matrix);matrix.premultiply(source.matrixWorld);
    const color=new Color();source.getColorAt(index,color);color.multiply(source.material.color);
    return {matrix,color,normal:new Vector3().fromBufferAttribute(source.geometry.getAttribute('aCanopyNormal'),index)};
  }));
  const result=batchLeafClusters([a,b]);
  for(const sample of samples){
    let found=false;
    for(const mesh of result.meshes)for(let i=0;i<mesh.count;i++){
      const matrix=new Matrix4();mesh.getMatrixAt(i,matrix);
      if(Math.abs(matrix.elements[12]-sample.matrix.elements[12])>1e-5)continue;
      assert.ok(matrix.elements.every((v,j)=>Math.abs(v-sample.matrix.elements[j])<1e-5),'leaf shape or placement changed');
      const color=new Color();mesh.getColorAt(i,color);
      assert.ok(color.toArray().every((v,j)=>Math.abs(v-sample.color.toArray()[j])<1e-6),'per-tree tint lost');
      assert.ok(new Vector3().fromBufferAttribute(mesh.geometry.getAttribute('aCanopyNormal'),i).distanceTo(sample.normal)<1e-6,'canopy normals lost');
      found=true;break;
    }
    assert.ok(found,'leaf vanished during batching');
  }
});
