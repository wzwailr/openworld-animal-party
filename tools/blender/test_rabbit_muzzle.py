"""Local geometric guards for the reported beak-shaped mouth; not visual QC."""
import unittest
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

head = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('Head - continuous'))
nose = next(o for o in bpy.context.scene.objects if o.type == 'MESH' and o.name.startswith('Rounded triangular nose'))
graph = bpy.context.evaluated_depsgraph_get()
tree = BVHTree.FromObject(head, graph)
evaluated = nose.evaluated_get(graph)
points = [evaluated.matrix_world @ v.co for v in evaluated.data.vertices]
nose_front = min(p.y for p in points)
nose_back = max(p.y for p in points)

def front(x, z):
    point, _, _, _ = tree.ray_cast(Vector((x, -1, z)), Vector((0, 1, 0)))
    if point is None:
        raise AssertionError('Missing face at mouth probe')
    return point.y

class MuzzleTests(unittest.TestCase):
    def test_upper_lip_pads_do_not_recede_into_a_long_pointed_nose(self):
        for x in (-.02, .02):
            recession = front(x, .615) - nose_front
            self.assertLess(recession, .020, f'upper lip recessed {recession:.4f}m behind nose')

    def test_lower_lip_has_volume_below_the_muzzle(self):
        recession = front(0, .600) - nose_front
        self.assertLess(recession, .035, f'lower lip recessed {recession:.4f}m behind nose')

    def test_nose_is_a_short_button_not_a_deep_wedge(self):
        self.assertLess(nose_back - nose_front, .015, 'nose extrusion remains wedge-like')

    def test_front_muzzle_has_no_back_facing_folded_facets(self):
        bm = bmesh.new()
        bm.from_mesh(head.data)
        bm.normal_update()
        folded = []
        for face in bm.faces:
            p = face.calc_center_median()
            if (p.x/.060)**2+((p.z-.626)/.036)**2 < 1 and p.y < -.075 and face.normal.y > .02:
                folded.append(face.index)
        bm.free()
        self.assertEqual(len(folded),0,f'{len(folded)} reversed facets in the front muzzle patch')

result = unittest.TextTestRunner(verbosity=2).run(unittest.defaultTestLoader.loadTestsFromTestCase(MuzzleTests))
if not result.wasSuccessful():
    raise RuntimeError('Rabbit muzzle shape guards failed; see individual measurements')
