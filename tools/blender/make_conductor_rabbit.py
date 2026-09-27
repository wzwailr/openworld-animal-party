# make_conductor_rabbit.py
# Builds a stylized "conductor rabbit" character matching the concept art:
# white fur, long upright ears with pink inner ears, gold round glasses,
# blue conductor tailcoat with gold buttons, red bow tie, raised baton arm.
#
# Usage (headless):
#   blender -b --python make_conductor_rabbit.py --python-exit-code 1
#   Env: BLENDER_OUT_GLB (required)  BLENDER_OUT_PNG (optional preview render)
#
# Technique: bmesh lathe profiles + subdivision surface + smooth shading,
# so silhouettes are organic, not primitive stacks.

import bpy
import bmesh
import math
import os
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

def finish(obj, smooth=True, subdiv=2):
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

def lathe(name, mat, profile, segments=44, caps=True, smooth=True, subdiv=2,
          bend=0.0, scale=(1.0, 1.0, 1.0), rotation=(0.0, 0.0, 0.0),
          location=(0.0, 0.0, 0.0)):
    """Surface of revolution around the Y axis from a (radius, y) profile.
    Circle rings live in the XZ plane; the profile's y is world height."""
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
    bmesh.ops.create_uvsphere(bm, u_segments=28, v_segments=18, radius=radius)
    obj = mesh_obj(name, bm, mat)
    bm.free()
    obj.scale = Vector(scale)
    obj.rotation_euler = Euler(rot, 'XYZ')
    obj.location = Vector(loc)
    return finish(obj, True, subdiv)

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
    """Hand-built torus in the XY plane (ring faces +Z), like glasses frames."""
    bm = bmesh.new()
    seg_major = 36
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

# ---------------------------------------------------------------- materials

FUR      = material('Fur',      (0.975, 0.955, 0.905), roughness=0.78)
FUR_WARM = material('FurWarm',  (0.985, 0.975, 0.945), roughness=0.72)
PINK_IN  = material('PinkInner',(0.945, 0.700, 0.720), roughness=0.65)
BLUE     = material('JacketBlue',(0.120, 0.330, 0.640), roughness=0.48)
SHIRT    = material('Shirt',    (0.985, 0.985, 0.975), roughness=0.55)
RED      = material('BowtieRed',(0.720, 0.100, 0.120), roughness=0.42)
GOLD     = material('Gold',     (0.880, 0.690, 0.300), roughness=0.26, metallic=0.65)
EYE      = material('Eye',      (0.070, 0.070, 0.110), roughness=0.22)
WHITE    = material('EyeWhite', (1.000, 1.000, 1.000), roughness=0.35)
NOSE     = material('Nose',     (0.960, 0.600, 0.600), roughness=0.45)
MOUTH    = material('Mouth',    (0.580, 0.260, 0.260), roughness=0.5)
BLUSH    = material('Blush',    (1.000, 0.660, 0.660), roughness=0.6)
WHISKER  = material('Whisker',  (0.930, 0.915, 0.885), roughness=0.7)
BATON_W  = material('Baton',    (0.985, 0.985, 0.985), roughness=0.30)
BATON_H  = material('BatonHandle',(0.300, 0.190, 0.140), roughness=0.55)

# ---------------------------------------------------------------- build

clear_scene()

# --- feet (stubby, slightly forward) ---
for side in (-1.0, 1.0):
    lathe('foot_%s' % ('L' if side < 0 else 'R'), FUR,
          [(0.10, 0.0), (0.165, 0.06), (0.15, 0.145), (0.10, 0.20)],
          location=(side * 0.17, 0.0, 0.10), scale=(1.0, 1.0, 1.35))

# --- pear body ---
lathe('body', FUR,
      [(0.30, 0.06), (0.44, 0.20), (0.56, 0.36), (0.62, 0.52),
       (0.59, 0.68), (0.52, 0.84), (0.44, 0.98), (0.36, 1.10)],
      scale=(1.0, 1.0, 0.92))
