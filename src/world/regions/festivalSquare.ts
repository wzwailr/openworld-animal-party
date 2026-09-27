import * as THREE from 'three';
import { createAnimal, type AnimalType } from '../../entities/animals';
import { getGroundHeight } from '../terrain';
import { collectAnimations } from '../utils';
import type { Box2D } from '../../core/types';
import { createBandstand, createCelebrationCake, createBunting, woodGrain, blossomGeometry } from '../../entities/festivalLandmarks';

const CAST: ReadonlyArray<[AnimalType, number, number, number, number]> = [
  ['rabbit', 0, -1, 0.9, Math.PI],
  ['squirrel', -4, -2, 0.74, 2.6], ['squirrel', -2.2, -3.6, 0.74, 3.2],
  ['squirrel', 2.2, -3.6, 0.74, 3.1], ['squirrel', 4, -2, 0.74, -2.6],
  ['hedgehog', -7, 8, 0.8, 1.1],
  ['raccoon', 10, -4, 0.82, -1.1],
  ['mole', 7, -10, 0.78, -0.8]
];

function standardMesh(geometry: THREE.BufferGeometry, color: number, name: string, materialOptions: THREE.MeshStandardMaterialParameters = {}): THREE.Mesh {
  const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.86, ...materialOptions }));
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function addFestivalRoleProp(animal: THREE.Group, type: AnimalType): void {
  // 以动物实际包围盒高度为基准定位道具，兼容 GLB 模型（归一化高 1.5）与程序化回退。
  const height = new THREE.Box3().setFromObject(animal).getSize(new THREE.Vector3()).y || 1.5;

  if (type === 'rabbit') {
    animal.userData.role = '兔子指挥家';
    if (!animal.userData.hasIntegratedBaton) {
      const baton = standardMesh(new THREE.CylinderGeometry(0.025, 0.035, 0.9, 6), 0xf2d58e, 'conductor-baton');
      baton.position.set(0.42, height * 0.72, 0.3);
      baton.rotation.z = -0.72;
      animal.add(baton);
    }
    return;
  }
  if (type === 'squirrel') {
    animal.userData.role = '松鼠乐手';
    return;
  }
  if (type === 'hedgehog') {
    animal.userData.role = '刺猬蛋糕师';
    const cake = standardMesh(new THREE.CylinderGeometry(0.38, 0.42, 0.32, 10), 0xffc4ad, 'festival-cake');
    cake.position.set(0.4, height * 0.52, 0.35);
    const chefHat = standardMesh(new THREE.SphereGeometry(0.36, 8, 6), 0xfff4df, 'chef-hat');
    chefHat.position.set(0, height * 1.06, 0);
    chefHat.scale.set(1.25, 0.75, 1);
    animal.add(cake, chefHat);
    return;
  }
  if (type === 'raccoon') {
    animal.userData.role = '浣熊灯笼师';
    const lantern = standardMesh(
      new THREE.CylinderGeometry(0.24, 0.24, 0.48, 8),
      0xffad51,
      'artisan-lantern',
      { emissive: 0xef6f2d, emissiveIntensity: 1.35 }
    );
    lantern.position.set(-0.4, height * 0.6, 0.3);
    animal.add(lantern);
    return;
  }
  animal.userData.role = '鼹鼠工程师';
}

function createFlowerStall(): THREE.Group {
  const stall = new THREE.Group();
  stall.name = 'flower-stall';
  stall.position.set(-12, getGroundHeight(-12, 8), 8);
  const counter = standardMesh(new THREE.BoxGeometry(4.2, 1.05, 1.6), 0x987d58, 'stall-counter', { map: woodGrain() });
  counter.position.y = 0.55;
  const canopyGeo = new THREE.PlaneGeometry(5, 2.6, 20, 8).rotateX(-Math.PI / 2);
  const points = canopyGeo.attributes.position, clothColors: number[] = [], clothColor = new THREE.Color();
  for (let i = 0; i < points.count; i++) {
    const x = points.getX(i), z = points.getZ(i);
    points.setY(i, 3.02 + Math.cos(x * Math.PI / 5) * 0.35 + Math.sin(z * 8) * 0.018);
    clothColor.setHex(Math.floor((x + 2.5) * 2) % 2 ? 0xeee0b8 : 0xb87863);
    clothColors.push(clothColor.r, clothColor.g, clothColor.b);
  }
  canopyGeo.setAttribute('color', new THREE.Float32BufferAttribute(clothColors, 3)); canopyGeo.computeVertexNormals();
  const canopy = standardMesh(canopyGeo, 0xffffff, 'stall-canopy', { vertexColors: true, side: THREE.DoubleSide, roughness: 1 });
  const posts = new THREE.Group(); posts.name = 'stall-support-posts';
  for (const x of [-2.05, 2.05]) for (const z of [-0.68, 0.68]) {
    const post = standardMesh(new THREE.BoxGeometry(0.13, 3.15, 0.13), 0x756046, 'stall-post', { map: woodGrain() });
    post.position.set(x, 1.575, z); posts.add(post);
  }
  stall.add(posts);
  for (let i = 0; i < 13; i++) {
    const board = standardMesh(new THREE.BoxGeometry(0.305, 0.93, 0.055), i%3 ? 0x9c8057 : 0x88754f, 'counter-board', { map: woodGrain() });
    board.position.set(-1.93 + i * 0.322, 0.56, 0.83); stall.add(board);
  }
  stall.add(counter, canopy);
  const flowerColors = [0xffd15c, 0xef7085, 0x8c70c8, 0xf3a55f, 0xe8637c];
  flowerColors.forEach((color, index) => {
    const x = -1.3 + index * 0.65;
    const pot = standardMesh(new THREE.CylinderGeometry(0.23, 0.16, 0.3, 12), 0xb08765, 'flower-pot');
    pot.position.set(x, 1.23, 0);
    const stem = standardMesh(new THREE.CylinderGeometry(0.016, 0.025, 0.38, 4), 0x587747, 'stall-flower-stem');
    stem.position.set(x, 1.5, 0);
    const flower = standardMesh(blossomGeometry(), color, 'stall-flower');
    flower.position.set(x, 1.7, 0); flower.rotation.x = 0.3;
    stall.add(pot, stem, flower);
  });
  return stall;
}

