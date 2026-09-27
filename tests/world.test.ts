import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { Matrix4, Raycaster, Vector3 } from 'three';

// Match Vite's extensionless local TS imports without changing production source or adding a runner.
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { createStreamBridge } = await import('../src/world/regions/streamBridge.ts');
const { createTerrain } = await import('../src/world/terrain.ts');
const { createBandstand, createFlowerBridge } = await import('../src/entities/festivalLandmarks.ts');
const { createFoliage } = await import('../src/entities/foliage.ts');
const { createTreehouse } = await import('../src/entities/props.ts');
const { createFestivalSquare } = await import('../src/world/regions/festivalSquare.ts');
const { WATER_LEVEL, getWalkHeight, getTerrainHeight, isPath, riverBankDistance } = await import('../src/world/landscape.ts');
const { resolveMovement } = await import('../src/player/collisions.ts');
const { WORLD } = await import('../src/world/config.ts');

test('bridge occupants stand on the deck rather than the old riverbed', () => {
  const {group}=createStreamBridge();
  for(const role of ['提灯狐狸','青蛙魔术师']) {
    const actor=group.children.find(child=>child.userData.role===role)!;
    assert.ok(actor,role);
    assert.ok(Math.abs(actor.position.y-getWalkHeight(actor.position.x,actor.position.z))<.03,role);
  }
});

test('actual bridge colliders allow both directions and stop movement through the rail', () => {
  const terrain=createTerrain(),bridge=createStreamBridge();
  const colliders=[...terrain.colliders,...bridge.colliders];
  for(const direction of [-1,1]) {
    let current={x:direction>0?35:61,z:4};
    for(let i=0;i<260;i++)current=resolveMovement(current,{x:current.x+direction*.1,z:4},.45,colliders,WORLD);
    assert.ok(direction>0?current.x>60.9:current.x<35.1);
  }
  let current={x:48,z:4};
  for(let i=0;i<30;i++)current=resolveMovement(current,{x:48,z:current.z+.1},.45,colliders,WORLD);
  assert.ok(current.z<6);
});

test('stage ramp rendered surface matches the walking surface on all usable lanes', () => {
  const stage=createBandstand();stage.updateMatrixWorld(true);
  const ray=new Raycaster();
  for(const x of [-1.4,0,1.4]) for(const z of [2.2,2.4,3,4.5,6.5]) {
    ray.set(new Vector3(x,3,z),new Vector3(0,-1,0));
    const hit=ray.intersectObject(stage,true)[0];
    assert.ok(hit,`missing floor at ${x},${z}`);
    assert.ok(Math.abs(hit.point.y-getWalkHeight(x,z))<.04,`floor mismatch at ${x},${z}`);
  }
});

test('instanced plants keep the authored paths clear and reduce density in low quality', () => {
  const foliage=createFoliage();
  const grass=foliage.group.getObjectByName('wind-swept-meadow');
  const flowers=foliage.group.getObjectByName('clustered-wildflowers');
  const matrix=new Matrix4(),point=new Vector3();
  for(const plants of [grass,flowers]) {
    assert.ok(plants?.isInstancedMesh);
    for(let i=0;i<plants.count;i++) {
      plants.getMatrixAt(i,matrix);point.setFromMatrixPosition(matrix);
      assert.equal(isPath(point.x,point.z),false,`plant on path at ${point.x},${point.z}`);
    }
  }
  const high=grass.count;
  foliage.setQuality('low');
  assert.ok(grass.count>0 && grass.count<high);
  assert.ok(flowers.count>0);
});

test('ground and paths use consistent world-scale texture coordinates, with grit on dry trails', () => {
  const { group } = createTerrain();
  for (const name of ['sculpted-meadow-and-riverbed', 'celebration-clearing', 'winding-entry-path', 'stage-to-bridge-path']) {
    const surface = group.getObjectByName(name);
    assert.ok(surface?.material.map, `${name} lacks a surface texture`);
    const p = surface.geometry.attributes.position, uv = surface.geometry.attributes.uv;
    for (let i = 0; i < p.count; i += 3) {
      assert.ok(Math.abs(uv.getX(i) - p.getX(i) / 4) < 1e-5, `${name} texture stretching`);
      assert.ok(Math.abs(uv.getY(i) - p.getZ(i) / 4) < 1e-5);
    }
  }
  const grit = group.getObjectByName('trail-gravel');
  assert.ok(grit?.isInstancedMesh && grit.count > 0);
  const matrix = new Matrix4(), point = new Vector3();
  for (let i = 0; i < grit.count; i++) {
    grit.getMatrixAt(i, matrix); point.setFromMatrixPosition(matrix);
    assert.ok(isPath(point.x, point.z));
    assert.ok(riverBankDistance(point.x, point.z) > 1.55);
    assert.ok(Math.abs(point.y - getTerrainHeight(point.x, point.z) - 0.07) < 1e-5);
  }
});

