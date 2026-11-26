"""NARIK — aset 3D mini-game nyetir, dimodelkan prosedural di Blender lalu diekspor ke .glb.

Jalankan (butuh Blender sebagai modul Python: `pip install bpy`, Blender 4.2+):
    python tools/blender/build_assets.py assets/models

Konvensi:
- Satuan meter. Depan kendaraan/bangunan: kendaraan menghadap +Y, bangunan pinggir jalan menghadap +X (ke jalan).
  Tanah di z = 0. Di three.js 1 m = 25 unit (lihat M2U di drive3d.js).
- Tiap aset digabung jadi sesedikit mungkin mesh, warna disimpan per sudut (atribut warna 'Col', float, linear)
  supaya satu kendaraan = satu draw call di HP.
- Warna penanda yang diganti di JavaScript: CAT (1,0,1) = cat badan / dinding, KEDUA (0,1,1) = baju / atap,
  KETIGA (0.5,0,1) = helm / kanopi. Mesh bernama khusus (mis. 'baju', 'bulb', 'lamp0') dipakai terpisah di JS.
"""
import bpy, bmesh, math, os, random, sys
from mathutils import Matrix, Vector, Euler

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models'
os.makedirs(OUT, exist_ok=True)


# jenis material (urutan = lapisan atlas assets/img/detail.webp dan DETAIL di drive3d.js); disimpan di alfa warna titik
KELAS = ['polos', 'cat', 'logam', 'kaca', 'karet', 'plester', 'bata', 'genteng', 'seng', 'kayu', 'aspal', 'paving', 'beton', 'rumput', 'kain', 'daun']
WARNA_KELAS = {
    'kayu': '8a6a3e 7a5a2e 6b4f33 8a5d33 6e4a2a 5b4532 8a6e4b c9a66b 9a7a4e 6b5a45 6b4f2a 5b4632',
    'seng': '9aa3a8 7f888d 8f9aa0 7d878d 3e6fb1 2a6fb5 2f6fb0 245a91 cdc6b2',
    'genteng': 'b5523b 8e3f32 c4683f 6f2f24',
    'beton': '9a9590 9a9a96 7d776c 6f6a60 a7abad c9b98a 8f8676 9a9184 a8a091 bdb7a4 8f9396 b9bdc0 d6d6d6 dddddd',
    'paving': 'b8b2a7 cfc7b0 d8d2c0 b9b1a0 e9e4d6 e6dcc0 d6ccb2',
    'aspal': '9aa0a3',
    'rumput': '7fb04f',
    'daun': '4f8a3c 3f7a35 5e9a46 467f37 2f6a2a 2f5d2a',
    'logam': 'c0c4c7 8d9396 5a6066 4a5056 7d8286 6f7d86 e8e8e8 3a3f44 b8bcc0 c9ced2 333333 b9bdc0',
    'kaca': '5d7a8c 3f6f8f 1f3a4f 2f4a5c 2f4a3c cfe6ee 1f2d38 fff3c4 f29b1d b3261e 15191c',
    'kain': 'c8b07a 8a3b2a 7a3326',
    'cat': '2f8f5b d33a2b e07b39 e6c84a',
}
HEXK = {}


def hexc(h):
    h = h.lstrip('#').lower()
    c = (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, 1.0)
    for k, lst in WARNA_KELAS.items():
        if h in lst.split():
            HEXK[c] = k
    return c


CAT, KEDUA, KETIGA = (1, 0, 1, 1), (0, 1, 1, 1), (0.5, 0, 1, 1)
PUTIH = (1, 1, 1, 1)
KACA, BAN, VELG, KROM, GELAP = hexc('1f2d38'), hexc('161616'), hexc('b8bcc0'), hexc('c9ced2'), hexc('23292e')
LAMPU, SEIN, REMC, BAYANG = hexc('fff3c4'), hexc('f29b1d'), hexc('b3261e'), hexc('20262b')


class Asset:
    """Kumpulan bmesh bernama; tiap bagian diwarnai per sudut. Alfa warna = jenis material (lihat KELAS).
    kind: 'kendaraan' | 'bangunan' | 'alam' | 'orang' menentukan arti warna penanda dan jenis bawaan."""

    def __init__(self, name, kind='kendaraan'):
        self.name, self.parts, self.kind = name, {}, kind

    def kelas(self, col, k):
        if k:
            return k
        if col in HEXK:
            return HEXK[col]
        bangunan = self.kind == 'bangunan'
        if col[:3] == CAT[:3]:
            return 'plester' if bangunan else 'cat'
        if col[:3] == KEDUA[:3]:
            return 'genteng' if bangunan else 'kain'
        if col[:3] == KETIGA[:3]:
            return 'kain' if bangunan else 'cat'
        if col[:3] in (BAN[:3], GELAP[:3]):
            return 'logam' if bangunan else 'karet'
        if col[:3] in (VELG[:3], KROM[:3]):
            return 'logam'
        if col[:3] in (KACA[:3], LAMPU[:3], SEIN[:3], REMC[:3]):
            return 'kaca'
        if col[:3] == BAYANG[:3]:
            return 'polos'
        return {'kendaraan': 'cat', 'bangunan': 'plester', 'alam': 'daun', 'orang': 'kain'}[self.kind]

    def bm(self, part='main'):
        if part not in self.parts:
            b = bmesh.new()
            b.loops.layers.float_color.new('Col')
            self.parts[part] = b
        return self.parts[part]

    def add(self, col, fn, part='main', k=None):
        """Bangun satu bagian di bmesh sementara yang bersih, warnai, lalu gabungkan ke mesh aset.
        (Membangun langsung di bmesh bersama tidak aman: bmesh memakai ulang slot titik yang sudah dihapus.)"""
        t = bmesh.new()
        cl = t.loops.layers.float_color.new('Col')
        fn(t)
        a = (KELAS.index(self.kelas(col, k)) + 0.5) / 16
        halus, sumbu = getattr(fn, 'halus', None), getattr(fn, 'sumbu', None)
        c = (col[0], col[1], col[2], a)
        for f in t.faces:
            for lp in f.loops:
                lp[cl] = c
            if halus == 'semua':
                f.smooth = True
            elif halus == 'sisi' and sumbu is not None:
                f.normal_update()
                f.smooth = abs(f.normal.dot(sumbu)) < 0.5      # sisi silinder halus, tutup tetap tajam
        me = bpy.data.meshes.new('sementara')
        t.to_mesh(me)
        t.free()
        self.bm(part).from_mesh(me)
        bpy.data.meshes.remove(me)

    def export(self):
        bpy.ops.wm.read_factory_settings(use_empty=True)
        objs = []
        for pname, b in self.parts.items():
            me = bpy.data.meshes.new(pname)
            b.to_mesh(me)
            b.free()
            try:
                me.color_attributes.active_color = me.color_attributes['Col']
            except Exception:
                pass
            try:
                me.attributes.active_color_name = 'Col'
                me.attributes.default_color_name = 'Col'
            except Exception:
                pass
            ob = bpy.data.objects.new(pname, me)
            bpy.context.scene.collection.objects.link(ob)
            objs.append(ob)
        for ob in bpy.context.scene.objects:
            ob.select_set(ob in objs)
        path = os.path.join(OUT, self.name + '.glb')
        kw = dict(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                  export_texcoords=False, export_normals=True, export_materials='NONE', export_animations=False)
        try:
            bpy.ops.export_scene.gltf(export_vertex_color='ACTIVE', **kw)
        except TypeError:
            bpy.ops.export_scene.gltf(export_colors=True, **kw)
        tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
        print(f'{self.name:14s} {tris:6d} segitiga  {os.path.getsize(path) / 1024:6.1f} KB')


# ---------- bentuk dasar ----------
def _baru(b, n0):
    """Titik yang dibuat sejak hitungan n0. bmesh selalu menambah titik baru di ujung daftar;
    membandingkan himpunan objek titik tidak aman setelah ada penghapusan."""
    b.verts.ensure_lookup_table()
    return list(b.verts[n0:])

def _place(b, verts, c, rot):
    M = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4()
    bmesh.ops.transform(b, matrix=M, verts=list(verts))


def cube(c, s, rot=(0, 0, 0), bevel=0.0, seg=1, shape=None):
    """Kotak berpusat di c, ukuran s. shape(v) boleh menggeser titik dalam koordinat lokal sebelum dibevel."""
    def fn(b):
        n0 = len(b.verts)
        bmesh.ops.create_cube(b, size=1.0, matrix=Matrix.Diagonal((s[0], s[1], s[2], 1)))
        new = _baru(b, n0)
        if shape:
            for v in new:
                shape(v.co)
        if bevel > 0:
            edges = list({e for v in new for e in v.link_edges})
            bmesh.ops.bevel(b, geom=edges, offset=bevel, segments=max(seg, 3), profile=0.5, affect='EDGES', clamp_overlap=True)
        new = _baru(b, n0)
        _place(b, new, c, rot)
    return fn


