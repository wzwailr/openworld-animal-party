"""Fixed neutral face comparisons, without modifying the source scene."""
import bpy
from mathutils import Vector

def render_face(scene, output, label, resolution=384):
    review = bpy.data.scenes.new('Temporary neutral face comparison')
    review.render.engine = 'CYCLES'
    review.cycles.samples = 24
    review.cycles.use_denoising = True
    review.render.resolution_x = review.render.resolution_y = resolution
    review.render.resolution_percentage = 100
    review.render.image_settings.file_format = 'PNG'
    review.world = bpy.data.worlds.new('Neutral face world')
    review.world.use_nodes = True
    nodes = review.world.node_tree.nodes
    background = next((n for n in nodes if n.type == 'BACKGROUND'), None) or nodes.new('ShaderNodeBackground')
    world_out = next((n for n in nodes if n.type == 'OUTPUT_WORLD'), None) or nodes.new('ShaderNodeOutputWorld')
    review.world.node_tree.links.new(background.outputs[0], world_out.inputs['Surface'])
    background.inputs['Color'].default_value = (.65,.65,.65,1)
    background.inputs['Strength'].default_value = .6
    clay = bpy.data.materials.new('Neutral face clay')
    clay.use_nodes = True
    shader = next(n for n in clay.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (.56,.56,.56,1)
    shader.inputs['Roughness'].default_value = .78
    graph = bpy.context.evaluated_depsgraph_get()
    clones = []
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(graph))
        mesh.materials.clear(); mesh.materials.append(clay)
        clone = bpy.data.objects.new(obj.name, mesh)
        clone.matrix_world = obj.matrix_world.copy()
        review.collection.objects.link(clone)
        clones.append((clone, mesh))
    focus = Vector((0,-.025,.654))
    for name, position, energy in [('key',(-1.1,-1.5,1.7),70),('fill',(1.4,-.7,1.1),25)]:
        data = bpy.data.lights.new(name,'AREA'); data.energy=energy; data.size=1.5
        light = bpy.data.objects.new(name,data); review.collection.objects.link(light)
        light.location = position
        light.rotation_euler = (focus-light.location).to_track_quat('-Z','Y').to_euler()
    data = bpy.data.cameras.new('Fixed face camera'); data.type='ORTHO'; data.ortho_scale=.30
    camera = bpy.data.objects.new('Fixed face camera',data); review.collection.objects.link(camera)
    review.camera=camera
    for view, position in [('front',(0,-3,.654)),('left',(-3,-.025,.654)),('three-quarter',(-2,-3,.654))]:
        camera.location=position
        camera.rotation_euler=(focus-camera.location).to_track_quat('-Z','Y').to_euler()
        review.render.filepath=str(output/f'{label}-{view}.png')
        bpy.ops.render.render(write_still=True,scene=review.name)
    # Remove only temporary render copies from this in-memory review, never files.
    for obj, mesh in clones:
        bpy.data.objects.remove(obj,do_unlink=True)
        bpy.data.meshes.remove(mesh)
    bpy.data.scenes.remove(review)
