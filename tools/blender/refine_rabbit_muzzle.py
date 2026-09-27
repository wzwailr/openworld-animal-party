"""One local mouth/nose correction on preserved clean v5; no world replacement."""
import hashlib
import json
import math
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'tools/blender/out/rabbit-conductor-v5/rabbit-conductor-v5-clean-gray.blend'
OUT = ROOT / 'tools/blender/out/rabbit-conductor-v5-mouth-v3'
if OUT.exists() and any(OUT.iterdir()):
    raise RuntimeError('Use a new output directory; existing candidate is preserved')
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene = bpy.context.scene
head = next(o for o in scene.objects if o.type == 'MESH' and o.name.startswith('Head - continuous'))
nose = next(o for o in scene.objects if o.type == 'MESH' and o.name.startswith('Rounded triangular nose'))

def fingerprint(obj):
    return hashlib.sha256(repr(([tuple(v.co) for v in obj.data.vertices],
                                [tuple(p.vertices) for p in obj.data.polygons])).encode()).hexdigest()

untouched = {o.name: fingerprint(o) for o in scene.objects if o.type == 'MESH' and o not in (head, nose)}

def probe(obj):
    bm = bmesh.new()
    bm.from_mesh(obj.data)
    data = {'vertices': len(bm.verts), 'nonmanifold': sum(not e.is_manifold for e in bm.edges),
            'volume': abs(bm.calc_volume()),
            'bounds': [[min(v.co[i] for v in bm.verts), max(v.co[i] for v in bm.verts)] for i in range(3)]}
    bm.free()
    return data

def render_face(label):
    review = bpy.data.scenes.new('Temporary neutral face comparison')
    review.render.engine = 'CYCLES'
    review.cycles.samples = 24
    review.cycles.use_denoising = True
    review.render.resolution_x = review.render.resolution_y = 384
    review.render.resolution_percentage = 100
    review.render.image_settings.file_format = 'PNG'
    review.world = bpy.data.worlds.new('Neutral face world')
    review.world.use_nodes = True
    nodes = review.world.node_tree.nodes
    background = next((n for n in nodes if n.type == 'BACKGROUND'), None) or nodes.new('ShaderNodeBackground')
    output = next((n for n in nodes if n.type == 'OUTPUT_WORLD'), None) or nodes.new('ShaderNodeOutputWorld')
    review.world.node_tree.links.new(background.outputs[0], output.inputs['Surface'])
    background.inputs['Color'].default_value = (.65, .65, .65, 1)
    background.inputs['Strength'].default_value = .6
    clay = bpy.data.materials.new('Neutral face clay')
    clay.diffuse_color = (.56, .56, .56, 1)
    clay.use_nodes = True
    shader = next(n for n in clay.node_tree.nodes if n.type == 'BSDF_PRINCIPLED')
    shader.inputs['Base Color'].default_value = (.56,.56,.56,1)
    shader.inputs['Roughness'].default_value = .78
    graph = bpy.context.evaluated_depsgraph_get()
    for obj in scene.objects:
        if obj.type != 'MESH':
            continue
        mesh = bpy.data.meshes.new_from_object(obj.evaluated_get(graph))
        mesh.materials.clear()
        mesh.materials.append(clay)
        clone = bpy.data.objects.new(obj.name, mesh)
        clone.matrix_world = obj.matrix_world.copy()
        review.collection.objects.link(clone)
    focus = Vector((0, -.025, .654))
    for name, position, energy in [('key',(-1.1,-1.5,1.7),70),('fill',(1.4,-.7,1.1),25)]:
        data = bpy.data.lights.new(name, 'AREA')
        data.energy, data.size = energy, 1.5
        light = bpy.data.objects.new(name, data)
        review.collection.objects.link(light)
        light.location = position
        light.rotation_euler = (focus-light.location).to_track_quat('-Z','Y').to_euler()
    data = bpy.data.cameras.new('Fixed face camera')
    data.type, data.ortho_scale = 'ORTHO', .30
    camera = bpy.data.objects.new('Fixed face camera',data)
    review.collection.objects.link(camera)
    review.camera = camera
    for view, position in [('front',(0,-3,.654)),('left',(-3,-.025,.654)),('three-quarter',(-2,-3,.654))]:
        camera.location = position
        camera.rotation_euler = (focus-camera.location).to_track_quat('-Z','Y').to_euler()
        review.render.filepath = str(OUT / f'{label}-{view}.png')
        bpy.ops.render.render(write_still=True, scene=review.name)
    bpy.data.scenes.remove(review)

before = probe(head)
render_face('before')
tree = BVHTree.FromObject(head, bpy.context.evaluated_depsgraph_get())

def smooth_step(low, high, value):
    t = max(0, min(1, (value-low)/(high-low)))
    return t*t*(3-2*t)

def smooth_min(a, b, radius=.006):
    h = max(0, radius-abs(a-b))/radius
    return min(a,b)-h*h*radius*.25

def lobe_front(x,z,cx,cy,cz,rx,ry,rz):
    remaining = 1-((x-cx)/rx)**2-((z-cz)/rz)**2
    return cy-ry*math.sqrt(remaining) if remaining > 0 else 1

