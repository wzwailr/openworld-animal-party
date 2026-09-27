"""Shape-only rabbit v5 from the preserved v4 editable clay study.

Blender coordinates: Z up, character front -Y. Exported glTF: Y up, front +Z.
Run with Blender 4.5: -b --python-exit-code 1 --python this_file
The v4 source and outputs are never modified. This candidate has no rig or animation.
"""
import json
import math
from pathlib import Path

import bpy
import bmesh
from mathutils import Vector


ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'tools/blender/out/rabbit-conductor-v4/rabbit-conductor-v4-gray.blend'
OUT = ROOT / 'tools/blender/out/rabbit-conductor-v5'
GLB = ROOT / 'public/models/animals/rabbit-conductor-v5-gray.glb'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
head = next(o for o in scene.objects if o.type == 'MESH' and o.name.startswith('Head - continuous'))
body = next(o for o in scene.objects if o.type == 'MESH' and o.name.startswith('Body - belly'))
eyes = [o for o in scene.objects if o.type == 'MESH' and o.name.startswith('Buried outward facing eyeball.')]
assert len(eyes) == 2


def gaussian(value, centre, width):
    return math.exp(-((value - centre) / width) ** 2)


def mesh_probe(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    values = {
        'vertices': len(bm.verts),
        'triangles': sum(max(1, len(f.verts) - 2) for f in bm.faces),
        'bounds': [[min(v.co[i] for v in bm.verts), max(v.co[i] for v in bm.verts)] for i in range(3)],
        'non_manifold_edges': sum(not e.is_manifold for e in bm.edges),
    }
    if values['non_manifold_edges'] == 0:
        values['volume'] = abs(bm.calc_volume())
    bm.free()
    return values


before = {'head': mesh_probe(head), 'body': mesh_probe(body)}

# The older orbit surface pushed toward the spectacles and read as a separate
# oval disk in profile. Subdue only its centre while extending the cheek and
# nasal bridge into a continuous brow-to-muzzle side plane.
for vertex in head.data.vertices:
    x, y, z = vertex.co
    ax = abs(x)
    front = max(0.0, min(1.0, (-y + .015) / .115))
    orbit = gaussian(ax, .082, .037) * gaussian(z, .697, .044)
    cheek = gaussian(ax, .062, .050) * gaussian(z, .634, .047)
    bridge = gaussian(ax, .040, .037) * gaussian(z, .671, .035)
    upper_lip_pads = gaussian(ax, .028, .021) * gaussian(z, .629, .025)
    lower_lip = gaussian(ax, .020, .036) * gaussian(z, .601, .017)
    vertex.co.y += front * (.0105 * orbit - .012 * cheek - .016 * bridge
                            - .022 * upper_lip_pads - .007 * lower_lip)
    # A broader, almost square lower cheek instead of a round taper to the jaw.
    vertex.co.x += (1 if x >= 0 else -1) * .0085 * gaussian(ax, .110, .048) * gaussian(z, .625, .045)

# The eyes sit within the face, exposed only at the opening. Keep their centre
# and height; only reduce the detached, protruding oval seen from the side.
for eye in eyes:
    cx = sum(v.co.x for v in eye.data.vertices) / len(eye.data.vertices)
    cz = sum(v.co.z for v in eye.data.vertices) / len(eye.data.vertices)
    for vertex in eye.data.vertices:
        vertex.co.x = cx + (vertex.co.x - cx) * .90
        vertex.co.z = cz + (vertex.co.z - cz) * .91
        vertex.co.y += .010

nose = next(o for o in scene.objects if o.type == 'MESH' and o.name.startswith('Rounded triangular nose'))
for vertex in nose.data.vertices:
    vertex.co.x *= 1.12
    vertex.co.y -= .008
    vertex.co.z = .641 + (vertex.co.z - .641) * 1.08

# v4 already fused abdomen, haunches and paws. Reshape their shared surface:
# thicker lower hocks and a forward slope into each broad sole, with no new
# primitives attached to the feet. Preserve the flat ground contact at z=0.
for vertex in body.data.vertices:
    x, y, z = vertex.co
    ax = abs(x)
    leg = gaussian(ax, .075, .056)
    hock = gaussian(z, .132, .105)
    vertex.co.x += (1 if x >= 0 else -1) * .025 * leg * hock
    front_face = max(0, min(1, (-y + .025) / .075))
    vertex.co.y -= .056 * leg * gaussian(z, .150, .105) * front_face
    vertex.co.y += .012 * leg * gaussian(z, .125, .080) * max(0, min(1, (y + .005) / .070))
    # Introduce an uninterrupted heel curve into the rear of the planted paw.
    vertex.co.y += .006 * leg * gaussian(z, .060, .043) * max(0, min(1, (y - .008) / .07))
    if .012 < z < .075 and y < -.065:
        vertex.co.z += .014 * leg * math.sin(math.pi * (z - .012) / .063) * gaussian(y, -.082, .065)

after_shape = {'head': mesh_probe(head), 'body': mesh_probe(body)}
assert after_shape['head']['bounds'][2][1] > .98
assert after_shape['head']['volume'] > .90 * before['head']['volume']
assert after_shape['head']['non_manifold_edges'] == 0
assert after_shape['body']['bounds'][2][0] >= -.0001
assert after_shape['body']['volume'] > .88 * before['body']['volume']
assert after_shape['body']['non_manifold_edges'] == 0

# Remove inspection-only staging. Collect only subject meshes for review/export.
floor = bpy.data.objects.get('Inspection floor')
if floor:
    bpy.data.objects.remove(floor, do_unlink=True)
subject = bpy.data.collections.new('Subject')
scene.collection.children.link(subject)
meshes = [o for o in scene.objects if o.type == 'MESH']
for obj in meshes:
    for collection in tuple(obj.users_collection):
        collection.objects.unlink(obj)
    subject.objects.link(obj)

# Decimate only dense sculpt surfaces. Fine spectacle curves, fingers and cloth
# retain their own topology. This is a static review mesh, not animation topo.
targets = {head.name: 50000, body.name: 25000}
targets.update({obj.name: 10000 for obj in meshes if obj.name.startswith('Sculpted anatomical forepaw.')})
targets.update({obj.name: 6000 for obj in meshes if obj.name.startswith('Fitted front and split back coat panel.')})
for obj in meshes:
    if obj.name not in targets:
        continue
    # Evaluate cloth thickness before decimation; applying a later modifier
    # first causes Blender to warn that the result is order-dependent.
    for existing in tuple(obj.modifiers):
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=existing.name)
    current = mesh_probe(obj)['triangles']
    if current > targets[obj.name]:
        mod = obj.modifiers.new('Static gray study polygon budget', 'DECIMATE')
        mod.ratio = targets[obj.name] / current
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.modifier_apply(modifier=mod.name)

