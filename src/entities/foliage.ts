import * as THREE from 'three';
import { CROSSINGS, getTerrainHeight, isOriginalPath, riverCenter, riverHalfWidth, riverBankDistance, seededRandom } from '../world/landscape';
import { easternTrailDistance } from '../world/easternForestLayout';
import { valleyWaterHeight } from '../world/highlandValleyLayout';
import { GARDEN_BASIN } from '../world/config';
import type { Box2D, QualityTier } from '../core/types';

/** Shared material animation: all foliage follows the same broad gust, with small local variation. */
export function windMaterial(color: number, strength: number, lighting: 'surface' | 'up' | 'canopy' = 'surface') {
  const time = { value: 0 };
  const material = new THREE.MeshStandardMaterial({ color, roughness: 1, side: THREE.DoubleSide });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uWindTime = time;
    shader.vertexShader = 'uniform float uWindTime;\n' + shader.vertexShader;
    if (lighting === 'canopy') {
      shader.vertexShader = 'attribute vec3 aCanopyNormal; varying vec3 vCanopyNormal;\n' + shader.vertexShader;
      shader.fragmentShader = 'varying vec3 vCanopyNormal;\n' + shader.fragmentShader;
    }
    shader.vertexShader = shader.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      ${lighting === 'canopy' ? 'vCanopyNormal = normalize(mat3(viewMatrix * modelMatrix) * aCanopyNormal);' : ''}
      vec4 windOrigin = instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
      float gust = sin(uWindTime * 1.3 + windOrigin.x * 0.13 + windOrigin.z * 0.09);
      transformed.x += gust * ${strength.toFixed(3)} * max(0.0, position.y);
      transformed.z += sin(uWindTime * 1.8 + windOrigin.z * 0.3) * ${ (strength * 0.35).toFixed(3) } * max(0.0, position.y);
    `);
    // Grass cards represent a volume of tiny blades, not dark undersides of paper.
    if (lighting !== 'surface') shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', `
      #include <normal_fragment_begin>
      normal = ${lighting === 'canopy' ? 'normalize(vCanopyNormal)' : 'normalize(mat3(viewMatrix) * vec3(0.0, 1.0, 0.0))'};
    `);
  };
  material.customProgramCacheKey = () => `meadow-wind-${strength}-${lighting}`;
  return { material, time };
}

export function grassGeometry(): THREE.BufferGeometry {
  const vertices: number[] = [], colors: number[] = [], normals: number[] = [];
  const root = new THREE.Color(0x527736), tip = new THREE.Color(0xabbf64), color = new THREE.Color();
  for (let i = 0; i < 6; i++) {
    const angle = i * 2.4, ox = Math.cos(angle) * 0.13, oz = Math.sin(angle) * 0.13;
    const height = 0.34 + (i % 3) * 0.08;
    const vertex = (t: number, side: number) => {
      const width = 0.038 * (1 - t);
      vertices.push(ox + Math.cos(angle) * side * width + 0.22 * t * t, height * t, oz + Math.sin(angle) * side * width + 0.09 * t * t);
      color.copy(root).lerp(tip, t * t); colors.push(color.r, color.g, color.b);
      normals.push(0, 1, 0);
    };
    for (let segment = 0; segment < 3; segment++) {
      const a = segment / 3, b = (segment + 1) / 3;
      vertex(a, -1); vertex(a, 1); vertex(b, -1);
      if (segment < 2) { vertex(a, 1); vertex(b, 1); vertex(b, -1); }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return geometry;
}

let cachedLeafTexture: THREE.DataTexture | undefined;
let cachedBarkTexture: THREE.DataTexture | undefined;
/** Tileable longitudinal bark, shared by scattered trees and nearby woodlands. */
export function createBarkTexture():THREE.DataTexture {
  if(cachedBarkTexture)return cachedBarkTexture;
  const width=128,height=256,data=new Uint8Array(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const u=x/width*Math.PI*2,v=y/height*Math.PI*2;
    const warp=Math.sin(v*2)*.5+Math.sin(v*5+u)*.16;
    const furrow=Math.pow(.5+.5*Math.cos(u*12+warp),10);
    const grain=Math.sin(u*31+warp*3)*7+Math.sin(u*5+Math.sin(v))*12;
    const value=Math.round(213-furrow*67+grain),i=(y*width+x)*4;
    data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
  }
  const map=new THREE.DataTexture(data,width,height);map.colorSpace=THREE.SRGBColorSpace;
  map.wrapS=map.wrapT=THREE.RepeatWrapping;map.repeat.set(2,2);
  map.minFilter=THREE.LinearMipmapLinearFilter;map.magFilter=THREE.LinearFilter;
  map.generateMipmaps=true;map.needsUpdate=true;cachedBarkTexture=map;return map;
}
/** A small original leaf spray, not a rectangular photograph or an opaque canopy ball. */
export function createLeafTexture(): THREE.DataTexture {
  if (cachedLeafTexture) return cachedLeafTexture;
  const size = 128, data = new Uint8Array(size * size * 4), rng = seededRandom(41);
  const leaflets = Array.from({ length: 17 }, (_, i) => {
    const angle = i * 2.4, radius = 0.05 + Math.sqrt(i / 17) * 0.28;
    return { x: 0.5 + Math.cos(angle) * radius, y: 0.5 + Math.sin(angle) * radius,
      angle: angle + 0.4, length: 0.11 + rng() * 0.045, width: 0.042 + rng() * 0.022 };
  });
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const offset = (y * size + x) * 4;
    data[offset] = data[offset + 1] = data[offset + 2] = 255;
    for (const leaf of leaflets) {
      const dx = x / size - leaf.x, dy = y / size - leaf.y;
      const along = (dx * Math.cos(leaf.angle) + dy * Math.sin(leaf.angle)) / leaf.length;
      const across = -dx * Math.sin(leaf.angle) + dy * Math.cos(leaf.angle);
      const edge = leaf.width * (1 - Math.pow(Math.abs(along), 1.5)) - Math.abs(across);
      if (edge < 0) continue;
      const vein = Math.max(0, 1 - Math.abs(across) / 0.004);
      const value = Math.round(220 + along * 14 + Math.sin(along * 24) * 4 - vein * 18);
      data[offset] = data[offset + 1] = data[offset + 2] = value;
      data[offset + 3] = Math.min(255, Math.round(edge * size * 255));
    }
  }
  const map = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.needsUpdate = true;
  cachedLeafTexture = map;
  return map;
}

/** Small reusable living foliage for trellises and the treehouse. */
export function createLeafCluster(radius: number, tint: number, seed: number): THREE.InstancedMesh {
  const geometry = new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2).translate(0, 0.2, 0);
  const { material } = windMaterial(tint, 0, 'canopy');
  material.map = createLeafTexture(); material.alphaTest = 0.42; material.alphaToCoverage = true;
  const leaves = new THREE.InstancedMesh(geometry, material, 180);
  leaves.name = 'leaf-cluster'; leaves.castShadow = true;
  const rng = seededRandom(seed), dummy = new THREE.Object3D(), normal = new THREE.Vector3();
  const normals = new Float32Array(leaves.count * 3), color = new THREE.Color();
  for (let i = 0; i < leaves.count; i++) {
    const h = rng() * 2 - 1, angle = i * 2.4, r = Math.sqrt(1 - h * h) * (0.6 + rng() * 0.4);
    dummy.position.set(Math.cos(angle) * r * radius, h * radius * 0.55, Math.sin(angle) * r * radius);
    dummy.rotation.set(rng() * 2 - 1, rng() * 6.28, rng() * 1.8 - 0.9);
    dummy.scale.setScalar(radius * (0.3 + rng() * 0.12)); dummy.updateMatrix();
    leaves.setMatrixAt(i, dummy.matrix); leaves.setColorAt(i, color.setScalar(0.86 + h * 0.1 + rng() * 0.08));
    normal.set(Math.cos(angle) * r * 0.65, 0.4 + h * 0.65, Math.sin(angle) * r * 0.65).normalize().toArray(normals, i * 3);
  }
  geometry.setAttribute('aCanopyNormal', new THREE.InstancedBufferAttribute(normals, 3));
  return leaves;
}

export function createFoliage() {
  const group = new THREE.Group();
  group.name = 'layered-woodland';
  const rng = seededRandom(926);
  const colliders: Box2D[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const grassWind = windMaterial(0xffffff, 0.23, 'up');
  grassWind.material.vertexColors = true;
  const grass = new THREE.InstancedMesh(grassGeometry(), grassWind.material, 36000);
  grass.name = 'wind-swept-meadow';
  grass.receiveShadow = true;
  let grassCount = 0;
  const clusters = [[-17, 14], [19, 13], [28, -7], [34, 20], [-19, -16], [63, 18], [61, -15], [-32, 28], [-7, 40], [9, 47], [-13, 57], [26, 8],[-117,12],[-103,-13],[97,-45],[118,-58],[15,-101],[-24,105],[-73,-72],[99,65]];
  for (let i = 0; i < grass.count; i++) {
    let x = 0, z = 0;
    for (let attempt = 0; attempt < 80; attempt++) {
      if (i % 2) {
        const c = clusters[Math.floor(i / 2) % clusters.length];
        x = c[0] + (rng() - 0.5) * 22; z = c[1] + (rng() - 0.5) * 22;
      } else { x = rng() * 314 - 157; z = rng() * 274 - 137; }
      if (!isOriginalPath(x, z, 0.5) && riverBankDistance(x, z) > 0.75) break;
    }
    dummy.position.set(x, getTerrainHeight(x, z) - 0.025, z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.setScalar(0.75 + rng() * 0.85);
    dummy.updateMatrix();
    // Filter after consuming the original placement/style draws, preserving
    // every other plant and the following tree generator's random sequence.
    if (Math.hypot(x - GARDEN_BASIN.x, z - GARDEN_BASIN.z) < GARDEN_BASIN.radius + 1) continue;
    if(easternTrailDistance(x,z)<2.55)continue;
    grass.setMatrixAt(grassCount++, dummy.matrix);
  }
  grass.count = grassCount;
  group.add(grass);

  // Flower heads are five radial petals, batched with stems rather than hundreds of draw calls.
  const flowerGeo = new THREE.BufferGeometry();
  const fv: number[] = [], fc:number[]=[];
  const petalPoint=(angle:number,t:number,side:number)=>{
    const along=.035+t*.205,width=Math.sin(t*Math.PI)*.085*side;
    return [Math.cos(angle)*along-Math.sin(angle)*width,
      .55+Math.sin(t*Math.PI)*.035+t*t*.035-side*side*.017,
      Math.sin(angle)*along+Math.cos(angle)*width];
  };
  const flowerVertex=(p:number[],t:number)=>{fv.push(...p);fc.push(1,.78+.22*t,.55+.45*t);};
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 0.4;
    for(let k=0;k<4;k++)for(const side of [-1,1]) {
      const t=k/4,u=(k+1)/4;
      for(const [along,width] of [[t,0],[t,side],[u,0],[t,side],[u,side],[u,0]])flowerVertex(petalPoint(a,along,width),along);
    }
    const b=a+Math.PI*.4;
    flowerVertex([0,.573,0],0);flowerVertex([Math.cos(a)*.053,.552,Math.sin(a)*.053],0);flowerVertex([Math.cos(b)*.053,.552,Math.sin(b)*.053],0);
  }
  flowerGeo.setAttribute('position', new THREE.Float32BufferAttribute(fv, 3));
  flowerGeo.setAttribute('color',new THREE.Float32BufferAttribute(fc,3));
  flowerGeo.computeVertexNormals();
  const flowerWind = windMaterial(0xffffff, 0.15);
  flowerWind.material.vertexColors=true;
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerWind.material, 1900);
  const stems = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.012, 0.016, 0.56, 3).translate(0, 0.28, 0), new THREE.MeshStandardMaterial({ color: 0x527943 }), 1900);
  flowers.name = 'clustered-wildflowers';
  let flowerCount = 0;
  const flowerPalette = [0xf4df96, 0xe6e9ce, 0xc795c9, 0xd9dff0, 0xe7b3bc];
  for (let i = 0; i < flowers.count; i++) {
    const c = clusters[i % clusters.length];
    let x = 0, z = 0;
    for (let a = 0; a < 60; a++) {
      const angle = rng() * Math.PI * 2, r = Math.sqrt(rng()) * 9;
      x = c[0] + Math.cos(angle) * r; z = c[1] + Math.sin(angle) * r;
      if (!isOriginalPath(x, z, 0.8) && riverBankDistance(x, z) > 1.25) break;
    }
    dummy.position.set(x, getTerrainHeight(x, z), z);
    dummy.rotation.set(0, rng() * 6.28, 0);
    dummy.scale.setScalar(0.6 + rng() * 0.85); dummy.updateMatrix();
    if (Math.hypot(x - GARDEN_BASIN.x, z - GARDEN_BASIN.z) < GARDEN_BASIN.radius + .55) continue;
    if (easternTrailDistance(x, z) < 2.85) continue;
    flowers.setMatrixAt(flowerCount, dummy.matrix); stems.setMatrixAt(flowerCount, dummy.matrix);
    flowers.setColorAt(flowerCount++, color.setHex(flowerPalette[i % flowerPalette.length]));
  }
  flowers.count = stems.count = flowerCount;
  group.add(flowers, stems);

  const treePositions: Array<[number, number, number]> = [
    [-18,-7,1.1], [-23,4,1.1], [-17,22,1.25], [19,-16,1.2], [31,-18,1.35],
    [30,24,1.05], [65,-8,1.2], [67,23,1.4], [-12,-27,1.35], [10,-30,1.25],
    [-29,15,1.4], [23,36,1.15], [-24,40,1.3]
  ];
  for (let i = 0; i < 380; i++) {
    const x = rng() * 338 - 169, z = rng() * 296 - 148;
    if (Math.hypot(x, z) < 34 || isOriginalPath(x, z, 4) || riverBankDistance(x, z) < 5.25) continue;
    // Keep the original treehouse and waterfall readable.
    if (Math.hypot(x, z + 48) < 13) continue;
    // Keep a readable sightline from the upstream path to the waterfall face.
    if (Math.hypot((x-33)*.8,z+111)<15) continue;
    // Consume the original scale draw before filtering so existing southern
    // placements keep their deterministic random sequence.
    const scale = 1.05 + rng() * 1.1;
    if (z < -108) {
      const water = valleyWaterHeight(x, z);
      const slope = Math.hypot(getTerrainHeight(x + .7, z) - getTerrainHeight(x - .7, z),
        getTerrainHeight(x, z + .7) - getTerrainHeight(x, z - .7)) / 1.4;
      if ((water !== null && getTerrainHeight(x, z) <= water + .5) || slope > .58) continue;
    }
    treePositions.push([x, z, scale]);
  }
  const trunkGeo = new THREE.CylinderGeometry(0.24, 0.53, 6.5, 10, 6).translate(0, 3.25, 0);
  const trunkPoints = trunkGeo.attributes.position, barkColors: number[] = [];
  for (let i = 0; i < trunkPoints.count; i++) {
    const y = trunkPoints.getY(i), x = trunkPoints.getX(i), z = trunkPoints.getZ(i);
    trunkPoints.setX(i, x + Math.sin(y * 0.65) * 0.17);
    trunkPoints.setZ(i, z + Math.sin(y * 0.46) * 0.12);
    const grain = 0.82 + Math.sin(Math.atan2(z, x) * 7 + y * 0.2) * 0.12;
    barkColors.push(grain, grain, grain);
  }
  trunkGeo.setAttribute('color', new THREE.Float32BufferAttribute(barkColors, 3)); trunkGeo.computeVertexNormals();
  const trunkMaterial=new THREE.MeshStandardMaterial({color:0x8c8065,map:createBarkTexture(),bumpMap:createBarkTexture(),bumpScale:.09,roughness:1,vertexColors:true});
  const treeCount = treePositions.filter(([x,z]) => easternTrailDistance(x,z) >= 7.5).length;
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMaterial, treeCount);
  const normal = new THREE.Vector3();
  const sprayGeometry = new THREE.PlaneGeometry(1.6, 1.6).rotateX(-Math.PI / 2).translate(0, 0.25, 0);
  const cardWind = windMaterial(0xffffff, 0.08, 'canopy');
  cardWind.material.map = createLeafTexture(); cardWind.material.alphaTest = 0.42;
  cardWind.material.alphaToCoverage = true;
  cardWind.material.emissive.setHex(0x28422b); cardWind.material.emissiveIntensity = 0.16;
  const spraysPerLobe = 48;
  const sprays = new THREE.InstancedMesh(sprayGeometry, cardWind.material, treeCount * 11 * spraysPerLobe);
  sprays.name='canopy-leaf-sprays';
  const canopyNormals = new Float32Array(sprays.count * 3);
  const branches = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.09, 0.23, 3, 6).translate(0, 1.5, 0), new THREE.MeshStandardMaterial({ color: 0x8c8065,map:createBarkTexture(),bumpMap:createBarkTexture(),bumpScale:.04,roughness:1 }), treeCount * 3);
  let renderedTreeIndex = 0;
  treePositions.forEach(([x,z,s], index) => {
    // Keep original indices and every style draw, including omitted trees.
    // Compact only GPU instance indices; later crowns and riverbank RNG stay stable.
    const visible = easternTrailDistance(x,z) >= 7.5;
    const renderIndex = renderedTreeIndex;
    if (visible) renderedTreeIndex++;
    const y = getTerrainHeight(x,z);
    dummy.position.set(x,y,z); dummy.rotation.set(0,rng()*6.28,0); dummy.scale.setScalar(s); dummy.updateMatrix();
    if (visible) {
      trunks.setMatrixAt(renderIndex,dummy.matrix);
      colliders.push({ minX:x-0.48*s,maxX:x+0.48*s,minZ:z-0.48*s,maxZ:z+0.48*s });
    }
    for (let j = 0; j < 11; j++) {
      const a = j * 2.4, spread = j < 8 ? 2.25 : 1.1;
      const asymmetry = index % 4 === 0 ? 1.3 : 1;
      dummy.position.set(x + Math.cos(a)*spread*s*asymmetry + (index%3-1)*s*.45, y + (j < 8 ? 6 : 7.6)*s + rng()*s, z + Math.sin(a)*spread*s);
      dummy.rotation.set(rng()*0.3, a, rng()*0.3);
      dummy.scale.set((1.8+rng()*0.65)*s,(1.05+rng()*0.65)*s,(1.7+rng()*0.5)*s);
      color.setHex(j > 7 ? 0x789a4f : 0x547d42).lerp(new THREE.Color(0x3d6844),rng()*0.25);
      const center=dummy.position.clone(),scale=dummy.scale.clone(),lobeColor=color.clone();
      for(let k=0;k<spraysPerLobe;k++) {
        const angle=k*2.4, height=((k*.61803398875+.5)%1)*2-1, r=Math.sqrt(1-height*height)*(0.8+rng()*.2);
        dummy.position.set(center.x+Math.cos(angle)*r*scale.x,center.y+height*scale.y,center.z+Math.sin(angle)*r*scale.z);
        dummy.rotation.set(rng()*2-1,rng()*6.28,rng()*1.8-.9);
        dummy.scale.setScalar((.85+rng()*.45)*s);dummy.updateMatrix();
        // Interleave by leaf number, so reduced counts retain every tree, not just the first trees.
        const sprayIndex=k*treeCount*11+renderIndex*11+j;
        color.copy(lobeColor).multiplyScalar(.94+height*.07+rng()*.06);
        normal.set(Math.cos(angle)*r*.6,.4+height*.65,Math.sin(angle)*r*.6).normalize();
        if (visible) {
          sprays.setMatrixAt(sprayIndex,dummy.matrix);
          sprays.setColorAt(sprayIndex,color);
          normal.toArray(canopyNormals,sprayIndex*3);
        }
      }
    }
    for (let j=0;j<3;j++) {
      dummy.position.set(x,y+3.7*s,z);dummy.rotation.set(0,j*2.1,0.7);dummy.scale.setScalar(s);dummy.updateMatrix();
      if (visible) branches.setMatrixAt(renderIndex*3+j,dummy.matrix);
    }
  });
  for (const mesh of [trunks, branches]) { mesh.castShadow = true; mesh.receiveShadow = true; group.add(mesh); }
  sprayGeometry.setAttribute('aCanopyNormal', new THREE.InstancedBufferAttribute(canopyNormals, 3));
  sprays.castShadow=true; group.add(sprays);

  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,1),new THREE.MeshStandardMaterial({color:0x8f9f8b,roughness:1}),155);
  rocks.name = 'weathered-bank-stones';
  for (let i=0;i<rocks.count;i++) {
    const z = i%4 ? [-111,-52,-24,29,54,112][Math.floor(i/4)%6]+(rng()-.5)*14 : rng()*270-135;
    const side=i%2?1:-1, x = riverCenter(z)+side*(riverHalfWidth(z,side)+.05+rng()*2.1);
    if (CROSSINGS.some(c=>Math.abs(z-c.z)<4)) { dummy.scale.setScalar(0); }
    else dummy.scale.set(0.35+rng()*1.3,0.25+rng()*0.55,0.4+rng()*0.9);
    dummy.position.set(x,getTerrainHeight(x,z)+0.05,z);dummy.rotation.set(0,rng()*6.28,0);dummy.updateMatrix();rocks.setMatrixAt(i,dummy.matrix);
  }
  rocks.castShadow=true;rocks.receiveShadow=true;group.add(rocks);

  const reeds = new THREE.InstancedMesh(grass.geometry, grassWind.material, 850);
  reeds.name = 'stream-bank-reeds'; reeds.receiveShadow = true;
  for (let i = 0; i < reeds.count; i++) {
    let z = rng() * 270 - 135;
    if (CROSSINGS.some(c=>Math.abs(z-c.z)<3)) z += 7;
    const side = i % 2 ? 1 : -1;
    const x = riverCenter(z) + side * (riverHalfWidth(z, side) + 0.15 + rng() * 1.1);
    dummy.position.set(x, getTerrainHeight(x, z), z);
    dummy.rotation.set(0, rng() * 6.28, 0);
    dummy.scale.set(1.1, 1.8 + rng(), 1.1); dummy.updateMatrix(); reeds.setMatrixAt(i, dummy.matrix);
  }
  group.add(reeds);
  return {
    group, colliders,
    update(time: number) { grassWind.time.value = flowerWind.time.value = cardWind.time.value = time; },
    setQuality(tier: QualityTier) {
      grass.count = Math.min(grassCount, tier==='high'?grassCount:tier==='medium'?24000:10000);
      flowers.count=stems.count=Math.min(flowerCount,tier==='low'?950:flowerCount);
      sprays.count=treeCount*11*(tier==='high'?48:tier==='medium'?36:24);
    }
  };
}
