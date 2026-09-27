# make_conductor_rabbit_v2.py
# Conductor rabbit, v2: implicit-surface sculpting.
# Body/head/ears/limbs are posed ellipsoids (scaled UV spheres with rotation),
# fused into ONE organic mesh via OpenVDB voxel remesh -> smooth shading.
# Clothes & face details are separate smooth meshes layered on top.
#
# Usage: blender -b --python make_conductor_rabbit_v2.py --python-exit-code 1
#   env BLENDER_OUT_GLB (required), BLENDER_OUT_PNG (optional preview renders)

import bpy
import bmesh
import math
import os
import re
from mathutils import Vector, Euler

OUT_GLB = os.environ.get('BLENDER_OUT_GLB', '')
OUT_PNG = os.environ.get('BLENDER_OUT_PNG', '')

# ---------------------------------------------------------------- helpers

def clear_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)

def material(name, color, roughness=0.7, metallic=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    if bsdf is None:
        bsdf = m.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
    bsdf.inputs['Base Color'].default_value = (color[0], color[1], color[2], 1.0)
    bsdf.inputs['Roughness'].default_value = roughness
    bsdf.inputs['Metallic'].default_value = metallic
    return m

def mesh_obj(name, bm, mat):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    me.update()
    obj = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(obj)
    if mat is not None:
        me.materials.append(mat)
    return obj

def finish(obj, smooth=True, subdiv=0):
    if smooth:
        bpy.ops.object.select_all(action='DESELECT')
        obj.select_set(True)
        bpy.context.view_layer.objects.active = obj
        bpy.ops.object.shade_smooth()
    if subdiv:
        mod = obj.modifiers.new('SmoothSubdiv', 'SUBSURF')
        mod.subdivision_type = 'SIMPLE'
        mod.levels = subdiv
        mod.render_levels = subdiv
    return obj

def lathe(name, mat, profile, segments=48, caps=True, smooth=True, subdiv=0,
          bend=0.0, scale=(1.0, 1.0, 1.0), rotation=(0.0, 0.0, 0.0),
          location=(0.0, 0.0, 0.0)):
    """Surface of revolution around the Y axis; circles in the XZ plane."""
    n = len(profile)
    bm = bmesh.new()
    rings = []
    for (r, y) in profile:
        ring = []
        for s in range(segments):
            a = 2.0 * math.pi * s / segments
            ring.append(bm.verts.new((r * math.cos(a), y, r * math.sin(a))))
        rings.append(ring)
    for i in range(n - 1):
        for s in range(segments):
            s2 = (s + 1) % segments
            bm.faces.new((rings[i][s], rings[i][s2], rings[i + 1][s2], rings[i + 1][s]))
    if caps:
        bm.faces.new(rings[0])
        bm.faces.new(list(reversed(rings[-1])))
    if bend:
        y0 = profile[0][1]
        h = max(profile[-1][1] - y0, 1e-6)
        for ring in rings:
            for v in ring:
                t = (v.co.y - y0) / h
                v.co.x += bend * t * t
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_obj(name, bm, mat)
    bm.free()
    obj.scale = Vector(scale)
    obj.rotation_euler = Euler(rotation, 'XYZ')
    obj.location = Vector(location)
    return finish(obj, smooth, subdiv)

def sphere(name, mat, radius, loc, scale=(1.0, 1.0, 1.0), rot=(0.0, 0.0, 0.0), subdiv=1):
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=20, radius=radius)
    obj = mesh_obj(name, bm, mat)
    bm.free()
    obj.scale = Vector(scale)
    obj.rotation_euler = Euler(rot, 'XYZ')
    obj.location = Vector(loc)
    return finish(obj, True, subdiv)

