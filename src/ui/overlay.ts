import { MODEL_CREDITS, MODEL_LICENSE, MODEL_AUTHOR, MODEL_LICENSE_URL } from '../data/credits';
import type { LookMode } from '../player/controller';

export interface Overlay {
  showStart(): void;
  showLoading(): void;
  showPaused(): void;
  hideAll(): void;
  showRegion(name: string): void;
  showError(message: string): void;
  showCredits(): void;
  setLookMode(mode: LookMode): void;
  setViewHeight(elevation: number): void;
  onEnter(fn: () => void): void;
  onResume(fn: () => void): void;
  onReset(fn: () => void): void;
  onPreview(fn: () => void): void;
}

export function createOverlay(root: HTMLElement): Overlay {
  const creditsList = MODEL_CREDITS.map(
    (credit) =>
      `<li><a href="${credit.url}" target="_blank" rel="noopener">「${credit.title}」</a> <span class="credit-animal">${credit.animal}</span></li>`
  ).join('');

  root.insertAdjacentHTML(
    'beforeend',
    `
    <div class="screen" data-screen="start">
      <h1>动物王国</h1>
      <p>鼠标转向 · WASD 相对视线移动<br>空格升高并悬停 · Ctrl / C 下降<br>靠近风铃、花丛或小灯笼：E / 点击互动<br>Shift 加速 · R 返回入口 · Esc 暂停</p>
      <button data-action="enter">进入森林</button>
      <button class="link" data-action="preview">查看世界样区</button>
      <button class="link" data-action="about">关于 · 素材来源</button>
    </div>
    <div class="screen" data-screen="loading" hidden>
      <h2>森林正在醒来…</h2>
    </div>
    <div class="screen" data-screen="pause" hidden>
      <h2>漫游已暂停</h2>
      <button data-action="resume">继续漫游</button>
      <button data-action="reset">返回入口</button>
      <button class="link" data-action="preview">查看世界样区</button>
    </div>
    <div class="screen" data-screen="credits" hidden>
      <h2>关于 · 素材来源</h2>
      <p class="credits-note">动物模型由 ${MODEL_AUTHOR} 提供，授权 ${MODEL_LICENSE}（<a href="${MODEL_LICENSE_URL}" target="_blank" rel="noopener">许可协议</a>）。</p>
      <ul class="credits-list">${creditsList}</ul>
      <button data-action="back">返回</button>
    </div>
    <div class="screen" data-screen="error" hidden></div>
    <div class="region" data-region hidden></div>
    <div class="crosshair" aria-hidden="true"></div>
    <div class="roam-status"><span data-look-mode></span><span class="view-height" data-view-height>抬升 0.0 m</span></div>
    <div class="roam-hint"><span>鼠标转向 · WASD 移动 · E / 点击互动 · Shift 加速</span><span>空格升高 / 松开悬停 · Ctrl 或 C 下降 · R 归位 · Esc 暂停</span></div>
    `
  );

  const screens = [...root.querySelectorAll<HTMLElement>('[data-screen]')];
  const showOnly = (name: string) => {
    screens.forEach((el) => {
      el.hidden = el.dataset.screen !== name;
    });
  };
  let regionTimer: number | undefined;
  const modeLabel = root.querySelector<HTMLElement>('[data-look-mode]')!;
  const heightLabel = root.querySelector<HTMLElement>('[data-view-height]')!;
  let displayedHeight = '';

  root.querySelector<HTMLElement>('[data-action="about"]')?.addEventListener('click', () => showOnly('credits'));
  root.querySelector<HTMLElement>('[data-action="back"]')?.addEventListener('click', () => showOnly('start'));

  return {
    showStart: () => showOnly('start'),
    showLoading: () => showOnly('loading'),
    showPaused: () => showOnly('pause'),
    showCredits: () => showOnly('credits'),
    setLookMode(mode) {
      modeLabel.textContent = mode === 'pointer-lock'
        ? '第一人称 · 鼠标已锁定'
        : '兼容观察 · 鼠标到画面边缘可持续转向';
    },
    setViewHeight(elevation) {
      const value = elevation.toFixed(1);
      if (value === displayedHeight) return;
      displayedHeight = value;
      heightLabel.textContent = `抬升 ${value} m`;
    },
    hideAll: () => screens.forEach((el) => { el.hidden = true; }),
    showRegion(name: string) {
      const el = root.querySelector<HTMLElement>('[data-region]');
      if (!el) return;
      window.clearTimeout(regionTimer);
      el.textContent = name;
      el.hidden = false;
      regionTimer = window.setTimeout(() => { el.hidden = true; }, 2400);
    },
    showError(message: string) {
      const el = root.querySelector<HTMLElement>('[data-screen="error"]');
      if (!el) return;
      showOnly('error');
      el.textContent = message;
    },
    onEnter(fn) { root.querySelector<HTMLElement>('[data-action="enter"]')?.addEventListener('click', fn); },
    onResume(fn) { root.querySelector<HTMLElement>('[data-action="resume"]')?.addEventListener('click', fn); },
    onReset(fn) { root.querySelector<HTMLElement>('[data-action="reset"]')?.addEventListener('click', fn); },
    onPreview(fn) { root.querySelectorAll<HTMLElement>('[data-action="preview"]').forEach(el => el.addEventListener('click', fn)); }
  };
}
