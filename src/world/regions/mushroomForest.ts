import * as THREE from 'three';
import { createAnimal } from '../../entities/animals';
import { createLantern, createMushroom, createTree } from '../../entities/props';
import { getGroundHeight } from '../terrain';
import { collectAnimations } from '../utils';
import type { Box2D } from '../../core/types';

const MUSHROOMS: ReadonlyArray<[number, number, number, number, number]> = [
  [-58, -25, 1.7, 2.4, 0xb84f6a], [-53, -14, 1.25, 2.05, 0xda6b52],
  [-49, -29, 0.95, 1.55, 0x7d62a9], [-44, -20, 1.55, 2.3, 0xe08349],
  [-39, -11, 1.05, 1.75, 0xcc5267], [-35, -24, 1.35, 2.1, 0x786ab2],
  [-61, -11, 0.8, 1.35, 0xdb8653], [-55, -34, 1.1, 1.8, 0xb75078],
  [-47, -8, 0.72, 1.2, 0xe69755], [-42, -34, 0.9, 1.5, 0x8260a8],
  [-33, -16, 0.78, 1.3, 0xcd5e55], [-51, -20, 0.62, 1.05, 0xf09b62]
];

const PATH_TREES: ReadonlyArray<[number, number, number]> = [
  [-63, -31, 0.82], [-60, -5, 0.9], [-47, -38, 0.78], [-31, -31, 0.88],
  [-28, -10, 0.84], [-38, 2, 0.76], [-68, -17, 0.86]
];

function createWindChimeLantern(x: number, z: number): THREE.Group {
  const lantern = createLantern({ x, y: getGroundHeight(x, z), z, scale: 0.9 });
  lantern.name = 'wind-chime-lantern';
  const chimeMaterial = new THREE.MeshStandardMaterial({ color: 0xd4b86c, metalness: 0.55, roughness: 0.38 });
  for (const offset of [-0.13, 0, 0.13]) {
    const chime = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.035, 0.42, 6), chimeMaterial);
    chime.name = 'wind-chime';
    chime.position.set(0.82 + offset, 2.05 - Math.abs(offset), 0);
    lantern.add(chime);
  }
  return lantern;
}

export function createMushroomForest() {
  const group = new THREE.Group();
  group.name = 'region:mushroom-forest';
  const colliders: Box2D[] = [];

  for (const [x, z, scale, height, capColor] of MUSHROOMS) {
    const mushroom = createMushroom({ x, y: getGroundHeight(x, z), z, scale, height, capColor, spots: true, glow: true });
    group.add(mushroom);
    colliders.push(mushroom.userData.collider as Box2D);
  }

  for (const [x, z] of [[-57, -18], [-45, -4], [-34, -27]]) {
    group.add(createWindChimeLantern(x, z));
  }

  const owl = createAnimal('owl', {
    x: -42,
    y: getGroundHeight(-42, -16),
    z: -16,
    scale: 0.9,
    rotationY: -0.5
  });
  owl.userData.role = '猫头鹰邮差';
  group.add(owl);

  for (const [x, z, scale] of PATH_TREES) {
    const tree = createTree({ x, y: getGroundHeight(x, z), z, scale, detail: 'far', foliageColor: 0x447c55 });
    group.add(tree);
    colliders.push(tree.userData.collider as Box2D);
  }

  return { group, colliders, animations: collectAnimations(group) };
}
