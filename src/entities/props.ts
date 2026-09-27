import * as THREE from 'three';
import type { Box2D, Placement } from '../core/types';
import { createBarkTexture, createLeafCluster } from './foliage';
import { woodGrain } from './festivalLandmarks';

const assetCache = new Map<string, unknown>();

const TREE_DETAILS = {
  near: { trunkSegments: 10, crownDetail: 1, blobs: 5 },
  far: { trunkSegments: 7, crownDetail: 0, blobs: 3 }
} as const;

function getCachedAsset<T>(key: string, create: () => T): T {
  if (!assetCache.has(key)) assetCache.set(key, create());
  return assetCache.get(key) as T;
}

function applyTransform(group: THREE.Group, options: Placement): THREE.Group {
  group.position.set(options.x ?? 0, options.y ?? 0, options.z ?? 0);
  group.scale.setScalar(options.scale ?? 1);
  if (options.rotationY) group.rotation.y = options.rotationY;
  return group;
}

function shadow(mesh: THREE.Mesh): THREE.Mesh {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

interface TreeOptions extends Placement {
  height?: number;
  radius?: number;
  detail?: 'near' | 'far';
  foliageColor?: number;
}

export function createTree(options: TreeOptions = {}): THREE.Group {
  const group = applyTransform(new THREE.Group(), options);
  const height = options.height ?? 5.5;
  const radius = options.radius ?? 1.35;
  const detail = options.detail === 'far' ? 'far' : 'near';
  const profile = TREE_DETAILS[detail];
  const foliageColor = options.foliageColor ?? 0x4e8c55;
  const collisionRadius = radius * 0.55 * (options.scale ?? 1);
  group.name = 'tree';

  const assets = getCachedAsset(`tree:${detail}:${radius}:${height}:${foliageColor}`, () => {
    const foliageBlobs: Array<{ radius: number; x: number; y: number; z: number }> = [];
    for (let index = 0; index < profile.blobs; index += 1) {
      const angle = (index / Math.max(1, profile.blobs - 1)) * Math.PI * 2;
      const isTop = index === 0;
      const blobRadius = isTop ? radius * 1.02 : radius * 0.72;
      const spread = isTop ? 0 : radius * 0.52;
      foliageBlobs.push({
        radius: blobRadius,
        x: Math.cos(angle) * spread,
        y: isTop ? height * 1.08 : height * (0.84 + (index % 2) * 0.1),
        z: Math.sin(angle) * spread
      });
    }

    return {
      trunkGeometry: new THREE.CylinderGeometry(radius * 0.22, radius * 0.42, height, profile.trunkSegments),
      rootGeometry: new THREE.CylinderGeometry(radius * 0.5, radius * 0.72, radius * 0.55, profile.trunkSegments),
      trunkMaterial: new THREE.MeshStandardMaterial({ color: 0x806440,map:createBarkTexture(),bumpMap:createBarkTexture(),bumpScale:.08,roughness: 0.95 }),
      foliageBlobs
    };
  });

  const trunk = shadow(new THREE.Mesh(assets.trunkGeometry, assets.trunkMaterial));
  trunk.position.y = height / 2;
  const rootBase = shadow(new THREE.Mesh(assets.rootGeometry, assets.trunkMaterial));
  rootBase.position.y = radius * 0.28;
  group.add(trunk, rootBase);

  for (const blob of assets.foliageBlobs) {
    const crown = createLeafCluster(blob.radius * 1.25, foliageColor, Math.round(blob.y * 100 + blob.x * 20));
    crown.position.set(blob.x, blob.y, blob.z);
    crown.rotation.y = blob.x * 0.7 + blob.z * 0.3;
    group.add(crown);
  }

  group.userData.collider = {
    minX: group.position.x - collisionRadius,
    maxX: group.position.x + collisionRadius,
    minZ: group.position.z - collisionRadius,
    maxZ: group.position.z + collisionRadius
  };
  return group;
}

interface MushroomOptions extends Placement {
  height?: number;
  radius?: number;
  capColor?: number;
  spots?: boolean;
  glow?: boolean;
}

function mushroomCapPoint(radius:number,angle:number,phi:number):THREE.Vector3 {
  const r=Math.sin(phi),edge=r*r*r*r;
  const scallop=1+edge*(Math.sin(angle*7)*.022+Math.sin(angle*11+.4)*.012);
  return new THREE.Vector3(Math.cos(angle)*radius*r*scallop,
    radius*(Math.cos(phi)*.67+edge*Math.sin(angle*7)*.022),Math.sin(angle)*radius*r*scallop);
}

function mushroomSurfaces(radius:number) {
  const cap=new THREE.SphereGeometry(radius,64,20,0,Math.PI*2,0,Math.PI/2);
  const positions=cap.attributes.position;
  for(let i=0;i<positions.count;i++) {
    const angle=Math.atan2(positions.getZ(i),positions.getX(i));
    const phi=Math.acos(Math.max(-1,Math.min(1,positions.getY(i)/radius)));
    const p=mushroomCapPoint(radius,angle,phi);positions.setXYZ(i,p.x,p.y,p.z);
  }
  cap.computeVertexNormals();
  const vertices:number[]=[],uv:number[]=[],indices:number[]=[],angular=256,radial=8;
  for(let row=0;row<=radial;row++)for(let i=0;i<=angular;i++) {
    const t=row/radial,angle=i/angular*Math.PI*2,r=.19+.81*t;
    const edge=mushroomCapPoint(radius,angle,Math.PI/2);
    const ridge=(.5+.5*Math.cos(angle*64+Math.sin(t*2)*.3))*.065*radius*Math.sin(t*Math.PI);
    vertices.push(edge.x*r,edge.y*t-radius*.23*(1-t)-ridge,edge.z*r);uv.push(i/angular,t);
    if(row&&i<angular){const a=(row-1)*(angular+1)+i,b=a+angular+1;indices.push(a,a+1,b,a+1,b+1,b);}
  }
  const gills=new THREE.BufferGeometry();gills.setAttribute('position',new THREE.Float32BufferAttribute(vertices,3));
  gills.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));gills.setIndex(indices);gills.computeVertexNormals();
  return {cap,gills};
}

