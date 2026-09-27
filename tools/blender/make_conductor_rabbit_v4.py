"""Reference-constrained STATIC clay study, deliberately independent of v3.

Blender native Z-up / front=-Y; no rig, image textures, fur or GLB export.
Head/body are new shaped cross-section surfaces, not scaled sphere assemblies.
Run: blender -b --python-exit-code 1 --python tools/blender/make_conductor_rabbit_v4.py
"""
import bpy
import bmesh
import math
import json
from pathlib import Path
from mathutils import Vector
import numpy as np

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / 'tools/blender/out/rabbit-conductor-v4'
OUT.mkdir(parents=True, exist_ok=True)
bpy.ops.object.select_all(action='SELECT')
bpy.ops.object.delete(use_global=False)
for action in list(bpy.data.actions):
    bpy.data.actions.remove(action)
scene = bpy.context.scene
PARTS = []


def material(name, value, roughness=.78):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    shader = next((n for n in mat.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)
    if shader is None:
        shader = mat.node_tree.nodes.new('ShaderNodeBsdfPrincipled')
        out = next((n for n in mat.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'), None)
        if out is None:
            out = mat.node_tree.nodes.new('ShaderNodeOutputMaterial')
        mat.node_tree.links.new(shader.outputs['BSDF'], out.inputs['Surface'])
    shader.inputs['Base Color'].default_value = (value, value, value, 1)
    shader.inputs['Roughness'].default_value = roughness
    return mat


CLAY = material('Neutral study clay', .45)
EYE_CLAY = material('Neutral eyeball clay', .36, .48)
FLOOR = material('Neutral background', .72)


def mesh(name, verts, faces, mat=CLAY, subdiv=0):
    data = bpy.data.meshes.new(name)
    data.from_pydata(verts, [], faces)
    data.update()
    bm = bmesh.new()
    bm.from_mesh(data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(data)
    bm.free()
    obj = bpy.data.objects.new(name, data)
    bpy.context.collection.objects.link(obj)
    obj.data.materials.append(mat)
    for poly in data.polygons:
        poly.use_smooth = True
    if subdiv:
        mod = obj.modifiers.new('Editable surface smoothing', 'SUBSURF')
        mod.levels = subdiv
        mod.render_levels = subdiv
    PARTS.append(obj)
    return obj


def smooth_value(profile, x, col):
    xs = [p[0] for p in profile]
    vals = [p[col] for p in profile]
    i = min(len(xs) - 2, max(0, int(np.searchsorted(xs, x)) - 1))
    h = xs[i + 1] - xs[i]
    t = (x - xs[i]) / h
    m0 = (vals[min(i + 1, len(xs) - 1)] - vals[max(0, i - 1)]) / (xs[min(i + 1, len(xs) - 1)] - xs[max(0, i - 1)])
    m1 = (vals[min(i + 2, len(xs) - 1)] - vals[i]) / (xs[min(i + 2, len(xs) - 1)] - xs[i])
    return ((2*t**3 - 3*t*t + 1) * vals[i] + (t**3 - 2*t*t + t) * h * m0
            + (-2*t**3 + 3*t*t) * vals[i + 1] + (t**3 - t*t) * h * m1)


def loft(name, profile, rings=64, sides=96, offset=(0, 0, 0), deform=None):
    """Profile columns: height, half-width, front depth, back depth, centre Y."""
    verts, faces = [], []
    for j in range(rings + 1):
        z = profile[0][0] + (profile[-1][0] - profile[0][0]) * j / rings
        width = max(.0001, smooth_value(profile, z, 1))
        front = max(.0001, smooth_value(profile, z, 2))
        back = max(.0001, smooth_value(profile, z, 3))
        cy = smooth_value(profile, z, 4)
        for k in range(sides):
            phi = 2 * math.pi * k / sides
            x = width * math.sin(phi)
            c = math.cos(phi)
            y = cy - (front if c >= 0 else back) * c
            if deform:
                x, y, z1 = deform(x, y, z, c)
            else:
                z1 = z
            verts.append((x + offset[0], y + offset[1], z1 + offset[2]))
            if j:
                a = (j - 1) * sides + k
                b = (j - 1) * sides + (k + 1) % sides
                faces.append((a, b, b + sides, a + sides))
    faces += [tuple(reversed(range(sides))), tuple(range(rings*sides, (rings+1)*sides))]
    return mesh(name, verts, faces)


def blend_surfaces(name, objects, voxel=.0016, iterations=2):
    bpy.ops.object.select_all(action='DESELECT')
    for obj in objects:
        obj.select_set(True)
        PARTS.remove(obj)
    bpy.context.view_layer.objects.active = objects[0]
    bpy.ops.object.join()
    obj = bpy.context.object
    obj.name = name
    remesh = obj.modifiers.new('Continuous sculpt surface', 'REMESH')
    remesh.mode = 'VOXEL'
    remesh.voxel_size = voxel
    bpy.ops.object.modifier_apply(modifier=remesh.name)
    smooth = obj.modifiers.new('Sculpt transition relax', 'SMOOTH')
    smooth.factor = .65
    smooth.iterations = iterations
    bpy.ops.object.modifier_apply(modifier=smooth.name)
    for face in obj.data.polygons:
        face.use_smooth = True
    PARTS.append(obj)
    return obj


def bezier(points, steps=32):
    pts = [Vector(p) for p in points]
    if len(pts) == 3:
        a, b, c = pts
        return [a*(1-t)**2 + b*2*t*(1-t) + c*t*t for t in np.linspace(0, 1, steps)]
    a, b, c, d = pts
    return [a*(1-t)**3 + b*3*t*(1-t)**2 + c*3*t*t*(1-t) + d*t**3 for t in np.linspace(0, 1, steps)]


def sweep(name, points, radii, sides=16, squash=1, mat=CLAY, caps=True):
    pts = [Vector(p) for p in points]
    verts, faces = [], []
    for i, p in enumerate(pts):
        t = i / (len(pts) - 1)
        r = float(np.interp(t, [v[0] for v in radii], [v[1] for v in radii]))
        tangent = (pts[min(i + 1, len(pts)-1)] - pts[max(i-1, 0)]).normalized()
        right = tangent.cross(Vector((0, 1, 0)))
        if right.length < .01:
            right = tangent.cross(Vector((1, 0, 0)))
        right.normalize()
        normal = tangent.cross(right).normalized()
        for k in range(sides):
            a = k * 2 * math.pi / sides
            verts.append(tuple(p + r * (math.cos(a)*right + math.sin(a)*normal*squash)))
            if i:
                prev = (i - 1)*sides + k
                nxt = (i - 1)*sides + (k + 1) % sides
                faces.append((prev, nxt, nxt+sides, prev+sides))
    if caps:
        faces.extend([tuple(reversed(range(sides))), tuple(range(len(verts)-sides, len(verts)))])
    return mesh(name, verts, faces, mat)


def line(name, points, thickness=.0013):
    return sweep(name, points, [(0, thickness), (1, thickness)], sides=8)


def ellipsoid_surface(name, center, dims, mat=CLAY):
    # Used only for buried eye optics / small props; never for body construction.
    verts, faces = [], []
    nu, nv = 48, 32
    for j in range(nv + 1):
        v = math.pi*j/nv
        for i in range(nu):
            u = 2*math.pi*i/nu
            verts.append((center[0]+dims[0]*math.sin(v)*math.cos(u),
                          center[1]+dims[1]*math.sin(v)*math.sin(u), center[2]+dims[2]*math.cos(v)))
            if j:
                a = (j-1)*nu+i
                b = (j-1)*nu+(i+1)%nu
                faces.append((a, b, b+nu, a+nu))
    return mesh(name, verts, faces, mat)


HEAD_PROFILE = [
    (.545, .013, .023, .022, -.004),
    (.558, .065, .067, .056, -.005),
    (.585, .108, .081, .077, 0),
    (.623, .131, .088, .087, .002),
    (.666, .130, .086, .088, .004),
    (.708, .120, .096, .080, .005),
    (.750, .099, .084, .064, .006),
    (.779, .058, .052, .043, .007),
    (.790, .035, .032, .026, .007),
    (.796, .016, .016, .012, .007),
    (.798, .001, .002, .001, .007),
]


def face_shape(x, y, z, c):
    if c <= 0:
        return x, y, z
    front_weight = min(1, c / .6)
    # Continuous bridge and short wedge muzzle, with much smaller pad bulges.
    bridge = .020 * math.exp(-(x/.030)**2 - ((z-.679)/.037)**2)
    muzzle = .038 * math.exp(-(x/.066)**2 - ((z-.637)/.032)**2)
    pads = sum(.006 * math.exp(-((x-sign*.031)/.027)**2-((z-.629)/.020)**2) for sign in (-1, 1))
    # Recessed orbital bowls. A slight brow ridge overlaps the upper opening.
    sockets = sum(.023 * math.exp(-((x-sign*.083)/.028)**4-((z-.696)/.033)**4) for sign in (-1, 1))
    brow = sum(.006 * math.exp(-((x-sign*.083)/.035)**2-((z-.731)/.010)**2) for sign in (-1, 1))
    # Carve the mouth into this same surface instead of attaching a smile object.
    mouth_line = .607 + .005*(abs(x)/.04)**1.4
    mouth = .0030 * math.exp(-((z-mouth_line)/.0025)**2-(x/.043)**6)
    philtrum = .0028 * math.exp(-(x/.0025)**2-((z-.624)/.011)**4)
    lower_lip = .005 * math.exp(-(x/.027)**4-((z-.610)/.008)**2)
    return x, y + front_weight*(sockets+mouth+philtrum-bridge-muzzle-pads-brow-lower_lip), z


head = loft('Continuous cranium orbit bridge muzzle and jaw', HEAD_PROFILE, 128, 192, deform=face_shape)


def ear(name, root, tip, width, bend):
    root, tip = Vector(root), Vector(tip)
    axis = (tip-root).normalized()
    side = Vector((axis.z, 0, -axis.x)).normalized()
    front = Vector((0, -1, 0))
    verts, faces = [], []
    n, sides = 54, 64
    for j in range(n+1):
        t = j/n
        center = root.lerp(tip, t) + Vector((0, bend*math.sin(math.pi*t), .007*math.sin(math.pi*t)))
        w = max(.0015, width * max(.015, math.sin(math.pi*(.035+.965*t)))**.72)
        depth = w*.56
        for k in range(sides):
            a = 2*math.pi*k/sides
            sx, sy = math.cos(a), math.sin(a)
            p = center + side*w*sx + front*depth*sy
            if sy > 0:
                # Convex rolled rim, concave cup, and an inner longitudinal ridge.
                p.y += .021*sy**3*math.sin(math.pi*t)**.65
                p.y -= .0018*math.exp(-(sx/.19)**2)*math.sin(math.pi*t)
            verts.append(tuple(p))
            if j:
                aa=(j-1)*sides+k
                bb=(j-1)*sides+(k+1)%sides
                faces.append((aa, bb, bb+sides, aa+sides))
    faces.extend([tuple(reversed(range(sides))), tuple(range(n*sides, (n+1)*sides))])
    return mesh(name, verts, faces)


ear_left = ear('Outward ear with sculpted cup', (-.065, .005, .744), (-.194, -.002, .961), .041, -.007)
ear_right = ear('Upright ear with sculpted cup', (.061, .021, .750), (.078, .018, 1.000), .036, .013)
head_parts = [head, ear_left, ear_right]


def facial_front(x,z):
    width=max(.002,smooth_value(HEAD_PROFILE,z,1))
    depth=max(.002,smooth_value(HEAD_PROFILE,z,2))
    cy=smooth_value(HEAD_PROFILE,z,4)
    c=math.sqrt(max(.001,1-(x/width)**2))
    return face_shape(x,cy-depth*c,z,c)[1]


# Broad eyelid skin fans bridge into the face, with the eyeball buried behind them.
for sign, suffix in [(-1, 'L'), (1, 'R')]:
    normal=Vector((sign*.61,-.7924,0)).normalized()
    tangent=Vector((.7924,sign*.61,0)).normalized()
    orbit=Vector((sign*.083,-.069,.695))
    centre=orbit-normal*.010
    eye=ellipsoid_surface('Buried outward facing eyeball.'+suffix,(0,0,0),(.0275,.017,.034),EYE_CLAY)
    for v in eye.data.vertices:
        local=v.co.copy()
        v.co=centre+tangent*local.x+normal*local.y+Vector((0,0,local.z))
    verts,faces=[],[]
    for j in range(11):
        t=j/10
        rx=.0235*(1-t)+.042*t
        rz=.0280*(1-t)+.047*t
        for k in range(96):
            a=2*math.pi*k/96
            x=sign*.083+tangent.x*rx*math.cos(a)
            z=.695+rz*math.sin(a)
            outer=facial_front(x,z)-.0005
            inner=centre.y+tangent.y*.0235*math.cos(a)+normal.y*.010-.0012*max(0,math.sin(a))
            blend=t*t*(3-2*t)
            y=inner*(1-blend)+outer*blend-.002*math.sin(math.pi*t)
            verts.append((x,y,z))
            if j:
                p=(j-1)*96+k;q=(j-1)*96+(k+1)%96
                faces.append((p,q,q+96,p+96))
    lid=mesh('Orbital skin transition.'+suffix,verts,faces)
    solid=lid.modifiers.new('Orbital skin volume','SOLIDIFY');solid.thickness=.0035
    bpy.context.view_layer.objects.active=lid
    bpy.ops.object.modifier_apply(modifier=solid.name)
    head_parts.append(lid)
head=blend_surfaces('Head - continuous face rooted ears and orbital lids',head_parts,.00105,2)

# Incised mouth geometry survives the final sculpt blend and stays neutral gray.
mouth_points=[]
for x in np.linspace(-.028,.028,60):
    z=.617+.006*(abs(x)/.028)**1.7
    mouth_points.append((x,facial_front(x,z)+.0008,z))
# The old 2.5mm sweep self-intersected at the narrow philtrum bend and the
# EXACT boolean removed the whole head. A sub-millimetre incision stays simple.
mouth_cutter=sweep('Temporary mouth recess cutter',mouth_points,[(0,.0004),(1,.0004)],12)
philtrum_points=[(0,facial_front(0,z)+.0007,z) for z in np.linspace(.618,.638,32)]
philtrum_cutter=sweep('Temporary philtrum cutter',philtrum_points,[(0,.0017),(1,.0016)],12)
def head_integrity():
    bm=bmesh.new();bm.from_mesh(head.data)
    result={'vertices':len(bm.verts),'volume':abs(bm.calc_volume()),
            'non_manifold_edges':sum(not e.is_manifold for e in bm.edges),
            'min_z':min(v.co.z for v in bm.verts),'max_z':max(v.co.z for v in bm.verts)}
    bm.free()
    return result

head_before=head_integrity()
for cutter in [mouth_cutter,philtrum_cutter]:
    mod=head.modifiers.new('Carved facial expression','BOOLEAN');mod.operation='DIFFERENCE';mod.solver='EXACT';mod.object=cutter
    bpy.context.view_layer.objects.active=head
    bpy.ops.object.modifier_apply(modifier=mod.name)
    head_check=head_integrity()
    assert head_check['vertices']>10000 and head_check['max_z']>.98, 'Facial carving removed the head or ears'
    assert head_check['volume']>=head_before['volume']*.95, 'Facial carving destroyed head volume'
    assert head_check['non_manifold_edges']==0, 'Facial carving produced a non-manifold head'
    PARTS.remove(cutter)
    bpy.data.objects.remove(cutter,do_unlink=True)

# Soft triangular nose with a real bridge connection.
nose = mesh('Rounded triangular nose', [(-.015, -.136, .651), (.015, -.136, .651), (0, -.141, .629),
    (-.014, -.153, .650), (.014, -.153, .650), (0, -.158, .634)],
    [(0,2,1),(3,4,5),(0,1,4,3),(1,2,5,4),(2,0,3,5)])
bevel = nose.modifiers.new('Rounded nose sculpt edges','BEVEL')
bevel.width=.005
bevel.segments=4

# A new torso surface branches into broad haunches, short ankles and flat toe pads.
body_profile=[(.126,.080,.055,.066,.006),(.158,.108,.080,.081,.006),(.215,.122,.104,.094,.006),
    (.290,.143,.112,.100,.006),(.365,.130,.098,.084,.002),(.420,.107,.078,.072,0),
    (.480,.115,.078,.070,.004),(.528,.092,.064,.058,.007),(.552,.048,.040,.035,.008)]
def body_shape(x,y,z,c):
    lift=.021*max(0,1-(abs(x)/.112)**2)*max(0,1-(z-.126)/.064)
    return x,y,z+lift
body_pieces=[loft('Abdomen and rump control surface',body_profile,100,112,deform=body_shape)]
for sign,suffix in [(-1,'L'),(1,'R')]:
    legprofile=[(.025,.025,.030,.028,0),(.063,.037,.036,.034,.002),(.105,.045,.047,.043,.006),
        (.155,.054,.061,.055,.012),(.215,.061,.073,.064,.014),(.278,.049,.052,.047,.006),(.296,.020,.029,.026,0)]
    body_pieces.append(loft('Flowing haunch and ankle.'+suffix,legprofile,64,72,(sign*.071,0,0)))
    pawprofile=[(.000,.025,.060,.032,-.022),(.006,.040,.069,.039,-.022),(.023,.046,.072,.040,-.022),
        (.041,.042,.062,.034,-.020),(.054,.033,.048,.029,-.013),(.066,.022,.030,.022,-.002)]
    paw=loft('Low planted paw.'+suffix,pawprofile,44,80,(sign*.077,0,0))
    body_pieces.append(paw)
    for i in range(4):
        x=sign*.077+(i-1.5)*.021
        end_y=-.113 + .006*abs(i-1.5)
        path=bezier([(x,-.061,.020),(x,-.087,.015),(x,end_y,.013)],22)
        body_pieces.append(sweep('Sculpted toe volume.'+suffix+str(i),path,
            [(0,.013),(.35,.013),(.74,.010),(.93,.006),(1,.001)],16,squash=1.1))
body=blend_surfaces('Body - belly haunches ankles soles and distinct toes',body_pieces,.00135,8)
# Keep an actual broad sole: flatten only the bottom millimetre after sculpt relax.
for v in body.data.vertices:
    if v.co.z<.0032:
        v.co.z=0

# Short rounded tail shaped by profile, with no material disguise.
tail=loft('Cottontail volume',[(.183,.003,.007,.007,.113),(.190,.022,.017,.020,.115),
    (.213,.033,.026,.032,.117),(.241,.029,.023,.030,.116),(.258,.013,.014,.018,.112),
    (.262,.002,.003,.003,.110)],44,64)


COAT_PROFILE=[(.115,.120,.094,.101),(.22,.149,.117,.112),(.31,.149,.118,.108),
              (.40,.117,.088,.079),(.47,.121,.087,.079),(.535,.106,.073,.065)]


def coat_radius(z):
    z=min(.535,max(.115,z))
    return tuple(smooth_value(COAT_PROFILE,z,i) for i in (1,2,3))


def coat_point(phi,t,sign,extra=0):
    hem=float(np.interp(phi,[.35,.95,1.45,2.38,math.pi],[.290,.305,.265,.126,.387]))
    z=.534*(1-t)+hem*t
    rx,front,back=coat_radius(z)
    c=math.cos(phi)
    depth=front if c>=0 else back
    # Very shallow vertical cloth folds, useful in clay, no surface texture.
    fold=.0025*math.sin(5*phi+.4)*math.sin(math.pi*t)**2
    return (sign*(rx+extra+fold)*math.sin(phi),-(depth+extra+fold)*c,z)


for sign,suffix in [(-1,'L'),(1,'R')]:
    verts,faces=[],[]
    rows,cols=44,72
    for j in range(rows+1):
        t=j/rows
        start=.41-.13*math.sin(math.pi*t)+.01*t
        for k in range(cols+1):
            phi=start+(math.pi-.008-start)*k/cols
            verts.append(coat_point(phi,t,sign))
            if j and k:
                p=(j-1)*(cols+1)+k-1
                faces.append((p,p+1,p+cols+2,p+cols+1))
    coat=mesh('Fitted front and split back coat panel.'+suffix,verts,faces)
    thick=coat.modifiers.new('Real cloth panel thickness','SOLIDIFY')
    thick.thickness=.0022
    # Rolled hem is geometry only, in exactly the same neutral gray.
    edge=[coat_point(phi,1,sign,.0008) for phi in np.linspace(.42,math.pi-.008,90)]
    line('Turned coat hem.'+suffix,edge,.0012)
    edge=[coat_point(.41-.13*math.sin(math.pi*t)+.01*t,t,sign,.0008) for t in np.linspace(0,1,50)]
    line('Front coat seam.'+suffix,edge,.0011)

# Standing collar wraps the short neck instead of a flat ring on a sphere.
verts,faces=[],[]
for j in range(9):
    t=j/8
    for k in range(65):
        a=.48+(2*math.pi-.96)*k/64
        verts.append(((.082-.010*t)*math.sin(a),-(.063-.009*t)*math.cos(a)+.004,
                      .525+.034*t+.004*math.cos(a)))
        if j and k:
            p=(j-1)*65+k-1
            faces.append((p,p+1,p+66,p+65))
collar=mesh('Standing shaped collar',verts,faces)
mod=collar.modifiers.new('Folded collar thickness','SOLIDIFY');mod.thickness=.003

# Waistcoat is two shaped panels with pointed lower ends and a central notch.
for sign,suffix in [(-1,'L'),(1,'R')]:
    verts,faces=[],[]
    for j in range(37):
        t=j/36
        for k in range(17):
            s=k/16
            x=sign*(.001+(.050+.011*t)*s)
            bottom=.307-.028*math.sin(math.pi*s)
            z=.538*(1-t)+bottom*t
            rx,front,_=coat_radius(z)
            y=-front*math.sqrt(max(.1,1-(x/rx)**2))-.001
            verts.append((x,y,z))
            if j and k:
                p=(j-1)*17+k-1
                faces.append((p,p+1,p+18,p+17))
    waist=mesh('Pointed fitted waistcoat panel.'+suffix,verts,faces)
    mod=waist.modifiers.new('Waistcoat thickness','SOLIDIFY');mod.thickness=.0018
    # Curved folded lapels, broad at the collar and narrow towards the waist.
    outline=[(sign*.032,-.068,.547),(sign*.080,-.066,.523),(sign*.096,-.079,.494),
             (sign*.071,-.093,.454),(sign*.045,-.086,.503)]
    lapel=mesh('Folded lapel.'+suffix,outline,[(0,1,2,3,4)],subdiv=0)
    mod=lapel.modifiers.new('Turned lapel cloth','SOLIDIFY');mod.thickness=.003
    bev=lapel.modifiers.new('Soft lapel edge','BEVEL');bev.width=.0018;bev.segments=3

# Readable folded bow; omitted knots/buttons/embroidery cannot carry the likeness.
for sign in (-1,1):
    verts,faces=[],[]
    for j in range(13):
        t=j/12
        for k in range(17):
            s=2*k/16-1
            verts.append((sign*(.010+.050*t),-.096-.010*math.sin(math.pi*t)+.006*math.sin(2*math.pi*s)*t,
                          .539+s*(.009+.021*t)+.003*math.sin(math.pi*t)))
            if j and k:
                p=(j-1)*17+k-1
                faces.append((p,p+1,p+18,p+17))
    wing=mesh('Pinched bow wing',verts,faces)
    mod=wing.modifiers.new('Folded bow thickness','SOLIDIFY');mod.thickness=.003
loft('Bow centre wrap',[(.525,.008,.007,.007,-.104),(.531,.012,.010,.010,-.104),
    (.548,.012,.010,.010,-.104),(.554,.008,.007,.007,-.104)],20,32)

ARMS={
    'L':[( -.060,.003,.494),(-.141,-.003,.521),(-.211,-.029,.390),(-.161,-.120,.451)],
    'R':[( .061,.003,.495),(.158,.012,.508),(.208,-.029,.531),(.227,-.105,.629)],
}


def glove_palm(name,center,side):
    # New flattened asymmetric palm control surface; fingers blend into this root.
    profile=[(-.024,.013,.010,.010,.001),(-.017,.021,.017,.014,0),(.005,.025,.018,.016,0),
             (.026,.020,.015,.014,-.002),(.034,.008,.007,.007,-.002)]
    return loft(name,profile,36,48,center)


for suffix,control in ARMS.items():
    pts=bezier(control,64)
    sleeve=sweep('Tailored round elbow sleeve.'+suffix,pts,[(0,.036),(.18,.050),(.48,.044),(.78,.033),(1,.028)],32,squash=.92)
    # A shallow cloth fold around the elbow, not a tube joint.
    wrist=Vector(control[-1])
    direction=(pts[-1]-pts[-4]).normalized()
    side=direction.cross(Vector((0,1,0))).normalized()
    normal=direction.cross(side).normalized()
    for offset,r in [(-.017,.030),(-.003,.029)]:
        ring=[tuple(wrist+direction*offset+r*(side*math.cos(a)+normal*math.sin(a))) for a in np.linspace(0,2*math.pi,65)]
        line('Rolled cuff.'+suffix,ring,.0016)
    if suffix=='R':
        center=Vector((.233,-.118,.650))
        handparts=[glove_palm('Grip palm control surface',center,1)]
        handparts.append(sweep('Continuous wrist under raised cuff',bezier([wrist-direction*.018,wrist,center],22),
                               [(0,.023),(.6,.026),(1,.023)],24,.82))
        for i in range(4):
            z=.627+i*.0142
            path=bezier([(.250,-.121,z),(.246,-.153,z+.004),(.211,-.161,z+.004),(.210,-.140,z)],36)
            handparts.append(sweep('Curled gripping digit '+str(i),path,[(0,.009),(.35,.0070),(.80,.0062),(1,.0035)],16,.94))
        thumb=bezier([(.212,-.111,.624),(.199,-.132,.625),(.223,-.163,.643),(.233,-.153,.645)],32)
        handparts.append(sweep('Opposing grip thumb',thumb,[(0,.012),(.4,.010),(1,.0055)],20))
    else:
        center=Vector((-.157,-.138,.465))
        handparts=[glove_palm('Free palm control surface',center,-1)]
        handparts.append(sweep('Continuous wrist under free cuff',bezier([wrist-direction*.018,wrist,center],22),
                               [(0,.023),(.6,.025),(1,.020)],24,.82))
        for i in range(4):
            x=-.157+(i-1.5)*.014
            path=bezier([(x,-.147,.481),(x,-.175,.480),(x,-.183,.451),(x,-.169,.447)],30)
            handparts.append(sweep('Free softly flexed digit '+str(i),path,[(0,.008),(.55,.0069),(1,.0048)],16))
        path=bezier([(-.180,-.139,.456),(-.193,-.152,.454),(-.178,-.178,.465),(-.172,-.177,.470)],28)
        handparts.append(sweep('Free opposing thumb',path,[(0,.010),(.6,.008),(1,.0045)],20))
    blend_surfaces('Sculpted anatomical forepaw.'+suffix,handparts,.00085,1)

# Baton runs inside the curved fingers; it is not glued to a fist surface.
sweep('Static grip reference baton',[(.220,-.146,.621),(.223,-.148,.683),(.263,-.157,.901)],
      [(0,.0030),(.23,.0025),(1,.0012)],16)

# Very fine spectacles, in clay. Optical glass omitted to expose the eye sockets.
for sign,suffix in [(-1,'L'),(1,'R')]:
    ring=[(sign*.067+.041*math.cos(a),-.118,.676+.042*math.sin(a)) for a in np.linspace(0,2*math.pi,97)]
    line('Fine spectacle rim.'+suffix,ring,.0013)
    line('Spectacle temple.'+suffix,bezier([(sign*.109,-.117,.689),(sign*.125,-.065,.683),(sign*.125,.015,.674)],40),.0012)
line('Spectacle bridge',bezier([(-.026,-.118,.684),(0,-.147,.700),(.026,-.118,.684)],36),.0013)

# Metrics derive from resulting meshes, not label counts, and do not claim likeness.
depsgraph=bpy.context.evaluated_depsgraph_get()
def positions(obj):
    evaluated=obj.evaluated_get(depsgraph)
    return [evaluated.matrix_world@v.co for v in evaluated.data.vertices]
all_points=[p for obj in PARTS for p in positions(obj)]
body_points=positions(body)
mins=[min(p[i] for p in all_points) for i in range(3)]
maxs=[max(p[i] for p in all_points) for i in range(3)]
body_min=[min(p[i] for p in body_points) for i in range(3)]
body_max=[max(p[i] for p in body_points) for i in range(3)]
foot_probes=[]
for sign in (-1,1):
    foot_probes.append({'side':sign,'support_vertices':sum(p.z<.001 and p.x*sign>.035 for p in body_points),
                        'toe_vertices':sum(p.z<.047 and p.y<-.077 and p.x*sign>.035 for p in body_points)})
report={'stage':'static gray study - visual acceptance pending','actual_height':maxs[2]-mins[2],
        'bounds':{'min':mins,'max':maxs},'body_bounds':{'min':body_min,'max':body_max},'foot_probes':foot_probes,
        'armatures':sum(o.type=='ARMATURE' for o in PARTS),'actions':len(bpy.data.actions),
        'image_texture_nodes':sum(n.type=='TEX_IMAGE' for m in bpy.data.materials if m.use_nodes for n in m.node_tree.nodes),
        'orthographic_scale':1.12,'reference':'four-view-with-props.png, supplemented by hy3d-baton-v1'}
(OUT/'shape-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')

# Plain studio inspection, no atmospheric lighting or material detail to hide shape.
scene.render.engine='CYCLES'
scene.cycles.samples=40
scene.cycles.use_denoising=True
scene.render.resolution_x=1000
scene.render.resolution_y=1200
scene.render.resolution_percentage=100
scene.render.image_settings.file_format='PNG'
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.view_settings.exposure=0
scene.world.use_nodes=True
bg=next(n for n in scene.world.node_tree.nodes if n.type=='BACKGROUND')
bg.inputs['Color'].default_value=(.72,.72,.72,1)
bg.inputs['Strength'].default_value=.55
bpy.ops.mesh.primitive_plane_add(size=200,location=(0,0,-.001))
floor=bpy.context.object;floor.name='Inspection floor';floor.data.materials.append(FLOOR)

def light(name,loc,power,size):
    data=bpy.data.lights.new(name,'AREA');data.energy=power;data.shape='DISK';data.size=size
    obj=bpy.data.objects.new(name,data);bpy.context.collection.objects.link(obj);obj.location=loc
    obj.rotation_euler=(Vector((0,0,.53))-obj.location).to_track_quat('-Z','Y').to_euler()
light('Broad neutral front key',(-2,-3,3),190,3)
light('Neutral right fill',(2,-1,2),75,3)
light('Neutral rear fill',(0,3,2),140,3)
camera_data=bpy.data.cameras.new('Orthographic four view camera')
camera_data.type='ORTHO';camera_data.ortho_scale=1.12
camera=bpy.data.objects.new('Orthographic four view camera',camera_data)
bpy.context.collection.objects.link(camera);scene.camera=camera
VIEWS={'front':(0,-4,.5),'back':(0,4,.5),'left':(-4,0,.5),'right':(4,0,.5)}


def render(name,pos):
    camera.location=pos
    camera.rotation_euler=(Vector((0,0,.5))-camera.location).to_track_quat('-Z','Y').to_euler()
    scene.render.filepath=str(OUT/(name+'.png'))
    bpy.ops.render.render(write_still=True)


for view,pos in VIEWS.items():
    render(view,pos)
render('three-quarter',(2.8,-4,.78))

# Black silhouettes use emission override and a white world; no cast shadows.
silhouette=bpy.data.materials.new('Silhouette emission')
silhouette.use_nodes=True
silhouette.node_tree.nodes.clear()
out=silhouette.node_tree.nodes.new('ShaderNodeOutputMaterial')
emission=silhouette.node_tree.nodes.new('ShaderNodeEmission')
emission.inputs['Color'].default_value=(0,0,0,1)
silhouette.node_tree.links.new(emission.outputs[0],out.inputs['Surface'])
scene.view_layers[0].material_override=silhouette
floor.hide_render=True
bg.inputs['Color'].default_value=(1,1,1,1)
bg.inputs['Strength'].default_value=1
scene.view_settings.view_transform='Standard'
scene.view_settings.look='None'
scene.cycles.samples=8
for view,pos in VIEWS.items():
    render('silhouette-'+view,pos)
scene.view_layers[0].material_override=None
floor.hide_render=False
bg.inputs['Color'].default_value=(.72,.72,.72,1)
bg.inputs['Strength'].default_value=.55
scene.view_settings.view_transform='AgX'
scene.view_settings.look='AgX - Medium High Contrast'
scene.cycles.samples=40
camera.location=(2.8,-4,.78)
camera.rotation_euler=(Vector((0,0,.5))-camera.location).to_track_quat('-Z','Y').to_euler()
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'rabbit-conductor-v4-gray.blend'))

# Review board references the original images unchanged, side-by-side with the clay.
columns=''.join(f'<section><h2>{v}</h2><img src="../../../../character-references/rabbit-conductor-hy3d-baton-v1/rabbit-conductor-{v}.png"><img src="{v}.png"><img src="silhouette-{v}.png"></section>' for v in ['front','back','left','right'])
html='''<!doctype html><html lang="zh"><meta charset="utf-8"><title>Rabbit v4 - reference and clay</title>
<style>body{font:16px system-ui;margin:24px;background:#eee;color:#222}h1{font-size:22px}section{display:grid;grid-template-columns:70px repeat(3,minmax(0,1fr));gap:12px;margin:24px 0;align-items:center}img{width:100%;object-fit:contain}section img{height:clamp(180px,32vw,480px)}h2{font-size:16px}.master{max-height:640px}</style>
<h1>兔子 v4 静态灰模：参考 / 灰模 / 剪影</h1><p>外观未验收。四面灰模同正交尺度；原参考并非严格正投影，不把像素重合率当作形似证明。</p>
<img class="master" src="../../../../character-references/动物形象/rabbit-conductor-v1/four-view-with-props.png">'''+columns+'</html>'
(OUT/'reference-comparison.html').write_text(html,encoding='utf8')
print('RABBIT_V4_SHAPE_REPORT '+json.dumps(report))
