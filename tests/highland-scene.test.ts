import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { PerspectiveCamera, Raycaster, Vector3 } from 'three';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { createWorld } = await import('../src/world/createWorld.ts');
const { VALLEY_TRAIL, valleyTrailMiter, valleyWaterHeight } = await import('../src/world/highlandValleyLayout.ts');
const { WORLD } = await import('../src/world/config.ts');
const { resolveSlopeMovement } = await import('../src/player/slopeMovement.ts');
const { circleIntersectsAabb } = await import('../src/player/collisions.ts');
const { createPlayerController } = await import('../src/player/controller.ts');

// Only the canvas sprite painter is stubbed. Terrain, meshes, transforms,
// collision data and the movement implementation are the production objects.
const previousDocument = globalThis.document;
globalThis.document = { createElement(tag) {
  assert.equal(tag, 'canvas');
  return { width: 0, height: 0, getContext: () => ({
    createRadialGradient: () => ({ addColorStop() {} }), fillRect() {}, fillStyle: null
  }) };
} };
let world: ReturnType<typeof createWorld>;
test.before(() => { world = createWorld(); world.scene.updateMatrixWorld(true); });
test.after(() => {
  world?.dispose();
  if (previousDocument) globalThis.document = previousDocument; else delete globalThis.document;
});

function* trailSamples(spacing = 2) {
  for (let segment = 1; segment < VALLEY_TRAIL.length; segment++) {
    const a = VALLEY_TRAIL[segment - 1], b = VALLEY_TRAIL[segment];
    const dx = b[0] - a[0], dz = b[2] - a[2], length = Math.hypot(dx, dz);
    const steps = Math.ceil(length / spacing);
    for (let i = 0; i <= steps; i++) for (const lane of [-.9, 0, .9]) {
      yield { segment, lane, x: a[0] + dx * i / steps - dz / length * lane,
        z: a[2] + dz * i / steps + dx / length * lane };
    }
  }
}

test('actual mountain ground supports all three trail lanes within ten centimetres of the walking surface', () => {
  const grounds = ['sculpted-meadow-and-riverbed', 'highland-mountain-ground']
    .map(name => world.scene.getObjectByName(name)).filter(Boolean);
  assert.ok(grounds.length, 'no rendered ground objects');
  const ray = new Raycaster(), errors: string[] = [];
  for (const { segment, lane, x, z } of trailSamples()) {
    ray.set(new Vector3(x, 200, z), new Vector3(0, -1, 0));
    const hit = ray.intersectObjects(grounds, true)[0];
    const expected = world.getGroundHeight(x, z);
    if (!hit || Math.abs(hit.point.y - expected) > .1) {
      errors.push(`segment ${segment} lane ${lane} at ${x.toFixed(3)},${z.toFixed(3)}: mesh=${hit?.point.y.toFixed(3) ?? 'missing'} walk=${expected.toFixed(3)}`);
    }
  }
  assert.equal(errors.length, 0, `${errors.length} ground mismatches:\n${errors.slice(0, 12).join('\n')}`);
});

