import * as THREE from 'three';
import { createAnimal } from '../../entities/animals';
import { createLantern, createTreehouse } from '../../entities/props';
import { getGroundHeight } from '../terrain';
import { collectAnimations } from '../utils';
import type { Box2D } from '../../core/types';

function createReturnLantern(x: number, z: number, rotationY: number): THREE.Group {
  const lantern = createLantern({ x, y: getGroundHeight(x, z), z, scale: 0.9, rotationY });
  lantern.name = 'return-direction-lantern';
  const arrow = new THREE.Mesh(
    new THREE.ConeGeometry(0.26, 0.55, 3),
    new THREE.MeshStandardMaterial({ color: 0xffe199, emissive: 0xff9b43, emissiveIntensity: 1.4 })
  );
  arrow.name = 'return-arrow';
  arrow.position.set(-0.5, 2.25, 0);
  arrow.rotation.z = Math.PI / 2;
  lantern.add(arrow);
  return lantern;
}

export function createAncientTreehouse() {
  const group = new THREE.Group();
  group.name = 'region:ancient-treehouse';
  const treehouse = createTreehouse({ x: 0, y: getGroundHeight(0, -48), z: -48, scale: 1.2, trunkHeight: 9.5 });
  treehouse.name = 'ancient-treehouse';
  const deer = createAnimal('deer', { x: -7, y: getGroundHeight(-7, -46), z: -46, scale: 1.05, rotationY: 0.75 });
  deer.userData.role = '花披风梅花鹿';

  group.add(
    treehouse,
    deer,
    createReturnLantern(-9, -39, -0.4),
    createReturnLantern(9, -39, 0.4)
  );

  const colliders: Box2D[] = [treehouse.userData.collider as Box2D];
  return { group, colliders, animations: collectAnimations(group) };
}
