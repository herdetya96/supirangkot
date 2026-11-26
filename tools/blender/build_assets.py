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


def hexc(h):
    h = h.lstrip('#')
    return (int(h[0:2], 16) / 255, int(h[2:4], 16) / 255, int(h[4:6], 16) / 255, 1.0)


CAT, KEDUA, KETIGA = (1, 0, 1, 1), (0, 1, 1, 1), (0.5, 0, 1, 1)
PUTIH = (1, 1, 1, 1)
KACA, BAN, VELG, KROM, GELAP = hexc('1f2d38'), hexc('161616'), hexc('b8bcc0'), hexc('c9ced2'), hexc('23292e')
LAMPU, SEIN, REMC, BAYANG = hexc('fff3c4'), hexc('f29b1d'), hexc('b3261e'), hexc('20262b')


class Asset:
    """Kumpulan bmesh bernama; tiap bagian diwarnai per sudut."""

    def __init__(self, name):
        self.name, self.parts = name, {}

    def bm(self, part='main'):
        if part not in self.parts:
            b = bmesh.new()
            b.loops.layers.float_color.new('Col')
            self.parts[part] = b
        return self.parts[part]

    def add(self, col, fn, part='main'):
        b = self.bm(part)
        before = set(b.faces)
        fn(b)
        cl = b.loops.layers.float_color['Col']
        for f in b.faces:
            if f not in before:
                for lp in f.loops:
                    lp[cl] = col

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
def _place(b, verts, c, rot):
    M = Matrix.Translation(Vector(c)) @ Euler(rot).to_matrix().to_4x4()
    bmesh.ops.transform(b, matrix=M, verts=list(verts))


def cube(c, s, rot=(0, 0, 0), bevel=0.0, seg=1, shape=None):
    """Kotak berpusat di c, ukuran s. shape(v) boleh menggeser titik dalam koordinat lokal sebelum dibevel."""
    def fn(b):
        before = set(b.verts)
        bmesh.ops.create_cube(b, size=1.0, matrix=Matrix.Diagonal((s[0], s[1], s[2], 1)))
        new = [v for v in b.verts if v not in before]
        if shape:
            for v in new:
                shape(v.co)
        if bevel > 0:
            edges = list({e for v in new for e in v.link_edges})
            bmesh.ops.bevel(b, geom=edges, offset=bevel, segments=seg, profile=0.5, affect='EDGES', clamp_overlap=True)
        new = [v for v in b.verts if v not in before]
        _place(b, new, c, rot)
    return fn


def cyl(c, r, depth, axis='z', seg=12, r2=None, rot=None):
    def fn(b):
        before = set(b.verts)
        bmesh.ops.create_cone(b, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r if r2 is None else r2, depth=depth)
        new = [v for v in b.verts if v not in before]
        R = rot or {'z': (0, 0, 0), 'x': (0, math.pi / 2, 0), 'y': (math.pi / 2, 0, 0)}[axis]
        _place(b, new, c, R)
    return fn


def ball(c, r, sub=1, scale=(1, 1, 1), noise=0.0, seed=0):
    def fn(b):
        before = set(b.verts)
        bmesh.ops.create_icosphere(b, subdivisions=sub, radius=1.0)
        new = [v for v in b.verts if v not in before]
        rnd = random.Random(seed)
        for v in new:
            k = 1 + (rnd.uniform(-noise, noise) if noise else 0)
            v.co = Vector((v.co.x * r * scale[0] * k, v.co.y * r * scale[1] * k, v.co.z * r * scale[2] * k))
        _place(b, new, c, (0, 0, 0))
    return fn


def plane(c, sx, sy):
    def fn(b):
        vs = [b.verts.new((c[0] + x, c[1] + y, c[2])) for x, y in ((-sx / 2, -sy / 2), (sx / 2, -sy / 2), (sx / 2, sy / 2), (-sx / 2, sy / 2))]
        b.faces.new(vs)
    return fn