test('rendered water depth follows the carved riverbed and bank plants are on the dry side', () => {
  const terrain = createTerrain().group;
  const water = terrain.getObjectByName('shallow-stream');
  const positions = water.geometry.attributes.position, depths = water.geometry.attributes.aDepth;
  let shallow = 0, deep = 0;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const expected = Math.max(0, -0.48 - getTerrainHeight(x, z));
    assert.ok(Math.abs(depths.getX(i) - expected) < 1e-5);
    if (depths.getX(i) < 0.1) shallow++;
    if (depths.getX(i) > 1) deep++;
  }
  assert.ok(shallow > 0 && deep > 0);
  const plants = createStreamBridge().group.getObjectByName('waterside-flowers');
  for (const plant of plants.children) assert.ok(riverBankDistance(plant.position.x, plant.position.z) > 0.99);
});

test('the windmill footprint remains above water when the river widens', () => {
  const mill = createStreamBridge().group.getObjectByName('windmill');
  assert.ok(mill);
  assert.ok(mill.position.y > WATER_LEVEL, 'the door sill must not be submerged');
  assert.ok(Math.abs(mill.position.y - getTerrainHeight(mill.position.x, mill.position.z)) < 1e-5);
  for (let i = 0; i < 24; i++) {
    const angle = i / 24 * Math.PI * 2;
    const x = mill.position.x + Math.cos(angle) * 1.25;
    const z = mill.position.z + Math.sin(angle) * 1.25;
    assert.ok(riverBankDistance(x, z) > 0, `windmill overlaps water at ${x},${z}`);
    assert.ok(getTerrainHeight(x, z) > WATER_LEVEL, `windmill footing is submerged at ${x},${z}`);
  }
});

test('bridge blossoms have petal silhouettes and matching instanced flower centres', () => {
  const group = createFlowerBridge();
  const petals = group.getObjectByName('bridge-petal-blossoms');
  const centres = group.getObjectByName('bridge-flower-centres');
  assert.ok(petals?.isInstancedMesh && centres?.isInstancedMesh);
  assert.equal(petals.count, centres.count);
  petals.geometry.computeBoundingBox();
  const size = petals.geometry.boundingBox.getSize(new Vector3());
  assert.ok(size.x > 0.4 && size.z > 0.4 && size.y < 0.15);
  const a = new Matrix4(), b = new Matrix4();
  for (let i = 0; i < petals.count; i++) {
    petals.getMatrixAt(i, a); centres.getMatrixAt(i, b);
    assert.ok(a.equals(b));
  }
});

test('tree crowns use cutout leaf silhouettes and quality tiers keep foliage visible', () => {
  const foliage = createFoliage();
  const leaves = foliage.group.getObjectByName('canopy-leaf-sprays');
  assert.ok(leaves?.isInstancedMesh && leaves.count > 1000);
  const pixels = leaves.material.map?.image.data;
  assert.ok(pixels && leaves.material.alphaTest > 0);
  let clear = 0, opaque = 0;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] < 10) clear++;
    if (pixels[i] > 240) opaque++;
  }
  assert.ok(clear > 100 && opaque > 100, 'leaves must be cut out, not solid billboard rectangles');
  const grass = foliage.group.getObjectByName('wind-swept-meadow');
  assert.ok(grass.geometry.attributes.position.count > 12, 'segmented blades must bend rather than shear a single triangle');
  leaves.computeBoundingBox();
  const highBounds = leaves.boundingBox.clone(), highLeaves = leaves.count;
  foliage.setQuality('low');
  assert.ok(grass.count >= 6500 && leaves.count > 1000);
  assert.ok(leaves.count < highLeaves, 'low quality must reduce alpha-tested leaf overdraw');
  leaves.computeBoundingBox();
  for (const axis of ['x', 'z']) {
    assert.ok(Math.abs(highBounds.min[axis] - leaves.boundingBox.min[axis]) < 3);
    assert.ok(Math.abs(highBounds.max[axis] - leaves.boundingBox.max[axis]) < 3, 'LOD must retain trees throughout the world');
  }
});

test('timber landmarks include structural supports without moving their authored floors', () => {
  const treehouse = createTreehouse({ trunkHeight: 9.5 });
  const braces = treehouse.getObjectByName('treehouse-braces');
  const railing = treehouse.getObjectByName('treehouse-balustrade');
  assert.ok(braces && railing, 'treehouse needs support framing and a guarded platform');
  assert.ok(treehouse.getObjectByName('treehouse-living-canopy'));
  const square = createFestivalSquare().group;
  const stall = square.getObjectByName('flower-stall');
  const posts = stall.getObjectByName('stall-support-posts');
  assert.equal(posts?.children.length, 4, 'the canopy must be supported on all four corners');
  const seats = square.getObjectsByProperty('name', 'chair');
  assert.ok(seats.length > 0 && seats.every(seat => seat.children.length === 4), 'stools should have a seat and three legs, not solid cubes');
});
