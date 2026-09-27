import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { AnimalType } from './animals';

export interface AnimalAsset {
  prototype: THREE.Object3D;
  animations: readonly THREE.AnimationClip[];
  sourceUrl: string;
}

export type RabbitVariant = 'legacy' | 'v5';
export const RABBIT_MODEL_URLS = {
  legacy: '/models/animals/rabbit-rigged-trial.glb',
  v5: '/models/animals/rabbit-conductor-v5-muzzle-rebuilt.glb'
} as const;

/** 每种动物对应的 GLB 路径（相对站点根，由 Vite 从 public/ 提供）。鼹鼠无模型，走程序化回退。 */
const MODEL_FILES: Partial<Record<AnimalType, string>> = {
  rabbit: RABBIT_MODEL_URLS.legacy,
  squirrel: '/models/animals/squirrel.glb',
  hedgehog: '/models/animals/hedgehog.glb',
  fox: '/models/animals/fox.glb',
  otter: '/models/animals/otter.glb',
  raccoon: '/models/animals/raccoon.glb',
  deer: '/models/animals/deer.glb',
  owl: '/models/animals/owl.glb',
  frog: '/models/animals/frog.glb'
};

/** 归一化目标身高（世界单位）。所有模型等比缩放到此高度，再乘区域里各自的 scale。 */
const TARGET_HEIGHT = 1.5;

const registry = new Map<AnimalType, AnimalAsset>();
let loadGeneration = 0;

/**
 * 把加载出来的 glTF 场景包装成「脚底贴地、XZ 居中、高度归一到 TARGET_HEIGHT」的容器。
 * 原型只存一份，实例化时由 createAnimal 做 clone，因此这里允许就地调整变换。
 */
function normalizeModel(scene: THREE.Object3D): THREE.Group {
  const box = new THREE.Box3().setFromObject(scene);
  const size = box.getSize(new THREE.Vector3());
  const height = size.y || 1;
  const scale = TARGET_HEIGHT / height;
  const center = box.getCenter(new THREE.Vector3());

  const container = new THREE.Group();
  container.name = `${scene.name || 'animal'}-normalized`;

  scene.position.sub(center); // 包围盒中心回到原点，再统一缩放/平移
  container.add(scene);
  container.scale.setScalar(scale);
  container.position.y = TARGET_HEIGHT / 2; // 使脚底贴地（y 从 0 到 TARGET_HEIGHT）

  scene.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
    }
  });

  return container;
}

/**
 * 预载全部动物模型并写入注册表。单个失败仅告警并跳过（该动物回退到程序化），不影响整体启动。
 * @returns 成功加载的模型表（type → 归一化后的原型）
 */
export async function loadAnimalLibrary({ rabbitVariant = 'legacy' }: { rabbitVariant?: RabbitVariant } = {}): Promise<Map<AnimalType, AnimalAsset>> {
  const generation = ++loadGeneration;
  registry.clear();
  const loader = new GLTFLoader();
  const entries = Object.entries({ ...MODEL_FILES, rabbit: RABBIT_MODEL_URLS[rabbitVariant] }) as Array<[AnimalType, string]>;

  const results = await Promise.all(
    entries.map(async ([type, url]): Promise<[AnimalType, AnimalAsset] | null> => {
      try {
        const gltf = await loader.loadAsync(url);
        const model = normalizeModel(gltf.scene);
        const asset = { prototype: model, animations: gltf.animations, sourceUrl: url } satisfies AnimalAsset;
        return [type, asset];
      } catch (error) {
        if (type === 'rabbit' && rabbitVariant === 'v5') {
          console.warn('兔子 v5 灰模加载失败，尝试旧版兔子', error);
          try {
            const gltf = await loader.loadAsync(RABBIT_MODEL_URLS.legacy);
            const asset = { prototype: normalizeModel(gltf.scene), animations: gltf.animations, sourceUrl: RABBIT_MODEL_URLS.legacy } satisfies AnimalAsset;
            return [type, asset];
          } catch (fallbackError) {
            console.warn('旧版兔子也加载失败，回退程序化', fallbackError);
            return null;
          }
        }
        console.warn(`动物模型 ${type} 加载失败，回退程序化`, error);
        return null;
      }
    })
  );

  const map = new Map<AnimalType, AnimalAsset>();
  for (const entry of results) if (entry) map.set(entry[0], entry[1]);
  if (generation === loadGeneration) for (const [type, asset] of map) registry.set(type, asset);
  return map;
}

/** 取某个动物的归一化模型和动作；未加载（如鼹鼠）返回 null。 */
export function getAnimalAsset(type: AnimalType): AnimalAsset | null {
  return registry.get(type) ?? null;
}
