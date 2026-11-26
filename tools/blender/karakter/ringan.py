"""Karakter detail tinggi (art/karakter/blend/<id>.blend) -> orang game ringan assets/models/orang_<id>.glb.

    python tools/blender/karakter/ringan.py assets/models      (butuh `pip install bpy`)

Dari ±350 ribu poligon jadi ±5 ribu segitiga per tokoh, dibagi mesh yang diwarnai per orang di drive3d.js:
- 'kulit'  badan (bagian di balik baju sudah disembunyikan modifier Mask_tutup_*), putih × warna kulit per orang
- 'baju'   kemeja/koko/kaus beserta kerah, plaket, saku; putih × warna baju per orang
- 'celana' celana; putih × warna celana per orang
- 'rambut' helai rambut dan kumis diubah jadi volume padat (Curves tidak bisa diekspor); putih × warna rambut per orang
- 'lain'   mata, sandal, handuk, peci, kancing: warna tetap
Diputar menghadap +Y (aset game), telapak kaki di z = 0, semua sisi halus.
"""
import bpy, bmesh, math, os, sys
from mathutils import Matrix, Vector

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..', '..'))
OUT = os.path.abspath(sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models')
sys.argv = [sys.argv[0], OUT]
sys.path.insert(0, os.path.join(HERE, '..'))
import build_assets as B   # noqa: E402

TOKOH = ('ujang', 'sobari', 'rina', 'dimas')
# segitiga per bagian
TARGET = {'kulit': 1900, 'baju': 1500, 'celana': 650, 'rambut': 550, 'lain': 700}
BAGIAN = {   # nama material -> bagian, warna tetap (hex) untuk 'lain', jenis material
    'Kulit_Realistis': ('kulit', None, 'polos'), 'Kemeja': ('baju', None, 'kain'), 'Celana': ('celana', None, 'kain'),
    'Mata_Tekstur': ('lain', '2a211c', 'polos'), 'Mata_Kornea': (None, None, None),
    'Sandal_Alas': ('lain', 'e8e6e0', 'karet'), 'Sandal_Tali': ('lain', '2b2622', 'karet'),
    'Handuk': ('lain', 'f2f0e8', 'kain'), 'Handuk_Garis': ('lain', 'b3261e', 'kain'),
    'Peci_Beludru': ('lain', '1c1c1e', 'kain'), 'Kancing': ('lain', 'eeeeea', 'polos'), 'Karet_Rambut': ('lain', '202020', 'karet'),
}


def node_rambut(radius=0.0055, voxel=0.0045):
    """Geometry nodes: helai rambut -> titik -> volume -> permukaan padat."""
    ng = bpy.data.node_groups.new('rambut_padat', 'GeometryNodeTree')
    ng.interface.new_socket('Geometry', in_out='INPUT', socket_type='NodeSocketGeometry')
    ng.interface.new_socket('Geometry', in_out='OUTPUT', socket_type='NodeSocketGeometry')
    N, L = ng.nodes, ng.links
    gi, go = N.new('NodeGroupInput'), N.new('NodeGroupOutput')
    c2p = N.new('GeometryNodeCurveToPoints'); c2p.mode = 'EVALUATED'
    p2v = N.new('GeometryNodePointsToVolume')
    p2v.inputs['Resolution Mode'].default_value = 'Size'
    p2v.inputs['Voxel Size'].default_value = voxel; p2v.inputs['Radius'].default_value = radius
    v2m = N.new('GeometryNodeVolumeToMesh')
    v2m.inputs['Resolution Mode'].default_value = 'Size'; v2m.inputs['Voxel Size'].default_value = voxel
    L.new(gi.outputs[0], c2p.inputs[0]); L.new(c2p.outputs[0], p2v.inputs['Points'])
    L.new(p2v.outputs[0], v2m.inputs['Volume']); L.new(v2m.outputs[0], go.inputs[0])
    return ng


def gabung(meshes):
    """Satukan beberapa mesh (sudah di ruang dunia) jadi satu mesh baru."""
    b = bmesh.new()
    for me in meshes:
        b.from_mesh(me)
    out = bpy.data.meshes.new('gabung')
    b.to_mesh(out); b.free()
    return out


def kurangi(me, target):
    """Decimate satu mesh sampai ±target segitiga."""
    n = sum(len(p.vertices) - 2 for p in me.polygons)
    if n <= target:
        return me
    ob = bpy.data.objects.new('tmp', me); bpy.context.scene.collection.objects.link(ob)
    d = ob.modifiers.new('d', 'DECIMATE'); d.ratio = target / n; d.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    out = ob.evaluated_get(dg).to_mesh().copy()
    bpy.data.objects.remove(ob)
    return out


def ubah(tokoh):
    bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'art', 'karakter', 'blend', tokoh + '.blend'))
    dg = bpy.context.evaluated_depsgraph_get()
    kumpul = {}          # (bagian, hex, jenis) -> [mesh]
    for ob in list(bpy.data.objects):
        if ob.type != 'MESH' or ob.hide_render or ob.name in ('Cyclorama',) or not ob.data.materials:
            continue
        me = ob.evaluated_get(dg).to_mesh().copy(); me.transform(ob.matrix_world)
        for mi, m in enumerate(me.materials):
            info = BAGIAN.get(m.name if m else '', None)
            if not info or not info[0]:
                continue
            b = bmesh.new(); b.from_mesh(me)
            bmesh.ops.delete(b, geom=[f for f in b.faces if f.material_index != mi], context='FACES')
            if not b.faces:
                b.free(); continue
            sub = bpy.data.meshes.new('sub'); b.to_mesh(sub); b.free()
            kumpul.setdefault(info, []).append(sub)
    # rambut dan kumis: helai -> volume padat (alis dan bulu mata terlalu kecil untuk skala game)
    ng = node_rambut()
    helai = []
    for ob in list(bpy.data.objects):
        if ob.type == 'CURVES' and ob.name.startswith(('Rambut', 'RambutIkat', 'Kumis')):
            g = ob.modifiers.new('padat', 'NODES'); g.node_group = ng
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in list(bpy.data.objects):
        if ob.type == 'CURVES' and ob.modifiers.get('padat'):
            # keluaran node = mesh, tapi objeknya tetap Curves: salin lewat bmesh selagi GeometrySet masih hidup
            gs = ob.evaluated_get(dg).evaluated_geometry(); gm = gs.mesh
            if gm is None or not len(gm.vertices):
                continue
            b = bmesh.new(); b.from_mesh(gm); me = bpy.data.meshes.new('helai'); b.to_mesh(me); b.free(); del gs
            me.transform(ob.matrix_world); helai.append(me)
    if helai:
        kumpul[('rambut', None, 'polos')] = helai
    # bagi target segitiga ke tiap kelompok sebanding jumlah segitiganya di dalam bagian yang sama
    jumlah = {}
    for (bag, hx, k), ms in kumpul.items():
        jumlah[bag] = jumlah.get(bag, 0) + sum(sum(len(p.vertices) - 2 for p in m.polygons) for m in ms)
    # depan -Y -> +Y, telapak di z = 0
    zmin = min(v.co.z for ms in kumpul.values() for m in ms for v in m.vertices)
    M = Matrix.Rotation(math.pi, 4, 'Z') @ Matrix.Translation((0, 0, -zmin))
    A = B.Asset('orang_' + tokoh, 'orang')
    for (bag, hx, k), ms in kumpul.items():
        me = gabung(ms)
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        me = kurangi(me, max(60, int(TARGET[bag] * n / max(1, jumlah[bag]))))
        me.transform(M)
        col = B.hexc(hx) if hx else B.PUTIH

        def fn(b, me=me):
            b.from_mesh(me)
        fn.halus = 'semua'
        A.add(col, fn, bag, k=k)
    A.export()


if __name__ == '__main__':
    for t in (os.environ["TOKOH"].split(",") if os.environ.get("TOKOH") else TOKOH):
        ubah(t)
