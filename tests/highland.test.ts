import assert from 'node:assert/strict';
import test from 'node:test';
import { existsSync } from 'node:fs';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,nextResolve){return nextResolve(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?`${specifier}.ts`:specifier,context);}});
const landscape=await import('../src/world/landscape.ts');
const { WORLD }=await import('../src/world/config.ts');

test('the north valley has an actual mountain, space for an uphill route, and does not alter old destinations',()=>{
  assert.ok(landscape.getTerrainHeight(83,-229)>80,'mountain is still a small decorative rock pile');
  assert.ok(landscape.getTerrainHeight(83,-229)<120);
  assert.ok(WORLD.minZ<=-270,'northern route is outside walking bounds');
  for(const [x,z,height] of [[-145,-125,4.018938450804203],[145,125,.27396832389385795],[22,-83,4.436525897813863]]) {
    assert.ok(Math.abs(landscape.getTerrainHeight(x,z)-height)<.00001,'unrelated terrain changed');
  }
});

test('the waterfall face has broad supporting spurs and a recessed channel',()=>{
  const z=-165;
  const west=[0,8,15].map(x=>landscape.getTerrainHeight(x,z));
  const east=[70,78,83].map(x=>landscape.getTerrainHeight(x,z));
  const channel=landscape.getTerrainHeight(40,z);
  assert.ok(Math.min(...west)>45,`west spur is too small: ${west}`);
  assert.ok(Math.min(...east)>45,`east spur is too small: ${east}`);
  assert.ok(Math.min(...west,...east)-channel>30,'fall channel is not recessed between both broad spurs');
});

test('the authored route ascends to the headwaters without cliffs, water or sub-20-degree route violations',async()=>{
  assert.ok(existsSync(new URL('../src/world/highlandValleyLayout.ts',import.meta.url)),'missing shared valley layout');
  const {VALLEY_TRAIL,valleyWaterHeight}=await import('../src/world/highlandValleyLayout.ts');
  let high=0;
  for(let i=1;i<VALLEY_TRAIL.length;i++) {
    const a=VALLEY_TRAIL[i-1],b=VALLEY_TRAIL[i],length=Math.hypot(b[0]-a[0],b[2]-a[2]);
    for(let j=0;j<=Math.ceil(length*5);j++) {
      const t=j/Math.ceil(length*5),x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,y=landscape.getTerrainHeight(x,z);
      assert.ok(Math.abs(y-(a[1]+(b[1]-a[1])*t))<.1,`road not graded at ${x},${z}`);
      assert.equal(valleyWaterHeight(x,z),null,`path in water at ${x},${z}`);
      high=Math.max(high,y);
      const ahead=Math.min(1,t+.1/length),ny=landscape.getTerrainHeight(a[0]+(b[0]-a[0])*ahead,a[2]+(b[2]-a[2])*ahead);
      if(ahead>t)assert.ok(Math.abs(ny-y)/((ahead-t)*length)<=Math.tan(Math.PI/9)+.001,'route steeper than20deg');
    }
  }
  assert.ok(high>=79);
});

test('water is continuous and descends from the mountain source to the original river',async()=>{
  assert.ok(existsSync(new URL('../src/world/highlandValleyLayout.ts',import.meta.url)),'missing connected water layout');
  const {VALLEY_WATER}=await import('../src/world/highlandValleyLayout.ts');
  assert.ok(VALLEY_WATER[0][1]>=75);
  assert.equal(VALLEY_WATER.at(-1)[1],-.48);
  let biggestDrop=0;
  for(let i=1;i<VALLEY_WATER.length;i++) {
    const a=VALLEY_WATER[i-1],b=VALLEY_WATER[i];
    assert.ok(b[1]<=a[1]);biggestDrop=Math.max(biggestDrop,a[1]-b[1]);
    for(let j=0;j<=20;j++) {
      const t=j/20,x=a[0]+(b[0]-a[0])*t,z=a[2]+(b[2]-a[2])*t,water=a[1]+(b[1]-a[1])*t;
      assert.ok(landscape.getTerrainHeight(x,z)<water-.15,`water intersects rock at ${x},${z}`);
    }
  }
  assert.ok(biggestDrop>=50&&biggestDrop<=80,'no genuine main fall');
});
