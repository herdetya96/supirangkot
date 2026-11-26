"""Motor detail (tools/blender/motor/build.py) + pengendara duduk -> model game ringan.

    python tools/blender/motor/ringan.py assets/models      (butuh `pip install bpy`)

- motor_parkir.glb: skuter saja (±2.500 segitiga), cat bodi = penanda CAT (warna per motor di JS).
- motor.glb: skuter + pengendara. Pengendara = tokoh ringan (karakter/ringan.siapkan) yang didudukkan dengan kerangkanya
  (karakter/pose.py): sudut lutut dicari supaya telapak menapak dek, sudut bahu/siku dicari supaya tangan di setang.
  Baju = penanda KEDUA (warna jaket per motor), helm baru = penanda KETIGA (warna helm per motor), rambut tidak dipakai.
"""
import bpy, bmesh, math, os, subprocess, sys, tempfile
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models')
sys.argv = [sys.argv[0], OUT]
sys.path.insert(0, os.path.join(HERE, '..')); sys.path.insert(0, os.path.join(HERE, '..', 'karakter'))
import build_assets as B   # noqa: E402
import ringan as KR        # noqa: E402  (karakter/ringan.py)
import pose as PO          # noqa: E402

PENGENDARA = os.environ.get('PENGENDARA', 'dimas')
WARNA = {   # material motor -> (hex sRGB atau None = penanda CAT, jenis)
    'Cat': (None, 'cat'), 'Plastik': ('22262a', 'karet'), 'Jok': ('161616', 'karet'), 'Krom': ('c9ced2', 'logam'),
    'Ban': ('161616', 'karet'), 'Velg': ('8d9396', 'logam'), 'Kaca': ('1f2d38', 'kaca'), 'Lampu': ('fff3c4', 'kaca'),
    'Sein': ('f29b1d', 'kaca'), 'Rem': ('b3261e', 'kaca'), 'Pelat': ('15191c', 'polos'), 'Mesin': ('5a6066', 'logam'),
}
SEGITIGA_MOTOR = 1700
SEGITIGA_ORANG = 2400
DUDUK = Vector((0, -0.20, 0.885))     # titik tengah sendi pinggul pengendara
DEK_Z = 0.36                          # permukaan dek kaki
GRIP = Vector((0, 0.48, 1.035))       # pegangan setang


def data(me):
    """Mesh -> data Python biasa (bertahan walau adegan Blender dikosongkan)."""
    return ([tuple(v.co) for v in me.vertices], [tuple(p.vertices) for p in me.polygons])


def dari_data(b, d):
    vs = [b.verts.new(v) for v in d[0]]
    for f in d[1]:
        try:
            b.faces.new([vs[i] for i in f])
        except ValueError:
            pass


def kurangi(me, target):
    n = sum(len(p.vertices) - 2 for p in me.polygons)
    if n <= target:
        return me
    ob = bpy.data.objects.new('tmp', me); bpy.context.scene.collection.objects.link(ob)
    d = ob.modifiers.new('d', 'DECIMATE'); d.ratio = target / n; d.use_collapse_triangulate = True
    out = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()).to_mesh().copy()
    bpy.data.objects.remove(ob)
    return out


def motor_mesh():
    """Bangun motor detail di folder sementara, kurangi per objek, kembalikan [(mesh, warna, jenis)] di ruang dunia."""
    tmp = tempfile.mkdtemp(prefix='motor_')
    subprocess.run([sys.executable, os.path.join(HERE, 'build.py')], env=dict(os.environ, OUT=tmp, RENDER='0'), check=True, stdout=subprocess.DEVNULL)
    bpy.ops.wm.open_mainfile(filepath=os.path.join(tmp, 'motor.blend'))
    obs = [o for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Studio')]
    total = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in obs)
    out = []
    for o in obs:
        me = o.data.copy(); me.transform(o.matrix_world)
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        me = kurangi(me, max(12, int(SEGITIGA_MOTOR * n / total * 1.4)) if n > 40 else n)
        mn = o.data.materials[0].name if o.data.materials else ''
        hx, k = WARNA.get(mn.split('.')[0], ('9aa0a3', 'polos'))
        out.append((data(me), B.CAT if hx is None else B.hexc(hx), k))
    return out


