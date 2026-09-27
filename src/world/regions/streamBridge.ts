import * as THREE from 'three';
import { createAnimal } from '../../entities/animals';
import { createFlowerBridge } from '../../entities/festivalLandmarks';
import { WATER_LEVEL, getWalkHeight, riverCenter, riverHalfWidth } from '../landscape';
import { getGroundHeight } from '../terrain';
import { collectAnimations } from '../utils';
import type { Box2D } from '../../core/types';

function standardMesh(geometry: THREE.BufferGeometry, color: number, name: string, options: THREE.MeshStandardMaterialParameters = {}): THREE.Mesh {
  const object = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color, roughness: 0.82, ...options }));
  object.name = name;
  object.castShadow = true;
  object.receiveShadow = true;
  return object;
}

function createWaterwheel(x: number, z: number): THREE.Group {
  const wheel = new THREE.Group();
  wheel.name = 'waterwheel';
  wheel.position.set(x, getGroundHeight(x, z) + 1.35, z);

  const wood = new THREE.MeshStandardMaterial({ color: 0x8a5a3a, roughness: 0.92 });
  const spokes = new THREE.Group();
  const radius = 1.2;
  const spokeGeometry = new THREE.CylinderGeometry(0.06, 0.06, radius * 2, 5);
  const paddleGeometry = new THREE.BoxGeometry(0.6, 0.42, 0.07);
  for (let index = 0; index < 8; index += 1) {
    const angle = (index / 8) * Math.PI * 2;
    const spoke = new THREE.Mesh(spokeGeometry, wood);
    spoke.rotation.z = angle;
    const paddle = new THREE.Mesh(paddleGeometry, wood);
    paddle.position.set(Math.cos(angle) * radius, Math.sin(angle) * radius, 0);
    paddle.rotation.z = angle;
    spokes.add(spoke, paddle);
  }
  const rim = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.07, 5, 20), wood);
  const axle = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.8, 8), wood);
  axle.rotation.x = Math.PI / 2;
  const support = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.12, 2.4, 6), wood);
  support.position.set(0, -1.1, 0.2);
  wheel.add(axle, rim, spokes, support);

  wheel.userData.update = (time: number) => {
    spokes.rotation.z = time * 0.6;
  };
  return wheel;
}

function createWindmill(x: number, z: number): THREE.Group {
  const mill = new THREE.Group();
  mill.name = 'windmill';
  mill.position.set(x, getGroundHeight(x, z), z);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.15, 2.6, 8),
    new THREE.MeshStandardMaterial({ color: 0xd9a06b, roughness: 0.85 })
  );
  body.position.y = 1.3;
  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(1.25, 1.15, 8),
    new THREE.MeshStandardMaterial({ color: 0xb8554e, roughness: 0.85 })
  );
  roof.position.y = 3.05;
  const door = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.6, 0.1),
    new THREE.MeshStandardMaterial({ color: 0x6b4630, roughness: 0.95 })
  );
  door.position.set(0, 0.3, 1.16);
  mill.add(body, roof, door);

  const blades = new THREE.Group();
  blades.position.set(0, 1.35, 1.3);
  const bladeMaterial = new THREE.MeshStandardMaterial({ color: 0xf3e2c0, roughness: 0.8 });
  for (let index = 0; index < 4; index += 1) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 2.7, 0.06), bladeMaterial);
    blade.rotation.z = (index / 4) * Math.PI * 2;
    blades.add(blade);
  }
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), bladeMaterial);
  blades.add(hub);
  mill.add(blades);

  mill.userData.update = (time: number) => {
    blades.rotation.z = time * 0.8;
  };
  return mill;
}

function createWalnutBoat(): THREE.Group {
  const boat = new THREE.Group();
  boat.name = 'walnut-boat';
  boat.position.set(49, WATER_LEVEL + 0.2, 14);
  const shell = standardMesh(new THREE.SphereGeometry(1.25, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), 0x7f4c2d, 'walnut-shell');
  shell.scale.set(1.3, 0.5, 0.75);
  shell.rotation.x = Math.PI;
  const otter = createAnimal('otter', { y: 0.25, scale: 0.68, rotationY: 0.3, animationPhase: 1.2 });
  otter.userData.role = '核桃船水獭';
  boat.add(shell, otter);
  const baseY = boat.position.y;
  boat.userData.update = (time: number) => {
    boat.position.y = baseY + Math.sin(time * 1.4) * 0.06;
    boat.rotation.z = Math.sin(time * 0.8) * 0.025;
  };
  return boat;
}

function createWatersidePlants(): THREE.Group {
  const plants = new THREE.Group();
  plants.name = 'waterside-flowers';
  const coordinates: Array<[number, number, number]> = [
    [40, -9, 0xe46d87], [39, 0, 0xffca66], [39.5, 10, 0x8d79ce], [56.5, -5, 0xf19a5b],
    [57, 7, 0xe76582], [56, 19, 0xffd36d], [41, 22, 0x8b78c7], [57.5, 28, 0xee8361]
  ];
  for (const [x, z, color] of coordinates) {
    const side = Math.sign(x - riverCenter(z));
    const bankX = riverCenter(z) + side * (riverHalfWidth(z, side) + 1);
    const stem = standardMesh(new THREE.CylinderGeometry(0.025, 0.035, 0.55, 5), 0x4e8b53, 'flower-stem');
    stem.position.set(bankX, getGroundHeight(bankX, z) + 0.28, z);
    const blossom = standardMesh(new THREE.SphereGeometry(0.14, 6, 4), color, 'water-flower');
    blossom.position.set(bankX, getGroundHeight(bankX, z) + 0.6, z);
    plants.add(stem, blossom);
  }
  return plants;
}

function createStreamRipples(): THREE.Group {
  const ripples = new THREE.Group();
  ripples.name = 'stream-ripples';
  const rings: THREE.Mesh[] = [];
  for (const [x, z, scale] of [[47, -14, 1], [50, 20, 0.75], [46, 31, 0.6]] as Array<[number, number, number]>) {
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(0.55 * scale, 0.035, 5, 18),
      new THREE.MeshBasicMaterial({ color: 0xc8f3e5, transparent: true, opacity: 0.66 })
    );
    ring.name = 'stream-ripple';
    ring.rotation.x = Math.PI / 2;
    ring.position.set(x, WATER_LEVEL + 0.09, z);
    rings.push(ring);
    ripples.add(ring);
  }
  ripples.userData.update = (time: number) => {
    rings.forEach((ring, index) => {
      ring.scale.setScalar(0.92 + Math.sin(time * 1.2 + index) * 0.1);
    });
  };
  return ripples;
}

export function createStreamBridge() {
  const group = new THREE.Group();
  group.name = 'region:stream-bridge';
  const bridge = createFlowerBridge();
  group.add(bridge, createStreamRipples(), createWatersidePlants());
  group.add(createWindmill(riverCenter(-18) - riverHalfWidth(-18, -1) - 2, -18), createWaterwheel(riverCenter(22) + riverHalfWidth(22, 1) + 0.15, 22));

  const fox = createAnimal('fox', { x: 38, y: getWalkHeight(38, 6), z: 6, scale: 0.84, rotationY: Math.PI / 2 });
  fox.userData.role = '提灯狐狸';
  const frog = createAnimal('frog', { x: 56, y: getWalkHeight(56, 3), z: 3, scale: 0.72, rotationY: -Math.PI / 2 });
  frog.userData.role = '青蛙魔术师';
  group.add(fox, createWalnutBoat(), frog);

  return { group, colliders: bridge.userData.colliders as Box2D[], animations: collectAnimations(group) };
}
