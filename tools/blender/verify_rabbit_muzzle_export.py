"""Round-trip the selected GLB, validate its actual face and save review evidence."""
import json
import runpy
import sys
from pathlib import Path
import bpy
import bmesh

ROOT=Path(__file__).resolve().parents[2]
OUT=ROOT/'tools/blender/out/rabbit-conductor-v5-muzzle-rebuilt-v2'
REVIEW=OUT/'export-review'
if REVIEW.exists() and any(REVIEW.iterdir()):
    raise RuntimeError('Preserve existing export review')
REVIEW.mkdir(parents=True,exist_ok=True)
sys.path.insert(0,str(Path(__file__).resolve().parent))
from rabbit_face_review import render_face
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=str(OUT/'rabbit-conductor-v5-muzzle-rebuilt.glb'))
runpy.run_path(str(ROOT/'tools/blender/test_rabbit_muzzle.py'),run_name='__main__')
meshes=[o for o in bpy.context.scene.objects if o.type=='MESH']
head=next(o for o in meshes if o.name.startswith('Head - continuous'))
body=next(o for o in meshes if o.name.startswith('Body - belly'))
bm=bmesh.new(); bm.from_mesh(head.data)
assert all(e.is_manifold for e in bm.edges),'Exported head contains an open or nonmanifold edge'
bm.free()
triangles=0
for obj in meshes:
    obj.data.calc_loop_triangles(); triangles+=len(obj.data.loop_triangles)
assert triangles<160000
assert len(meshes)==34
points=[body.matrix_world@v.co for v in body.data.vertices]
support=[sum(p.z<.003 and p.x*side>.055 for p in points) for side in (-1,1)]
assert min(support)>20
invalid=[]
for obj in (head,next(o for o in meshes if o.name.startswith('Rounded triangular nose'))):
    copy=obj.data.copy()
    if copy.validate():
        invalid.append(obj.name)
    bpy.data.meshes.remove(copy)
assert not invalid
report={'mesh_objects':len(meshes),'triangles':triangles,'sole_support_vertices':support,
        'head_nonmanifold_edges':0,'invalid_head_or_nose_meshes':invalid,'muzzle_guards':'4/4 passed',
        'visual_acceptance':'pending user review'}
(REVIEW/'report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(REVIEW/'export-roundtrip.blend'))
render_face(bpy.context.scene,REVIEW,'exported')
print('EXPORTED_MUZZLE '+json.dumps(report))
