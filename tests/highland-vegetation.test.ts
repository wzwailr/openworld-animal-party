import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
import * as THREE from 'three';

registerHooks({resolve(specifier,context,nextResolve){
  return nextResolve(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?`${specifier}.ts`:specifier,context);
}});
const { createHighlandValley } = await import('../src/world/regions/highlandValley.ts');
const { getTerrainHeight } = await import('../src/world/landscape.ts');

test('every mountain trunk embeds its entire lower rim into the supporting slope', () => {
  const { group } = createHighlandValley();
  const trunks = group.getObjectByName('valley-tree-trunks') as THREE.InstancedMesh;
  const position = trunks.geometry.attributes.position;
  const matrix = new THREE.Matrix4(), point = new THREE.Vector3();
  let maximumGap = -Infinity;
  for (let instance = 0; instance < trunks.count; instance++) {
    trunks.getMatrixAt(instance, matrix);
    for (let vertex = 0; vertex < position.count; vertex++) {
      if (position.getY(vertex) > 0.001) continue;
      point.fromBufferAttribute(position, vertex).applyMatrix4(matrix);
      maximumGap = Math.max(maximumGap, point.y - getTerrainHeight(point.x, point.z));
    }
  }
  assert.ok(maximumGap <= 0.01, `trunk lower rim floats ${maximumGap.toFixed(3)}m above its hillside`);
});