def cyl(c, r, depth, axis='z', seg=12, r2=None, rot=None):
    seg = seg if seg <= 6 else max(seg, min(32, int(seg * 1.6)))      # lingkaran lebih rapat untuk benda yang terlihat bulat
    R = rot or {'z': (0, 0, 0), 'x': (0, math.pi / 2, 0), 'y': (math.pi / 2, 0, 0)}[axis]
    def fn(b):
        n0 = len(b.verts)
        bmesh.ops.create_cone(b, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
        new = _baru(b, n0)
        _place(b, new, c, R)
    fn.halus = 'sisi'
    fn.sumbu = Euler(R).to_matrix() @ Vector((0, 0, 1))
    return fn


def ball(c, r, sub=1, scale=(1, 1, 1), noise=0.0, seed=0):
    sub = min(3, sub + (1 if r > 0.25 else 0))
    def fn(b):
        n0 = len(b.verts)
        bmesh.ops.create_icosphere(b, subdivisions=sub, radius=1.0)
        new = _baru(b, n0)
        rnd = random.Random(seed)
        for v in new:
            k = 1 + (rnd.uniform(-noise, noise) if noise else 0)
            v.co = Vector((v.co.x * r * scale[0] * k, v.co.y * r * scale[1] * k, v.co.z * r * scale[2] * k))
        _place(b, new, c, (0, 0, 0))
    fn.halus = 'semua'
    return fn


def plane(c, sx, sy):
    def fn(b):
        vs = [b.verts.new((c[0] + x, c[1] + y, c[2])) for x, y in ((-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2))]
        b.faces.new(vs)
    return fn


def arch(c, r, side, seg=12):
    """Lengkung rumah roda: setengah lingkaran tipis menghadap ke samping (side -1 kiri, 1 kanan)."""
    def fn(b):
        vs = [b.verts.new((c[0], c[1] + r * math.cos(math.pi * k / seg), c[2] + r * math.sin(math.pi * k / seg))) for k in range(seg + 1)]
        f = b.faces.new(vs)
        f.normal_update()
        if f.normal.x * side < 0:
            f.normal_flip()
    return fn


def wheel(A, c, r, w, rim=VELG, hub=KROM, seg=16):
    """Ban dengan dinding samping membulat, velg berjari lima, dop, dan mur."""
    side = 1 if c[0] >= 0 else -1
    A.add(BAN, cyl(c, r, w * 0.8, 'x', 24))
    A.add(BAN, cyl((c[0] + side * w * 0.42, c[1], c[2]), r * 0.94, w * 0.08, 'x', 24))
    A.add(BAN, cyl((c[0] - side * w * 0.42, c[1], c[2]), r * 0.94, w * 0.08, 'x', 24))
    x = c[0] + side * (w / 2 + 0.004)
    A.add(GELAP, cyl((x - side * 0.004, c[1], c[2]), r * 0.66, 0.01, 'x', 24))
    A.add(rim, _ring((x, c[1], c[2]), r * 0.64, r * 0.52, 0.014, side))
    for k in range(5):
        a = k / 5 * math.tau
        A.add(rim, cube((x, c[1] + math.cos(a) * r * 0.3, c[2] + math.sin(a) * r * 0.3), (0.014, r * 0.1, r * 0.46), rot=(a - math.pi / 2, 0, 0)))
    A.add(hub, cyl((x + side * 0.006, c[1], c[2]), r * 0.2, 0.02, 'x', 16))
    for k in range(5):
        a = k / 5 * math.tau + 0.3
        A.add(KROM, cyl((x + side * 0.014, c[1] + math.cos(a) * r * 0.12, c[2] + math.sin(a) * r * 0.12), r * 0.025, 0.012, 'x', 6))


def _ring(c, r1, r0, w, side, seg=24):
    """Bibir velg: cincin datar menghadap ke samping."""
    def fn(b):
        out, inn = [], []
        for k in range(seg):
            a = k / seg * math.tau
            out.append(b.verts.new((c[0], c[1] + r1 * math.cos(a), c[2] + r1 * math.sin(a))))
            inn.append(b.verts.new((c[0], c[1] + r0 * math.cos(a), c[2] + r0 * math.sin(a))))
        for k in range(seg):
            j = (k + 1) % seg
            _face_out(b, [out[k], out[j], inn[j], inn[k]], (side, 0, 0))
    return fn


def mirror_x(fn_maker, *args, **kw):
    """Panggil fn_maker untuk x positif dan negatif."""
    return [fn_maker(*args, sx=s, **kw) for s in (-1, 1)]


# ---------- kendaraan (depan = +Y) ----------
# ---------- teks 3D (huruf Blender diubah jadi mesh, ditempel di permukaan) ----------
# sumbu teks (kanan, atas, normal) untuk tiap muka benda yang menghadap +Y
FACE = {
    'kiri': ((0, -1, 0), (0, 0, 1), (-1, 0, 0)),
    'kanan': ((0, 1, 0), (0, 0, 1), (1, 0, 0)),
    'depan': ((-1, 0, 0), (0, 0, 1), (0, 1, 0)),
    'belakang': ((1, 0, 0), (0, 0, 1), (0, -1, 0)),
    'xdepan': ((0, 1, 0), (0, 0, 1), (1, 0, 0)),     # bangunan yang menghadap +X
}


def text(s, size, c, face, bold=True):
    def fn(b):
        cu = bpy.data.curves.new('t', 'FONT')
        cu.body, cu.size, cu.align_x, cu.align_y = s, size, 'CENTER', 'CENTER'
        cu.resolution_u = 2                      # lengkung huruf kasar saja: hemat segitiga
        ob = bpy.data.objects.new('t', cu)
        bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bpy.data.objects.remove(ob)
        bpy.data.curves.remove(cu)
        tmp = bmesh.new()
        tmp.from_mesh(me)
        bpy.data.meshes.remove(me)
        bmesh.ops.triangulate(tmp, faces=tmp.faces[:])
        xa, ya, na = (Vector(v) for v in FACE[face])
        M = Matrix(((xa.x, ya.x, na.x, c[0]), (xa.y, ya.y, na.y, c[1]), (xa.z, ya.z, na.z, c[2]), (0, 0, 0, 1)))
        vm = {}
        for v in tmp.verts:
            vm[v] = b.verts.new(M @ v.co)
        for f in tmp.faces:
            try:
                nf = b.faces.new([vm[v] for v in f.verts])
                nf.normal_update()
                if nf.normal.dot(na) < 0:
                    nf.normal_flip()
            except ValueError:
                pass
        tmp.free()
    return fn


TRAYEK = {'05': 'TERMINAL - PASAR BARU', '09': 'TERMINAL - KAMPUS', '12': 'PASAR BARU - GRIYA ASRI'}


def angkot(no='05', name='angkot'):
    """Angkot gaya mikrobus: kabin penumpang berongga dengan pintu geser terbuka di kiri, jok saling berhadapan."""
    A = Asset(name)
    W, L = 1.76, 3.36
    hx = W / 2
    A.add(BAYANG, plane((0, 0, 0.012), W + 0.22, L + 0.26))
    for sx in (-1, 1):
        for sy in (-1, 1):
            wheel(A, (sx * 0.80, sy * 1.08, 0.30), 0.30, 0.20)
            for k in range(5):
                a = k / 5 * math.tau
                A.add(KROM, cyl((sx * 0.913, sy * 1.08 + 0.08 * math.cos(a), 0.30 + 0.08 * math.sin(a)), 0.014, 0.01, 'x', 6))
            A.add(hexc('15191c'), arch((sx * (hx + 0.005), sy * 1.08, 0.30), 0.40, sx))
    # rangka bawah dan lantai
    A.add(GELAP, cube((0, 0, 0.27), (W - 0.2, L - 0.3, 0.12)))
    # kabin depan (pengemudi), padat, kaca depan miring
    def slope(v):
        if v.z > 0 and v.y > 0:
            v.y -= 0.34
    A.add(CAT, cube((0, 0.92, 0.74), (W, 1.52, 0.84), bevel=0.05, seg=2))
    A.add(CAT, cube((0, 0.82, 1.52), (W, 1.32, 0.72), bevel=0.06, seg=2, shape=slope))
    ang = math.atan2(0.34, 0.72)
    A.add(KACA, cube((0, 1.31, 1.50), (1.54, 0.03, 0.70), rot=(ang, 0, 0)))
    for sx in (-1, 1):
        A.add(GELAP, cube((sx * 0.30, 1.38, 1.24), (0.42, 0.015, 0.015), rot=(ang, 0, sx * 0.2)))   # wiper
        A.add(KACA, cube((sx * (hx + 0.002), 0.62, 1.50), (0.02, 0.62, 0.52)))
        A.add(GELAP, cube((sx * (hx + 0.004), 0.25, 0.95), (0.008, 0.012, 1.0)))               # garis pintu
    # kabin penumpang berongga (y -1.68..0.16)
    y0, y1 = -1.68, 0.16
    yc, yl = (y0 + y1) / 2, y1 - y0
    A.add(CAT, cube((hx - 0.02, yc, 1.10), (0.04, yl, 1.56)))                                   # dinding kanan
    A.add(CAT, cube((-hx + 0.02, -1.165, 1.10), (0.04, 1.03, 1.56)))                             # kiri, di belakang pintu
    A.add(CAT, cube((-hx + 0.02, -0.25, 1.86), (0.04, 0.80, 0.08)))                              # di atas pintu
    A.add(CAT, cube((0, y0 + 0.02, 1.10), (W, 0.04, 1.56)))                                      # dinding belakang
    A.add(CAT, cube((0, yc - 0.01, 1.89), (W, yl + 0.02, 0.10), bevel=0.04, seg=2))             # atap
    A.add(hexc('6b6f72'), cube((0, yc, 0.42), (W - 0.08, yl, 0.04)))                            # lantai
    A.add(hexc('ece6d6'), cube((0, yc, 1.82), (W - 0.1, yl - 0.04, 0.03)))                       # plafon
    for sx in (-1, 1):
        A.add(hexc('ece6d6'), cube((sx * (hx - 0.045), yc, 1.55), (0.01, yl - 0.04, 0.5)))       # pelapis dinding dalam
        A.add(hexc('8a3b2a'), cube((sx * 0.60, -0.72, 0.80), (0.42, 1.70, 0.10), bevel=0.02))      # jok
        A.add(hexc('7a3326'), cube((sx * 0.80, -0.72, 1.06), (0.06, 1.70, 0.46), bevel=0.02))      # sandaran
        A.add(hexc('4a4a4a'), cube((sx * 0.60, -0.72, 0.62), (0.36, 1.66, 0.36)))
        A.add(KROM, cyl((sx * 0.45, -0.72, 1.76), 0.012, 1.7, 'y', 6))                           # pegangan atap
    A.add(KROM, cyl((-0.74, 0.08, 1.12), 0.018, 1.40, 'z', 8))                                   # tiang pegangan pintu
    A.add(KROM, cube((-hx - 0.05, -0.25, 0.34), (0.14, 0.78, 0.04)))                             # pijakan pintu
    # kaca samping dan belakang
    for y0w, y1w in ((-1.58, -0.72), ):
        A.add(KACA, cube((-hx - 0.002, (y0w + y1w) / 2, 1.50), (0.02, y1w - y0w, 0.52)))
    for y0w, y1w in ((-1.58, -0.98), (-0.90, -0.30), (-0.22, 0.12)):
        A.add(KACA, cube((hx + 0.002, (y0w + y1w) / 2, 1.50), (0.02, y1w - y0w, 0.52)))
    A.add(KACA, cube((0, -1.702, 1.50), (1.30, 0.02, 0.52)))
    # list dan tulisan samping
    for sx, face in ((-1, 'kiri'), (1, 'kanan')):
        A.add(PUTIH, cube((sx * (hx + 0.006), -0.06, 1.02), (0.01, 3.24, 0.07)))
        A.add(hexc('f2c230'), cube((sx * (hx + 0.006), -0.06, 0.93), (0.01, 3.24, 0.035)))
        A.add(PUTIH, text(no, 0.34, (sx * (hx + 0.012), 0.62 if sx < 0 else 0.62, 0.62), face))
        A.add(PUTIH, text('TRAYEK', 0.07, (sx * (hx + 0.012), 0.62, 0.84), face))
        A.add(PUTIH, text(TRAYEK[no], 0.075, (sx * (hx + 0.012), -1.10, 1.18 if sx > 0 else 0.62), face))
        A.add(GELAP, cube((sx * 0.94, 1.18, 1.32), (0.14, 0.03, 0.03)))
        A.add(GELAP, cube((sx * 1.00, 1.18, 1.38), (0.04, 0.10, 0.18), bevel=0.01))
        A.add(REMC, cube((sx * 0.76, -1.705, 0.80), (0.16, 0.03, 0.34), bevel=0.01))
        A.add(BAN, cube((sx * 0.80, -1.44, 0.24), (0.22, 0.02, 0.24)))
    # muka depan
    A.add(GELAP, cube((0, 1.686, 0.74), (0.86, 0.03, 0.26)))
    for z in (0.66, 0.72, 0.78):
        A.add(KROM, cube((0, 1.70, z), (0.82, 0.012, 0.016)))
    for sx in (-1, 1):
        A.add(KROM, cube((sx * 0.62, 1.69, 0.76), (0.32, 0.03, 0.22), bevel=0.01))
        A.add(LAMPU, cube((sx * 0.62, 1.70, 0.76), (0.27, 0.02, 0.17)))
        A.add(SEIN, cube((sx * 0.62, 1.69, 0.56), (0.24, 0.03, 0.07)))
    A.add(hexc('3a3f44'), cube((0, 1.72, 0.40), (1.74, 0.12, 0.20), bevel=0.03, seg=2))
    A.add(hexc('3a3f44'), cube((0, -1.72, 0.40), (1.74, 0.12, 0.20), bevel=0.03, seg=2))
    plat = hexc('f2c230')
    for y, face in ((1.785, 'depan'), (-1.785, 'belakang')):
        A.add(plat, cube((0, y, 0.44), (0.50, 0.02, 0.13)))
        A.add(hexc('161616'), text('F 1705 AK', 0.085, (0, y + (0.012 if y > 0 else -0.012), 0.44), face))
    # papan trayek di atap
    A.add(GELAP, cube((0, 1.05, 2.04), (1.12, 0.08, 0.28), bevel=0.01))
    A.add(PUTIH, cube((0, 1.10, 2.04), (1.06, 0.02, 0.22)))
    A.add(hexc('1f6f3f'), text(no + ' ' + TRAYEK[no], 0.062 if len(TRAYEK[no]) > 20 else 0.07, (0, 1.112, 2.04), 'depan'))
    for sx in (-1, 1):
        A.add(GELAP, cube((sx * 0.45, 1.05, 1.93), (0.04, 0.04, 0.1)))
    A.export()


def mobil():
    A = Asset('mobil')
    W, L = 1.36, 2.64
    A.add(BAYANG, plane((0, 0, 0.012), W + 0.2, L + 0.22))
    for sx in (-1, 1):
        for sy in (-1, 1):
            wheel(A, (sx * 0.60, sy * 0.86, 0.25), 0.25, 0.17)
    def hood(v):
        if v.z > 0 and v.y > 0.6:
            v.z -= 0.08
    A.add(CAT, cube((0, 0, 0.48), (W, L, 0.52), bevel=0.07, seg=2, shape=hood))
    def cabin(v):
        if v.z > 0:
            v.y += -0.28 if v.y > 0 else 0.14
    A.add(KACA, cube((0, -0.12, 0.96), (1.22, 1.50, 0.46), bevel=0.04, shape=cabin))
    A.add(CAT, cube((0, -0.19, 1.20), (1.18, 1.00, 0.05), bevel=0.02))
    for sx in (-1, 1):
        A.add(CAT, cube((sx * 0.60, -0.19, 0.96), (0.05, 0.08, 0.46)))
        A.add(LAMPU, cube((sx * 0.45, 1.317, 0.56), (0.30, 0.03, 0.12), bevel=0.01))
        A.add(REMC, cube((sx * 0.50, -1.317, 0.60), (0.24, 0.03, 0.14), bevel=0.01))
        A.add(GELAP, cube((sx * 0.72, 0.55, 0.86), (0.08, 0.10, 0.08)))
    A.add(GELAP, cube((0, 1.33, 0.34), (1.30, 0.08, 0.14), bevel=0.03))
    A.add(GELAP, cube((0, -1.33, 0.34), (1.30, 0.08, 0.14), bevel=0.03))
    A.add(GELAP, cube((0, 1.322, 0.48), (0.5, 0.02, 0.10)))
    for y in (1.375, -1.375):
        A.add(hexc('161616'), cube((0, y, 0.40), (0.42, 0.02, 0.11)))
    A.export()


def pikap():
    A = Asset('pikap')
    W, L = 1.44, 3.04
    A.add(BAYANG, plane((0, 0, 0.012), W + 0.2, L + 0.22))
    for sx in (-1, 1):
        wheel(A, (sx * 0.64, 1.0, 0.27), 0.27, 0.18)
        wheel(A, (sx * 0.64, -0.95, 0.27), 0.27, 0.18)
    A.add(GELAP, cube((0, 0, 0.42), (W - 0.1, L - 0.1, 0.2)))
    A.add(CAT, cube((0, 1.10, 0.62), (W, 0.90, 0.48), bevel=0.05, seg=2))
    def slope(v):
        if v.z > 0 and v.y > 0:
            v.y -= 0.22
    A.add(CAT, cube((0, 0.96, 1.14), (W - 0.04, 0.96, 0.58), bevel=0.05, seg=2, shape=slope))
    A.add(KACA, cube((0, 1.36, 1.14), (1.20, 0.03, 0.52), rot=(math.atan2(0.22, 0.58), 0, 0)))
    for sx in (-1, 1):
        A.add(KACA, cube((sx * 0.711, 0.92, 1.20), (0.03, 0.62, 0.36)))
        A.add(CAT, cube((sx * 0.70, -0.55, 0.80), (0.05, 1.84, 0.36)))
        A.add(LAMPU, cube((sx * 0.50, 1.537, 0.66), (0.26, 0.03, 0.14)))
        A.add(REMC, cube((sx * 0.62, -1.537, 0.72), (0.14, 0.03, 0.22)))
        A.add(GELAP, cube((sx * 0.80, 1.22, 1.08), (0.10, 0.06, 0.10)))
    A.add(CAT, cube((0, -1.50, 0.80), (W, 0.05, 0.36)))
    A.add(CAT, cube((0, 0.40, 0.88), (W, 0.05, 0.52)))
    A.add(hexc('5b4632'), cube((0, -0.55, 0.64), (W - 0.12, 1.84, 0.04)))
    rnd = random.Random(3)
    for i in range(6):
        x, y = -0.32 + (i % 2) * 0.64, -1.15 + (i // 2) * 0.58
        A.add(hexc('c8b07a'), ball((x + rnd.uniform(-.05, .05), y, 0.82), 0.26, 2, (1.15, 1.6, 0.62), 0.08, i))
    A.add(KROM, cube((0, 1.56, 0.40), (1.40, 0.10, 0.14), bevel=0.03))
    A.export()


def truk():
    A = Asset('truk')
    W, L = 1.76, 4.72
    A.add(BAYANG, plane((0, 0, 0.012), W + 0.22, L + 0.26))
    for sx in (-1, 1):
        wheel(A, (sx * 0.74, 1.70, 0.36), 0.36, 0.24)
        for y in (-1.20, -1.80):
            wheel(A, (sx * 0.74, y, 0.36), 0.36, 0.24)
            wheel(A, (sx * 0.50, y, 0.36), 0.36, 0.20, rim=GELAP)
    A.add(GELAP, cube((0, 0, 0.52), (1.1, L - 0.4, 0.22)))
    A.add(CAT, cube((0, 1.75, 1.32), (W, 1.22, 1.72), bevel=0.06, seg=2))
    A.add(KACA, cube((0, 2.362, 1.70), (1.56, 0.03, 0.62)))
    A.add(KROM, cube((0, 2.37, 0.92), (1.20, 0.03, 0.42)))
    for z in (0.80, 0.90, 1.00, 1.10):
        A.add(GELAP, cube((0, 2.385, z), (1.16, 0.01, 0.03)))
    A.add(GELAP, cube((0, 2.40, 0.58), (W, 0.12, 0.22), bevel=0.03))
    for sx in (-1, 1):
        A.add(LAMPU, cube((sx * 0.70, 2.37, 0.92), (0.24, 0.03, 0.20)))
        A.add(KACA, cube((sx * 0.881, 1.85, 1.75), (0.03, 0.75, 0.55)))
        A.add(GELAP, cube((sx * 0.98, 2.15, 1.72), (0.05, 0.12, 0.34)))
        A.add(REMC, cube((sx * 0.70, -2.365, 0.75), (0.20, 0.03, 0.16)))
    box = hexc('e8e2d0')
    A.add(box, cube((0, -0.62, 1.60), (W + 0.04, 3.40, 2.10), bevel=0.03))
    for sx in (-1, 1):
        for i in range(9):
            A.add(hexc('cdc6b2'), cube((sx * 0.905, -2.22 + i * 0.4, 1.60), (0.02, 0.05, 2.06)))
        A.add(hexc('a3312a'), cube((sx * 0.908, -0.62, 2.30), (0.012, 3.38, 0.24)))
    A.add(hexc('cdc6b2'), cube((0, -2.325, 1.60), (0.02, 0.01, 2.0)))
    A.add(GELAP, cube((0.3, -2.33, 1.4), (0.04, 0.02, 0.4)))
    A.export()


def G2(g, base):
    """Versi gelap warna polos (bukan warna penanda; penanda harus tepat supaya bisa diganti di JS)."""
    return (base[0] * g, base[1] * g, base[2] * g, 1)


def motor(name='motor', rider=True):
    A = Asset(name)
    A.add(BAYANG, plane((0, 0, 0.012), 0.5, 1.5))
    for y in (0.48, -0.48):
        A.add(BAN, cyl((0, y, 0.27), 0.27, 0.09, 'x', 14))
        A.add(VELG, cyl((0, y, 0.27), 0.15, 0.095, 'x', 10))
    A.add(GELAP, cube((0, 0.0, 0.42), (0.10, 0.90, 0.10), rot=(0.25, 0, 0)))
    A.add(CAT, cube((0, 0.38, 0.66), (0.30, 0.28, 0.42), bevel=0.04, rot=(-0.3, 0, 0)))
    A.add(CAT, cube((0, -0.12, 0.58), (0.30, 0.62, 0.24), bevel=0.05))
    A.add(GELAP, cube((0, -0.12, 0.74), (0.26, 0.58, 0.08), bevel=0.03))
    A.add(GELAP, cyl((0, 0.46, 0.98), 0.018, 0.62, 'x', 6))
    A.add(LAMPU, cube((0, 0.55, 0.84), (0.14, 0.04, 0.10), bevel=0.01))
    A.add(KROM, cyl((0.14, -0.40, 0.36), 0.04, 0.42, 'y', 8))
    A.add(REMC, cube((0, -0.45, 0.68), (0.10, 0.03, 0.05)))
    if rider:
        # pengendara duduk: celana panjang, jaket (warna per motor), helm terbuka dengan kaca, wajah
        celana, kulit, sepatu = hexc('2f3d4a'), hexc('a8714a'), hexc('2b2622')
        for sx in (-1, 1):
            A.add(celana, tube([(sx * 0.10, -0.16, 0.86), (sx * 0.14, 0.06, 0.87), (sx * 0.17, 0.25, 0.84)], [0.088, 0.078, 0.062], 12, 3), k='kain')
            A.add(celana, tube([(sx * 0.17, 0.25, 0.84), (sx * 0.175, 0.29, 0.62), (sx * 0.175, 0.30, 0.43)], [0.062, 0.052, 0.046], 12, 3), k='kain')
            A.add(sepatu, ball((sx * 0.175, 0.34, 0.39), 0.06, 1, (0.9, 1.9, 0.8)), k='karet')
            A.add(KEDUA, tube([(sx * 0.18, -0.06, 1.33), (sx * 0.235, 0.14, 1.15), (sx * 0.25, 0.38, 1.0)], [0.062, 0.052, 0.046], 12, 3))
            A.add(G2(0.7, KEDUA), tube([(sx * 0.25, 0.37, 1.0), (sx * 0.25, 0.40, 0.99)], [0.048, 0.048], 12, 1))     # manset
            A.add(kulit, ball((sx * 0.25, 0.445, 0.985), 0.045, 1, (0.75, 1.0, 0.75)), k='polos')
        JAK = [(0.84, 0, -0.18, 0.165, 0.115), (0.98, 0, -0.14, 0.158, 0.108), (1.12, 0, -0.10, 0.170, 0.112), (1.24, 0, -0.065, 0.182, 0.112),
               (1.33, 0, -0.04, 0.17, 0.102), (1.40, 0, -0.025, 0.11, 0.08), (1.44, 0, -0.015, 0.07, 0.062)]
        A.add(KEDUA, loft(JAK, 16, 2, 2.4))
        for i in range(len(JAK) - 2):
            a_, b_ = JAK[i], JAK[i + 1]
            zc, yc = (a_[0] + b_[0]) / 2, (a_[2] + a_[4] + b_[2] + b_[4]) / 2
            A.add(GELAP, cube((0, yc + 0.003, zc), (0.012, 0.006, b_[0] - a_[0] + 0.004), rot=(-math.atan2(b_[2] + b_[4] - a_[2] - a_[4], b_[0] - a_[0]), 0, 0)), k='logam')   # ritsleting
        A.add(G2(0.75, KEDUA), loft([(1.40, 0, -0.03, 0.085, 0.072), (1.47, 0, -0.025, 0.08, 0.07)], 16, 1, 2, False, False))  # kerah jaket
        HC = Vector((0, 0.0, 1.575))
        A.add(kulit, loft([(1.40, 0, -0.02, 0.046, 0.044), (1.50, 0, -0.005, 0.046, 0.044)], 10, 1), k='polos')
        A.add(kulit, grid(lambda u, v: head_pt(u * math.tau, -math.pi / 2 + 0.06 + v * (math.pi - 0.12), 0, HC), 16, 10), k='polos')
        for sx in (-1, 1):
            e = head_pt(sx * 0.36, 0.04, -0.004, HC)
            A.add(hexc('120e0c'), ball((e.x, e.y + 0.004, e.z), 0.009, 1, (1, 0.6, 1)), k='polos')
        n_ = head_pt(0, -0.08, 0.004, HC)
        A.add(kulit, ball((0, n_.y + 0.004, n_.z), 0.017, 1, (0.85, 1.1, 1.2)), k='polos')
        # helm: tempurung tebal, terbuka di muka, kaca gelap melengkung, tali dagu
        def helm(u, v):
            th = u * math.tau
            ph0 = math.radians(-16.25 + 27.5 * math.cos(th) + 8.75 * math.cos(2 * th))
            ph = ph0 + (math.radians(87) - ph0) * v
            return head_pt(th, ph, 0.034, HC) + Vector((0, -0.004, 0.012 * v))
        A.add(KETIGA, grid(helm, 20, 8, False, True))
        A.add(G2(0.55, KETIGA), grid(lambda u, v: head_pt(u * math.tau, math.radians(-16.25 + 27.5 * math.cos(u * math.tau) + 8.75 * math.cos(2 * u * math.tau)) + v * 0.08, 0.036, HC), 20, 1, False, False))  # bibir helm
        A.add(KACA, grid(lambda u, v: head_pt(-0.95 + u * 1.9, math.radians(24) - v * math.radians(36), 0.05, HC), 10, 3, False, False, closed=False, out=tuple(HC)))
        for sx in (-1, 1):
            a_ = head_pt(sx * 1.05, -0.25, 0.012, HC)
            A.add(GELAP, cube((a_.x, a_.y, a_.z - 0.03), (0.006, 0.012, 0.09), rot=(0.25, 0, 0)), k='kain')
    A.export()


def kereta():
    A = Asset('kereta')
    A.add(BAYANG, plane((0, 0, 0.012), 2.6, 7.6))
    for y in (-2.6, 2.6):
        A.add(GELAP, cube((0, y, 0.45), (1.6, 1.8, 0.4)))
        for yy in (y - 0.55, y + 0.55):
            for sx in (-1, 1):
                A.add(BAN, cyl((sx * 0.72, yy, 0.42), 0.42, 0.12, 'x', 12))
    A.add(GELAP, cube((0, 0, 0.75), (2.2, 7.2, 0.3)))
    A.add(CAT, cube((0, 0, 2.05), (2.4, 7.2, 2.4), bevel=0.08, seg=2))
    A.add(hexc('d6d6d6'), cube((0, 0, 3.30), (2.2, 7.0, 0.16), bevel=0.06))
    for y in (-2.2, 2.2):
        A.add(hexc('b9bdc0'), cube((0, y, 3.48), (1.2, 1.1, 0.24), bevel=0.04))
    for sx in (-1, 1):
        for i in range(7):
            y = -3.0 + i * 1.0
            if i in (1, 5):
                A.add(hexc('9aa3a8'), cube((sx * 1.205, y, 1.85), (0.02, 0.8, 1.9)))
                continue
            A.add(KACA, cube((sx * 1.205, y, 2.35), (0.02, 0.72, 0.7)))
        A.add(PUTIH, cube((sx * 1.21, 0, 1.55), (0.012, 7.0, 0.12)))
    for y in (3.605, -3.605):
        A.add(KACA, cube((0, y, 2.40), (1.4, 0.02, 0.8)))
        A.add(GELAP, cube((0, y + (0.1 if y > 0 else -0.1), 1.0), (0.3, 0.2, 0.25)))
    A.export()


# ---------- orang (depan +Y): empat mesh diwarnai per orang di JS ----------
def grid(pt, nu, nv, cap0=True, cap1=True, closed=True, out=None):
    """Permukaan dari cincin-cincin: pt(u, v) -> titik, u melingkar (tertutup), v sepanjang badan.
    Dipakai untuk badan, kaki, lengan, kepala, rambut: bentuk organik, dihaluskan.
    closed=False: lembaran terbuka (u 0..1 termasuk ujung); out = titik pusat, sisi depan menghadap menjauhinya."""
    def fn(b):
        mu = nu if closed else nu + 1
        rows = [[b.verts.new(pt(i / nu, j / nv)) for i in range(mu)] for j in range(nv + 1)]
        cen = [sum((v.co for v in r), Vector()) / mu for r in rows] if out is None else [Vector(out)] * (nv + 1)
        if not closed:
            for j in range(nv):
                for i in range(nu):
                    f = b.faces.new([rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]])
                    f.normal_update()
                    if f.normal.dot(f.calc_center_median() - cen[j]) < 0:
                        f.normal_flip()
            return
        def orient(f, out):
            f.normal_update()
            if f.normal.dot(out) < 0:
                f.normal_flip()
        for j in range(nv):
            for i in range(nu):
                k = (i + 1) % nu
                f = b.faces.new([rows[j][i], rows[j][k], rows[j + 1][k], rows[j + 1][i]])
                orient(f, f.calc_center_median() - (cen[j] + cen[j + 1]) / 2)
        if cap0:
            orient(b.faces.new(rows[0]), cen[0] - cen[1])
        if cap1:
            orient(b.faces.new(rows[-1]), cen[-1] - cen[-2])
    fn.halus = 'semua'
    return fn


def lerp_secs(secs, v):
    """Interpolasi halus daftar penampang (z, cx, cy, rx, ry) pada v 0..1."""
    f = v * (len(secs) - 1)
    i = min(int(f), len(secs) - 2)
    t = f - i
    t = t * t * (3 - 2 * t)
    return [a + (b - a) * t for a, b in zip(secs[i], secs[i + 1])]


def loft(secs, nu=16, sub=2, power=2.0, cap0=True, cap1=True):
    """Tabung lewat penampang elips (z, cx, cy, rx, ry), dari bawah ke atas. power > 2 = penampang lebih kotak."""
    nv = (len(secs) - 1) * sub
    def pt(u, v):
        z, cx, cy, rx, ry = lerp_secs(secs, v)
        a = u * math.tau
        c, s_ = math.cos(a), math.sin(a)
        k = 2 / power
        return Vector((cx + rx * math.copysign(abs(c) ** k, c), cy + ry * math.copysign(abs(s_) ** k, s_), z))
    return grid(pt, nu, nv, cap0, cap1)


HEAD = Vector((0, 0.0, 1.555))
HR = (0.083, 0.098, 0.116)


def tube(pts, radii, nu=12, sub=3, cap0=True, cap1=True):
    """Tabung melengkung lewat titik-titik (lutut, siku menekuk), penampang bulat tegak lurus arah tabung."""
    P = [Vector(p) for p in pts]
    def at(v):
        f = v * (len(P) - 1)
        i = min(int(f), len(P) - 2)
        t = f - i
        # kurva halus Catmull-Rom
        p0, p1, p2, p3 = P[max(0, i - 1)], P[i], P[i + 1], P[min(len(P) - 1, i + 2)]
        c = 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t + (-p0 + 3 * p1 - 3 * p2 + p3) * t ** 3)
        r = radii[i] + (radii[i + 1] - radii[i]) * t
        return c, r
    def pt(u, v):
        c, r = at(v)
        c2, _ = at(min(1, v + 0.01)) if v < 0.99 else (c, 0)
        c1, _ = at(max(0, v - 0.01)) if v >= 0.99 else (c, 0)
        tng = (c2 - c1).normalized()
        ref = Vector((1, 0, 0)) if abs(tng.x) < 0.8 else Vector((0, 0, 1))
        sd = tng.cross(ref).normalized()
        up = sd.cross(tng).normalized()
        a = u * math.tau
        return c + (sd * math.cos(a) + up * math.sin(a)) * r
    return grid(pt, nu, (len(P) - 1) * sub, cap0, cap1)


