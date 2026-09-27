import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { registerHooks } from 'node:module';
registerHooks({resolve(s,c,n){return n(s.startsWith('.')&&!/\.[a-z]+$/i.test(s)?`${s}.ts`:s,c);}});
const {createFoliage}=await import('../src/entities/foliage.ts');
const fingerprint=(values:Float32Array)=>createHash('sha256').update(Buffer.from(values.buffer,values.byteOffset,values.byteLength)).digest('hex');

// Captured from the pre-expansion 2026-09-27 backup, not from the new generator.
// Removing trees in a new road must not reroll distant crowns or the riverbank.
test('east road clearance preserves existing riverbank placement and retained tree crowns',()=>{
  const {group,colliders}=createFoliage();
  for(const [name,expected] of [
    ['weathered-bank-stones','a10ab717b651621924640ced896354a18c1ec4eae0af145fd4faea6c0790e048'],
    ['stream-bank-reeds','b5542a12af3b36a5a10fe2d69013bbceaa91978ee374d1449534ddd2cdd13f1f'],
  ])assert.equal(fingerprint(group.getObjectByName(name).instanceMatrix.array),expected,name);
  const sprays=group.getObjectByName('canopy-leaf-sprays');
  for(const [x,z,expected] of [
    [-15.720393540803343,33.04381912574172,'0f2124e5298a76875a3c99dc2e8c9f0fd28b5bca28ecdb7dc52b16b60e4fe9cb'],
    [-13.478250123560429,-47.72425917722285,'5c6cc8dbc4cfbf8618052cc28a9057e2c3d08b134f9dd563bf3427d3a683c55d'],
    [-13.278875744435936,-93.57937749102712,'94a63b02cd04b3db08898b27587b8a1104cbd8ecf236f260c6062500f742685e'],
  ] as const){
    const index=colliders.findIndex(b=>Math.abs((b.minX+b.maxX)/2-x)<1e-9&&Math.abs((b.minZ+b.maxZ)/2-z)<1e-9);
    assert.ok(index>=0,'retained tree disappeared');
    assert.equal(fingerprint(sprays.instanceMatrix.array.slice(index*11*16,index*11*16+16)),expected,`crown at ${x},${z}`);
  }
});
