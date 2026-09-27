import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { PerspectiveCamera,Vector3 } from 'three';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {createWorld}=await import('../src/world/createWorld.ts');
const originalDocument=globalThis.document;
globalThis.document={createElement:()=>({getContext:()=>({createRadialGradient:()=>({addColorStop(){}}),fillRect(){}})})};
test.after(()=>{if(originalDocument)globalThis.document=originalDocument;else delete globalThis.document;});

test('each region has a real reusable scene interaction rather than a text-only popup',()=>{
  const world=createWorld();
  assert.ok(Array.isArray(world.interactions)&&world.interactions.length>=11,'no in-world interaction targets');
  for(const kind of ['lantern','butterflies','chime']) {
    const target=world.interactions.find(t=>t.kind===kind)!;assert.ok(target,kind);
    const root=world.scene.getObjectByName(`interaction:${target.id}`)!;assert.ok(root);
    const state=()=>{const values:unknown[]=[];root.traverse(o=>values.push([o.position.toArray(),o.quaternion.toArray(),o.visible,o.material?.emissiveIntensity,o.intensity]));return JSON.stringify(values);};
    const before=state();const childCount=root.children.length;
    target.trigger(1);target.update(1.3);
    assert.notEqual(state(),before,`${kind} produces no actual object change`);
    for(let i=0;i<50;i++)target.trigger(i+2);
    assert.equal(root.children.length,childCount,'retrigger keeps allocating scene objects');
  }
  world.dispose();
});

test('interaction input requires active, in-range forward view; ignores repeats and disposes listeners',async()=>{
  const world=createWorld();assert.ok(world.interactions,'world does not expose interactions');
  const {createInteractionController}=await import('../src/player/interactionController.ts');
  const target=world.interactions.find(t=>t.kind==='lantern')!;
  const camera=new PerspectiveCamera(),events=new EventTarget(),canvas=new EventTarget();
  let active=false,time=0,label='',messages:string[]=[];
  camera.position.copy(target.position).add(new Vector3(0,0,2));camera.lookAt(target.position);
  const controls=createInteractionController({camera,targets:[target],colliders:[],events,canvas,isActive:()=>active,
    onFocus:t=>{label=t?.label??'';},onResult:message=>messages.push(message),playChime:()=>{}});
  const key=(repeat=false)=>events.dispatchEvent(Object.assign(new Event('keydown',{cancelable:true}),{code:'KeyE',repeat}));
  controls.update(time);key();assert.equal(messages.length,0);
  active=true;controls.update(time);assert.ok(label);key();assert.equal(messages.length,1);
  key();assert.equal(messages.length,1,'no cooldown');
  controls.update(time=1);key(true);assert.equal(messages.length,1,'held key retriggers');
  camera.rotation.y+=Math.PI;controls.update(time=2);key();assert.equal(messages.length,1,'behind-camera activation');
  camera.position.z+=20;camera.lookAt(target.position);controls.update(time=3);key();assert.equal(messages.length,1,'remote activation');
  camera.position.copy(target.position).add(new Vector3(0,0,2));camera.lookAt(target.position);controls.update(time=4);
  controls.dispose();key();assert.equal(messages.length,1,'listeners survive disposal');world.dispose();
});

test('nearby interaction cannot be activated across a static obstacle',async()=>{
  const world=createWorld();assert.ok(world.interactions,'world does not expose interactions');
  const {createInteractionController}=await import('../src/player/interactionController.ts');
  const target=world.interactions[0],camera=new PerspectiveCamera(),events=new EventTarget(),canvas=new EventTarget();
  camera.position.copy(target.position).add(new Vector3(0,0,3));camera.lookAt(target.position);
  let focused=false;
  const x=target.position.x,z=target.position.z;
  const controls=createInteractionController({camera,targets:[target],colliders:[{minX:x-1,maxX:x+1,minZ:z+1,maxZ:z+1.4}],events,canvas,isActive:()=>true,
    onFocus:t=>{focused=Boolean(t);},onResult:()=>assert.fail('activated through blocker'),playChime:()=>{}});
  controls.update(0);assert.equal(focused,false);events.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyE'}));controls.dispose();world.dispose();
});
