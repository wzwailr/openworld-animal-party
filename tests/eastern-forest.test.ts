import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { Raycaster, Vector3 } from 'three';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {createWorld}=await import('../src/world/createWorld.ts');
const {WORLD,REGIONS}=await import('../src/world/config.ts');
const {resolveSlopeMovement}=await import('../src/player/slopeMovement.ts');
const {resolveMovement}=await import('../src/player/collisions.ts');
const originalDocument=globalThis.document;
globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
test.after(()=>{if(originalDocument)globalThis.document=originalDocument;else delete globalThis.document;});

test('eastern destinations remain inside walking bounds and have rendered ground at old/new seams',()=>{
  const world=createWorld();world.scene.updateMatrixWorld(true);
  const terrain=world.scene.getObjectByName('terrain')!;
  const ray=new Raycaster();
  for(const [x,z] of [[193,58],[210,-42],[245,120],[180,20],[180,-180],[245,-275]]) {
    assert.deepEqual(resolveMovement({x,z},{x,z},.45,[],WORLD),{x,z},'new destination clamped to old map');
    ray.set(new Vector3(x,200,z),new Vector3(0,-1,0));
    const hits=ray.intersectObject(terrain,true).filter(hit=>['sculpted-meadow-and-riverbed','highland-mountain-ground','eastern-forest-ground'].includes(hit.object.name));
    assert.ok(hits.length,`no terrain at ${x},${z}`);
    assert.ok(Math.abs(hits[0].point.y-world.getGroundHeight(x,z))<.1,`ground mismatch at ${x},${z}`);
  }
  world.dispose();
});

test('orchard and windmill are separate activity spaces with quality-scaled planting and an animated landmark',()=>{
  const world=createWorld();
  for(const name of ['region:orchard','region:windmill-meadow']){
    const region=world.scene.getObjectByName(name);
    assert.ok(region && region.children.length>=3,`missing independent region ${name}`);
  }
  for(const [x,z] of [[193,58],[210,-42]])assert.ok(REGIONS.some(r=>Math.hypot(r.x-x,r.z-z)<r.radius),'region lacks feedback');
  const rotor=world.scene.getObjectByName('eastern-windmill-sails')!;
  assert.ok(rotor,'no working windmill');const before=rotor.quaternion.clone();
  world.animations.forEach(fn=>fn(2));assert.ok(before.angleTo(rotor.quaternion)>.01);
  const flowers=world.scene.getObjectByName('eastern-meadow-flowers');assert.ok(flowers?.isInstancedMesh);
  const high=flowers.count;world.setQuality('low');assert.ok(flowers.count>0&&flowers.count<high);
  world.dispose();
});

test('east loop is traversable in both directions on centre and side lanes with rendered path support',async()=>{
  const world=createWorld();
  assert.ok(world.scene.getObjectByName('region:orchard'),'eastern routes not built');
  const {EASTERN_TRAILS}=await import('../src/world/easternForestLayout.ts');
  world.scene.updateMatrixWorld(true);const ray=new Raycaster();
  for(const trail of EASTERN_TRAILS)for(const reverse of [false,true])for(const side of [-1.2,0,1.2]) {
    const points=reverse?[...trail.points].reverse():trail.points;
    for(let i=1;i<points.length;i++) {
      const [ax,az]=points[i-1],[bx,bz]=points[i],length=Math.hypot(bx-ax,bz-az),nx=-(bz-az)/length,nz=(bx-ax)/length;
      let p={x:ax+nx*side,z:az+nz*side};const steps=Math.ceil(length/.12),dx=(bx-ax)/steps,dz=(bz-az)/steps;
      for(let j=0;j<steps;j++)p=resolveSlopeMovement(p,{x:p.x+dx,z:p.z+dz},.45,world.colliders,WORLD,world.getGroundHeight);
      assert.ok(Math.hypot(p.x-bx-nx*side,p.z-bz-nz*side)<.15,`${trail.name} reverse=${reverse} segment=${i} lane=${side}: ${JSON.stringify(p)}, target ${bx+nx*side},${bz+nz*side}`);
      const x=(ax+bx)/2+nx*side,z=(az+bz)/2+nz*side;
      ray.set(new Vector3(x,100,z),new Vector3(0,-1,0));
      const hit=ray.intersectObject(world.scene.getObjectByName(trail.name)!,true)[0];
      assert.ok(hit&&Math.abs(hit.point.y-world.getGroundHeight(x,z))<.1,'visible road does not support walk surface');
    }
  }
  world.dispose();
});
