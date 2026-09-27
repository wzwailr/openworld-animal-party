"""Retopologize one front-face patch; retain all other subject geometry exactly."""
import hashlib
import json
import math
import sys
from pathlib import Path
import bpy
import bmesh
from mathutils import Vector
from mathutils.bvhtree import BVHTree
from mathutils.geometry import delaunay_2d_cdt

ROOT=Path(__file__).resolve().parents[2]
sys.path.insert(0,str(Path(__file__).resolve().parent))
from rabbit_face_review import render_face
SOURCE=ROOT/'tools/blender/out/rabbit-conductor-v5/rabbit-conductor-v5-clean-gray.blend'
OUT=ROOT/'tools/blender/out/rabbit-conductor-v5-muzzle-rebuilt-v2'
if OUT.exists() and any(OUT.iterdir()):
    raise RuntimeError('Refusing to overwrite an existing candidate')
OUT.mkdir(parents=True,exist_ok=True)
bpy.ops.wm.open_mainfile(filepath=str(SOURCE))
scene=bpy.context.scene
head=next(o for o in scene.objects if o.type=='MESH' and o.name.startswith('Head - continuous'))
nose=next(o for o in scene.objects if o.type=='MESH' and o.name.startswith('Rounded triangular nose'))

def fingerprint(obj):
    values=([tuple(v.co) for v in obj.data.vertices],[tuple(p.vertices) for p in obj.data.polygons])
    return hashlib.sha256(repr(values).encode()).hexdigest()

def probe(obj):
    bm=bmesh.new(); bm.from_mesh(obj.data); bm.normal_update()
    data={'vertices':len(bm.verts),'triangles':sum(len(f.verts)-2 for f in bm.faces),
          'nonmanifold':sum(not e.is_manifold for e in bm.edges),'volume':abs(bm.calc_volume()),
          'bounds':[[min(v.co[i] for v in bm.verts),max(v.co[i] for v in bm.verts)] for i in range(3)]}
    bm.free(); return data

def smooth_step(a,b,x):
    t=max(0,min(1,(x-a)/(b-a))); return t*t*(3-2*t)

def smooth_min(a,b,r=.006):
    h=max(0,r-abs(a-b))/r; return min(a,b)-h*h*r*.25

def lobe_front(x,z,cx,cy,cz,rx,ry,rz):
    s=1-((x-cx)/rx)**2-((z-cz)/rz)**2
    return cy-ry*math.sqrt(s) if s>0 else 1

def muzzle_front(x,z):
    y=.002-.088*math.sqrt(max(.01,1-(x/.131)**2))
    for lobe in [(-.020,-.075,.626,.052,.073,.038),(.020,-.075,.626,.052,.073,.038),
                 (0,-.070,.650,.026,.075,.026),(0,-.080,.599,.035,.050,.016)]:
        y=smooth_min(y,lobe_front(x,z,*lobe))
    line=.608+.005*(abs(x)/.036)**1.6
    y+=.0035*math.exp(-((z-line)/.0028)**2-(x/.036)**6)
    y+=.0015*math.exp(-(x/.0022)**2-((z-.631)/.012)**4)
    return y

def inside_polygon(point,poly):
    inside=False
    for a,b in zip(poly,poly[1:]+poly[:1]):
        if (a.y>point.y)!=(b.y>point.y) and point.x<(b.x-a.x)*(point.y-a.y)/(b.y-a.y)+a.x:
            inside=not inside
    return inside

def boundary_distance(point,poly):
    minimum=1
    for a,b in zip(poly,poly[1:]+poly[:1]):
        edge=b-a
        t=max(0,min(1,(point-a).dot(edge)/edge.length_squared))
        minimum=min(minimum,(point-a-t*edge).length)
    return minimum

before=probe(head)
untouched={o.name:fingerprint(o) for o in scene.objects if o.type=='MESH' and o not in (head,nose)}
tree=BVHTree.FromObject(head,bpy.context.evaluated_depsgraph_get())
render_face(scene,OUT,'before')
bm=bmesh.new(); bm.from_mesh(head.data)
cut=[f for f in bm.faces if (f.calc_center_median().x/.083)**2+((f.calc_center_median().z-.626)/.052)**2<1
     and f.calc_center_median().y<-.045]
removed_faces=len(cut)
bmesh.ops.delete(bm,geom=cut,context='FACES')
edges=[e for e in bm.edges if e.is_boundary]
adjacency={}
for edge in edges:
    a,b=edge.verts
    adjacency.setdefault(a,[]).append(b); adjacency.setdefault(b,[]).append(a)
assert all(len(n)==2 for n in adjacency.values()), 'Non-simple patch boundary'
start=next(iter(adjacency)); prev=None; curr=start; boundary=[]
while curr not in boundary:
    boundary.append(curr)
    nxt=next(v for v in adjacency[curr] if v!=prev)
    prev,curr=curr,nxt
assert curr==start and len(boundary)==len(adjacency),'Expected exactly one hole, not global hole filling'
area=sum(a.co.x*b.co.z-b.co.x*a.co.z for a,b in zip(boundary,boundary[1:]+boundary[:1]))
if area<0:
    boundary.reverse()
