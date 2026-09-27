import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { registerHooks } from 'node:module';
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { loadAnimalLibrary, getAnimalAsset, RABBIT_MODEL_URLS } = await import('../src/entities/modelLibrary.ts');
const { createFestivalSquare } = await import('../src/world/regions/festivalSquare.ts');

test('rabbit variant uses the requested asset and refreshes the registry on each load', async () => {
  const originalLoad = GLTFLoader.prototype.loadAsync;
  const requested: string[] = [];
  GLTFLoader.prototype.loadAsync = async function (url) {
    requested.push(url);
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)));
    return { scene, animations: [] } as Awaited<ReturnType<GLTFLoader['loadAsync']>>;
  };
  try {
    await loadAnimalLibrary({ rabbitVariant: 'v5' });
    assert.equal(getAnimalAsset('rabbit')?.sourceUrl, RABBIT_MODEL_URLS.v5);
    const actor = createFestivalSquare().group.getObjectByName('animal:rabbit');
    assert.equal(actor?.userData.assetSourceUrl, RABBIT_MODEL_URLS.v5);
    assert.equal(actor?.position.y, 1.35);
    assert.ok(requested.includes(RABBIT_MODEL_URLS.v5));

    await loadAnimalLibrary();
    assert.equal(getAnimalAsset('rabbit')?.sourceUrl, RABBIT_MODEL_URLS.legacy);
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad;
  }
});

test('failed v5 request loads legacy instead of leaving a stale candidate in the scene', async () => {
  const originalLoad = GLTFLoader.prototype.loadAsync;
  const originalWarn = console.warn;
  const warnings: string[] = [];
  console.warn = (message) => { warnings.push(String(message)); };
  GLTFLoader.prototype.loadAsync = async function (url) {
    if (url === RABBIT_MODEL_URLS.v5) throw new Error('candidate missing');
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)));
    return { scene, animations: [] } as Awaited<ReturnType<GLTFLoader['loadAsync']>>;
  };
  try {
    await loadAnimalLibrary({ rabbitVariant: 'v5' });
    assert.equal(getAnimalAsset('rabbit')?.sourceUrl, RABBIT_MODEL_URLS.legacy);
    assert.equal(createFestivalSquare().group.getObjectByName('animal:rabbit')?.userData.assetSourceUrl, RABBIT_MODEL_URLS.legacy);
    assert.ok(warnings.some(message => message.includes('v5 灰模加载失败')));
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad;
    console.warn = originalWarn;
  }
});

test('actual v5 GLB parses and stands on the in-world stage at the authored scale', async () => {
  assert.equal(RABBIT_MODEL_URLS.v5, '/models/animals/rabbit-conductor-v5-muzzle-rebuilt.glb');
  const file = readFileSync(new URL(`../public${RABBIT_MODEL_URLS.v5}`, import.meta.url));
  const digest = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
  // Pinned against the separately verified cleaned export before publication.
  // Do not require a second copy of the modeling archive in a clean checkout.
  assert.equal(digest(file), '3115f448e21f3ec8e86e3f174ff47fa9e6c9308fbe1bbcc3eabfaf7bfde3118f', 'the served candidate must be the cleaned export, not an earlier cached GLB');
  const gltf = await new GLTFLoader().parseAsync(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength), '');
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  assert.ok(size.y > 0.1 && Number.isFinite(size.y), 'candidate GLB must contain visible geometry');
  const head = gltf.scene.getObjectByName('Head_-_continuous_face_rooted_ears_and_orbital_lids');
  const nose = gltf.scene.getObjectByName('Rounded_triangular_nose');
  const body = gltf.scene.getObjectByName('Body_-_belly_haunches_ankles_soles_and_distinct_toes');
  const baton = gltf.scene.getObjectByName('Static_grip_reference_baton');
  assert.ok(head && nose && body && baton, 'clean export must include the head, feet-bearing body and baton');
  const headBox = new THREE.Box3().setFromObject(head);
  const noseBox = new THREE.Box3().setFromObject(nose);
  const bodyBox = new THREE.Box3().setFromObject(body);
  assert.ok(headBox.max.y > .95 && Math.abs(bodyBox.min.y) < .01, 'head and soles must span the authored standing height');
  assert.ok(noseBox.getCenter(new THREE.Vector3()).z > headBox.getCenter(new THREE.Vector3()).z,
    'clean candidate face must point along local +Z');
  const originalLoad = GLTFLoader.prototype.loadAsync;
  GLTFLoader.prototype.loadAsync = async function (url) {
    if (url === RABBIT_MODEL_URLS.v5) return gltf;
    const scene = new THREE.Group();
    scene.add(new THREE.Mesh(new THREE.BoxGeometry(1, 2, 1)));
    return { scene, animations: [] } as Awaited<ReturnType<GLTFLoader['loadAsync']>>;
  };
  try {
    await loadAnimalLibrary({ rabbitVariant: 'v5' });
    const scene = createFestivalSquare().group;
    const conductor = scene.getObjectByName('animal:rabbit');
    assert.ok(conductor, 'the existing stage must contain its conductor');
    assert.equal(conductor.userData.assetSourceUrl, RABBIT_MODEL_URLS.v5);
    assert.equal(conductor.userData.hasIntegratedBaton, true);
    assert.equal(conductor.getObjectByName('conductor-baton'), undefined, 'v5 already includes its baton');
    assert.equal(conductor.position.x, 0);
    assert.equal(conductor.position.z, -1);
    assert.equal(conductor.position.y, 1.35);
    assert.ok(Math.abs(conductor.rotation.y) < 1e-8, 'v5 +Z face must point toward the audience');
    const bounds = new THREE.Box3().setFromObject(conductor);
    assert.ok(Math.abs(bounds.min.y - 1.35) < .02, `v5 feet miss the stage: ${bounds.min.y}`);
    assert.ok(bounds.max.y < 3.1, `v5 is oversized for the stage: ${bounds.max.y}`);
  } finally {
    GLTFLoader.prototype.loadAsync = originalLoad;
  }
});