test('the full visible switchback width stays below 20 degrees and agrees with the visible path', () => {
  const path = world.scene.getObjectByName('highland-switchback-trail');
  assert.ok(path, 'missing visible switchback path');
  const ray = new Raycaster(), failures: string[] = [];
  for (let segment = 1; segment < VALLEY_TRAIL.length; segment++) {
    const a = VALLEY_TRAIL[segment - 1], b = VALLEY_TRAIL[segment];
    const before = VALLEY_TRAIL[Math.max(0, segment - 2)];
    const after = VALLEY_TRAIL[Math.min(VALLEY_TRAIL.length - 1, segment + 1)];
    const normal = (start: readonly number[], end: readonly number[]) => {
      const length = Math.hypot(end[0] - start[0], end[2] - start[2]);
      return { x: -(end[2] - start[2]) / length, z: (end[0] - start[0]) / length };
    };
    const incoming = normal(before, a), direction = normal(a, b), outgoing = normal(b, after);
    const miter = (first: { x: number; z: number }, second: { x: number; z: number }) => {
      const scale = 1 / (1 + first.x * second.x + first.z * second.z);
      return { x: (first.x + second.x) * scale, z: (first.z + second.z) * scale };
    };
    const start = miter(incoming, direction), end = miter(direction, outgoing);
    for (let lane = -2.1; lane <= 2.1001; lane += .1) {
      const from = { x: a[0] + start.x * lane, z: a[2] + start.z * lane };
      const to = { x: b[0] + end.x * lane, z: b[2] + end.z * lane };
      const length = Math.hypot(to.x - from.x, to.z - from.z), steps = Math.ceil(length / .1);
      let previous = world.getGroundHeight(from.x, from.z);
      for (let step = 0; step <= steps; step++) {
        const x = from.x + (to.x - from.x) * step / steps;
        const z = from.z + (to.z - from.z) * step / steps;
        const height = world.getGroundHeight(x, z);
        if (step && Math.abs(height - previous) / (length / steps) > Math.tan(Math.PI / 9) + .001)
          failures.push(`grade segment ${segment} lane ${lane.toFixed(1)} at ${x.toFixed(2)},${z.toFixed(2)}: ${(Math.abs(height - previous) / (length / steps)).toFixed(3)}`);
        previous = height;
        if (step % 5) continue;
        ray.set(new Vector3(x, 200, z), new Vector3(0, -1, 0));
        const visible = ray.intersectObject(path, false)[0];
        if (!visible || Math.abs(visible.point.y - height) > .1)
          failures.push(`path segment ${segment} lane ${lane.toFixed(1)} at ${x.toFixed(2)},${z.toFixed(2)}`);
      }
    }
  }
  assert.equal(failures.length, 0, `${failures.length} full-width failures (${failures.filter(value => value.startsWith('grade')).length} grade, ${failures.filter(value => value.startsWith('path')).length} path):\n${failures.slice(0, 12).join('\n')}`);
});

test('the integrated valley route is walkable in both directions at 30, 60 and 120 FPS', () => {
  const errors: string[] = [];
  for (const fps of [30, 60, 120]) for (const reverse of [false, true]) {
    const points = reverse ? [...VALLEY_TRAIL].reverse() : VALLEY_TRAIL;
    let position = { x: points[0][0], z: points[0][2] };
    for (let segment = 1; segment < points.length; segment++) {
      const [x, , z] = points[segment];
      const frames = Math.ceil(Math.hypot(x - position.x, z - position.z) / (5.2 / fps));
      const dx = (x - position.x) / frames, dz = (z - position.z) / frames;
      for (let frame = 0; frame < frames; frame++) {
        position = resolveSlopeMovement(position, { x: position.x + dx, z: position.z + dz },
          .45, world.colliders, WORLD, world.getGroundHeight);
        const water = valleyWaterHeight(position.x, position.z);
        assert.ok(water === null || world.getGroundHeight(position.x, position.z) >= water,
          `route entered wet ground at ${position.x},${position.z}`);
      }
      if (Math.hypot(position.x - x, position.z - z) > .1) {
        errors.push(`${fps} FPS ${reverse ? 'downhill' : 'uphill'} segment ${segment}: stopped at ${position.x.toFixed(3)},${position.z.toFixed(3)} before ${x},${z}`);
        break;
      }
    }
  }
  assert.deepEqual(errors, []);
});

