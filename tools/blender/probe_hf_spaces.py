# probe_hf_spaces.py - try several image-to-3D spaces
import sys
from gradio_client import Client

spaces = ['microsoft/TRELLIS', 'TencentARC/InstantMesh', 'VAST-AI/TripoSR',
          'camenduru/TRELLIS', 'TRELLIS/trellis', 'z-future/TripoSR']
for space in spaces:
    print('=== probing:', space)
    try:
        c = Client(space, verbose=False)
        try:
            api = c.view_api(return_format='dict')
            print('OK space=%s' % space)
            print('apis:', [a for a in api if isinstance(a, str)] if isinstance(api, (list, tuple)) else list(api.keys())[:10])
        except Exception as e:
            print('OK space but view_api failed:', str(e)[:200])
    except Exception as e:
        print('FAIL:', type(e).__name__, str(e)[:150])