def wheel(A, c, r, w, rim=VELG, hub=KROM, seg=16):
    side = 1 if c[0] >= 0 else -1
    A.add(BAN, cyl(c, r, w, 'x', seg))
    A.add(rim, cyl((c[0] + side * (w / 2 + 0.004), c[1], c[2]), r * 0.62, 0.012, 'x', seg))
    A.add(hub, cyl((c[0] + side * (w / 2 + 0.012), c[1], c[2]), r * 0.2, 0.012, 'x', 8))


def mirror_x(fn_maker, *args, **kw):
    """Panggil fn_maker untuk x positif dan negatif."""
    return [fn_maker(*args, sx=s, **kw) for s in (-1, 1)]


# ---------- kendaraan (depan = +Y) ----------
def angkot():
    A = Asset('angkot')
    W, L = 1.76, 3.36
    A.add(BAYANG, plane((0, 0, 0.012), W + 0.22, L + 0.26))
    for sx in (-1, 1):
        for sy in (-1, 1):
            wheel(A, (sx * 0.80, sy * 1.08, 0.30), 0.30, 0.20)
            A.add(GELAP, cube((sx * 0.881, sy * 1.08, 0.48), (0.02, 0.76, 0.40)))
    A.add(CAT, cube((0, 0, 0.74), (W, L, 0.84), bevel=0.05, seg=2))
    def slope(v):
        if v.z > 0 and v.y > 0:
            v.y -= 0.32
    A.add(CAT, cube((0, -0.16, 1.53), (W - 0.04, L - 0.32, 0.74), bevel=0.07, seg=2, shape=slope))
    ang = math.atan2(0.32, 0.74)
    A.add(KACA, cube((0, 1.226, 1.52), (1.50, 0.03, 0.74), rot=(ang, 0, 0)))
    for sx in (-1, 1):
        for y0, y1 in ((-1.55, -0.75), (-0.65, 0.15), (0.25, 0.92)):
            if sx < 0 and y0 == -0.65:
                A.add(hexc('15191c'), cube((sx * 0.876, (y0 + y1) / 2, 1.10), (0.03, y1 - y0, 1.36)))   # pintu geser terbuka
                A.add(hexc('6b3b2a'), cube((sx * 0.60, (y0 + y1) / 2, 0.92), (0.40, 0.75, 0.12)))        # jok di dalam
                continue
            A.add(KACA, cube((sx * 0.876, (y0 + y1) / 2, 1.52), (0.03, y1 - y0, 0.50)))
        A.add(PUTIH, cube((sx * 0.888, -0.02, 1.01), (0.012, 3.22, 0.07)))
        A.add(hexc('f2c230'), cube((sx * 0.888, -0.02, 0.91), (0.012, 3.22, 0.04)))
        A.add(GELAP, cube((sx * 0.93, 1.12, 1.33), (0.12, 0.03, 0.03)))
        A.add(GELAP, cube((sx * 0.99, 1.12, 1.37), (0.04, 0.10, 0.17), bevel=0.01))
        A.add(LAMPU, cube((sx * 0.62, 1.687, 0.72), (0.28, 0.03, 0.18), bevel=0.01))
        A.add(SEIN, cube((sx * 0.83, 1.687, 0.72), (0.08, 0.03, 0.12)))
        A.add(REMC, cube((sx * 0.76, -1.687, 0.78), (0.16, 0.03, 0.36), bevel=0.01))
        A.add(BAN, cube((sx * 0.80, -1.44, 0.24), (0.22, 0.02, 0.24)))
        A.add(GELAP, cyl((sx * 0.25, -1.725, 1.45), 0.016, 0.9, 'z', 6))
    A.add(KACA, cube((0, -1.686, 1.52), (1.36, 0.03, 0.52)))
    A.add(KROM, cube((0, 1.70, 0.42), (1.72, 0.12, 0.18), bevel=0.03, seg=2))
    A.add(KROM, cube((0, -1.70, 0.42), (1.72, 0.12, 0.18), bevel=0.03, seg=2))
    A.add(GELAP, cube((0, 1.686, 0.70), (0.96, 0.03, 0.26)))
    for z in (0.64, 0.70, 0.76):
        A.add(KROM, cube((0, 1.70, z), (0.92, 0.012, 0.018)))
    for y in (1.775, -1.775):
        A.add(hexc('161616'), cube((0, y, 0.43), (0.48, 0.02, 0.13)))
        A.add(PUTIH, cube((0, y + (0.011 if y > 0 else -0.011), 0.43), (0.40, 0.004, 0.02)))
    for z in (1.15, 1.35, 1.55, 1.75):
        A.add(GELAP, cyl((0, -1.725, z), 0.012, 0.5, 'x', 6))
    A.add(GELAP, cube((0, 1.05, 2.02), (1.0, 0.08, 0.27), bevel=0.01))           # papan trayek
    A.add(PUTIH, cube((0, 1.095, 2.02), (0.92, 0.02, 0.20)))
    for sx in (-1, 1):
        A.add(GELAP, cyl((sx * 0.68, -0.35, 2.0), 0.025, 2.45, 'y', 8))
        for y in (-1.5, 0.75):
            A.add(GELAP, cube((sx * 0.68, y, 1.95), (0.05, 0.05, 0.1)))
    for y in (-1.35, -0.6, 0.15, 0.75):
        A.add(GELAP, cyl((0, y, 2.0), 0.02, 1.36, 'x', 6))
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
        celana, kulit = hexc('2f3d4a'), hexc('a8714a')
        for sx in (-1, 1):
            A.add(celana, cube((sx * 0.12, 0.02, 0.86), (0.13, 0.42, 0.14), rot=(-0.15, 0, 0)))
            A.add(celana, cube((sx * 0.16, 0.20, 0.56), (0.11, 0.12, 0.42), rot=(0.25, 0, 0)))
            A.add(BAN, cube((sx * 0.16, 0.28, 0.34), (0.11, 0.20, 0.08)))
            A.add(KEDUA, cube((sx * 0.22, 0.20, 1.18), (0.09, 0.42, 0.09), rot=(-0.7, 0, 0)))
            A.add(kulit, cube((sx * 0.25, 0.42, 1.00), (0.08, 0.08, 0.08)))
        A.add(KEDUA, cube((0, -0.10, 1.20), (0.40, 0.24, 0.52), bevel=0.04, rot=(0.25, 0, 0)))
        A.add(kulit, cyl((0, -0.02, 1.48), 0.05, 0.08, 'z', 6))
        A.add(KETIGA, ball((0, 0.0, 1.60), 0.15, 2, (1, 1.1, 1)))
        A.add(GELAP, cube((0, 0.13, 1.58), (0.18, 0.04, 0.09)))
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
def orang():
    A = Asset('orang')
    for sx in (-1, 1):
        A.add(PUTIH, cube((sx * 0.09, 0, 0.42), (0.13, 0.15, 0.80), bevel=0.02), 'celana')
        A.add(hexc('2a2a2a'), cube((sx * 0.09, 0.04, 0.04), (0.12, 0.26, 0.08), bevel=0.02), 'celana')
        A.add(PUTIH, cube((sx * 0.25, 0, 1.12), (0.09, 0.10, 0.52), bevel=0.02, rot=(0, sx * 0.08, 0)), 'baju')
        A.add(PUTIH, cube((sx * 0.27, 0, 0.82), (0.08, 0.08, 0.10)), 'kulit')
    A.add(PUTIH, cube((0, 0, 0.88), (0.34, 0.20, 0.14), bevel=0.03), 'celana')
    A.add(PUTIH, cube((0, 0, 1.13), (0.40, 0.22, 0.50), bevel=0.05, seg=2), 'baju')
    A.add(PUTIH, cyl((0, 0, 1.42), 0.06, 0.1, 'z', 8), 'kulit')
    A.add(PUTIH, ball((0, 0, 1.53), 0.115, 2, (0.95, 1.0, 1.1)), 'kulit')
    A.add(PUTIH, ball((0, -0.02, 1.57), 0.125, 1, (1.0, 1.0, 0.85)), 'rambut')
    A.export()


