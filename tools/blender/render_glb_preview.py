"""Render a neutral turntable-style preview of a GLB in headless Blender.

Environment:
  BLENDER_INPUT_GLB  required input file
  BLENDER_OUT_PNG    required output image
"""

import math
import os

import bpy
from mathutils import Vector


INPUT_GLB = os.environ["BLENDER_INPUT_GLB"]
OUTPUT_PNG = os.environ["BLENDER_OUT_PNG"]


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def scene_bounds() -> tuple[Vector, Vector]:
    corners: list[Vector] = []
    for obj in bpy.context.scene.objects:
        if obj.type != "MESH":
            continue
        corners.extend(obj.matrix_world @ Vector(corner) for corner in obj.bound_box)
    if not corners:
        raise RuntimeError("Imported GLB contains no mesh objects")
    minimum = Vector((min(point.x for point in corners), min(point.y for point in corners), min(point.z for point in corners)))
    maximum = Vector((max(point.x for point in corners), max(point.y for point in corners), max(point.z for point in corners)))
    return minimum, maximum


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=INPUT_GLB)

default_material = bpy.data.materials.new("PreviewNeutral")
default_material.diffuse_color = (0.72, 0.75, 0.78, 1.0)
default_material.metallic = 0.0
default_material.roughness = 0.72
for obj in bpy.context.scene.objects:
    if obj.type == "MESH" and not obj.data.materials:
        obj.data.materials.append(default_material)

minimum, maximum = scene_bounds()
center = (minimum + maximum) * 0.5
size = maximum - minimum
height = max(size.z, 0.1)

ground_material = bpy.data.materials.new("Ground")
ground_material.diffuse_color = (0.12, 0.14, 0.18, 1.0)
ground_material.roughness = 0.9
bpy.ops.mesh.primitive_plane_add(size=max(size.x, size.y, height) * 4.0, location=(center.x, center.y, minimum.z - 0.002))
ground = bpy.context.object
ground.name = "PreviewGround"
ground.data.materials.append(ground_material)

world = bpy.data.worlds.new("PreviewWorld")
bpy.context.scene.world = world
world.color = (0.035, 0.045, 0.065)

bpy.ops.object.light_add(type="AREA", location=(center.x - height * 1.2, center.y - height * 1.4, center.z + height * 1.5))
key = bpy.context.object
key.data.energy = 1100
key.data.shape = "DISK"
key.data.size = height * 1.5
look_at(key, center)

bpy.ops.object.light_add(type="AREA", location=(center.x + height, center.y + height * 0.5, center.z + height * 0.6))
fill = bpy.context.object
fill.data.energy = 650
fill.data.size = height
look_at(fill, center)

bpy.ops.object.light_add(type="AREA", location=(center.x, center.y + height, center.z + height * 1.5))
rim = bpy.context.object
rim.data.energy = 850
rim.data.size = height
look_at(rim, center)

bpy.ops.object.camera_add(location=(center.x, center.y - height * 2.8, center.z + height * 0.08))
camera = bpy.context.object
camera.data.lens = 58
look_at(camera, center)
bpy.context.scene.camera = camera

scene = bpy.context.scene
scene.render.engine = "BLENDER_EEVEE_NEXT"
scene.render.resolution_x = 800
scene.render.resolution_y = 800
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = OUTPUT_PNG
scene.render.film_transparent = False
scene.render.image_settings.color_mode = "RGBA"
scene.view_settings.look = "AgX - Medium High Contrast"
scene.render.resolution_percentage = 100

# Fit the full body with a small margin after camera placement.
camera.data.type = "ORTHO"
camera.data.ortho_scale = height * 1.18

os.makedirs(os.path.dirname(OUTPUT_PNG), exist_ok=True)
bpy.ops.render.render(write_still=True)
print(f"PREVIEW_RENDERED={OUTPUT_PNG}")