depsgraph = bpy.context.evaluated_depsgraph_get()
triangles = 0
object_counts = {}
for obj in meshes:
    evaluated = obj.evaluated_get(depsgraph)
    evaluated_mesh = evaluated.to_mesh()
    evaluated_mesh.calc_loop_triangles()
    count = len(evaluated_mesh.loop_triangles)
    object_counts[obj.name] = count
    triangles += count
    evaluated.to_mesh_clear()
print('RABBIT_V5_TRIANGLES', triangles, sorted(object_counts.items(), key=lambda item: -item[1])[:12])
assert triangles <= 160000, f'Candidate exceeded 160k triangle budget: {triangles}'

after = {'head': mesh_probe(head), 'body': mesh_probe(body)}
assert after['head']['bounds'][2][1] > .98
assert after['body']['bounds'][2][0] >= -.0001
assert after['head']['volume'] > .88 * after_shape['head']['volume']
assert after['body']['volume'] > .85 * after_shape['body']['volume']

report = {
    'stage': 'static neutral-gray shape candidate; visual acceptance pending',
    'source': str(SOURCE.relative_to(ROOT)).replace('\\', '/'),
    'front_axis_blender': '-Y',
    'front_axis_glb': '+Z',
    'before': before, 'after_shape': after_shape, 'after_decimation': after,
    'evaluated_triangles': triangles,
    'objects': object_counts,
    'armatures': len([o for o in scene.objects if o.type == 'ARMATURE']),
    'actions': len(bpy.data.actions),
}
(OUT / 'shape-report.json').write_text(json.dumps(report, indent=2), encoding='utf8')