# ---------- tumbuhan dan perabot jalan ----------
def pohon_mangga():
    A = Asset('pohon_mangga')
    kayu = hexc('6b4f33')
    A.add(kayu, cyl((0, 0, 1.0), 0.18, 2.0, 'z', 8, r2=0.12))
    A.add(kayu, cyl((0.35, 0.1, 2.1), 0.07, 1.0, 'z', 6, rot=(0.2, 0.7, 0)))
    A.add(kayu, cyl((-0.3, -0.15, 2.2), 0.07, 0.9, 'z', 6, rot=(-0.3, -0.6, 0)))
    daun = [hexc('4f8a3c'), hexc('3f7a35'), hexc('5e9a46'), hexc('467f37')]
    for i, (x, y, z, r) in enumerate([(0, 0, 3.0, 1.25), (0.9, 0.3, 2.6, 0.9), (-0.85, -0.25, 2.7, 0.95), (0.2, -0.8, 2.5, 0.8), (-0.2, 0.8, 2.8, 0.85), (0.1, 0.1, 3.7, 0.8)]):
        A.add(daun[i % 4], ball((x, y, z), r, 2, (1, 1, 0.85), 0.16, i + 7))
    A.add(BAYANG, plane((0, 0, 0.012), 2.6, 2.6))
    A.export()


