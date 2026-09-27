import * as THREE from 'three';
import './styles.css';
import { createQualityMonitor } from './core/quality';
import { createRenderContext } from './core/Engine';
import { createPostPipeline, type PostPipeline } from './effects/postprocessing';
import { createPlayerController } from './player/controller';
import { createOverlay } from './ui/overlay';
import { createWorldPreview } from './ui/worldPreview';
import { loadAnimalLibrary, RABBIT_MODEL_URLS } from './entities/modelLibrary';
import { createWorld } from './world/createWorld';
import { REGIONS } from './world/config';
import { getRegionAt } from './world/regionDetector';
import { createInteractionController } from './player/interactionController';
import { createInteractionHud } from './ui/interactionHud';

const STARTUP_ERROR = '当前浏览器或显卡无法启动 3D 场景，请使用最新版 Chrome 或 Edge 并开启硬件加速。';

function supportsWebGL(): boolean {
  try {
    const probe = document.createElement('canvas');
    return Boolean(probe.getContext('webgl2') || probe.getContext('webgl'));
  } catch {
    return false;
  }
}

const root = document.querySelector<HTMLElement>('#app');
const canvas = document.querySelector<HTMLCanvasElement>('#scene');
if (!root || !canvas) throw new Error('缺少 #app 或 #scene 节点');

const overlay = createOverlay(root);

if (!supportsWebGL()) {
  overlay.showError(STARTUP_ERROR);
} else {
  let renderContext: ReturnType<typeof createRenderContext> | undefined;
  let world: ReturnType<typeof createWorld> | undefined;
  let player: ReturnType<typeof createPlayerController> | undefined;
  let postPipeline: PostPipeline | undefined;
  let preview: ReturnType<typeof createWorldPreview> | undefined;
  let interaction:ReturnType<typeof createInteractionController>|undefined;
  let interactionHud:ReturnType<typeof createInteractionHud>|undefined;
  let frameId = 0;
  let timer: THREE.Timer | undefined;
  let handleVisibilityChange: (() => void) | undefined;

  try {
    renderContext = createRenderContext(canvas);
    overlay.showLoading();
    const params = new URLSearchParams(location.search);
    const wantsRabbitV5 = params.get('rabbit') === 'v5';
    const animalAssets = await loadAnimalLibrary({ rabbitVariant: wantsRabbitV5 ? 'v5' : 'legacy' });
    const loadedRabbit = animalAssets.get('rabbit')?.sourceUrl;
    const rabbitStatus = loadedRabbit === RABBIT_MODEL_URLS.v5 ? 'v5'
      : loadedRabbit === RABBIT_MODEL_URLS.legacy ? (wantsRabbitV5 ? 'fallback' : 'legacy') : 'procedural';
    world = createWorld();
    postPipeline = createPostPipeline({
      renderer: renderContext.renderer,
      scene: world.scene,
      camera: renderContext.camera
    });
    player = createPlayerController({
      camera: renderContext.camera,
      domElement: canvas,
      colliders: world.colliders,
      getGroundHeight: world.getGroundHeight,
      onLock: (mode) => {
        preview?.hide();
        document.body.classList.add('is-roaming');
        overlay.setLookMode(mode);
        overlay.hideAll();
      },
      onUnlock: () => {
        document.body.classList.remove('is-roaming');
        overlay.showPaused();
      },
      onHeightChange: (height) => overlay.setViewHeight(height)
    });
    player.reset();
    preview = createWorldPreview(root, canvas, renderContext.camera, (spawn) => {
      preview!.hide();
      player!.reset(spawn);
      player!.lock();
    }, rabbitStatus);
    overlay.onPreview(() => { overlay.hideAll(); preview!.show(); });
    interactionHud=createInteractionHud(root);
    interaction=createInteractionController({camera:renderContext.camera,targets:world.interactions,colliders:world.colliders,
      events:window,canvas,isActive:()=>player!.isLocked(),onFocus:interactionHud.focus,onResult:interactionHud.result,playChime:interactionHud.chime});

    overlay.onEnter(() => player!.lock());
    overlay.onResume(() => player!.lock());
    overlay.onReset(() => {
      player!.reset();
      player!.lock();
    });
    overlay.showStart();
    if (params.get('view') === 'world') {
      overlay.hideAll();
      if (wantsRabbitV5 || params.get('preset') === 'rabbit') preview.showRabbit();
      else preview.show();
    }

    const qualityMonitor = createQualityMonitor((tier) => {
      renderContext!.setQuality(tier);
      world!.setQuality(tier);
      postPipeline!.setQuality(tier);
    });
    timer = new THREE.Timer();
    timer.connect(document);
    let previousRegion: string | null = null;
    let previousFrameTime: number | null = null;

    handleVisibilityChange = () => {
      previousFrameTime = null;
      if (!document.hidden) timer!.reset();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);

    const animate = (timestamp: number) => {
      frameId = requestAnimationFrame(animate);
      if (document.hidden) {
        previousFrameTime = null;
        return;
      }

      timer!.update(timestamp);
      const delta = timer!.getDelta();
      const elapsed = timer!.getElapsed();

      if (previousFrameTime !== null) qualityMonitor.pushFrame(timestamp - previousFrameTime);
      previousFrameTime = timestamp;

      player!.update(delta);
      interaction!.update(elapsed);
      preview!.update();
      world!.updateView(renderContext!.camera.position);
      world!.animations.forEach((update) => update(elapsed));

      const currentRegion = getRegionAt(renderContext!.camera.position, REGIONS);
      if (player!.isLocked() && currentRegion && currentRegion !== previousRegion) overlay.showRegion(currentRegion);
      previousRegion = currentRegion;

      postPipeline!.render();
    };
    animate(0);

    window.addEventListener(
      'beforeunload',
      () => {
        cancelAnimationFrame(frameId);
        document.removeEventListener('visibilitychange', handleVisibilityChange!);
        timer!.dispose();
        player!.dispose();
        interaction!.dispose();interactionHud!.dispose();
        preview!.dispose();
        world!.dispose();
        postPipeline!.dispose();
        renderContext!.dispose();
      },
      { once: true }
    );
  } catch (error) {
    player?.dispose();
    interaction?.dispose();interactionHud?.dispose();
    preview?.dispose();
    world?.dispose();
    postPipeline?.dispose();
    renderContext?.dispose();
    if (handleVisibilityChange) document.removeEventListener('visibilitychange', handleVisibilityChange);
    timer?.dispose();
    console.error('动物王国 3D 漫游初始化失败', error);
    overlay.showError(STARTUP_ERROR);
  }
}
