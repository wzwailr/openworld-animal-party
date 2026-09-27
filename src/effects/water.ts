import * as THREE from 'three';

const WATER_VERTEX = /* glsl */ `
uniform float uTime;
attribute float aDepth;
varying vec3 vWorldPosition;
varying float vDepth;
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  p.y += sin(uTime * 1.4 + p.x * 0.45 + p.z * 0.12) * 0.05
       + sin(uTime * 2.1 + p.x * 0.2 - p.z * 0.5) * 0.028
       + sin(uTime * 3.3 - p.x * 0.3 - p.z * 0.25) * 0.014;
  vec4 worldPosition = modelMatrix * vec4(p, 1.0);
  vWorldPosition = worldPosition.xyz;
  vDepth = aDepth;
  vec4 mvPosition = viewMatrix * worldPosition;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}
`;

const WATER_FRAGMENT = /* glsl */ `
varying vec3 vWorldPosition;
varying float vDepth;
uniform float uTime;
uniform vec3 uDeepColor;
uniform vec3 uShallowColor;
uniform vec3 uSkyColor;
#include <fog_pars_fragment>
float riverHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float riverNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
  return mix(mix(riverHash(i),riverHash(i+vec2(1,0)),f.x),mix(riverHash(i+vec2(0,1)),riverHash(i+vec2(1,1)),f.x),f.y);}

void main() {
  // Screen-space normal from the displaced surface.
  vec3 normal = normalize(cross(dFdx(vWorldPosition), dFdy(vWorldPosition)));
  if (normal.y < 0.0) normal = -normal;

  float flowNoise=riverNoise(vWorldPosition.xz*.65+vec2(0.,-uTime*.22));
  normal = normalize(normal + vec3(sin(vWorldPosition.z * 2.6 + uTime + flowNoise*3.) * 0.045, 0.0, cos(vWorldPosition.x * 2.0 - uTime + flowNoise*2.) * 0.035));
  vec3 viewDir = normalize(cameraPosition - vWorldPosition);
  float fresnel = pow(1.0 - max(0.0, dot(viewDir, normal)), 2.5);
  float depthFactor = smoothstep(0.04, 1.3, vDepth);

  vec3 base = mix(uShallowColor, uDeepColor, depthFactor);
  // Broken, slow-moving light cells show the shallow bed without a tiled white
  // grid. Their contribution vanishes in the deep part of the channel.
  float caustic=pow(1.-abs(sin(vWorldPosition.x*3.2+flowNoise*4.+uTime*.5)
    *sin(vWorldPosition.z*2.7-flowNoise*3.-uTime*.7)),12.);
  base+=vec3(.12,.13,.065)*caustic*(1.-depthFactor)*.55;
  vec3 color = mix(base, uSkyColor, fresnel * 0.7);

  vec3 halfDir = normalize(viewDir + normalize(vec3(-35.0, 65.0, 38.0)));
  float spec = pow(max(0.0, dot(normal, halfDir)), 100.0);
  color += vec3(1.0, 0.95, 0.82) * spec * 0.55;
  float streak = pow(max(0.0, sin(vWorldPosition.x * 4.0 + sin(vWorldPosition.z * 1.8 - uTime) * 1.5)), 24.0);
  float glint = pow(max(0.0, sin(vWorldPosition.z * 2.7 - uTime * 1.4)), 12.0);
  color += vec3(0.55, 0.75, 0.65) * streak * glint * smoothstep(.25,.8,flowNoise) * 0.2;
  float flow = sin(vWorldPosition.z * 3.0 - uTime * 1.2 + sin(vWorldPosition.x * 1.9));
  float shore = (1.0 - smoothstep(0.04, 0.26, vDepth)) * smoothstep(-0.2, 0.9, flow);
  float ripple = smoothstep(0.97, 0.999, sin(vWorldPosition.z * 1.8 - uTime * 0.8 + sin(vWorldPosition.x * 0.85)));
  ripple *= smoothstep(0.25, 0.85, sin(vWorldPosition.x * 1.4 + vWorldPosition.z * 0.57 + uTime * 0.2)) * 0.045;
  color = mix(color, vec3(0.73, 0.87, 0.79), shore * 0.5 + ripple);

  gl_FragColor = vec4(color, mix(0.38, 0.88, depthFactor) + shore * 0.1);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
  #include <fog_fragment>
}
`;

/** Stylized shallow stream rendered with a cheap multi-wave shader (no per-frame CPU normals). */
export function createWater(): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(15.5, 320, 16, 220);
  geometry.rotateX(-Math.PI / 2);
  geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(new Float32Array(geometry.attributes.position.count).fill(1), 1));

  const material = new THREE.ShaderMaterial({
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    transparent: true,
    depthWrite: false,
    fog: true,
    side: THREE.DoubleSide,
    uniforms: {
      ...THREE.UniformsUtils.merge([THREE.UniformsLib.fog]),
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(0x32645f) },
      uShallowColor: { value: new THREE.Color(0x8aa17a) },
      uSkyColor: { value: new THREE.Color(0xb7d0cf) }
    }
  });

  const water = new THREE.Mesh(geometry, material);
  water.name = 'shallow-stream';
  water.userData.update = (time: number) => {
    material.uniforms.uTime.value = time;
  };

  return water;
}
