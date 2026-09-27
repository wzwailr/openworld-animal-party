import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
import { Box3, DoubleSide, Matrix4, Mesh, MeshBasicMaterial, Raycaster, Vector3 } from 'three';

registerHooks({ resolve(specifier, context, nextResolve) {
  return nextResolve(specifier.startsWith('.') && !/\.[a-z]+$/i.test(specifier) ? `${specifier}.ts` : specifier, context);
} });
const landscape = await import('../src/world/landscape.ts');
const { circleIntersectsAabb } = await import('../src/player/collisions.ts');
const source = new URL('../src/world/regions/regionEnrichment.ts', import.meta.url);

async function build() {
  assert.ok(existsSync(source), 'the independent settlement scenes have not been built');
  const { createRegionEnrichment } = await import(source.href);
  const result = createRegionEnrichment();
  result.group.updateMatrixWorld(true);
  return result;
}

test('each settlement adds substantial distinct activity geometry in its own region', async () => {
  const { group } = await build();
  // Missing the roof, counter, hull, rack or garden structure must fail by size/geometry,
  // even if an empty placeholder with the expected name remains in the scene.
  for (const [name, x, z, minWidth, minHeight] of [
    ['entry-travel-court', -9, 58, 4, 2.8],
    ['forest-fallen-log', -55, -24, 4, .8],
    ['festival-backstage', -13, -18, 3, 2],
    ['market-produce-stall', -110, -8, 4, 2.8],
    ['market-bakery-courtyard', -101, -1, 4, 2.8],
    ['village-wash-garden', 114, -55, 4, 2],
    ['station-mail-workspace', -12, -49, 4, 2.5],
    ['stream-boat-workshop', 65, 19, 4, 2],
    ['garden-pergola', -39, 106, 4, 3],
    ['garden-reading-corner', -22, 85, 3, 1],
  ] as const) {
    const object = group.getObjectByName(name);
    assert.ok(object, `${name} is absent`);
    const bounds = new Box3().setFromObject(object), size = bounds.getSize(new Vector3());
    assert.ok(size.x >= minWidth && size.y >= minHeight, `${name} lacks its usable-scale landmark`);
    assert.ok(Math.hypot(bounds.getCenter(new Vector3()).x-x,bounds.getCenter(new Vector3()).z-z)<7,
      `${name} is not in its independent settlement`);
    let vertices=0;
    object.traverse(child=>{if(child.isMesh)vertices+=child.geometry.attributes.position.count;});
    assert.ok(vertices>600, `${name} has no close-range construction detail`);
  }
});

test('new furniture and plants leave existing walking corridors physically empty', async () => {
  const { group, colliders } = await build();
  const ray = new Raycaster(new Vector3(), new Vector3(0,-1,0), 0, 1.8);
  const points:Array<[number,number]>=[];
  for(const trail of landscape.FOREST_TRAILS) for(let i=1;i<trail.points.length;i++) {
    const [ax,az]=trail.points[i-1],[bx,bz]=trail.points[i],length=Math.hypot(bx-ax,bz-az);
    for(let d=0;d<=length;d+=.6) {
      const t=d/length;
      for(const side of [-1,0,1])points.push([ax+(bx-ax)*t-(bz-az)/length*side,az+(bz-az)*t+(bx-ax)/length*side]);
    }
  }
  for(let z=0;z<=70;z+=.5)points.push([landscape.pathCenter(z),z]);
  for(let z=-48;z<0;z+=.5)points.push([Math.sin(z*.06)*5,z]);
  for(const crossing of landscape.CROSSINGS)for(let x=crossing.x-crossing.halfLength-4;x<=crossing.x+crossing.halfLength+4;x+=.5)points.push([x,crossing.z]);
  for(const [x,z] of points) {
    assert.ok(!colliders.some(box=>circleIntersectsAabb({x,z},.45,box)),`added collision obstructs ${x},${z}`);
    ray.set(new Vector3(x,landscape.getWalkHeight(x,z)+1.9,z),new Vector3(0,-1,0));
    assert.equal(ray.intersectObject(group,true).length,0,`visible furniture intrudes into route at ${x},${z}`);
  }
});

