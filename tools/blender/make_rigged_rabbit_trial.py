"""Create a lightweight, textured, animated GLB trial from the Meshy rig.

This is deliberately a capability-validation asset, not a production-quality
character. It keeps the supplied skin, adds simple baked image textures,
creates a custom Conduct action, decimates the mesh, exports GLB, and renders
a verification still.

Environment:
  BLENDER_INPUT_GLB   required rigged source GLB
  BLENDER_OUT_GLB     required processed GLB
  BLENDER_OUT_PNG     required verification render
  BLENDER_TEXTURE_DIR required generated texture directory
  BLENDER_DECIMATE_RATIO optional, defaults to 0.055
"""

import math
import os
from pathlib import Path

import bpy
from mathutils import Euler, Vector


INPUT_GLB = os.environ["BLENDER_INPUT_GLB"]
OUTPUT_GLB = os.environ["BLENDER_OUT_GLB"]
OUTPUT_PNG = os.environ["BLENDER_OUT_PNG"]
TEXTURE_DIR = Path(os.environ["BLENDER_TEXTURE_DIR"])
DECIMATE_RATIO = float(os.environ.get("BLENDER_DECIMATE_RATIO", "0.055"))


def look_at(obj: bpy.types.Object, target: Vector) -> None:
    obj.rotation_euler = (target - obj.location).to_track_quat("-Z", "Y").to_euler()


def mesh_bounds(mesh_objects: list[bpy.types.Object]) -> tuple[Vector, Vector]:
    corners = [obj.matrix_world @ Vector(corner) for obj in mesh_objects for corner in obj.bound_box]
    minimum = Vector((min(p.x for p in corners), min(p.y for p in corners), min(p.z for p in corners)))
    maximum = Vector((max(p.x for p in corners), max(p.y for p in corners), max(p.z for p in corners)))
    return minimum, maximum