def head_pt(th, ph, grow=0.0, c=None):
    """Titik di permukaan kepala. th = sudut keliling (0 = depan +Y), ph = lintang (-pi/2 dagu .. pi/2 ubun-ubun)."""
    rx, ry, rz = HR[0] + grow, HR[1] + grow, HR[2] + grow
    x, y, z = math.sin(th) * math.cos(ph) * rx, math.cos(th) * math.cos(ph) * ry, math.sin(ph) * rz
    s = max(0.0, -math.sin(ph))
    x *= 1 - 0.24 * s                                        # rahang menyempit ke dagu
    if y > 0:
        y *= 1 - 0.12 * s * s                                # dagu
    else:
        y *= 1.06 if ph > -0.35 else 1.0                     # kepala belakang
    return (c or HEAD) + Vector((x, y, z))


def orang():
    A = Asset('orang', 'orang')
    G = lambda g: (g, g, g, 1)                               # abu: dikali warna pakaian per orang di JS
    sepatu, sol, mata, bibir = hexc('2b2622'), hexc('171513'), hexc('120e0c'), hexc('8e5a52')
    # kaki dan celana panjang
    for sx in (-1, 1):
        A.add(PUTIH, loft([(0.085, sx * 0.093, 0.005, 0.052, 0.055), (0.15, sx * 0.093, 0.0, 0.047, 0.051), (0.30, sx * 0.092, -0.002, 0.054, 0.058),
                           (0.47, sx * 0.091, 0.004, 0.058, 0.063), (0.56, sx * 0.090, 0.0, 0.064, 0.069), (0.72, sx * 0.088, -0.004, 0.079, 0.084),
                           (0.86, sx * 0.084, -0.006, 0.090, 0.094)], 16, 2), 'celana')
        A.add(G(0.82), loft([(0.082, sx * 0.093, 0.005, 0.054, 0.057), (0.10, sx * 0.093, 0.004, 0.054, 0.057)], 16, 1), 'celana')    # lipatan ujung celana
        A.add(PUTIH, cyl((sx * 0.093, 0.0, 0.085), 0.037, 0.07, 'z', 6), 'kulit')                                                   # pergelangan kaki
        # sepatu: badan membulat, sol, tali
        A.add(sepatu, ball((sx * 0.093, 0.04, 0.05), 0.06, 1, (0.9, 2.0, 0.8)), 'celana', k='karet')
        A.add(sol, cube((sx * 0.093, 0.04, 0.012), (0.098, 0.235, 0.024), bevel=0.01), 'celana', k='karet')
        for k in range(3):
            A.add(hexc('d8d2c6'), cube((sx * 0.093, 0.075 + k * 0.03, 0.093 - k * 0.006), (0.05, 0.008, 0.006), rot=(-0.35, 0, 0)), 'celana', k='kain')
    # pinggul (celana)
    A.add(PUTIH, loft([(0.80, 0, -0.004, 0.150, 0.098), (0.86, 0, -0.004, 0.160, 0.104), (0.93, 0, -0.002, 0.150, 0.096)], 18, 2, 2.4), 'celana')
    # badan berkemeja: pinggang ramping, dada, bahu turun ke leher
    TOR = [(0.835, 0, -0.002, 0.176, 0.116), (0.95, 0, 0.0, 0.166, 0.108), (1.04, 0, 0.002, 0.158, 0.103), (1.13, 0, 0.004, 0.166, 0.109),
           (1.23, 0, 0.006, 0.178, 0.116), (1.31, 0, 0.002, 0.186, 0.113), (1.36, 0, -0.004, 0.178, 0.104), (1.405, 0, -0.006, 0.13, 0.086),
           (1.44, 0, -0.006, 0.070, 0.062)]
    A.add(PUTIH, loft(TOR, 18, 2, 2.4, cap0=True, cap1=True), 'baju')
    A.add(G(0.84), loft([(0.832, 0, -0.002, 0.178, 0.118), (0.852, 0, -0.002, 0.178, 0.118)], 18, 1, 2.4), 'baju')       # kelim bawah
    def fy(z):  # permukaan depan badan pada tinggi z (cari penampang terdekat)
        best = min(range(len(TOR) - 1), key=lambda i: abs((TOR[i][0] + TOR[i + 1][0]) / 2 - z))
        a, b_ = TOR[best], TOR[best + 1]
        t = max(0, min(1, (z - a[0]) / (b_[0] - a[0])))
        return a[2] + a[4] + (b_[2] + b_[4] - a[2] - a[4]) * t
    # plaket kancing, kancing, saku dada, kerah
    for i in range(7):
        z0, z1 = 0.845 + i * 0.075, 0.845 + (i + 1) * 0.075
        zc = (z0 + z1) / 2
        A.add(G(0.86), cube((0, fy(zc) + 0.001, zc), (0.03, 0.006, z1 - z0 + 0.002)), 'baju')
        if i < 6:
            A.add(G(0.62), cyl((0, fy(z1) + 0.004, z1), 0.0075, 0.006, 'y', 6), 'baju')
    A.add(G(0.9), cube((0.085, fy(1.24) + 0.002, 1.235), (0.075, 0.006, 0.085), bevel=0.004), 'baju')
    A.add(G(0.78), cube((0.085, fy(1.275) + 0.005, 1.272), (0.077, 0.006, 0.016), bevel=0.003), 'baju')
    A.add(G(0.93), loft([(1.405, 0, -0.008, 0.078, 0.07), (1.445, 0, -0.01, 0.072, 0.066), (1.47, 0, -0.012, 0.074, 0.068)], 16, 1, 2, False, False), 'baju')
    for sx in (-1, 1):
        A.add(G(0.95), cube((sx * 0.036, fy(1.395) + 0.004, 1.40), (0.052, 0.007, 0.05), rot=(-0.3, 0, sx * 0.55), bevel=0.003), 'baju')
    # leher
    A.add(PUTIH, loft([(1.38, 0, -0.006, 0.048, 0.046), (1.47, 0, -0.004, 0.046, 0.044), (1.50, 0, 0.0, 0.05, 0.05)], 12, 1), 'kulit')
    # lengan: lengan baju pendek, lengan bawah, tangan
    for sx in (-1, 1):
        A.add(PUTIH, loft([(1.13, sx * 0.242, 0.004, 0.062, 0.064), (1.24, sx * 0.226, 0.002, 0.064, 0.064), (1.32, sx * 0.205, -0.002, 0.062, 0.062),
                           (1.37, sx * 0.17, -0.004, 0.05, 0.055)], 14, 2, 2, False, True), 'baju')
        A.add(G(0.84), loft([(1.12, sx * 0.243, 0.004, 0.064, 0.066), (1.14, sx * 0.242, 0.004, 0.064, 0.066)], 14, 1, 2, False, False), 'baju')
        A.add(PUTIH, loft([(0.80, sx * 0.268, 0.032, 0.026, 0.03), (0.86, sx * 0.264, 0.026, 0.032, 0.036), (0.97, sx * 0.256, 0.016, 0.040, 0.044),
                           (1.07, sx * 0.248, 0.008, 0.044, 0.047), (1.20, sx * 0.236, 0.004, 0.05, 0.052)], 12, 2), 'kulit')
        A.add(PUTIH, ball((sx * 0.272, 0.036, 0.745), 0.05, 1, (0.62, 0.48, 1.1)), 'kulit')            # telapak dan jari
        A.add(PUTIH, ball((sx * 0.258, 0.062, 0.77), 0.022, 1, (0.8, 0.8, 1.4)), 'kulit')              # jempol
    # kepala: rahang, dagu, telinga, hidung, mata, alis, bibir
    def head(u, v):
        return head_pt(u * math.tau, -math.pi / 2 + 0.06 + v * (math.pi - 0.12))
    A.add(PUTIH, grid(head, 20, 12), 'kulit')
    for sx in (-1, 1):
        e = head_pt(sx * 0.36, 0.06, -0.006)
        A.add(G(0.97), ball((e.x, e.y, e.z), 0.0135, 1, (1, 0.6, 0.8)), 'kulit')                       # bola mata (warna kulit muda)
        A.add(mata, ball((e.x * 1.02, e.y + 0.006, e.z), 0.0085, 1, (1, 0.6, 1)), 'kulit')
        b_ = head_pt(sx * 0.36, 0.22, 0.002)
        A.add(PUTIH, cube((b_.x, b_.y, b_.z), (0.034, 0.008, 0.009), rot=(0, sx * -0.12, sx * 0.3), bevel=0.003), 'rambut')
        t_ = head_pt(sx * math.pi / 2, -0.02)
        A.add(PUTIH, ball((t_.x + sx * 0.008, t_.y - 0.008, t_.z), 0.03, 1, (0.45, 0.62, 1.15)), 'kulit')
    n_ = head_pt(0, -0.06, 0.004)
    A.add(PUTIH, ball((0, n_.y + 0.004, n_.z), 0.018, 1, (0.85, 1.1, 1.25)), 'kulit')
    A.add(G(0.8), ball((0, n_.y + 0.002, n_.z - 0.016), 0.012, 1, (1.5, 0.8, 0.6)), 'kulit')
    m_ = head_pt(0, -0.36, -0.002)
    A.add(bibir, ball((0, m_.y, m_.z), 0.02, 1, (1.25, 0.35, 0.32)), 'kulit')
    # rambut: tempurung dengan garis rambut di dahi, menutup belakang kepala sampai tengkuk
    def hair(u, v):
        th = u * math.tau
        ph0 = math.radians(40 * math.cos(th) - 5 * math.cos(2 * th))
        ph = ph0 + (math.radians(86) - ph0) * v
        p = head_pt(th, ph, 0.011 + 0.004 * v)
        return p + Vector((0, -0.006 * v, 0.006 * v))
    A.add(PUTIH, grid(hair, 20, 7, False, True), 'rambut')
    A.export()


