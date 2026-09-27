// verify_glb_orientation.mjs - load the GLB with three.js in Node and report the
// bounding box axes, so we can confirm the character stands up (height = Y).
import { readFileSync } from 'node:fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

const path = process.argv[2];
const buf = readFileSync(path);
const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);

const loader = new GLTFLoader();
loader.parse(ab, '', (gltf) => {
  const box = new THREE.Box3().setFromObject(gltf.scene);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  console.log('SIZE   x=%.3f  y=%.3f  z=%.3f' , size.x, size.y, size.z);
  console.log('CENTER x=%.3f  y=%.3f  z=%.3f', center.x, center.y, center.z);
  const axes = [
    ['x', size.x], ['y', size.y], ['z', size.z],
  ].sort((a, b) => b[1] - a[1]);
  console.log('LONGEST axis = %s (%.3f) -> %s', axes[0][0], axes[0][1],
    axes[0][0] === 'y' ? 'STANDING UPRIGHT' : 'LYING DOWN (BUG)');
  // face direction: sample the mesh? just report material count + node count
  let meshes = 0, tris = 0;
  gltf.scene.traverse((o) => {
    if (o.isMesh) { meshes++; const g = o.geometry; if (g.index) tris += g.index.count / 3; }
  });
  console.log('meshes=%d  triangles=%.0f', meshes, tris);
}, (err) => { console.error('GLTF parse failed:', err); process.exit(1); });
