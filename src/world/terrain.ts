import * as THREE from 'three';
import { createWater } from '../effects/water';
import { WORLD } from './config';
import { getTerrainHeight, riverCenter, riverHalfWidth, riverBankDistance, pathCenter, isPath, seededRandom, smoothstep, WATER_LEVEL, CROSSINGS, FOREST_TRAILS } from './landscape';
import type { Box2D, UpdateFn } from '../core/types';
import { VALLEY_TRAIL, valleyTrailMiter, valleyTrailSample, valleyWaterHeight } from './highlandValleyLayout';
import { EASTERN_TRAILS } from './easternForestLayout';

export { getTerrainHeight as getGroundHeight } from './landscape';

function surfaceTexture(): THREE.DataTexture {
  const size = 256, pixels = new Uint8Array(size * size * 4), rng = seededRandom(186);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const grain = Math.sin(x * Math.PI / 16 + Math.sin(y * Math.PI / 32) * 2) * Math.sin(y * Math.PI / 8);
    const patch = Math.sin(x*Math.PI/64 + Math.sin(y*Math.PI/64)) * Math.cos(y*Math.PI/32);
    // Clamp before Uint8 conversion: the old >255 values wrapped to black and
    // created harsh pepper dots rather than soil detail.
    const value = Math.max(0,Math.min(255,Math.round(232 + grain * 7 + patch*9 + rng()*3))), i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = value; pixels[i + 3] = 255;
  }
  const map = new THREE.DataTexture(pixels, size, size, THREE.RGBAFormat);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = map.wrapT = THREE.RepeatWrapping;
  map.magFilter = THREE.LinearFilter; map.minFilter = THREE.LinearMipmapLinearFilter;
  map.generateMipmaps = true; map.anisotropy = 4; map.needsUpdate = true;
  return map;
}

const meadow = new THREE.Color(0x6e8039), fresh = new THREE.Color(0x9aab50);
const shade = new THREE.Color(0x465d35), sand = new THREE.Color(0xaaa176);
function meadowColor(x: number, z: number, color: THREE.Color): THREE.Color {
  const patch = (Math.sin(x * 0.18 + Math.cos(z * 0.12) * 2) * Math.cos(z * 0.15) + 1) * 0.5;
  return color.copy(meadow).lerp(fresh, patch * 0.6)
    .lerp(shade, smoothstep(3, 11, getTerrainHeight(x, z)) * 0.45)
    .lerp(sand, 1 - smoothstep(-1.75, 2.25, riverBankDistance(x, z)));
}

function worldUV(geometry: THREE.BufferGeometry) {
  const p = geometry.attributes.position, uv: number[] = [];
  for (let i = 0; i < p.count; i++) uv.push(p.getX(i) / 4, p.getZ(i) / 4);
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
}