# ---------- tumbuhan dan perabot jalan ----------
def pohon_mangga():
    A = Asset('pohon_mangga', 'alam')
    kayu = hexc('6b4f33')
    A.add(kayu, cyl((0, 0, 1.0), 0.18, 2.0, 'z', 8, r2=0.12))
    A.add(kayu, cyl((0.35, 0.1, 2.1), 0.07, 1.0, 'z', 6, rot=(0.2, 0.7, 0)))
    A.add(kayu, cyl((-0.3, -0.15, 2.2), 0.07, 0.9, 'z', 6, rot=(-0.3, -0.6, 0)))
    daun = [hexc('4f8a3c'), hexc('3f7a35'), hexc('5e9a46'), hexc('467f37')]
    for i, (x, y, z, r) in enumerate([(0, 0, 3.0, 1.25), (0.9, 0.3, 2.6, 0.9), (-0.85, -0.25, 2.7, 0.95), (0.2, -0.8, 2.5, 0.8), (-0.2, 0.8, 2.8, 0.85), (0.1, 0.1, 3.7, 0.8),
                                      (0.7, -0.6, 3.3, 0.7), (-0.6, 0.6, 3.4, 0.7), (1.1, 0.0, 3.0, 0.6), (-1.1, 0.2, 2.9, 0.6), (0.0, -1.0, 3.0, 0.65), (0.3, 0.9, 3.5, 0.6)]):
        A.add(daun[i % 4], ball((x, y, z), r, 1, (1, 1, 0.85), 0.16, i + 7))
    A.add(BAYANG, plane((0, 0, 0.012), 2.6, 2.6))
    A.export()