# Keep the editable source separate from the world-facing GLB. Save first so
# a failed exporter never destroys the sculpt candidate.
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'rabbit-conductor-v5-gray.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in meshes:
    obj.select_set(True)
bpy.context.view_layer.objects.active = head
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=True,
                          export_yup=True, export_apply=True, export_animations=False,
                          export_cameras=False, export_lights=False)
assert GLB.is_file() and GLB.stat().st_size > 100000

# The saved file is what the world loader sees. Import it into a fresh scene,
# check that the head and both planted feet survived export, and preserve a
# separate round-trip blend for exact visual review if needed.
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.import_scene.gltf(filepath=str(GLB))
imported = [o for o in bpy.context.scene.objects if o.type == 'MESH']
assert len(imported) >= 20
imported_head = next(o for o in imported if o.name.startswith('Head - continuous'))
imported_body = next(o for o in imported if o.name.startswith('Body - belly'))
depsgraph = bpy.context.evaluated_depsgraph_get()
def world_points(obj):
    evaluated = obj.evaluated_get(depsgraph)
    return [evaluated.matrix_world @ v.co for v in evaluated.data.vertices]
head_points = world_points(imported_head)
body_points = world_points(imported_body)
subject_points = [p for obj in imported for p in world_points(obj)]
imported_bounds = [[min(p[i] for p in subject_points), max(p[i] for p in subject_points)] for i in range(3)]
assert max(p.z for p in head_points) > .98, 'Imported head or ears lost'
assert min(p.z for p in body_points) < .002, 'Imported paws lost ground contact'
assert all(sum(p.z < .003 and p.x * sign > .055 for p in body_points) >= 20 for sign in (-1, 1)), 'Imported support missing on one side'
assert imported_bounds[2][1] - imported_bounds[2][0] > .98
report['glb_roundtrip'] = {
    'mesh_objects': len(imported),
    'world_bounds_blender': imported_bounds,
    'head_vertices': len(head_points),
    'body_vertices': len(body_points),
    'left_support_vertices': sum(p.z < .003 and p.x < -.055 for p in body_points),
    'right_support_vertices': sum(p.z < .003 and p.x > .055 for p in body_points),
}
(OUT / 'shape-report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'rabbit-conductor-v5-imported-check.blend'))

# Local neutral crops show the face planes without enlarging the whole-body
# review renders. These are exported GLB geometry, not an altered illustration.
scene = bpy.context.scene
scene.render.engine = 'CYCLES'
scene.cycles.samples = 24
scene.cycles.use_denoising = True
scene.render.resolution_x = 256
scene.render.resolution_y = 256
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
camera_data = bpy.data.cameras.new('Face review ortho')
camera_data.type = 'ORTHO'
camera_data.ortho_scale = .34
camera = bpy.data.objects.new('Face review ortho', camera_data)
scene.collection.objects.link(camera)
scene.camera = camera
for name, position, power in [('Face review key', (-1.2, -2.0, 2.0), 90),
                              ('Face review fill', (1.4, -1.0, 1.4), 45)]:
    light_data = bpy.data.lights.new(name, 'AREA')
    light_data.energy = power
    light_data.size = 2.0
    light = bpy.data.objects.new(name, light_data)
    scene.collection.objects.link(light)
    light.location = position
    light.rotation_euler = (Vector((0, -.01, .67)) - light.location).to_track_quat('-Z', 'Y').to_euler()
for name, position in [('head-front-256', (0, -3, .67)), ('head-left-256', (-3, 0, .67))]:
    camera.location = position
    camera.rotation_euler = (Vector((0, -.01, .67)) - camera.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(OUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)
print('RABBIT_V5_SHAPE_REPORT ' + json.dumps(report))