function ground(map: THREE.Texture,north=false,east=false): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(east?90:360,north?192:264,east?(north?150:75):(north?600:300),north?384:240);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(east?225:0,0,north?-200:28);
  const positions = geometry.attributes.position;
  const colors: number[] = [];
  const color = new THREE.Color();
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i), z = positions.getZ(i);
    const y = getTerrainHeight(x, z);
    positions.setY(i, y);
    meadowColor(x, z, color);
    if(north) {
      const gradient=Math.hypot(getTerrainHeight(x+.25,z)-y,getTerrainHeight(x,z+.25)-y)*4;
      const strata=.5+.5*Math.sin(y*.36+Math.sin(x*.15)*1.5+Math.sin(z*.11));
      const rock=new THREE.Color(0x626f68).lerp(new THREE.Color(0xa7a18d),strata*.48);
      const waterY=valleyWaterHeight(x,z);
      if(waterY!==null)rock.lerp(new THREE.Color(0x384d47),.58);
      color.lerp(rock,smoothstep(.28,.8,gradient)*.92+smoothstep(62,95,y)*.08);
      if(valleyTrailSample(x,z).distance<1.7)color.setHex(0xb5a588);
    }
    colors.push(color.r, color.g, color.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  worldUV(geometry);
  const material=new THREE.MeshStandardMaterial({map,vertexColors:true,roughness:1,bumpMap:map,bumpScale:north?.23:.06});
  if(north)material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRockPosition;').replace('#include <begin_vertex>','#include <begin_vertex>\nvRockPosition=position;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vRockPosition;
      float rockHash(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
      float rockNoise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(mix(rockHash(i),rockHash(i+vec3(1,0,0)),f.x),mix(rockHash(i+vec3(0,1,0)),rockHash(i+vec3(1,1,0)),f.x),f.y),
          mix(mix(rockHash(i+vec3(0,0,1)),rockHash(i+vec3(1,0,1)),f.x),mix(rockHash(i+vec3(0,1,1)),rockHash(i+vec3(1,1,1)),f.x),f.y),f.z);}
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',`#include <map_fragment>
      float macroRock=rockNoise(vRockPosition*.13);
      float detailRock=rockNoise(vRockPosition*.83)*.65+rockNoise(vRockPosition*3.7)*.35;
      float bedding=sin(vRockPosition.y*1.7+macroRock*6.);
      float fissure=pow(max(0.,1.-abs(sin(vRockPosition.y*.6+macroRock*4.))),15.);
      float joints=pow(max(0.,1.-abs(sin(vRockPosition.x*.39+rockNoise(vRockPosition*.06)*7.))),22.);
      float cliff=1.-smoothstep(.45,.85,abs(normalize(cross(dFdx(vRockPosition),dFdy(vRockPosition))).y));
      vec3 stoneTint=mix(vec3(.48,.57,.58),vec3(.94,.91,.78),smoothstep(.25,.8,macroRock));
      diffuseColor.rgb*=mix(vec3(1.),stoneTint*(.76+detailRock*.42+bedding*.035-fissure*.24-joints*.17),cliff);
      // Moss rests on broken ledges and in damp seams, not as evenly spaced dots.
      float moss=smoothstep(.52,.74,rockNoise(vRockPosition*vec3(.31,.72,.31)))*cliff*(.25+fissure*.6);
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.63,.83,.43),moss);
      float rockRelief=(detailRock*.10+bedding*.035-fissure*.065-joints*.04)*cliff
        *mix(1.,.4,smoothstep(40.,180.,length(vViewPosition)));
    `);
    shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
      // View-space surface derivatives add ledge/fissure light response without
      // changing the collision surface or paving the trail with extra geometry.
      vec3 rockDx=dFdx(-vViewPosition),rockDy=dFdy(-vViewPosition);
      vec3 rockRx=cross(rockDy,normal),rockRy=cross(normal,rockDx);
      float rockDet=dot(rockDx,rockRx);
      normal=normalize(abs(rockDet)*normal-sign(rockDet)*(dFdx(rockRelief)*rockRx+dFdy(rockRelief)*rockRy));
    `);
  };
  else material.onBeforeCompile=shader=>{
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vSoilWorld;')
      .replace('#include <begin_vertex>','#include <begin_vertex>\nvSoilWorld=(modelMatrix*vec4(position,1.)).xyz;');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec3 vSoilWorld;
      float soilHash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float soilNoise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
        return mix(mix(soilHash(i),soilHash(i+vec2(1,0)),f.x),mix(soilHash(i+vec2(0,1)),soilHash(i+vec2(1,1)),f.x),f.y);}
    `).replace('#include <map_fragment>',`#include <map_fragment>
      float broadSoil=soilNoise(vSoilWorld.xz*.18);
      float fineSoil=soilNoise(vSoilWorld.xz*1.4);
      diffuseColor.rgb*=.88+broadSoil*.19+fineSoil*.06;
      diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(1.08,1.01,.82),smoothstep(.58,.88,broadSoil)*.35);
    `);
  };
  const mesh = new THREE.Mesh(geometry,material);
  mesh.name = east?'eastern-forest-ground':north?'highland-mountain-ground':'sculpted-meadow-and-riverbed';
  mesh.castShadow=north;
  mesh.receiveShadow = true;
  return mesh;
}
function path(points: THREE.Vector2[], width: number, name: string, map: THREE.Texture, offsets?: THREE.Vector2[]): THREE.Mesh {
  const vertices: number[] = [], indices: number[] = [], colors: number[] = [];
  const color = new THREE.Color(), edgeColor = new THREE.Color(), dust = new THREE.Color(0xc7b486);
  const lanes = 8;
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const direction = points[Math.min(i + 1, points.length - 1)].clone().sub(points[Math.max(0, i - 1)]).normalize();
    for (let lane = 0; lane <= lanes; lane++) {
      const side = lane / lanes * 2 - 1;
      const edge = offsets ? width * 0.5 + .05 : width * 0.5 + Math.sin(i * 1.8) * 0.16 + Math.sin(i * 0.51) * 0.09;
      const x = p.x + (offsets?.[i].x ?? -direction.y) * edge * side;
      const z = p.y + (offsets?.[i].y ?? direction.x) * edge * side;
      vertices.push(x, getTerrainHeight(x, z) + 0.055, z);
      color.copy(dust).multiplyScalar(0.96 + Math.sin(i * 0.9 + lane) * 0.035);
      color.lerp(meadowColor(x, z, edgeColor), smoothstep(0.6, 1, Math.abs(side)) * 0.96);
      colors.push(color.r, color.g, color.b);
      if (i && lane < lanes) {
        const a = (i - 1) * (lanes + 1) + lane, b = a + lanes + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  worldUV(geometry);
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1, side: THREE.DoubleSide }));
  mesh.name = name;
  mesh.receiveShadow = true;
  return mesh;
}

function trailGravel(): THREE.InstancedMesh {
  const gravel = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0xc0b597, roughness: 1 }), 1100);
  gravel.name = 'trail-gravel'; gravel.receiveShadow = true;
  const rng = seededRandom(286), dummy = new THREE.Object3D(), color = new THREE.Color();
  let count = 0;
  for (let attempt = 0; attempt < 60000 && count < 1100; attempt++) {
    const x = rng() * 164 - 82, z = rng() * 140 - 70;
    if (!isPath(x, z, -0.3) || riverBankDistance(x, z) < 1.55) continue;
    const scale = 0.035 + rng() * 0.08;
    dummy.position.set(x, getTerrainHeight(x, z) + 0.07, z);
    dummy.scale.set(scale * 1.4, scale * 0.35, scale);
    dummy.rotation.set(rng() * 0.2, rng() * Math.PI * 2, 0); dummy.updateMatrix();
    gravel.setMatrixAt(count, dummy.matrix); gravel.setColorAt(count++, color.setScalar(0.75 + rng() * 0.25));
  }
  gravel.count = count;
  return gravel;
}
export interface Terrain { group: THREE.Group; colliders: Box2D[]; animations: UpdateFn[] }

function ridgeHeight(x: number, z: number, layer: number): number {
  const spine = -333 - layer * 64 + Math.sin(x * 0.018 + layer) * 19 + Math.cos(x * 0.04) * 5;
  const ridgeDistance = Math.abs(z - spine);
  const peak = 24 + layer * 17 + 16 * Math.exp(-(((x + 47 - layer * 30) / 45) ** 2))
    + 13 * Math.exp(-(((x - 95) / 29) ** 2));
  const slope = Math.exp(-ridgeDistance / (36 + layer * 12));
  const folds = Math.abs(Math.sin(x * 0.085 + z * 0.035)) * 4 + Math.cos(x * 0.15 - z * 0.055) * 1.7;
  return 4 + peak * slope + folds * slope;
}

function distantHills(layer = 0): THREE.Mesh {
  const geometry = new THREE.PlaneGeometry(520, 150, 140, 50);
  geometry.rotateX(-Math.PI / 2);
  geometry.translate(0, 0, -347 - layer * 64);
  const p = geometry.attributes.position;
  const colors: number[] = [];
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    const rise = smoothstep(-272 - layer * 64, -316 - layer * 64, z);
    const ridges = ridgeHeight(x, z, layer);
    const y = getTerrainHeight(x, -272) * (1-rise) + Math.max(5, ridges) * rise;
    p.setY(i, y);
    c.setHex(layer ? 0x759aa2 : 0x6d937a).lerp(new THREE.Color(0x9ab3b0), smoothstep(10, 65, y) * 0.55);
    const gradient = Math.hypot(ridgeHeight(x + 1, z, layer) - ridges, ridgeHeight(x, z + 1, layer) - ridges);
    c.lerp(new THREE.Color(layer ? 0x8c9ea5 : 0x989b84), smoothstep(0.5, 1.2, gradient) * 0.65);
    colors.push(c.r,c.g,c.b);
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors,3));
  geometry.computeVertexNormals();
  const hills = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ vertexColors:true, roughness:1 }));
  hills.name = layer ? `distant-ridgeline-${layer}` : 'distant-ridgeline';
  return hills;
}

export function createTerrain(): Terrain {
  const group = new THREE.Group();
  group.name = 'terrain';
  const map = surfaceTexture();
  group.add(ground(map),ground(map,true),ground(map,false,true),ground(map,true,true),distantHills(),distantHills(1),distantHills(2),trailGravel());
  const plaza = new THREE.RingGeometry(0, 13, 72, 16);
  plaza.rotateX(-Math.PI / 2);
  const p = plaza.attributes.position;
  const colors: number[] = [], color = new THREE.Color(), edgeColor = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, getTerrainHeight(x, z) + 0.06);
    color.setHex(0xc7b486).lerp(meadowColor(x, z, edgeColor), smoothstep(11.2, 13, Math.hypot(x, z)) * 0.96);
    colors.push(color.r, color.g, color.b);
  }
  plaza.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  plaza.computeVertexNormals();
  worldUV(plaza);
  const plazaMesh = new THREE.Mesh(plaza, new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 1 }));
  plazaMesh.name = 'celebration-clearing';
  plazaMesh.receiveShadow = true;
  group.add(plazaMesh);
  group.add(path(Array.from({ length: 73 }, (_, i) => new THREE.Vector2(pathCenter(i), i)), 4, 'winding-entry-path', map));
  group.add(path(Array.from({ length: 38 }, (_, i) => new THREE.Vector2(i, 4)), 4.6, 'stage-to-bridge-path', map));
  group.add(path(Array.from({ length: 22 }, (_, i) => new THREE.Vector2(59 + i, 4)), 4.6, 'far-bank-path', map));
  group.add(path(Array.from({ length: 50 }, (_, i) => new THREE.Vector2(Math.sin(-i * 0.06) * 5, -i)), 3.4, 'treehouse-trail', map));
  for (const trail of [...FOREST_TRAILS,...EASTERN_TRAILS]) {
    const points: THREE.Vector2[]=[];
    for(let i=1;i<trail.points.length;i++) {
      const a=new THREE.Vector2(...trail.points[i-1]),b=new THREE.Vector2(...trail.points[i]);
      const steps=Math.ceil(a.distanceTo(b));
      for(let j=0;j<steps;j++)points.push(a.clone().lerp(b,j/steps));
    }
    points.push(new THREE.Vector2(...trail.points[trail.points.length-1]));
    group.add(path(points,3.8,trail.name,map));
  }
  const mountainPath:THREE.Vector2[]=[], mountainOffsets:THREE.Vector2[]=[];
  for(let i=1;i<VALLEY_TRAIL.length;i++) {
    const a=VALLEY_TRAIL[i-1],b=VALLEY_TRAIL[i],n=Math.ceil(Math.hypot(b[0]-a[0],b[2]-a[2])*5);
    const am=valleyTrailMiter(i-1),bm=valleyTrailMiter(i);
    for(let j=0;j<n;j++) {
      const t=j/n;
      mountainPath.push(new THREE.Vector2(a[0]+(b[0]-a[0])*t,a[2]+(b[2]-a[2])*t));
      mountainOffsets.push(new THREE.Vector2(am[0]+(bm[0]-am[0])*t,am[1]+(bm[1]-am[1])*t));
    }
  }
  mountainPath.push(new THREE.Vector2(VALLEY_TRAIL.at(-1)![0],VALLEY_TRAIL.at(-1)![2]));
  const lastMiter=valleyTrailMiter(VALLEY_TRAIL.length-1);
  mountainOffsets.push(new THREE.Vector2(lastMiter[0],lastMiter[1]));
  group.add(path(mountainPath,4.2,'highland-switchback-trail',map,mountainOffsets));
  const water = createWater();
  const wp = water.geometry.attributes.position;
  const depths: number[] = [];
  for (let i = 0; i < wp.count; i++) {
    const z = wp.getZ(i);
    const across = wp.getX(i);
    wp.setX(i, riverCenter(z) + across * riverHalfWidth(z, Math.sign(across)) / 7.75);
    wp.setY(i, WATER_LEVEL);
    depths.push(Math.max(0, WATER_LEVEL - getTerrainHeight(wp.getX(i), z)));
  }
  water.geometry.setAttribute('aDepth', new THREE.Float32BufferAttribute(depths, 1));
  water.geometry.computeVertexNormals();
  group.add(water);
  const colliders: Box2D[] = [];
  for (let z = -104; z < WORLD.maxZ; z++) {
    if (CROSSINGS.some(bridge=>z+1>bridge.z-bridge.halfWidth && z<bridge.z+bridge.halfWidth)) continue;
    const x = riverCenter(z + 0.5);
    colliders.push({ minX: x - riverHalfWidth(z + 0.5, -1) + 0.05, maxX: x + riverHalfWidth(z + 0.5, 1) - 0.05, minZ: z, maxZ: z + 1 });
  }
  return { group, colliders, animations: [water.userData.update as UpdateFn] };
}