def pohon_kelapa():
    A = Asset('pohon_kelapa', 'alam')
    kayu, daun = hexc('8a6e4b'), hexc('4f8a3c')
    pts = []
    for i in range(9):
        t = i / 8
        pts.append(Vector((0.55 * t * t, 0.0, 7.0 * t)))
    for i in range(8):
        a, b = pts[i], pts[i + 1]
        d = b - a
        c = (a + b) / 2
        rot = (0, math.atan2(d.x, d.z), 0)
        A.add(kayu, cyl(tuple(c), 0.17 - i * 0.008, d.length + 0.02, 'z', 7, rot=rot))
    top = pts[-1]
    for k in range(9):
        ang = k / 9 * math.tau
        def frond(b, ang=ang):
            L, n = 2.6, 6
            cl = []
            for j in range(n + 1):
                t = j / n
                r = L * t
                droop = -1.4 * t * t + 0.35 * t
                w = 0.32 * math.sin(math.pi * min(1, t * 1.1)) + 0.02
                cx, cy = math.cos(ang) * r, math.sin(ang) * r
                px, py = -math.sin(ang) * w, math.cos(ang) * w
                p1, p2 = (top.x + cx + px, top.y + cy + py, top.z + droop), (top.x + cx - px, top.y + cy - py, top.z + droop)
                cl.append((b.verts.new(p1), b.verts.new(p2), b.verts.new(p1), b.verts.new(p2)))
            for j in range(n):   # dua sisi, titik terpisah supaya terlihat dari atas dan bawah
                b.faces.new((cl[j][0], cl[j + 1][0], cl[j + 1][1], cl[j][1]))
                b.faces.new((cl[j][3], cl[j + 1][3], cl[j + 1][2], cl[j][2]))
        A.add(daun if k % 2 else hexc('5e9a46'), frond)
    for k in range(4):
        A.add(hexc('6b4f2a'), ball((top.x + 0.18 * math.cos(k * 1.6), 0.18 * math.sin(k * 1.6), top.z - 0.25), 0.13, 1))
    A.add(BAYANG, plane((0, 0, 0.012), 1.2, 1.2))
    A.export()


def tiang(name='tiang', trafo=False):
    A = Asset(name, 'bangunan')
    beton = hexc('9a9a96')
    A.add(beton, cyl((0, 0, 4.5), 0.13, 9.0, 'z', 8, r2=0.09))
    for z, w in ((8.6, 1.7), (7.9, 1.2)):
        A.add(hexc('5a5a5a'), cube((0, 0, z), (w, 0.08, 0.08)))
        for x in ((-0.64, 0.64) if w > 1.5 else (-0.45, 0.45)):
            A.add(hexc('e9e9e9'), cyl((x, 0, z + 0.1), 0.04, 0.14, 'z', 6))
    A.add(hexc('5a5a5a'), cube((0.3, 0, 8.25), (0.6, 0.04, 0.04), rot=(0, -0.8, 0)))
    if trafo:
        A.add(hexc('8f979c'), cyl((0, 0.32, 6.6), 0.26, 0.7, 'z', 10))
        A.add(hexc('6f777c'), cube((0, 0.32, 7.0), (0.5, 0.5, 0.06)))
        for x in (-0.12, 0, 0.12):
            A.add(hexc('e9e9e9'), cyl((x, 0.32, 7.1), 0.03, 0.14, 'z', 6))
    A.add(hexc('f2f2f2'), cube((0, 0, 1.6), (0.27, 0.27, 0.12)))
    A.export()


def lampu_jalan():
    A = Asset('lampu_jalan', 'bangunan')
    besi = hexc('7d8286')
    A.add(besi, cyl((0, 0, 3.5), 0.08, 7.0, 'z', 8, r2=0.06))
    pts = [(0, 6.7), (0.35, 7.0), (0.8, 7.12), (1.4, 7.12)]
    for (x0, z0), (x1, z1) in zip(pts, pts[1:]):
        dx, dz = x1 - x0, z1 - z0
        A.add(besi, cyl(((x0 + x1) / 2, 0, (z0 + z1) / 2), 0.045, math.hypot(dx, dz) + 0.03, 'z', 6, rot=(0, math.atan2(dx, dz), 0)))
    A.add(hexc('3a3f44'), cube((1.42, 0, 7.06), (0.56, 0.24, 0.12), bevel=0.03))
    A.add(PUTIH, cube((1.42, 0, 6.99), (0.44, 0.17, 0.03)), 'bulb')
    A.add(besi, cube((0, 0, 0.1), (0.3, 0.3, 0.2)))
    A.export()


def lampu_merah():
    """Tiang di titik asal, lengan ke +X; lampu menghadap -Y (ke pengemudi yang datang)."""
    A = Asset('lampu_merah', 'bangunan')
    besi = hexc('4a5056')
    A.add(besi, cyl((0, 0, 3.0), 0.10, 6.0, 'z', 10))
    A.add(besi, cyl((2.5, 0, 5.80), 0.06, 5.0, 'x', 8))
    A.add(besi, cube((0.5, 0, 5.4), (1.1, 0.05, 0.05), rot=(0, 0.6, 0)))
    A.add(hexc('151515'), cube((4.40, 0, 5.45), (1.10, 0.30, 0.38), bevel=0.04))
    A.add(besi, cyl((4.40, 0, 5.70), 0.03, 0.2, 'z', 6))
    for i, x in enumerate((3.98, 4.40, 4.82)):
        def visor(b, x=x):
            vs = []
            for j in range(7):
                a = math.pi * j / 6
                vs.append((x + 0.14 * math.cos(a), -0.15, 5.45 + 0.14 * math.sin(a)))
            f, bk = [b.verts.new(v) for v in vs], [b.verts.new((v[0], v[1] - 0.16, v[2])) for v in vs]
            f2, bk2 = [b.verts.new(v) for v in vs], [b.verts.new((v[0], v[1] - 0.16, v[2])) for v in vs]
            for j in range(6):
                b.faces.new((f[j], f[j + 1], bk[j + 1], bk[j]))
                b.faces.new((bk2[j], bk2[j + 1], f2[j + 1], f2[j]))
        A.add(hexc('151515'), visor)
        A.add(PUTIH, cyl((x, -0.155, 5.45), 0.11, 0.02, 'y', 12), f'lamp{i}')
    A.add(PUTIH, cube((0, -0.12, 2.2), (0.24, 0.02, 0.5)))
    A.export()


def gerobak():
    A = Asset('gerobak')
    A.add(BAYANG, plane((0, 0, 0.012), 0.9, 1.5))
    A.add(hexc('f1ede2'), cube((0, 0, 0.75), (0.62, 1.15, 0.6), bevel=0.02))
    A.add(KACA, cube((0, 0.05, 1.28), (0.56, 0.8, 0.46)))
    A.add(hexc('d33a2b'), cube((0, 0, 1.53), (0.7, 1.25, 0.04)))
    A.add(hexc('d33a2b'), cube((0.312, 0, 0.75), (0.01, 1.0, 0.18)))
    A.add(hexc('d33a2b'), cube((-0.312, 0, 0.75), (0.01, 1.0, 0.18)))
    A.add(KROM, cyl((0, -0.35, 1.12), 0.15, 0.3, 'z', 12))
    for sx in (-1, 1):
        A.add(BAN, cyl((sx * 0.36, -0.25, 0.28), 0.28, 0.05, 'x', 16))
        A.add(VELG, cyl((sx * 0.36, -0.25, 0.28), 0.04, 0.06, 'x', 8))
        A.add(GELAP, cyl((sx * 0.22, 0.75, 0.75), 0.02, 0.5, 'y', 6))
    A.add(GELAP, cyl((0, 0.55, 0.25), 0.02, 0.5, 'z', 6))
    A.export()


# ---------- bangunan pinggir jalan (depan = +X, menghadap jalan) ----------
def ruko():
    """Ruko dua lantai: kedalaman 5 m (x -2.5..2.5), muka 4 m (y -2..2), tinggi 7 m."""
    A = Asset('ruko', 'bangunan')
    D, F = 5.0, 4.0
    A.add(CAT, cube((-0.05, 0, 1.70), (D - 0.1, F, 3.4)))
    A.add(CAT, cube((0.05, 0, 5.0), (D + 0.1, F, 3.2)))
    A.add(CAT, cube((0.05, 0, 6.8), (D + 0.1, F + 0.04, 0.4)))
    A.add(hexc('d8d2c0'), cube((2.62, 0, 7.02), (0.16, F + 0.08, 0.06)), k='beton')
    A.add(hexc('d8d2c0'), cube((2.68, 0, 3.42), (0.12, F + 0.04, 0.08)), k='beton')
    A.add(hexc('7d776c'), cube((0, 0, 6.62), (D - 0.1, F - 0.1, 0.04)))
    # lantai bawah: rolling door terangkat, isi toko
    A.add(hexc('15191c'), cube((2.41, 0, 1.35), (0.02, 3.5, 2.5)))
    A.add(hexc('9aa3a8'), cube((2.43, 0, 2.95), (0.04, 3.6, 0.5)))
    for z in (2.76, 2.88, 3.0, 3.12):
        A.add(hexc('7f888d'), cube((2.455, 0, z), (0.01, 3.6, 0.03)))
    for sy in (-1, 1):
        A.add(CAT, cube((2.35, sy * 1.88, 1.70), (0.2, 0.24, 3.4)))
    rnd = random.Random(11)
    warna = ['d9534f', '3e7cb1', 'e6b33a', '5aa469', 'e07b39', 'f2f2f2', '8e6bbf']
    for z in (0.55, 1.15, 1.75):
        A.add(hexc('8a6a3e'), cube((1.95, 0, z), (0.4, 3.3, 0.04)))
        for i in range(9):
            A.add(hexc(rnd.choice(warna)), cube((1.95, -1.5 + i * 0.37, z + 0.15), (0.25, 0.28, 0.26)))
    A.add(hexc('8a6a3e'), cube((2.15, 0.9, 0.5), (0.4, 1.4, 1.0)))
    A.add(KACA, cube((2.36, 0.9, 1.05), (0.02, 1.3, 0.08)))
    # kanopi
    A.add(KETIGA, cube((2.95, 0, 3.15), (1.0, 3.9, 0.05), rot=(0, 0.18, 0)))
    for sy in (-1, 1):
        A.add(hexc('5a5a5a'), cube((2.95, sy * 1.85, 3.05), (0.9, 0.04, 0.04), rot=(0, 0.6, 0)))
    # papan nama (diganti tekstur di JS)
    A.add(hexc('fbfbf2'), cube((2.62, 0, 3.80), (0.06, 3.8, 0.72)))
    # lantai atas: dua jendela, AC, talang
    for y in (-0.95, 0.95):
        A.add(PUTIH, cube((2.61, y, 5.25), (0.04, 1.3, 1.5)))
        A.add(hexc('5d7a8c'), cube((2.63, y, 5.25), (0.02, 1.15, 1.35)))
        A.add(PUTIH, cube((2.645, y, 5.25), (0.01, 0.05, 1.35)))
        for k in range(7):
            A.add(hexc('333333'), cyl((2.69, y - 0.54 + k * 0.18, 5.25), 0.012, 1.35, 'z', 6))
        A.add(hexc('333333'), cube((2.69, y, 5.9), (0.03, 1.2, 0.03)))
        A.add(hexc('333333'), cube((2.69, y, 4.6), (0.03, 1.2, 0.03)))
        A.add(CAT, cube((2.7, y, 4.45), (0.2, 1.4, 0.06)))
    A.add(hexc('e8e8e8'), cube((2.78, -0.95, 4.2), (0.34, 0.72, 0.42), bevel=0.02))
    A.add(GELAP, cube((2.96, -0.95, 4.2), (0.01, 0.5, 0.28)))
    A.add(hexc('7f888d'), cyl((2.62, 1.95, 3.3), 0.04, 6.6, 'z', 6))
    # atap: toren air oranye dan kotak tangga
    A.add(hexc('6f6a60'), cube((-1.6, 1.2, 7.25), (0.6, 0.6, 0.5)))
    A.add(hexc('e07b39'), cyl((-1.6, 1.2, 7.95), 0.45, 0.9, 'z', 14))
    A.add(hexc('e07b39'), cyl((-1.6, 1.2, 8.45), 0.3, 0.1, 'z', 14))
    A.add(CAT, cube((-1.7, -1.1, 7.3), (1.0, 1.2, 0.6)))
    A.export()


