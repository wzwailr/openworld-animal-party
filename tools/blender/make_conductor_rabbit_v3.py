"""Independent, locally modeled rabbit conductor candidate; Blender 4.5.

Run: blender -b --python tools/blender/make_conductor_rabbit_v3.py --python-exit-code 1
Native Blender axes: Z up, -Y forward. glTF exporter gives Y up, +Z forward.
No external assets/services. Textures are deterministically painted into images.
"""
import bpy
import math
import random
import os
import json
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/blender/out/rabbit-conductor-v3'
OUT.mkdir(parents=True, exist_ok=True)
GLB = ROOT / 'public/models/animals/rabbit-conductor-v3.glb'
GLB.parent.mkdir(parents=True, exist_ok=True)
random.seed(418)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
scene = bpy.context.scene
scene.render.fps = 30
ASSET = []


def image(name, pixels, colorspace='sRGB'):
    h, w, _ = pixels.shape
    img = bpy.data.images.new(name, width=w, height=h, alpha=True)
    img.colorspace_settings.name = colorspace
    img.pixels.foreach_set(np.asarray(pixels, dtype=np.float32).ravel())
    img.filepath_raw = str(OUT / (name + '.png'))
    img.file_format = 'PNG'
    img.save()
    img.pack()
    return img


def painted_material(name, rgb, kind):
    n = 1024
    rng = np.random.default_rng(418 if kind == 'fur' else 533)
    yy, xx = np.mgrid[0:n, 0:n]
    noise = rng.normal(0, 0.015, (n, n))
    height = np.full((n, n), 0.5) + noise
    if kind == 'fur':
        # Thousands of individually drawn tapered hairs, gently curved downward.
        for _ in range(19500):
            x, y = rng.integers(0, n, 2)
            length = rng.integers(12, 44)
            t = np.arange(length)
            dx = np.round(np.sin(t / length * 2.3) * rng.uniform(-4, 4)).astype(int)
            strength = rng.uniform(-0.19, 0.21) * np.sin(np.pi * (t + 1) / (length + 1))
            for width in (-1, 0, 1):
                height[(y + t) % n, (x + dx + width) % n] += strength * (1 if width == 0 else .36)
        shade = height - .5
        shade += .025 * np.sin(xx * .02 + np.sin(yy * .007))
        roughness = .89
    else:
        # Fine woven wool plus a deliberately quiet repeating scroll damask.
        height += .021 * np.sin(xx * math.pi / 2) + .021 * np.sin(yy * math.pi / 2)
        for cx in range(0, n, 128):
            for cy in range(0, n, 128):
                for sign in (-1, 1):
                    ts = np.linspace(0, 2.8 * math.pi, 400)
                    radii = np.linspace(3, 37, 400)
                    xs = (cx + 64 + sign * radii * np.sin(ts)).astype(int) % n
                    ys = (cy + 64 + radii * np.cos(ts)).astype(int) % n
                    for shift in (-1, 0, 1):
                        height[ys, (xs + shift) % n] += .20
        shade = (height - .5) * .8
        roughness = .75
    colors = np.ones((n, n, 4), dtype=np.float32)
    for c in range(3):
        colors[:, :, c] = np.clip(rgb[c] * (1 + shade), 0, 1)
    dy, dx = np.gradient(height)
    normals = np.ones((n, n, 4), dtype=np.float32)
    normal = np.stack([-dx * 2.2, -dy * 2.2, np.ones_like(dx)], axis=-1)
    normal /= np.linalg.norm(normal, axis=-1, keepdims=True)
    normals[:, :, :3] = normal * .5 + .5
    mat = material(name, rgb, roughness)
    nodes = mat.node_tree.nodes
    links = mat.node_tree.links
    color = nodes.new('ShaderNodeTexImage')
    color.image = image(name + '-albedo', colors)
    shader = next(n for n in nodes if n.type == 'BSDF_PRINCIPLED')
    links.new(color.outputs['Color'], shader.inputs['Base Color'])
    tex = nodes.new('ShaderNodeTexImage')
    tex.image = image(name + '-normal', normals, 'Non-Color')
    normalmap = nodes.new('ShaderNodeNormalMap')
    normalmap.inputs['Strength'].default_value = .55
    links.new(tex.outputs['Color'], normalmap.inputs['Color'])
    links.new(normalmap.outputs['Normal'], shader.inputs['Normal'])
    return mat