test('the real movement rule traverses both mitered road edges in either direction at 30, 60 and 120 FPS', () => {
  const failures: string[] = [];
  for (const lane of [-2.1, -1.2, 1.2, 2.1]) for (const fps of [30, 60, 120]) for (const reverse of [false, true]) {
    const points = VALLEY_TRAIL.map(([x, , z], index) => {
      const [mx, mz] = valleyTrailMiter(index);
      return { x: x + mx * lane, z: z + mz * lane };
    });
    if (reverse) points.reverse();
    let position = { ...points[0] };
    for (let segment = 1; segment < points.length; segment++) {
      const target = points[segment], steps = Math.ceil(Math.hypot(target.x - position.x, target.z - position.z) / (5.2 / fps));
      const dx = (target.x - position.x) / steps, dz = (target.z - position.z) / steps;
      for (let step = 0; step < steps; step++) {
        position = resolveSlopeMovement(position, { x: position.x + dx, z: position.z + dz },
          .45, world.colliders, WORLD, world.getGroundHeight);
      }
      if (Math.hypot(position.x - target.x, position.z - target.z) > .05) {
        failures.push(`${lane}m ${fps}FPS ${reverse ? 'reverse' : 'forward'} segment ${segment}: stopped at ${position.x.toFixed(2)},${position.z.toFixed(2)}`);
        break;
      }
    }
  }
  assert.deepEqual(failures, []);
});

test('local highland water levels are collision-covered without sealing the dry trail corridor', () => {
  const uncovered: string[] = [], blocked: string[] = [];
  let wetSamples = 0;
  for (let z = -231.5; z <= -102; z += 1) for (let x = 24.5; x <= 61; x += 1) {
    const water = valleyWaterHeight(x, z);
    if (water === null || world.getGroundHeight(x, z) >= water - .2) continue;
    wetSamples++;
    if (!world.colliders.some(box => circleIntersectsAabb({ x, z }, .45, box))) {
      uncovered.push(`${x},${z} water=${water.toFixed(2)} ground=${world.getGroundHeight(x,z).toFixed(2)}`);
    }
  }
  for (const { segment, lane, x, z } of trailSamples(.75)) {
    if (world.colliders.some(box => circleIntersectsAabb({ x, z }, .45, box))) {
      blocked.push(`segment ${segment} lane ${lane} at ${x.toFixed(3)},${z.toFixed(3)}`);
    }
  }
  assert.ok(wetSamples > 100, 'test did not exercise the elevated stream, pools and lower outlet');
  assert.ok(!uncovered.length && !blocked.length,
    `${uncovered.length}/${wetSamples} wet samples uncovered:\n${uncovered.slice(0, 10).join('\n')}\n${blocked.length} blocked dry trail samples:\n${blocked.slice(0, 10).join('\n')}`);
});

test('the moving shadow camera covers highland ground and an elevated observer without rotating the sun', () => {
  const sun = world.scene.children.find(object => object.isDirectionalLight && object.castShadow);
  assert.ok(sun, 'no shadow-casting sunlight');
  const direction = sun.position.clone().sub(sun.target.position).normalize();
  for (const [x, eyeY, z] of [[22, 6.6, -108], [26, 81.7, -198], [83, 101, -229], [26, 140, -198]]) {
    const position = new Vector3(x, eyeY, z);
    world.updateView(position);
    world.scene.updateMatrixWorld(true);
    // WebGLShadowMap does this when allocating the first shadow render target.
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.updateMatrices(sun);
    assert.ok(sun.position.clone().sub(sun.target.position).normalize().distanceTo(direction) < 1e-8,
      'following a visitor changed the sunlight direction');
    const samples = [position];
    for (const dx of [-5, 0, 5]) for (const dz of [-5, 0, 5]) {
      samples.push(new Vector3(x + dx, world.getGroundHeight(x + dx, z + dz), z + dz));
    }
    for (const sample of samples) {
      const projected = sample.clone().project(sun.shadow.camera);
      assert.ok(Math.max(Math.abs(projected.x), Math.abs(projected.y), Math.abs(projected.z)) <= 1,
        `shadow camera misses ${sample.toArray().map(n=>n.toFixed(2))} while observing ${position.toArray()}: clip=${projected.toArray().map(n=>n.toFixed(3))}`);
    }
  }
});

