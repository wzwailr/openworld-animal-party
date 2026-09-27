import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { registerHooks } from 'node:module';
import test from 'node:test';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { RABBIT_MODEL_URLS } = await import('../src/entities/modelLibrary.ts');
const bytes = readFileSync(new URL(`../public${RABBIT_MODEL_URLS.v5}`, import.meta.url));
const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
gltf.scene.updateMatrixWorld(true);
const head = gltf.scene.getObjectByName('Head_-_continuous_face_rooted_ears_and_orbital_lids');
const nose = gltf.scene.getObjectByName('Rounded_triangular_nose');
assert.ok(head && nose, 'candidate must contain the actual face geometry');
const noseBox = new THREE.Box3().setFromObject(nose);

function frontAt(x: number, height: number): number {
  const ray = new THREE.Raycaster(new THREE.Vector3(x, height, 1), new THREE.Vector3(0, 0, -1));
  const hit = ray.intersectObject(head!, true)[0];
  assert.ok(hit, 'missing front surface at a mouth probe');
  return hit.point.z;
}

test('served candidate has a short nose with supporting upper and lower lip volume', () => {
  assert.ok(noseBox.max.z - noseBox.min.z < .015, 'the long triangular nasal extrusion returned');
  for (const x of [-.02, .02]) {
    assert.ok(noseBox.max.z - frontAt(x, .615) < .020, 'upper lip recedes into a pointed beak');
  }
  assert.ok(noseBox.max.z - frontAt(0, .600) < .035, 'lower lip no longer supports the muzzle');
});

test('served front-mouth patch contains no reversed folded triangles', () => {
  let checked = 0;
  let folded = 0;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const centre = new THREE.Vector3(), edge = new THREE.Vector3(), normal = new THREE.Vector3();
  head!.traverse(object => {
    if (!(object instanceof THREE.Mesh)) return;
    const position = object.geometry.getAttribute('position');
    const index = object.geometry.getIndex();
    const count = index?.count ?? position.count;
    for (let i = 0; i < count; i += 3) {
      a.fromBufferAttribute(position, index ? index.getX(i) : i).applyMatrix4(object.matrixWorld);
      b.fromBufferAttribute(position, index ? index.getX(i + 1) : i + 1).applyMatrix4(object.matrixWorld);
      c.fromBufferAttribute(position, index ? index.getX(i + 2) : i + 2).applyMatrix4(object.matrixWorld);
      centre.copy(a).add(b).add(c).multiplyScalar(1 / 3);
      if ((centre.x / .060) ** 2 + ((centre.y - .626) / .036) ** 2 >= 1 || centre.z <= .075) continue;
      normal.copy(b).sub(a).cross(edge.copy(c).sub(a)).normalize();
      checked++;
      if (normal.z < -.02) folded++;
    }
  });
  assert.ok(checked > 200, 'test must sample the actual dense front patch');
  assert.equal(folded, 0, `${folded} back-facing triangles recreate the folded mouth defect`);
});
