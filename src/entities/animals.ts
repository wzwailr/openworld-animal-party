import * as THREE from 'three';
import { clone as cloneSkeleton } from 'three/addons/utils/SkeletonUtils.js';
import type { Placement } from '../core/types';
import { selectPreferredClip } from './animation';
import { getAnimalAsset, RABBIT_MODEL_URLS, type AnimalAsset } from './modelLibrary';

export const ANIMAL_TYPES = [
  'rabbit',
  'squirrel',
  'hedgehog',
  'fox',
  'otter',
  'raccoon',
  'deer',
  'owl',
  'mole',
  'frog'
] as const;

export type AnimalType = (typeof ANIMAL_TYPES)[number];

const PALETTES: Record<AnimalType, [number, number]> = {
  rabbit: [0xf2e4d2, 0xe9adbd],
  squirrel: [0xb76838, 0xf0c67f],
  hedgehog: [0x9b6744, 0xe0b986],
  fox: [0xd76c35, 0xf3d5ad],
  otter: [0x805438, 0xc69a70],
  raccoon: [0x777b7d, 0xd1d0c8],
  deer: [0xac7646, 0xead0a4],
  owl: [0x9a7652, 0xe7d1a5],
  mole: [0x65574f, 0xc9998b],
  frog: [0x72a94f, 0xc4dc74]
};

// Per-type body proportions: body scale (x,y,z), body Y, head Y/scale, limb radius/length.
// Replaces the single shared body plan so each critter gets its own silhouette.
const PROPORTIONS: Record<
  AnimalType,
  { body: [number, number, number]; bodyY: number; headY: number; headScale: number; limbRadius: number; limbLength: number }
> = {
  rabbit: { body: [0.82, 1.06, 0.72], bodyY: 1.16, headY: 2.0, headScale: 1.0, limbRadius: 0.11, limbLength: 0.52 },
  squirrel: { body: [0.8, 1.1, 0.7], bodyY: 1.16, headY: 2.02, headScale: 1.06, limbRadius: 0.1, limbLength: 0.46 },
  hedgehog: { body: [1.0, 0.8, 0.86], bodyY: 1.02, headY: 1.86, headScale: 0.94, limbRadius: 0.09, limbLength: 0.3 },
  fox: { body: [0.78, 1.1, 0.66], bodyY: 1.2, headY: 2.1, headScale: 1.06, limbRadius: 0.1, limbLength: 0.54 },
  otter: { body: [0.72, 1.02, 0.9], bodyY: 1.1, headY: 1.98, headScale: 0.98, limbRadius: 0.1, limbLength: 0.42 },
  raccoon: { body: [0.85, 1.0, 0.72], bodyY: 1.12, headY: 1.98, headScale: 1.0, limbRadius: 0.1, limbLength: 0.46 },
  deer: { body: [0.72, 1.18, 0.6], bodyY: 1.3, headY: 2.25, headScale: 0.95, limbRadius: 0.09, limbLength: 0.62 },
  owl: { body: [0.92, 1.0, 0.8], bodyY: 1.14, headY: 2.0, headScale: 1.12, limbRadius: 0.09, limbLength: 0.3 },
  mole: { body: [0.96, 0.84, 0.86], bodyY: 1.05, headY: 1.9, headScale: 0.92, limbRadius: 0.1, limbLength: 0.34 },
  frog: { body: [0.9, 0.78, 0.8], bodyY: 1.0, headY: 1.9, headScale: 1.05, limbRadius: 0.09, limbLength: 0.44 }
};

const materialCache = new Map<number, THREE.MeshStandardMaterial>();

function material(color: number, options: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
  if (Object.keys(options).length === 0) {
    let cached = materialCache.get(color);
    if (!cached) {
      cached = new THREE.MeshStandardMaterial({ color, roughness: 0.58 });
      materialCache.set(color, cached);
    }
    return cached;
  }
  return new THREE.MeshStandardMaterial({ color, roughness: 0.58, ...options });
}

