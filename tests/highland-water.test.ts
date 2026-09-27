import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { Box3, FogExp2, Raycaster, SRGBColorSpace, Vector3 } from 'three';
import { WebGLMaterials } from 'three/src/renderers/webgl/WebGLMaterials.js';

registerHooks({resolve(specifier,context,nextResolve){
  return nextResolve(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?`${specifier}.ts`:specifier,context);
}});
const { VALLEY_WATER, VALLEY_TRAIL, valleyWaterHeight }=await import('../src/world/highlandValleyLayout.ts');
const { getTerrainHeight }=await import('../src/world/landscape.ts');
const { circleIntersectsAabb }=await import('../src/player/collisions.ts');
const source=new URL('../src/world/regions/highlandValley.ts',import.meta.url);
async function build(){
  assert.ok(existsSync(source),'the profiled valley water has not been built');
  const {createHighlandValley}=await import(source.href);
  const result=createHighlandValley();result.group.updateMatrixWorld(true);return result;
}

test('main waterfall has actual thickness and its full 65m profile rather than a plane',async()=>{
  const {group}=await build(),fall=group.getObjectByName('main-fall-volume');
  assert.ok(fall);
  const bounds=new Box3().setFromObject(fall);
  assert.ok(bounds.max.y-bounds.min.y>=65,'fall does not span the shared upper and lower water levels');
  const ray=new Raycaster(new Vector3(40.5,47.5,-160),new Vector3(0,0,-1),0,40);
  const hits=ray.intersectObject(fall,true);
  assert.ok(hits.length>=2,'no front and rear water surfaces at the middle of the fall');
  assert.ok(hits.at(-1)!.point.distanceTo(hits[0].point)>.55,'waterfall is effectively a thin card');
});

test('fall meshes upload nonzero motion vectors while shared upper and lower seams remain fixed',async()=>{
  const {group}=await build(),fall=group.getObjectByName('main-fall-volume');
  const position=fall.geometry.attributes.position,motion=fall.geometry.attributes.aMotion;
  assert.ok(motion&&motion.itemSize===4,'the shader motion attribute was never uploaded');
  assert.equal(motion.count,position.count,'some fall vertices have no motion input');
  let moving=0,fixedTop=0;
  for(let i=0;i<motion.count;i++) {
    const amplitude=motion.getW(i);
    if(amplitude>.1) {
      moving++;
      assert.ok(Math.abs(Math.hypot(motion.getX(i),motion.getY(i),motion.getZ(i))-1)<1e-5,'motion has no valid displacement direction');
    }
    if(Math.abs(position.getY(i)-80)<.001){assert.ok(Math.abs(amplitude)<1e-5,'upper water join oscillates open');fixedTop++;}
    if(Math.abs(position.getY(i)-15)<.001)assert.ok(Math.abs(amplitude)<1e-5,'lower water join oscillates open');
  }
  assert.ok(moving>position.count*.3,'most of the fall cannot move');
  assert.ok(fixedTop>=20,'shared upper edge has no fixed vertices');
});

test('rendered channel covers every shared profile segment and joins at the correct local elevation',async()=>{
  const {group}=await build(),water=group.getObjectByName('headwater-channel');assert.ok(water);
  const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
  for(let i=1;i<VALLEY_WATER.length;i++) {
    const a=VALLEY_WATER[i-1],b=VALLEY_WATER[i];
    for(const t of [0,.01,.3,.7,.99,1]) {
      const x=a[0]+(b[0]-a[0])*t,y=a[1]+(b[1]-a[1])*t,z=a[2]+(b[2]-a[2])*t;
      ray.set(new Vector3(x,y+4,z),new Vector3(0,-1,0));
      const hit=ray.intersectObject(water,true)[0];
      assert.ok(hit,`dry seam at segment ${i}, ${t}`);
      assert.ok(Math.abs(hit.point.y-y)<.15,`wrong local water level at segment ${i}, ${t}: ${hit.point.y} vs ${y}`);
    }
  }
  // The height-field source bed has a rounded cap before the first centre-line
  // knot; water must cover that cap rather than expose submerged dry ground.
  ray.set(new Vector3(40,84,-228),new Vector3(0,-1,0));
  const sourceHit=ray.intersectObject(water,true)[0];
  assert.ok(sourceHit&&Math.abs(sourceHit.point.y-80)<.1,'rounded source pool has a dry upstream cap');
});

test('wet cells use local water levels while the entire 2.4m mountain trail stays clear',async()=>{
  const {colliders}=await build();
  for(const [x,z] of [[47,-108],[49,-107.5],[51.5,-106],[52,-105.5]])
    assert.ok(colliders.some(b=>circleIntersectsAabb({x,z},.45,b)),`original river join leaks at ${x},${z}`);
  for(let x=25;x<=59;x+=1)for(let z=-229;z<=-103;z+=1) {
    const y=valleyWaterHeight(x,z);
    if(y!==null&&getTerrainHeight(x,z)<y-.3)
      assert.ok(colliders.some(b=>circleIntersectsAabb({x,z},.45,b)),`wet cell not protected at ${x},${z}, water=${y}`);
  }
  for(let i=1;i<VALLEY_TRAIL.length;i++) {
    const a=VALLEY_TRAIL[i-1],b=VALLEY_TRAIL[i],dx=b[0]-a[0],dz=b[2]-a[2],length=Math.hypot(dx,dz);
    for(let d=0;d<=length;d+=.3)for(const side of [-1.2,0,1.2]) {
      const x=a[0]+dx*d/length-dz/length*side,z=a[2]+dz*d/length+dx/length*side;
      assert.ok(!colliders.some(box=>circleIntersectsAabb({x,z},.45,box)),`trail blocked at ${x},${z}`);
    }
  }
});