def make_texture(name: str, base: tuple[float, float, float], accent: tuple[float, float, float]) -> bpy.types.Image:
    size = 256
    pixels: list[float] = []
    for y in range(size):
        for x in range(size):
            weave = 0.5 + 0.5 * math.sin(x * 0.32) * math.sin(y * 0.27)
            stripe = 1.0 if ((x // 32) + (y // 32)) % 2 == 0 else 0.0
            mix = 0.10 * weave + 0.035 * stripe
            pixels.extend((
                min(1.0, base[0] * (1.0 - mix) + accent[0] * mix),
                min(1.0, base[1] * (1.0 - mix) + accent[1] * mix),
                min(1.0, base[2] * (1.0 - mix) + accent[2] * mix),
                1.0,
            ))

    image = bpy.data.images.new(name, width=size, height=size, alpha=True)
    image.colorspace_settings.name = "sRGB"
    image.pixels.foreach_set(pixels)
    image.update()
    image.file_format = "PNG"
    image.filepath_raw = str(TEXTURE_DIR / f"{name}.png")
    image.save()
    return image


def make_material(name: str, image: bpy.types.Image, roughness: float) -> bpy.types.Material:
    material = bpy.data.materials.new(name)
    material.use_nodes = True
    nodes = material.node_tree.nodes
    links = material.node_tree.links
    for node in list(nodes):
        nodes.remove(node)
    output = nodes.new("ShaderNodeOutputMaterial")
    shader = nodes.new("ShaderNodeBsdfPrincipled")
    texture = nodes.new("ShaderNodeTexImage")
    texture.image = image
    texture.interpolation = "Linear"
    shader.inputs["Roughness"].default_value = roughness
    shader.inputs["Metallic"].default_value = 0.0
    links.new(texture.outputs["Color"], shader.inputs["Base Color"])
    links.new(output.inputs["Surface"], shader.outputs["BSDF"])
    return material


def assign_trial_materials(mesh_obj: bpy.types.Object) -> None:
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    fur = make_material("TrialFur", make_texture("trial-fur", (0.78, 0.68, 0.53), (1.0, 0.92, 0.76)), 0.78)
    coat = make_material("TrialCoat", make_texture("trial-coat", (0.025, 0.12, 0.30), (0.14, 0.38, 0.67)), 0.58)
    dark = make_material("TrialDark", make_texture("trial-dark", (0.018, 0.026, 0.05), (0.14, 0.16, 0.22)), 0.7)

    mesh_obj.data.materials.clear()
    for material in (fur, coat, dark):
        mesh_obj.data.materials.append(material)

    for polygon in mesh_obj.data.polygons:
        local_center = sum((mesh_obj.data.vertices[index].co for index in polygon.vertices), Vector()) / len(polygon.vertices)
        center = mesh_obj.matrix_world @ local_center
        if center.z > 1.25 or (abs(center.x) > 0.245 and 0.72 < center.z < 1.12):
            polygon.material_index = 0
        elif center.z < 0.32:
            polygon.material_index = 2
        else:
            polygon.material_index = 1


def decimate_skinned_mesh(mesh_obj: bpy.types.Object) -> tuple[int, int]:
    before = len(mesh_obj.data.polygons)
    bpy.context.view_layer.objects.active = mesh_obj
    mesh_obj.select_set(True)
    modifier = mesh_obj.modifiers.new("WebTrialDecimate", "DECIMATE")
    modifier.ratio = DECIMATE_RATIO
    modifier.use_collapse_triangulate = True
    # Evaluate decimation before the armature so the bind pose is not baked.
    while mesh_obj.modifiers.find(modifier.name) > 0:
        bpy.ops.object.modifier_move_up(modifier=modifier.name)
    bpy.ops.object.modifier_apply(modifier=modifier.name)
    after = len(mesh_obj.data.polygons)
    return before, after


def key_rotation(bone: bpy.types.PoseBone, frame: int, rotation: tuple[float, float, float]) -> None:
    bone.rotation_mode = "QUATERNION"
    bone.rotation_quaternion = Euler(rotation, "XYZ").to_quaternion()
    bone.keyframe_insert(data_path="rotation_quaternion", frame=frame, group=bone.name)


def create_conduct_action(armature: bpy.types.Object) -> bpy.types.Action:
    scene = bpy.context.scene
    scene.render.fps = 30
    scene.frame_start = 1
    scene.frame_end = 60
    armature.animation_data_create()
    action = bpy.data.actions.new("Conduct")
    armature.animation_data.action = action

    required = ["RightArm", "RightForeArm", "RightHand", "LeftArm", "LeftForeArm", "Spine", "Head"]
    missing = [name for name in required if name not in armature.pose.bones]
    if missing:
        raise RuntimeError(f"Required conduct bones missing: {missing}")

    poses = {
        1: {
            "RightArm": (0.0, 0.0, 0.0), "RightForeArm": (0.0, 0.0, 0.0), "RightHand": (0.0, 0.0, 0.0),
            "LeftArm": (0.0, 0.0, 0.0), "LeftForeArm": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, -0.035), "Head": (0.02, 0.0, 0.045),
        },
        15: {
            "RightArm": (0.0, 0.0, 0.0), "RightForeArm": (0.0, 0.0, 0.0), "RightHand": (0.0, 0.0, 0.0),
            "LeftArm": (0.0, 0.0, 0.0), "LeftForeArm": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, 0.035), "Head": (-0.015, 0.0, -0.035),
        },
        30: {
            "RightArm": (0.0, 0.0, 0.0), "RightForeArm": (0.0, 0.0, 0.0), "RightHand": (0.0, 0.0, 0.0),
            "LeftArm": (0.0, 0.0, 0.0), "LeftForeArm": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, -0.045), "Head": (0.025, 0.0, 0.05),
        },
        45: {
            "RightArm": (0.0, 0.0, 0.0), "RightForeArm": (0.0, 0.0, 0.0), "RightHand": (0.0, 0.0, 0.0),
            "LeftArm": (0.0, 0.0, 0.0), "LeftForeArm": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, 0.04), "Head": (-0.02, 0.0, -0.04),
        },
        60: {
            "RightArm": (0.0, 0.0, 0.0), "RightForeArm": (0.0, 0.0, 0.0), "RightHand": (0.0, 0.0, 0.0),
            "LeftArm": (0.0, 0.0, 0.0), "LeftForeArm": (0.0, 0.0, 0.0), "Spine": (0.0, 0.0, -0.035), "Head": (0.02, 0.0, 0.045),
        },
    }
    for frame, rotations in poses.items():
        for name, rotation in rotations.items():
            key_rotation(armature.pose.bones[name], frame, rotation)

    for curve in action.fcurves:
        for point in curve.keyframe_points:
            point.interpolation = "BEZIER"
    return action