function mesh(geometry: THREE.BufferGeometry, color: number, name: string): THREE.Mesh {
  const object = new THREE.Mesh(geometry, material(color));
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

const EYE_GLOSS = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.16 });
const EYE_HIGHLIGHT = new THREE.MeshBasicMaterial({ color: 0xffffff });

function addEye(head: THREE.Group, x: number, y: number, z: number, scale = 1): THREE.Group {
  const eye = new THREE.Group();
  eye.name = 'eye';
  eye.position.set(x, y, z);

  const white = new THREE.Mesh(new THREE.SphereGeometry(0.14 * scale, 14, 10), EYE_GLOSS);
  white.name = 'eye-white';
  white.scale.z = 0.55;

  const pupil = mesh(new THREE.SphereGeometry(0.072 * scale, 12, 8), 0x24212a, 'eye-pupil');
  pupil.position.set(0, 0, 0.1 * scale);

  const highlight = new THREE.Mesh(new THREE.SphereGeometry(0.03 * scale, 8, 6), EYE_HIGHLIGHT);
  highlight.name = 'eye-highlight';
  highlight.position.set(0.042 * scale, 0.045 * scale, 0.115 * scale);

  eye.add(white, pupil, highlight);
  head.add(eye);
  return eye;
}

function addBlush(head: THREE.Group): void {
  for (const x of [-0.34, 0.34]) {
    const blush = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 10, 7),
      new THREE.MeshStandardMaterial({ color: 0xff9e9e, roughness: 0.9, transparent: true, opacity: 0.55 })
    );
    blush.name = 'blush';
    blush.position.set(x, -0.18, 0.42);
    blush.scale.set(1, 0.5, 0.35);
    head.add(blush);
  }
}

function addSnout(head: THREE.Group, accentColor: number, type: AnimalType): void {
  const muzzle = mesh(new THREE.SphereGeometry(0.2, 12, 8), accentColor, 'muzzle');
  if (type === 'deer') {
    muzzle.position.set(0, -0.22, 0.5);
    muzzle.scale.set(0.8, 0.7, 0.9);
  } else {
    muzzle.position.set(0, -0.14, 0.46);
    muzzle.scale.set(0.62, 0.5, 0.6);
  }
  head.add(muzzle);
}

function addBeak(head: THREE.Group): void {
  const beak = mesh(new THREE.ConeGeometry(0.1, 0.24, 6), 0xd8a24a, 'beak');
  beak.position.set(0, -0.02, 0.52);
  beak.rotation.x = -Math.PI / 2;
  head.add(beak);
}

function addMouth(head: THREE.Group): void {
  const mouth = mesh(new THREE.SphereGeometry(0.14, 10, 6), 0x3a5a2f, 'frog-mouth');
  mouth.position.set(0, -0.12, 0.5);
  mouth.scale.set(0.9, 0.18, 0.5);
  head.add(mouth);
}

function addWhiskers(head: THREE.Group): void {
  const whiskerMaterial = material(0x4a3a30);
  for (const side of [-1, 1]) {
    for (let index = 0; index < 3; index += 1) {
      const whisker = new THREE.Mesh(new THREE.CylinderGeometry(0.007, 0.007, 0.26, 4), whiskerMaterial);
      whisker.name = 'whisker';
      whisker.rotation.z = side * (0.95 + index * 0.25);
      whisker.position.set(side * 0.16, -0.08 + index * 0.07, 0.42);
      head.add(whisker);
    }
  }
}

interface EarOptions {
  height?: number;
  width?: number;
  rotation?: number;
}

function addEar(head: THREE.Group, x: number, color: number, { height = 0.62, width = 0.24, rotation = 0 }: EarOptions = {}): THREE.Mesh {
  const ear = mesh(new THREE.CapsuleGeometry(width / 2, height - width, 4, 10), color, 'ear');
  ear.position.set(x, 0.55, -0.04);
  ear.rotation.z = rotation;
  ear.userData.baseRotation = rotation;
  head.add(ear);
  return ear;
}