function* cornerLanes() {
  for (let corner = 1; corner < VALLEY_TRAIL.length - 1; corner++) {
    const a = VALLEY_TRAIL[corner - 1], b = VALLEY_TRAIL[corner], c = VALLEY_TRAIL[corner + 1];
    const incoming = new Vector3(b[0] - a[0], 0, b[2] - a[2]).normalize();
    const outgoing = new Vector3(c[0] - b[0], 0, c[2] - b[2]).normalize();
    const firstNormal = { x: -incoming.z, z: incoming.x };
    const lastNormal = { x: -outgoing.z, z: outgoing.x };
    const turn = Math.atan2(incoming.x * outgoing.z - incoming.z * outgoing.x, incoming.dot(outgoing));
    for (const lane of [-1.2, -.9, .9, 1.2]) {
      const points = [{ x: b[0] - incoming.x * 3 + firstNormal.x * lane,
        z: b[2] - incoming.z * 3 + firstNormal.z * lane }];
      if (lane * turn > 0) {
        // Inner offset legs meet at their miter. This crosses the nearest-leg
        // boundary where independent segment heights previously jumped.
        const denominator = 1 + incoming.dot(outgoing);
        points.push({ x: b[0] + (firstNormal.x + lastNormal.x) * lane / denominator,
          z: b[2] + (firstNormal.z + lastNormal.z) * lane / denominator });
      } else {
        // Follow the outer round corner inside the path's swept corridor.
        const angle = Math.atan2(firstNormal.z * lane, firstNormal.x * lane);
        const steps = Math.ceil(Math.abs(turn) / .15);
        for (let step = 0; step <= steps; step++) {
          points.push({ x: b[0] + Math.cos(angle + turn * step / steps) * Math.abs(lane),
            z: b[2] + Math.sin(angle + turn * step / steps) * Math.abs(lane) });
        }
      }
      points.push({ x: b[0] + outgoing.x * 3 + lastNormal.x * lane,
        z: b[2] + outgoing.z * 3 + lastNormal.z * lane });
      yield { corner, lane, points };
    }
  }
}

test('switchback side lanes have continuous walkable grades and matching rendered ground through the corners', () => {
  const grounds = ['sculpted-meadow-and-riverbed', 'highland-mountain-ground']
    .map(name => world.scene.getObjectByName(name)).filter(Boolean);
  const ray = new Raycaster(), gradeErrors: string[] = [], meshErrors: string[] = [];
  for (const { corner, lane, points } of cornerLanes()) {
    for (let segment = 1; segment < points.length; segment++) {
      const a = points[segment - 1], b = points[segment], length = Math.hypot(b.x - a.x, b.z - a.z);
      const steps = Math.ceil(length / .01);
      let previous = world.getGroundHeight(a.x, a.z);
      for (let step = 0; step <= steps; step++) {
        const x = a.x + (b.x - a.x) * step / steps, z = a.z + (b.z - a.z) * step / steps;
        const height = world.getGroundHeight(x, z);
        const location = `corner ${corner} lane ${lane} at ${x.toFixed(6)},${z.toFixed(6)}`;
        if (step && Math.abs(height - previous) / (length / steps) >= Math.tan(38 * Math.PI / 180)) {
          gradeErrors.push(`${location}: rise=${(height - previous).toFixed(4)} over ${(length / steps).toFixed(4)}m`);
        }
        previous = height;
      }
    }
    // Concentrate expensive mesh rays on the miter or outer arc joins. The
    // existing full-trail test covers approaches; height grades above stay at 1 cm.
    const joints = new Set([1, Math.floor(points.length / 2), points.length - 2]);
    for (const joint of joints) {
      const pivot = points[joint], probes = [pivot];
      for (const neighbour of [points[joint - 1], points[joint + 1]]) {
        const distance = Math.hypot(neighbour.x - pivot.x, neighbour.z - pivot.z);
        probes.push({ x: pivot.x + (neighbour.x - pivot.x) * .01 / distance,
          z: pivot.z + (neighbour.z - pivot.z) * .01 / distance });
      }
      for (const { x, z } of probes) {
        const height = world.getGroundHeight(x, z);
        ray.set(new Vector3(x, 200, z), new Vector3(0, -1, 0));
        const hit = ray.intersectObjects(grounds, true)[0];
        if (!hit || Math.abs(hit.point.y - height) >= .1) {
          meshErrors.push(`corner ${corner} lane ${lane} at ${x.toFixed(6)},${z.toFixed(6)}: walk=${height.toFixed(4)} mesh=${hit?.point.y.toFixed(4) ?? 'missing'}`);
        }
      }
    }
  }
  assert.ok(!gradeErrors.length && !meshErrors.length,
    `${gradeErrors.length} impassable corner grades:\n${gradeErrors.slice(0, 8).join('\n')}\n${meshErrors.length} corner mesh mismatches:\n${meshErrors.slice(0, 8).join('\n')}`);
});

