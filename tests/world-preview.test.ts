import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { Raycaster, Vector3 } from 'three';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { VIEWS } = await import('../src/ui/worldPreview.ts');
const { getTerrainHeight } = await import('../src/world/landscape.ts');
const { createFoliage } = await import('../src/entities/foliage.ts');
const { createExpandedForest } = await import('../src/world/regions/expandedForest.ts');
const { createMushroomForest } = await import('../src/world/regions/mushroomForest.ts');

test('four forest-edge presets stay at standing eye height with clear actual geometry ahead', () => {
  const foliage = createFoliage().group;
  const builtForest = createExpandedForest().group;
  const mushroomForest = createMushroomForest().group;
  foliage.updateMatrixWorld(true);
  builtForest.updateMatrixWorld(true);
  mushroomForest.updateMatrixWorld(true);

  for (const index of [2, 4, 6, 7]) {
    const view = VIEWS[index];
    const eye = new Vector3(...view.eye);
    const target = new Vector3(...view.target);
    const rayDirection = target.clone().sub(eye);
    const elevation = eye.y - getTerrainHeight(eye.x, eye.z);
    assert.ok(elevation >= 1.5 && elevation <= 2.1, `${view.label} eye is ${elevation.toFixed(2)}m above ground`);
    const ray = new Raycaster(eye, rayDirection.clone().normalize(), .1, rayDirection.length());
    const occluders = index === 7 ? [foliage, builtForest, mushroomForest] : [foliage, builtForest];
    assert.equal(ray.intersectObjects(occluders, true).length, 0,
      `${view.label} centre view passes through a trunk or canopy`);
  }
  assert.deepEqual(VIEWS[2].entry, [36, 4]);
  assert.deepEqual(VIEWS[4].entry, [104, -48]);
  assert.deepEqual(VIEWS[6].entry, [-28, 96]);
  assert.deepEqual(VIEWS[7].entry, [-43, -14]);
});