sphere('belly', FUR_WARM, 0.34, (0.0, 0.55, 0.33), scale=(0.95, 1.15, 0.5), subdiv=1)

# --- blue tailcoat ---
lathe('jacket', BLUE,
      [(0.42, 0.08), (0.56, 0.26), (0.64, 0.44), (0.62, 0.62),
       (0.52, 0.78), (0.42, 0.90)],
      scale=(1.0, 1.0, 0.95))
box('tailcoat_L', BLUE, (0.15, 0.40, 0.05), (-0.17, 0.42, -0.52), rot=(0.0, 0.0, 0.28))
box('tailcoat_R', BLUE, (0.15, 0.40, 0.05), (0.17, 0.42, -0.52), rot=(0.0, 0.0, -0.28))
sphere('shoulder_L', BLUE, 0.19, (-0.40, 0.92, 0.03), scale=(1.0, 0.95, 0.9), subdiv=1)
sphere('shoulder_R', BLUE, 0.19, (0.40, 0.92, 0.03), scale=(1.0, 0.95, 0.9), subdiv=1)
sphere('shirt', SHIRT, 0.30, (0.0, 0.88, 0.50), scale=(0.62, 0.60, 0.30), subdiv=1)
for i, (by, bz) in enumerate([(0.80, 0.50), (0.70, 0.52), (0.60, 0.53)]):
    sphere('button_%d' % i, GOLD, 0.034, (0.0, by, bz), subdiv=1)

# --- arms: tapered lathe with rounded mitt paws, built along +Y at origin ---
ARM_PROFILE = [(0.10, 0.0), (0.135, 0.18), (0.15, 0.38), (0.14, 0.56),
               (0.155, 0.70), (0.16, 0.76), (0.13, 0.82)]
ARM_LEN = 0.80

def arm(name, base, rot_x, rot_z):
    obj = lathe(name, FUR, ARM_PROFILE, rotation=(rot_x, 0.0, rot_z), location=base)
    # paw tip in world space
    m = Euler((rot_x, 0.0, rot_z), 'XYZ').to_matrix()
    tip = Vector(base) + m @ Vector((0.0, 1.0, 0.0)) * ARM_LEN
    return obj, tip

armL, tipL = arm('arm_L', (-0.42, 0.95, 0.05), math.radians(165), math.radians(6))
armR, tipR = arm('arm_R', (0.42, 0.95, 0.05), math.radians(40), math.radians(-4))
sphere('paw_L', FUR, 0.115, (tipL.x, tipL.y - 0.03, tipL.z + 0.02), scale=(1.0, 1.0, 0.9), subdiv=1)
sphere('paw_R', FUR, 0.115, (tipR.x, tipR.y - 0.03, tipR.z + 0.02), scale=(1.0, 1.0, 0.9), subdiv=1)

# --- baton in the raised right paw ---
baton_dir = Vector((0.18, 0.80, 0.52)).normalized()
baton_start = Vector((tipR.x, tipR.y, tipR.z + 0.02)) + baton_dir * 0.10
baton_mid = baton_start + baton_dir * 0.30
baton = cylinder('baton', BATON_W, 0.017, 0.58, (baton_mid.x, baton_mid.y, baton_mid.z))
baton.rotation_mode = 'QUATERNION'
baton.rotation_quaternion = baton_dir.to_track_quat('Z', 'Y')
sphere('baton_handle', BATON_H, 0.036, (baton_start.x, baton_start.y, baton_start.z), subdiv=1)
sphere('baton_tip', BATON_W, 0.026, ((baton_start + baton_dir * 0.58).x,
                                      (baton_start + baton_dir * 0.58).y,
                                      (baton_start + baton_dir * 0.58).z), subdiv=1)

# --- tail ---
sphere('tail', FUR, 0.13, (0.0, 0.34, -0.50), scale=(1.0, 0.92, 1.05), subdiv=1)

# --- head (egg profile) ---
lathe('head', FUR,
      [(0.30, -0.34), (0.38, -0.20), (0.42, -0.04), (0.415, 0.08),
       (0.38, 0.20), (0.30, 0.33)],
      location=(0.0, 1.32, 0.0), scale=(1.06, 1.08, 0.94))

