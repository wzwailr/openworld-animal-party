# render_ai_obj.py - import the AI-generated OBJ and render a front ortho for QA
import bpy
import math
from mathutils import Vector

OBJ = 'D:/aiCode/animal-kingdom/tools/blender/out/ai3d/rabbit_ai.obj'
OUT = 'D:/aiCode/animal-kingdom/tools/blender/out/ai3d/ai_preview.png'

bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
bpy.ops.wm.obj_import(filepath=OBJ)

scene = bpy.context.scene
scene.render.engine = 'BLENDER_EEVEE_NEXT'
scene.render.resolution_x = 800
scene.render.resolution_y = 800
scene.render.image_settings.file_format = 'PNG'
scene.view_settings.view_transform = 'Standard'
scene.view_settings.look = 'None'

world = bpy.data.worlds.new('PW')
world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.30, 0.44, 0.55, 1.0)
scene.world = world

d = bpy.data.lights.new('S', 'SUN')
d.energy = 3.0
s = bpy.data.objects.new('S', d)
s.rotation_euler = (0.9, 0.0, 0.6)
bpy.context.collection.objects.link(s)

d2 = bpy.data.lights.new('R', 'SUN')
d2.energy = 1.0
r = bpy.data.objects.new('R', d2)
r.rotation_euler = (1.2, 0.0, -0.8)
bpy.context.collection.objects.link(r)

cam_d = bpy.data.cameras.new('C')
cam_d.type = 'ORTHO'
cam_d.ortho_scale = 3.0
cam = bpy.data.objects.new('C', cam_d)
cam.location = Vector((0, 0, 3.0))
cam.rotation_euler = (0.0, 0.0, 0.0)
bpy.context.collection.objects.link(cam)
scene.camera = cam
scene.render.filepath = OUT
bpy.ops.render.render(write_still=True)
print('RENDER AI OBJ DONE')
