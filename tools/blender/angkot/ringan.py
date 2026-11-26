"""Angkot detail tinggi (art/angkot, tools/blender/angkot/build.py) -> model game ringan assets/models/angkot*.glb.

    python tools/blender/angkot/ringan.py assets/models      (butuh `pip install bpy`)

Per trayek (05, 09, 12) skrip build.py dijalankan dengan TRAYEK=.. ke folder sementara, lalu:
- roda dan tulisan dikurangi segitiganya (decimate), tulisan kecil (koperasi, pelat, strip kaca) dibuang;
- warna material jadi warna per sudut seperti aset game lain (build_assets.Asset), cat hijau jadi penanda CAT (1,0,1)
  supaya warna angkot bisa diganti di JS;
- diputar menghadap +Y, ukurannya disesuaikan dengan kotak tabrakan game (3,4 × 1,76 m), tanah di z = 0;
- lampu rem jadi mesh 'rem' dan lampu mundur jadi mesh 'mundur' (warnanya diatur drive3d.js tiap frame).
Hasil: angkot_05/09/12.glb dan angkot.glb (= 05, dipakai angkot lain dan angkot biru). Lalu jalankan node tools/pack_models.js.
"""
import bpy, math, os, subprocess, sys, tempfile
from mathutils import Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models')
sys.argv = [sys.argv[0], OUT]
sys.path.insert(0, os.path.join(HERE, '..'))
import build_assets as B   # noqa: E402  (Asset, hexc, penanda warna)

# ukuran game: panjang 3,40 m, lebar 1,76 m (PL 84 / PW 44 unit di drive.js)
SKALA = (1.10, 0.845, 0.95)          # sesudah diputar: x = lebar, y = panjang, z = tinggi
BUANG = ('Koperasi', 'FrontPlateTxt', 'RearPlateTxt', 'SunStripText', 'Studio', 'Cyclorama', 'Floor')
WARNA = {   # material -> (hex sRGB, jenis material KELAS)
    'Paint_HijauAngkot': (None, 'cat'), 'Paint_White': ('eeeee8', 'cat'), 'Paint_Yellow': ('e6c84a', 'cat'),
    'Ink_Black': ('1b1d1f', 'polos'), 'Chrome': ('c9ced2', 'logam'), 'Tyre': ('161616', 'karet'), 'Steel_Wheel': ('b8bcc0', 'logam'),
    'Rubber': ('161616', 'karet'), 'Interior_Cream': ('cfc6ad', 'polos'), 'Black_Plastic': ('23292e', 'karet'),
    'Vinyl_Seat': ('7a3326', 'kain'), 'Glass': ('1f2d38', 'kaca'), 'Glass_SunStrip': ('2f4a3c', 'kaca'),
    'Lamp_Amber': ('f29b1d', 'kaca'), 'Step_Plate': ('b8bcc0', 'logam'), 'Plate_Yellow': ('f2c230', 'cat'),
    'Headlamp_Lens': ('fff3c4', 'kaca'), 'Lamp_Red': ('b3261e', 'kaca'), 'Lamp_White': ('e8e8e8', 'kaca'),
    'Seam': ('101112', 'polos'), 'Ceiling_Lamp': ('fffbe6', 'kaca'), 'Floor_Mat': ('2a2c2e', 'karet'), 'Sign_White': ('f4f4f0', 'cat'),
}


def target(ob, n):
    """Jumlah segitiga yang diinginkan untuk satu objek."""
    if ob.name.startswith('Wheel'):
        return 300
    if ob.name == 'Body':
        return int(n * 0.6)                         # bentuk utama: dikurangi sedikit saja
    if n > 600 and ob.data.materials and len(ob.data.materials) == 1 and ob.dimensions.length < 1.0:
        return max(140, int(n * 0.14))            # tulisan
    if n > 120:
        return max(90, int(n * 0.4))              # lengkungan bevel yang rapat (karet jendela, bemper, lis)
    return n


def ubah(trayek, nama):
    tmp = tempfile.mkdtemp(prefix='angkot_')
    env = dict(os.environ, OUT=tmp, TRAYEK=trayek)
    subprocess.run([sys.executable, os.path.join(HERE, 'build.py')], env=env, check=True, stdout=subprocess.DEVNULL)
    bpy.ops.wm.open_mainfile(filepath=os.path.join(tmp, 'angkot.blend'))
    A = B.Asset(nama)
    # putar: depan -X -> +Y, lalu skala; titik tengah badan di x = y = 0
    M = Matrix.Diagonal((*SKALA, 1)) @ Matrix.Rotation(-math.pi / 2, 4, 'Z')
    body = bpy.data.objects['Body']
    cx = sum((body.matrix_world @ v.co).x for v in body.data.vertices) / len(body.data.vertices)
    M = M @ Matrix.Translation((-cx, 0, 0))
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in list(bpy.data.objects):
        if ob.type != 'MESH' or ob.name.startswith(BUANG) or ob.hide_render:
            continue
        n = sum(len(p.vertices) - 2 for p in ob.data.polygons)
        t = target(ob, n)
        if t < n:
            d = ob.modifiers.new('ringan', 'DECIMATE'); d.ratio = t / n; d.use_collapse_triangulate = True
    dg = bpy.context.evaluated_depsgraph_get()
    for ob in list(bpy.data.objects):
        if ob.type != 'MESH' or ob.name.startswith(BUANG) or ob.hide_render:
            continue
        me = ob.evaluated_get(dg).to_mesh().copy()
        me.transform(M @ ob.matrix_world)
        mats = [m.name if m else '' for m in me.materials] or ['']
        for mi, mn in enumerate(mats):
            hx, k = WARNA.get(mn, ('9aa0a3', 'polos'))
            col = B.CAT if hx is None else B.hexc(hx)
            if not any(p.material_index == mi for p in me.polygons):
                continue
            # lampu rem dan lampu mundur (putih di buritan, y < 0 sesudah diputar) jadi mesh terpisah
            part = 'main'
            if mn == 'Lamp_Red':
                part = 'rem'
            elif mn == 'Lamp_White' and sum(v.co.y for v in me.vertices) / len(me.vertices) < 0:
                part = 'mundur'

            def fn(b, me=me, mi=mi):
                b.from_mesh(me)
                hapus = [f for f in b.faces if f.material_index != mi]
                import bmesh
                bmesh.ops.delete(b, geom=hapus, context='FACES')
            A.add(col, fn, part, k=k)
        bpy.data.meshes.remove(me)
    # bayangan di bawah badan (untuk grafis Ringan yang tanpa bayangan matahari)
    A.add(B.BAYANG, B.plane((0, 0, 0.012), 1.76 + 0.2, 3.40 + 0.24))
    A.export()


if __name__ == '__main__':
    for tr in ('05', '09', '12'):
        ubah(tr, 'angkot_' + tr)
    ubah('05', 'angkot')
