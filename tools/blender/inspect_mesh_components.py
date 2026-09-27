"""Print connected-component bounds for the largest skinned mesh in a GLB."""

import os

import bpy
from mathutils import Vector


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.environ["BLENDER_INPUT_GLB"])
mesh_obj = max(
    (obj for obj in bpy.context.scene.objects if obj.type == "MESH"),
    key=lambda obj: len(obj.data.vertices),
)

vertex_count = len(mesh_obj.data.vertices)
parents = list(range(vertex_count))


def find(index: int) -> int:
    while parents[index] != index:
        parents[index] = parents[parents[index]]
        index = parents[index]
    return index


def union(left: int, right: int) -> None:
    root_left = find(left)
    root_right = find(right)
    if root_left != root_right:
        parents[root_right] = root_left


for edge in mesh_obj.data.edges:
    union(edge.vertices[0], edge.vertices[1])

components: dict[int, list[int]] = {}
for vertex in mesh_obj.data.vertices:
    components.setdefault(find(vertex.index), []).append(vertex.index)

reports = []
for indices in components.values():
    points = [mesh_obj.matrix_world @ mesh_obj.data.vertices[index].co for index in indices]
    minimum = Vector((min(p.x for p in points), min(p.y for p in points), min(p.z for p in points)))
    maximum = Vector((max(p.x for p in points), max(p.y for p in points), max(p.z for p in points)))
    size = maximum - minimum
    reports.append((len(indices), size.x, size.y, size.z, minimum.x, minimum.y, minimum.z, maximum.x, maximum.y, maximum.z))

for report in sorted(reports, reverse=True)[:40]:
    print("COMPONENT vertices=%d size=(%.4f,%.4f,%.4f) min=(%.4f,%.4f,%.4f) max=(%.4f,%.4f,%.4f)" % report)
