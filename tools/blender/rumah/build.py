"""Rumah sopir (rumah keluarga di cerita) dengan garasi samping: aset seni + sumber model game.

    python tools/blender/rumah/build.py                 -> art/rumah/rumah.blend, rumah.glb, render/*.jpg
    OUT=<folder> DETAIL=0 RENDER=0 python ...           -> versi ringan untuk tools/blender/rumah/ringan.py

Satuan meter, atas +Z, muka rumah menghadap -Y (ke jalan), tanah z = 0. Kavling x -9..7, pagar depan y = -4.
Rumah x -1.5..6.5, y 0..7, lantai +0.35. Teras x 0.4..6.1, y -2..0. Garasi (kanopi spandek) x -6.2..-1.5 untuk angkot.
DETAIL=1: genteng bergelombang per keping, bevel, lebih banyak segmen. DETAIL=0: genteng hanya undakan per baris (RINCI=0 juga membuang garis nat, lubang angin, daun pot tambahan)
(gelombangnya dari tekstur detail 'genteng' di game), tanpa bevel kecil.
Titik penting (custom property 'titik' di objek Dinding, dipakai rumah3d.js): pintu, parkir, gerbang, teras.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('OUT', os.path.normpath(os.path.join(HERE, '..', '..', '..', 'art', 'rumah')))
DETAIL = os.environ.get('DETAIL', '1') != '0'
RINCI = os.environ.get('RINCI', '1') != '0'          # garis nat, batu, lubang angin, daun: murah, tetap ada di versi game
RENDER = os.environ.get('RENDER', '1') != '0'
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; col = sc.collection

# ---------------------------------------------------------------- material
def mat(name, rgb, rough=0.7, metal=0.0, emit=0.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = rough; b.inputs['Metallic'].default_value = metal
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    return m


def srgb(h):
    c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)


M = {k: mat(k, srgb(h), r, mt, e) for k, h, r, mt, e in [
    ('Dinding', 'efe6d2', 0.85, 0, 0), ('Batu', '8a7f72', 0.9, 0, 0), ('Plester', 'a7a39b', 0.9, 0, 0),
    ('Genteng', 'b5523b', 0.75, 0, 0), ('Bubungan', '9c4632', 0.75, 0, 0), ('Kayu', '8a5d33', 0.6, 0, 0),
    ('Kusen', '5b3f26', 0.55, 0, 0), ('Kaca', '2f4a5c', 0.08, 0, 0), ('Besi', '23292e', 0.45, 0.6, 0),
    ('Lantai', 'e6dcc0', 0.35, 0, 0), ('Nat', '9a9184', 0.9, 0, 0), ('Beton', 'b9b1a0', 0.9, 0, 0),
    ('Paving', '9a9590', 0.9, 0, 0), ('Spandek', 'c0c4c7', 0.4, 0.7, 0), ('Rumput', '6f9a46', 0.95, 0, 0),
    ('Tanah', '7a5a3e', 0.95, 0, 0), ('Daun', '3f7a35', 0.7, 0, 0), ('Pot', 'b5674a', 0.8, 0, 0),
    ('Lisplang', 'f4f1ea', 0.6, 0, 0), ('Gelap', '15191c', 0.9, 0, 0), ('Lampu', 'fff3c4', 0.2, 0, 2.0),
    ('Kursi', '2a6fb5', 0.5, 0, 0), ('Toren', 'e07b39', 0.5, 0, 0), ('Karet', '161616', 0.85, 0, 0),
    ('Kain1', 'd33a2b', 0.9, 0, 0), ('Kain2', '3e6fb1', 0.9, 0, 0), ('Kain3', 'e6c84a', 0.9, 0, 0),
    ('Jeriken', '1f6fb5', 0.5, 0, 0), ('Meteran', 'dddddd', 0.4, 0, 0)]}


def ob_mesh(name, b, material, smooth=False):
    me = bpy.data.meshes.new(name); b.to_mesh(me); b.free()
    o = bpy.data.objects.new(name, me); col.objects.link(o); me.materials.append(M[material])
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return o


def bevel_mod(o, w, seg=2):
    if not DETAIL or w <= 0:
        return
    bv = o.modifiers.new('bevel', 'BEVEL'); bv.width = w; bv.segments = seg; bv.limit_method = 'ANGLE'
    for x in bpy.context.view_layer.objects:
        x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.modifier_apply(modifier='bevel')


def kotak(name, x0, x1, y0, y1, z0, z1, material, bev=0.0, rot=None):
    b = bmesh.new(); bmesh.ops.create_cube(b, size=1.0)
    for v in b.verts:
        v.co = Vector(((v.co.x + 0.5) * (x1 - x0) + x0, (v.co.y + 0.5) * (y1 - y0) + y0, (v.co.z + 0.5) * (z1 - z0) + z0))
    o = ob_mesh(name, b, material)
    if rot:
        c = Vector(((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2))
        o.data.transform(Matrix.Translation(c) @ rot @ Matrix.Translation(-c))
    bevel_mod(o, bev)
    return o


def tabung(name, c, r, h, material, seg=16, sumbu='z', r2=None):
    b = bmesh.new()
    bmesh.ops.create_cone(b, cap_ends=True, segments=seg if DETAIL else max(6, seg // 2), radius1=r, radius2=r2 if r2 is not None else r, depth=h)
    R = {'z': Matrix.Identity(4), 'x': Matrix.Rotation(math.pi / 2, 4, 'Y'), 'y': Matrix.Rotation(math.pi / 2, 4, 'X')}[sumbu]
    bmesh.ops.transform(b, matrix=Matrix.Translation(Vector(c)) @ R, verts=b.verts)
    return ob_mesh(name, b, material, smooth=True)


def bola(name, c, r, material, s=(1, 1, 1), seg=12):
    b = bmesh.new(); bmesh.ops.create_uvsphere(b, u_segments=seg if DETAIL else 8, v_segments=(seg if DETAIL else 8) // 2, radius=r)
    bmesh.ops.transform(b, matrix=Matrix.Translation(Vector(c)) @ Matrix.Diagonal((*s, 1)), verts=b.verts)
    return ob_mesh(name, b, material, smooth=True)


def poli(name, verts, faces, material, smooth=False):
    b = bmesh.new(); vs = [b.verts.new(v) for v in verts]
    for f in faces:
        try:
            b.faces.new([vs[i] for i in f])
        except ValueError:
            pass
    return ob_mesh(name, b, material, smooth)


# ---------------------------------------------------------------- ukuran
HX0, HX1, HY0, HY1 = -1.5, 6.5, 0.0, 7.0          # badan rumah
LT = 0.35                                          # tinggi lantai
DH = 3.2                                           # tinggi dinding dari lantai
ZD = LT + DH                                       # puncak dinding
TX0, TX1, TY0 = 0.4, 6.1, -2.0                     # teras
PINTU_X = 3.25
GX0, GX1, GY0, GY1 = -6.2, -1.5, -3.9, 5.2         # garasi
PAGAR_Y = -4.0

# ---------------------------------------------------------------- tanah kavling
kotak('Rumput', -9.0, 7.0, PAGAR_Y, 8.5, -0.05, 0.0, 'Rumput')
kotak('Paving_garasi', GX0, GX1, PAGAR_Y, GY1, 0.0, 0.04, 'Paving')
if RINCI:
    for i in range(int((GY1 - PAGAR_Y) / 0.3)):                    # nat conblock
        kotak(f'nat_paving{i}', GX0, GX1, PAGAR_Y + i * 0.3, PAGAR_Y + i * 0.3 + 0.012, 0.04, 0.045, 'Nat')
kotak('Jalan_setapak', PINTU_X - 0.7, PINTU_X + 0.7, PAGAR_Y, TY0 - 0.6, 0.0, 0.05, 'Beton')

# ---------------------------------------------------------------- badan rumah: pondasi, dinding, batu alam
kotak('Pondasi', HX0 - 0.05, HX1 + 0.05, HY0 - 0.05, HY1 + 0.05, 0.0, LT, 'Plester')


def dinding_depan():
    """Dinding depan dengan lubang pintu dan dua jendela (dibangun dari potongan kotak)."""
    y0, y1 = HY0, HY0 + 0.15
    PX0, PX1 = PINTU_X - 0.75, PINTU_X + 0.75          # pintu dua daun 1,5 m
    J = [(0.55, 1.95), (4.55, 5.95)]                   # jendela
    JZ0, JZ1 = LT + 0.9, LT + 2.25
    potong = [(HX0, J[0][0]), (J[0][1], PX0), (PX1, J[1][0]), (J[1][1], HX1)]
    for i, (a, b) in enumerate(potong):
        kotak(f'Dinding_depan{i}', a, b, y0, y1, LT, ZD, 'Dinding')
    for i, (a, b) in enumerate(J):
        kotak(f'Dinding_bawah_jendela{i}', a, b, y0, y1, LT, JZ0, 'Dinding')
        kotak(f'Dinding_atas_jendela{i}', a, b, y0, y1, JZ1 + 0.35, ZD, 'Dinding')
    kotak('Dinding_atas_pintu', PX0, PX1, y0, y1, LT + 2.25 + 0.35, ZD, 'Dinding')
    return J, JZ0, JZ1, PX0, PX1


J, JZ0, JZ1, PX0, PX1 = dinding_depan()
kotak('Dinding_belakang', HX0, HX1, HY1 - 0.15, HY1, LT, ZD, 'Dinding')
kotak('Dinding_kiri', HX0, HX0 + 0.15, HY0, HY1, LT, ZD, 'Dinding')
kotak('Dinding_kanan', HX1 - 0.15, HX1, HY0, HY1, LT, ZD, 'Dinding')
# ruang dalam gelap di balik pintu dan jendela (supaya tidak tembus pandang)
kotak('Dalam', HX0 + 0.15, HX1 - 0.15, HY0 + 0.6, HY0 + 0.62, LT, ZD, 'Gelap')
kotak('Plafon_dalam', HX0 + 0.15, HX1 - 0.15, HY0 + 0.15, HY0 + 0.62, ZD - 0.05, ZD, 'Gelap')
# batu alam di bagian bawah dinding depan (di luar lubang pintu)
for i, (a, b) in enumerate([(HX0, PX0), (PX1, HX1)]):
    kotak(f'Batu_alam{i}', a, b, HY0 - 0.03, HY0, LT, LT + 0.9, 'Batu', bev=0.005)
    if RINCI:
        for k in range(1, 4):                                       # garis susunan batu
            kotak(f'nat_batu{i}_{k}', a, b, HY0 - 0.035, HY0 - 0.03, LT + k * 0.225 - 0.006, LT + k * 0.225 + 0.006, 'Nat')
kotak('Lis_batu', HX0, HX1, HY0 - 0.05, HY0, LT + 0.9, LT + 0.95, 'Plester')

# ---------------------------------------------------------------- jendela: kusen, kaca, teralis, roster, ambang


def jendela(i, x0, x1):
    z0, z1, y = JZ0, JZ1, HY0
    t = 0.07
    kotak(f'Kusen_j{i}_b', x0, x1, y - 0.04, y + 0.15, z0, z0 + t, 'Kusen')
    kotak(f'Kusen_j{i}_a', x0, x1, y - 0.04, y + 0.15, z1 - t, z1, 'Kusen')
    kotak(f'Kusen_j{i}_k', x0, x0 + t, y - 0.04, y + 0.15, z0, z1, 'Kusen')
    kotak(f'Kusen_j{i}_n', x1 - t, x1, y - 0.04, y + 0.15, z0, z1, 'Kusen')
    xm = (x0 + x1) / 2
    kotak(f'Kusen_j{i}_m', xm - 0.03, xm + 0.03, y - 0.03, y + 0.15, z0, z1, 'Kusen')
    kotak(f'Kaca_j{i}', x0 + t, x1 - t, y + 0.05, y + 0.06, z0 + t, z1 - t, 'Kaca')
    # gorden di balik kaca
    kotak(f'Gorden_j{i}', x0 + t, x0 + 0.42, y + 0.1, y + 0.13, z0 + t, z1 - t, 'Kain3')
    kotak(f'Gorden_j{i}b', x1 - 0.42, x1 - t, y + 0.1, y + 0.13, z0 + t, z1 - t, 'Kain3')
    # teralis: batang tegak dan dua palang
    n = 7
    for k in range(n):
        x = x0 + t + (k + 0.5) * (x1 - x0 - 2 * t) / n
        tabung(f'Teralis_j{i}_{k}', (x, y - 0.07, (z0 + z1) / 2), 0.008, z1 - z0 - 2 * t, 'Besi', seg=6)
    for z in (z0 + 0.25, z1 - 0.25):
        kotak(f'Palang_j{i}_{z:.2f}', x0 + t, x1 - t, y - 0.085, y - 0.06, z - 0.012, z + 0.012, 'Besi')
    # ambang bawah dan lubang angin (roster) di atas jendela
    kotak(f'Ambang_j{i}', x0 - 0.08, x1 + 0.08, y - 0.12, y, z0 - 0.06, z0, 'Plester', bev=0.01)
    kotak(f'Roster_j{i}', x0, x1, y - 0.01, y + 0.15, z1 + 0.05, z1 + 0.3, 'Kusen')
    nr = 6 if RINCI else 3
    for k in range(nr):
        a = x0 + 0.05 + k * (x1 - x0 - 0.1) / nr
        kotak(f'Lubang_angin_j{i}_{k}', a + 0.03, a + (x1 - x0 - 0.1) / nr - 0.03, y - 0.015, y + 0.02, z1 + 0.09, z1 + 0.26, 'Gelap')


for i, (a, b) in enumerate(J):
    jendela(i, a, b)

# pintu dua daun: daun kiri terbuka ke dalam, daun kanan tertutup; kusen, ambang, angin-angin
kotak('Kusen_pintu_k', PX0 - 0.08, PX0, HY0 - 0.04, HY0 + 0.15, LT, LT + 2.3, 'Kusen')
kotak('Kusen_pintu_n', PX1, PX1 + 0.08, HY0 - 0.04, HY0 + 0.15, LT, LT + 2.3, 'Kusen')
kotak('Kusen_pintu_a', PX0 - 0.08, PX1 + 0.08, HY0 - 0.04, HY0 + 0.15, LT + 2.22, LT + 2.3, 'Kusen')
kotak('Angin_pintu', PX0, PX1, HY0 - 0.01, HY0 + 0.15, LT + 2.32, LT + 2.58, 'Kusen')
for k in range(4 if RINCI else 2):
    a = PX0 + 0.06 + k * (PX1 - PX0 - 0.12) / (4 if RINCI else 2)
    kotak(f'Lubang_angin_p{k}', a + 0.03, a + (PX1 - PX0 - 0.12) / (4 if RINCI else 2) - 0.03, HY0 - 0.015, HY0 + 0.02, LT + 2.36, LT + 2.54, 'Gelap')


def daun_pintu(name, x0, x1, ang, engsel):
    w = x1 - x0
    parts = [kotak(name, x0, x1, HY0 + 0.04, HY0 + 0.08, LT, LT + 2.2, 'Kayu')]
    for k, (z0, z1) in enumerate([(0.15, 0.95), (1.1, 2.05)]):        # panel timbul
        parts.append(kotak(f'{name}_panel{k}', x0 + 0.1, x1 - 0.1, HY0 + 0.02, HY0 + 0.04, LT + z0, LT + z1, 'Kusen', bev=0.008))
    parts.append(tabung(f'{name}_gagang', (x1 - 0.08 if engsel == x0 else x0 + 0.08, HY0 + 0.0, LT + 1.05), 0.018, 0.12, 'Besi', seg=8, sumbu='y'))
    R = Matrix.Translation(Vector((engsel, HY0 + 0.06, 0))) @ Matrix.Rotation(ang, 4, 'Z') @ Matrix.Translation(Vector((-engsel, -(HY0 + 0.06), 0)))
    for p in parts:
        p.data.transform(R)


daun_pintu('Daun_pintu_kiri', PX0, PINTU_X, math.radians(-75), PX0)          # terbuka ke dalam
daun_pintu('Daun_pintu_kanan', PINTU_X, PX1, 0.0, PX1)
kotak('Lantai_dalam', PX0, PX1, HY0, HY0 + 0.6, LT - 0.01, LT, 'Lantai')

# ---------------------------------------------------------------- teras: lantai keramik, anak tangga, tiang, tembok rendah
kotak('Lantai_teras', TX0, TX1, TY0, HY0, 0.0, LT, 'Lantai', bev=0.01)
if RINCI:
    for k in range(1, int((TX1 - TX0) / 0.4)):
        kotak(f'nat_teras_x{k}', TX0 + k * 0.4 - 0.004, TX0 + k * 0.4 + 0.004, TY0, HY0, LT, LT + 0.002, 'Nat')
    for k in range(1, int(-TY0 / 0.4)):
        kotak(f'nat_teras_y{k}', TX0, TX1, TY0 + k * 0.4 - 0.004, TY0 + k * 0.4 + 0.004, LT, LT + 0.002, 'Nat')
for k, (yy, zz) in enumerate([(TY0 - 0.3, 0.12), (TY0 - 0.6, 0.0)]):
    if zz > 0:
        kotak(f'Tangga{k}', PINTU_X - 0.8, PINTU_X + 0.8, yy, TY0, 0.0, LT - 0.12, 'Lantai', bev=0.01)
kotak('Tangga_bawah', PINTU_X - 0.9, PINTU_X + 0.9, TY0 - 0.6, TY0 - 0.3, 0.0, 0.12, 'Lantai', bev=0.01)
for x in (TX0 + 0.15, TX1 - 0.15):
    kotak(f'Tiang_teras{x:.1f}', x - 0.13, x + 0.13, TY0 + 0.05, TY0 + 0.31, LT, ZD, 'Dinding', bev=0.01)
    kotak(f'Kaki_tiang{x:.1f}', x - 0.17, x + 0.17, TY0 + 0.01, TY0 + 0.35, LT, LT + 0.3, 'Batu', bev=0.01)
    kotak(f'Kepala_tiang{x:.1f}', x - 0.17, x + 0.17, TY0 + 0.01, TY0 + 0.35, ZD - 0.18, ZD - 0.05, 'Plester', bev=0.01)
# tembok rendah teras (kiri dan kanan tangga) dengan pegangan
for i, (a, b) in enumerate([(TX0 + 0.28, PINTU_X - 0.8), (PINTU_X + 0.8, TX1 - 0.28)]):
    kotak(f'Tembok_teras{i}', a, b, TY0 + 0.08, TY0 + 0.26, LT, LT + 0.6, 'Dinding')
    kotak(f'Tutup_tembok{i}', a - 0.02, b + 0.02, TY0 + 0.05, TY0 + 0.29, LT + 0.6, LT + 0.66, 'Plester', bev=0.01)
# balok di atas teras
kotak('Balok_teras', TX0, TX1, TY0 + 0.05, TY0 + 0.31, ZD - 0.05, ZD + 0.12, 'Dinding')
for x in (TX0 + 0.05, TX1 - 0.31):
    kotak(f'Balok_samping{x:.1f}', x, x + 0.26, TY0 + 0.05, HY0, ZD - 0.05, ZD + 0.12, 'Dinding')

# perabot teras: dua kursi plastik, meja kecil, pot, sandal, lampu, nomor rumah, keset
def kursi(name, x, y, rz):
    parts = [kotak(name + '_duduk', x - 0.22, x + 0.22, y - 0.22, y + 0.22, LT + 0.42, LT + 0.46, 'Kursi', bev=0.02),
             kotak(name + '_sandaran', x - 0.22, x + 0.22, y + 0.18, y + 0.22, LT + 0.46, LT + 0.86, 'Kursi', bev=0.02)]
    for sx in (-1, 1):
        for sy in (-1, 1):
            parts.append(tabung(f'{name}_kaki{sx}{sy}', (x + sx * 0.19, y + sy * 0.19, LT + 0.21), 0.018, 0.42, 'Kursi', seg=6))
    R = Matrix.Translation(Vector((x, y, 0))) @ Matrix.Rotation(rz, 4, 'Z') @ Matrix.Translation(Vector((-x, -y, 0)))
    for p in parts:
        p.data.transform(R)


kursi('Kursi1', 4.9, -0.9, math.radians(200))
kursi('Kursi2', 5.65, -1.05, math.radians(150))
tabung('Meja', (5.3, -1.35, LT + 0.25), 0.24, 0.04, 'Kayu', seg=20)
tabung('Kaki_meja', (5.3, -1.35, LT + 0.12), 0.03, 0.24, 'Besi', seg=8)


def pot(name, x, y, z, s=1.0):
    tabung(name, (x, y, z + 0.17 * s), 0.16 * s, 0.34 * s, 'Pot', seg=14, r2=0.21 * s)
    tabung(name + '_tanah', (x, y, z + 0.34 * s), 0.19 * s, 0.01, 'Tanah', seg=14)
    for k in range(7 if RINCI else 4):
        a = k / (7 if RINCI else 4) * math.tau
        bola(f'{name}_daun{k}', (x + 0.12 * s * math.cos(a), y + 0.12 * s * math.sin(a), z + (0.55 + 0.1 * (k % 2)) * s), 0.13 * s, 'Daun', (1.0, 0.55, 1.6), seg=10)
    bola(name + '_tengah', (x, y, z + 0.7 * s), 0.14 * s, 'Daun', (1, 1, 1.5), seg=10)


pot('Pot1', TX0 + 0.45, TY0 + 0.55, LT, 1.0)
pot('Pot2', PINTU_X - 1.05, TY0 - 0.45, 0.0, 1.1)
pot('Pot3', PINTU_X + 1.05, TY0 - 0.45, 0.0, 1.1)
pot('Pot4', TX1 - 0.6, TY0 + 0.6, LT, 0.9)
kotak('Keset', PINTU_X - 0.45, PINTU_X + 0.45, HY0 - 0.6, HY0 - 0.05, LT, LT + 0.012, 'Kain1')
for k, sx in enumerate((-0.12, 0.12)):
    kotak(f'Sandal{k}', PINTU_X + 0.8 + sx, PINTU_X + 0.89 + sx, HY0 - 0.6, HY0 - 0.36, LT, LT + 0.02, 'Karet')
kotak('Kap_lampu_teras', PX1 + 0.28, PX1 + 0.42, HY0 - 0.14, HY0, LT + 2.35, LT + 2.45, 'Besi')
bola('Lampu_teras', (PX1 + 0.35, HY0 - 0.12, LT + 2.3), 0.06, 'Lampu', seg=10)
kotak('Nomor_rumah', PX1 + 0.25, PX1 + 0.5, HY0 - 0.02, HY0, LT + 1.75, LT + 1.92, 'Lisplang')
kotak('Meteran_listrik', HX0 + 0.25, HX0 + 0.55, HY0 - 0.12, HY0, LT + 1.6, LT + 2.0, 'Meteran', bev=0.01)

# ---------------------------------------------------------------- atap pelana genteng
ZE = ZD - 0.05            # tinggi lisplang di tepi
YE0, YE1 = TY0 - 0.5, HY1 + 0.6
YR = (YE0 + YE1) / 2
ZR = ZE + 2.3
RX0, RX1 = HX0 - 0.55, HX1 + 0.55


def atap_sisi(name, ya, yb):
    """Satu bidang atap dari tepi (ya) ke bubungan (yb): baris genteng berundak, bergelombang kalau DETAIL."""
    L = math.hypot(yb - ya, ZR - ZE); n = int(L / 0.3) + 1
    d = Vector((0, (yb - ya) / L, (ZR - ZE) / L)); nrm = Vector((0, -d.z if yb > ya else d.z, d.y if yb > ya else -d.y))
    if nrm.z < 0:
        nrm = -nrm
    nx = int((RX1 - RX0) / 0.055) if DETAIL else 1
    verts, faces = [], []
    for i in range(n):
        s0, s1 = i * L / n, (i + 1) * L / n
        p0 = Vector((0, ya, ZE)) + d * s0; p1 = Vector((0, ya, ZE)) + d * s1
        base = len(verts)
        for j in range(nx + 1):
            x = RX0 + (RX1 - RX0) * j / nx
            w = 0.022 * abs(math.sin(math.pi * x / 0.21)) if DETAIL else 0
            # tepi bawah baris (tebal), naik ke tepi atas (tipis): undakan khas genteng
            a = p0 + nrm * (0.05 + w); b = p1 + nrm * (0.012 + w * 0.5); c = p0 + nrm * 0.0
            verts += [(x, a.y, a.z), (x, b.y, b.z), (x, c.y, c.z)]
        for j in range(nx):
            k0, k1 = base + j * 3, base + (j + 1) * 3
            faces.append((k0, k1, k1 + 1, k0 + 1))            # permukaan genteng
            faces.append((k0 + 2, k1 + 2, k1, k0))            # sisi undakan di tepi bawah
    o = poli(name, verts, faces, 'Genteng')
    return o


atap_sisi('Atap_depan', YE0, YR)
atap_sisi('Atap_belakang', YE1, YR)
# plafon bawah atap (teras dan tritisan)
poli('Plafon_teras', [(RX0, YE0, ZE - 0.02), (RX1, YE0, ZE - 0.02), (RX1, HY0, ZE - 0.02), (RX0, HY0, ZE - 0.02)], [(3, 2, 1, 0)], 'Lisplang')
# bubungan (setengah tabung) dan lisplang
bub = tabung('Bubungan', ((RX0 + RX1) / 2, YR, ZR + 0.06), 0.13, RX1 - RX0 + 0.1, 'Bubungan', seg=12, sumbu='x')
for nama, ya in (('Lisplang_depan', YE0), ('Lisplang_belakang', YE1)):
    kotak(nama, RX0, RX1, ya - 0.03, ya + 0.03, ZE - 0.22, ZE + 0.05, 'Lisplang')
for i, x in enumerate((RX0, RX1)):
    # papan lisplang mengikuti garis atap dari tepi ke bubungan
    for j, ya in enumerate((YE0, YE1)):
        vs = []
        for dx in (-0.03, 0.03):
            for (yy, zz) in ((ya, ZE), (YR, ZR)):
                vs += [(x + dx, yy, zz + 0.07), (x + dx, yy, zz - 0.17)]
        poli(f'Lisplang_samping{i}{j}', vs, [(0, 1, 3, 2), (4, 6, 7, 5), (0, 2, 6, 4), (1, 5, 7, 3), (0, 4, 5, 1), (2, 3, 7, 6)], 'Lisplang')
# dinding segitiga (gevel) di kedua ujung
for i, x in enumerate((HX0, HX1 - 0.15)):
    poli(f'Gevel{i}', [(x, HY0, ZD), (x, HY1, ZD), (x, YR, ZR - 0.15), (x + 0.15, HY0, ZD), (x + 0.15, HY1, ZD), (x + 0.15, YR, ZR - 0.15)],
         [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2), (2, 5, 3, 0)], 'Dinding')
    kotak(f'Ventilasi_gevel{i}', x - 0.01, x + 0.16, YR - 0.3, YR + 0.3, ZR - 1.05, ZR - 0.75, 'Kusen')

# toren air di atas menara besi, antena TV
TX, TY = HX0 + 0.8, HY1 + 0.9
for sx in (-1, 1):
    for sy in (-1, 1):
        tabung(f'Kaki_toren{sx}{sy}', (TX + sx * 0.45, TY + sy * 0.45, 2.6), 0.03, 5.2, 'Besi', seg=6)
kotak('Alas_toren', TX - 0.55, TX + 0.55, TY - 0.55, TY + 0.55, 5.2, 5.28, 'Besi')
tabung('Toren', (TX, TY, 5.28 + 0.55), 0.5, 1.1, 'Toren', seg=24)
bola('Tutup_toren', (TX, TY, 5.28 + 1.1), 0.5, 'Toren', (1, 1, 0.3), seg=16)
tabung('Pipa_toren', (TX + 0.3, TY - 0.55, 3.0), 0.025, 4.6, 'Plester', seg=6)
tabung('Tiang_antena', (HX1 - 1.0, YR + 0.4, ZR + 1.2), 0.02, 2.6, 'Besi', seg=6)
for k in range(5 if RINCI else 3):
    tabung(f'Antena{k}', (HX1 - 1.0, YR + 0.4 - 0.25 + k * 0.15, ZR + 2.2), 0.008, 0.9 - k * 0.1, 'Besi', seg=4, sumbu='x')

# ---------------------------------------------------------------- garasi samping: kanopi spandek, tiang, isi
ZK0, ZK1 = 3.05, 2.75                                # tinggi kanopi di sisi rumah dan sisi luar
kotak('Dinding_garasi_belakang', GX0, HX0, GY1 - 0.15, GY1, 0.0, 2.6, 'Dinding')
kotak('Dinding_samping_kiri', GX0 - 0.15, GX0, GY1 - 3.5, GY1, 0.0, 2.6, 'Dinding')
for y in (GY0 + 0.3, (GY0 + GY1) / 2, GY1 - 0.3):
    kotak(f'Tiang_garasi{y:.1f}', GX0 + 0.05, GX0 + 0.17, y - 0.06, y + 0.06, 0.0, ZK1 - 0.05, 'Besi')
kotak('Balok_garasi_luar', GX0 + 0.03, GX0 + 0.19, GY0, GY1, ZK1 - 0.12, ZK1, 'Besi')
kotak('Balok_garasi_rumah', HX0 - 0.16, HX0, GY0, GY1, ZK0 - 0.12, ZK0, 'Besi')
for k in range(6):
    y = GY0 + 0.2 + k * (GY1 - GY0 - 0.4) / 5
    poli(f'Usuk_garasi{k}', [(GX0 + 0.1, y - 0.03, ZK1 - 0.1), (HX0, y - 0.03, ZK0 - 0.1), (HX0, y + 0.03, ZK0 - 0.1), (GX0 + 0.1, y + 0.03, ZK1 - 0.1),
                             (GX0 + 0.1, y - 0.03, ZK1), (HX0, y - 0.03, ZK0), (HX0, y + 0.03, ZK0), (GX0 + 0.1, y + 0.03, ZK1)],
         [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)], 'Besi')


def spandek():
    """Atap seng gelombang trapesium: gelombang searah kemiringan (melintang sumbu y)."""
    nx = int((HX0 - GX0 + 0.3) / 0.25) * (4 if DETAIL else 1)
    xs = [GX0 - 0.25 + (HX0 - GX0 + 0.3) * i / nx for i in range(nx + 1)]
    verts, faces = [], []
    for i, x in enumerate(xs):
        z = ZK1 + (ZK0 - ZK1) * (x - GX0) / (HX0 - GX0) + 0.02
        for y in (GY0 - 0.3, GY1 + 0.1):
            hy = 0.03 * (1 if (int(y * 4) % 2) else 0)
            verts.append((x, y, z + (0.025 if DETAIL and (i % 4) in (1, 2) else 0)))
    for i in range(nx):
        faces.append((i * 2, i * 2 + 2, i * 2 + 3, i * 2 + 1))
    # gelombang harus sejajar kemiringan: ganti sumbu (gelombang di y, miring di x)
    verts2, faces2 = [], []
    ny = int((GY1 - GY0 + 0.4) / 0.25) * (4 if DETAIL else 1)
    for j in range(ny + 1):
        y = GY0 - 0.3 + (GY1 - GY0 + 0.4) * j / ny
        h = 0.03 if DETAIL and (j % 4) in (1, 2) else 0.0
        for x in (GX0 - 0.25, HX0 + 0.05):
            z = ZK1 + (ZK0 - ZK1) * (x - GX0) / (HX0 - GX0) + 0.02 + h
            verts2.append((x, y, z))
    for j in range(ny):
        faces2.append((j * 2, j * 2 + 1, j * 2 + 3, j * 2 + 2))
    o = poli('Spandek', verts2, faces2, 'Spandek')
    s = o.modifiers.new('tebal', 'SOLIDIFY'); s.thickness = 0.01
    for x in bpy.context.view_layer.objects:
        x.select_set(False)
    o.select_set(True); bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier='tebal')


spandek()
# isi garasi: ban bekas bertumpuk, jeriken, ember, rak, lampu, jemuran
for k in range(3):
    bpy.ops.mesh.primitive_torus_add(major_radius=0.27, minor_radius=0.09, major_segments=20 if DETAIL else 10, minor_segments=8 if DETAIL else 5,
                                     location=(GX0 + 0.55, GY1 - 0.55, 0.09 + k * 0.18))
    t = bpy.context.active_object; t.name = f'Ban_bekas{k}'; t.data.materials.append(M['Karet'])
for k, x in enumerate((GX0 + 1.3, GX0 + 1.65)):
    kotak(f'Jeriken{k}', x - 0.14, x + 0.14, GY1 - 0.45, GY1 - 0.25, 0.0, 0.4, 'Jeriken', bev=0.03)
tabung('Ember', (GX0 + 2.2, GY1 - 0.4, 0.15), 0.15, 0.3, 'Kain2', seg=14, r2=0.18)
kotak('Rak', HX0 - 1.6, HX0 - 0.4, GY1 - 0.45, GY1 - 0.15, 1.1, 1.14, 'Kayu')
kotak('Rak2', HX0 - 1.6, HX0 - 0.4, GY1 - 0.45, GY1 - 0.15, 1.6, 1.64, 'Kayu')
for k in range(4):
    kotak(f'Kaleng{k}', HX0 - 1.5 + k * 0.28, HX0 - 1.32 + k * 0.28, GY1 - 0.38, GY1 - 0.22, 1.14, 1.36, ['Kain1', 'Toren', 'Kain2', 'Meteran'][k])
bola('Lampu_garasi', (GX0 + 2.3, (GY0 + GY1) / 2, ZK1 - 0.05), 0.06, 'Lampu', seg=10)
# jemuran di sisi garasi: kawat dan baju
tabung('Kawat_jemuran', (GX0 + 0.3, GY1 - 2.2, 1.85), 0.005, 2.6, 'Besi', seg=4, sumbu='y')
for k, (dy, m) in enumerate([(-0.9, 'Kain1'), (-0.3, 'Kain3'), (0.3, 'Kain2'), (0.85, 'Lisplang')]):
    kotak(f'Jemuran{k}', GX0 + 0.27, GX0 + 0.33, GY1 - 2.2 + dy - 0.22, GY1 - 2.2 + dy + 0.22, 1.25, 1.85, m)

# ---------------------------------------------------------------- pagar depan: tembok rendah, besi, gerbang geser
PX_A, PX_B = PINTU_X - 0.6, PINTU_X + 0.6           # pintu pagar kecil (terbuka)
for i, (a, b) in enumerate([(HX0, PX_A), (PX_B, 7.0)]):
    kotak(f'Pagar_tembok{i}', a, b, PAGAR_Y - 0.1, PAGAR_Y + 0.1, 0.0, 0.55, 'Dinding')
    kotak(f'Pagar_tutup{i}', a - 0.02, b + 0.02, PAGAR_Y - 0.12, PAGAR_Y + 0.12, 0.55, 0.6, 'Plester')
    n = int((b - a) / 0.14)
    for k in range(n):
        x = a + (k + 0.5) * (b - a) / n
        tabung(f'Jeruji{i}_{k}', (x, PAGAR_Y, 1.05), 0.012, 0.9, 'Besi', seg=6)
    kotak(f'Pagar_atas{i}', a, b, PAGAR_Y - 0.02, PAGAR_Y + 0.02, 1.48, 1.52, 'Besi')
    kotak(f'Pagar_tengah{i}', a, b, PAGAR_Y - 0.015, PAGAR_Y + 0.015, 0.98, 1.0, 'Besi')
for x in (HX0, PX_A, PX_B, 7.0):
    kotak(f'Pilar{x:.1f}', x - 0.16, x + 0.16, PAGAR_Y - 0.16, PAGAR_Y + 0.16, 0.0, 1.65, 'Dinding', bev=0.01)
    kotak(f'Kepala_pilar{x:.1f}', x - 0.2, x + 0.2, PAGAR_Y - 0.2, PAGAR_Y + 0.2, 1.65, 1.75, 'Plester', bev=0.01)
# gerbang geser garasi: terbuka, digeser ke kiri di depan tembok tetangga
kotak('Tembok_tetangga', -9.0, GX0, PAGAR_Y - 0.1, PAGAR_Y + 0.1, 0.0, 1.6, 'Plester')
for x in (GX0 - 0.16, -9.0):
    kotak(f'Pilar_gerbang{x:.1f}', x - 0.16, x + 0.16, PAGAR_Y - 0.16, PAGAR_Y + 0.16, 0.0, 1.75, 'Dinding', bev=0.01)
GA, GB = -8.8, -4.3
for k in range(int((GB - GA) / 0.13)):
    x = GA + (k + 0.5) * 0.13
    tabung(f'Jeruji_gerbang{k}', (x, PAGAR_Y - 0.28, 0.85), 0.012, 1.5, 'Besi', seg=6)
for z in (0.12, 0.85, 1.58):
    kotak(f'Rangka_gerbang{z}', GA, GB, PAGAR_Y - 0.3, PAGAR_Y - 0.26, z - 0.025, z + 0.025, 'Besi')
tabung('Roda_gerbang', (GA + 0.3, PAGAR_Y - 0.28, 0.06), 0.06, 0.04, 'Besi', seg=10, sumbu='y')
kotak('Rel_gerbang', -9.0, GX1, PAGAR_Y - 0.31, PAGAR_Y - 0.25, 0.0, 0.02, 'Besi')

# ---------------------------------------------------------------- titik penting untuk game
titik = {'pintu': [PINTU_X, HY0 - 0.55, LT], 'masuk': [PINTU_X, HY0 + 0.4, LT], 'parkir': [(GX0 + HX0) / 2 + 0.15, 0.9, 0.0],
         'gerbang': [(GX0 + GX1) / 2, PAGAR_Y, 0.0], 'tangga': [PINTU_X, TY0 - 0.9, 0.0], 'jalan_setapak': [PINTU_X, PAGAR_Y + 0.3, 0.0],
         'lampu_teras': [PX1 + 0.35, HY0 - 0.25, LT + 2.25], 'lampu_garasi': [GX0 + 2.3, (GY0 + GY1) / 2, ZK1 - 0.2]}
bpy.data.objects['Dinding_kiri']['titik'] = {k: [round(c, 3) for c in v] for k, v in titik.items()}

# ---------------------------------------------------------------- simpan, ekspor, render
meshes = [o for o in bpy.data.objects if o.type == 'MESH']
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'rumah.blend'))
for o in bpy.context.view_layer.objects:
    o.select_set(o.type == 'MESH')
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'rumah.glb'), use_selection=True, export_format='GLB', export_apply=True, export_extras=True)
print('RUMAH OK', len(meshes), 'mesh', tris, 'segitiga')
if RENDER:
    sc.render.engine = 'CYCLES'; sc.cycles.samples = 48
    try:
        sc.cycles.use_denoising = True
    except Exception:
        pass
    w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
    sky = w.node_tree.nodes.new('ShaderNodeTexSky')
    try:
        sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(38); sky.sun_rotation = math.radians(210)
    except Exception:
        pass
    w.node_tree.links.new(sky.outputs[0], w.node_tree.nodes['Background'].inputs[0])
    w.node_tree.nodes['Background'].inputs[1].default_value = 0.35
    sun = bpy.data.objects.new('Matahari', bpy.data.lights.new('Matahari', 'SUN')); col.objects.link(sun)
    sun.data.energy = 3.5; sun.rotation_euler = (math.radians(50), 0, math.radians(30)); sun.data.angle = math.radians(2)
    kotak('Jalan', -14, 12, -9.5, PAGAR_Y - 0.3, -0.02, 0.0, 'Paving')

    def kamera(nama, loc, target, lens=35):
        cd = bpy.data.cameras.new(nama); cd.lens = lens
        ob = bpy.data.objects.new(nama, cd); col.objects.link(ob); ob.location = loc
        ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
        return ob
    sc.render.resolution_x, sc.render.resolution_y = 1400, 900
    sc.render.image_settings.file_format = 'JPEG'
    os.makedirs(os.path.join(OUT, 'render'), exist_ok=True)
    for nama, loc, tgt, lens in [('depan', (4.0, -15.5, 4.2), (0.5, 0, 2.0), 30), ('teras', (5.2, -6.0, 1.9), (2.8, -0.5, 1.6), 28),
                                 ('garasi', (-3.0, -9.5, 2.6), (-3.8, 1.5, 1.2), 30)]:
        sc.camera = kamera('Cam_' + nama, loc, tgt, lens)
        sc.render.filepath = os.path.join(OUT, 'render', nama + '.jpg'); bpy.ops.render.render(write_still=True)