function addPointedEar(head: THREE.Group, x: number, color: number, { height = 0.78, width = 0.34, rotation = 0 }: EarOptions = {}): THREE.Mesh {
  const ear = mesh(new THREE.ConeGeometry(width / 2, height, 6), color, 'ear');
  ear.position.set(x, 0.58, -0.04);
  ear.rotation.z = rotation;
  ear.userData.baseRotation = rotation;
  head.add(ear);
  return ear;
}

interface TailOptions {
  length?: number;
  width?: number;
  flat?: boolean;
}

function addTail(root: THREE.Group, color: number, { length = 0.75, width = 0.24, flat = false }: TailOptions = {}): THREE.Mesh {
  const tail = mesh(
    flat ? new THREE.SphereGeometry(0.5, 10, 8) : new THREE.CapsuleGeometry(width, Math.max(0.12, length - width * 2), 4, 10),
    color,
    'tail'
  );
  tail.position.set(0, 1.05, -0.58);
  tail.rotation.x = flat ? Math.PI / 2 : 0.95;
  if (flat) tail.scale.set(0.5, 0.16, length);
  root.add(tail);
  return tail;
}

function addGlasses(head: THREE.Group): void {
  const gold = material(0xe4ba55, { metalness: 0.35, roughness: 0.4 });
  for (const x of [-0.2, 0.2]) {
    const lens = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.025, 6, 16), gold);
    lens.name = 'golden-glasses';
    lens.position.set(x, 0.05, 0.48);
    head.add(lens);
  }
  const bridge = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.025, 0.025), gold);
  bridge.name = 'glasses-bridge';
  bridge.position.set(0, 0.05, 0.48);
  head.add(bridge);
}

function addInstrument(root: THREE.Group): void {
  const instrument = new THREE.Group();
  instrument.name = 'acorn-ukulele';
  const body = mesh(new THREE.SphereGeometry(0.27, 10, 8), 0xbc7641, 'instrument-body');
  body.scale.set(0.8, 1.15, 0.35);
  const neck = mesh(new THREE.BoxGeometry(0.1, 0.65, 0.08), 0x73472f, 'instrument-neck');
  neck.position.y = 0.42;
  instrument.position.set(0.42, 1.25, 0.48);
  instrument.rotation.z = -0.55;
  instrument.add(body, neck);
  root.add(instrument);
}

function addLanternAccessory(root: THREE.Group): void {
  const accessory = new THREE.Group();
  accessory.name = 'hand-lantern';
  const handle = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.025, 6, 12, Math.PI), material(0x4e382b));
  handle.position.y = 0.18;
  const light = mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.38, 8), 0xffb649, 'lantern-glow');
  const lightMaterial = light.material as THREE.MeshStandardMaterial;
  lightMaterial.emissive.setHex(0xff7f2b);
  lightMaterial.emissiveIntensity = 1.4;
  accessory.position.set(0.55, 0.75, 0.12);
  accessory.add(handle, light);
  root.add(accessory);
}

function addPaddle(root: THREE.Group): void {
  const paddle = new THREE.Group();
  paddle.name = 'wooden-paddle';
  const shaft = mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 8), 0x7e5638, 'paddle-shaft');
  const blade = mesh(new THREE.SphereGeometry(0.18, 9, 7), 0xa86c3b, 'paddle-blade');
  blade.scale.set(1, 1.8, 0.28);
  blade.position.y = -0.82;
  paddle.position.set(0.46, 1.3, 0.35);
  paddle.rotation.z = 0.45;
  paddle.add(shaft, blade);
  root.add(paddle);
}

function addSpikes(root: THREE.Group): void {
  const spikeMaterial = material(0x624433);
  const spikes: Array<[number, number, number, number]> = [
    [-0.38, 1.35, -0.25, -0.5], [0, 1.55, -0.3, 0], [0.38, 1.35, -0.25, 0.5],
    [-0.28, 1.02, -0.47, -0.35], [0.28, 1.02, -0.47, 0.35], [0, 0.78, -0.48, 0]
  ];
  for (const [x, y, z, rotationZ] of spikes) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.58, 6), spikeMaterial);
    spike.name = 'back-spike';
    spike.position.set(x, y, z);
    spike.rotation.z = rotationZ;
    root.add(spike);
  }
}

