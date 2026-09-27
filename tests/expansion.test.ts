import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { Raycaster, Vector3 } from 'three';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { createWorld } = await import('../src/world/createWorld.ts');
const { WORLD, REGIONS } = await import('../src/world/config.ts');
const landscape = await import('../src/world/landscape.ts');
const { resolveMovement, circleIntersectsAabb } = await import('../src/player/collisions.ts');

// Only the browser's 2D sprite painter is replaced; all scene geometry/collision code is real.
const previousDocument = globalThis.document;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  return { width: 0, height: 0, getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: null
  }) };
} };
test.after(() => { if (previousDocument) globalThis.document=previousDocument; else delete globalThis.document; });

test('new destinations have rendered walkable ground beyond the old world boundary', () => {
  const world = createWorld(); world.scene.updateMatrixWorld(true);
  const ground = ['sculpted-meadow-and-riverbed','highland-mountain-ground'].map(name=>world.scene.getObjectByName(name)!);
  assert.ok(ground.every(Boolean));
  const ray = new Raycaster();
  for (const [x, z] of [[-112, 4], [104, -48], [22, -108], [-28, 96], [-145, -125], [145, 125]]) {
    const p = resolveMovement({ x, z }, { x, z }, .45, [], WORLD);
    assert.deepEqual(p, { x, z }, 'a destination is clamped back into the old world');
    ray.set(new Vector3(x, 100, z), new Vector3(0, -1, 0));
    const hit = ray.intersectObjects(ground)[0];
    assert.ok(hit, `missing terrain at ${x},${z}`);
    assert.ok(Math.abs(hit.point.y - world.getGroundHeight(x,z)) < .2);
  }
  world.dispose();
});

test('both outer river crossings have continuous walking surfaces and passable colliders', () => {
  const world = createWorld();
  for (const z of [-74, 88]) {
    const center = landscape.riverCenter(z);
    let p = { x: center - 15, z }, previous = world.getGroundHeight(p.x,z);
    for (let i=0;i<600;i++) {
      p = resolveMovement(p, {x:p.x+.05,z}, .45, world.colliders, WORLD);
      const y = world.getGroundHeight(p.x,z);
      assert.ok(Math.abs(y-previous) < .09, `crossing step at ${p.x},${z}`);
      if(Math.abs(p.x-center)<6) assert.ok(y > landscape.WATER_LEVEL+.5, 'player sinks below deck');
      previous=y;
    }
    assert.ok(p.x > center+14.8, `crossing blocked at ${p.x},${z}`);
  }
  world.dispose();
});

test('outer settlements are connected by clear trails with discoverable region names', () => {
  for (const [x,z] of [[-112,4], [104,-48], [22,-108], [-28,96]]) {
    assert.ok(landscape.isPath(x,z), `no trail at destination ${x},${z}`);
    assert.ok(REGIONS.some(r => Math.hypot(r.x-x,r.z-z)<r.radius), 'destination has no region feedback');
  }
  const world=createWorld();
  for (const name of ['region:lantern-hamlet','region:canopy-village','region:headwater-falls','region:firefly-garden']) {
    const area=world.scene.getObjectByName(name);
    assert.ok(area && area.children.length>1, `missing built destination ${name}`);
  }
  world.dispose();
});

test('sun shadows follow a first-person visitor into the expanded regions without changing light direction', () => {
  const world=createWorld();
  assert.equal(typeof world.updateView,'function');
  const sun=world.scene.children.find(object=>object.isDirectionalLight && object.castShadow);
  const direction=sun.position.clone().sub(sun.target.position);
  world.updateView(new Vector3(110,5,-80));
  assert.ok(Math.hypot(sun.target.position.x-110,sun.target.position.z+80)<2);
  assert.ok(Math.abs(sun.target.position.y-(5+world.getGroundHeight(110,-80))/2)<=.5);
  assert.ok(sun.position.clone().sub(sun.target.position).distanceTo(direction)<1e-6);
  world.dispose();
});

