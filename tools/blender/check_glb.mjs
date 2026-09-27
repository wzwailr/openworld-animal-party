// check_glb.mjs — 解析 GLB 容器，报告结构统计（无需 three.js）
// 用法: node tools/blender/check_glb.mjs <file.glb>
import { readFileSync } from 'node:fs';

const path = process.argv[2];
if (!path) {
  console.error('用法: node tools/blender/check_glb.mjs <file.glb>');
  process.exit(1);
}

const buf = readFileSync(path);
const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

// GLB 头
const magic = String.fromCharCode(...buf.subarray(0, 4));
const version = dv.getUint32(4, true);
const totalLen = dv.getUint32(8, true);
if (magic !== 'glTF') throw new Error('不是合法 GLB: magic=' + magic);

let json = null;
let offset = 12;
while (offset < totalLen) {
  const len = dv.getUint32(offset, true);
  const type = dv.getUint32(offset + 4, true);
  const data = buf.subarray(offset + 8, offset + 8 + len);
  if (type === 0x4e4f534a) json = JSON.parse(new TextDecoder().decode(data));
  else if (type === 0x004e4942) { /* BIN chunk，跳过 */ }
  offset += 8 + len;
}

if (!json) throw new Error('GLB 缺少 JSON chunk');

const accessorCounts = (json.accessors ?? []).map((a) => a.count);
const posAccessors = new Set();
for (const mesh of json.meshes ?? []) {
  for (const prim of mesh.primitives ?? []) {
    if (prim.attributes?.POSITION !== undefined) posAccessors.add(prim.attributes.POSITION);
  }
}
const totalVerts = [...posAccessors].reduce((s, i) => s + (accessorCounts[i] ?? 0), 0);

console.log('=== GLB 结构报告 ===');
console.log(`文件: ${path}`);
console.log(`大小: ${(buf.length / 1024).toFixed(1)} KB  (GLB v${version})`);
console.log(`nodes: ${json.nodes?.length ?? 0}`);
console.log(`meshes: ${json.meshes?.length ?? 0}`);
console.log(`primitives: ${json.meshes?.reduce((s, m) => s + (m.primitives?.length ?? 0), 0) ?? 0}`);
console.log(`materials: ${json.materials?.length ?? 0}`);
console.log(`顶点总数(POSITION): ${totalVerts}`);
console.log(`textures: ${json.textures?.length ?? 0}  images: ${json.images?.length ?? 0}  animations: ${json.animations?.length ?? 0}`);
console.log(`skins: ${json.skins?.length ?? 0}  joints: ${json.skins?.reduce((sum, skin) => sum + (skin.joints?.length ?? 0), 0) ?? 0}`);
console.log(`scene 根节点: ${json.scenes?.[0]?.nodes?.length ?? 0}`);
if (json.animations) {
  console.log('--- animations ---');
  for (const animation of json.animations) {
    console.log(`  ${animation.name ?? '(unnamed)'}  channels=${animation.channels?.length ?? 0}`);
  }
}
if (json.materials) {
  console.log('--- materials ---');
  for (const m of json.materials) {
    const c = m.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
    console.log(`  ${m.name ?? '(unnamed)'}  baseColor=(${c.slice(0, 3).map((v) => v.toFixed(2)).join(', ')})  metallic=${m.pbrMetallicRoughness?.metallicFactor ?? 1}  rough=${m.pbrMetallicRoughness?.roughnessFactor ?? 1}`);
  }
}
