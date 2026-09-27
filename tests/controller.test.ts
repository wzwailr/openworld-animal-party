import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { Euler, PerspectiveCamera } from 'three';
registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const { createPlayerController, computeMoveVector } = await import('../src/player/controller.ts');

function keyboard(target: EventTarget, type: string, code: string) {
  const event = Object.assign(new Event(type, { cancelable: true }), { code });
  target.dispatchEvent(event);
  return event;
}

function setup(ground = (_x: number, _z: number) => 0, colliders: Array<{ minX: number; maxX: number; minZ: number; maxZ: number }> = []) {
  const view = new EventTarget();
  const doc = Object.assign(new EventTarget(), {
    defaultView: view,
    pointerLockElement: null as EventTarget | null,
    hidden: false,
    exitPointerLock() {
      this.pointerLockElement = null;
      this.dispatchEvent(new Event('pointerlockchange'));
    }
  });
  const surface = Object.assign(new EventTarget(), {
    ownerDocument: doc,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 800, height: 600 }),
    requestPointerLock: undefined as undefined | (() => Promise<void>)
  });
  const camera = new PerspectiveCamera();
  const modes: string[] = [];
  let pauses = 0;
  const controller = createPlayerController({
    camera, domElement: surface, colliders, getGroundHeight: ground,
    onLock: (mode: string) => modes.push(mode), onUnlock: () => pauses++
  });
  controller.reset();
  return { view, doc, surface, camera, controller, modes, pauses: () => pauses };
}

test('WASD is relative to all four camera headings, with equal diagonal speed', () => {
  for (const yaw of [0, Math.PI / 2, Math.PI, -Math.PI / 2]) {
    const forward = { x: -Math.sin(yaw), z: -Math.cos(yaw) };
    const right = { x: Math.cos(yaw), z: -Math.sin(yaw) };
    for (const [key, expected] of [
      ['KeyW', forward], ['KeyS', { x: -forward.x, z: -forward.z }],
      ['KeyD', right], ['KeyA', { x: -right.x, z: -right.z }]
    ] as const) {
      const actual = computeMoveVector(new Set([key]), yaw, 5, 0.2);
      assert.ok(Math.abs(actual.x - expected.x) < 1e-9, `${key} x at yaw ${yaw}`);
      assert.ok(Math.abs(actual.z - expected.z) < 1e-9, `${key} z at yaw ${yaw}`);
    }
    const diagonal = computeMoveVector(new Set(['KeyW', 'KeyD']), yaw, 5, 0.2);
    assert.ok(Math.abs(Math.hypot(diagonal.x, diagonal.z) - 1) < 1e-9);
  }
});

test('entering at a selected destination starts at first-person eye height and R still returns to the entrance', () => {
  const {view,camera,controller}=setup(()=>3);
  controller.reset({x:-112,z:4,yaw:Math.PI/2});
  assert.equal(camera.position.x,-112);
  assert.equal(camera.position.z,4);
  assert.equal(camera.position.y,4.7);
  assert.ok(Math.abs(camera.rotation.y-Math.PI/2)<1e-8);
  controller.lock();keyboard(view,'keydown','KeyR');
  assert.equal(camera.position.x,0);assert.equal(camera.position.z,58);
  controller.dispose();
});

test('ground walking refuses 38-degree climbs and drops at every supported frame rate', () => {
  for (const fps of [30, 60, 120]) for (const direction of [-1, 1]) {
    const { view, camera, controller } = setup((_x, z) => 80 + direction * (58 - z) * Math.tan(38 * Math.PI / 180));
    controller.lock();
    keyboard(view, 'keydown', 'KeyW');
    for (let frame = 0; frame < fps; frame++) controller.update(1 / fps);
    assert.equal(camera.position.z, 58, `steep ${direction > 0 ? 'climb' : 'drop'} accepted at ${fps} FPS`);
    assert.equal(camera.position.y, 81.7);
    controller.dispose();
  }
});

test('sprinting cannot skip a narrow crest or drop between frame endpoints', () => {
  for (const fps of [30, 60, 120]) for (const direction of [-1, 1]) {
    const { view, camera, controller } = setup((_x, z) => {
      const distance = 58 - z;
      return distance >= .03 && distance <= .13 ? direction * 10 : 0;
    });
    controller.lock();
    keyboard(view, 'keydown', 'ShiftLeft');
    keyboard(view, 'keydown', 'KeyW');
    for (let frame = 0; frame < fps; frame++) controller.update(1 / fps);
    assert.ok(camera.position.z >= 57.97, `skipped a narrow ${direction > 0 ? 'crest' : 'drop'} at ${fps} FPS`);
    assert.equal(camera.position.y, 1.7);
    controller.dispose();
  }
});

