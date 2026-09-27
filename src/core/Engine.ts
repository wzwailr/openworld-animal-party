import * as THREE from 'three';
import type { QualityTier } from './types';

const QUALITY_PRESETS = {
  high: { pixelRatio: 1.75, shadows: true },
  medium: { pixelRatio: 1.25, shadows: true },
  low: { pixelRatio: 1, shadows: false }
} as const;

function getViewport(canvas: HTMLCanvasElement) {
  return {
    width: Math.max(1, canvas.clientWidth || window.innerWidth),
    height: Math.max(1, canvas.clientHeight || window.innerHeight)
  };
}

export interface RenderContext {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  resize(): void;
  setQuality(tier?: QualityTier): void;
  dispose(): void;
}

export function createRenderContext(canvas: HTMLCanvasElement): RenderContext {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
  const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 520);

  const resize = () => {
    const { width, height } = getViewport(canvas);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  };

  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0xc5ddd5, 1);
  renderer.shadowMap.type = THREE.PCFShadowMap;

  const setQuality = (tier: QualityTier = 'high') => {
    const preset = QUALITY_PRESETS[tier] ?? QUALITY_PRESETS.high;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preset.pixelRatio));
    renderer.shadowMap.enabled = preset.shadows;
    resize();
  };

  setQuality('high');
  window.addEventListener('resize', resize);

  return {
    renderer,
    camera,
    resize,
    setQuality,
    dispose() {
      window.removeEventListener('resize', resize);
      renderer.dispose();
    }
  };
}