function addRaccoonMask(head: THREE.Group): void {
  const mask = mesh(new THREE.SphereGeometry(0.48, 12, 8), 0x35343a, 'raccoon-mask');
  mask.position.set(0, 0.03, 0.3);
  mask.scale.set(0.92, 0.32, 0.16);
  head.add(mask);
}

function addStripedTail(root: THREE.Group): THREE.Group {
  const tail = new THREE.Group();
  tail.name = 'striped-tail';
  tail.position.set(0, 1.08, -0.66);
  tail.rotation.x = 0.9;
  for (let index = 0; index < 5; index += 1) {
    const segment = mesh(new THREE.CylinderGeometry(0.2 - index * 0.018, 0.22 - index * 0.018, 0.22, 9), index % 2 ? 0x34363a : 0x8b8e8d, 'tail-stripe');
    segment.position.y = index * 0.2;
    tail.add(segment);
  }
  root.add(tail);
  return tail;
}

function addAntlers(head: THREE.Group): void {
  const antlerMaterial = material(0x6d4933);
  for (const side of [-1, 1]) {
    const antler = new THREE.Group();
    antler.name = 'antler';
    antler.position.set(side * 0.3, 0.5, -0.02);
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.05, 0.75, 6), antlerMaterial);
    stem.rotation.z = side * -0.25;
    stem.position.y = 0.31;
    antler.add(stem);
    for (const y of [0.28, 0.5]) {
      const branch = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.34, 6), antlerMaterial);
      branch.position.set(side * 0.13, y, 0);
      branch.rotation.z = side * -0.85;
      antler.add(branch);
    }
    head.add(antler);
  }
}

function addFlowerCape(root: THREE.Group): void {
  const cape = mesh(new THREE.ConeGeometry(0.72, 1.25, 12, 1, true), 0xc95975, 'flower-cape');
  cape.position.set(0, 1.27, -0.28);
  cape.rotation.x = Math.PI;
  cape.scale.z = 0.35;
  root.add(cape);
  for (const x of [-0.32, 0, 0.32]) {
    const flower = mesh(new THREE.SphereGeometry(0.08, 8, 6), 0xffd36b, 'cape-flower');
    flower.position.set(x, 1.48 - Math.abs(x) * 0.3, 0.5);
    root.add(flower);
  }
}

function addWingsAndMailbag(root: THREE.Group, bodyColor: number): void {
  for (const side of [-1, 1]) {
    const wing = mesh(new THREE.SphereGeometry(0.5, 10, 8), bodyColor, 'owl-wing');
    wing.position.set(side * 0.56, 1.2, 0);
    wing.scale.set(0.35, 1.15, 0.55);
    wing.rotation.z = side * 0.2;
    root.add(wing);
  }
  const bag = mesh(new THREE.BoxGeometry(0.6, 0.48, 0.24), 0x8f4734, 'mailbag');
  bag.position.set(0.45, 0.95, 0.48);
  root.add(bag);
}

function addSafetyHelmet(head: THREE.Group): void {
  const helmet = mesh(new THREE.SphereGeometry(0.55, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2), 0xf5bc39, 'safety-helmet');
  helmet.position.y = 0.3;
  const brim = mesh(new THREE.BoxGeometry(1.05, 0.09, 0.68), 0xe9a927, 'helmet-brim');
  brim.position.set(0, 0.28, 0.08);
  head.add(helmet, brim);
}

function addMagicHat(head: THREE.Group): void {
  const brim = mesh(new THREE.CylinderGeometry(0.58, 0.58, 0.1, 16), 0x49356d, 'magic-hat-brim');
  brim.position.y = 0.49;
  const crown = mesh(new THREE.ConeGeometry(0.4, 0.85, 12), 0x634489, 'magic-hat-crown');
  crown.position.y = 0.94;
  crown.rotation.z = -0.12;
  head.add(brim, crown);
}

interface TypeDetails {
  tail: THREE.Object3D | null;
  ears: THREE.Mesh[];
}