function mushroomSkin():THREE.DataTexture {
  return getCachedAsset('mushroom-skin',()=>{
    const size=128,data=new Uint8Array(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++) {
      const u=x/size*Math.PI*2,v=y/size*Math.PI*2;
      const mottling=Math.sin(u*7+Math.sin(v*3)*1.8)*Math.cos(v*5+Math.sin(u*3));
      const fibers=Math.pow(Math.max(0,Math.sin(u*32+Math.sin(v*3)*.9)),12);
      const value=Math.round(233+mottling*15-fibers*11),i=(y*size+x)*4;
      data[i]=data[i+1]=data[i+2]=value;data[i+3]=255;
    }
    const map=new THREE.DataTexture(data,size,size);map.colorSpace=THREE.SRGBColorSpace;
    map.wrapS=map.wrapT=THREE.RepeatWrapping;map.minFilter=THREE.LinearMipmapLinearFilter;
    map.magFilter=THREE.LinearFilter;map.generateMipmaps=true;map.needsUpdate=true;return map;
  });
}

export function createMushroom(options: MushroomOptions = {}): THREE.Group {
  const group = applyTransform(new THREE.Group(), options);
  const height = options.height ?? 1.5;
  const radius = options.radius ?? 0.85;
  const capColor = options.capColor ?? 0xd95b55;
  const spots = options.spots ?? false;
  const glow = options.glow ?? false;
  group.name = 'mushroom';

  const assets = getCachedAsset(`mushroom:${radius}:${height}:${capColor}:${spots}:${glow}`, () => {
    const skin=mushroomSkin(),surfaces=mushroomSurfaces(radius);
    const capMaterial = new THREE.MeshStandardMaterial({ color: capColor, map:skin, bumpMap:skin,bumpScale:radius*.025,roughness: 0.83 });
    if (glow) {
      capMaterial.emissive.setHex(capColor);
      capMaterial.emissiveIntensity = 0.055;
    }
    return {
      stemGeometry: new THREE.CylinderGeometry(radius * 0.2, radius * 0.34, height, 10),
      stemMaterial: new THREE.MeshStandardMaterial({ color: 0xf5dfb4,map:skin,bumpMap:skin,bumpScale:radius*.02,roughness: 0.92 }),
      capGeometry: surfaces.cap,
      capMaterial,
      spotGeometry: new THREE.SphereGeometry(radius * 0.16, 8, 6),
      spotMaterial: new THREE.MeshStandardMaterial({ color: 0xfff6e8, roughness: 0.6 }),
      gillGeometry: surfaces.gills,
      gillMaterial: new THREE.MeshStandardMaterial({ color: 0xe7c49a, roughness: 0.92, side: THREE.DoubleSide }),
      skirtGeometry: new THREE.TorusGeometry(radius * 0.44, radius * 0.12, 6, 14),
      skirtMaterial: new THREE.MeshStandardMaterial({ color: 0xf5dfb4, roughness: 0.95 })
    };
  });

  const stem = shadow(new THREE.Mesh(assets.stemGeometry, assets.stemMaterial));
  stem.position.y = height / 2;
  const cap = shadow(new THREE.Mesh(assets.capGeometry, assets.capMaterial));
  cap.position.y = height;
  group.add(stem, cap);

  const gills = new THREE.Mesh(assets.gillGeometry, assets.gillMaterial);
  gills.name = 'mushroom-gills';
  gills.position.y = height;
  gills.receiveShadow = true;
  group.add(gills);

  const skirt = new THREE.Mesh(assets.skirtGeometry, assets.skirtMaterial);
  skirt.name = 'mushroom-skirt';
  skirt.position.y = height * 0.62;
  skirt.rotation.x = Math.PI / 2;
  group.add(skirt);

  if (spots) {
    for (let index = 0; index < 5; index += 1) {
      const theta = (index / 5) * Math.PI * 2 + 0.5;
      const phi = 0.55 + (index % 2) * 0.42;
      const nx = Math.sin(phi) * Math.cos(theta);
      const ny = Math.cos(phi);
      const nz = Math.sin(phi) * Math.sin(theta);
      const spot = new THREE.Mesh(assets.spotGeometry, assets.spotMaterial);
      spot.name = 'mushroom-spot';
      spot.position.copy(mushroomCapPoint(radius,theta,phi));spot.position.y+=height;
      spot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(nx, ny/.67, nz).normalize());
      spot.scale.set(1, 0.32, 1);
      group.add(spot);
    }
  }

  const collisionRadius = radius * 0.5 * (options.scale ?? 1);
  group.userData.collider = {
    minX: group.position.x - collisionRadius,
    maxX: group.position.x + collisionRadius,
    minZ: group.position.z - collisionRadius,
    maxZ: group.position.z + collisionRadius
  };
  return group;
}