# --- ears: long rounded lathe with gentle outward bend, pink inner ear ---
EAR_PROFILE = [(0.11, 0.0), (0.125, 0.16), (0.12, 0.34), (0.10, 0.54),
               (0.075, 0.74), (0.048, 0.90), (0.024, 1.00), (0.010, 1.06)]
for side in (-1.0, 1.0):
    rotz = 0.22 if side < 0 else -0.22
    lathe('ear_%s' % ('L' if side < 0 else 'R'), FUR, EAR_PROFILE,
          bend=0.12 * side,
          rotation=(math.radians(-6), 0.0, rotz),
          location=(side * 0.20, 1.48, 0.0),
          scale=(1.0, 1.0, 0.72))
    lathe('ear_inner_%s' % ('L' if side < 0 else 'R'), PINK_IN,
          [(r * 0.52, y * 0.68) for (r, y) in EAR_PROFILE],
          bend=0.12 * side,
          rotation=(math.radians(-6), 0.0, rotz),
          location=(side * 0.20, 1.48, 0.085),
          scale=(1.0, 1.0, 0.60))

# --- face ---
sphere('eye_L', EYE, 0.078, (-0.160, 1.37, 0.345), scale=(1.0, 1.06, 0.9), subdiv=1)
sphere('eye_R', EYE, 0.078, (0.160, 1.37, 0.345), scale=(1.0, 1.06, 0.9), subdiv=1)
sphere('hl_L', WHITE, 0.026, (-0.138, 1.388, 0.400), subdiv=1)
sphere('hl_R', WHITE, 0.026, (0.138, 1.388, 0.400), subdiv=1)
sphere('nose', NOSE, 0.048, (0.0, 1.275, 0.398), scale=(1.0, 0.82, 1.1), subdiv=1)
box('mouth', MOUTH, (0.078, 0.014, 0.026), (0.0, 1.225, 0.388), subdiv=1)
sphere('blush_L', BLUSH, 0.055, (-0.245, 1.28, 0.340), scale=(1.15, 0.8, 0.4), subdiv=1)
sphere('blush_R', BLUSH, 0.055, (0.245, 1.28, 0.340), scale=(1.15, 0.8, 0.4), subdiv=1)

# glasses (gold wireframe rings + bridge)
torus('glass_L', GOLD, 0.108, 0.017, (-0.160, 1.37, 0.395))
torus('glass_R', GOLD, 0.108, 0.017, (0.160, 1.37, 0.395))
box('glass_bridge', GOLD, (0.11, 0.020, 0.020), (0.0, 1.37, 0.395), subdiv=1)

# whiskers
for side in (-1.0, 1.0):
    for i, ang in enumerate((0.42, 0.78, 1.14)):
        cylinder('whisker_%d_%d' % (i, 0 if side < 0 else 1), WHISKER, 0.0065, 0.20,
                 (side * 0.26, 1.27 + i * 0.035, 0.37),
                 rot=(0.0, math.pi / 2, side * ang))

# red bow tie: two triangular wings + knot
for side in (-1.0, 1.0):
    bm = bmesh.new()
    a = side * 0.115
    pts = [Vector((0.0, 0.0, 0.0)), Vector((a, 0.0, -0.055)), Vector((a, 0.0, 0.055))]
    f_verts = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(f_verts)
    bmesh.ops.extrude_face_region(bm, geom=[f])
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((0.0, 0.035, 0.0)))
    obj = mesh_obj('bowtie_%s' % ('L' if side < 0 else 'R'), bm, RED)
    bm.free()
    obj.rotation_euler = Euler((0.0, 0.0, side * 0.28), 'XYZ')
    obj.location = Vector((0.0, 0.93, 0.52))
    finish(obj, True, 1)
sphere('bowtie_knot', RED, 0.040, (0.0, 0.93, 0.52), subdiv=1)

bpy.ops.object.select_all(action='DESELECT')