def material(name, rgb, roughness=.6, metallic=0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if shader is None:
        shader = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        output = next((n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if output is None:
            output = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
        mat.node_tree.links.new(shader.outputs['BSDF'], output.inputs['Surface'])
    shader.inputs['Base Color'].default_value = (*rgb, 1)
    shader.inputs['Roughness'].default_value = roughness
    shader.inputs['Metallic'].default_value = metallic
    return mat


FUR = painted_material('Cream directional fur', (.78, .64, .45), 'fur')
BLUE = painted_material('Midnight blue woven damask', (.025, .105, .20), 'cloth')
CREAM = painted_material('Ivory brocade waistcoat', (.77, .66, .46), 'cloth')
PALE = material('Muzzle cream', (.84, .73, .54), .88)
PINK = painted_material('Peach velvet inner ears', (.66, .29, .17), 'fur')
GOLD = material('Antique gold braid', (.70, .40, .095), .3, .72)
DARK = material('Warm chocolate eyes', (.033, .018, .009), .23)
PUPIL = material('Deep pupils', (.003, .002, .001), .20)
IRIS = material('Amber iris rim', (.095, .037, .008), .28)
NOSE = material('Warm rose nose', (.62, .26, .17), .54)
MOUTH = material('Soft mouth and paw creases', (.17, .065, .026), .87)
ORANGE = painted_material('Burnt orange silk bow', (.52, .115, .018), 'cloth')
WOOD = material('Polished maple baton', (.43, .22, .065), .48)
WHITE = material('Eye catchlight', (.92, .87, .70), .16)


def mesh(name, verts, faces, mat, bone=None, uv=None):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    if mat:
        data.materials.append(mat)
    for face in data.polygons:
        face.use_smooth = True
    if uv is not None:
        layer = data.uv_layers.new(name='UVMap')
        for poly in data.polygons:
            for i in poly.loop_indices:
                layer.data[i].uv = uv[data.loops[i].vertex_index]
    if bone:
        obj['rig_bone'] = bone
    ASSET.append(obj)
    return obj


def sphere(name, loc, scale, mat, bone=None, seg=24, rings=16, rot=None):
    bpy.ops.mesh.primitive_uv_sphere_add(segments=seg, ring_count=rings, location=loc)
    obj = bpy.context.object
    obj.name = name
    obj.scale = scale
    if rot:
        obj.rotation_euler = rot
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    obj.data.materials.append(mat)
    for p in obj.data.polygons:
        p.use_smooth = True
    if bone:
        obj['rig_bone'] = bone
    ASSET.append(obj)
    return obj


def fuse(name, components, mat, bone, voxel=.009):
    bpy.ops.object.select_all(action='DESELECT')
    for part in components:
        part.select_set(True)
        ASSET.remove(part)
    bpy.context.view_layer.objects.active = components[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    mod = obj.modifiers.new('Organic fused sculpt', 'REMESH')
    mod.mode = 'VOXEL'
    mod.voxel_size = voxel
    bpy.ops.object.modifier_apply(modifier=mod.name)
    smooth = obj.modifiers.new('Soft sculpt transitions', 'SMOOTH')
    smooth.factor = .7
    smooth.iterations = 4
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    dec = obj.modifiers.new('Candidate topology budget', 'DECIMATE')
    dec.ratio = .42
    bpy.ops.object.modifier_apply(modifier=dec.name)
    obj.data.materials.clear()
    obj.data.materials.append(mat)
    obj['rig_bone'] = bone
    # Spherical mapping with local seam correction.
    layer = obj.data.uv_layers.new(name='UVMap')
    bounds = [v.co for v in obj.data.vertices]
    bottom = min(v.z for v in bounds)
    height = max(v.z for v in bounds) - bottom
    for poly in obj.data.polygons:
        uvs = []
        for index in poly.loop_indices:
            co = obj.data.vertices[obj.data.loops[index].vertex_index].co
            uvs.append([.5 + math.atan2(co.y, co.x) / (2 * math.pi), (co.z - bottom) / height])
        if max(uv[0] for uv in uvs) - min(uv[0] for uv in uvs) > .5:
            for uv in uvs:
                if uv[0] < .5:
                    uv[0] += 1
        for index, uv in zip(poly.loop_indices, uvs):
            layer.data[index].uv = uv
        poly.use_smooth = True
    ASSET.append(obj)
    return obj


def tube(name, points, radius, mat, bone, sides=6):
    # Low polygon, smooth tubing used for piping, embroidery, creases and whiskers.
    pts = [Vector(p) for p in points]
    verts, faces = [], []
    for i, p in enumerate(pts):
        direction = pts[min(i + 1, len(pts) - 1)] - pts[max(0, i - 1)]
        direction.normalize()
        right = direction.cross(Vector((0, 1, 0)))
        if right.length < .01:
            right = direction.cross(Vector((1, 0, 0)))
        right.normalize()
        up = direction.cross(right).normalized()
        r = radius[i] if isinstance(radius, list) else radius
        for k in range(sides):
            a = k * 2 * math.pi / sides
            verts.append(tuple(p + r * (right * math.cos(a) + up * math.sin(a))))
        if i:
            for k in range(sides):
                a = (i - 1) * sides + k
                b = (i - 1) * sides + (k + 1) % sides
                faces.append((a, b, b + sides, a + sides))
    faces.extend([tuple(reversed(range(sides))), tuple(range(len(verts) - sides, len(verts)))])
    return mesh(name, verts, faces, mat, bone)


def fur_tufts(obj, count, length=.012):
    # Sparse silky silhouette tufts; real tapered geometry, no hair simulation.
    obj.data.calc_loop_triangles()
    tris = list(obj.data.loop_triangles)
    area = [t.area for t in tris]
    choices = random.choices(tris, weights=area, k=count)
    verts, faces, uvs = [], [], []
    for triangle in choices:
        vs = [obj.matrix_world @ obj.data.vertices[index].co for index in triangle.vertices]
        a, b = random.random(), random.random()
        if a + b > 1:
            a, b = 1 - a, 1 - b
        point = vs[0] + a * (vs[1] - vs[0]) + b * (vs[2] - vs[0])
        # Hidden body fur should not pierce through the layered waistcoat.
        if obj.name == 'Pear shaped furry body' and point.z > .435:
            continue
        normal = (vs[1] - vs[0]).cross(vs[2] - vs[0]).normalized()
        down = Vector((0, 0, -.8))
        tangent = (down - normal * down.dot(normal)).normalized()
        if tangent.length < .1:
            tangent = Vector((1, 0, 0))
        side = tangent.cross(normal).normalized()
        le = length * random.uniform(.55, 1.15)
        width = le * .065
        base = len(verts)
        verts.extend([tuple(point - side * width), tuple(point + side * width),
                      tuple(point + tangent * le * .48 + normal * le * .38 - side * width * .60),
                      tuple(point + tangent * le * .48 + normal * le * .38 + side * width * .60),
                      tuple(point + tangent * le + normal * le * .29)])
        faces.extend([(base, base + 1, base + 3, base + 2), (base + 2, base + 3, base + 4)])
        offset = random.random()
        uvs.extend([(offset, 0), (offset + .003, 0), (offset, .02), (offset + .003, .02), (offset, .04)])
    return mesh(obj.name + ' fine fur silhouette', verts, faces, FUR, obj['rig_bone'], uvs)


# Rabbit proportions: generous rump and cheeks, short legs, large head, long ears.
body = fuse('Pear shaped furry body', [
    sphere('rump', (0, .012, .355), (.216, .165, .267), FUR),
    sphere('belly', (0, -.003, .56), (.204, .156, .252), FUR),
    sphere('chest', (0, .004, .77), (.162, .117, .156), FUR),
], FUR, 'Torso', .011)
fur_tufts(body, 1300, .015)
head = fuse('Organic broad cheeked head', [
    sphere('cranium', (0, -.005, 1.039), (.202, .161, .191), FUR),
    sphere('left cheek', (-.11, -.052, .964), (.120, .130, .105), FUR),
    sphere('right cheek', (.11, -.052, .964), (.120, .130, .105), FUR),
    sphere('chin', (0, -.061, .914), (.140, .112, .069), FUR),
], FUR, 'Head', .0085)
fur_tufts(head, 1400, .012)

for sign, suffix in [(-1, 'L'), (1, 'R')]:
    foot = fuse('Hind paw.' + suffix, [
        sphere('hock', (sign * .119, .020, .124), (.079, .080, .117), FUR),
        sphere('foot', (sign * .123, -.049, .055), (.086, .129, .055), FUR),
    ], FUR, 'Foot.' + suffix, .008)
    fur_tufts(foot, 140, .008)
    for d in (-1, 0, 1):
        tube('Paw toe crease.' + suffix, [(sign * .123 + d * .031, -.168, .036),
             (sign * .123 + d * .030, -.160, .059), (sign * .123 + d * .027, -.137, .072)],
             .0016, MOUTH, 'Foot.' + suffix, 5)

tail = sphere('Visible round cottontail', (0, .192, .329), (.080, .086, .085), FUR, 'Torso')
fur_tufts(tail, 300, .014)


def ear(suffix, base, direction, length):
    base, direction = Vector(base), Vector(direction).normalized()
    sideways = Vector((1, 0, 0))
    forward = Vector((0, -1, 0))
    verts, faces, uv = [], [], []
    levels, segments = 30, 24
    for j in range(levels + 1):
        t = j / levels
        center = base + direction * length * t + Vector((0, .022 * t * t, 0))
        radius = .055 * math.sin(math.pi * (.035 + .965 * t)) ** .68
        radius = max(.0005, radius)
        for k in range(segments):
            a = 2 * math.pi * k / segments
            verts.append(tuple(center + sideways * radius * math.cos(a) + forward * radius * .52 * math.sin(a)))
            uv.append((k / segments, t))
            if j and k < segments:
                p = (j - 1) * segments + k
                q = (j - 1) * segments + (k + 1) % segments
                faces.append((p, q, q + segments, p + segments))
    obj = mesh('Long asymmetric ear.' + suffix, verts, faces, FUR, 'Ear.' + suffix, uv)
    fur_tufts(obj, 270, .010)
    # Inner shell conforms to the front ellipse, inset from a thick cream rim.
    vs, fs, tex = [], [], []
    for j in range(25):
        t = .14 + .75 * j / 24
        center = base + direction * length * t + Vector((0, .022 * t * t, 0))
        r = .055 * math.sin(math.pi * (.035 + .94 * t)) ** .68
        width = r * .66 * math.sin(math.pi * (j / 24)) ** .35
        for k in range(9):
            s = (k / 8 * 2 - 1)
            vs.append(tuple(center + sideways * width * s + forward * (r * .52 * math.sqrt(max(.1, 1 - (width * s / r) ** 2)) + .0018)))
            tex.append((k / 8, j / 24))
            if j and k:
                p = (j - 1) * 9 + k - 1
                fs.append((p, p + 1, p + 10, p + 9))
    mesh('Inset peach ear velvet.' + suffix, vs, fs, PINK, 'Ear.' + suffix, tex)


ear('L', (-.106, .003, 1.174), (-.36, .02, .94), .352)
ear('R', (.097, .012, 1.177), (.08, .04, 1), .397)

# Muzzle pads grow out of the cheeks; small triangular nose and curved smile.
for s in (-1, 1):
    muzzle = sphere('Soft muzzle pad', (s * .045, -.194, .977), (.065, .054, .043), FUR, 'Head')
    fur_tufts(muzzle, 120, .004)
    sphere('Velvet dark eye', (s * .092, -.143, 1.066), (.043, .017, .050), DARK, 'Head')
    sphere('Amber eye iris', (s * .092, -.157, 1.066), (.027, .005, .032), IRIS, 'Head', 24, 16)
    sphere('Expressive pupil', (s * .092, -.163, 1.066), (.021, .003, .026), PUPIL, 'Head', 24, 16)
    sphere('Soft eye glint', (s * .092 - .009, -.167, 1.080), (.0045, .0015, .0055), WHITE, 'Head', 16, 10)
    tube('Upper eyelid', [(s * .092 + .044 * math.cos(a), -.158 - .014 * math.sin(a), 1.067 + .050 * math.sin(a))
         for a in np.linspace(.08, math.pi - .08, 15)], .0033, FUR, 'Head')
    tube('Happy muzzle line', [(s * .003, -.233, .959), (s * .018, -.235, .950), (s * .035, -.224, .951)],
         .0020, MOUTH, 'Head')
    # Round fine glasses kept below the brow with thin temples.
    tube('Round gold spectacle.' + str(s), [(s * .101 + .060 * math.cos(a), -.211, 1.045 + .060 * math.sin(a))
         for a in np.linspace(0, 2 * math.pi, 65)], .0026, GOLD, 'Head', 8)
    tube('Spectacle temple.' + str(s), [(s * .163, -.208, 1.057), (s * .197, -.105, 1.049),
         (s * .195, -.004, 1.035)], .0022, GOLD, 'Head')
    for i in range(3):
        tube('Fine ivory whisker', [(s * .083, -.222, .980 - i * .011),
             (s * .166, -.240, .980 - i * .015), (s * .257, -.218, .995 - i * .025)],
             [.0008, .00065, .00015], PALE, 'Head', 5)

tube('Spectacle curved bridge', [(-.039, -.211, 1.053), (-.02, -.237, 1.065),
     (0, -.244, 1.071), (.02, -.237, 1.065), (.039, -.211, 1.053)], .0026, GOLD, 'Head')
nose = mesh('Rounded triangular pink nose', [(-.023, -.239, 1.001), (.023, -.239, 1.001),
    (0, -.245, .978), (0, -.258, .993)], [(0, 1, 3), (1, 2, 3), (2, 0, 3), (0, 2, 1)], NOSE, 'Head')
bevel = nose.modifiers.new('Soft nose edges', 'BEVEL')
bevel.width = .007
bevel.segments = 3
bpy.context.view_layer.objects.active = nose
bpy.ops.object.modifier_apply(modifier=bevel.name)
tube('Philtrum', [(0, -.244, .980), (0, -.237, .958)], .0018, MOUTH, 'Head')


def radii(z):
    return (float(np.interp(z, [.25, .46, .61, .78, .90], [.224, .244, .231, .192, .141])),
            float(np.interp(z, [.25, .46, .61, .78, .90], [.187, .201, .185, .148, .117])))


def coat_point(phi, t, offset=0):
    # Split tailcoat hem: front waist, low outer tail, high central tail opening.
    hem = float(np.interp(phi, [.31, 1.25, 2.50, math.pi - .004], [.455, .435, .24, .43]))
    z = .892 * (1 - t) + hem * t
    rx, ry = radii(z)
    return Vector(((rx + offset) * math.sin(phi), -(ry + offset) * math.cos(phi), z))


for sign, suffix in [(-1, 'L'), (1, 'R')]:
    verts, faces, uv = [], [], []
    for j in range(24):
        for k in range(41):
            phi = .31 + (math.pi - .004 - .31) * k / 40
            pt = coat_point(phi, j / 23)
            pt.x *= sign
            verts.append(tuple(pt))
            uv.append((k / 40, 1 - j / 23))
            if j and k:
                p = (j - 1) * 41 + k - 1
                faces.append((p, p + 1, p + 42, p + 41) if sign > 0 else (p + 41, p + 42, p + 1, p))
    obj = mesh('Tailored split tailcoat.' + suffix, verts, faces, BLUE, 'Torso', uv)
    sol = obj.modifiers.new('Cloth thickness', 'SOLIDIFY')
    sol.thickness = .004
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.modifier_apply(modifier=sol.name)
    paths = [ [coat_point(.31, t, .003) for t in np.linspace(0, 1, 24)],
              [coat_point(phi, 1, .003) for phi in np.linspace(.31, math.pi - .004, 48)],
              [coat_point(math.pi - .004, t, .003) for t in np.linspace(0, 1, 24)],
              [coat_point(phi, 0, .003) for phi in np.linspace(.31, math.pi - .004, 32)]]
    for path in paths:
        tube('Gold tailored coat edging.' + suffix, [(sign * p.x, p.y, p.z) for p in path], .0028, GOLD, 'Torso')
    # Lapel folded away from the ivory shirt; an irregular tapered fabric panel.
    points = [(sign * .052, -.107, .904), (sign * .131, -.132, .843),
              (sign * .095, -.187, .756), (sign * .060, -.158, .823)]
    lapel = mesh('Folded blue lapel.' + suffix, points, [(0, 1, 2, 3)], BLUE, 'Torso', [(0, 1), (1, 1), (1, 0), (0, 0)])
    sol = lapel.modifiers.new('Lapel fabric thickness', 'SOLIDIFY')
    sol.thickness = .006
    bpy.context.view_layer.objects.active = lapel
    bpy.ops.object.modifier_apply(modifier=sol.name)
    tube('Lapel gold stitching.' + suffix, points + [points[0]], .0021, GOLD, 'Torso')

# Ivory waistcoat panel, round belly curvature visible between blue fronts.
verts, faces, uv = [], [], []
for j in range(25):
    t = j / 24
    z = .882 - .421 * t
    width = .063 + .021 * t
    if t > .88:
        width *= 1 - .34 * (t - .88) / .12
    _, ry = radii(z)
    for k in range(13):
        s = k / 12 * 2 - 1
        verts.append((s * width, -ry - .003 + .023 * s * s, z + .014 * abs(s) * t ** 6))
        uv.append((k / 12, 1 - t))
        if j and k:
            p = (j - 1) * 13 + k - 1
            faces.append((p, p + 1, p + 14, p + 13))
mesh('Cream brocade waistcoat front', verts, faces, CREAM, 'Torso', uv)
for j, z in enumerate([.77, .703, .635, .566, .499]):
    _, ry = radii(z)
    sphere('Waistcoat antique brass button', (0, -ry - .009, z), (.007, .004, .007), GOLD, 'Torso', 16, 10)
    for sign in (-1, 1):
        sphere('Coat double row button', (sign * (.088 + .014 * j), -ry + .012, z), (.008, .005, .008), GOLD, 'Torso', 16, 10)

# Orange silk bow with pinched center and non-spherical folded wings.
for sign in (-1, 1):
    verts, faces, uv = [], [], []
    for j in range(9):
        t = j / 8
        for k in range(9):
            s = k / 8 * 2 - 1
            x = sign * (.016 + .074 * t)
            z = .857 + s * (.014 + .034 * t) + .004 * math.sin(t * math.pi)
            y = -.157 - .016 * math.sin(t * math.pi) + .008 * math.cos(s * math.pi * 2) * t
            verts.append((x, y, z))
            uv.append((t, k / 8))
            if j and k:
                p = (j - 1) * 9 + k - 1
                faces.append((p, p + 1, p + 10, p + 9))
    wing = mesh('Folded burnt orange silk bow wing', verts, faces, ORANGE, 'Torso', uv)
    sol = wing.modifiers.new('Silk folded thickness', 'SOLIDIFY')
    sol.thickness = .006
    bpy.context.view_layer.objects.active = wing
    bpy.ops.object.modifier_apply(modifier=sol.name)
sphere('Silk bow knot', (0, -.177, .857), (.020, .017, .023), ORANGE, 'Torso', 24, 14)


ARMS = {
    'L': [Vector((-.166, 0, .820)), Vector((-.276, -.057, .676)), Vector((-.251, -.199, .739))],
    'R': [Vector((.166, 0, .820)), Vector((.292, -.043, .872)), Vector((.330, -.157, 1.019))],
}


def sleeve(suffix):
    shoulder, elbow, wrist = ARMS[suffix]
    points = []
    for t in np.linspace(0, 1, 25):
        # Quadratic Bezier passes through the elbow area with tailored fullness.
        if t < .5:
            p = shoulder.lerp(elbow, t * 2)
        else:
            p = elbow.lerp(wrist, (t - .5) * 2)
        points.append(p)
    verts, faces, uv = [], [], []
    for j, p in enumerate(points):
        t = j / 24
        direction = points[min(j + 1, 24)] - points[max(j - 1, 0)]
        direction.normalize()
        right = direction.cross(Vector((0, 1, 0))).normalized()
        up = direction.cross(right).normalized()
        radius = .074 * (1 - t) + .043 * t + .006 * math.sin(t * math.pi)
        # Subtle cloth fullness/creases, not uniformly tubular arms.
        radius += .002 * math.sin(t * 6 * math.pi) * math.sin(t * math.pi)
        for k in range(28):
            a = k / 28 * 2 * math.pi
            verts.append(tuple(p + radius * (right * math.cos(a) + up * math.sin(a))))
            uv.append((k / 28, t))
            if j:
                a = (j - 1) * 28 + k
                b = (j - 1) * 28 + (k + 1) % 28
                faces.append((a, b, b + 28, a + 28))
    obj = mesh('Sculpted tailored sleeve.' + suffix, verts, faces, BLUE, None, uv)
    obj['arm_side'] = suffix
    direction = (wrist - elbow).normalized()
    right = direction.cross(Vector((0, 1, 0))).normalized()
    up = direction.cross(right).normalized()
    for distance, radius in [(-.012, .045), (.002, .044)]:
        tube('Gold edged conductor cuff.' + suffix,
             [tuple(wrist + direction * distance + radius * (right * math.cos(a) + up * math.sin(a)))
              for a in np.linspace(0, 2 * math.pi, 33)], .0025, GOLD, 'Forearm.' + suffix)
    center = wrist + direction * .032
    sphere('Continuous furry inner wrist.' + suffix, wrist - direction * .005,
           (.040, .040, .043), FUR, 'Wrist.' + suffix)
    parts = [sphere('Paw palm', center, (.043, .037, .050), FUR)]
    # Small flexed fingers on the front face form an animal paw gripping air/baton.
    for i in range(4):
        finger = center + Vector(((i - 1.5) * .015, -.025, .015 - abs(i - 1.5) * .007))
        parts.append(sphere('Curled paw digit', finger, (.012, .019, .024), FUR, seg=20, rings=12))
    parts.append(sphere('Opposing paw thumb', center + Vector((-.033 if suffix == 'R' else .033, -.014, -.006)),
                        (.020, .023, .026), FUR, seg=20, rings=12))
    paw = fuse('Soft gripping forepaw.' + suffix, parts, FUR, 'Wrist.' + suffix, .005)
    fur_tufts(paw, 140, .005)
    for i in range(3):
        x = center.x + (i - 1) * .015
        tube('Curled finger separation.' + suffix, [(x, center.y - .042, center.z + .025),
             (x, center.y - .044, center.z + .006)], .0010, MOUTH, 'Wrist.' + suffix, 5)
    # Shoulder board with gold loop braid and fringe, following upper arm.
    ep = sphere('Blue shoulder epaulette.' + suffix, shoulder + Vector((0, 0, .04)), (.078, .060, .018), BLUE, 'UpperArm.' + suffix)
    tube('Epaulette gold braid.' + suffix, [tuple(shoulder + Vector((.070 * math.cos(a), .051 * math.sin(a), .049)))
         for a in np.linspace(0, 2 * math.pi, 41)], .0032, GOLD, 'UpperArm.' + suffix)
    for angle in np.linspace(0, math.pi, 9):
        p = shoulder + Vector((.074 * math.cos(angle), .054 * math.sin(angle), .04))
        tube('Epaulette fringe.' + suffix, [p, p - Vector((0, 0, .025))], .0018, GOLD, 'UpperArm.' + suffix, 5)
    return center


left_paw = sleeve('L')
right_paw = sleeve('R')
baton_start = right_paw + Vector((-.014, -.023, -.012))
baton_end = baton_start + Vector((.057, -.004, .355))
tube('Baton rigid maple wand', [baton_start, baton_start.lerp(baton_end, .16), baton_end], [.0045, .0032, .0015], WOOD, 'Wrist.R', 12)
tube('Baton gold grip', [baton_start, baton_start + (baton_end - baton_start) * .12], .0050, GOLD, 'Wrist.R', 12)


def leaf_spray(name, origin, sign=1, back=False, size=1):
    # Hand-laid gold stems and almond-shaped leaves embroidered above the cloth.
    x, y, z = origin
    def on_cloth(point):
        rx, ry = radii(point[2])
        depth = ry * math.sqrt(max(.05, 1 - (point[0] / rx) ** 2)) + .005
        return (point[0], depth if back else -depth, point[2])
    stem = [on_cloth((x + sign * .019 * size * t, y, z + .081 * size * t)) for t in np.linspace(0, 1, 16)]
    tube(name + ' stem', stem, .0015 * size, GOLD, 'Torso', 6)
    for i in range(5):
        t = .14 + i * .16
        p = Vector((x + sign * .019 * size * t, y, z + .081 * size * t))
        for side in (-1, 1):
            pts = []
            for a in np.linspace(0, 2 * math.pi, 13):
                dx = side * .012 * (1 - math.cos(a))
                dz = .018 * (1 - math.cos(a)) + .006 * math.sin(a)
                pts.append(on_cloth(p + Vector((sign * dx * size, 0, dz * size))))
            tube(name + ' leaf', pts, .00115 * size, GOLD, 'Torso', 5)


for s in (-1, 1):
    leaf_spray('Gold front botanical embroidery', (s * .142, -.152, .491), s, size=.69)
    leaf_spray('Gold lapel botanical embroidery', (s * .132, -.123, .750), -s, size=.45)
    leaf_spray('Back tail botanical embroidery', (s * .120, .165, .337), -s, back=True, size=.85)
    leaf_spray('Back shoulder botanical embroidery', (s * .086, .135, .752), s, back=True, size=.67)
    # Pocket welt with double gold stitches.
    tube('Pocket welt', [(s * .140, -.159, .565), (s * .190, -.119, .576)], .005, BLUE, 'Torso')
    tube('Pocket gold stitch', [(s * .140, -.165, .566), (s * .190, -.125, .577)], .0019, GOLD, 'Torso')

# Named articulated armature. Meshes are bound in world rest coordinates.
arm_data = bpy.data.armatures.new('Rabbit conductor skeleton')
rig = bpy.data.objects.new('RabbitConductorV3', arm_data)
bpy.context.collection.objects.link(rig)
ASSET.append(rig)
bpy.context.view_layer.objects.active = rig
rig.select_set(True)
bpy.ops.object.mode_set(mode='EDIT')


def bone(name, start, end, parent=None):
    b = arm_data.edit_bones.new(name)
    b.head, b.tail = start, end
    if parent:
        b.parent = arm_data.edit_bones[parent]
    return b


bone('Root', (0, 0, 0), (0, 0, .13))
bone('Torso', (0, 0, .33), (0, 0, .85), 'Root')
bone('Head', (0, 0, .85), (0, 0, 1.13), 'Torso')
bone('Ear.L', (-.106, .003, 1.174), (-.23, .01, 1.49), 'Head')
bone('Ear.R', (.097, .012, 1.177), (.13, .02, 1.55), 'Head')
for suffix, sign in [('L', -1), ('R', 1)]:
    bone('Foot.' + suffix, (sign * .12, .02, .10), (sign * .12, -.12, .035), 'Root')
    shoulder, elbow, wrist = ARMS[suffix]
    bone('UpperArm.' + suffix, shoulder, elbow, 'Torso')
    bone('Forearm.' + suffix, elbow, wrist, 'UpperArm.' + suffix)
    bone('Wrist.' + suffix, wrist, wrist + (wrist - elbow).normalized() * .065, 'Forearm.' + suffix)
bpy.ops.object.mode_set(mode='OBJECT')
for obj in ASSET:
    if obj.type != 'MESH':
        continue
    # Bake transform without changing rest geometry; glTF uses stable inverse binds.
    bpy.ops.object.select_all(action='DESELECT')
    obj.select_set(True)
    bpy.context.view_layer.objects.active = obj
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if 'arm_side' in obj:
        suffix = obj['arm_side']
        groups = [obj.vertex_groups.new(name=name + '.' + suffix) for name in ['UpperArm', 'Forearm']]
        for v in obj.data.vertices:
            t = (v.index // 28) / 24
            w = max(0, min(1, (t - .37) / .26))
            if w < 1:
                groups[0].add([v.index], 1 - w, 'REPLACE')
            if w > 0:
                groups[1].add([v.index], w, 'REPLACE')
    else:
        group = obj.vertex_groups.new(name=obj['rig_bone'])
        group.add(list(range(len(obj.data.vertices))), 1, 'REPLACE')
    mod = obj.modifiers.new('Conductor articulated skin', 'ARMATURE')
    mod.object = rig
    obj.parent = rig

# Merge skin parts by material to keep the candidate usable in a real-time world.
# The baton remains a separate, single-joint weighted rigid object.
buckets = {}
for obj in list(ASSET):
    if obj.type == 'MESH' and not obj.name.startswith('Baton'):
        buckets.setdefault(obj.data.materials[0].name, []).append(obj)
for mat_name, objects in buckets.items():
    if len(objects) < 2:
        continue
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
        ASSET.remove(obj)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    merged = bpy.context.object
    merged.name = 'Rabbit skin - ' + mat_name
    ASSET.append(merged)

rig.animation_data_create()
for action_name, duration in [('Idle', 120), ('Conduct', 90)]:
    action = bpy.data.actions.new(action_name)
    rig.animation_data.action = action
    for p in rig.pose.bones:
        p.rotation_mode = 'XYZ'
    for frame in range(1, duration + 2, 3):
        phase = 2 * math.pi * (frame - 1) / duration
        for p in rig.pose.bones:
            p.rotation_euler = (0, 0, 0)
            p.location = (0, 0, 0)
        if action_name == 'Conduct':
            for suffix, offset, factor in [('R', 0, 1), ('L', .9, .75)]:
                ph = phase + offset
                rig.pose.bones['UpperArm.' + suffix].rotation_euler = (.11 * math.sin(ph), .07 * math.sin(ph), .17 * factor * math.sin(ph))
                rig.pose.bones['Forearm.' + suffix].rotation_euler = (.17 * factor * math.sin(ph + .4), .07 * math.sin(ph + .3), .23 * factor * math.sin(ph + .7))
                rig.pose.bones['Wrist.' + suffix].rotation_euler = (.09 * math.sin(ph + 1), .06 * math.sin(ph + .4), .13 * math.sin(ph + .8))
            rig.pose.bones['Head'].rotation_euler = (.025 * math.sin(phase + .4), .018 * math.sin(phase), .035 * math.sin(phase))
            rig.pose.bones['Torso'].rotation_euler = (0, .010 * math.sin(phase), .012 * math.sin(phase))
        else:
            rig.pose.bones['Head'].rotation_euler = (.014 * math.sin(phase), 0, .014 * math.sin(phase + .3))
            for suffix in ['L', 'R']:
                rig.pose.bones['UpperArm.' + suffix].rotation_euler.x = .01 * math.sin(phase)
                rig.pose.bones['Forearm.' + suffix].rotation_euler.z = .014 * math.sin(phase + .2)
        rig.pose.bones['Ear.L'].rotation_euler.z = .020 * math.sin(phase + .8)
        rig.pose.bones['Ear.R'].rotation_euler.x = .017 * math.sin(phase + .2)
        for p in rig.pose.bones:
            p.keyframe_insert(data_path='rotation_euler', frame=frame, group=p.name)
    # NLA strip names become stable glTF animation clip names.
    track = rig.animation_data.nla_tracks.new()
    track.name = action_name
    track.strips.new(action_name, 1, action)
    track.mute = True
rig.animation_data.action = None
for p in rig.pose.bones:
    p.rotation_euler = (0, 0, 0)

# Export ONLY the character, then retain staging exclusively in the .blend.
bpy.ops.object.select_all(action='DESELECT')
for obj in ASSET:
    obj.select_set(True)
bpy.context.view_layer.objects.active = rig
bpy.ops.export_scene.gltf(filepath=str(GLB), export_format='GLB', use_selection=True,
    export_animations=True, export_animation_mode='NLA_TRACKS', export_force_sampling=True,
    export_nla_strips_merged_animation_name='Animation', export_skins=True,
    export_image_format='AUTO', export_yup=True, export_apply=False)

# Warm neutral product stage, with true multi-angle model renders.
scene.render.engine = 'CYCLES'
scene.cycles.samples = 32
scene.cycles.use_denoising = True
scene.render.resolution_x = 1024
scene.render.resolution_y = 1200
scene.render.resolution_percentage = 100
scene.render.image_settings.file_format = 'PNG'
scene.world.color = (.20, .20, .20)
scene.world.use_nodes = True
background = next(n for n in scene.world.node_tree.nodes if n.type == 'BACKGROUND')
background.inputs['Color'].default_value = (.46, .40, .31, 1)
background.inputs['Strength'].default_value = .55
scene.view_settings.view_transform = 'AgX'
scene.view_settings.look = 'AgX - Medium High Contrast'
scene.view_settings.exposure = .45

bpy.ops.mesh.primitive_plane_add(size=200, location=(0, 0, -.003))
ground = bpy.context.object
ground.name = 'Preview only warm neutral ground'
ground.data.materials.append(material('Preview sandstone', (.31, .27, .21), .93))


def area(name, loc, energy, size, color):
    data = bpy.data.lights.new(name, 'AREA')
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.location = loc
    obj.rotation_euler = (Vector((0, 0, .8)) - obj.location).to_track_quat('-Z', 'Y').to_euler()
    data.energy, data.shape, data.size, data.color = energy, 'DISK', size, color


area('Large warm key', (-2.5, -3.5, 4), 370, 3, (1, .87, .69))
area('Soft neutral fill', (2.5, -2, 2), 240, 3, (.78, .88, 1))
area('Gentle fur rim', (0, 2.5, 3), 450, 2, (1, .81, .57))
cam_data = bpy.data.cameras.new('Candidate inspection camera')
cam = bpy.data.objects.new('Candidate inspection camera', cam_data)
bpy.context.collection.objects.link(cam)
scene.camera = cam
cam_data.type = 'ORTHO'
cam_data.ortho_scale = 1.84


def render(name, pos, frame=None):
    if frame:
        rig.animation_data.action = bpy.data.actions['Conduct']
        scene.frame_set(frame)
    else:
        rig.animation_data.action = None
        for p in rig.pose.bones:
            p.rotation_euler = (0, 0, 0)
        scene.frame_set(1)
    cam.location = pos
    cam.rotation_euler = (Vector((0, 0, .79)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = str(OUT / (name + '.png'))
    bpy.ops.render.render(write_still=True)


bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'rabbit-conductor-v3.blend'))
render('front', (0, -4, 1.01))
render('three-quarter', (2.5, -4, 1.55))
render('left', (-4, 0, 1.01))
render('back', (0, 4, 1.01))
render('conduct-midpose', (2.5, -4, 1.55), 25)

# Leave an immediately usable source file with a sensible camera and neutral pose.
rig.animation_data.action = None
for p in rig.pose.bones:
    p.rotation_euler = (0, 0, 0)
scene.frame_set(1)
cam.location = (2.5, -4, 1.55)
cam.rotation_euler = (Vector((0, 0, .79)) - cam.location).to_track_quat('-Z', 'Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT / 'rabbit-conductor-v3.blend'))

triangles = 0
for obj in ASSET:
    if obj.type == 'MESH':
        obj.data.calc_loop_triangles()
        triangles += len(obj.data.loop_triangles)
report = {'candidate': 'rabbit-conductor-v3', 'triangles': triangles, 'meshes': sum(o.type == 'MESH' for o in ASSET),
          'bones': len(rig.data.bones), 'glb_bytes': GLB.stat().st_size,
          'clips': ['Idle', 'Conduct'], 'axis': 'glTF Y up, +Z forward',
          'origin': 'ground between planted hind paws', 'art_status': 'unaccepted local candidate'}
(OUT / 'build-report.json').write_text(json.dumps(report, indent=2), encoding='utf8')
print('RABBIT_CANDIDATE_REPORT ' + json.dumps(report))
