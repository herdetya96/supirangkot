"""Motor skuter matic detail (tanpa merek), aset seni seperti art/angkot.

    python tools/blender/motor/build.py            -> art/motor/motor.blend, motor.glb, render/*.jpg
    OUT=<folder> RENDER=0 python ...               -> tanpa render (dipakai tools/blender/motor/ringan.py)

Satuan meter, depan +Y, atas +Z, tanah di z = 0 (sama dengan aset game, jadi ringan.py tidak perlu memutar).
Panel bodi dibentuk dari kotak yang dipotong-potong, dilengkungkan per titik (fungsi bentuk), lalu dibevel dan dihaluskan.
Material bernama: Cat (warna bodi, diganti per motor di game), Plastik, Jok, Krom, Ban, Velg, Kaca, Lampu, Sein, Rem, Pelat.
"""
import bpy, bmesh, math, os
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('OUT', os.path.normpath(os.path.join(HERE, '..', '..', '..', 'art', 'motor')))
RENDER = os.environ.get('RENDER', '1') != '0'
os.makedirs(OUT, exist_ok=True)
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene; col = sc.collection


# ---------------------------------------------------------------- material
def mat(name, rgb, metal=0.0, rough=0.5, emit=0.0, alpha=1.0):
    m = bpy.data.materials.new(name)
    try:
        m.use_nodes = True
    except Exception:
        pass
    b = m.node_tree.nodes.get('Principled BSDF')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Metallic'].default_value = metal; b.inputs['Roughness'].default_value = rough
    if emit:
        b.inputs['Emission Color'].default_value = (*rgb, 1); b.inputs['Emission Strength'].default_value = emit
    if alpha < 1:
        b.inputs['Alpha'].default_value = alpha
    return m


CAT = mat('Cat', (0.55, 0.03, 0.03), rough=0.25)
PLASTIK = mat('Plastik', (0.03, 0.03, 0.035), rough=0.6)
JOK = mat('Jok', (0.02, 0.02, 0.02), rough=0.45)
KROM = mat('Krom', (0.8, 0.8, 0.82), metal=1, rough=0.15)
BAN = mat('Ban', (0.015, 0.015, 0.015), rough=0.8)
VELG = mat('Velg', (0.35, 0.36, 0.38), metal=0.8, rough=0.3)
KACA = mat('Kaca', (0.05, 0.06, 0.07), rough=0.05)
LAMPU = mat('Lampu', (0.95, 0.95, 0.9), rough=0.1, emit=0.3)
SEIN = mat('Sein', (1.0, 0.45, 0.0), rough=0.2)
REM = mat('Rem', (0.7, 0.02, 0.01), rough=0.2)
PELAT = mat('Pelat', (0.02, 0.02, 0.02), rough=0.4)
MESIN = mat('Mesin', (0.25, 0.26, 0.27), metal=0.6, rough=0.45)


def obj(name, me, material, smooth=True):
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    me.materials.append(material)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def apply_mods(ob):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)


def blok(name, size, loc, material, cuts=(2, 4, 2), bentuk=None, bevel=0.02, seg=3, sub=0):
    """Kotak berpotongan (cuts per sumbu), titik dilengkungkan bentuk(v) di koordinat lokal, lalu bevel/subsurf."""
    b = bmesh.new()
    bmesh.ops.create_cube(b, size=1.0)
    for ax, n in enumerate(cuts):
        for _ in range(n):
            pass
    # potong rata per sumbu
    for ax, n in enumerate(cuts):
        if n <= 0:
            continue
        for k in range(1, n + 1):
            c = -0.5 + k / (n + 1)
            no = [0, 0, 0]; no[ax] = 1
            geom = list(b.verts) + list(b.edges) + list(b.faces)
            bmesh.ops.bisect_plane(b, geom=geom, plane_co=[c if i == ax else 0 for i in range(3)], plane_no=no)
    for v in b.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
        if bentuk:
            v.co = Vector(bentuk(v.co.copy()))
    me = bpy.data.meshes.new(name); b.to_mesh(me); b.free()
    ob = obj(name, me, material); ob.location = loc
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = seg; bv.limit_method = 'ANGLE'
    if sub:
        s = ob.modifiers.new('sub', 'SUBSURF'); s.levels = sub; s.render_levels = sub
    apply_mods(ob)
    return ob