function createTableSet(x: number, z: number): THREE.Group {
  const set = new THREE.Group();
  set.name = 'festival-table-set';
  set.position.set(x, getGroundHeight(x, z), z);
  const tabletop = standardMesh(new THREE.CylinderGeometry(1.25, 1.25, 0.16, 24), 0xb39768, 'table', { map: woodGrain() });
  tabletop.position.y = 1.15;
  const leg = standardMesh(new THREE.CylinderGeometry(0.13, 0.18, 1.1, 7), 0x72503a, 'table-leg');
  leg.position.y = 0.58;
  set.add(tabletop, leg);
  for (const angle of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    const chair = new THREE.Group(); chair.name = 'chair';
    const seat = standardMesh(new THREE.CylinderGeometry(0.35, 0.37, 0.12, 12), 0x9c805d, 'stool-seat', { map: woodGrain() });
    seat.position.y = 0.58; chair.add(seat);
    for (let leg = 0; leg < 3; leg++) {
      const a = leg * Math.PI * 2 / 3;
      const support = standardMesh(new THREE.CylinderGeometry(0.045, 0.065, 0.55, 5), 0x776449, 'stool-leg');
      support.position.set(Math.sin(a) * 0.22, 0.28, Math.cos(a) * 0.22); chair.add(support);
    }
    chair.position.set(Math.sin(angle) * 1.85, 0, Math.cos(angle) * 1.85);
    set.add(chair);
  }
  return set;
}

function createFestivalLights(): THREE.Group {
  const lights = new THREE.Group();
  lights.name = 'festival-light-string';
  const bulbs: THREE.Mesh[] = [];
  const points: Array<[number, number]> = [[-16, -13], [-10, -16], [-3, -17], [4, -17], [11, -15], [16, -10], [17, -3]];
  points.forEach(([x, z], index) => {
    const bulb = standardMesh(
      new THREE.SphereGeometry(0.25, 7, 5),
      index % 2 ? 0xff8d6e : 0xffd26b,
      'festival-bulb',
      { emissive: index % 2 ? 0xc74336 : 0xd8872f, emissiveIntensity: 1.2 }
    );
    bulb.position.set(x, getGroundHeight(x, z) + 4.4, z);
    bulbs.push(bulb);
    lights.add(bulb);
  });
  lights.userData.update = (time: number) => {
    bulbs.forEach((bulb, index) => {
      (bulb.material as THREE.MeshStandardMaterial).emissiveIntensity = 1.05 + Math.sin(time * 2 + index * 0.7) * 0.25;
    });
  };
  return lights;
}

export function createFestivalSquare() {
  const group = new THREE.Group();
  group.name = 'region:festival-square';
  const colliders: Box2D[] = [];
  const bandstand = createBandstand();
  group.add(bandstand, createCelebrationCake(), createBunting());
  colliders.push(...bandstand.userData.colliders as Box2D[]);
  colliders.push({ minX: -11.3, maxX: -6.7, minZ: 3.7, maxZ: 8.3 });

  for (const [type, x, z, scale, rotationY] of CAST) {
    const animal = createAnimal(type, { x, y: type === 'rabbit' || type === 'squirrel' ? 1.35 : getGroundHeight(x, z), z, scale, rotationY });
    addFestivalRoleProp(animal, type);
    group.add(animal);
  }

  group.add(createFlowerStall());
  colliders.push({ minX: -14.2, maxX: -9.8, minZ: 7.1, maxZ: 8.9 });

  for (const [x, z] of [[-7, -10], [0, -12], [12, 7]]) {
    group.add(createTableSet(x, z));
    colliders.push({ minX: x - 1.3, maxX: x + 1.3, minZ: z - 1.3, maxZ: z + 1.3 });
  }

  group.add(createFestivalLights());
  return { group, colliders, animations: collectAnimations(group) };
}
