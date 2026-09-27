import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const asset = new URL('../public/models/animals/rabbit-conductor-v3.glb', import.meta.url);

function readAsset() {
  assert.ok(existsSync(asset), 'The independent v3 rabbit candidate must exist');
  const file = readFileSync(asset);
  assert.equal(file.toString('ascii', 0, 4), 'glTF');
  assert.equal(file.readUInt32LE(4), 2);
  assert.equal(file.readUInt32LE(8), file.length);
  const jsonLength = file.readUInt32LE(12);
  const data = JSON.parse(file.toString('utf8', 20, 20 + jsonLength));
  const binary = file.subarray(28 + jsonLength);
  function values(index: number): number[] {
    const accessor = data.accessors[index];
    const view = data.bufferViews[accessor.bufferView];
    const width = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 }[accessor.type as string]!;
    const bytes = { 5121: 1, 5123: 2, 5125: 4, 5126: 4 }[accessor.componentType as number]!;
    const out: number[] = [];
    for (let i = 0; i < accessor.count; i++) {
      for (let j = 0; j < width; j++) {
        const offset = (view.byteOffset || 0) + (accessor.byteOffset || 0) + i * (view.byteStride || width * bytes) + j * bytes;
        out.push(accessor.componentType === 5126 ? binary.readFloatLE(offset) : binary.readUIntLE(offset, bytes));
      }
    }
    return out;
  }
  return { data, binary, values };
}

test('rabbit candidate embeds its textures, valid skin matrices and plausible mesh budget', () => {
  const { data, binary, values } = readAsset();
  assert.ok(data.images.length >= 2, 'Fur and cloth detail must survive export');
  for (const image of data.images) {
    assert.equal(image.uri, undefined);
    assert.ok(data.bufferViews[image.bufferView].byteLength > 1000);
  }
  for (const view of data.bufferViews) assert.ok((view.byteOffset || 0) + view.byteLength <= binary.length);
  let triangles = 0;
  for (const mesh of data.meshes) for (const primitive of mesh.primitives) {
    triangles += data.accessors[primitive.indices].count / 3;
    assert.ok(primitive.attributes.POSITION !== undefined);
  }
  assert.ok(triangles >= 30000 && triangles <= 90000, `triangle budget: ${triangles}`);
  assert.ok(data.skins.length > 0);
  for (const skin of data.skins) {
    const matrices = values(skin.inverseBindMatrices);
    assert.equal(matrices.length, skin.joints.length * 16);
    assert.ok(matrices.every(Number.isFinite));
  }
});

test('Conduct moves both forearms and wrists with continuous loops and stable feet', () => {
  const { data, values } = readAsset();
  for (const name of ['Idle', 'Conduct']) {
    const clip = data.animations.find((animation: any) => animation.name === name);
    assert.ok(clip, `${name} loop must be exported`);
    const moved = new Set<string>();
    for (const channel of clip.channels) {
      const sampler = clip.samplers[channel.sampler];
      const times = values(sampler.input);
      const frames = values(sampler.output);
      const width = frames.length / times.length;
      const target = data.nodes[channel.target.node].name;
      const change = frames.some((value, i) => Math.abs(value - frames[i % width]) > 0.005);
      if (change) moved.add(target);
      for (let c = 0; c < width; c++) {
        assert.ok(Math.abs(frames[c] - frames[frames.length - width + c]) < 0.0001, `${name}: ${target} seam`);
      }
      if (/Foot|Root/.test(target)) assert.equal(change, false, `${target} must remain planted`);
    }
    if (name === 'Conduct') for (const bone of ['UpperArm.L', 'Forearm.L', 'Wrist.L', 'UpperArm.R', 'Forearm.R', 'Wrist.R']) {
      assert.ok(moved.has(bone), `${bone} must actually move, not merely have a named track`);
    }
  }
});
