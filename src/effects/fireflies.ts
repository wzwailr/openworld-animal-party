import * as THREE from 'three';

const GOLDEN_RATIO_CONJUGATE = 0.6180339887498949;
const SILVER_RATIO_CONJUGATE = 0.41421356237309503;

interface FireflyArea {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
}

interface FirefliesOptions {
  count: number;
  area: FireflyArea;
  color: number;
}

const FIREFLY_VERTEX = /* glsl */ `
attribute float phase;
attribute float size;
varying float vPhase;
varying float vSize;
void main() {
  vPhase = phase;
  vSize = size;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_PointSize = size * (300.0 / -mvPosition.z);
  gl_Position = projectionMatrix * mvPosition;
}
`;

const FIREFLY_FRAGMENT = /* glsl */ `
uniform sampler2D uSprite;
uniform vec3 uColor;
uniform vec3 uColor2;
uniform float uTime;
varying float vPhase;
varying float vSize;
void main() {
  float twinkle = 0.55 + 0.45 * sin(uTime * 1.7 + vPhase);
  vec3 color = mix(uColor, uColor2, fract(vPhase * 0.7));
  vec4 sprite = texture2D(uSprite, gl_PointCoord);
  gl_FragColor = vec4(color * twinkle, 1.0) * sprite;
}
`;

function distributedValue(index: number, step: number, offset: number): number {
  return (offset + index * step) % 1;
}

let spriteTexture: THREE.CanvasTexture | null = null;
function getSpriteTexture(): THREE.CanvasTexture {
  if (spriteTexture) return spriteTexture;
  const canvas = document.createElement('canvas');
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext('2d')!;
  const gradient = context.createRadialGradient(32, 32, 0, 32, 32, 32);
  gradient.addColorStop(0, 'rgba(255,255,255,1)');
  gradient.addColorStop(0.25, 'rgba(255,255,255,0.85)');
  gradient.addColorStop(0.6, 'rgba(255,255,255,0.22)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  spriteTexture = new THREE.CanvasTexture(canvas);
  return spriteTexture;
}

export function createFireflies({ count, area, color }: FirefliesOptions): THREE.Points {
  const positions = new Float32Array(count * 3);
  const phases = new Float32Array(count);
  const sizes = new Float32Array(count);

  for (let index = 0; index < count; index += 1) {
    const positionIndex = index * 3;
    positions[positionIndex] = THREE.MathUtils.lerp(area.minX, area.maxX, distributedValue(index, GOLDEN_RATIO_CONJUGATE, 0.17));
    positions[positionIndex + 1] = THREE.MathUtils.lerp(area.minY, area.maxY, distributedValue(index, SILVER_RATIO_CONJUGATE, 0.43));
    positions[positionIndex + 2] = THREE.MathUtils.lerp(area.minZ, area.maxZ, distributedValue(index, GOLDEN_RATIO_CONJUGATE * 0.5, 0.71));
    phases[index] = (index * 2.399963229728653) % (Math.PI * 2);
    sizes[index] = 0.5 + ((index * 7.31) % 1) * 0.35;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('phase', new THREE.BufferAttribute(phases, 1));
  geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));
  geometry.setDrawRange(0, count);

  const material = new THREE.ShaderMaterial({
    vertexShader: FIREFLY_VERTEX,
    fragmentShader: FIREFLY_FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uSprite: { value: getSpriteTexture() },
      uColor: { value: new THREE.Color(color) },
      uColor2: { value: new THREE.Color(color).lerp(new THREE.Color(0xbfff7a), 0.55) },
      uTime: { value: 0 }
    }
  });

  const fireflies = new THREE.Points(geometry, material);
  const basePositions = positions.slice();

  fireflies.name = 'ambient-fireflies';
  fireflies.frustumCulled = false;
  fireflies.userData.update = (time: number) => {
    material.uniforms.uTime.value = time;
    const position = geometry.attributes.position as THREE.BufferAttribute;
    for (let index = 0; index < count; index += 1) {
      const positionIndex = index * 3;
      const phase = phases[index];
      position.setXYZ(
        index,
        basePositions[positionIndex] + Math.sin(time * 0.45 + phase) * 0.18,
        basePositions[positionIndex + 1] + Math.sin(time * 1.15 + phase) * 0.32,
        basePositions[positionIndex + 2] + Math.cos(time * 0.4 + phase) * 0.18
      );
    }
    position.needsUpdate = true;
  };
  fireflies.userData.setVisibleCount = (visibleCount: number) => {
    geometry.setDrawRange(0, THREE.MathUtils.clamp(Math.floor(visibleCount), 0, count));
  };

  return fireflies;
}
