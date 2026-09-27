import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { PerspectiveCamera, Raycaster, Vector3 } from 'three';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const { createFestivalSquare } = await import('../src/world/regions/festivalSquare.ts');
const { getWalkHeight } = await import('../src/world/landscape.ts');
const { resolveSlopeMovement } = await import('../src/player/slopeMovement.ts');
const { WORLD } = await import('../src/world/config.ts');
const { createWorld } = await import('../src/world/createWorld.ts');
const { createPlayerController } = await import('../src/player/controller.ts');

test('rabbit visitors can leave the stage and ramp sideways without invisible walls at 30/60/120 FPS', () => {
  const {colliders}=createFestivalSquare();
  for(const fps of [30,60,120]) for(const [start, direction, distance] of [
    [{x:0,z:0},{x:1,z:0},11], [{x:0,z:0},{x:-1,z:0},11],
    [{x:2.5,z:0},{x:0,z:1},9], [{x:2.5,z:0},{x:0,z:-1},10],
    [{x:0,z:5.8},{x:1,z:0},8], [{x:0,z:5.8},{x:-1,z:0},5],
  ] as const) {
    let p={...start};
    const step=5.2/fps, frames=Math.ceil(distance/step);
    for(let i=0;i<frames;i++)p=resolveSlopeMovement(p,{x:p.x+direction.x*step,z:p.z+direction.z*step},.45,colliders,WORLD,getWalkHeight);
    assert.ok(Math.hypot(p.x-start.x,p.z-start.z)>=distance-.1,`blocked from ${JSON.stringify(start)} toward ${JSON.stringify(direction)} at ${JSON.stringify(p)}, ${fps}fps`);
  }
});

test('visible stage apron supports its walk height at all exit sides and ramp shoulders', () => {
  const {group}=createFestivalSquare();group.updateMatrixWorld(true);
  const stage=group.getObjectByName('celebration-bandstand')!;
  const ray=new Raycaster();
  for(const [x,z] of [[7,0],[-7,0],[2.5,3.5],[2.5,-7],[2.1,5.8],[-2.1,5.8],[8,1]]) {
    ray.set(new Vector3(x,5,z),new Vector3(0,-1,0));
    const hit=ray.intersectObject(stage,true)[0];
    assert.ok(hit,`no visible exit surface at ${x},${z}`);
    assert.ok(Math.abs(hit.point.y-getWalkHeight(x,z))<.035,`walk/render disagreement at ${x},${z}`);
  }
});

test('the real first-person controller leaves the rabbit stage against the complete world collider set',()=>{
  const previousDocument=globalThis.document;
  globalThis.document={createElement:()=>({width:0,height:0,getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
  const world=createWorld();
  try {
    for(const fps of [30,60,120])for(const [x,z,key,distance] of [
      // Pass south of the visible instrument cases at (+/-8.2, .3).
      [0,1.6,'KeyD',11],[0,1.6,'KeyA',11],
      [2.5,0,'KeyS',9],[2.5,0,'KeyW',10],
      [0,5.8,'KeyD',8],[0,5.8,'KeyA',5],
    ] as const){
      const view=new EventTarget();
      const doc=Object.assign(new EventTarget(),{defaultView:view,pointerLockElement:null,hidden:false});
      const surface=Object.assign(new EventTarget(),{ownerDocument:doc,getBoundingClientRect:()=>({left:0,top:0,width:800,height:600})});
      const camera=new PerspectiveCamera();
      const controller=createPlayerController({camera,domElement:surface,colliders:world.colliders,getGroundHeight:world.getGroundHeight});
      controller.reset({x,z,yaw:0});controller.lock();
      view.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code:key}));
      for(let frame=0;frame<Math.ceil(distance/(5.2/fps));frame++)controller.update(1/fps);
      assert.ok(Math.hypot(camera.position.x-x,camera.position.z-z)>=distance-.1,`full-world ${key} blocked at ${camera.position.toArray()}, ${fps}fps`);
      assert.ok(Math.abs(camera.position.y-world.getGroundHeight(camera.position.x,camera.position.z)-1.7)<1e-7,'visitor is not grounded');
      controller.dispose();
    }
  } finally {
    world.dispose();
    if(previousDocument)globalThis.document=previousDocument;else delete globalThis.document;
  }
});