test('solid activity pockets have ground contact and collision footprints without elevated walkways', async () => {
  const { group, colliders }=await build();
  assert.ok(colliders.length>20,'solid furnishings have no collision footprints');
  for(const region of group.children)for(const pocket of region.children) {
    if(!pocket.userData.solid)continue;
    const bounds=new Box3().setFromObject(pocket);
    const ground=landscape.getTerrainHeight(pocket.position.x,pocket.position.z);
    assert.ok(Math.abs(pocket.position.y-ground)<.001,`${pocket.name} is not grounded`);
    assert.ok(bounds.min.y<=ground+.2,`${pocket.name} floats above its supports`);
    assert.ok(colliders.some(box=>box.maxX>=bounds.min.x&&box.minX<=bounds.max.x&&box.maxZ>=bounds.min.z&&box.minZ<=bounds.max.z),`${pocket.name} has no solid footprint`);
  }
  let meshes=0,triangles=0;group.traverse(object=>{if(object.isMesh){
    meshes++;
    triangles+=(object.geometry.index?.count??object.geometry.attributes.position.count)/3*(object.isInstancedMesh?object.count:1);
  }});
  assert.ok(meshes<330,`unbatched settlement detail creates ${meshes} draw calls`);
  assert.ok(triangles<400000,`close-range enrichment adds ${triangles} triangles before shadows`);
});

test('the garden pergola has an accessible ground-level interior between its solid posts and bench', async () => {
  const { colliders }=await build();
  for(let z=109;z>=106;z-=.1)
    assert.ok(!colliders.some(box=>circleIntersectsAabb({x:-39,z},.45,box)),`pergola entrance blocked at ${z}`);
  assert.ok(colliders.some(box=>circleIntersectsAabb({x:-41.4,z:107.5},.1,box)),'pergola post can be walked through');
  assert.ok(colliders.some(box=>circleIntersectsAabb({x:-39,z:105.1},.1,box)),'pergola bench can be walked through');
});

test('festival seating faces the bandstand while stage flowers leave the cast and central ramp clear', async () => {
  const {group,colliders}=await build();
  const {createFestivalSquare}=await import('../src/world/regions/festivalSquare.ts');
  const cast=createFestivalSquare().group.children.filter(child=>child.name.startsWith('animal:'));
  const flowers=group.getObjectsByProperty('name','festival-stage-flower-box');
  const cases=group.getObjectsByProperty('name','festival-instrument-case');
  const courts=group.getObjectsByProperty('name','festival-audience-court');
  assert.equal(flowers.length,2);
  assert.equal(cases.length,2);
  assert.equal(courts.length,2);
  const seats=group.getObjectsByProperty('name','audience-facing-seat');
  assert.equal(seats.length,4);
  assert.ok(seats.every(seat=>Math.abs(seat.rotation.y-Math.PI)<1e-8));
  for(const flower of flowers) {
    const bounds=new Box3().setFromObject(flower);
    for(const actor of cast) {
      const actorBounds=new Box3().setFromObject(actor);
      assert.ok(bounds.max.x < actorBounds.min.x-.2 || bounds.min.x > actorBounds.max.x+.2
        || bounds.max.z < actorBounds.min.z-.2 || bounds.min.z > actorBounds.max.z+.2,
      `${flower.name} crowds ${actor.name}`);
    }
  }
  for(const court of courts) {
    const bounds=new Box3().setFromObject(court);
    assert.ok(Math.abs(bounds.getCenter(new Vector3()).x)>5.5 && bounds.min.z>7,
      'audience court should frame the stage from either side of the open centre aisle');
  }
  for(let z=2.3;z<=15;z+=.2)for(const x of [-1.8,0,1.8])
    assert.ok(!colliders.some(box=>circleIntersectsAabb({x,z},.45,box)),`stage ramp or main aisle blocked at ${x},${z}`);
});

test('mail shelter and bank timber leave the existing tree trunks outside their actual footprints',async()=>{
  const {group}=await build();
  const {createFoliage}=await import('../src/entities/foliage.ts');
  const trees=createFoliage().colliders;
  for(const name of ['station-mail-workspace','stream-dry-bank-timber']) {
    const object=group.getObjectByName(name);assert.ok(object,`${name} was removed instead of moved`);
    const box=new Box3().setFromObject(object);
    assert.ok(!trees.some(t=>t.minX<box.max.x&&t.maxX>box.min.x&&t.minZ<box.max.z&&t.maxZ>box.min.z),`${name} intersects an existing trunk`);
  }
});

