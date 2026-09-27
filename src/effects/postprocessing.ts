import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { FXAAShader } from 'three/addons/shaders/FXAAShader.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type { QualityTier } from '../core/types';

interface PostPipelineOptions {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
}

export interface PostPipeline {
  render(): void;
  setQuality(tier: QualityTier): void;
  dispose(): void;
}

/**
 * Bloom + FXAA post pipeline, active only on the `high` tier.
 * Medium/low fall back to the renderer's direct (MSAA) path to save GPU.
 * `OutputPass` stays last so tone mapping + sRGB match the direct path.
 */
export function createPostPipeline({ renderer, scene, camera }: PostPipelineOptions): PostPipeline {
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));

  const bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.35, 0.6, 0.85);
  composer.addPass(bloomPass);

  const fxaaPass = new ShaderPass(FXAAShader);
  composer.addPass(fxaaPass);
  composer.addPass(new OutputPass());

  let active = false;

  const syncSize = () => {
    const canvas = renderer.domElement;
    const width = Math.max(1, canvas.clientWidth || window.innerWidth);
    const height = Math.max(1, canvas.clientHeight || window.innerHeight);
    const pixelRatio = renderer.getPixelRatio();
    composer.setPixelRatio(pixelRatio);
    composer.setSize(width, height);
    fxaaPass.uniforms['resolution'].value.set(1 / (width * pixelRatio), 1 / (height * pixelRatio));
  };

  syncSize();
  window.addEventListener('resize', syncSize);

  return {
    render() {
      if (active) composer.render();
      else renderer.render(scene, camera);
    },
    setQuality(tier: QualityTier = 'high') {
      active = tier === 'high';
    },
    dispose() {
      window.removeEventListener('resize', syncSize);
      composer.dispose();
    }
  };
}
