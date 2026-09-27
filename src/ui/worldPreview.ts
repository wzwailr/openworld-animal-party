import { PerspectiveCamera, Vector3 } from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type { SpawnPoint } from '../world/config';

export const VIEWS = [
  { label: '森林总览', caption: '暖光林冠 · 庆典聚落 · 相连的林间道路', eye: [4, 32, 44], target: [5, 3, -3], entry:[0,42] },
  { label: '庆典舞台', caption: '林下音乐会 · 花藤拱架 · 兔子指挥家', eye: [11, 5.4, 17], target: [-1, 3.1, -2], entry:[0,10] },
  { label: '花桥溪岸', caption: '藤花木桥 · 造船工作区 · 岸边系泊场', eye: [63,5,38], target: [56,2,17], entry:[36,4] },
  { label: '蘑菇集市', caption: '果蔬货摊 · 面包院子 · 陶器工作台', eye: [-97,9,19], target: [-112,3,-1], entry:[-112,4] },
  { label: '树屋聚落', caption: '古树窗灯 · 公共厨房 · 晾衣与菜箱', eye: [101,4,-27], target: [103,4,-50], entry:[104,-48] },
  { label: '高山瀑布谷', caption: '高山水源 · 六十五米主瀑 · 三级溪潭与盘山步道', eye: [-12,33,-104], target: [35,41,-177], entry:[22,-108] },
  { label: '萤火花园', caption: '藤架阅览角 · 浅水花池 · 林下灯笼回环', eye: [-6,2.4,119], target: [-29,2,108], entry:[-28,96] },
  { label: '巨菇林', caption: '朽木菌落 · 采集工作台 · 蕨类林下层', eye: [-33,3.2,-7], target: [-48,3,-24], entry:[-43,-14] },
  { label: '古树驿站', caption: '林间邮务 · 行李推车 · 树下候车长椅', eye: [-19,7,-30], target: [-4,4,-48], entry:[0,-42] },
  { label: '半山步道', caption: '连续盘山折返 · 山路护栏 · 岩层近观', eye: [-12,33,-177.3], target: [-29,39,-189], entry:[-10,-176] },
  { label: '瀑顶水源', caption: '高地缓溪 · 崖口水舌 · 山谷回望', eye: [40,98,-208], target: [41,64,-178], entry:[26,-198] },
  { label: '溪潭近观', caption: '潭岸白沫 · 雾气 · 下游溪流', eye: [43,27,-147], target: [42,23,-172], entry:[22,-108] },
  { label: '北脊回望', caption: '水源背面 · 连续山体 · 聚落方向', eye: [40,109,-238], target: [40,76,-195], entry:[14,-242] },
  { label: '兔子近景', caption: '真实庆典舞台 · 兔子指挥家 · 可从坡道步行进入', eye: [1.9,2.95,2.0], target: [0,2.2,-1], entry:[0,5.8] },
  { label: '东林果园', caption: '果树巷道 · 榨汁棚 · 树荫下的野餐角', eye:[178,5,36],target:[193,3,68],entry:[193,58] },
  { label: '风车花田', caption: '缓转布帆 · 晾谷小院 · 紫色花田与林缘环道', eye:[192,4.5,-22],target:[210,4,-54],entry:[210,-42] }
] as const;

const RABBIT_VIEW_INDEX = VIEWS.findIndex(view=>view.label==='兔子近景');

type RabbitStatus = 'v5' | 'legacy' | 'fallback' | 'procedural';

export function createWorldPreview(root: HTMLElement, canvas: HTMLCanvasElement, camera: PerspectiveCamera, onWalk: (spawn: Pick<SpawnPoint,'x'|'z'|'yaw'>) => void, rabbitStatus: RabbitStatus = 'legacy') {
  const rabbitLabel = rabbitStatus === 'v5' ? '兔子v5口鼻修正版 · 灰模候选'
    : rabbitStatus === 'fallback' ? 'v5灰模加载失败 · 当前旧版兔子'
    : rabbitStatus === 'procedural' ? '兔子模型加载失败 · 当前占位模型' : '当前旧版兔子';
  const rabbitLink = (variant: 'v5' | 'legacy') => {
    const url = new URL(window.location.href);
    url.searchParams.set('view', 'world');
    url.searchParams.set('preset', 'rabbit');
    if (variant === 'v5') url.searchParams.set('rabbit', 'v5');
    else url.searchParams.delete('rabbit');
    return url.href;
  };
  const panel = document.createElement('section');
  panel.className = 'world-preview';
  panel.setAttribute('aria-label', '世界样区观察');
  panel.innerHTML = `<header><span class="preview-kicker">ANIMAL KINGDOM / A LIVING FOREST</span><h1>林间的庆典</h1><p data-view-caption></p></header>
    <footer><nav aria-label="观察位置">${VIEWS.map((view, i) => `<button data-view="${i}" aria-pressed="false"><span>${String(i+1).padStart(2,'0')}</span>${view.label}</button>`).join('')}</nav>
    <div class="preview-actions"><span>观察镜头 · 拖动旋转 / 滚轮缩放</span><button data-walk>从此处第一人称进入 ↗</button></div></footer>
    <div class="rabbit-review-switch" aria-label="兔子版本复核"><span data-rabbit-status>${rabbitLabel}</span><a data-rabbit-v5 href="${rabbitLink('v5')}">看 v5 灰模</a><a data-rabbit-legacy href="${rabbitLink('legacy')}">看旧版</a></div>
    <small class="preview-note">总图风格延展 · 410 × 420 m · 东林漫游</small>`;
  root.append(panel);
  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 5;
  controls.maxDistance = 180;
  controls.maxPolarAngle = Math.PI * 0.47;
  controls.minPolarAngle = 0.15;
  controls.enablePan = false;
  controls.enabled = false;
  panel.hidden = true;
  let active = false;
  let index = 0;
  const target = new Vector3();
  const show = (next = index) => {
    if (next < 0 || next >= VIEWS.length) return;
    index = next;
    const view = VIEWS[index];
    active = true;
    panel.hidden = false;
    controls.enabled = true;
    controls.minDistance = index === RABBIT_VIEW_INDEX ? 1.5 : 5;
    controls.maxDistance = index === RABBIT_VIEW_INDEX ? 12 : 180;
    document.body.classList.add('is-previewing');
    camera.position.set(view.eye[0], view.eye[1], view.eye[2]);
    controls.target.copy(target.set(view.target[0], view.target[1], view.target[2]));
    if (index === 0 || index === 5) camera.position.sub(target).multiplyScalar(Math.max(1, Math.min(1.65, 1.25 / camera.aspect))).add(target);
    controls.update();
    panel.querySelector('[data-view-caption]')!.textContent = view.caption;
    panel.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.view) === index)));
  };
  const hide = () => {
    active = false; panel.hidden = true; controls.enabled = false;
    document.body.classList.remove('is-previewing');
  };
  const click = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('button');
    if (!button) return;
    if (button.dataset.view !== undefined) show(Number(button.dataset.view));
    else if (button.hasAttribute('data-walk')) {
      const view=VIEWS[index], [x,z]=view.entry;
      onWalk({x,z,yaw:Math.atan2(x-view.target[0],z-view.target[2])});
    }
  };
  panel.addEventListener('click', click);
  return {
    show, showRabbit() { show(RABBIT_VIEW_INDEX); }, hide,
    update() { if (active) controls.update(); },
    dispose() { controls.dispose(); panel.removeEventListener('click', click); panel.remove(); }
  };
}
