"""Rumah sopir (tools/blender/rumah/build.py, DETAIL=0) -> model game assets/models/rumah_sopir.glb.

    python tools/blender/rumah/ringan.py assets/models      (butuh `pip install bpy`)

Warna material jadi warna per sudut (build_assets.Asset) dengan jenis material untuk tekstur detail di game
(genteng, plester, bata, kayu, logam, seng, ...). Bola lampu teras dan garasi jadi mesh 'lampu' (menyala malam hari di JS), atap spandek garasi jadi mesh 'kanopi'
(tembus pandang di adegan rumah).
Titik penting (pintu, parkir, gerbang, ...) dari build.py disimpan sebagai custom property 'titik' pada mesh 'main'.
Muka rumah menghadap -Y Blender = +Z three.js (ke kamera adegan rumah), jadi tidak perlu diputar.
"""
import bpy, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.abspath(sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/models')
sys.argv = [sys.argv[0], OUT]
sys.path.insert(0, os.path.join(HERE, '..'))
import build_assets as B   # noqa: E402

WARNA = {   # material -> (hex sRGB, jenis KELAS)
    'Dinding': ('efe6d2', 'plester'), 'Batu': ('8a7f72', 'beton'), 'Plester': ('a7a39b', 'beton'), 'Genteng': ('b5523b', 'genteng'),
    'Bubungan': ('9c4632', 'genteng'), 'Kayu': ('8a5d33', 'kayu'), 'Kusen': ('5b3f26', 'kayu'), 'Kaca': ('2f4a5c', 'kaca'),
    'Besi': ('23292e', 'logam'), 'Lantai': ('e6dcc0', 'polos'), 'Nat': ('9a9184', 'polos'), 'Beton': ('b9b1a0', 'beton'),
    'Paving': ('9a9590', 'paving'), 'Spandek': ('c0c4c7', 'seng'), 'Rumput': ('6f9a46', 'rumput'), 'Tanah': ('7a5a3e', 'polos'),
    'Daun': ('3f7a35', 'daun'), 'Pot': ('b5674a', 'bata'), 'Lisplang': ('f4f1ea', 'cat'), 'Gelap': ('15191c', 'polos'),
    'Lampu': ('fff3c4', 'kaca'), 'Kursi': ('2a6fb5', 'cat'), 'Toren': ('e07b39', 'cat'), 'Karet': ('161616', 'karet'),
    'Kain1': ('d33a2b', 'kain'), 'Kain2': ('3e6fb1', 'kain'), 'Kain3': ('e6c84a', 'kain'), 'Jeriken': ('1f6fb5', 'cat'),
    'Meteran': ('dddddd', 'cat'),
}


def buat():
    tmp = tempfile.mkdtemp(prefix='rumah_')
    subprocess.run([sys.executable, os.path.join(HERE, 'build.py')], env=dict(os.environ, OUT=tmp, DETAIL=os.environ.get('DETAIL', '0'), RENDER='0'),
                   check=True, stdout=subprocess.DEVNULL)
    bpy.ops.wm.open_mainfile(filepath=os.path.join(tmp, 'rumah.blend'))
    titik = dict(bpy.data.objects['Dinding_kiri']['titik'].to_dict())
    A = B.Asset('rumah_sopir', 'bangunan')
    for o in [o for o in bpy.data.objects if o.type == 'MESH']:
        me = o.data.copy(); me.transform(o.matrix_world)
        for mi, m in enumerate(me.materials):
            nama = m.name.split('.')[0] if m else ''
            hx, k = WARNA.get(nama, ('9aa0a3', 'polos'))
            if not any(p.material_index == mi for p in me.polygons):
                continue

            def fn(b, me=me, mi=mi):
                import bmesh
                b.from_mesh(me)
                bmesh.ops.delete(b, geom=[f for f in b.faces if f.material_index != mi], context='FACES')
            fn.halus = 'semua' if o.name.startswith(('Pot', 'Lampu', 'Toren', 'Tutup_toren', 'Bubungan', 'Ban_bekas', 'Ember')) else None
            # kanopi garasi jadi mesh tersendiri: di game dibuat tembus pandang supaya angkot di bawahnya terlihat dari atas
            part = 'lampu' if nama == 'Lampu' else 'kanopi' if o.name.startswith(('Spandek', 'Usuk_garasi')) else 'main'
            A.add(B.hexc(hx), fn, part, k=k)
    # ekspor seperti Asset.export, ditambah custom property 'titik' (extras glTF) pada mesh main
    bpy.ops.wm.read_factory_settings(use_empty=True)
    objs = []
    for pname, b in A.parts.items():
        me = bpy.data.meshes.new(pname); b.to_mesh(me); b.free()
        try:
            me.color_attributes.active_color = me.color_attributes['Col']
            me.attributes.active_color_name = 'Col'; me.attributes.default_color_name = 'Col'
        except Exception:
            pass
        ob = bpy.data.objects.new(pname, me); bpy.context.scene.collection.objects.link(ob); objs.append(ob)
        if pname == 'main':
            ob['titik'] = titik
    for ob in bpy.context.scene.objects:
        ob.select_set(ob in objs)
    path = os.path.join(OUT, 'rumah_sopir.glb')
    bpy.ops.export_scene.gltf(filepath=path, export_format='GLB', use_selection=True, export_yup=True, export_apply=False,
                              export_texcoords=False, export_normals=True, export_materials='NONE', export_animations=False,
                              export_vertex_color='ACTIVE', export_extras=True)
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in objs)
    print(f'rumah_sopir    {tris:6d} segitiga  {os.path.getsize(path) / 1024:6.1f} KB')


if __name__ == '__main__':
    buat()
