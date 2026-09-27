import * as THREE from 'three';

export function createSkyDome(): THREE.Mesh {
  const material = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false,
    uniforms: { uTop: { value: new THREE.Color(0x70a8bd) }, uHorizon: { value: new THREE.Color(0xd8dec4) } },
    vertexShader: `
      varying vec3 vDirection;
      void main() {
        vDirection = position;
        vec4 clip = projectionMatrix * mat4(mat3(viewMatrix)) * vec4(position, 1.0);
        gl_Position = clip.xyww;
      }
    `,
    fragmentShader: `
      varying vec3 vDirection;
      uniform vec3 uTop;
      uniform vec3 uHorizon;
      float hash(vec2 p) { return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float noise(vec2 p) {
        vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+1.0),f.x),f.y);
      }
      float fbm(vec2 p) { return noise(p)*0.55+noise(p*2.1)*0.28+noise(p*4.3)*0.12+noise(p*8.1)*0.05; }
      void main() {
        vec3 d=normalize(vDirection);
        float h=max(0.0,d.y);
        vec3 color=mix(uHorizon,uTop,pow(smoothstep(0.0,0.8,h),0.65));
        vec2 uv=d.xz/(h+0.18)*1.8;
        float cloud=smoothstep(0.52,0.7,fbm(uv))*smoothstep(0.035,0.16,h)*(1.0-smoothstep(0.65,0.95,h));
        color=mix(color,vec3(0.94,0.955,0.9),cloud*0.88);
        float sun=pow(max(0.0,dot(d,normalize(vec3(-0.5,0.72,0.35)))),180.0);
        color+=vec3(1.0,0.9,0.63)*sun*0.2;
        gl_FragColor=vec4(color,1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `
  });
  const dome=new THREE.Mesh(new THREE.SphereGeometry(1,32,16),material);
  dome.name='daylight-sky';dome.frustumCulled=false;dome.renderOrder=-10;
  return dome;
}