def rumah():
    """Rumah kampung: kedalaman 5 m (x -2.5..2.5, teras di depan), muka 6 m, atap genteng pelana."""
    A = Asset('rumah', 'bangunan')
    A.add(hexc('9a9590'), cube((-0.45, 0, 0.15), (4.1, 6.0, 0.3)))
    A.add(CAT, cube((-0.45, 0, 1.75), (4.0, 5.9, 2.9)))
    A.add(hexc('a85a46'), cube((-0.45, 0, 0.62), (4.04, 5.94, 0.64)), k='bata')
    for y in (-2.96, 2.96):
        A.add(hexc('6b4f33'), cube((-0.45, y, 3.06), (4.6, 0.06, 0.12)))
    A.add(hexc('b8b2a7'), cube((2.05, 0.6, 0.12), (0.9, 3.4, 0.24)))
    for y in (-1.05, 2.2):
        A.add(PUTIH, cyl((2.3, y, 1.6), 0.09, 2.9, 'z', 8))
    A.add(hexc('6e4a2a'), cube((1.57, -0.2, 1.3), (0.06, 0.95, 2.1)))
    A.add(hexc('8a5d33'), cube((1.59, -0.2, 1.3), (0.02, 0.8, 1.95)))
    for y in (-2.0, 1.4):
        A.add(PUTIH, cube((1.57, y, 1.75), (0.06, 1.2, 1.2)))
        A.add(hexc('5d7a8c'), cube((1.59, y, 1.75), (0.02, 1.05, 1.05)))
        A.add(PUTIH, cube((1.60, y, 1.75), (0.01, 0.04, 1.05)))
        for k in range(6):
            A.add(hexc('333333'), cyl((1.63, y - 0.45 + k * 0.18, 1.75), 0.012, 1.05, 'z', 6))
        A.add(PUTIH, cube((1.66, y, 1.12), (0.12, 1.3, 0.05)))
        A.add(hexc('2f8f5b'), cube((1.60, y - 0.66, 1.75), (0.02, 0.28, 1.2)))
        A.add(hexc('2f8f5b'), cube((1.60, y + 0.66, 1.75), (0.02, 0.28, 1.2)))
    # atap: bubungan searah Y, emper menutup teras
    def roof(b):
        x0, x1, y0, y1, z0, z1 = -2.75, 2.75, -3.35, 3.35, 3.05, 4.7
        xm = (x0 + x1) / 2
        v = lambda x, y, z: b.verts.new((x, y, z))
        a, bb, c, d = v(x0, y0, z0), v(x0, y1, z0), v(xm, y1, z1), v(xm, y0, z1)
        e, f, g, h = v(x1, y1, z0), v(x1, y0, z0), v(xm, y0, z1), v(xm, y1, z1)
        for quad, out in (((a, d, c, bb), Vector((-1, 0, 1))), ((e, h, g, f), Vector((1, 0, 1)))):
            fc = b.faces.new(quad)
            fc.normal_update()
            if fc.normal.dot(out) < 0:
                fc.normal_flip()
    A.add(KEDUA, roof)
    for t in range(1, 6):
        for sx in (-1, 1):
            x = sx * (2.75 - t * 0.46)
            A.add(KEDUA, cube((x, 0, 3.05 + t * 0.30 + 0.02), (0.05, 6.7, 0.04)))
    A.add(hexc('6f2f24'), cyl((0, 0, 4.72), 0.11, 6.8, 'y', 12))
    for x in (-2.75, 2.75):
        A.add(hexc('6b4f33'), cube((x, 0, 3.02), (0.06, 6.8, 0.16)))
    A.add(PUTIH, cube((-0.45, 3.0, 3.6), (4.0, 0.02, 0.4)))
    A.add(PUTIH, cube((-0.45, -3.0, 3.6), (4.0, 0.02, 0.4)))
    # pagar depan
    for i in range(9):
        A.add(hexc('e8e2d0'), cube((2.45, -2.8 + i * 0.7, 0.45), (0.1, 0.1, 0.9)))
    A.add(hexc('2f8f5b'), cube((2.45, 0, 0.8), (0.04, 5.8, 0.06)))
    A.add(hexc('2f8f5b'), cube((2.45, 0, 0.35), (0.04, 5.8, 0.06)))
    A.export()


def warung():
    """Warung kayu: kedalaman 3 m (x -1.5..1.5), muka 3.2 m, terpal miring ke jalan."""
    A = Asset('warung', 'bangunan')
    kayu, triplek = hexc('7a5a2e'), hexc('c9a66b')
    for x in (-1.4, 1.4):
        for y in (-1.5, 1.5):
            A.add(kayu, cube((x, y, 1.2), (0.1, 0.1, 2.4 if x < 0 else 2.0)))
    A.add(triplek, cube((-1.4, 0, 1.2), (0.05, 3.0, 2.4)))
    for y in (-1.5, 1.5):
        A.add(triplek, cube((0, y, 0.9), (2.8, 0.05, 1.8)))
    A.add(kayu, cube((1.15, 0, 0.5), (0.5, 3.0, 1.0)))
    A.add(hexc('9a7a4e'), cube((1.15, 0, 1.02), (0.6, 3.1, 0.05)))
    for i in range(6):
        y = -1.2 + i * 0.48
        A.add(hexc('cfe6ee'), cyl((1.15, y, 1.17), 0.1, 0.25, 'z', 8))
        A.add(hexc(['d9534f', 'e6b33a', '3e7cb1', '5aa469'][i % 4]), cyl((1.15, y, 1.31), 0.1, 0.04, 'z', 8))
    rnd = random.Random(5)
    for i in range(10):
        A.add(hexc(rnd.choice(['d9534f', 'e6b33a', '3e7cb1', '5aa469', 'e07b39', 'f2f2f2'])), cube((1.38, -1.35 + i * 0.3, 1.55), (0.02, 0.2, 0.55)))
    A.add(kayu, cube((1.38, 0, 1.85), (0.04, 3.0, 0.04)))
    for z in (0.6, 1.2, 1.8):
        A.add(kayu, cube((-1.1, 0, z), (0.5, 2.8, 0.04)))
        for i in range(7):
            A.add(hexc(rnd.choice(['d9534f', 'e6b33a', '3e7cb1', '5aa469', 'e07b39'])), cube((-1.1, -1.2 + i * 0.4, z + 0.14), (0.3, 0.3, 0.24)))
    A.add(KETIGA, cube((0.15, 0, 2.35), (3.4, 3.5, 0.04), rot=(0, 0.16, 0)))
    for i in range(6):
        A.add(PUTIH, cube((0.15, -1.45 + i * 0.58, 2.37), (3.4, 0.18, 0.01), rot=(0, 0.16, 0)))
    A.add(hexc('3e7cb1'), cube((1.48, 0, 2.05), (0.02, 2.0, 0.3)))
    A.add(kayu, cube((1.8, 0, 0.42), (0.35, 2.6, 0.06)))
    for y in (-1.1, 1.1):
        A.add(kayu, cube((1.8, y, 0.2), (0.3, 0.06, 0.4)))
    A.export()


# ---------- bentuk tambahan untuk bangunan ----------
def _face_out(b, vs, out):
    f = b.faces.new(vs)
    f.normal_update()
    if f.normal.dot(Vector(out)) < 0:
        f.normal_flip()
    return f


def gable(x0, x1, y0, y1, z0, z1, ridge='y', ends=True):
    """Atap pelana. ridge='y': bubungan searah Y."""
    def fn(b):
        v = lambda x, y, z: b.verts.new((x, y, z))
        if ridge == 'y':
            xm = (x0 + x1) / 2
            _face_out(b, [v(x0, y0, z0), v(x0, y1, z0), v(xm, y1, z1), v(xm, y0, z1)], (-1, 0, 1))
            _face_out(b, [v(x1, y0, z0), v(x1, y1, z0), v(xm, y1, z1), v(xm, y0, z1)], (1, 0, 1))
            if ends:
                _face_out(b, [v(x0, y0, z0), v(x1, y0, z0), v(xm, y0, z1)], (0, -1, 0))
                _face_out(b, [v(x0, y1, z0), v(x1, y1, z0), v(xm, y1, z1)], (0, 1, 0))
        else:
            ym = (y0 + y1) / 2
            _face_out(b, [v(x0, y0, z0), v(x1, y0, z0), v(x1, ym, z1), v(x0, ym, z1)], (0, -1, 1))
            _face_out(b, [v(x0, y1, z0), v(x1, y1, z0), v(x1, ym, z1), v(x0, ym, z1)], (0, 1, 1))
            if ends:
                _face_out(b, [v(x0, y0, z0), v(x0, y1, z0), v(x0, ym, z1)], (-1, 0, 0))
                _face_out(b, [v(x1, y0, z0), v(x1, y1, z0), v(x1, ym, z1)], (1, 0, 0))
    return fn


def pyramid(cx, cy, z0, w, l, h, top=0.0):
    """Atap perisai / limas (joglo): alas w×l, puncak selebar top."""
    def fn(b):
        n0 = len(b.verts)
        bmesh.ops.create_cone(b, cap_ends=True, cap_tris=False, segments=4, radius1=1.0, radius2=max(top, 0.0001), depth=h)
        new = _baru(b, n0)
        R = Matrix.Rotation(math.pi / 4, 4, 'Z')
        for v in new:
            q = R @ v.co
            v.co = Vector((cx + q.x * w / math.sqrt(2), cy + q.y * l / math.sqrt(2), z0 + h / 2 + q.z))
    return fn