test('each authored forest trail can be walked end to end without hitting decorative landmarks', () => {
  const world=createWorld();
  const blocked:string[]=[];
  for(const trail of landscape.FOREST_TRAILS) {
    let p={x:trail.points[0][0],z:trail.points[0][1]};
    for(let i=1;i<trail.points.length;i++) {
      const [x,z]=trail.points[i],distance=Math.hypot(x-p.x,z-p.z),steps=Math.ceil(distance/.08),dx=(x-p.x)/steps,dz=(z-p.z)/steps;
      for(let j=0;j<steps;j++)p=resolveMovement(p,{x:p.x+dx,z:p.z+dz},.45,world.colliders,WORLD);
      if(Math.hypot(p.x-x,p.z-z)>=.15){blocked.push(`${trail.name} blocked before ${x},${z}: ${p.x},${p.z}`);break;}
    }
  }
  world.dispose();
  assert.deepEqual(blocked,[]);
});

test('headwater falls discharge into a continuous carved channel instead of dry ground', () => {
  for(const [x,z] of [[35,-116],[35,-112],[39,-108],[45,-105],[49,-103]]) {
    assert.ok(landscape.getTerrainHeight(x,z)<landscape.WATER_LEVEL,`dry waterfall bed at ${x},${z}`);
  }
  const world=createWorld();world.scene.updateMatrixWorld(true);
  const water=world.scene.getObjectByName('headwater-channel');assert.ok(water);
  const ray=new Raycaster();
  for(const [x,z] of [[35,-114],[39,-108],[45,-105]]) {
    ray.set(new Vector3(x,20,z),new Vector3(0,-1,0));
    assert.ok(ray.intersectObject(water).length,`missing channel water at ${x},${z}`);
  }
  world.dispose();
});

test('the curved headwater banks stop walkers before they enter the underwater bed', () => {
  const world=createWorld();
  for(const z of [-114,-110,-108,-105]) {
    let p={x:24,z};
    for(let step=0;step<480;step++) {
      p=resolveMovement(p,{x:p.x+.05,z},.45,world.colliders,WORLD);
      assert.ok(world.getGroundHeight(p.x,z)>=landscape.WATER_LEVEL,`underwater walk at ${p.x},${z}`);
    }
  }
  const uncovered:string[]=[];
  for(let x=28;x<=52;x+=.5)for(let z=-124;z<=-103;z+=.5) {
    if(landscape.getTerrainHeight(x,z)<landscape.WATER_LEVEL-.2 &&
       !world.colliders.some(box=>circleIntersectsAabb({x,z},.45,box))) uncovered.push(`${x},${z}`);
  }
  world.dispose();
  assert.deepEqual(uncovered,[], 'wet tributary cells must not have walk-through gaps');
});

test('trail marker geometry stays outside the whole walking corridor, including horizontal trails', () => {
  const world=createWorld();world.scene.updateMatrixWorld(true);
  const markers=world.scene.getObjectByName('forest-trail-markers');assert.ok(markers);
  const ray=new Raycaster(new Vector3(),new Vector3(1,0,0),0,6);
  for(const [x,z] of [[-29,12],[27,-74],[28,88]]) {
    ray.set(new Vector3(x,landscape.getTerrainHeight(x,z)+1.4,z),new Vector3(1,0,0));
    assert.equal(ray.intersectObject(markers,true).length,0,`sign across trail at ${x},${z}`);
  }
  world.dispose();
});

test('firefly garden has local animated lights at every quality tier and releases its sprite', () => {
  const world=createWorld();
  const lights=world.scene.getObjectByName('garden-fireflies');assert.ok(lights?.isPoints,'garden has no fireflies');
  const positions=lights.geometry.attributes.position;
  const before=positions.array.slice();
  for(let i=0;i<positions.count;i++) {
    assert.ok(Math.hypot(positions.getX(i)+28,positions.getZ(i)-96)<25,'light outside garden');
    assert.ok(positions.getY(i)>landscape.getTerrainHeight(positions.getX(i),positions.getZ(i)),'buried light');
  }
  world.animations.forEach(update=>update(2));
  assert.notDeepEqual(positions.array,before,'garden lights do not animate');
  world.setQuality('low');const low=lights.geometry.drawRange.count;
  world.setQuality('high');assert.ok(low>0 && low<lights.geometry.drawRange.count,'quality tier drops the whole garden or does not scale');
  let disposed=false;lights.material.uniforms.uSprite.value.addEventListener('dispose',()=>{disposed=true;});
  world.dispose();assert.equal(disposed,true,'sprite texture was not released');
});
