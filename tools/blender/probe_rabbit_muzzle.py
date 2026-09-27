"""Read-only face profile probes; front=-Y, Z up. Run after loading a .blend."""
import json
import bpy
from mathutils import Vector
from mathutils.bvhtree import BVHTree

head = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('Head - continuous'))
nose = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('Rounded triangular nose'))
graph = bpy.context.evaluated_depsgraph_get()
tree = BVHTree.FromObject(head, graph)

def front(x, z):
    point, _, _, _ = tree.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)))
    return round(point.y, 6) if point else None

nose_mesh = nose.evaluated_get(graph).to_mesh()
points = [nose.matrix_world @ v.co for v in nose_mesh.vertices]
print('MUZZLE_PROBE ' + json.dumps({
    'head_transform': [list(row) for row in head.matrix_world],
    'nose_bounds': [[min(v[i] for v in points), max(v[i] for v in points)] for i in range(3)],
    'profiles': {str(x): [[z, front(x, z)] for z in [.59,.60,.61,.62,.63,.64,.65,.66,.67,.68]] for x in [0,.015,.03,.045,.06]},
}))
nose.evaluated_get(graph).to_mesh_clear()