def pohon_kelapa():
    A = Asset('pohon_kelapa')
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
    A = Asset(name)
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
    A = Asset('lampu_jalan')
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
    A = Asset('lampu_merah')
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
    A = Asset('ruko')
    D, F = 5.0, 4.0
    A.add(CAT, cube((-0.05, 0, 1.70), (D - 0.1, F, 3.4)))
    A.add(CAT, cube((0.05, 0, 5.0), (D + 0.1, F, 3.2)))
    A.add(CAT, cube((0.05, 0, 6.8), (D + 0.1, F + 0.04, 0.4)))
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
    A = Asset('rumah')
    A.add(hexc('9a9590'), cube((-0.45, 0, 0.15), (4.1, 6.0, 0.3)))
    A.add(CAT, cube((-0.45, 0, 1.75), (4.0, 5.9, 2.9)))
    A.add(hexc('b8b2a7'), cube((2.05, 0.6, 0.12), (0.9, 3.4, 0.24)))
    for y in (-1.05, 2.2):
        A.add(PUTIH, cyl((2.3, y, 1.6), 0.09, 2.9, 'z', 8))
    A.add(hexc('6e4a2a'), cube((1.57, -0.2, 1.3), (0.06, 0.95, 2.1)))
    A.add(hexc('8a5d33'), cube((1.59, -0.2, 1.3), (0.02, 0.8, 1.95)))
    for y in (-2.0, 1.4):
        A.add(PUTIH, cube((1.57, y, 1.75), (0.06, 1.2, 1.2)))
        A.add(hexc('5d7a8c'), cube((1.59, y, 1.75), (0.02, 1.05, 1.05)))
        A.add(PUTIH, cube((1.60, y, 1.75), (0.01, 0.04, 1.05)))
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
    A.add(hexc('6f2f24'), cube((0, 0, 4.72), (0.22, 6.8, 0.12)))
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
    A = Asset('warung')
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


if __name__ == '__main__':
    print('Membuat aset ke', OUT)
    for fn in (angkot, mobil, pikap, truk, motor, kereta, orang, pohon_mangga, pohon_kelapa, lampu_jalan, lampu_merah, gerobak, ruko, rumah, warung):
        fn()
    motor('motor_parkir', rider=False)
    tiang('tiang')
    tiang('tiang_trafo', trafo=True)