def pengendara():
    """Tokoh ringan didudukkan di jok. Kembalikan {bagian: mesh} di ruang motor dan titik tengah kepala."""
    obs, ch, J, H = KR.siapkan(PENGENDARA)
    obs.pop('rambut', None)
    hip = (np.array(J['hipL']) + np.array(J['hipR'])) / 2

    def titik(bag):
        me = obs[bag].data; P = np.zeros(len(me.vertices) * 3); me.vertices.foreach_get('co', P); return P.reshape(-1, 3)
    rest = {b: titik(b) for b in obs}
    # telapak: titik kaki yang paling rendah (kulit + sandal); tangan: titik lengan bawah di bawah pergelangan
    kaki = {b: (ch[b]['_KNEEL'] + ch[b]['_KNEER']) > 0.5 for b in obs}
    tangan = (ch['kulit']['_ELBL'] + ch['kulit']['_ELBR'] > 0.9) & (rest['kulit'][:, 2] < 0.5 * H)
    geser = np.array(DUDUK) - hip
    best = None
    for knee in np.linspace(-1.9, -0.4, 31):           # lutut: telapak menapak dek
        s = {'hipL': 1.42, 'hipR': 1.42, 'kneeL': knee, 'kneeR': knee, 'badan': 0.12}
        zmin = min(PO.pose(rest[b], ch[b], J, s)[kaki[b]][:, 2].min() for b in obs if kaki[b].any()) + geser[2]
        if best is None or abs(zmin - DEK_Z) < best[0]:
            best = (abs(zmin - DEK_Z), knee)
    knee = best[1]; best = None
    for sh in np.linspace(0.4, 1.6, 25):               # bahu dan siku: tangan di pegangan
        for el in np.linspace(0.0, 1.4, 15):
            s = {'hipL': 1.42, 'hipR': 1.42, 'kneeL': knee, 'kneeR': knee, 'shL': sh, 'shR': sh, 'elbL': el, 'elbR': el, 'badan': 0.12}
            h = PO.pose(rest['kulit'], ch['kulit'], J, s)[tangan].mean(0) + geser
            e = (h[1] - GRIP.y) ** 2 + (h[2] - GRIP.z) ** 2
            if best is None or e < best[0]:
                best = (e, sh, el)
    s = {'hipL': 1.42, 'hipR': 1.42, 'kneeL': knee, 'kneeR': knee, 'shL': best[1], 'shR': best[1], 'elbL': best[2], 'elbR': best[2], 'badan': 0.12}
    print(f'pengendara {PENGENDARA}: lutut {knee:.2f}, bahu {best[1]:.2f}, siku {best[2]:.2f}, tangan meleset {math.sqrt(best[0]) * 100:.1f} cm')
    PO.terapkan(obs, ch, J, s)
    out = []
    jumlah = sum(sum(len(p.vertices) - 2 for p in ob.data.polygons) for ob in obs.values())
    WARNA_ORANG = {'kulit': (B.hexc('a8714a'), 'polos'), 'celana': (B.hexc('2f3d4a'), 'kain'), 'baju': (B.KEDUA, 'kain')}
    for bag, ob in obs.items():
        me = ob.data.copy(); me.transform(Matrix.Translation(Vector(geser)))
        n = sum(len(p.vertices) - 2 for p in me.polygons)
        cl = me.color_attributes.get('Col')
        if bag == 'lain':
            # mata dan sandal: warna per sudut sudah ada; pisahkan per warna (Asset.add memberi satu warna per panggilan)
            grup = {}
            for p in me.polygons:
                cc = tuple(round(x, 3) for x in cl.data[p.loop_indices[0]].color[:3]) if cl else (0.2, 0.2, 0.2)
                grup.setdefault(cc, []).append(p.index)
            for cc, idx in grup.items():
                b = bmesh.new(); b.from_mesh(me); s = set(idx)
                bmesh.ops.delete(b, geom=[f for f in b.faces if f.index not in s], context='FACES')
                sub = bpy.data.meshes.new('sub'); b.to_mesh(sub); b.free()
                out.append((data(sub), (*cc, 1.0), 'karet'))
            continue
        me = kurangi(me, max(60, int(SEGITIGA_ORANG * n / jumlah)))
        c, k = WARNA_ORANG.get(bag, (B.PUTIH, 'polos'))
        out.append((data(me), c, k))
        if bag == 'kulit':
            P = np.array(data(me)[0]); top = P[P[:, 2] > P[:, 2].max() - 0.22]
            pusat, puncak = Vector(top.mean(0)), float(P[:, 2].max())
    return out, pusat, puncak


def helm(A, pusat, puncak):
    """Helm setengah terbuka: tempurung berlapis, bibir, kaca gelap pendek."""
    c = Vector((pusat.x, pusat.y - 0.005, puncak - 0.105))

    def tempurung(b):
        bmesh.ops.create_uvsphere(b, u_segments=20, v_segments=12, radius=1.0)
        hapus = [v for v in b.verts if v.co.z < -0.25 + 0.55 * max(0.0, v.co.y)]     # terbuka di muka, lebih rendah di belakang
        bmesh.ops.delete(b, geom=hapus, context='VERTS')
        for v in b.verts:
            v.co = Vector((v.co.x * 0.128, v.co.y * 0.150, v.co.z * 0.135)) + c
    tempurung.halus = 'semua'
    A.add(B.KETIGA, tempurung, 'main', k='cat')

    def kaca(b):
        bmesh.ops.create_uvsphere(b, u_segments=16, v_segments=8, radius=1.0)
        hapus = [v for v in b.verts if not (v.co.y > 0.55 and -0.05 < v.co.z < 0.45)]
        bmesh.ops.delete(b, geom=hapus, context='VERTS')
        for v in b.verts:
            v.co = Vector((v.co.x * 0.135, v.co.y * 0.158, v.co.z * 0.14)) + c
    kaca.halus = 'semua'
    A.add(B.KACA, kaca, 'main')


def tambah(A, d, col, k, part='main'):
    def fn(b, d=d):
        dari_data(b, d)
    fn.halus = 'semua'
    A.add(col, fn, part, k=k)


def buat():
    orang, pusat, puncak = pengendara()
    motor = motor_mesh()
    for nama, ikut in (('motor_parkir', False), ('motor', True)):
        A = B.Asset(nama)
        A.add(B.BAYANG, B.plane((0, 0, 0.012), 0.55, 1.9))
        for d, c, k in motor + (orang if ikut else []):
            tambah(A, d, c, k)
        if ikut:
            helm(A, pusat, puncak)
        A.export()


if __name__ == '__main__':
    buat()
