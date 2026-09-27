# gen_ai3d_v2.py - InstantMesh with a globally extended httpx timeout
import os
import shutil
import httpx

# Patch ALL httpx clients (incl. gradio_client internals) to a 600s timeout
_orig_client_init = httpx.Client.__init__
def _patched_init(self, *args, **kwargs):
    kwargs.setdefault('timeout', httpx.Timeout(600.0, connect=30.0))
    return _orig_client_init(self, *args, **kwargs)
httpx.Client.__init__ = _patched_init

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

print('Step 2/3 generate_mvs (can take minutes)...', flush=True)
mvs = c.predict(handle_file(proc['path'] if isinstance(proc, dict) else proc), 75, SEED, api_name='/generate_mvs')
print('  multiviews:', mvs, flush=True)
mvs_path = mvs['path'] if isinstance(mvs, dict) else mvs
if os.path.exists(mvs_path):
    shutil.copy(mvs_path, os.path.join(OUTDIR, 'multiviews.png'))
    print('  multiviews saved', flush=True)

print('Step 3/3 make3d...', flush=True)
obj_path, glb_path = c.predict(api_name='/make3d')
print('  OBJ:', obj_path, flush=True)
print('  GLB:', glb_path, flush=True)
if os.path.exists(obj_path):
    shutil.copy(obj_path, os.path.join(OUTDIR, 'rabbit_ai2.obj'))
if os.path.exists(glb_path):
    shutil.copy(glb_path, os.path.join(OUTDIR, 'rabbit_ai2.glb'))
print('GEN AI3D ROUND2 DONE', flush=True)
