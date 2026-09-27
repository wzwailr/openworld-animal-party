# probe_hf_space.py - discover the API of an image-to-3D HF space
import sys
from gradio_client import Client

space = sys.argv[1] if len(sys.argv) > 1 else 'TRELLIS-Research/trellis'
print('Probing space:', space)
try:
    c = Client(space, verbose=False)
    print('--- view_api ---')
    print(c.view_api())
except Exception as e:
    print('ERROR:', type(e).__name__, str(e)[:500])