export function createLantern(options: Placement = {}): THREE.Group {
  const group = applyTransform(new THREE.Group(), options);
  group.name = 'lantern';

  const assets = getCachedAsset('lantern', () => ({
    postGeometry: new THREE.CylinderGeometry(0.11, 0.16, 3.2, 6),
    armGeometry: new THREE.CylinderGeometry(0.07, 0.07, 0.95, 6),
    lanternGeometry: new THREE.BoxGeometry(0.45, 0.62, 0.45),
    woodMaterial: new THREE.MeshStandardMaterial({ color: 0x5b4031, roughness: 1 }),
    glowMaterial: new THREE.MeshStandardMaterial({ color: 0xffce6a, emissive: 0xff9e36, emissiveIntensity: 1.7, roughness: 0.5 })
  }));

  const post = shadow(new THREE.Mesh(assets.postGeometry, assets.woodMaterial));
  post.position.y = 1.6;
  const arm = shadow(new THREE.Mesh(assets.armGeometry, assets.woodMaterial));
  arm.rotation.z = Math.PI / 2;
  arm.position.set(0.44, 3.05, 0);

  const swing = new THREE.Group();
  swing.name = 'lantern-swing';
  swing.position.set(0.82, 2.72, 0);
  const lantern = shadow(new THREE.Mesh(assets.lanternGeometry, assets.glowMaterial));
  lantern.position.y = -0.35;
  const light = new THREE.PointLight(0xffb85f, 1.4, 8, 2);
  light.position.y = -0.35;
  swing.add(lantern, light);
  group.add(post, arm, swing);

  group.userData.update = (time: number) => {
    swing.rotation.z = Math.sin(time * 1.8 + group.position.x * 0.2) * 0.16;
  };
  return group;
}