function addTypeDetails(type: AnimalType, root: THREE.Group, head: THREE.Group, bodyColor: number, accentColor: number): TypeDetails {
  const ears: THREE.Mesh[] = [];
  switch (type) {
    case 'rabbit':
      ears.push(addEar(head, -0.24, bodyColor, { height: 1.15, width: 0.24, rotation: -0.12 }));
      ears.push(addEar(head, 0.24, bodyColor, { height: 1.15, width: 0.24, rotation: 0.12 }));
      addGlasses(head);
      return { tail: addTail(root, accentColor, { length: 0.4, width: 0.22 }), ears };
    case 'squirrel': {
      ears.push(addEar(head, -0.28, bodyColor, { height: 0.48, width: 0.25, rotation: -0.35 }));
      ears.push(addEar(head, 0.28, bodyColor, { height: 0.48, width: 0.25, rotation: 0.35 }));
      const tail = addTail(root, bodyColor, { length: 1.5, width: 0.45 });
      tail.scale.set(1.2, 1.2, 1.2);
      tail.position.y = 1.25;
      addInstrument(root);
      return { tail, ears };
    }
    case 'hedgehog':
      ears.push(addEar(head, -0.27, bodyColor, { height: 0.34, width: 0.2, rotation: -0.35 }));
      ears.push(addEar(head, 0.27, bodyColor, { height: 0.34, width: 0.2, rotation: 0.35 }));
      addSpikes(root);
      return { tail: addTail(root, accentColor, { length: 0.28, width: 0.15 }), ears };
    case 'fox':
      ears.push(addPointedEar(head, -0.3, bodyColor, { rotation: -0.35 }));
      ears.push(addPointedEar(head, 0.3, bodyColor, { rotation: 0.35 }));
      addLanternAccessory(root);
      return { tail: addTail(root, bodyColor, { length: 1.3, width: 0.34 }), ears };
    case 'otter':
      ears.push(addEar(head, -0.31, bodyColor, { height: 0.3, width: 0.22, rotation: -0.4 }));
      ears.push(addEar(head, 0.31, bodyColor, { height: 0.3, width: 0.22, rotation: 0.4 }));
      addPaddle(root);
      return { tail: addTail(root, bodyColor, { length: 1.05, flat: true }), ears };
    case 'raccoon':
      ears.push(addEar(head, -0.31, bodyColor, { height: 0.4, width: 0.27, rotation: -0.4 }));
      ears.push(addEar(head, 0.31, bodyColor, { height: 0.4, width: 0.27, rotation: 0.4 }));
      addRaccoonMask(head);
      return { tail: addStripedTail(root), ears };
    case 'deer':
      ears.push(addEar(head, -0.38, accentColor, { height: 0.5, width: 0.22, rotation: -0.8 }));
      ears.push(addEar(head, 0.38, accentColor, { height: 0.5, width: 0.22, rotation: 0.8 }));
      addAntlers(head);
      addFlowerCape(root);
      return { tail: addTail(root, accentColor, { length: 0.38, width: 0.18 }), ears };
    case 'owl':
      ears.push(addEar(head, -0.27, bodyColor, { height: 0.38, width: 0.22, rotation: -0.48 }));
      ears.push(addEar(head, 0.27, bodyColor, { height: 0.38, width: 0.22, rotation: 0.48 }));
      addWingsAndMailbag(root, bodyColor);
      return { tail: addTail(root, bodyColor, { length: 0.35, width: 0.18 }), ears };
    case 'mole':
      ears.push(addEar(head, -0.3, accentColor, { height: 0.28, width: 0.2, rotation: -0.4 }));
      ears.push(addEar(head, 0.3, accentColor, { height: 0.28, width: 0.2, rotation: 0.4 }));
      addSafetyHelmet(head);
      return { tail: addTail(root, accentColor, { length: 0.32, width: 0.12 }), ears };
    case 'frog':
      addMagicHat(head);
      return { tail: addTail(root, bodyColor, { length: 0.22, width: 0.11 }), ears };
  }
}