# ---------------------------------------------------------------- preview render
if OUT_PNG:
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 1200
    scene.render.resolution_y = 1200
    scene.render.image_settings.file_format = 'PNG'
    # Standard view transform: preview colors match the actual material colors
    # (AgX would wash everything toward gray and mislead QA).
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    scene.view_settings.exposure = 0.0

    world = bpy.data.worlds.new('PreviewWorld')
    world.use_nodes = True
    bg = world.node_tree.nodes.get('Background')
    # Soft sky blue: contrasts with the white fur so the body reads clearly
    bg.inputs['Color'].default_value = (0.60, 0.74, 0.82, 1.0)
    bg.inputs['Strength'].default_value = 1.0
    scene.world = world

    sun_data = bpy.data.lights.new('PreviewSun', 'SUN')
    sun_data.energy = 2.2
    sun_data.angle = math.radians(12)
    sun = bpy.data.objects.new('PreviewSun', sun_data)
    sun.rotation_euler = Euler((math.radians(55), 0.0, math.radians(35)), 'XYZ')
    bpy.context.collection.objects.link(sun)

    fill_data = bpy.data.lights.new('PreviewFill', 'SUN')
    fill_data.energy = 1.2
    fill_data.angle = math.radians(30)
    fill = bpy.data.objects.new('PreviewFill', fill_data)
    fill.rotation_euler = Euler((math.radians(70), 0.0, math.radians(-50)), 'XYZ')
    bpy.context.collection.objects.link(fill)

    # Soft ground plane so the character reads as standing (receives shadow)
    gmat = material('PreviewGround', (0.62, 0.76, 0.64), roughness=1.0)
    bpy.ops.mesh.primitive_plane_add(size=10.0, location=(0.0, -0.012, 0.0))
    ground = bpy.context.object
    ground.name = 'preview_ground'
    ground.rotation_euler = Euler((math.radians(90), 0.0, 0.0), 'XYZ')
    ground.data.materials.clear()
    ground.data.materials.append(gmat)

    def make_shot(name, loc, target, lens, filepath, exposure=0.0, ortho=False, ortho_scale=3.2):
        cam_data = bpy.data.cameras.new(name)
        if ortho:
            cam_data.type = 'ORTHO'
            cam_data.ortho_scale = ortho_scale
        else:
            cam_data.lens = lens
        cam = bpy.data.objects.new(name, cam_data)
        cam.location = Vector(loc)
        cam.rotation_mode = 'QUATERNION'
        cam.rotation_quaternion = (Vector(target) - cam.location).to_track_quat('-Z', 'Y')
        bpy.context.collection.objects.link(cam)
        scene.camera = cam
        scene.view_settings.exposure = exposure
        scene.render.filepath = filepath
        bpy.ops.render.render(write_still=True)

    # Full-body three-quarter front view (frames feet..ear tips, camera above ground)
    make_shot('PreviewCamFull', (1.5, 3.9, 2.0), (0.0, 1.3, 0.1), 45, OUT_PNG)
    # Head close-up (lower exposure so white fur keeps detail)
    import re
    head_path = re.sub(r'\.png$', '_head.png', OUT_PNG)
    make_shot('PreviewCamHead', (0.85, 1.65, 1.30), (0.0, 1.36, 0.10), 95, head_path, exposure=-0.6)
    # Dead-front orthographic shot: unambiguous orientation (camera on the FACE side, +Z)
    ortho_path = re.sub(r'\.png$', '_ortho.png', OUT_PNG)
    make_shot('PreviewCamOrtho', (0.0, 1.35, 4.0), (0.0, 1.15, 0.0), 0, ortho_path, ortho=True, ortho_scale=3.4)

# ---------------------------------------------------------------- export GLB
if OUT_GLB:
    # Remove preview-only objects (ground, lights, cameras) from the export
    for o in list(bpy.data.objects):
        if o.name.startswith(('preview_', 'Preview')):
            bpy.data.objects.remove(o, do_unlink=True)
    bpy.ops.export_scene.gltf(filepath=OUT_GLB, export_format='GLB')

print('DONE conductor rabbit')
