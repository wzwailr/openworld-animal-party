# gen_ai3d.py - run InstantMesh image-to-3D on the rabbit crop
import os
import sys
from gradio_client import Client, handle_file

CROP = 'D:/aiCode/animal-kingdom/tools/blender/out/rabbit_ref_crop2.png'
SEED = 7
OUTDIR = 'D:/aiCode/animal-kingdom/tools/blender/out/ai3d'
os.makedirs(OUTDIR, exist_ok=True)

print('Connecting to InstantMesh space...', flush=True)
c = Client('TencentARC/InstantMesh', verbose=False)

print('Step 1/3 preprocess...', flush=True)
proc = c.predict(handle_file(CROP), True, api_name='/preprocess')
print('  processed:', proc, flush=True)

print('Step 2/3 generate_mvs (takes a while)...', flush=True)
mvs = c.predict(handle_file(proc['path'] if isinstance(proc, dict) else proc), 75, SEED, api_name='/generate_mvs')
print('  multiviews:', mvs, flush=True)
mvs_path = mvs['path'] if isinstance(mvs, dict) else mvs
if os.path.exists(mvs_path):
    import shutil
    shutil.copy(mvs_path, os.path.join(OUTDIR, 'multiviews.png'))

print('Step 3/3 make3d...', flush=True)
obj_path, glb_path = c.predict(api_name='/make3d')
print('  OBJ:', obj_path, flush=True)
print('  GLB:', glb_path, flush=True)

import shutil
obj_dst = os.path.join(OUTDIR, 'rabbit_ai.obj')
glb_dst = os.path.join(OUTDIR, 'rabbit_ai.glb')
if os.path.exists(obj_path):
    shutil.copy(obj_path, obj_dst)
if os.path.exists(glb_path):
    shutil.copy(glb_path, glb_dst)
print('Saved to', OUTDIR, flush=True)
print('GEN AI3D DONE', flush=True)