interface AnimalOptions extends Placement {
  animationPhase?: number;
}

/** 用加载好的 GLB 模型构建动物实例，并在有骨骼动作时优先播放角色动作。 */
function createModelAnimal(
  type: AnimalType,
  asset: AnimalAsset,
  options: AnimalOptions
): THREE.Group {
  const group = new THREE.Group();
  group.name = `animal:${type}`;
  group.userData.assetSourceUrl = asset.sourceUrl;
  group.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
  group.rotation.y = (options.rotationY ?? 0) - (type === 'rabbit' && asset.sourceUrl === RABBIT_MODEL_URLS.v5 ? Math.PI : 0);
  const instance = cloneSkeleton(asset.prototype);
  group.add(instance);

  const instanceScale = options.scale ?? 1;
  group.scale.setScalar(instanceScale);
  const phase = options.animationPhase ?? ANIMAL_TYPES.indexOf(type) * 0.61;
  const baseY = group.position.y;
  const baseYaw = group.rotation.y;
  const clip = selectPreferredClip(asset.animations, type === 'rabbit' ? ['Conduct', 'Idle', 'Walk'] : ['Idle', 'Walk']);
  const mixer = clip ? new THREE.AnimationMixer(instance) : null;
  if (mixer && clip) mixer.clipAction(clip).play();
  group.userData.hasIntegratedBaton = type === 'rabbit' && (asset.sourceUrl === RABBIT_MODEL_URLS.v5 || asset.animations.length > 0);

  group.userData.update = (time: number) => {
    const t = time + phase;
    if (asset.sourceUrl === RABBIT_MODEL_URLS.v5 && !clip) {
      group.scale.setScalar(instanceScale);
      return;
    }
    if (mixer && clip) {
      mixer.setTime(t % clip.duration);
      group.scale.setScalar(instanceScale);
      return;
    }
    group.position.y = baseY + Math.sin(t * 1.4) * 0.05;
    group.rotation.y = baseYaw + Math.sin(t * 0.7) * 0.045;
    const breath = 1 + Math.sin(t * 1.7) * 0.018;
    group.scale.setScalar(instanceScale * breath);
  };

  return group;
}

