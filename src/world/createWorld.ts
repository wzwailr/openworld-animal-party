import * as THREE from 'three';
import { createFireflies } from '../effects/fireflies';
import { createSkyDome } from '../effects/sky';
import { createFoliage } from '../entities/foliage';
import { getWalkHeight } from './landscape';
import { SPAWN, WORLD } from './config';
import { createTerrain, getGroundHeight } from './terrain';
import { createAncientTreehouse } from './regions/ancientTreehouse';
import { createFestivalSquare } from './regions/festivalSquare';
import { createMushroomForest } from './regions/mushroomForest';
import { createStreamBridge } from './regions/streamBridge';
import { createExpandedForest } from './regions/expandedForest';
import { createHighlandValley } from './regions/highlandValley';
import { createRegionEnrichment } from './regions/regionEnrichment';
import { createEasternForest } from './regions/easternForest';
import { createWorldInteractions,type WorldInteraction } from './interactions';
import type { Box2D, QualityTier, UpdateFn } from '../core/types';

const SKY_COLOR = 0xb6ccc4;
const FIREFLY_COUNTS = Object.freeze({ high: 70, medium: 40, low: 20 });
const GARDEN_FIREFLY_COUNTS = Object.freeze({ high: 48, medium: 30, low: 16 });

function createMoonlightGate(): THREE.Group {
  const gate = new THREE.Group();
  gate.name = 'moonlight-gate';
  gate.position.set(SPAWN.x, getGroundHeight(SPAWN.x, SPAWN.z), SPAWN.z + 10);

  const glow = new THREE.MeshStandardMaterial({ color: 0x9fcbff, emissive: 0x5a85e8, emissiveIntensity: 1.7, transparent: true, opacity: 0.72 });
  const ring = new THREE.Mesh(new THREE.TorusGeometry(2.25, 0.18, 8, 24), glow);
  ring.position.y = 2.4;
  const door = new THREE.Mesh(new THREE.CircleGeometry(2.06, 20), new THREE.MeshBasicMaterial({ color: 0x8cbcff, transparent: true, opacity: 0.18 }));
  door.position.y = 2.4;
  const light = new THREE.PointLight(0x93bbff, 2.2, 14, 2);

  // Two flanking stone pillars.
  const pillarMaterial = new THREE.MeshStandardMaterial({ color: 0xc7b79a, roughness: 0.9 });
  const pillarGeometry = new THREE.CylinderGeometry(0.26, 0.34, 2.4, 8);
  const capGeometry = new THREE.CylinderGeometry(0.4, 0.44, 0.24, 8);
  const pillars = new THREE.Group();
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(pillarGeometry, pillarMaterial);
    pillar.position.set(side * 2.25, 1.2, 0);
    const cap = new THREE.Mesh(capGeometry, pillarMaterial);
    cap.position.set(side * 2.25, 2.5, 0);
    pillars.add(pillar, cap);
  }

  // Vine tube wrapping the ring.
  const vinePoints: THREE.Vector3[] = [];
  const vineSegments = 48;
  for (let index = 0; index <= vineSegments; index += 1) {
    const angle = (index / vineSegments) * Math.PI * 2;
    vinePoints.push(new THREE.Vector3(Math.cos(angle) * 2.3, 2.4 + Math.sin(angle) * 2.3, Math.sin(angle * 4) * 0.2));
  }
  const vineCurve = new THREE.CatmullRomCurve3(vinePoints, true);
  const vine = new THREE.Mesh(
    new THREE.TubeGeometry(vineCurve, 96, 0.05, 5, true),
    new THREE.MeshStandardMaterial({ color: 0x5f9e57, roughness: 0.85 })
  );

  // Pastel flowers dotted along the vine.
  const flowerColors = [0xffc0cb, 0xffd6a5, 0xe1a4e8, 0xa7c7e7, 0xffb7b2];
  const flowers = new THREE.Group();
  for (let index = 0; index < 10; index += 1) {
    const angle = (index / 10) * Math.PI * 2 + 0.3;
    const pos = new THREE.Vector3(Math.cos(angle) * 2.3, 2.4 + Math.sin(angle) * 2.3, Math.sin(angle * 4) * 0.2);
    const flower = new THREE.Mesh(
      new THREE.SphereGeometry(0.11, 6, 5),
      new THREE.MeshStandardMaterial({ color: flowerColors[index % flowerColors.length], roughness: 0.6 })
    );
    flower.position.copy(pos);
    flower.scale.set(1, 1, 0.7);
    flowers.add(flower);
  }

  gate.add(ring, door, light, pillars, vine, flowers);
  gate.userData.update = (time: number) => {
    const pulse = Math.sin(time * 1.4);
    (door.material as THREE.MeshBasicMaterial).opacity = 0.16 + pulse * 0.05;
    light.intensity = 2.2 + pulse * 0.6;
  };
  return gate;
}