def target_front(x,z):
    # A rounded bilateral muzzle envelope, not an attached pair of spheres.
    # The separate lower lip returns forward below a short mouth cleft.
    y = .002-.088*math.sqrt(max(.01,1-(x/.131)**2))
    # Place every envelope centre behind the base face. If the centre itself
    # lies in front of that base, the hemisphere ends at a visible step rather
    # than meeting the cheek continuously (the rejected v1/v2 trial defect).
    for values in [(-.020,-.075,.626,.052,.073,.038),
                   (.020,-.075,.626,.052,.073,.038),
                   (0,-.070,.650,.026,.075,.026),
                   (0,-.080,.599,.035,.050,.016)]:
        y = smooth_min(y,lobe_front(x,z,*values))
    mouth_z = .608+.005*(abs(x)/.036)**1.6
    y += .0035*math.exp(-((z-mouth_z)/.0028)**2-(x/.036)**6)
    return y

changed = 0
for vertex in head.data.vertices:
    x,y,z = vertex.co
    weight = (1-smooth_step(.059,.082,abs(x))) * smooth_step(.578,.590,z) * (1-smooth_step(.666,.683,z))
    weight *= smooth_step(0,.075,-y)
    if weight <= 0:
        continue
    hit,_,_,_ = tree.ray_cast(Vector((x,-1,z)),Vector((0,1,0)))
    if hit is None:
        continue
    # Preserve the tiny existing incision depth, rather than collapsing its
    # vertices onto a shared analytic plane or using destructive Booleans.
    vertex.co.y += weight*(target_front(x,z)-hit.y)
    changed += 1
head.data.update()

# Smooth the locally displaced surface, including the old sub-millimetre mouth
# cut, with a continuous spatial falloff. A binary depth cutoff produced bands
# where one side of a triangle moved and its adjacent vertex was left behind.
adjacency = [[] for _ in head.data.vertices]
for edge in head.data.edges:
    a,b = edge.vertices
    adjacency[a].append(b)
    adjacency[b].append(a)
for _ in range(8):
    ys = [v.co.y for v in head.data.vertices]
    for vertex in head.data.vertices:
        x,y,z = vertex.co
        weight = (1-smooth_step(.055,.080,abs(x))) * smooth_step(.580,.593,z) * (1-smooth_step(.661,.683,z)) * smooth_step(0,.075,-y)
        neighbours = adjacency[vertex.index]
        if weight and neighbours:
            vertex.co.y += .35*weight*(sum(ys[i] for i in neighbours)/len(neighbours)-y)
head.data.update()

# Replace the deep triangular extrusion with a small rounded triangular button.
# The top is broader than the lower tip, with a curved front and buried back.
verts, faces = [], []
latitudes, longitudes = 24, 48
verts.append((0,-.147,.656))
for j in range(1,latitudes):
    theta = math.pi*j/latitudes
    for k in range(longitudes):
        phi = 2*math.pi*k/longitudes
        width = .0145*math.sin(theta)*(1+.28*math.cos(theta))
        verts.append((width*math.cos(phi),-.147+.0065*math.sin(theta)*math.sin(phi),.646+.010*math.cos(theta)))
bottom = len(verts)
verts.append((0,-.147,.636))
for k in range(longitudes):
    a,b = 1+k,1+(k+1)%longitudes
    faces.append((0,b,a))
    for j in range(latitudes-2):
        a,b = 1+j*longitudes+k,1+j*longitudes+(k+1)%longitudes
        faces.append((a,b,b+longitudes,a+longitudes))
    a,b = 1+(latitudes-2)*longitudes+k,1+(latitudes-2)*longitudes+(k+1)%longitudes
    faces.append((a,b,bottom))
mesh = bpy.data.meshes.new('Short rounded nasal button')
mesh.from_pydata(verts,[],faces)
mesh.update()
for material in nose.data.materials:
    mesh.materials.append(material)
nose.modifiers.clear()
nose.data = mesh
bm = bmesh.new(); bm.from_mesh(mesh)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
bm.to_mesh(mesh); bm.free()
for polygon in mesh.polygons:
    polygon.use_smooth = True
after = probe(head)
assert after['nonmanifold'] == before['nonmanifold'] == 0
assert .96 < after['volume']/before['volume'] < 1.06
assert after['bounds'][2] == before['bounds'][2]
assert untouched == {o.name:fingerprint(o) for o in scene.objects if o.type=='MESH' and o not in (head,nose)}
assert probe(nose)['nonmanifold'] == 0
report = {'source':str(SOURCE),'changed_head_vertices':changed,'before_head':before,'after_head':after,
          'nose':probe(nose),'untouched_meshes':len(untouched),'visual_acceptance':'pending'}
(OUT/'muzzle-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'rabbit-conductor-v5-mouth-gray.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj.type == 'MESH':
        obj.select_set(True)
bpy.context.view_layer.objects.active = head
bpy.ops.export_scene.gltf(filepath=str(OUT/'rabbit-conductor-v5-mouth-gray.glb'),export_format='GLB',
    use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
render_face('after')
print('MUZZLE_CANDIDATE '+json.dumps(report))
