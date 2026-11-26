"""NARIK — render gambar angkot untuk layar menu (satu gambar per warna cat), dari model assets/models/angkot_05.glb.

Jalankan setelah build_assets.py:
    python tools/blender/render_sprites.py assets/img

Hasil: assets/img/angkot-<warna>.webp, 720×439, latar transparan, sudut depan-kiri (sisi pintu).
"""
import bpy, math, os, sys
from mathutils import Vector

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/img'
SRC = os.path.join(os.path.dirname(__file__), '..', '..', 'assets', 'models', 'angkot_05.glb')
os.makedirs(OUT, exist_ok=True)
WARNA = {'hijau': '1a8f4c', 'biru': '35b3c9', 'kuning': 'f2b90f', 'merah': 'd43a2b', 'ungu': '7a4fd0'}


def lin(c):  # warna game (sRGB) → linear untuk shader Blender
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def setup():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 48
    try:
        sc.cycles.use_denoising = True
    except Exception:
        pass
    sc.render.resolution_x, sc.render.resolution_y = 720, 439
    sc.render.film_transparent = True
    sc.view_settings.view_transform = 'Standard'
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.image_settings.quality = 88
    w = bpy.data.worlds.new('dunia')
    w.use_nodes = True
    bg = w.node_tree.nodes['Background']
    bg.inputs[0].default_value = (0.55, 0.6, 0.65, 1)
    bg.inputs[1].default_value = 0.9
    sc.world = w
    bpy.ops.import_scene.gltf(filepath=os.path.abspath(SRC))
    obj = [o for o in sc.objects if o.type == 'MESH'][0]
    me = obj.data
    # buang pelat bayangan model game (semua titiknya di lantai); diganti penangkap bayangan Cycles
    import bmesh
    bm = bmesh.new(); bm.from_mesh(me)
    lantai = [f for f in bm.faces if all(v.co.z < 0.02 for v in f.verts) and f.calc_area() > 1.0]
    bmesh.ops.delete(bm, geom=lantai, context='FACES'); bm.to_mesh(me); bm.free()
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    bpy.context.active_object.is_shadow_catcher = True
    attr = me.color_attributes[0]
    base = [tuple(d.color) for d in attr.data]
    mat = bpy.data.materials.new('cat')
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    at = nt.nodes.new('ShaderNodeAttribute')
    at.attribute_name = attr.name
    nt.links.new(at.outputs['Color'], bsdf.inputs['Base Color'])
    bsdf.inputs['Roughness'].default_value = 0.45
    me.materials.clear()
    me.materials.append(mat)
    cam = bpy.data.objects.new('kamera', bpy.data.cameras.new('kamera'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.lens = 46
    # glTF: depan angkot = -Z three.js = +Y Blender setelah impor. Kamera di depan-kiri, sedikit di atas.
    cam.location = Vector((-5.0, 4.4, 2.0))
    target = Vector((0.05, 0.0, 0.95))
    cam.rotation_euler = (target - cam.location).to_track_quat('-Z', 'Y').to_euler()
    sun = bpy.data.objects.new('matahari', bpy.data.lights.new('matahari', 'SUN'))
    sc.collection.objects.link(sun)
    sun.data.energy = 3.2
    sun.data.angle = math.radians(25)
    sun.rotation_euler = (math.radians(18), 0, math.radians(-40))   # hampir di atas kepala: bayangan pendek di bawah angkot
    fill = bpy.data.objects.new('isi', bpy.data.lights.new('isi', 'AREA'))
    sc.collection.objects.link(fill)
    fill.data.energy = 400
    fill.data.size = 4
    fill.location = (-4, 6, 4)
    fill.rotation_euler = (Vector((0, 0, 1)) - fill.location).to_track_quat('-Z', 'Y').to_euler()
    return sc, attr, base


def render():
    sc, attr, base = setup()
    for nama, hx in WARNA.items():
        cat = tuple(int(hx[i:i + 2], 16) / 255 for i in (0, 2, 4))
        for d, c in zip(attr.data, base):
            r, g, b = c[0], c[1], c[2]
            if r > 0.98 and g < 0.02 and b > 0.98:
                r, g, b = cat
            d.color = (lin(r), lin(g), lin(b), 1)
        sc.render.filepath = os.path.abspath(os.path.join(OUT, f'angkot-{nama}.webp'))
        bpy.ops.render.render(write_still=True)
        print('render', nama)


if __name__ == '__main__':
    render()