def export_trial(mesh_objects: list[bpy.types.Object], armature: bpy.types.Object) -> None:
    bpy.ops.object.select_all(action="DESELECT")
    for obj in [*mesh_objects, armature]:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = armature

    supported = set(bpy.ops.export_scene.gltf.get_rna_type().properties.keys())
    options = {
        "filepath": OUTPUT_GLB,
        "export_format": "GLB",
        "use_selection": True,
        "export_materials": "EXPORT",
        "export_animations": True,
        "export_animation_mode": "ACTIONS",
        "export_force_sampling": True,
        "export_def_bones": True,
        "export_skins": True,
        "export_optimize_animation_size": True,
        "export_frame_range": False,
    }
    bpy.ops.export_scene.gltf(**{key: value for key, value in options.items() if key in supported})


def render_verification(mesh_objects: list[bpy.types.Object], armature: bpy.types.Object) -> None:
    bpy.context.scene.frame_set(15)
    minimum, maximum = mesh_bounds(mesh_objects)
    center = (minimum + maximum) * 0.5
    size = maximum - minimum
    height = max(size.z, 0.1)

    world = bpy.data.worlds.new("TrialWorld")
    bpy.context.scene.world = world
    world.color = (0.025, 0.035, 0.055)

    ground_material = bpy.data.materials.new("TrialGround")
    ground_material.diffuse_color = (0.08, 0.10, 0.14, 1.0)
    ground_material.roughness = 0.88
    bpy.ops.mesh.primitive_plane_add(size=max(size.x, size.y, height) * 4.0, location=(center.x, center.y, minimum.z - 0.003))
    bpy.context.object.data.materials.append(ground_material)

    for location, energy, area_size in [
        ((center.x - height, center.y - height * 1.2, center.z + height * 1.4), 1200, height * 1.5),
        ((center.x + height, center.y - height * 0.2, center.z + height * 0.8), 700, height),
        ((center.x, center.y + height, center.z + height * 1.4), 900, height),
    ]:
        bpy.ops.object.light_add(type="AREA", location=location)
        light = bpy.context.object
        light.data.energy = energy
        light.data.shape = "DISK"
        light.data.size = area_size
        look_at(light, center)

    bpy.ops.object.camera_add(location=(center.x, center.y - height * 2.7, center.z + height * 0.08))
    camera = bpy.context.object
    camera.data.type = "ORTHO"
    camera.data.ortho_scale = height * 1.18
    look_at(camera, center)
    bpy.context.scene.camera = camera

    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE_NEXT"
    scene.render.resolution_x = 900
    scene.render.resolution_y = 900
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "PNG"
    scene.render.filepath = OUTPUT_PNG
    scene.view_settings.look = "AgX - Medium High Contrast"
    bpy.ops.render.render(write_still=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=INPUT_GLB)
imported_meshes = [obj for obj in bpy.context.scene.objects if obj.type == "MESH"]
armatures = [obj for obj in bpy.context.scene.objects if obj.type == "ARMATURE"]
skinned_meshes = [
    obj for obj in imported_meshes
    if (obj.parent and obj.parent.type == "ARMATURE") or any(modifier.type == "ARMATURE" for modifier in obj.modifiers)
]
if len(skinned_meshes) != 1 or len(armatures) != 1:
    mesh_summary = [(obj.name, len(obj.data.vertices), len(obj.data.polygons), obj.parent.name if obj.parent else None) for obj in imported_meshes]
    armature_summary = [(obj.name, len(obj.data.bones)) for obj in armatures]
    raise RuntimeError(f"Expected one skinned mesh and one armature, got meshes={mesh_summary} armatures={armature_summary}")

mesh_obj = skinned_meshes[0]
mesh_objects = [mesh_obj]
for helper_mesh in imported_meshes:
    if helper_mesh is not mesh_obj:
        helper_mesh.hide_render = True
armature = armatures[0]
existing_actions = list(bpy.data.actions)
if existing_actions:
    existing_actions[0].name = "Walk"

assign_trial_materials(mesh_obj)
before, after = decimate_skinned_mesh(mesh_obj)
conduct = create_conduct_action(armature)

Path(OUTPUT_GLB).parent.mkdir(parents=True, exist_ok=True)
Path(OUTPUT_PNG).parent.mkdir(parents=True, exist_ok=True)
export_trial(mesh_objects, armature)
armature.animation_data.action = conduct
render_verification(mesh_objects, armature)

print(f"TRIAL_INPUT_TRIANGLES={before}")
print(f"TRIAL_OUTPUT_TRIANGLES={after}")
print(f"TRIAL_ACTIONS={','.join(action.name for action in bpy.data.actions)}")
print(f"TRIAL_GLB={OUTPUT_GLB}")
print(f"TRIAL_PREVIEW={OUTPUT_PNG}")