interface BridgeOptions extends Placement {
  length?: number;
  width?: number;
}

export function createBridge(options: BridgeOptions = {}): THREE.Group {
  const group = applyTransform(new THREE.Group(), options);
  const length = options.length ?? 17;
  const width = options.width ?? 4.2;
  group.name = 'vine-bridge';

  const assets = getCachedAsset(`bridge:${length}:${width}`, () => {
    const vineGeometries = [-1, 1].map((side) => {
      const curve = new THREE.CatmullRomCurve3([
        new THREE.Vector3(-length / 2, 1.15, side * (width / 2 - 0.12)),
        new THREE.Vector3(0, 0.72, side * (width / 2 - 0.12)),
        new THREE.Vector3(length / 2, 1.15, side * (width / 2 - 0.12))
      ]);
      return new THREE.TubeGeometry(curve, 16, 0.055, 5, false);
    });
    return {
      boardGeometry: new THREE.BoxGeometry(length / 13 - 0.08, 0.18, width),
      boardMaterial: new THREE.MeshStandardMaterial({ color: 0x9a6a45, roughness: 0.95 }),
      vineGeometries,
      vineMaterial: new THREE.MeshStandardMaterial({ color: 0x52734e, roughness: 1 })
    };
  });

  for (let index = 0; index < 13; index += 1) {
    const board = shadow(new THREE.Mesh(assets.boardGeometry, assets.boardMaterial));
    board.position.set(-length / 2 + (index + 0.5) * (length / 13), Math.sin(index * 0.8) * 0.06, 0);
    board.rotation.z = Math.sin(index * 1.7) * 0.025;
    group.add(board);
  }
  assets.vineGeometries.forEach((geometry) => group.add(shadow(new THREE.Mesh(geometry, assets.vineMaterial))));

  const halfEnd = 0.75;
  const colliders: Box2D[] = [
    { minX: group.position.x - length / 2 - halfEnd, maxX: group.position.x - length / 2 + halfEnd, minZ: group.position.z - width / 2, maxZ: group.position.z + width / 2 },
    { minX: group.position.x + length / 2 - halfEnd, maxX: group.position.x + length / 2 + halfEnd, minZ: group.position.z - width / 2, maxZ: group.position.z + width / 2 }
  ];
  group.userData.colliders = colliders;
  return group;
}

interface TreehouseOptions extends Placement {
  trunkHeight?: number;
}

