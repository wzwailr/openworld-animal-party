"""Round-trip verification of the exported GLB, including evaluated skin motion.

Run after make_conductor_rabbit_v3.py; imports the GLB into its preview stage.
This verifies exported geometry and animations rather than authoring declarations.
"""
import bpy
import json
import math
from pathlib import Path
from mathutils import Vector

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/blender/out/rabbit-conductor-v3'
bpy.ops.wm.open_mainfile(filepath=str(OUT / 'rabbit-conductor-v3.blend'))
for obj in list(bpy.data.objects):
    if obj.type == 'ARMATURE' or (obj.type == 'MESH' and not obj.name.startswith('Preview')):
        bpy.data.objects.remove(obj, do_unlink=True)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
bpy.ops.import_scene.gltf(filepath=str(ROOT / 'public/models/animals/rabbit-conductor-v3.glb'))
scene = bpy.context.scene
rig = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
# The importer also makes an unlinked icosphere for bone display; it is not GLB geometry.
meshes = [o for o in scene.objects if o.type == 'MESH' and o.parent == rig]
for track in rig.animation_data.nla_tracks:
    track.mute = True
rig.animation_data.action = None
for bone in rig.pose.bones:
    bone.rotation_mode = 'QUATERNION'
    bone.rotation_quaternion = (1, 0, 0, 0)
scene.frame_set(1)
points = [obj.matrix_world @ v.co for obj in meshes for v in obj.data.vertices]
mins = [min(p[i] for p in points) for i in range(3)]
maxs = [max(p[i] for p in points) for i in range(3)]
height = maxs[2] - mins[2]
assert 1.45 < height < 1.65, height
assert abs(mins[2]) < .012, mins

fur = next(o for o in meshes if o.name.startswith('Rabbit skin - Cream directional fur'))
wand = next(o for o in meshes if o.name == 'Baton rigid maple wand')
samples = {}
for group_name in ['Wrist.L', 'Wrist.R', 'Foot.L', 'Foot.R']:
    index = fur.vertex_groups[group_name].index
    indices = [v.index for v in fur.data.vertices if any(g.group == index and g.weight > .999 for g in v.groups)]
    assert len(indices) > 20, (group_name, len(indices))
    # The same authored vertices are evaluated at each time sample.
    samples[group_name] = indices[::max(1, len(indices) // 30)]

clip_reports = {}
for clip in ['Idle', 'Conduct']:
    rig.animation_data.action = bpy.data.actions[clip]
    start, end = rig.animation_data.action.frame_range
    records = []
    for f in [start + (end - start) * i / 12 for i in range(13)]:
        scene.frame_set(int(f), subframe=f - int(f))
        depsgraph = bpy.context.evaluated_depsgraph_get()
        evaluated = fur.evaluated_get(depsgraph)
        ewand = wand.evaluated_get(depsgraph)
        skin = {name: [tuple(evaluated.matrix_world @ evaluated.data.vertices[i].co) for i in indices]
                for name, indices in samples.items()}
        wrist_matrix = rig.matrix_world @ rig.pose.bones['Wrist.R'].matrix
        wand_local = [tuple(wrist_matrix.inverted() @ (ewand.matrix_world @ v.co)) for v in ewand.data.vertices]
        records.append({'skin': skin, 'wand_local': wand_local})
    movement = {}
    for group_name in samples:
        movement[group_name] = max((Vector(v) - Vector(records[0]['skin'][group_name][i])).length
            for record in records for i, v in enumerate(record['skin'][group_name]))
    if clip == 'Conduct':
        assert movement['Wrist.L'] > .025, movement
        assert movement['Wrist.R'] > .025, movement
    assert movement['Foot.L'] < .0001 and movement['Foot.R'] < .0001, movement
    rigid_error = max((Vector(v) - Vector(records[0]['wand_local'][i])).length
        for record in records for i, v in enumerate(record['wand_local']))
    assert rigid_error < .0001, rigid_error
    seam_error = max((Vector(v) - Vector(records[0]['skin'][name][i])).length
        for name in samples for i, v in enumerate(records[-1]['skin'][name]))
    assert seam_error < .0001, seam_error
    clip_reports[clip] = {'paw_vertex_max_movement_m': movement,
                          'baton_wrist_relative_max_error_m': rigid_error,
                          'evaluated_loop_seam_error_m': seam_error}

rig.animation_data.action = bpy.data.actions['Conduct']
scene.frame_set(25)
scene.camera.location = (2.5, -4, 1.55)
scene.camera.rotation_euler = (Vector((0, 0, .79)) - scene.camera.location).to_track_quat('-Z', 'Y').to_euler()
scene.render.filepath = str(OUT / 'exported-conduct-midpose.png')
bpy.ops.render.render(write_still=True)

result = {'source': 'reimported public/models/animals/rabbit-conductor-v3.glb',
          'height_m': height, 'native_blender_bounds': {'min': mins, 'max': maxs},
          'meshes': len(meshes), 'bones': len(rig.data.bones), 'animation_validation': clip_reports}
(OUT / 'roundtrip-validation.json').write_text(json.dumps(result, indent=2), encoding='utf8')
print('RABBIT_ROUNDTRIP_VALIDATION ' + json.dumps(result))