test('a grounded visitor can continuously turn along both side lanes of every switchback in either direction', () => {
  const errors: string[] = [];
  for (const { corner, lane, points } of cornerLanes()) for (const reverse of [false, true]) {
    const route = reverse ? [...points].reverse() : points;
    let position = { ...route[0] };
    for (let segment = 1; segment < route.length; segment++) {
      const target = route[segment], steps = Math.ceil(Math.hypot(target.x - position.x, target.z - position.z) / .02);
      const dx = (target.x - position.x) / steps, dz = (target.z - position.z) / steps;
      for (let step = 0; step < steps; step++) {
        position = resolveSlopeMovement(position, { x: position.x + dx, z: position.z + dz },
          .45, world.colliders, WORLD, world.getGroundHeight);
      }
      if (Math.hypot(position.x - target.x, position.z - target.z) > .05) {
        errors.push(`corner ${corner} lane ${lane} ${reverse ? 'reverse' : 'forward'} stopped ${position.x.toFixed(6)},${position.z.toFixed(6)} before ${target.x.toFixed(6)},${target.z.toFixed(6)}`);
        break;
      }
    }
  }
  assert.equal(errors.length, 0, `${errors.length} blocked corner traversals:\n${errors.slice(0, 12).join('\n')}`);
});

function* entranceLanes() {
  const a = VALLEY_TRAIL[0], b = VALLEY_TRAIL[1];
  const direction = new Vector3(b[0] - a[0], 0, b[2] - a[2]).normalize();
  for (const lane of [-1.2, -.9, .9, 1.2]) {
    // The existing north trail approaches along X=22. Join its parallel lane
    // to the first valley leg, rather than starting already inside the new terrain.
    yield { lane, points: [
      { x: a[0] + lane, z: -98 },
      { x: a[0] + lane, z: a[2] + direction.x * lane / (1 - direction.z) },
      { x: a[0] + direction.x * 6 - direction.z * lane,
        z: a[2] + direction.z * 6 + direction.x * lane }
    ] };
  }
}