function disposeScene(scene: THREE.Scene): void {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.geometry) geometries.add(mesh.geometry);
    const objectMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    objectMaterials.filter(Boolean).forEach((m) => materials.add(m));
  });
  geometries.forEach((geometry) => geometry.dispose());
  materials.forEach((m) => {
    for (const value of Object.values(m)) if (value?.isTexture) textures.add(value as THREE.Texture);
    if(m instanceof THREE.ShaderMaterial)for(const uniform of Object.values(m.uniforms)) {
      if(uniform.value?.isTexture)textures.add(uniform.value as THREE.Texture);
    }
    m.dispose();
  });
  textures.forEach(texture => texture.dispose());
  scene.clear();
}

export interface World {
  scene: THREE.Scene;
  colliders: Box2D[];
  animations: UpdateFn[];
  interactions: WorldInteraction[];
  getGroundHeight(x: number, z: number): number;
  updateView(position: THREE.Vector3): void;
  setQuality(tier: QualityTier): void;
  dispose(): void;
}

export function createWorld(): World {
  const scene = new THREE.Scene();
  scene.name = 'animal-kingdom-world';
  scene.background = null;
  scene.fog = new THREE.FogExp2(SKY_COLOR, 0.0032);
  scene.userData.spawn = { ...SPAWN };
  scene.userData.bounds = { ...WORLD };
  scene.add(createSkyDome());

  scene.add(new THREE.HemisphereLight(0xc6d9e8, 0x515d3d, 1.05));
  const sunlight = new THREE.DirectionalLight(0xffe3b5, 3.0);
  sunlight.position.set(-35, 65, 38);
  sunlight.target.position.set(15, 0, 0);
  scene.add(sunlight.target);
  sunlight.castShadow = true;
  sunlight.shadow.mapSize.set(2048, 2048);
  sunlight.shadow.camera.left = -60;
  sunlight.shadow.camera.right = 60;
  sunlight.shadow.camera.top = 60;
  sunlight.shadow.camera.bottom = -60;
  sunlight.shadow.camera.near = 4;
  sunlight.shadow.camera.far = 180;
  sunlight.shadow.normalBias = 0.035;
  sunlight.shadow.bias = -0.0001;

  const fillLight = new THREE.DirectionalLight(0xabcbdc, 0.35);
  fillLight.position.set(28, 30, -24);
  const moonlightGate = createMoonlightGate();
  scene.add(sunlight, fillLight, moonlightGate);

  const terrain = createTerrain();
  scene.add(terrain.group);
  const colliders: Box2D[] = [...terrain.colliders];
  const animations: UpdateFn[] = [...terrain.animations, moonlightGate.userData.update as UpdateFn];

  const fireflies = createFireflies({
    count: FIREFLY_COUNTS.high,
    area: { minX: -72, maxX: 72, minY: 1.2, maxY: 7.5, minZ: -62, maxZ: 62 },
    color: 0xffe28a
  });
  scene.add(fireflies);
  animations.push(fireflies.userData.update as UpdateFn);

  const gardenFireflies=createFireflies({count:GARDEN_FIREFLY_COUNTS.high,
    area:{minX:-42,maxX:-14,minY:1.8,maxY:5.6,minZ:83,maxZ:109},color:0xffe69e});
  gardenFireflies.name='garden-fireflies';scene.add(gardenFireflies);
  animations.push(gardenFireflies.userData.update as UpdateFn);

  const foliage = createFoliage();
  scene.add(foliage.group);
  colliders.push(...foliage.colliders);
  animations.push(foliage.update);

  const valley = createHighlandValley();
  const eastern = createEasternForest();
  const regions = [
    createMushroomForest(),
    createFestivalSquare(),
    createStreamBridge(),
    createAncientTreehouse(),
    createExpandedForest(), valley, createRegionEnrichment(), eastern
  ];
  for (const region of regions) {
    scene.add(region.group);
    colliders.push(...region.colliders);
    animations.push(...region.animations);
  }
  const interactions=createWorldInteractions();scene.add(interactions.group);
  animations.push(...interactions.targets.map(target=>target.update));

  const setQuality = (tier: QualityTier = 'high') => {
    const count = FIREFLY_COUNTS[tier] ?? FIREFLY_COUNTS.high;
    (fireflies.userData.setVisibleCount as (n: number) => void)(count);
    (gardenFireflies.userData.setVisibleCount as (n:number)=>void)(GARDEN_FIREFLY_COUNTS[tier]??GARDEN_FIREFLY_COUNTS.high);
    foliage.setQuality(tier);
    valley.setQuality(tier);
    eastern.setQuality(tier);
    const shadowMapSize = tier === 'high' ? 2048 : 1024;
    if (sunlight.shadow.mapSize.x !== shadowMapSize) {
      sunlight.shadow.map?.dispose();
      sunlight.shadow.map = null;
      sunlight.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    }
  };

  const sunOffset=sunlight.position.clone().sub(sunlight.target.position);
  const updateView=(position:THREE.Vector3)=>{
    // Quantise movement so small head motions do not make the shadow texels crawl.
    const groundY=getWalkHeight(position.x,position.z);
    sunlight.target.position.set(Math.round(position.x),Math.round((position.y+groundY)/2),Math.round(position.z));
    sunlight.position.copy(sunlight.target.position).add(sunOffset);
  };
  return { scene, colliders, animations, interactions:interactions.targets, getGroundHeight: getWalkHeight, updateView, setQuality, dispose: () => disposeScene(scene) };
}