def silinder(name, r, depth, loc, material, rot=(0, 0, 0), verts=32, bevel=0.0):
    bpy.ops.mesh.primitive_cylinder_add(radius=r, depth=depth, location=loc, rotation=rot, vertices=verts)
    ob = bpy.context.active_object; ob.name = name; ob.data.materials.append(material)
    if bevel:
        bv = ob.modifiers.new('bevel', 'BEVEL'); bv.width = bevel; bv.segments = 3; apply_mods(ob)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def bola(name, r, loc, material, skala=(1, 1, 1), seg=24):
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=loc, segments=seg, ring_count=seg // 2)
    ob = bpy.context.active_object; ob.name = name; ob.scale = skala; ob.data.materials.append(material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def pipa(name, pts, r, material, seg=10):
    """Tabung sepanjang titik-titik (kurva poly dengan bevel)."""
    cu = bpy.data.curves.new(name, 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = r; cu.bevel_resolution = 2
    sp = cu.splines.new('POLY'); sp.points.add(len(pts) - 1)
    for p, q in zip(sp.points, pts):
        p.co = (*q, 1)
    ob = bpy.data.objects.new(name, cu); col.objects.link(ob); cu.materials.append(material)
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.object.convert(target='MESH')
    ob = bpy.context.active_object
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


# ---------------------------------------------------------------- roda
WB = 1.26          # jarak sumbu roda
RW = 0.255         # jari-jari roda (ban 14 inci)
YF, YR = WB / 2, -WB / 2


def roda(nama, y):
    bpy.ops.mesh.primitive_torus_add(major_radius=RW - 0.045, minor_radius=0.048, major_segments=40, minor_segments=12,
                                     location=(0, y, RW), rotation=(0, math.pi / 2, 0))
    ban = bpy.context.active_object; ban.name = nama + '_ban'; ban.scale = (1, 1, 1.0); ban.data.materials.append(BAN)
    for p in ban.data.polygons:
        p.use_smooth = True
    silinder(nama + '_velg', RW - 0.075, 0.07, (0, y, RW), VELG, rot=(0, math.pi / 2, 0), verts=36)
    silinder(nama + '_tromol', 0.07, 0.11, (0, y, RW), MESIN, rot=(0, math.pi / 2, 0), verts=20)
    # velg palang lima
    for k in range(5):
        a = k / 5 * math.tau
        blok(nama + f'_palang{k}', (0.035, 0.14, 0.022), (0, y + 0.08 * math.cos(a), RW + 0.08 * math.sin(a)), VELG,
             cuts=(0, 1, 0), bevel=0.006, seg=2,
             bentuk=lambda v, a=a: (v.x * 2.2, v.y * math.cos(a) - v.z * math.sin(a), v.y * math.sin(a) + v.z * math.cos(a)))


roda('depan', YF)
roda('belakang', YR)

# ---------------------------------------------------------------- rangka dan garpu depan
RAKE = math.radians(24)
kepala = Vector((0, 0.50, 0.92))           # kepala kemudi
for sx in (-1, 1):
    pipa(f'garpu{sx}', [(sx * 0.075, YF, RW), tuple(kepala + Vector((sx * 0.075, 0, -0.05)))], 0.022, KROM)
pipa('stang', [(-0.31, 0.47, 1.04), (-0.2, 0.49, 1.03), (0.2, 0.49, 1.03), (0.31, 0.47, 1.04)], 0.012, KROM)
for sx in (-1, 1):
    pipa(f'grip{sx}', [(sx * 0.25, 0.48, 1.035), (sx * 0.36, 0.465, 1.042)], 0.019, JOK)
    pipa(f'tuas{sx}', [(sx * 0.2, 0.51, 1.045), (sx * 0.33, 0.56, 1.03)], 0.006, KROM)
    # spion
    pipa(f'spion_tangkai{sx}', [(sx * 0.2, 0.47, 1.05), (sx * 0.24, 0.46, 1.17), (sx * 0.27, 0.46, 1.23)], 0.007, KROM)
    bola(f'spion{sx}', 0.055, (sx * 0.29, 0.46, 1.25), PLASTIK, (1, 0.35, 0.7))

# batok kepala (penutup setang) dengan lampu depan
blok('batok', (0.40, 0.24, 0.13), (0, 0.50, 1.07), CAT, cuts=(3, 2, 1), bevel=0.035,
     bentuk=lambda v: (v.x * (1 - 0.35 * max(0, v.y / 0.12)), v.y, v.z + 0.06 * (v.y / 0.12) - 0.25 * v.x * v.x))
blok('lampu_depan', (0.17, 0.03, 0.07), (0, 0.625, 1.07), LAMPU, cuts=(2, 0, 0), bevel=0.012,
     bentuk=lambda v: (v.x, v.y - 0.4 * v.x * v.x, v.z))
blok('panel', (0.22, 0.10, 0.03), (0, 0.44, 1.12), PLASTIK, bevel=0.012, bentuk=lambda v: (v.x, v.y, v.z + 0.2 * v.y))
silinder('speedo', 0.04, 0.01, (0, 0.44, 1.14), KACA, rot=(math.radians(-65), 0, 0))

# ---------------------------------------------------------------- tameng depan (melengkung, meruncing ke atas)


def tameng(v):
    t = (v.z + 0.31) / 0.62                       # 0 bawah, 1 atas
    x = v.x * (1.0 - 0.32 * t)
    y = v.y - 0.55 * x * x + 0.12 * t - 0.05 * (1 - t) * (1 - t)
    return (x, y, v.z)


blok('tameng_depan', (0.42, 0.06, 0.62), (0, 0.50, 0.66), CAT, cuts=(5, 0, 5), bentuk=tameng, bevel=0.025)
blok('tameng_dalam', (0.36, 0.03, 0.52), (0, 0.44, 0.62), PLASTIK, cuts=(4, 0, 4), bevel=0.01,
     bentuk=lambda v: (v.x * (1 - 0.3 * (v.z + 0.26) / 0.52), v.y - 0.5 * v.x * v.x + 0.1 * (v.z + 0.26) / 0.52, v.z))
for sx in (-1, 1):
    blok(f'sein_depan{sx}', (0.05, 0.03, 0.025), (sx * 0.15, 0.585, 0.93), SEIN, bevel=0.008)
blok('slebor_depan', (0.14, 0.50, 0.05), (0, YF + 0.02, RW + 0.20), CAT, cuts=(2, 6, 0), bevel=0.02,
     bentuk=lambda v: (v.x * (1 - 0.2 * abs(v.y) / 0.25), v.y, v.z - 0.45 * v.y * v.y))

# ---------------------------------------------------------------- dek kaki dan rangka bawah
blok('dek', (0.30, 0.50, 0.05), (0, 0.17, 0.33), PLASTIK, cuts=(2, 3, 0), bevel=0.015)
for k in range(5):
    blok(f'karet_dek{k}', (0.26, 0.012, 0.006), (0, 0.0 + k * 0.08, 0.358), BAN, cuts=(0, 0, 0), bevel=0.002, seg=1)
blok('rok_bawah', (0.26, 0.62, 0.12), (0, 0.12, 0.24), CAT, cuts=(2, 4, 1), bevel=0.03,
     bentuk=lambda v: (v.x * (1 - 0.4 * max(0, -v.z / 0.06)), v.y, v.z))

# ---------------------------------------------------------------- bodi belakang (di bawah jok), meruncing ke buritan


def buritan(v):
    """Bodi belakang skuter: depan bawah turun menyambung dek, belakang naik dan menyempit, sisi menggembung."""
    t = (v.y + 0.43) / 0.86                       # 0 depan, 1 belakang
    u = (v.z + 0.18) / 0.36                       # 0 bawah, 1 atas
    x = v.x * (1.0 - 0.38 * t * t) * (0.86 + 0.22 * math.sin(math.pi * min(1, max(0, u))))
    z = v.z
    if u < 0.5:
        z += (0.5 - u) * 0.36 * (0.75 * t * t)                 # dasar naik ke belakang
        if t < 0.25:
            z -= (0.5 - u) * 0.36 * 0.9 * (1 - t / 0.25)       # depan bawah turun ke dek
    z += 0.07 * t * u - 0.02 * (1 - t)
    return (x, v.y, z)


blok('bodi_belakang', (0.33, 0.86, 0.36), (0, -0.42, 0.58), CAT, cuts=(4, 8, 4), bentuk=buritan, bevel=0.02, seg=2, sub=2)
blok('leher', (0.15, 0.10, 0.16), (0, 0.50, 1.00), CAT, cuts=(1, 1, 2), bevel=0.03,
     bentuk=lambda v: (v.x * (1 + 0.6 * (v.z + 0.08)), v.y + 0.15 * v.z, v.z))
blok('lis_bodi', (0.355, 0.70, 0.012), (0, -0.40, 0.60), PLASTIK, cuts=(2, 4, 0), bevel=0.004,
     bentuk=lambda v: (v.x * (1.0 - 0.2 * ((v.y + 0.35) / 0.7) ** 2), v.y, v.z + 0.03 * (v.y + 0.35) / 0.7))
blok('jok', (0.27, 0.74, 0.08), (0, -0.33, 0.81), JOK, cuts=(3, 5, 1), bevel=0.04, seg=4,
     bentuk=lambda v: (v.x * (1 - 0.18 * max(0, -v.y / 0.37)), v.y, v.z + 0.035 * math.cos(math.pi * v.x / 0.27) + 0.04 * max(0, -v.y / 0.37)))
pipa('pegangan', [(-0.13, -0.62, 0.84), (-0.11, -0.80, 0.85), (0.11, -0.80, 0.85), (0.13, -0.62, 0.84)], 0.015, KROM)
blok('lampu_belakang', (0.20, 0.04, 0.06), (0, -0.83, 0.73), REM, cuts=(2, 0, 0), bevel=0.015,
     bentuk=lambda v: (v.x, v.y + 0.5 * v.x * v.x, v.z))
for sx in (-1, 1):
    blok(f'sein_belakang{sx}', (0.045, 0.03, 0.025), (sx * 0.13, -0.84, 0.66), SEIN, bevel=0.008)
blok('slebor_belakang', (0.13, 0.30, 0.03), (0, -0.82, 0.52), PLASTIK, cuts=(1, 3, 0), bevel=0.01,
     bentuk=lambda v: (v.x, v.y, v.z - 0.6 * (v.y + 0.15) ** 2))
blok('pelat', (0.20, 0.008, 0.09), (0, -0.92, 0.47), PELAT, bevel=0.004, seg=1)

# ---------------------------------------------------------------- mesin, CVT, knalpot, standar
blok('cvt', (0.08, 0.50, 0.17), (-0.13, -0.42, RW + 0.03), MESIN, cuts=(1, 3, 1), bevel=0.04,
     bentuk=lambda v: (v.x, v.y, v.z * (1 - 0.35 * max(0, -v.y / 0.25))))
blok('mesin', (0.20, 0.22, 0.20), (0, -0.12, 0.36), MESIN, cuts=(1, 1, 1), bevel=0.03)
silinder('knalpot', 0.05, 0.42, (0.16, -0.58, 0.33), PLASTIK, rot=(math.radians(90) - 0.12, 0, 0), verts=20, bevel=0.01)
blok('tutup_knalpot', (0.025, 0.34, 0.08), (0.205, -0.56, 0.34), KROM, cuts=(0, 3, 1), bevel=0.012,
     bentuk=lambda v: (v.x, v.y, v.z + 0.12 * v.y))
silinder('ujung_knalpot', 0.032, 0.05, (0.16, -0.80, 0.30), KROM, rot=(math.radians(90) - 0.12, 0, 0), verts=16)
for sx in (-1, 1):
    pipa(f'peredam{sx}', [(sx * 0.09 if sx < 0 else 0.1, YR + 0.06, RW + 0.02), (sx * 0.11, -0.52, 0.62)], 0.022, KROM)
pipa('standar', [(-0.06, -0.10, 0.30), (-0.10, -0.06, 0.05)], 0.012, MESIN)

# ---------------------------------------------------------------- selesai: simpan .blend, .glb, render
sc.render.engine = 'CYCLES'; sc.cycles.samples = 64
try:
    sc.cycles.use_denoising = True
except Exception:
    pass
w = bpy.data.worlds.new('w'); sc.world = w; w.use_nodes = True
w.node_tree.nodes['Background'].inputs[0].default_value = (0.04, 0.04, 0.045, 1)
bpy.ops.mesh.primitive_plane_add(size=30, location=(0, 0, 0)); lantai = bpy.context.active_object; lantai.name = 'Studio_Lantai'
lantai.data.materials.append(mat('Studio', (0.08, 0.08, 0.09), rough=0.35))


def lampu(nama, loc, energi, ukuran):
    ld = bpy.data.lights.new(nama, 'AREA'); ld.energy = energi; ld.size = ukuran
    ob = bpy.data.objects.new(nama, ld); col.objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector((0, 0, 0.6)) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()


lampu('Kunci', (2.5, 2.0, 3.0), 900, 3); lampu('Isi', (-3, -1, 2), 400, 3); lampu('Atas', (0, 0, 4), 500, 4)


def kamera(nama, loc, target=(0, 0, 0.6), lens=50):
    cd = bpy.data.cameras.new(nama); cd.lens = lens
    ob = bpy.data.objects.new(nama, cd); col.objects.link(ob); ob.location = loc
    ob.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat('-Z', 'Y').to_euler()
    return ob


sc.camera = kamera('Cam_DepanKanan', (2.6, 2.4, 1.3))
kamera('Cam_Samping', (3.6, 0, 0.8)); kamera('Cam_BelakangKiri', (-2.4, -2.6, 1.4))
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, 'motor.blend'))
for o in bpy.context.view_layer.objects:
    o.select_set(o.type == 'MESH' and not o.name.startswith('Studio'))
bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, 'motor.glb'), use_selection=True, export_format='GLB', export_apply=True)
tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in bpy.data.objects if o.type == 'MESH' and not o.name.startswith('Studio'))
print('MOTOR OK', tris, 'segitiga')
if RENDER:
    os.makedirs(os.path.join(OUT, 'render'), exist_ok=True)
    sc.render.resolution_x, sc.render.resolution_y = 1200, 900
    for c in ('Cam_DepanKanan', 'Cam_Samping', 'Cam_BelakangKiri'):
        sc.camera = bpy.data.objects[c]; sc.render.filepath = os.path.join(OUT, 'render', c.lower().replace('cam_', '') + '.jpg')
        sc.render.image_settings.file_format = 'JPEG'; bpy.ops.render.render(write_still=True)
