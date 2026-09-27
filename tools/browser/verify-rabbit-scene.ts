import * as THREE from 'three';
import { loadAnimalLibrary } from '../../src/entities/modelLibrary';
import { createWorld } from '../../src/world/createWorld';

const canvas = document.querySelector<HTMLCanvasElement>('#scene');
const status = document.querySelector<HTMLElement>('#status');
if (!canvas || !status) throw new Error('验收页缺少必要节点');

await loadAnimalLibrary();
const world = createWorld();
const rabbit = world.scene.getObjectByName('animal:rabbit');
if (!rabbit) throw new Error('庆典广场里没有找到兔子');

let skinnedMeshCount = 0;
rabbit.traverse((object) => {
  if ((object as THREE.SkinnedMesh).isSkinnedMesh) skinnedMeshCount += 1;
});
if (skinnedMeshCount === 0) throw new Error('兔子实例没有骨骼蒙皮');
const animatedBone = rabbit.getObjectByName('Head');
if (!(animatedBone as THREE.Bone | undefined)?.isBone) throw new Error('兔子实例没有找到 Head 骨骼');

world.animations.forEach((update) => update(0));
const startRotation = animatedBone!.quaternion.clone();
world.animations.forEach((update) => update(0.5));
const motionDelta = 1 - Math.abs(startRotation.dot(animatedBone!.quaternion));
if (motionDelta < 0.000001) throw new Error('Conduct 动作没有驱动 Head 骨骼');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 220);
camera.position.set(0, 2.15, -1.4);
camera.lookAt(0, 1.05, 3);

function resize(): void {
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}
resize();
window.addEventListener('resize', resize);

status.textContent = `真实场景 · 骨骼网格 ${skinnedMeshCount} · Conduct 骨骼动作已验证`;
document.body.dataset.ready = 'true';

function animate(timestamp: number): void {
  world.animations.forEach((update) => update(timestamp / 1000));
  renderer.render(world.scene, camera);
  requestAnimationFrame(animate);
}
requestAnimationFrame(animate);
