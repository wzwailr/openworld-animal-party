import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../tools/blender/out/rabbit-conductor-v4/', import.meta.url);
// Historical modeling evidence stays local; runtime asset tests remain mandatory.
const archiveOnly = { skip: existsSync(root) ? false : 'Local v4 Blender archive is not part of the source distribution' };

test('v4 gray study contains four distinct equal-scale renders and an editable Blender source', archiveOnly, () => {
  const source = new URL('rabbit-conductor-v4-gray.blend', root);
  assert.ok(existsSync(source), 'Static v4 Blender study has not been generated');
  assert.equal(readFileSync(source).subarray(0, 7).toString(), 'BLENDER');
  const signatures = new Set<string>();
  for (const view of ['front', 'back', 'left', 'right']) {
    for (const prefix of ['', 'silhouette-']) {
      const png = readFileSync(new URL(`${prefix}${view}.png`, root));
      assert.equal(png.subarray(1, 4).toString(), 'PNG');
      assert.equal(png.readUInt32BE(16), 1000);
      assert.equal(png.readUInt32BE(20), 1200);
      signatures.add(png.subarray(-80).toString('hex'));
    }
  }
  assert.equal(signatures.size, 8, 'The views must be separately rendered, not duplicated');
});

test('gray study is static, untextured, and has low planted foot geometry', archiveOnly, () => {
  const file = new URL('shape-report.json', root);
  assert.ok(existsSync(file), 'Evaluated mesh report must exist');
  const report = JSON.parse(readFileSync(file, 'utf8'));
  assert.equal(report.armatures, 0);
  assert.equal(report.actions, 0);
  assert.equal(report.image_texture_nodes, 0);
  assert.ok(report.actual_height > 0.96 && report.actual_height < 1.06);
  assert.ok(Math.abs(report.body_bounds.min[2]) < 0.005);
  for (const foot of report.foot_probes) {
    assert.ok(foot.support_vertices > 10, 'Each low paw needs a real sole, not point contact');
    assert.ok(foot.toe_vertices > 50, 'Toe volume must survive the final surface blend');
  }
});
