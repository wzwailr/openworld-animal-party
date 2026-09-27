# probe_light.py — Euler sun vs track-quat sun on a white sphere
import bpy
import math
from mathutils import Vector, Euler

OUT = 'D:/aiCode/animal-kingdom/tools/blender/out'

def setup_scene():
    bpy.ops.object.select_all(action='SELECT')
    bpy.ops.object.delete(use_global=False)
    world = bpy.data.worlds.new('PW')
    world.use_nodes = True
    world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.60, 0.74, 0.82, 1.0)
    bpy.context.scene.world = world
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.8, location=(0, 0.8, 0))
    scene = bpy.context.scene
    scene.render.engine = 'BLENDER_EEVEE_NEXT'
    scene.render.resolution_x = 400
    scene.render.resolution_y = 400
    scene.render.image_settings.file_format = 'PNG'
    scene.view_settings.view_transform = 'Standard'
    scene.view_settings.look = 'None'
    cam_d = bpy.data.cameras.new('C')
    cam_d.lens = 60
    cam = bpy.data.objects.new('C', cam_d)
    cam.location = Vector((0, 1.4, 3.5))
    cam.rotation_euler = Euler((0, 0, 0), 'XYZ')
    bpy.context.collection.objects.link(cam)
    scene.camera = cam

def add_sun_euler(name, energy):
    d = bpy.data.lights.new(name, 'SUN')
    d.energy = energy
    o = bpy.data.objects.new(name, d)
    o.rotation_euler = Euler((math.radians(55), 0, math.radians(35)), 'XYZ')
    bpy.context.collection.objects.link(o)

def add_sun_track(name, energy, dirvec):
    d = bpy.data.lights.new(name, 'SUN')
    d.energy = energy
    o = bpy.data.objects.new(name, d)
    o.rotation_mode = 'QUATERNION'
    o.rotation_quaternion = Vector(dirvec).normalized().to_track_quat('-Z', 'Y')
    bpy.context.collection.objects.link(o)

def render_mean(path):
    scene = bpy.context.scene
    scene.render.filepath = path
    bpy.ops.render.render(write_still=True)
    img = bpy.data.images.load(path)
    w, h = img.size
    pix = img.pixels
    n = w * h
    r = g = b = 0.0
    lo, hi = 1e9, -1e9
    for i in range(0, n * 4, 4):
        lum = 0.299 * pix[i] + 0.587 * pix[i+1] + 0.114 * pix[i+2]
        r += pix[i]; g += pix[i+1]; b += pix[i+2]
        lo = min(lo, lum); hi = max(hi, lum)
    print('RESULT[%s] mean=(%.3f,%.3f,%.3f) lum[%.3f..%.3f]' % (path.split('/')[-1][:-4], r/n, g/n, b/n, lo, hi))

setup_scene(); add_sun_euler('E1', 3.0); render_mean(OUT + '/pl_euler.png')
setup_scene(); add_sun_track('T1', 3.0, (0.30, 0.82, -0.48)); render_mean(OUT + '/pl_track.png')
setup_scene(); add_sun_euler('E2', 3.0)
add_sun_track('T2', 1.1, (-0.45, 0.55, 0.55)); render_mean(OUT + '/pl_both.png')
print('PROBE LIGHT DONE')
