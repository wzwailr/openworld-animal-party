import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {createTerrain}=await import('../src/world/terrain.ts');
const {createEasternForest}=await import('../src/world/regions/easternForest.ts');

test('soil microtexture has continuous grain instead of isolated black speckles',()=>{
  const map=createTerrain().group.getObjectByName('sculpted-meadow-and-riverbed').material.map;
  const {data,width,height}=map.image;let maxJump=0,min=255,max=0;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const v=data[(y*width+x)*4];min=Math.min(min,v);max=Math.max(max,v);
    maxJump=Math.max(maxJump,Math.abs(v-data[(y*width+(x+1)%width)*4]),Math.abs(v-data[(((y+1)%height)*width+x)*4]));
  }
  assert.ok(maxJump<20,`isolated ${maxJump}-level flecks dominate the ground`);
  assert.ok(max-min>12,'microtexture was replaced with a flat color');
});

test('new clearings have living ground cover in every quality tier, not flowers on an empty plane',()=>{
  const east=createEasternForest();const grass=east.group.getObjectByName('eastern-field-grass');
  assert.ok(grass?.isInstancedMesh,'no layered ground planting');
  const high=grass.count;assert.ok(high>4000);
  east.setQuality('low');assert.ok(grass.count>=1000&&grass.count<high);
  east.setQuality('high');assert.equal(grass.count,high);
});
