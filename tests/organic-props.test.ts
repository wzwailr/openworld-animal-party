import assert from 'node:assert/strict';
import test from 'node:test';
import { registerHooks } from 'node:module';
import { Box3, Raycaster, Vector3 } from 'three';

registerHooks({resolve(specifier,context,nextResolve){
  return nextResolve(specifier.startsWith('.')&&!/\.[a-z]+$/i.test(specifier)?`${specifier}.ts`:specifier,context);
}});
const {createMushroom}=await import('../src/entities/props.ts');

test('mushroom underside has radial lamella relief within its authored world-scale bounds',()=>{
  const mushroom=createMushroom({radius:4.4,height:6.7,spots:true});mushroom.updateMatrixWorld(true);
  const gills=mushroom.getObjectByName('mushroom-gills');assert.ok(gills);
  const ray=new Raycaster(new Vector3(),new Vector3(0,1,0));
  const heights:number[]=[];
  for(let i=0;i<32;i++){
    const angle=i/32*Math.PI/16+.08;
    ray.set(new Vector3(Math.cos(angle)*3.1,5,Math.sin(angle)*3.1),new Vector3(0,1,0));
    const hit=ray.intersectObject(gills)[0];assert.ok(hit,'underside has a hole');heights.push(hit.point.y);
  }
  assert.ok(Math.max(...heights)-Math.min(...heights)>.12,'smooth cone is not a gilled underside');
  const bounds=new Box3().setFromObject(mushroom);
  assert.ok(bounds.min.y>=-.001,'prop was moved below its authored floor');
  assert.ok(bounds.max.y<10.2,'flattened organic cap exceeded the existing collision-free skyline');
});