test('22-degree bridge approaches and slopes below the cutoff remain walkable in both directions', () => {
  for (const fps of [30, 60, 120]) for (const angle of [22, 37.9]) for (const direction of [-1, 1]) {
    const ground = (_x: number, z: number) => 80 + direction * (58 - z) * Math.tan(angle * Math.PI / 180);
    const { view, camera, controller } = setup(ground);
    controller.lock();
    keyboard(view, 'keydown', 'KeyW');
    for (let frame = 0; frame < fps; frame++) controller.update(1 / fps);
    assert.ok(Math.abs(camera.position.z - 52.8) < 1e-8, `${angle} degrees blocked at ${fps} FPS`);
    assert.ok(Math.abs(camera.position.y - ground(0, 52.8) - 1.7) < 1e-8);
    keyboard(view, 'keyup', 'KeyW');
    keyboard(view, 'keydown', 'KeyS');
    for (let frame = 0; frame < fps; frame++) controller.update(1 / fps);
    assert.ok(Math.abs(camera.position.z - 58) < 1e-8);
    controller.dispose();
  }
});

test('blocked uphill motion slides along the safe axis and still respects walls while hovering', () => {
  for (const fps of [30, 60, 120]) {
    const { view, camera, controller } = setup((x) => 80 + x * 3, [
      { minX: -1, maxX: 1, minZ: 54, maxZ: 54.5 }
    ]);
    controller.lock();
    keyboard(view, 'keydown', 'KeyW');
    keyboard(view, 'keydown', 'KeyD');
    for (let frame = 0; frame < fps; frame++) controller.update(1 / fps);
    assert.equal(camera.position.x, 0, 'sliding must not accept the unsafe uphill axis');
    assert.ok(camera.position.z < 56, 'safe downhill-free axis did not slide');
    assert.ok(camera.position.z >= 54.95, 'sliding crossed the wall');
    keyboard(view, 'keyup', 'KeyD');
    keyboard(view, 'keydown', 'Space');
    for (let frame = 0; frame < fps; frame++) controller.update(1 / fps);
    assert.ok(camera.position.y > 85);
    assert.ok(camera.position.z >= 54.95, 'hovering must retain the existing XZ collision');
    controller.dispose();
  }
});

test('native pointer lock turns without a held mouse button and walking follows the new heading', async () => {
  const { view, doc, surface, camera, controller, modes, pauses } = setup();
  surface.requestPointerLock = async () => {
    doc.pointerLockElement = surface;
    doc.dispatchEvent(new Event('pointerlockchange'));
  };
  controller.lock();
  await Promise.resolve();
  assert.equal(controller.isLocked(), true);
  assert.deepEqual(modes, ['pointer-lock']);
  doc.dispatchEvent(Object.assign(new Event('mousemove'), { movementX: 400, movementY: -160 }));
  const heading = new Euler().setFromQuaternion(camera.quaternion, 'YXZ');
  assert.ok(Math.abs(heading.y) > 0.5);
  assert.ok(heading.x > 0);
  const before = camera.position.clone();
  keyboard(view, 'keydown', 'KeyW');
  controller.update(0.05);
  const distance = camera.position.clone().sub(before);
  assert.ok(Math.abs(distance.x / distance.length() + Math.sin(heading.y)) < 1e-9);
  assert.ok(Math.abs(distance.z / distance.length() + Math.cos(heading.y)) < 1e-9);
  assert.equal(distance.y, 0, 'looking up must not turn W into vertical flight');
  doc.exitPointerLock();
  assert.equal(controller.isLocked(), false);
  assert.equal(pauses(), 1);
  controller.dispose();
});