def dome(c, r, sz=1.0, seg=16):
    def fn(b):
        n0 = len(b.verts)
        bmesh.ops.create_uvsphere(b, u_segments=seg, v_segments=seg // 2, radius=1.0)
        new = _baru(b, n0)
        bmesh.ops.delete(b, geom=[v for v in new if v.co.z < -1e-4], context='VERTS')
        for v in _baru(b, n0):
            v.co = Vector((c[0] + v.co.x * r, c[1] + v.co.y * r, c[2] + v.co.z * r * sz))
    return fn


def arch_win(A, x, y, z0, w, h, face, col=hexc('2f4a3c'), frame=PUTIH):
    """Jendela lengkung di dinding yang menghadap face ('x+','x-','y+','y-')."""
    t = 0.03
    if face[0] == 'x':
        sx = 1 if face[1] == '+' else -1
        A.add(frame, cube((x, y, z0 + h / 2), (t, w + 0.12, h + 0.06)))
        A.add(col, cube((x + sx * 0.02, y, z0 + (h - w / 2) / 2), (t, w, h - w / 2)))
        A.add(col, cyl((x + sx * 0.02, y, z0 + h - w / 2), w / 2, t, 'x', 10))
    else:
        sy = 1 if face[1] == '+' else -1
        A.add(frame, cube((x, y, z0 + h / 2), (w + 0.12, t, h + 0.06)))
        A.add(col, cube((x, y + sy * 0.02, z0 + (h - w / 2) / 2), (w, t, h - w / 2)))
        A.add(col, cyl((x, y + sy * 0.02, z0 + h - w / 2), w / 2, t, 'y', 10))


def tree_at(A, x, y, s=1.0, seed=0, kayu=hexc('6b4f33')):
    A.add(kayu, cyl((x, y, 0.9 * s), 0.12 * s, 1.8 * s, 'z', 6, r2=0.08 * s))
    for i, (dx, dy, dz, r) in enumerate(((0, 0, 2.3, 0.95), (0.5, 0.2, 2.0, 0.7), (-0.45, -0.25, 2.1, 0.7))):
        A.add([hexc('4f8a3c'), hexc('3f7a35'), hexc('5e9a46')][(i + seed) % 3], ball((x + dx * s, y + dy * s, dz * s), r * s, 1, (1, 1, 0.85), 0.15, seed + i))


def lot(A, col, h=0.05):
    A.add(col, cube((-6.8, 0, h / 2), (13.6, 22.4, h)))


# ---------- landmark (muka di x = 0 menghadap +X ke jalan, luas x -13.6..0, y -11.2..11.2) ----------
def lm_terminal():
    A = Asset('lm_terminal', 'bangunan')
    lot(A, hexc('9aa0a3'))
    for y in (-8, -4, 0, 4, 8):
        for x in (-4.6, -8.6):
            A.add(PUTIH, cube((x, y, 0.06), (2.4, 0.08, 0.01)))
    for i, x in enumerate((-2.6, -6.6, -10.6)):
        A.add(hexc('cfc7b0'), cube((x, -0.6, 0.15), (1.8, 19.6, 0.25)))
        A.add(hexc('f2c230'), cube((x + 0.88, -0.6, 0.28), (0.06, 19.6, 0.02)))
        A.add(hexc('f2c230'), cube((x - 0.88, -0.6, 0.28), (0.06, 19.6, 0.02)))
        for y in range(-10, 10, 3):
            A.add(hexc('8d9396'), cyl((x, y, 2.0), 0.1, 3.6, 'z', 8))
            A.add(hexc('2a6fb5'), cube((x - 0.55, y + 0.5, 0.55), (0.35, 1.4, 0.06)))
            A.add(GELAP, cube((x - 0.55, y + 0.5, 0.35), (0.3, 1.3, 0.35)))
        A.add(hexc('2f6fb0'), cube((x, -0.6, 3.85), (3.0, 20.4, 0.12), rot=(0, 0.08, 0)))
        A.add(hexc('245a91'), cube((x + 1.5, -0.6, 3.72), (0.08, 20.4, 0.2)))
    # gerbang depan tempat papan nama
    for y in (-6.6, 6.6):
        A.add(hexc('8d9396'), cube((-0.45, y, 2.9), (0.5, 0.5, 5.8), bevel=0.04))
    A.add(hexc('1f4f7f'), cube((-0.45, 0, 4.8), (0.5, 13.6, 2.0), bevel=0.04))
    # loket dan kios belakang
    A.add(PUTIH, cube((-12.2, 9.0, 1.4), (2.4, 3.6, 2.8)))
    A.add(KEDUA, gable(-13.6, -10.8, 7.0, 11.0, 2.8, 4.0, 'x'))
    A.add(KACA, cube((-10.98, 9.0, 1.5), (0.02, 1.6, 1.0)))
    for i, y in enumerate((-9.6, -7.2, -4.8, -2.4)):
        A.add(hexc('e9e2cf'), cube((-12.6, y, 1.1), (1.8, 2.2, 2.2)))
        A.add(hexc(['d9534f', 'e6b33a', '5aa469', '3e7cb1'][i]), cube((-11.4, y, 2.15), (0.9, 2.3, 0.06), rot=(0, 0.25, 0)))
        A.add(GELAP, cube((-11.69, y, 1.0), (0.02, 1.6, 1.4)))
    A.export()


def lm_pasar():
    A = Asset('lm_pasar', 'bangunan')
    lot(A, hexc('b9b1a0'))
    tembok = hexc('d8cfb8')
    A.add(tembok, cube((-7.6, 0, 2.2), (10.8, 20.4, 4.4)))
    A.add(hexc('6f6a60'), cube((-2.19, 0, 3.85), (0.02, 20.4, 0.5)))
    for y in (-6.5, -2.5, 2.5, 6.5):
        A.add(hexc('15191c'), cube((-2.19, y, 1.5), (0.03, 2.6, 3.0)))
    A.add(hexc('15191c'), cube((-2.19, 0, 1.7), (0.03, 3.2, 3.4)))
    A.add(hexc('a8a091'), cube((-1.8, 0, 0.15), (0.8, 3.6, 0.3)))
    seng = hexc('8f9aa0')
    A.add(seng, gable(-13.6, -1.6, -10.8, 10.8, 4.4, 7.6, 'y'))
    for k in range(1, 10):
        x = -1.6 - k * 0.6
        if x > -7.6:
            A.add(hexc('7d878d'), cube((x, 0, 4.4 + (k * 0.6) * (3.2 / 6.0) + 0.02), (0.05, 21.6, 0.03)))
        x2 = -13.6 + k * 0.6
        if x2 < -7.6:
            A.add(hexc('7d878d'), cube((x2, 0, 4.4 + (k * 0.6) * (3.2 / 6.0) + 0.02), (0.05, 21.6, 0.03)))
    A.add(seng, gable(-8.6, -6.6, -10.8, 10.8, 7.7, 8.4, 'y'))
    A.add(hexc('c0392b'), cube((-1.75, 0, 5.6), (0.2, 11.8, 2.3)))      # papan nama di atas pintu
    for y in (-5.6, 5.6):
        A.add(hexc('8d9396'), cube((-1.75, y, 4.6), (0.2, 0.2, 2.0)))
    # lapak depan
    rnd = random.Random(21)
    sayur = ['5aa469', 'd9534f', 'e07b39', 'e6b33a', '8e6bbf', '3f7a35']
    for i in range(9):
        y = -10.0 + i * 2.5
        A.add(hexc('8a6a3e'), cube((-1.0, y, 0.45), (1.2, 2.1, 0.9)))
        for k in range(6):
            A.add(hexc(rnd.choice(sayur)), ball((-1.3 + (k % 3) * 0.3, y - 0.6 + (k // 3) * 0.9, 0.98), 0.16, 1, (1, 1, 0.7)))
        for dy in (-1.0, 1.0):
            A.add(hexc('6b4f33'), cyl((-0.45, y + dy, 1.1), 0.03, 2.2, 'z', 6))
        A.add(hexc(['d9534f', '3e7cb1', 'e6b33a', '2f8f4f', 'e07b39'][i % 5]), cube((-1.0, y, 2.2), (1.7, 2.3, 0.04), rot=(0, 0.22, 0)))
    A.export()


def lm_masjid():
    A = Asset('lm_masjid', 'bangunan')
    krem, hijau, emas = hexc('f4efe2'), hexc('2f8f5b'), hexc('e6c84a')
    A.add(hexc('e9e4d6'), cube((-6.8, 0, 0.08), (13.2, 21.6, 0.16)))
    # pagar depan dengan papan nama di tengah, gerbang di kanan
    for i in range(23):
        y = -10.6 + i * 0.96
        if 5.8 < y < 8.6:
            continue
        A.add(krem, cube((-0.3, y, 0.55), (0.24, 0.24, 1.1)))
        A.add(hijau, cube((-0.3, y + 0.48, 0.75), (0.06, 0.7, 0.05)))
    A.add(krem, cube((-0.3, 0, 0.35), (0.22, 21.2, 0.5)))
    A.add(krem, cube((-0.55, 0, 1.6), (0.18, 8.4, 1.5)))
    for y in (5.8, 8.6):
        A.add(krem, cube((-0.3, y, 1.0), (0.45, 0.45, 2.0)))
        A.add(hijau, dome((-0.3, y, 2.0), 0.28))
    # serambi
    A.add(krem, cube((-1.6, 0, 0.3), (1.6, 8.0, 0.3)))
    for y in (-3.4, -1.15, 1.15, 3.4):
        A.add(krem, cyl((-1.0, y, 1.9), 0.16, 3.0, 'z', 10))
    A.add(krem, cube((-1.7, 0, 3.55), (1.8, 8.4, 0.3)))
    A.add(hijau, cube((-0.85, 0, 3.55), (0.06, 8.4, 0.18)))
    # ruang utama
    A.add(krem, cube((-5.8, 0, 1.95), (6.8, 10.4, 3.6)))
    A.add(hijau, cube((-5.8, 0, 3.85), (7.0, 10.6, 0.25)))
    for y in (-3.6, -1.2, 1.2, 3.6):
        arch_win(A, -2.39, y, 0.9, 0.9, 2.2, 'x+')
    for x in (-3.9, -5.8, -7.7):
        arch_win(A, x, 5.21, 0.9, 0.9, 2.2, 'y+')
        arch_win(A, x, -5.21, 0.9, 0.9, 2.2, 'y-')
    # drum, kubah utama, kubah sudut
    A.add(krem, cyl((-5.8, 0, 4.5), 2.6, 1.1, 'z', 16))
    for k in range(8):
        a = k / 8 * math.tau
        A.add(hexc('2f4a3c'), cube((-5.8 + 2.61 * math.cos(a), 2.61 * math.sin(a), 4.5), (0.05, 0.4, 0.6), rot=(0, 0, a)))
    A.add(hijau, dome((-5.8, 0, 5.05), 2.75, 1.15, 20))
    A.add(emas, cyl((-5.8, 0, 8.4), 0.08, 0.9, 'z', 8))
    A.add(emas, ball((-5.8, 0, 8.25), 0.2, 1))
    for dx, dy in ((-2.9, -4.7), (-2.9, 4.7), (-8.7, -4.7), (-8.7, 4.7)):
        A.add(krem, cyl((dx, dy, 4.25), 0.55, 0.6, 'z', 10))
        A.add(hijau, dome((dx, dy, 4.55), 0.6, 1.2))
    # menara
    mx, my = -1.6, -8.6
    A.add(krem, cube((mx, my, 1.1), (1.4, 1.4, 2.2)))
    A.add(krem, cyl((mx, my, 6.0), 0.5, 7.6, 'z', 8, r2=0.42))
    for z in (4.0, 6.8):
        A.add(hijau, cyl((mx, my, z), 0.52, 0.25, 'z', 8))
    A.add(krem, cyl((mx, my, 9.85), 0.85, 0.15, 'z', 12))
    for k in range(10):
        a = k / 10 * math.tau
        A.add(hijau, cube((mx + 0.8 * math.cos(a), my + 0.8 * math.sin(a), 10.1), (0.06, 0.06, 0.4)))
    A.add(krem, cyl((mx, my, 10.7), 0.36, 1.5, 'z', 8))
    A.add(hijau, dome((mx, my, 11.45), 0.42, 1.4))
    A.add(emas, cyl((mx, my, 12.2), 0.05, 0.5, 'z', 6))
    for x, y in ((-11.5, -8), (-11.5, 8), (-9.8, 9.5)):
        tree_at(A, x, y, 1.2, int(x * 10 + y))
    A.export()


def lm_sekolah():
    A = Asset('lm_sekolah', 'bangunan')
    krem, genteng = hexc('efe6d2'), hexc('b5523b')
    lot(A, hexc('b8b2a7'))
    A.add(hexc('c9b98a'), cube((-6.0, 0, 0.07), (7.6, 10.6, 0.04)))
    wings = ((-11.7, 0, 2.6, 17.6, 'y'), (-6.0, 7.2, 8.8, 3.2, 'x'), (-6.0, -7.2, 8.8, 3.2, 'x'))
    for cx, cy, dx, dy, rd in wings:
        A.add(krem, cube((cx, cy, 1.6), (dx, dy, 3.2)))
        A.add(hexc('3e6fb1'), cube((cx, cy, 0.25), (dx + 0.02, dy + 0.02, 0.5)))
        A.add(genteng, gable(cx - dx / 2 - 0.5, cx + dx / 2 + 0.5, cy - dy / 2 - 0.5, cy + dy / 2 + 0.5, 3.2, 4.9, rd))
    for i in range(6):
        y = -6.0 + i * 2.4
        A.add(hexc('8a5d33'), cube((-10.39, y - 0.5, 1.1), (0.03, 0.8, 2.0)))
        A.add(hexc('5d7a8c'), cube((-10.39, y + 0.5, 1.9), (0.03, 0.9, 1.0)))
        A.add(PUTIH, cyl((-9.6, y, 1.6), 0.08, 3.2, 'z', 6))
    for sy in (-1, 1):
        for i in range(3):
            x = -3.0 - i * 2.6
            A.add(hexc('8a5d33'), cube((x - 0.5, sy * 5.59, 1.1), (0.8, 0.03, 2.0)))
            A.add(hexc('5d7a8c'), cube((x + 0.6, sy * 5.59, 1.9), (0.9, 0.03, 1.0)))
    A.add(hexc('d8d8d8'), cube((-5.5, 0, 0.15), (1.2, 1.2, 0.3)))
    A.add(PUTIH, cyl((-5.5, 0, 3.6), 0.05, 7.2, 'z', 8))
    A.add(hexc('d33a2b'), cube((-5.5, 0.55, 6.9), (0.02, 1.0, 0.32)))
    A.add(PUTIH, cube((-5.5, 0.55, 6.58), (0.02, 1.0, 0.32)))
    for i in range(25):
        y = -11.0 + i * 0.92
        if abs(y) < 4.0:
            continue
        A.add(hexc('3e6fb1'), cube((-0.3, y, 0.6), (0.1, 0.1, 1.2)))
    A.add(hexc('3e6fb1'), cube((-0.3, 0, 1.0), (0.06, 21.6, 0.06)))
    for y in (-3.6, 3.6):
        A.add(krem, cube((-0.6, y, 1.2), (0.3, 0.3, 2.4)))
    A.add(PUTIH, cube((-0.65, 0, 2.0), (0.12, 7.4, 1.3)))
    tree_at(A, -3.0, -3.5, 1.0, 3)
    tree_at(A, -3.0, 3.5, 1.0, 4)
    A.export()


def lm_spbu():
    A = Asset('lm_spbu', 'bangunan')
    lot(A, hexc('a7abad'))
    for y in (-10.0, 10.0):
        A.add(PUTIH, cube((-1.0, y, 0.06), (1.8, 0.12, 0.01)))
    for x in (-2.8, -8.4):
        for y in (-4.8, 4.8):
            A.add(hexc('dddddd'), cube((x, y, 2.2), (0.4, 0.4, 4.4)))
    A.add(PUTIH, cube((-5.6, 0, 4.75), (7.2, 11.6, 0.4)))
    A.add(hexc('d33a2b'), cube((-5.6, 0, 4.45), (7.3, 11.7, 0.3)))
    A.add(hexc('2a6fb5'), cube((-5.6, 0, 4.25), (7.3, 11.7, 0.1)))
    for i, y in enumerate((-3.6, 0, 3.6)):
        A.add(hexc('f2c230'), cube((-5.6, y, 0.12), (4.6, 0.9, 0.2)))
        for x in (-4.4, -6.8):
            A.add(hexc('f2f2f2'), cube((x, y, 0.95), (0.55, 0.45, 1.5), bevel=0.03))
            A.add(hexc('d33a2b'), cube((x, y, 1.45), (0.57, 0.47, 0.3)))
            A.add(GELAP, cube((x + 0.28, y, 1.15), (0.02, 0.3, 0.2)))
            A.add(GELAP, cyl((x + 0.3, y + 0.15, 0.8), 0.02, 0.8, 'z', 6))
    # minimarket belakang
    A.add(PUTIH, cube((-12.0, 0, 1.6), (2.8, 10.0, 3.2)))
    A.add(hexc('d33a2b'), cube((-10.59, 0, 2.8), (0.02, 10.0, 0.5)))
    A.add(KACA, cube((-10.59, 0, 1.2), (0.02, 6.0, 2.0)))
    # tiang papan harga (papan nama di atasnya)
    for y in (6.4, 9.6):
        A.add(hexc('8d9396'), cube((-0.4, y, 3.4), (0.3, 0.3, 6.8)))
    A.add(PUTIH, cube((-0.4, 8.0, 7.6), (0.3, 5.0, 1.8)))
    A.add(hexc('2a6fb5'), cube((-0.4, 8.0, 5.9), (0.28, 3.4, 1.4)))
    A.export()


def lm_alun():
    A = Asset('lm_alun', 'bangunan')
    A.add(hexc('7fb04f'), cube((-6.8, 0, 0.03), (13.6, 22.4, 0.06)))
    cx = -6.8
    for k in range(32):
        a = k / 32 * math.tau
        A.add(hexc('e6dcc0'), cube((cx + 4.8 * math.cos(a), 4.8 * math.sin(a), 0.08), (0.9, 1.0, 0.03), rot=(0, 0, a)))
    A.add(hexc('e6dcc0'), cube((cx, 0, 0.08), (13.0, 0.9, 0.03)))
    A.add(hexc('e6dcc0'), cube((cx, 0, 0.08), (0.9, 21.0, 0.03)))
    # beringin
    kayu = hexc('5b4532')
    for i in range(5):
        a = i / 5 * math.tau
        A.add(kayu, cyl((cx + 0.35 * math.cos(a), 0.35 * math.sin(a), 1.8), 0.28, 3.6, 'z', 7, r2=0.2))
    for i in range(10):
        a = i / 10 * math.tau
        A.add(hexc('6b5a45'), cyl((cx + 1.8 * math.cos(a), 1.8 * math.sin(a), 2.0), 0.03, 4.0, 'z', 4))
    for i, (dx, dy, dz, r) in enumerate(((0, 0, 5.4, 3.0), (2.2, 1.0, 4.6, 2.2), (-2.0, -1.2, 4.7, 2.3), (0.8, -2.4, 4.4, 2.0), (-1.0, 2.4, 4.8, 2.1), (0, 0, 6.8, 2.0))):
        A.add([hexc('3f7a35'), hexc('2f6a2a'), hexc('467f37')][i % 3], ball((cx + dx, dy, dz), r, 2, (1, 1, 0.7), 0.12, i + 40))
    # pendopo joglo
    py = 8.2
    A.add(hexc('b8b2a7'), cube((cx, py, 0.25), (4.2, 4.2, 0.5)))
    for dx in (-1.6, 1.6):
        for dy in (-1.6, 1.6):
            A.add(hexc('7a5a2e'), cyl((cx + dx, py + dy, 1.85), 0.12, 2.7, 'z', 8))
    A.add(hexc('8e3f32'), pyramid(cx, py, 3.2, 5.6, 5.6, 1.0, 1.4))
    A.add(hexc('8e3f32'), pyramid(cx, py, 4.2, 2.0, 2.0, 1.4, 0.05))
    # bangku, lampu, pohon keliling
    for k in range(6):
        a = (k + 0.5) / 6 * math.tau
        x, y = cx + 5.6 * math.cos(a), 5.6 * math.sin(a)
        if abs(y - py) < 3:
            continue
        A.add(hexc('7a5a2e'), cube((x, y, 0.45), (0.5, 1.4, 0.08), rot=(0, 0, a)))
        A.add(hexc('333333'), cube((x, y, 0.22), (0.4, 1.2, 0.44), rot=(0, 0, a)))
    for k in range(10):
        a = k / 10 * math.tau
        x, y = cx + 6.2 * math.cos(a) * 0.95, 9.4 * math.sin(a)
        if abs(y - py) < 2.6 and x > cx - 3:
            continue
        tree_at(A, x, y, 1.1, k)
    for i in range(23):
        A.add(hexc('2f5d2a'), cube((-0.25, -10.8 + i * 0.98, 0.4), (0.08, 0.08, 0.8)))
    A.add(hexc('2f5d2a'), cube((-0.25, 0, 0.7), (0.05, 21.6, 0.05)))
    A.add(PUTIH, cube((-0.45, 0, 1.2), (0.1, 6.2, 1.2)))
    A.export()


def lm_kampus():
    A = Asset('lm_kampus', 'bangunan')
    lot(A, hexc('d8d2c0'))
    A.add(hexc('7fb04f'), cube((-2.2, -6.5, 0.06), (2.8, 7.0, 0.03)))
    A.add(hexc('7fb04f'), cube((-2.2, 6.5, 0.06), (2.8, 7.0, 0.03)))
    for y in (-3.4, 3.4):
        A.add(hexc('6f7d86'), cube((-0.7, y, 2.6), (1.2, 1.2, 5.2), bevel=0.04))
    A.add(hexc('1b2630'), cube((-0.75, 0, 3.85), (0.8, 8.0, 1.2), bevel=0.03))
    def gedung(y0, y1, lantai):
        h = 3.2 * lantai
        A.add(hexc('aab6bd'), cube((-8.2, (y0 + y1) / 2, h / 2), (8.0, y1 - y0, h)))
        for f in range(lantai):
            z = 3.2 * f
            A.add(PUTIH, cube((-4.18, (y0 + y1) / 2, z + 0.15), (0.06, y1 - y0, 0.3)))
            A.add(hexc('3f6f8f'), cube((-4.18, (y0 + y1) / 2, z + 1.6), (0.04, y1 - y0 - 0.4, 1.6)))
            for k in range(int((y1 - y0) / 1.6)):
                A.add(hexc('8f9aa0'), cube((-4.16, y0 + 0.8 + k * 1.6, z + 1.6), (0.05, 0.12, 1.6)))
        A.add(hexc('6f7d86'), cube((-8.2, (y0 + y1) / 2, h + 0.2), (8.2, y1 - y0 + 0.2, 0.4)))
    gedung(-9.8, -2.6, 4)
    gedung(2.0, 9.8, 3)
    A.add(hexc('3f6f8f'), cube((-7.6, -0.3, 2.0), (5.0, 4.4, 4.0)))
    A.add(PUTIH, cube((-5.0, -0.3, 4.1), (0.4, 5.0, 0.2)))
    for k in range(3):
        A.add(PUTIH, cyl((-2.4, -1.2 + k * 1.2, 3.5), 0.04, 7.0, 'z', 6))
        A.add(hexc(['d33a2b', '2a6fb5', 'f2c230'][k]), cube((-2.4, -1.2 + k * 1.2 + 0.45, 6.6), (0.02, 0.8, 0.5)))
    tree_at(A, -2.2, -8.5, 1.0, 1)
    tree_at(A, -2.2, 8.5, 1.0, 2)
    A.export()


def lm_stasiun():
    A = Asset('lm_stasiun', 'bangunan')
    krem, genteng = hexc('efe6d2'), hexc('c4683f')
    lot(A, hexc('bdb7a4'))
    A.add(krem, cube((-3.8, 0, 1.8), (5.2, 19.2, 3.6)))
    A.add(hexc('5b6a3c'), cube((-3.8, 0, 0.3), (5.24, 19.24, 0.6)))
    A.add(genteng, gable(-6.9, -0.7, -10.0, 10.0, 3.6, 5.6, 'y'))
    for y in (-8.0, -5.6, -3.2, 3.2, 5.6, 8.0):
        arch_win(A, -1.19, y, 0.9, 1.0, 2.2, 'x+', col=hexc('1f3a4f'))
    # blok tengah dengan menara jam
    A.add(krem, cube((-3.6, 0, 2.6), (5.6, 4.8, 5.2)))
    A.add(genteng, gable(-6.6, -0.6, -2.8, 2.8, 5.2, 7.0, 'x'))
    A.add(hexc('15191c'), cube((-0.79, 0, 1.0), (0.03, 2.4, 2.0)))
    A.add(PUTIH, cube((-0.8, 0, 2.8), (0.1, 8.6, 1.5)))
    A.add(krem, cube((-3.6, 0, 7.2), (1.6, 1.6, 2.0)))
    A.add(PUTIH, cyl((-2.79, 0, 7.4), 0.5, 0.04, 'x', 16))
    A.add(GELAP, cube((-2.76, 0, 7.55), (0.02, 0.05, 0.35)))
    A.add(GELAP, cube((-2.76, 0.1, 7.4), (0.02, 0.25, 0.05)))
    A.add(genteng, pyramid(-3.6, 0, 8.2, 2.2, 2.2, 1.2, 0.05))
    # peron dan kanopi di belakang, rel
    A.add(hexc('bdb7a4'), cube((-7.4, 0, 0.45), (1.6, 21.0, 0.9)))
    A.add(hexc('f2c230'), cube((-8.18, 0, 0.91), (0.08, 21.0, 0.02)))
    for y in range(-9, 10, 3):
        A.add(hexc('6f7d86'), cyl((-7.4, y, 2.4), 0.09, 3.0, 'z', 6))
    A.add(hexc('6f7d86'), cube((-7.4, 0, 3.95), (2.4, 21.0, 0.1), rot=(0, 0.1, 0)))
    for x in (-9.6, -12.2):
        A.add(hexc('8f8676'), cube((x, 0, 0.1), (2.2, 22.4, 0.2)))
        for k in range(28):
            A.add(hexc('6b5a45'), cube((x, -10.8 + k * 0.8, 0.22), (1.8, 0.2, 0.06)))
        for dx in (-0.55, 0.55):
            A.add(hexc('c0c4c7'), cube((x + dx, 0, 0.3), (0.07, 22.4, 0.08)))
    A.export()


def lm_griya():
    A = Asset('lm_griya', 'bangunan')
    lot(A, hexc('7fb04f'))
    A.add(hexc('8f9396'), cube((-6.8, 0, 0.07), (13.6, 3.4, 0.04)))
    A.add(hexc('d6ccb2'), cube((-6.8, 2.0, 0.08), (13.6, 0.6, 0.06)))
    A.add(hexc('d6ccb2'), cube((-6.8, -2.0, 0.08), (13.6, 0.6, 0.06)))
    for y in (-2.4, 2.4):
        A.add(hexc('e8e2d0'), cube((-0.88, y, 2.2), (0.9, 0.9, 4.4), bevel=0.04))
        A.add(hexc('8e3f32'), pyramid(-0.88, y, 4.4, 1.2, 1.2, 0.6, 0.05))
    A.add(hexc('e8e2d0'), cube((-0.95, 0, 3.45), (0.5, 5.4, 1.1), bevel=0.03))
    A.add(hexc('8e3f32'), gable(-1.4, -0.5, -2.9, 2.9, 4.0, 4.5, 'y'))
    A.add(hexc('d9cdb0'), cube((-1.2, 4.4, 1.2), (1.6, 1.6, 2.4)))
    A.add(hexc('8e3f32'), pyramid(-1.2, 4.4, 2.4, 2.0, 2.0, 0.8, 0.05))
    A.add(KACA, cube((-0.39, 4.4, 1.5), (0.02, 0.9, 0.7)))
    pastel = ['f2e6c9', 'd9e8e0', 'f2d9cf', 'e0e2f0']
    for side in (-1, 1):
        for i, x in enumerate((-3.4, -6.6, -9.8, -12.9)):
            y = side * 6.6
            A.add(hexc(pastel[(i + (side > 0)) % 4]), cube((x, y, 1.4), (2.6, 4.2, 2.8)))
            A.add(hexc('8e3f32'), gable(x - 1.6, x + 1.6, y - 2.4, y + 2.4, 2.8, 4.2, 'x'))
            A.add(hexc('8a5d33'), cube((x, y - side * 2.11, 1.0), (0.8, 0.03, 2.0)))
            A.add(hexc('5d7a8c'), cube((x + 0.8, y - side * 2.11, 1.6), (0.7, 0.03, 0.9)))
            A.add(PUTIH, cube((x, y - side * 2.9, 0.4), (2.8, 0.06, 0.8)))
            A.add(hexc('d6ccb2'), cube((x, y - side * 2.5, 0.06), (1.2, 0.8, 0.04)))
        tree_at(A, -2.0, side * 9.6, 0.9, 5)
    A.export()


def rumah_jauh():
    """Rumah kampung sangat ringan untuk latar jauh. Alas 1×1 m, tinggi 1 m (dinding 0.6), di-scale per instance."""
    A = Asset('rumah_jauh', 'bangunan')
    A.add(CAT, cube((0, 0, 0.3), (0.92, 0.92, 0.6)))
    A.add(KEDUA, gable(-0.52, 0.52, -0.52, 0.52, 0.58, 1.0, 'y'))
    A.add(hexc('3a2a1c'), cube((0.465, -0.15, 0.2), (0.01, 0.16, 0.34)))
    A.add(hexc('2f4a5c'), cube((0.465, 0.2, 0.33), (0.01, 0.2, 0.14)))
    A.add(hexc('2f4a5c'), cube((-0.465, 0.0, 0.33), (0.01, 0.2, 0.14)))
    A.export()


def pohon_jauh():
    A = Asset('pohon_jauh', 'alam')
    A.add(hexc('6b4f33'), cyl((0, 0, 0.5), 0.08, 1.0, 'z', 4))
    A.add(hexc('4f8a3c'), ball((0, 0, 1.35), 0.6, 1, (1, 1, 0.9), 0.15, 2))
    A.add(hexc('5e9a46'), ball((0.15, 0.1, 1.8), 0.4, 1, (1, 1, 0.9), 0.15, 3))
    A.export()


def palang():
    """Palang perlintasan: tiang dengan rambu silang dan dua lampu sinyal (mesh 'lampu'), lengan palang (mesh 'lengan')
    berporos di titik asal dan menjulur ke +X. Tiang berdiri di (0, 0) dengan poros lengan di z 1.3 m."""
    A = Asset('palang', 'bangunan')
    besi = hexc('5a6066')
    A.add(besi, cube((0, 0, 0.35), (0.5, 0.4, 0.7)))
    A.add(PUTIH, cyl((0, 0, 1.9), 0.06, 3.8, 'z', 8))
    for rz in (0.6, -0.6):
        A.add(PUTIH, cube((0, -0.05, 3.45), (1.2, 0.03, 0.18), rot=(0, rz, 0)))
        A.add(hexc('d33a2b'), cube((0, -0.07, 3.45), (1.1, 0.01, 0.06), rot=(0, rz, 0)))
    A.add(GELAP, cube((0, -0.04, 2.7), (0.9, 0.06, 0.32)))
    for x in (-0.3, 0.3):
        A.add(GELAP, cyl((x, -0.12, 2.7), 0.15, 0.12, 'y', 10))
        A.add(PUTIH, cyl((x, -0.19, 2.7), 0.11, 0.02, 'y', 10), 'lampu')
    A.add(besi, cube((0, 0, 1.3), (0.3, 0.3, 0.3)))
    def lengan(b):
        pass
    for k in range(16):
        A.add(PUTIH if k % 2 else hexc('d33a2b'), cube((0.3 + k * 0.6, 0, 0), (0.6, 0.08, 0.1)), 'lengan')
    A.add(hexc('333333'), cube((-0.4, 0, 0), (0.6, 0.14, 0.24)), 'lengan')
    A.export()


if __name__ == '__main__':
    print('Membuat aset ke', OUT)
    # angkot sekarang dibuat dari model detail tinggi: tools/blender/angkot/ringan.py (angkot() di sini tetap ada sebagai cadangan)
    for fn in (mobil, pikap, truk, motor, kereta, orang, pohon_mangga, pohon_kelapa, lampu_jalan, lampu_merah, gerobak, ruko, rumah, warung):
        fn()
    for fn in (lm_terminal, lm_pasar, lm_masjid, lm_sekolah, lm_spbu, lm_alun, lm_kampus, lm_stasiun, lm_griya, rumah_jauh, pohon_jauh, palang):
        fn()
    motor('motor_parkir', rider=False)
    tiang('tiang')
    tiang('tiang_trafo', trafo=True)