test('all four baggage cart tires touch the actual terrain within eight centimetres',async()=>{
  const {group}=await build(),cart=group.getObjectByName('station-baggage-cart');assert.ok(cart);
  const inverse=cart.matrixWorld.clone().invert(),worldPoints:Vector3[]=[];
  cart.traverse(mesh=>{
    if(!mesh.isMesh||mesh.material.color?.getHex()!==0x574832)return;
    const position=mesh.geometry.attributes.position;
    for(let instance=0;instance<(mesh.isInstancedMesh?mesh.count:1);instance++) {
      const transform=mesh.matrixWorld.clone();
      if(mesh.isInstancedMesh){const matrix=new Matrix4();mesh.getMatrixAt(instance,matrix);transform.multiply(matrix);}
      for(let i=0;i<position.count;i++)worldPoints.push(new Vector3().fromBufferAttribute(position,i).applyMatrix4(transform));
    }
  });
  for(const x of [-.85,.85])for(const z of [-.8,.8]) {
    const tire=worldPoints.filter(p=>{
      const local=p.clone().applyMatrix4(inverse);
      return Math.abs(local.x-x)<.5&&Math.abs(local.z-z)<.13&&local.y<.8;
    });
    assert.ok(tire.length>30,`missing actual tire geometry at ${x},${z}`);
    const clearance=Math.min(...tire.map(p=>p.y-landscape.getTerrainHeight(p.x,p.z)));
    assert.ok(Math.abs(clearance)<.08,`tire at ${x},${z} misses ground by ${clearance}m`);
  }
});

test('both foliage generators keep every rendered grass and flower vertex out of the garden basin at all quality tiers',async()=>{
  const {createFoliage}=await import('../src/entities/foliage.ts');
  const foliage=createFoliage(),{group}=await build();
  const candidates=[foliage.group.getObjectByName('wind-swept-meadow'),foliage.group.getObjectByName('clustered-wildflowers')];
  group.traverse(object=>{if(object.parent?.name==='cultivated-flower-border'||object.parent?.name==='layered-fern-colony')candidates.push(object);});
  const matrix=new Matrix4(),point=new Vector3();
  for(const tier of ['low','medium','high'] as const) {
    foliage.setQuality(tier);
    for(const mesh of candidates) {
      assert.ok(mesh?.isInstancedMesh);
      for(let i=0;i<mesh.count;i++) {
        mesh.getMatrixAt(i,matrix);
        assert.ok(Math.abs(matrix.determinant())>.0001,`${tier}: empty vegetation instance remains visible`);
        point.setFromMatrixPosition(matrix);
        if(Math.hypot(point.x+20,point.z-112)>4.2)continue;
        const positions=mesh.geometry.attributes.position;
        for(let j=0;j<positions.count;j++) {
          point.fromBufferAttribute(positions,j).applyMatrix4(matrix);
          assert.ok(Math.hypot(point.x+20,point.z-112)>2.2,`${tier}: ${mesh.name||mesh.parent.name} penetrates basin at ${point.x},${point.z}`);
        }
      }
    }
  }
});

test('fern leaf surfaces arch above their stems and keep upward-facing normals', async () => {
  const { group } = await build();
  const colony = group.getObjectsByProperty('name', 'layered-fern-colony')[0];
  assert.ok(colony, 'the mushroom forest should contain its fern colony');
  const fronds = colony.getObjectByName('arched-fern-fronds');
  assert.ok(fronds, 'the fern leaf geometry is missing');
  const geometry = fronds.geometry;
  geometry.computeBoundingBox();
  const size = geometry.boundingBox.getSize(new Vector3());
  assert.ok(size.y > .25, `flat leaflets make a paper-star silhouette: ${size.y}m high`);
  const normal = geometry.attributes.normal;
  for(let i=0;i<normal.count;i++)
    assert.ok(normal.getY(i) > .25, `fern upper surface points away from daylight at vertex ${i}`);
  const leaf = new Mesh(geometry, new MeshBasicMaterial({ side: DoubleSide }));
  const ray = new Raycaster();
  for(const x of [-.09,.09]){
    let hits=0,gaps=0,transitions=0,previous=false;
    for(let z=.1;z<.69;z+=.01){
      ray.set(new Vector3(x,2,z),new Vector3(0,-1,0));
      const visible=ray.intersectObject(leaf).length>0;
      if(visible)hits++;else gaps++;
      if(z>.1&&visible!==previous)transitions++;
      previous=visible;
    }
    assert.ok(hits>=20&&gaps>=15&&transitions>=12,
      `fern side ${x} needs separate pinnae and visible gaps, not a continuous broad ribbon`);
  }
});