test('rejected pointer lock falls back to button-free mouse look and edge turning', async () => {
  const { surface, camera, controller, modes } = setup();
  surface.requestPointerLock = () => Promise.reject(new Error('Unsupported browser'));
  controller.lock();
  await Promise.resolve();
  assert.equal(controller.isLocked(), true);
  assert.deepEqual(modes, ['free-look']);
  surface.dispatchEvent(Object.assign(new Event('mousemove'), { clientX: 400, clientY: 300 }));
  surface.dispatchEvent(Object.assign(new Event('mousemove'), { clientX: 500, clientY: 330 }));
  assert.ok(Math.abs(camera.rotation.y) > 0.1);
  assert.ok(camera.rotation.x < 0);
  surface.dispatchEvent(Object.assign(new Event('mousemove'), { clientX: 799, clientY: 330 }));
  const before = camera.quaternion.clone();
  controller.update(0.05);
  assert.ok(before.angleTo(camera.quaternion) > 0.01, 'the cursor edge must not prevent continued turning');
  surface.dispatchEvent(new Event('mouseleave'));
  const after = camera.quaternion.clone();
  controller.update(0.05);
  assert.ok(after.angleTo(camera.quaternion) < 1e-7);
  controller.dispose();
});

test('Space raises the camera, release hovers at world height, Ctrl descends, R resets', () => {
  const { view, camera, controller } = setup((_x, z) => (58 - z) * 0.1);
  controller.lock();
  const floor = camera.position.y;
  assert.equal(keyboard(view, 'keydown', 'Space').defaultPrevented, true);
  for (let i = 0; i < 20; i++) controller.update(0.05);
  assert.ok(camera.position.y > floor + 3);
  keyboard(view, 'keyup', 'Space');
  const raised = camera.position.y;
  keyboard(view, 'keydown', 'KeyW');
  for (let i = 0; i < 20; i++) controller.update(0.05);
  assert.equal(camera.position.y, raised, 'hover must not bob with changes in terrain height');
  keyboard(view, 'keyup', 'KeyW');
  keyboard(view, 'keydown', 'ControlLeft');
  controller.update(0.05);
  assert.ok(camera.position.y < raised);
  for (let i = 0; i < 200; i++) controller.update(0.05);
  assert.ok(Math.abs(camera.position.y - ((58 - camera.position.z) * 0.1 + 1.7)) < 1e-9);
  keyboard(view, 'keyup', 'ControlLeft');
  keyboard(view, 'keydown', 'Space');
  controller.update(0.05);
  keyboard(view, 'keydown', 'KeyR');
  assert.equal(camera.position.y, floor);
  controller.update(0.05);
  assert.equal(camera.position.y, floor, 'reset also clears held flight keys');
  controller.dispose();
});

test('ascent is frame-rate independent and bounded, with C as a browser-safe descent alternative', () => {
  const a = setup(), b = setup();
  for (const item of [a, b]) { item.controller.lock(); keyboard(item.view, 'keydown', 'Space'); }
  for (let i = 0; i < 60; i++) a.controller.update(1 / 60);
  for (let i = 0; i < 120; i++) b.controller.update(1 / 120);
  assert.ok(Math.abs(a.camera.position.y - b.camera.position.y) < 1e-9);
  for (let i = 0; i < 1000; i++) a.controller.update(0.05);
  assert.equal(a.camera.position.y, 160);
  const ceiling = a.camera.position.y;
  a.controller.update(0.05);
  assert.equal(a.camera.position.y, ceiling);
  keyboard(a.view, 'keyup', 'Space');
  keyboard(a.view, 'keydown', 'KeyC');
  a.controller.update(0.05);
  assert.ok(a.camera.position.y < ceiling);
  a.controller.dispose(); b.controller.dispose();
});

test('a visitor at Y=80 can ascend, hover and descend without crossing the highland floor', () => {
  for (const fps of [30, 60, 120]) {
    const { view, camera, controller } = setup(() => 80);
    controller.lock();
    keyboard(view, 'keydown', 'Space');
    for (let frame = 0; frame < fps; frame++) controller.update(1 / fps);
    assert.ok(Math.abs(camera.position.y - 87.7) < 1e-8);
    keyboard(view, 'keyup', 'Space');
    const altitude = camera.position.y;
    for (let frame = 0; frame < fps; frame++) controller.update(1 / fps);
    assert.equal(camera.position.y, altitude);
    keyboard(view, 'keydown', 'ControlLeft');
    for (let frame = 0; frame < fps * 3; frame++) controller.update(1 / fps);
    assert.equal(camera.position.y, 81.7);
    controller.dispose();
  }
});

