import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?`${specifier}.ts`:specifier,context);}});
const landscape=await import('../src/world/landscape.ts');

// Catch missing river carving, non-finite terrain and discontinuous bridge approaches.
test('landscape provides finite terrain and a depressed stream bed', () => {
  assert.equal(typeof landscape.getTerrainHeight, 'function');
  for (let x = -80; x <= 80; x += 5) for (let z = -70; z <= 70; z += 5) {
    assert.ok(Number.isFinite(landscape.getTerrainHeight(x, z)));
  }
  assert.ok(landscape.getTerrainHeight(48, 4) < -1);
  assert.ok(landscape.getTerrainHeight(37, 4) > 0);
});

test('walking follows the flower bridge above water with continuous approaches', () => {
  assert.equal(typeof landscape.getWalkHeight, 'function');
  let previous = landscape.getWalkHeight(36, 4);
  for (let x = 36.1; x <= 60; x += 0.1) {
    const height = landscape.getWalkHeight(x, 4);
    assert.ok(Math.abs(height - previous) < 0.12, `step at ${x}`);
    if (x > 41 && x < 55) assert.ok(height > 0.5);
    previous = height;
  }
  assert.ok(landscape.getWalkHeight(48, 4) > 1.4);
  assert.ok(landscape.getWalkHeight(48, 12) < -1);
});

test('paths remain clear through plaza, bridge and entrance', () => {
  assert.equal(typeof landscape.isPath, 'function');
  assert.ok(landscape.isPath(0, 15));
  assert.ok(landscape.isPath(30, 4));
  assert.ok(landscape.isPath(48, 4));
  assert.equal(landscape.isPath(-25, 30), false);
});

test('stage ramp joins the curved deck continuously across the usable width', () => {
  for (const x of [-1.4, -0.7, 0, 0.7, 1.4]) {
    let previous = landscape.getWalkHeight(x, 1.8);
    for(let z=1.82;z<=7;z+=.02) {
      const next=landscape.getWalkHeight(x,z);
      assert.ok(Math.abs(next-previous)<.03, `ramp step at ${x}, ${z}: ${previous} -> ${next}`);
      previous=next;
    }
  }
});

test('water edge meets the terrain rather than exposing a dry submerged strip', () => {
  for (const z of [-50, -20, 4, 25, 50]) {
    const center=landscape.riverCenter(z);
    for(const side of [-1,1]) {
      assert.ok(landscape.getTerrainHeight(center+side*landscape.riverHalfWidth(z,side),z) > landscape.WATER_LEVEL, `water too narrow at ${z}`);
    }
  }
});

test('river banks vary asymmetrically away from the bridge while keeping its crossing unchanged', () => {
  assert.equal(typeof landscape.riverHalfWidth, 'function');
  for (const side of [-1,1]) {
    for (const z of [1.7,4,6.3]) assert.equal(landscape.riverHalfWidth(z,side),7.75);
    for(let z=-70;z<=70;z+=.5) {
      const width=landscape.riverHalfWidth(z,side);
      assert.ok(width>6 && width<12);
      assert.ok(Math.abs(width-landscape.riverHalfWidth(z+.5,side))<.3);
    }
  }
  assert.ok(Math.abs(landscape.riverHalfWidth(-25,-1)-landscape.riverHalfWidth(-25,1))>2);
});
