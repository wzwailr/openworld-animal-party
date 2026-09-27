"""Read-only patch-boundary investigation on an in-memory mesh copy."""
import bpy
import bmesh
import math
import json

head = next(o for o in bpy.context.scene.objects if o.type=='MESH' and o.name.startswith('Head - continuous'))
bm = bmesh.new(); bm.from_mesh(head.data)
cut = [f for f in bm.faces if (f.calc_center_median().x/.083)**2+((f.calc_center_median().z-.626)/.052)**2 < 1
       and f.calc_center_median().y < -.045]
cut_count = len(cut)
bmesh.ops.delete(bm,geom=cut,context='FACES')
edges = [e for e in bm.edges if e.is_boundary]
neighbours = {}
for e in edges:
    a,b=e.verts
    neighbours.setdefault(a,[]).append(b)
    neighbours.setdefault(b,[]).append(a)
assert all(len(ns)==2 for ns in neighbours.values()), 'Patch boundary has a branch'
loops=[]; unused=set(neighbours)
while unused:
    start=next(iter(unused)); prev=None; curr=start; loop=[]
    while curr not in loop:
        loop.append(curr); unused.remove(curr)
        nxt=next(v for v in neighbours[curr] if v!=prev)
        prev,curr=curr,nxt
    assert curr==start
    loops.append(loop)
details=[]
for loop in loops:
    theta=[math.atan2((v.co.z-.626)/.052,v.co.x/.083) for v in loop]
    delta=[(theta[(i+1)%len(theta)]-t+math.pi)%(2*math.pi)-math.pi for i,t in enumerate(theta)]
    details.append({'vertices':len(loop),'positive_steps':sum(d>0 for d in delta),
                    'negative_steps':sum(d<0 for d in delta),'angle_sum':sum(delta),
                    'bounds':[[min(v.co[i] for v in loop),max(v.co[i] for v in loop)] for i in range(3)]})
print('PATCH_PROBE '+json.dumps({'removed_faces':cut_count,'boundary_loops':details}))
bm.free()
