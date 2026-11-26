"""Karakter detail tinggi (art/karakter/blend/<id>.blend) -> orang game ringan assets/models/orang_<id>.glb.

    python tools/blender/karakter/ringan.py assets/models      (butuh `pip install bpy`)

Dari ±350 ribu poligon jadi ±5 ribu segitiga per tokoh, dibagi mesh yang diwarnai per orang di drive3d.js:
- 'kulit'  badan (bagian di balik baju sudah disembunyikan modifier Mask_tutup_*), putih × warna kulit per orang
- 'baju'   kemeja/koko/kaus beserta kerah, plaket, saku; putih × warna baju per orang
- 'celana' celana; putih × warna celana per orang
- 'rambut' helai rambut dan kumis diubah jadi volume padat (Curves tidak bisa diekspor); putih × warna rambut per orang
- 'lain'   mata, sandal, handuk, peci, kancing: warna tetap
Diputar menghadap +Y (aset game), telapak kaki di z = 0, semua sisi halus.

Kerangka untuk animasi (jalan, melambai, duduk di motor): sendi pinggul, lutut, bahu, siku diukur dari badan, lalu
Blender menghitung bobot tiap titik (ARMATURE_AUTO, "bone heat"). Bobot disimpan sebagai atribut glTF _LEGL, _LEGR, _KNEEL,
_KNEER, _ARML, _ARMR, _ELBL, _ELBR (0..1; L = sisi +x), dan posisi sendi di custom property 'sendi' pada mesh 'kulit'
(8 titik × 3 + tinggi badan, dalam meter, ruang Blender sesudah diputar). drive3d.js memutar titik di vertex shader.
siapkan(tokoh) mengembalikan objek bagian beserta bobot dan sendinya, dipakai juga oleh tools/blender/motor/ringan.py
untuk pengendara yang duduk.
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
# SKALA=2.5 untuk paket model HD (npm run assets-hd, mode grafis Ultra)
TARGET = {k: int(v * float(os.environ.get('SKALA', '1'))) for k, v in TARGET.items()}
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


def ukur_sendi(P):
    """Sendi dari titik badan (numpy N×3, ruang akhir: z atas, depan +Y). Lebar diukur dari celah antara badan dan lengan."""
    import numpy as np
    H = float(P[:, 2].max())

    def pisah(z0, z1, xmin, xmax):
        """centroid tiap sisi untuk titik di pita tinggi [z0, z1]·H dengan |x| di luar celah terbesar dalam [xmin, xmax]."""
        Q = P[(P[:, 2] > z0 * H) & (P[:, 2] < z1 * H)]
        out = {}
        for s in (1, -1):
            S = Q[Q[:, 0] * s > 0]; ax = np.sort(np.abs(S[:, 0]))
            ok = (ax[:-1] > xmin) & (ax[:-1] < xmax); g = np.diff(ax); g[~ok] = 0
            cut = ax[np.argmax(g)] + g.max() / 2 if g.max() > 0.004 else xmin
            R = S[np.abs(S[:, 0]) > cut]
            out[s] = R.mean(0)
        return out
    knee = pisah(0.28, 0.30, 0.0, 0.2)           # lutut: kaki kiri dan kanan
    elb = pisah(0.60, 0.63, 0.10, 0.20)          # siku: lengan di luar celah pinggang
    yc = float(np.median(P[(P[:, 2] > 0.5 * H) & (P[:, 2] < 0.7 * H), 1]))
    J = {}
    for s, L in ((1, 'L'), (-1, 'R')):
        k, e = knee[s], elb[s]
        J['hip' + L] = (s * 0.056 * H, yc, 0.515 * H)
        J['knee' + L] = (float(k[0]), float(k[1]), 0.29 * H)
        J['ankle' + L] = (float(k[0]), float(k[1]) - 0.01, 0.05 * H)
        J['sh' + L] = (float(e[0]) - s * 0.035, yc, 0.815 * H)
        J['elb' + L] = (float(e[0]), float(e[1]), 0.615 * H)
        J['wr' + L] = (float(e[0]) + s * 0.02, float(e[1]) + 0.02, 0.47 * H)
    return J, H


URUT = ('hipL', 'hipR', 'kneeL', 'kneeR', 'shL', 'shR', 'elbL', 'elbR')
SALURAN = ('_LEGL', '_LEGR', '_KNEEL', '_KNEER', '_ARML', '_ARMR', '_ELBL', '_ELBR')


def kerangka(J, H):
    """Armature sederhana: badan, paha/betis, lengan atas/bawah per sisi."""
    arm = bpy.data.armatures.new('kerangka'); ob = bpy.data.objects.new('kerangka', arm)
    bpy.context.scene.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob; bpy.ops.object.mode_set(mode='EDIT')
    E = arm.edit_bones
    tengah = Vector(((J['hipL'][0] + J['hipR'][0]) / 2, J['hipL'][1], J['hipL'][2]))
    bd = E.new('badan'); bd.head = tengah; bd.tail = Vector((0, tengah.y, H))
    for L in 'LR':
        a = E.new('paha.' + L); a.head = J['hip' + L]; a.tail = J['knee' + L]; a.parent = bd
        b = E.new('betis.' + L); b.head = J['knee' + L]; b.tail = J['ankle' + L]; b.parent = a; b.use_connect = True
        c = E.new('lengan.' + L); c.head = J['sh' + L]; c.tail = J['elb' + L]; c.parent = bd
        d = E.new('bawah.' + L); d.head = J['elb' + L]; d.tail = J['wr' + L]; d.parent = c; d.use_connect = True
    bpy.ops.object.mode_set(mode='OBJECT')
    return ob


def bobot_proxy(ob, arm):
    """Bobot panas Blender pada badan utuh (permukaan tertutup, jadi ketiak dan selangkangan bersih)."""
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
    bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    mw = ob.matrix_world.copy(); ob.parent = None; ob.matrix_world = mw
    for m in list(ob.modifiers):
        ob.modifiers.remove(m)


def bobot(ob, src):
    """Salin bobot dari badan utuh ke titik terdekat (baju dan celana ikut badan di bawahnya) -> 8 saluran per titik."""
    import numpy as np
    for g in src.vertex_groups:
        ob.vertex_groups.new(name=g.name)
    dt = ob.modifiers.new('salin', 'DATA_TRANSFER'); dt.object = src; dt.use_vert_data = True
    dt.data_types_verts = {'VGROUP_WEIGHTS'}; dt.vert_mapping = 'POLYINTERP_NEAREST'
    dt.layers_vgroup_select_src = 'ALL'; dt.layers_vgroup_select_dst = 'NAME'
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier='salin')
    n = len(ob.data.vertices); W = {g.name: np.zeros(n) for g in ob.vertex_groups}
    idx = {g.index: g.name for g in ob.vertex_groups}
    for v in ob.data.vertices:
        for ge in v.groups:
            W[idx[ge.group]][v.index] = ge.weight
    tot = sum(W.values()) if W else np.zeros(n)
    kosong = tot < 1e-6
    tot[kosong] = 1
    g = lambda k: W.get(k, np.zeros(n)) / tot
    ch = {'_LEGL': g('paha.L') + g('betis.L'), '_LEGR': g('paha.R') + g('betis.R'), '_KNEEL': g('betis.L'), '_KNEER': g('betis.R'),
          '_ARML': g('lengan.L') + g('bawah.L'), '_ARMR': g('lengan.R') + g('bawah.R'), '_ELBL': g('bawah.L'), '_ELBR': g('bawah.R')}
    # pertegas batas: bobot panas meluber ke badan di sekitar ketiak dan selangkangan, yang ikut terseret saat lengan
    # diangkat tinggi. Bobot di bawah 0,3 dibuang, di atas 0,7 penuh, di antaranya halus.
    for k, w in ch.items():
        x = np.clip((w - 0.3) / 0.4, 0, 1); ch[k] = x * x * (3 - 2 * x)
    ob.vertex_groups.clear()
    return ch


def siapkan(tokoh):
    """Buka tokoh, kurangi segitiga, hitung sendi dan bobot. Hasil: {bagian: objek}, sendi, tinggi."""
    import numpy as np
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
    # badan utuh (tanpa Mask) untuk mengukur sendi dan sebagai sumber bobot
    bd = bpy.data.objects['Badan']
    Pb = np.array([bd.matrix_world @ v.co for v in bd.data.vertices])
    proxy = bd.data.copy(); proxy.transform(bd.matrix_world); proxy = kurangi(proxy, 12000)
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
    Pb = np.array([M @ Vector(p) for p in Pb]); proxy.transform(M)
    pb = bmesh.new(); pb.from_mesh(proxy); bms_proxy = pb
    # satu bmesh per bagian, warna dan jenis material per sudut seperti build_assets.Asset
    bms = {}
    for (bag, hx, k), ms in kumpul.items():
        me = gabung(ms)
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        me = kurangi(me, max(60, int(TARGET[bag] * n / max(1, jumlah[bag]))))
        me.transform(M)
        col = B.hexc(hx) if hx else B.PUTIH
        a = (B.KELAS.index(k) + 0.5) / 16
        t = bmesh.new(); cl = t.loops.layers.float_color.new('Col'); t.from_mesh(me)
        cl = t.loops.layers.float_color.get('Col')
        for f in t.faces:
            f.smooth = True
            for lp in f.loops:
                lp[cl] = (col[0], col[1], col[2], a)
        tmp = bpy.data.meshes.new('t'); t.to_mesh(tmp); t.free()
        bms.setdefault(bag, bmesh.new())
        if not bms[bag].loops.layers.float_color.get('Col'):
            bms[bag].loops.layers.float_color.new('Col')
        bms[bag].from_mesh(tmp)
    bpy.ops.wm.read_factory_settings(use_empty=True)
    J, H = ukur_sendi(Pb)
    arm = kerangka(J, H)
    pm = bpy.data.meshes.new('proxy'); bms_proxy.to_mesh(pm); bms_proxy.free()
    src = bpy.data.objects.new('proxy', pm); bpy.context.scene.collection.objects.link(src)
    bobot_proxy(src, arm)
    obs, ch = {}, {}
    for bag, b in bms.items():
        me = bpy.data.meshes.new(bag); b.to_mesh(me); b.free()
        try:
            me.color_attributes.active_color = me.color_attributes['Col']
            me.attributes.active_color_name = 'Col'; me.attributes.default_color_name = 'Col'
        except Exception:
            pass
        ob = bpy.data.objects.new(bag, me); bpy.context.scene.collection.objects.link(ob)
        ch[bag] = bobot(ob, src)
        # bobot bocor ke benda yang hanya dekat: celana/sandal/handuk tidak ikut lengan, ujung baju ikut paha tapi tidak betis
        nol = {'celana': ('_ARML', '_ARMR', '_ELBL', '_ELBR'), 'lain': ('_ARML', '_ARMR', '_ELBL', '_ELBR'),
               'baju': ('_KNEEL', '_KNEER'), 'rambut': SALURAN}.get(bag, ())
        for k in nol:
            ch[bag][k] = ch[bag][k] * 0
        obs[bag] = ob
    bpy.data.objects.remove(arm); bpy.data.objects.remove(src)
    return obs, ch, J, H


def tulis(obs, ch, J, H, nama):
    """Ekspor bagian-bagian ke OUT/nama.glb dengan atribut bobot dan sendi."""
    for bag, ob in obs.items():
        me = ob.data
        for k, w in ch[bag].items():
            at = me.attributes.get(k) or me.attributes.new(k, 'FLOAT', 'POINT')
            at.data.foreach_set('value', [float(x) for x in w])
    obs['kulit']['sendi'] = [round(float(c), 4) for k in URUT for c in J[k]] + [round(float(H), 4)]
    for o in bpy.context.scene.objects:
        o.select_set(o in obs.values())
    path = os.path.join(OUT, nama + '.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                              export_texcoords=False, export_normals=True, export_materials='NONE', export_animations=False,
                              export_vertex_color='ACTIVE', export_attributes=True, export_extras=True, export_skins=False)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs.values())
    print(f'{nama:14s} {tris:6d} segitiga  {os.path.getsize(path) / 1024:6.1f} KB')


def ubah(tokoh):
    obs, ch, J, H = siapkan(tokoh)
    tulis(obs, ch, J, H, 'orang_' + tokoh)


if __name__ == '__main__':
    for t in (os.environ["TOKOH"].split(",") if os.environ.get("TOKOH") else TOKOH):
        ubah(t)