export function createAnimal(type: AnimalType, options: AnimalOptions = {}): THREE.Group {
  if (!ANIMAL_TYPES.includes(type)) throw new Error(`未知动物类型: ${type}`);

  const asset = getAnimalAsset(type);
  if (asset) return createModelAnimal(type, asset, options);

  const [bodyColor, accentColor] = PALETTES[type];
  const proportions = PROPORTIONS[type];
  const group = new THREE.Group();
  group.name = `animal:${type}`;
  group.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
  group.rotation.y = options.rotationY ?? 0;
  group.scale.setScalar(options.scale ?? 1);

  const body = mesh(new THREE.SphereGeometry(0.63, 16, 12), bodyColor, 'torso');
  body.position.y = proportions.bodyY;
  body.scale.set(proportions.body[0], proportions.body[1], proportions.body[2]);

  const belly = mesh(new THREE.SphereGeometry(0.43, 14, 10), accentColor, 'belly');
  belly.position.set(0, proportions.bodyY - 0.04, 0.43);
  belly.scale.z = 0.25;

  const head = new THREE.Group();
  head.name = 'head';
  head.position.set(0, proportions.headY, 0.03);
  head.scale.setScalar(proportions.headScale);
  const face = mesh(new THREE.SphereGeometry(0.55, 16, 12), bodyColor, 'face');
  face.scale.set(0.94, 0.9, 0.92);
  head.add(face);

  const eyeY = type === 'frog' ? 0.18 : 0.06;
  const eyeScale = type === 'frog' ? 1.55 : type === 'owl' ? 1.35 : 1;
  const eyes: THREE.Group[] = [];
  eyes.push(addEye(head, -0.2, eyeY, 0.45, eyeScale));
  eyes.push(addEye(head, 0.2, eyeY, 0.45, eyeScale));

  if (type === 'owl') {
    addBeak(head);
  } else if (type === 'frog') {
    addMouth(head);
  } else {
    const nose = mesh(new THREE.SphereGeometry(0.09, 9, 7), 0x3b2b2c, 'nose');
    nose.position.set(0, -0.11, 0.52);
    nose.scale.set(1, 0.7, 0.7);
    head.add(nose);
    if (type === 'fox' || type === 'otter' || type === 'raccoon' || type === 'deer') {
      addSnout(head, accentColor, type);
    }
    if (type === 'fox' || type === 'rabbit' || type === 'raccoon') {
      addWhiskers(head);
    }
  }

  if (type !== 'owl' && type !== 'mole') addBlush(head);

  const limbs: THREE.Mesh[] = [];
  const pawColor = type === 'deer' ? 0x3a2b22 : accentColor;
  const limbLayout: Array<[number, number, number, number]> = [
    [-0.5, 0.1, 0.08, 0.22], [0.5, 0.1, 0.08, -0.22],
    [-0.3, -0.75, 0.03, 0.04], [0.3, -0.75, 0.03, -0.04]
  ];
  for (const [x, yOffset, z, rotationZ] of limbLayout) {
    const isArm = yOffset > 0;
    const limb = mesh(new THREE.CapsuleGeometry(proportions.limbRadius, proportions.limbLength, 4, 10), bodyColor, isArm ? 'arm' : 'leg');
    limb.position.set(x, proportions.bodyY + yOffset, z);
    limb.rotation.z = rotationZ;
    group.add(limb);
    limbs.push(limb);

    const paw = mesh(
      type === 'deer' ? new THREE.ConeGeometry(proportions.limbRadius * 1.3, proportions.limbRadius * 1.8, 5) : new THREE.SphereGeometry(proportions.limbRadius * 1.35, 8, 6),
      pawColor,
      isArm ? 'hand' : 'foot'
    );
    if (isArm) {
      paw.position.set(x * 1.35, proportions.bodyY + yOffset - 0.06, z);
    } else {
      paw.position.set(x, proportions.bodyY + yOffset - proportions.limbLength / 2 - proportions.limbRadius * 0.5, z);
    }
    group.add(paw);
  }

  group.add(body, belly, head);
  const { tail, ears } = addTypeDetails(type, group, head, bodyColor, accentColor);
  const phase = options.animationPhase ?? ANIMAL_TYPES.indexOf(type) * 0.61;

  group.userData.update = (time: number) => {
    const t = time + phase;
    const breath = Math.sin(t * 1.7);
    // squash-and-stretch: volume roughly preserved as the torso breathes.
    body.scale.y = proportions.body[1] + breath * 0.03;
    body.scale.x = proportions.body[0] - breath * 0.012;
    body.scale.z = proportions.body[2] - breath * 0.012;

    head.rotation.x = Math.sin(t * 1.15) * 0.045;
    limbs[0].rotation.z = 0.22 + Math.sin(t * 1.35) * 0.055;
    limbs[1].rotation.z = -0.22 - Math.sin(t * 1.35) * 0.055;
    limbs[2].rotation.z = 0.04 + Math.sin(t * 1.35 + Math.PI) * 0.02;
    limbs[3].rotation.z = -0.04 - Math.sin(t * 1.35 + Math.PI) * 0.02;
    if (tail) tail.rotation.z = Math.sin(t * 1.65) * 0.1;

    // brief periodic blink (clamp keeps the eye from inverting).
    const blink = Math.pow(0.5 + 0.5 * Math.sin(t * 0.9 + phase * 2), 24);
    const eyeYScale = THREE.MathUtils.clamp(1 - blink * 0.85, 0.1, 1);
    for (const eye of eyes) eye.scale.y = eyeYScale;

    // occasional ear twitch on top of a faint sway.
    ears.forEach((ear, index) => {
      const base = (ear.userData.baseRotation as number) ?? 0;
      const twitch = Math.pow(0.5 + 0.5 * Math.sin(t * 0.7 + index * 2.1), 30);
      ear.rotation.z = base + twitch * 0.22;
    });
  };

  return group;
}