test('spray moves and low quality preserves the full water route with fewer particles',async()=>{
  const result=await build(),spray=result.group.getObjectByName('valley-impact-spray');assert.ok(spray?.isPoints);
  const before=spray.geometry.attributes.position.array.slice();
  result.animations.forEach(update=>update(2));
  assert.notDeepEqual(spray.geometry.attributes.position.array,before,'spray particles are frozen');
  result.setQuality('low');const low=spray.geometry.drawRange.count;
  assert.ok(low>0,'low quality removes all impact spray');
  const water=result.group.getObjectByName('headwater-channel');assert.ok(water?.visible);
  result.setQuality('high');assert.ok(spray.geometry.drawRange.count>low,'quality has no particle budget effect');
  const trees=result.group.getObjectByName('valley-tree-trunks');assert.ok(trees?.isInstancedMesh&&trees.count>=30,'northern valley has no wooded context');
});

test('three impacts have bounded, bank-clipped foam surfaces with the shared water clock',async()=>{
  const result=await build();
  const foam=result.group.getObjectByName('valley-impact-foam');
  assert.ok(foam,'fall impacts have spray but no surface turbulence');
  assert.equal(foam.children.length,3,'all three drops need distinct contact foam');
  for(const mesh of foam.children) {
    assert.ok(mesh.geometry.attributes.position.count>100,'foam footprint has no usable surface');
    const p=mesh.geometry.attributes.position;
    for(let i=0;i<p.count;i++) {
      const x=p.getX(i),z=p.getZ(i),level=valleyWaterHeight(x,z);
      assert.ok(level!==null&&getTerrainHeight(x,z)<level,'foam extends onto a dry bank');
      assert.ok(Math.abs(p.getY(i)-level-.035)<.002,'foam does not follow its local reach');
    }
    assert.equal(mesh.material.depthWrite,false,'transparent foam occludes other water');
  }
  result.animations.forEach(update=>update(7));
  for(const mesh of foam.children)assert.equal(mesh.material.uniforms.uTime.value,7);
  result.setQuality('low');assert.ok(foam.visible,'low quality loses water contact');
});

test('impact foam does not bridge the sloping fall-to-pool transition above or below actual water',async()=>{
  const {group}=await build(),foam=group.getObjectByName('valley-impact-foam')!,water=group.getObjectByName('headwater-channel')!;
  const ray=new Raycaster(new Vector3(),new Vector3(0,-1,0));
  for(const [x,z] of [[44.705,-172.595],[41.7,-134.08],[36.35,-118.695]]) {
    ray.set(new Vector3(x,85,z),new Vector3(0,-1,0));
    const f=ray.intersectObject(foam,true)[0],w=ray.intersectObject(water,true)[0];
    if(f){assert.ok(w,'foam without water');assert.ok(Math.abs(f.point.y-w.point.y-.035)<.06,`foam crosses water transition at ${x},${z}`);}
  }
});

test('custom valley shaders accept the renderer fog refresh and keep their shared animation clock',async()=>{
  const result=await build(),fog=new FogExp2(0xb9b79a,.0038);
  // Exercise Three's real refresh path; only the target query needs no GPU here.
  const refresher=WebGLMaterials({getRenderTarget:()=>null,outputColorSpace:SRGBColorSpace},null);
  const materials=new Set();result.group.traverse(object=>{
    if(object.material?.isShaderMaterial&&object.material.fog)materials.add(object.material);
  });
  assert.ok(materials.size>=4);
  for(const material of materials) {
    assert.doesNotThrow(()=>refresher.refreshFogUniforms(material.uniforms,fog),'fog uniforms crash first renderer refresh');
    assert.equal(material.uniforms.fogDensity.value,.0038);
  }
  result.animations.forEach(update=>update(3.75));
  for(const material of materials)assert.equal(material.uniforms.uTime.value,3.75,'merging fog uniforms disconnected animation time');
});

test('the original river participates in world fog and keeps its animated shallow-water surface',async()=>{
  const {createWater}=await import('../src/effects/water.ts');
  const river=createWater(),material=river.material;
  assert.equal(material.fog,true,'the original river ignores aerial perspective at the valley join');
  const refresher=WebGLMaterials({getRenderTarget:()=>null,outputColorSpace:SRGBColorSpace},null);
  refresher.refreshFogUniforms(material.uniforms,new FogExp2(0xb6ccc4,.0032));
  river.userData.update(2.5);
  assert.equal(material.uniforms.uTime.value,2.5);
  assert.equal(material.uniforms.fogDensity.value,.0032);
});

test('legacy random tree footprints avoid the new valley water and steep northern terrain',async()=>{
  const {createFoliage}=await import('../src/entities/foliage.ts');
  const {colliders}=createFoliage();let checked=0;
  for(const box of colliders) {
    const x=(box.minX+box.maxX)/2,z=(box.minZ+box.maxZ)/2;if(z>=-108)continue;
    checked++;
    const water=valleyWaterHeight(x,z);
    assert.ok(water===null||getTerrainHeight(x,z)>water+.5,`tree grows in highland water at ${x},${z}`);
    const slope=Math.hypot(getTerrainHeight(x+.7,z)-getTerrainHeight(x-.7,z),getTerrainHeight(x,z+.7)-getTerrainHeight(x,z-.7))/1.4;
    assert.ok(slope<=.58,`tree grows on a ${Math.atan(slope)*180/Math.PI} degree northern cliff at ${x},${z}`);
  }
  assert.ok(checked>0,'northern woodland was removed instead of filtered');
});