test('valley entrance side lanes stay below 20 degrees and agree with the ground mesh', () => {
  const grounds = ['sculpted-meadow-and-riverbed', 'highland-mountain-ground']
    .map(name => world.scene.getObjectByName(name)).filter(Boolean);
  const ray = new Raycaster(), gradeErrors: string[] = [], meshErrors: string[] = [];
  for (const { lane, points } of entranceLanes()) for (let segment = 1; segment < points.length; segment++) {
    const a = points[segment - 1], b = points[segment], distance = Math.hypot(b.x - a.x, b.z - a.z);
    const steps = Math.ceil(distance / .01), probes: Array<{ x: number; z: number }> = [];
    let previous = world.getGroundHeight(a.x, a.z);
    for (let step = 0; step <= steps; step++) {
      const x = a.x + (b.x - a.x) * step / steps, z = a.z + (b.z - a.z) * step / steps;
      const height = world.getGroundHeight(x, z);
      if (step && Math.abs(height - previous) / (distance / steps) > Math.tan(Math.PI / 9) + .001) {
        gradeErrors.push(`lane ${lane} at ${x.toFixed(6)},${z.toFixed(6)}: rise=${(height - previous).toFixed(4)} over ${(distance / steps).toFixed(4)}m`);
      }
      previous = height;
      if (!(step % 50) || step === steps) probes.push({ x, z });
    }
    // Explicitly probe both sides of the old seam and the new transition bounds.
    for (const boundary of [-100, -106, -108]) for (const delta of [-.005, .005]) {
      const z = boundary + delta, t = (z - a.z) / (b.z - a.z);
      if (t >= 0 && t <= 1) probes.push({ x: a.x + (b.x - a.x) * t, z });
    }
    for (const { x, z } of probes) {
      ray.set(new Vector3(x, 200, z), new Vector3(0, -1, 0));
      const hit = ray.intersectObjects(grounds, true)[0], height = world.getGroundHeight(x, z);
      if (!hit || Math.abs(hit.point.y - height) >= .1) {
        meshErrors.push(`lane ${lane} at ${x.toFixed(6)},${z.toFixed(6)}: walk=${height.toFixed(4)} mesh=${hit?.point.y.toFixed(4) ?? 'missing'}`);
      }
    }
  }
  assert.ok(!gradeErrors.length && !meshErrors.length,
    `${gradeErrors.length} entrance grade errors:\n${gradeErrors.slice(0, 8).join('\n')}\n${meshErrors.length} entrance mesh mismatches:\n${meshErrors.slice(0, 8).join('\n')}`);
});

test('the real controller crosses all four entrance side lanes in both directions at 30, 60 and 120 FPS', () => {
  const errors: string[] = [];
  for (const { lane, points } of entranceLanes()) for (const reverse of [false, true]) for (const fps of [30, 60, 120]) {
    const route = reverse ? [...points].reverse() : points;
    const view = new EventTarget();
    const doc = Object.assign(new EventTarget(), { defaultView: view, pointerLockElement: null, hidden: false });
    const surface = Object.assign(new EventTarget(), {
      ownerDocument: doc, getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 })
    });
    const camera = new PerspectiveCamera();
    const controller = createPlayerController({ camera, domElement: surface,
      colliders: world.colliders, getGroundHeight: world.getGroundHeight });
    controller.reset({ ...route[0], yaw: 0 });
    controller.lock();
    view.dispatchEvent(Object.assign(new Event('keydown', { cancelable: true }), { code: 'KeyW' }));
    try {
      for (let segment = 1; segment < route.length; segment++) {
        const a = route[segment - 1], b = route[segment];
        const duration = Math.hypot(b.x - a.x, b.z - a.z) / 5.2;
        camera.rotation.set(0, Math.atan2(a.x - b.x, a.z - b.z), 0, 'YXZ');
        for (let elapsed = 0; elapsed < duration; elapsed += 1 / fps) {
          controller.update(Math.min(1 / fps, duration - elapsed));
          assert.ok(Math.abs(camera.position.y - world.getGroundHeight(camera.position.x, camera.position.z) - 1.7) < 1e-8,
            'entrance traversal must stay grounded without Space or teleporting');
        }
        if (Math.hypot(camera.position.x - b.x, camera.position.z - b.z) > .05) {
          errors.push(`lane ${lane} ${reverse ? 'reverse' : 'forward'} ${fps} FPS segment ${segment}: stopped ${camera.position.x.toFixed(6)},${camera.position.z.toFixed(6)} before ${b.x.toFixed(6)},${b.z.toFixed(6)}`);
          break;
        }
      }
    } finally { controller.dispose(); }
  }
  assert.equal(errors.length, 0, `${errors.length} blocked entrance traversals:\n${errors.slice(0, 12).join('\n')}`);
});