test('hovering crosses steep terrain below the observer without being pulled up a higher cliff', () => {
  for (const fps of [30, 60, 120]) {
    const ground = (_x: number, z: number) => {
      const distance = 58 - z;
      if (distance < 1) return 0;
      if (distance < 2) return (distance - 1) * 4;
      if (distance < 3) return 4 - (distance - 2) * 10;
      if (distance < 4) return -6;
      return Math.min(100, -6 + (distance - 4) * 106);
    };
    const { view, camera, controller } = setup(ground);
    controller.lock();
    keyboard(view, 'keydown', 'Space');
    for (let frame = 0; frame < fps * 2; frame++) controller.update(1 / fps);
    keyboard(view, 'keyup', 'Space');
    const altitude = camera.position.y;
    keyboard(view, 'keydown', 'KeyW');
    for (let frame = 0; frame < fps * 3; frame++) controller.update(1 / fps);
    assert.ok(camera.position.z < 54.1, `lower hills blocked hovering at ${fps} FPS`);
    assert.ok(camera.position.z > 53.8, 'observer crossed the taller cliff');
    assert.equal(camera.position.y, altitude, 'cliff must not pull a hovering observer up');
    controller.dispose();
  }
});

test('Escape, blur and hidden pages pause, and inactive keys do not change the preview camera', () => {
  const { view, doc, camera, controller, pauses } = setup();
  for (const reason of ['Escape', 'blur', 'hidden']) {
    controller.lock();
    keyboard(view, 'keydown', 'KeyW');
    keyboard(view, 'keydown', 'Space');
    if (reason === 'Escape') keyboard(view, 'keydown', 'Escape');
    if (reason === 'blur') view.dispatchEvent(new Event('blur'));
    if (reason === 'hidden') { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }
    assert.equal(controller.isLocked(), false);
    const before = camera.position.clone();
    controller.update(0.05);
    assert.ok(before.equals(camera.position));
    doc.hidden = false;
    controller.lock();
    controller.update(0.05);
    assert.ok(before.equals(camera.position), 'resuming must not replay held movement');
    keyboard(view, 'keydown', 'Escape');
  }
  assert.equal(pauses(), 6);
  camera.position.set(20, 30, 40);
  keyboard(view, 'keydown', 'KeyR');
  assert.deepEqual(camera.position.toArray(), [20, 30, 40]);
  assert.equal(keyboard(view, 'keydown', 'Space').defaultPrevented, false);
  controller.dispose();
  controller.lock();
  assert.equal(controller.isLocked(), false);
});

test('a pending pointer request cannot reactivate roaming after blur or disposal', async () => {
  for (const dispose of [false, true]) {
    const { view, doc, surface, controller, modes } = setup();
    let finish!: () => void;
    surface.requestPointerLock = () => new Promise<void>(resolve => { finish = resolve; });
    controller.lock();
    if (dispose) controller.dispose(); else view.dispatchEvent(new Event('blur'));
    doc.pointerLockElement = surface;
    doc.dispatchEvent(new Event('pointerlockchange'));
    finish();
    await Promise.resolve();
    assert.equal(controller.isLocked(), false);
    assert.equal(doc.pointerLockElement, null);
    assert.deepEqual(modes, []);
    controller.dispose();
  }
});

test('cancelling a pending lock restores the pause menu, including legacy requests', () => {
  for (const reason of ['Escape', 'blur', 'hidden']) {
    const { view, doc, surface, controller, pauses, modes } = setup();
    surface.requestPointerLock = () => undefined;
    controller.lock();
    if (reason === 'Escape') keyboard(view, 'keydown', 'Escape');
    if (reason === 'blur') view.dispatchEvent(new Event('blur'));
    if (reason === 'hidden') { doc.hidden = true; doc.dispatchEvent(new Event('visibilitychange')); }
    assert.equal(pauses(), 1, 'a cancelled entry must restore a usable overlay');
    doc.pointerLockElement = surface;
    doc.dispatchEvent(new Event('pointerlockchange'));
    assert.equal(doc.pointerLockElement, null);
    assert.deepEqual(modes, []);
    controller.dispose();
  }
});

test('a legacy lock acquired after disposal is released without reactivating the controller', () => {
  const { doc, surface, controller, modes } = setup();
  surface.requestPointerLock = () => undefined;
  controller.lock();
  controller.dispose();
  doc.pointerLockElement = surface;
  doc.dispatchEvent(new Event('pointerlockchange'));
  assert.equal(doc.pointerLockElement, null);
  assert.equal(controller.isLocked(), false);
  assert.deepEqual(modes, []);
});