preserved={v:tuple(v.co) for v in bm.verts}
polygon=[Vector((v.co.x,v.co.z)) for v in boundary]
points=list(polygon)
step=.0025
for j in range(45):
    z=.571+j*step
    for i in range(71):
        p=Vector((-.087+i*step+(j%2)*step/2,z))
        if inside_polygon(p,polygon) and boundary_distance(p,polygon)>.0012:
            points.append(p)
coords,_,faces,orig,_,_=delaunay_2d_cdt(points,[],[list(range(len(boundary)))],1,1e-8,True)
vertices=[]; boundary_reused=set()
for p,source_ids in zip(coords,orig):
    source_boundary=[i for i in source_ids if i<len(boundary)]
    if source_boundary:
        assert len(source_boundary)==1,'Unexpected merged boundary vertices'
        index=source_boundary[0]; vertices.append(boundary[index]); boundary_reused.add(index)
        continue
    hit,_,_,_=tree.ray_cast(Vector((p.x,-1,p.y)),Vector((0,1,0)))
    assert hit is not None
    blend=smooth_step(0,.014,boundary_distance(p,polygon))
    # Keep the established cheek/bridge support instead of sinking a ring
    # around the new muzzle. Add the rounded lip volume to that support.
    desired=smooth_min(hit.y,muzzle_front(p.x,p.y),.002)
    y=hit.y*(1-blend)+desired*blend
    vertices.append(bm.verts.new((p.x,y,p.y)))
assert len(boundary_reused)==len(boundary),'Every retained seam vertex must be reused'
patch=[]
for indices in faces:
    face=bm.faces.new([vertices[i] for i in indices]); face.smooth=True; patch.append(face)
bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces))
assert all(tuple(v.co)==co for v,co in preserved.items()),'Retained face/ear geometry changed'
assert all(e.is_manifold for e in bm.edges),'Patch did not seal against its original boundary'
assert all(f.normal.y<0 for f in patch),'Patch folds over in front projection'
bm.to_mesh(head.data); bm.free(); head.data.update()

# Keep the nose as its own anatomical surface, with a buried back and short
# rounded front. All geometry outside head/nose remains byte-for-byte identical.
verts=[(0,-.147,.656)]; faces=[]; latitude=24; longitude=48
for j in range(1,latitude):
    theta=math.pi*j/latitude
    for k in range(longitude):
        phi=2*math.pi*k/longitude
        width=.0145*math.sin(theta)*(1+.28*math.cos(theta))
        verts.append((width*math.cos(phi),-.147+.0065*math.sin(theta)*math.sin(phi),.646+.010*math.cos(theta)))
bottom=len(verts); verts.append((0,-.147,.636))
for k in range(longitude):
    a,b=1+k,1+(k+1)%longitude; faces.append((0,b,a))
    for j in range(latitude-2):
        a,b=1+j*longitude+k,1+j*longitude+(k+1)%longitude
        faces.append((a,b,b+longitude,a+longitude))
    a,b=1+(latitude-2)*longitude+k,1+(latitude-2)*longitude+(k+1)%longitude
    faces.append((a,b,bottom))
mesh=bpy.data.meshes.new('Retopologized short nose')
mesh.from_pydata(verts,[],faces); mesh.update()
for material in nose.data.materials:
    mesh.materials.append(material)
nose.modifiers.clear(); nose.data=mesh
bm=bmesh.new(); bm.from_mesh(mesh); bmesh.ops.recalc_face_normals(bm,faces=list(bm.faces)); bm.to_mesh(mesh); bm.free()
for p in mesh.polygons:
    p.use_smooth=True
after=probe(head)
assert after['nonmanifold']==0
assert .96<after['volume']/before['volume']<1.06
assert after['bounds'][2]==before['bounds'][2]
assert untouched=={o.name:fingerprint(o) for o in scene.objects if o.type=='MESH' and o not in (head,nose)}
assert probe(nose)['nonmanifold']==0
report={'source':str(SOURCE),'before_head':before,'after_head':after,'nose':probe(nose),
        'removed_faces':removed_faces,'new_patch_faces':len(patch),'seam_vertices':len(boundary),
        'unchanged_retained_head_vertices':len(preserved),'unchanged_other_meshes':len(untouched),
        'patch_front_folded_faces':0,'visual_acceptance':'pending'}
(OUT/'muzzle-report.json').write_text(json.dumps(report,indent=2),encoding='utf8')
bpy.ops.wm.save_as_mainfile(filepath=str(OUT/'rabbit-conductor-v5-muzzle-rebuilt.blend'))
bpy.ops.object.select_all(action='DESELECT')
for obj in scene.objects:
    if obj.type=='MESH':
        obj.select_set(True)
bpy.context.view_layer.objects.active=head
bpy.ops.export_scene.gltf(filepath=str(OUT/'rabbit-conductor-v5-muzzle-rebuilt.glb'),export_format='GLB',
    use_selection=True,export_yup=True,export_apply=True,export_animations=False,export_cameras=False,export_lights=False)
render_face(scene,OUT,'after')
print('REBUILT_MUZZLE '+json.dumps(report))