def body_part(name, loc, scale, rot=(0.0, 0.0, 0.0), radius=1.0):
    """High-res unscaled UV sphere used only as voxel-remesh fodder."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=48, v_segments=30, radius=radius)
    obj = mesh_obj(name, bm, None)
    bm.free()
    obj.scale = Vector(scale)
    obj.rotation_euler = Euler(rot, 'XYZ')
    obj.location = Vector(loc)
    return obj

def box(name, mat, size, loc, rot=(0.0, 0.0, 0.0), subdiv=1):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    obj = mesh_obj(name, bm, mat)
    bm.free()
    obj.rotation_euler = Euler(rot, 'XYZ')
    obj.location = Vector(loc)
    return finish(obj, True, subdiv)

def cylinder(name, mat, radius, depth, loc, rot=(0.0, 0.0, 0.0), subdiv=1):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=20, radius1=radius, radius2=radius, depth=depth)
    obj = mesh_obj(name, bm, mat)
    bm.free()
    obj.rotation_euler = Euler(rot, 'XYZ')
    obj.location = Vector(loc)
    return finish(obj, True, subdiv)

def torus(name, mat, major, minor, loc, rot=(0.0, 0.0, 0.0), subdiv=2):
    bm = bmesh.new()
    seg_major = 40
    seg_minor = 14
    rings = []
    for i in range(seg_major):
        a = 2.0 * math.pi * i / seg_major
        cx = major * math.cos(a)
        cy = major * math.sin(a)
        ring = []
        for j in range(seg_minor):
            b = 2.0 * math.pi * j / seg_minor
            ring.append(bm.verts.new((
                cx + minor * math.cos(b) * math.cos(a),
                cy + minor * math.cos(b) * math.sin(a),
                minor * math.sin(b)
            )))
        rings.append(ring)
    for i in range(seg_major):
        i2 = (i + 1) % seg_major
        for j in range(seg_minor):
            j2 = (j + 1) % seg_minor
            bm.faces.new((rings[i][j], rings[i][j2], rings[i2][j2], rings[i2][j]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    obj = mesh_obj(name, bm, mat)
    bm.free()
    obj.rotation_euler = Euler(rot, 'XYZ')
    obj.location = Vector(loc)
    return finish(obj, True, subdiv)

def bowtie_wing(name, side):
    """One triangular bow wing (smooth, slightly folded)."""
    bm = bmesh.new()
    pts = [Vector((0.0, 0.0, 0.0)), Vector((side * 0.14, 0.0, -0.062)), Vector((side * 0.14, 0.0, 0.062))]
    f_verts = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(f_verts)
    bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0.0, 0.035, 0.0)))
    obj = mesh_obj(name, bm, RED)
    bm.free()
    obj.rotation_euler = Euler((0.0, 0.0, side * 0.25), 'XYZ')
    obj.location = Vector((0.0, 0.0, 0.0))
    return finish(obj, True, 1)

# ---------------------------------------------------------------- materials

FUR      = material('Fur',       (0.978, 0.958, 0.910), roughness=0.85)
FUR_WARM = material('FurWarm',   (0.988, 0.978, 0.950), roughness=0.80)
PINK_IN  = material('PinkInner', (0.950, 0.700, 0.720), roughness=0.65)
BLUE     = material('JacketBlue',(0.110, 0.320, 0.630), roughness=0.38)
SHIRT    = material('Shirt',     (0.985, 0.985, 0.975), roughness=0.50)
RED      = material('BowtieRed', (0.720, 0.095, 0.115), roughness=0.40)
GOLD     = material('Gold',      (0.880, 0.690, 0.300), roughness=0.22, metallic=0.75)
EYE      = material('Eye',       (0.065, 0.065, 0.105), roughness=0.20)
WHITE    = material('EyeWhite',  (1.000, 1.000, 1.000), roughness=0.35)
NOSE     = material('Nose',      (0.960, 0.590, 0.590), roughness=0.45)
MOUTH    = material('Mouth',     (0.560, 0.240, 0.240), roughness=0.5)
BLUSH    = material('Blush',     (1.000, 0.660, 0.660), roughness=0.6)
WHISKER  = material('Whisker',   (0.930, 0.915, 0.885), roughness=0.7)
BATON_W  = material('Baton',     (0.985, 0.985, 0.985), roughness=0.30)
BATON_H  = material('BatonHandle',(0.300, 0.190, 0.140), roughness=0.55)

# ---------------------------------------------------------------- build

clear_scene()

# --- posed body parts (ellipsoids for voxel fusion) ---
parts = []
def add_part(name, loc, scale, rot=(0.0, 0.0, 0.0)):
    o = body_part(name, loc, scale, rot)
    parts.append(o)

# torso pear (slim base so the legs protrude below)
add_part('p_hip',    (0.0, 0.34, 0.0),   (0.40, 0.26, 0.38))
add_part('p_belly',  (0.0, 0.56, 0.02),  (0.44, 0.32, 0.42))
add_part('p_chest',  (0.0, 0.80, 0.02),  (0.42, 0.34, 0.40))
add_part('p_lower',  (0.0, 0.16, 0.0),   (0.24, 0.13, 0.22))
# head + cheeks + muzzle
add_part('p_head',   (0.0, 1.26, 0.02),  (0.37, 0.35, 0.35))
add_part('p_cheekL', (-0.21, 1.14, 0.24), (0.14, 0.10, 0.10))
add_part('p_cheekR', (0.21, 1.14, 0.24),  (0.14, 0.10, 0.10))
add_part('p_muzzle', (0.0, 1.06, 0.34),  (0.13, 0.085, 0.11))
# ears: thicker segments (voxel remesh erodes thin features), gently curving outward
add_part('p_earL_base', (-0.20, 1.55, 0.02), (0.105, 0.32, 0.09), (0.0, 0.0, 0.10))
add_part('p_earL_tip',  (-0.28, 1.94, 0.02), (0.085, 0.30, 0.075), (0.0, 0.0, 0.14))
add_part('p_earR_base', (0.20, 1.55, 0.02),  (0.105, 0.32, 0.09), (0.0, 0.0, -0.10))
add_part('p_earR_tip',  (0.28, 1.94, 0.02),  (0.085, 0.30, 0.075), (0.0, 0.0, -0.14))
# left arm hanging down (2 segments + paw)
add_part('p_armL_up',   (-0.44, 0.98, 0.02), (0.13, 0.24, 0.13), (0.0, 0.0, 0.10))
add_part('p_armL_lo',   (-0.46, 0.70, 0.04), (0.11, 0.22, 0.11), (0.0, 0.0, 0.06))
add_part('p_armL_paw',  (-0.47, 0.42, 0.06), (0.12, 0.13, 0.12))
# right arm raised forward-up (conductor pose)
add_part('p_armR_up',   (0.42, 1.00, 0.04), (0.13, 0.24, 0.13), (0.55, 0.0, -0.08))
add_part('p_armR_lo',   (0.49, 1.24, 0.24), (0.11, 0.22, 0.11), (0.35, 0.0, -0.06))
add_part('p_armR_paw',  (0.53, 1.44, 0.38), (0.13, 0.14, 0.13))
# legs + feet (clearly protruding below the slim torso base)
add_part('p_legL',  (-0.16, 0.06, 0.02), (0.11, 0.20, 0.12))
add_part('p_footL', (-0.17, -0.02, 0.12), (0.13, 0.075, 0.21))
add_part('p_legR',  (0.16, 0.06, 0.02),  (0.11, 0.20, 0.12))
add_part('p_footR', (0.17, -0.02, 0.12), (0.13, 0.075, 0.21))
# tail
add_part('p_tail',  (0.0, 0.40, -0.40), (0.13, 0.12, 0.13))

# fuse everything into one organic mesh
bpy.ops.object.select_all(action='DESELECT')
for o in parts:
    o.select_set(True)
bpy.context.view_layer.objects.active = parts[0]
bpy.ops.object.join()
voxel_mod = bpy.context.object.modifiers.new('voxel_fuse', 'REMESH')
voxel_mod.mode = 'VOXEL'
voxel_mod.voxel_size = 0.024
voxel_mod.adaptivity = 0.0
voxel_mod.use_smooth_shade = True
bpy.ops.object.modifier_apply(modifier=voxel_mod.name)
body = bpy.context.object
body.name = 'body_fused'
body.data.materials.clear()
body.data.materials.append(FUR)
finish(body, smooth=True, subdiv=0)

# --- clothes & details (separate smooth meshes on top) ---

# blue conductor coat: lathe shell hugging the torso
lathe('jacket', BLUE,
      [(0.50, 0.08), (0.55, 0.30), (0.57, 0.46), (0.54, 0.60),
       (0.48, 0.74), (0.40, 0.86)],
      subdiv=1)
# tailcoat tails
box('tailcoat_L', BLUE, (0.13, 0.48, 0.05), (-0.15, 0.50, -0.48), rot=(0.0, 0.0, 0.22), subdiv=1)
box('tailcoat_R', BLUE, (0.13, 0.48, 0.05), (0.15, 0.50, -0.48), rot=(0.0, 0.0, -0.22), subdiv=1)
# white shirt front
sphere('shirt', SHIRT, 0.30, (0.0, 0.94, 0.40), scale=(0.60, 0.55, 0.26), subdiv=1)
# gold buttons on the coat front
for i, (by, bz) in enumerate([(0.82, 0.44), (0.72, 0.47), (0.62, 0.49)]):
    sphere('button_%d' % i, GOLD, 0.036, (0.0, by, bz), subdiv=1)
# bow tie (two folded wings + knot)
wl = bowtie_wing('bowtie_L', -1.0); wl.location = Vector((0.0, 0.96, 0.45))
wr = bowtie_wing('bowtie_R', 1.0); wr.location = Vector((0.0, 0.96, 0.45))
sphere('bowtie_knot', RED, 0.042, (0.0, 0.96, 0.45), subdiv=1)

# --- face ---
sphere('eye_L', EYE, 0.076, (-0.160, 1.27, 0.335), scale=(1.0, 1.06, 0.9), subdiv=1)
sphere('eye_R', EYE, 0.076, (0.160, 1.27, 0.335), scale=(1.0, 1.06, 0.9), subdiv=1)
sphere('hl_L', WHITE, 0.026, (-0.138, 1.288, 0.392), subdiv=1)
sphere('hl_R', WHITE, 0.026, (0.138, 1.288, 0.392), subdiv=1)
sphere('nose', NOSE, 0.046, (0.0, 1.185, 0.392), scale=(1.0, 0.82, 1.1), subdiv=1)
box('mouth', MOUTH, (0.076, 0.014, 0.026), (0.0, 1.125, 0.385), subdiv=1)
sphere('blush_L', BLUSH, 0.054, (-0.235, 1.165, 0.345), scale=(1.15, 0.8, 0.4), subdiv=1)
sphere('blush_R', BLUSH, 0.054, (0.235, 1.165, 0.345), scale=(1.15, 0.8, 0.4), subdiv=1)
# gold glasses
torus('glass_L', GOLD, 0.103, 0.016, (-0.160, 1.27, 0.392))
torus('glass_R', GOLD, 0.103, 0.016, (0.160, 1.27, 0.392))
box('glass_bridge', GOLD, (0.11, 0.020, 0.020), (0.0, 1.27, 0.392), subdiv=1)
# whiskers
for side in (-1.0, 1.0):
    for i, ang in enumerate((0.42, 0.78, 1.14)):
        cylinder('whisker_%d_%d' % (i, 0 if side < 0 else 1), WHISKER, 0.006, 0.20,
                 (side * 0.26, 1.16 + i * 0.035, 0.38),
                 rot=(0.0, math.pi / 2, side * ang))

# --- baton in the raised right paw ---
baton_dir = Vector((0.30, 0.80, 0.50)).normalized()
baton_start = Vector((0.50, 1.40, 0.40)) + baton_dir * 0.08
baton_mid = baton_start + baton_dir * 0.30
baton = cylinder('baton', BATON_W, 0.016, 0.56, (baton_mid.x, baton_mid.y, baton_mid.z))
baton.rotation_mode = 'QUATERNION'
baton.rotation_quaternion = baton_dir.to_track_quat('Z', 'Y')
sphere('baton_handle', BATON_H, 0.034, (baton_start.x, baton_start.y, baton_start.z), subdiv=1)
tip = baton_start + baton_dir * 0.56
sphere('baton_tip', BATON_W, 0.024, (tip.x, tip.y, tip.z), subdiv=1)

bpy.ops.object.select_all(action='DESELECT')

# ---------------------------------------------------------------- preview render
if OUT_PNG:
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1200
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0

    world = bpy.data.worlds.new('PreviewWorld')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    # Medium slate blue: enough contrast to separate white fur from the background
    bg.inputs['Color'].default_value = (0.42, 0.58, 0.68, 1.0)
    bg.inputs['Strength'].default_value = 1.0
    scene.world = world

    # Key light: aimed from front-top-right so the face is lit (rays travel toward -Z)
    key_dir = Vector((0.30, 0.82, -0.48)).normalized()
    key_data = bpy.data.lights.new('PreviewSun', 'SUN')
    key_data.energy = 3.0
    key_data.angle = math.radians(12)
    key = bpy.data.objects.new('PreviewSun', key_data)
    key.rotation_mode = 'QUATERNION'
    key.rotation_quaternion = key_dir.to_track_quat('-Z', 'Y')
    bpy.context.collection.objects.link(key)

    # Rim/fill light from behind-left so the silhouette separates from the background
    rim_dir = Vector((-0.45, 0.55, 0.55)).normalized()
    rim_data = bpy.data.lights.new('PreviewRim', 'SUN')
    rim_data.energy = 1.0
    rim_data.angle = math.radians(25)
    rim = bpy.data.objects.new('PreviewRim', rim_data)
    rim.rotation_mode = 'QUATERNION'
    rim.rotation_quaternion = rim_dir.to_track_quat('-Z', 'Y')
    bpy.context.collection.objects.link(rim)
    bg.inputs['Strength'].default_value = 1.0

    gmat = material('PreviewGround', (0.62, 0.76, 0.64), roughness=1.0)
    bpy.ops.mesh.primitive_plane_add(size=10.0, location=(0.0, -0.012, 0.0))
    ground = bpy.context.object
    ground.name = 'preview_ground'
    ground.rotation_euler = Euler((math.radians(90), 0.0, 0.0), 'XYZ')
    ground.data.materials.clear()
    ground.data.materials.append(gmat)

    def make_shot(name, loc, target, lens, filepath, exposure=0.0, ortho=False, ortho_scale=3.4, flat=False):
        cam_data = bpy.data.cameras.new(name)
        if ortho:
            cam_data.type = 'ORTHO'
            cam_data.ortho_scale = ortho_scale
        else:
            cam_data.lens = lens
        cam = bpy.data.objects.new(name, cam_data)
        cam.location = Vector(loc)
        if flat:
            # identity rotation: camera looks along -Z with +Y up (dead-on, never flipped)
            cam.rotation_euler = Euler((0.0, 0.0, 0.0), 'XYZ')
        else:
            cam.rotation_mode = 'QUATERNION'
            cam.rotation_quaternion = (Vector(target) - cam.location).to_track_quat('-Z', 'Y')
        bpy.context.collection.objects.link(cam)
        scene.camera = cam
        scene.view_settings.exposure = exposure
        scene.render.filepath = filepath
        bpy.ops.render.render(write_still=True)

    make_shot('PreviewCamFull', (1.3, 1.9, 1.7), (0.0, 1.1, 0.1), 50, OUT_PNG)
    head_path = re.sub(r'\.png$', '_head.png', OUT_PNG)
    make_shot('PreviewCamHead', (0.85, 1.65, 1.30), (0.0, 1.30, 0.10), 95, head_path, exposure=0.0)
    ortho_path = re.sub(r'\.png$', '_ortho.png', OUT_PNG)
    make_shot('PreviewCamOrtho', (0.0, 1.15, 4.0), (0.0, 1.15, 0.0), 0, ortho_path, ortho=True, ortho_scale=3.4, flat=True)

# ---------------------------------------------------------------- export GLB
if OUT_GLB:
    # glTF is +Y-up; Blender is +Z-up. This character was built +Y-up (feet at y=0),
    # so without conversion the glTF exporter maps the standing axis to glTF Z
    # and the character ends up lying down in the app. Rotate everything +90 deg
    # around the world X axis: character up (+Y) -> Blender +Z -> glTF +Y (up),
    # character face (+Z) -> Blender -Y -> glTF +Z (forward).
    bpy.context.scene.tool_settings.transform_pivot_point = 'CURSOR'
    bpy.context.scene.cursor.location = (0.0, 0.0, 0.0)
    bpy.ops.object.select_all(action='DESELECT')
    for o in bpy.data.objects:
        if o.type == 'MESH' and not o.name.startswith('preview_'):
            o.select_set(True)
    bpy.ops.transform.rotate(value=math.pi / 2, orient_axis='X', orient_type='GLOBAL')
    bpy.ops.object.select_all(action='DESELECT')

    # Verify the app orientation: render an ortho view from the +Y side
    # (the face now points toward -Y; up is +Z), so we can confirm the
    # character stands upright and faces the camera once converted to glTF.
    if OUT_PNG:
        for o in list(bpy.data.objects):
            if o.name.startswith('preview_'):
                bpy.data.objects.remove(o, do_unlink=True)  # drop the ground plane
        vcam_d = bpy.data.cameras.new('VerifyCam')
        vcam_d.type = 'ORTHO'
        vcam_d.ortho_scale = 3.4
        vcam = bpy.data.objects.new('VerifyCam', vcam_d)
        vcam.location = Vector((0.0, 3.5, 1.15))
        vcam.rotation_mode = 'QUATERNION'
        vcam.rotation_quaternion = (Vector((0.0, 0.0, 1.15)) - vcam.location).to_track_quat('-Z', 'Z')
        bpy.context.collection.objects.link(vcam)
        scene.camera = vcam
        verify_path = re.sub(r'\.png$', '_appverify.png', OUT_PNG)
        scene.render.filepath = verify_path
        scene.render.resolution_x = 1200
        scene.render.resolution_y = 1200
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(vcam, do_unlink=True)

    for o in list(bpy.data.objects):
        if o.name.startswith(('preview_', 'Preview')):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB')

print('DONE conductor rabbit v2')
