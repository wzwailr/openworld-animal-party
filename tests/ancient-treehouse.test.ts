import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';

registerHooks({resolve(specifier,context,nextResolve){
  return nextResolve(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?`${specifier}.ts`:specifier,context);
}});
const { createAncientTreehouse } = await import('../src/world/regions/ancientTreehouse.ts');

test('the old tree station keeps its landmarks without the source-less prototype water curtain', () => {
  const { group, colliders } = createAncientTreehouse();
  assert.ok(group.getObjectByName('ancient-treehouse'));
  assert.ok(group.getObjectByName('return-direction-lantern'));
  assert.ok(colliders.length > 0);
  assert.ok(!group.getObjectByName('procedural-waterfall'), 'the disconnected prototype curtain is still rendered');
});