export function createTreehouse(options: TreehouseOptions = {}): THREE.Group {
  const group = applyTransform(new THREE.Group(), options);
  const trunkHeight = options.trunkHeight ?? 8.5;
  group.name = 'treehouse';

  const wood = new THREE.MeshStandardMaterial({ color: 0x77634b, roughness: 1, map: woodGrain() });
  const trunk = shadow(new THREE.Mesh(new THREE.CylinderGeometry(0.85, 1.12, trunkHeight, 12), wood));
  trunk.position.y = trunkHeight / 2;
  const platform = shadow(new THREE.Mesh(new THREE.CylinderGeometry(3.35, 3.35, 0.32, 32), new THREE.MeshStandardMaterial({ color: 0xa28b63, roughness: 1, map: woodGrain() })));
  platform.position.y = trunkHeight * 0.7;
  const house = shadow(new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.35, 2.75, 24), new THREE.MeshStandardMaterial({ color: 0xc0a87f, roughness: 0.95, map: woodGrain() })));
  house.position.y = trunkHeight * 0.7 + 1.45;
  const roofMaterial = new THREE.MeshStandardMaterial({ color: 0x607969, roughness: 1, map: woodGrain() });
  const roof = shadow(new THREE.Mesh(new THREE.ConeGeometry(3.05, 2.05, 16), roofMaterial));
  roof.position.y = trunkHeight * 0.7 + 3.8;
  group.add(trunk, platform, house, roof);

  const deck = trunkHeight * 0.7;
  const braces = new THREE.Group(); braces.name = 'treehouse-braces';
  const beam = (start: THREE.Vector3, end: THREE.Vector3, radius: number) => {
    const direction = end.clone().sub(start);
    const part = shadow(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius * 1.15, direction.length(), 7), wood));
    part.position.copy(start).add(end).multiplyScalar(0.5);
    part.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), direction.normalize());
    return part;
  };
  for (let i = 0; i < 4; i++) {
    const a = i * Math.PI / 2 + Math.PI / 4;
    braces.add(beam(new THREE.Vector3(0, deck - 2.6, 0), new THREE.Vector3(Math.sin(a) * 2.9, deck - 0.18, Math.cos(a) * 2.9), 0.16));
  }
  group.add(braces);
  const railing = new THREE.Group(); railing.name = 'treehouse-balustrade';
  for (let i = 1; i < 24; i++) {
    const a = i * Math.PI * 2 / 24;
    const post = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.095, 0.85, 0.095), wood));
    post.position.set(Math.sin(a) * 3.15, deck + 0.58, Math.cos(a) * 3.15); railing.add(post);
  }
  const railPoints = Array.from({ length: 65 }, (_, i) => {
    const a = 0.27 + i / 64 * (Math.PI * 2 - 0.54);
    return new THREE.Vector3(Math.sin(a) * 3.15, deck + 1.01, Math.cos(a) * 3.15);
  });
  railing.add(shadow(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPoints), 64, 0.065, 6, false), wood)));
  group.add(railing);
  for (let i = 0; i < 8; i++) {
    const shingles = shadow(new THREE.Mesh(new THREE.CylinderGeometry(Math.max(0.03, 2.78 - i * 0.37), 3.13 - i * 0.37, 0.32, 16, 1, true), roofMaterial));
    shingles.position.y = deck + 2.86 + i * 0.245; group.add(shingles);
  }
  for (let i = 0; i < 16; i++) {
    const a = i * Math.PI / 8;
    const frame = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.075, 2.72, 0.09), wood));
    frame.position.set(Math.sin(a) * 2.25, deck + 1.45, Math.cos(a) * 2.25); frame.rotation.y = a; group.add(frame);
  }
  const door = shadow(new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.78, 0.12), wood));
  door.name = 'treehouse-door'; door.position.set(0, deck + 1.05, 2.3); group.add(door);
  const livingCanopy = new THREE.Group(); livingCanopy.name = 'treehouse-living-canopy';
  for (const [x, y, z, r] of [[-2.8, deck + 5.1, -1.4, 2.3], [3, deck + 5.3, -1.2, 2.4], [0, deck + 6.7, -2, 2.5]]) {
    livingCanopy.add(beam(new THREE.Vector3(0, deck + 2.4, -1), new THREE.Vector3(x, y, z), 0.18));
    const crown = createLeafCluster(r, 0x72924e, Math.round(y * 10 + x * 7)); crown.position.set(x, y, z); livingCanopy.add(crown);
  }
  group.add(livingCanopy);

  const windowMaterial = new THREE.MeshStandardMaterial({ color: 0xabc9c1, emissive: 0x9aad8c, emissiveIntensity: 0.12, roughness: 0.4 });
  for (const angle of [Math.PI / 3, Math.PI, Math.PI * 5 / 3]) {
    const window = new THREE.Mesh(new THREE.CircleGeometry(0.38, 12), windowMaterial);
    window.position.set(Math.sin(angle) * 2.18, trunkHeight * 0.7 + 1.65, Math.cos(angle) * 2.18);
    window.lookAt(new THREE.Vector3(Math.sin(angle) * 3, window.position.y, Math.cos(angle) * 3));
    group.add(window);
    const frame = shadow(new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.045, 6, 20), wood));
    frame.position.copy(window.position); frame.quaternion.copy(window.quaternion); group.add(frame);
  }

  group.userData.collider = {
    minX: group.position.x - 1.35,
    maxX: group.position.x + 1.35,
    minZ: group.position.z - 1.35,
    maxZ: group.position.z + 1.35
  };
  return group;
}
