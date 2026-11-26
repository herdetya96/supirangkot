"""NARIK — tekstur detail material, dibuat dari node prosedural Blender lalu dirender (Cycles) jadi satu atlas.

Jalankan:  python tools/blender/build_textures.py assets/img
Hasil:     assets/img/detail.webp, atlas 4×4 lapisan 512 px, abu-abu (nilai tengah ±0.5 = netral).

Urutan lapisan harus sama dengan KELAS di build_assets.py dan DETAIL di drive3d.js.
Tiap lapisan dibuat bisa diulang tanpa sambungan: hasil render dicampur dengan salinannya yang digeser setengah bingkai.
"""
import bpy, os, sys, math
import numpy as np

OUT = sys.argv[-1] if len(sys.argv) > 1 and not sys.argv[-1].endswith('.py') else 'assets/img'
os.makedirs(OUT, exist_ok=True)
N = 512
# sebaran (simpangan baku) sasaran tiap lapisan setelah dinormalkan ke rata-rata 0.5
SEBARAN = {'polos': 0.0, 'cat': 0.035, 'logam': 0.09, 'kaca': 0.03, 'karet': 0.17, 'plester': 0.11, 'bata': 0.15, 'genteng': 0.16,
           'seng': 0.16, 'kayu': 0.14, 'aspal': 0.12, 'paving': 0.14, 'beton': 0.10, 'rumput': 0.16, 'kain': 0.10, 'daun': 0.18}
KELAS = ['polos', 'cat', 'logam', 'kaca', 'karet', 'plester', 'bata', 'genteng', 'seng', 'kayu', 'aspal', 'paving', 'beton', 'rumput', 'kain', 'daun']


def scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    sc.cycles.device = 'CPU'
    sc.cycles.samples = 4
    sc.render.resolution_x = sc.render.resolution_y = N
    sc.view_settings.view_transform = 'Raw'          # simpan nilai apa adanya, tanpa kurva tampilan
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'BW'
    sc.render.image_settings.color_depth = '8'
    bpy.ops.mesh.primitive_plane_add(size=1.04, location=(0.5, 0.5, 0))   # sedikit lebih besar dari bingkai: tepi render bersih
    plane = bpy.context.active_object
    cam = bpy.data.objects.new('kamera', bpy.data.cameras.new('kamera'))
    sc.collection.objects.link(cam)
    sc.camera = cam
    cam.data.type = 'ORTHO'
    cam.data.ortho_scale = 1.0
    cam.location = (0.5, 0.5, 2)
    return sc, plane


class Nodes:
    def __init__(self, mat):
        self.nt = mat.node_tree
        self.nt.nodes.clear()
        self.co = self.new('ShaderNodeTexCoord').outputs['Generated']

    def new(self, kind, **kw):
        n = self.nt.nodes.new(kind)
        for k, v in kw.items():
            if k in n.inputs:
                n.inputs[k].default_value = v
            else:
                setattr(n, k, v)
        return n

    def link(self, a, b):
        self.nt.links.new(a, b)

    def vec(self, sx, sy=None):
        m = self.new('ShaderNodeMapping')
        m.inputs['Scale'].default_value = (sx, sy if sy is not None else sx, 1)
        self.link(self.co, m.inputs['Vector'])
        return m.outputs['Vector']

    def noise(self, sx, sy=None, detail=6, rough=0.6):
        n = self.new('ShaderNodeTexNoise', Scale=1.0, Detail=detail, Roughness=rough)
        self.link(self.vec(sx, sy), n.inputs['Vector'])
        return n.outputs['Fac']

    def voronoi(self, s, feature='F1', dist='EUCLIDEAN', out='Distance'):
        n = self.new('ShaderNodeTexVoronoi', feature=feature, distance=dist)
        n.inputs['Scale'].default_value = 1.0
        self.link(self.vec(s), n.inputs['Vector'])
        return n.outputs[out]

    def brick(self, rows, cols, mortar=0.02, offset=0.5, c1=0.55, c2=0.45, cm=0.25, smooth=0.1):
        n = self.new('ShaderNodeTexBrick', offset=offset, offset_frequency=2, squash=1.0, squash_frequency=2)
        n.inputs['Color1'].default_value = (c1, c1, c1, 1)
        n.inputs['Color2'].default_value = (c2, c2, c2, 1)
        n.inputs['Mortar'].default_value = (cm, cm, cm, 1)
        n.inputs['Scale'].default_value = 1.0
        n.inputs['Mortar Size'].default_value = mortar
        n.inputs['Mortar Smooth'].default_value = smooth
        n.inputs['Brick Width'].default_value = 1.0 / cols
        n.inputs['Row Height'].default_value = 1.0 / rows
        self.link(self.co, n.inputs['Vector'])
        return n.outputs['Color']

    def wave(self, s, kind='BANDS', direction='X', distortion=0.0, profile='SIN'):
        n = self.new('ShaderNodeTexWave', wave_type=kind, bands_direction=direction, wave_profile=profile)
        n.inputs['Scale'].default_value = s
        n.inputs['Distortion'].default_value = distortion
        n.inputs['Detail'].default_value = 3
        self.link(self.co, n.inputs['Vector'])
        return n.outputs['Fac']

    def math(self, op, a, b=0.0, clamp=True):
        n = self.new('ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)):
                n.inputs[i].default_value = v
            else:
                self.link(v, n.inputs[i])
        return n.outputs[0]

    def gray(self, col):
        n = self.new('ShaderNodeRGBToBW')
        self.link(col, n.inputs['Color'])
        return n.outputs['Val']

    def around(self, v, amp, mid=0.5):
        """mid + (v - 0.5) * 2 * amp"""
        return self.math('ADD', self.math('MULTIPLY', self.math('SUBTRACT', v, 0.5, False), 2 * amp, False), mid)

    def out(self, v):
        e = self.new('ShaderNodeEmission')
        self.link(v, e.inputs['Color'])
        o = self.new('ShaderNodeOutputMaterial')
        self.link(e.outputs['Emission'], o.inputs['Surface'])


def build(n, k):
    """Graf node tiap kelas; hasil satu nilai abu-abu sekitar 0.5."""
    if k == 'polos':
        return n.math('ADD', 0.5, 0.0)
    if k == 'cat':
        return n.around(n.noise(180, detail=2), 0.06)
    if k == 'logam':
        return n.around(n.noise(6, 260, detail=4), 0.18)
    if k == 'kaca':
        return n.around(n.noise(3, detail=3), 0.05)
    if k == 'karet':
        tread = n.gray(n.brick(10, 3, mortar=0.06, offset=0.5, c1=0.62, c2=0.58, cm=0.18))
        return n.math('MULTIPLY', tread, n.around(n.noise(60), 0.15, 1.0), False)
    if k == 'plester':
        base = n.around(n.noise(5, detail=8, rough=0.65), 0.22)
        stain = n.math('POWER', n.noise(2.5, 9, detail=4), 3.0)
        streak = n.math('MULTIPLY', stain, 0.35, False)
        fine = n.around(n.noise(120, detail=2), 0.06, 0.0)
        return n.math('ADD', n.math('SUBTRACT', base, streak, False), fine)
    if k == 'bata':
        b = n.gray(n.brick(8, 4, mortar=0.025, c1=0.6, c2=0.48, cm=0.82))
        return n.math('MULTIPLY', b, n.around(n.noise(40, detail=4), 0.18, 1.0), False)
    if k == 'genteng':
        rows = n.gray(n.brick(8, 8, mortar=0.03, offset=0.5, c1=0.62, c2=0.56, cm=0.18, smooth=0.6))
        shade = n.wave(8, 'BANDS', 'Y', 0.0, 'SAW')
        curve = n.around(shade, 0.18, 1.0)
        return n.math('MULTIPLY', n.math('MULTIPLY', rows, curve, False), n.around(n.noise(30), 0.12, 1.0), False)
    if k == 'seng':
        rib = n.around(n.wave(32 * 1.0, 'BANDS', 'X', 0.0, 'SIN'), 0.28)
        rust = n.math('POWER', n.noise(4, detail=6), 2.4)
        return n.math('SUBTRACT', rib, n.math('MULTIPLY', rust, 0.5, False), False)
    if k == 'kayu':
        grain = n.around(n.wave(24, 'RINGS', 'X', 6.0, 'SIN'), 0.18)
        planks = n.gray(n.brick(4, 1, mortar=0.012, offset=0.37, c1=1.0, c2=0.86, cm=0.35))
        return n.math('MULTIPLY', grain, planks, False)
    if k == 'aspal':
        speck = n.around(n.noise(260, detail=2), 0.28)
        agg = n.voronoi(90)
        crack = n.math('LESS_THAN', n.voronoi(5, 'DISTANCE_TO_EDGE'), 0.006)
        patch = n.math('MULTIPLY', n.math('GREATER_THAN', n.noise(1.6, detail=3), 0.62), 0.12, False)
        v = n.math('ADD', speck, n.around(agg, 0.1, 0.0))
        v = n.math('SUBTRACT', v, n.math('MULTIPLY', crack, 0.35, False))
        return n.math('SUBTRACT', v, patch)
    if k == 'paving':
        t = n.gray(n.brick(8, 8, mortar=0.035, offset=0.0, c1=0.6, c2=0.52, cm=0.22, smooth=0.2))
        return n.math('MULTIPLY', t, n.around(n.noise(50, detail=4), 0.15, 1.0), False)
    if k == 'beton':
        v = n.around(n.noise(10, detail=7), 0.18)
        seam = n.math('MULTIPLY', n.math('GREATER_THAN', n.wave(4, 'BANDS', 'Y', 0, 'SAW'), 0.985), 0.3, False)
        pits = n.math('MULTIPLY', n.math('LESS_THAN', n.voronoi(70), 0.06), 0.25, False)
        return n.math('SUBTRACT', n.math('SUBTRACT', v, seam), pits)
    if k == 'rumput':
        blades = n.around(n.noise(10, 160, detail=3), 0.3)
        clump = n.around(n.noise(5, detail=5), 0.2, 0.0)
        return n.math('ADD', blades, clump)
    if k == 'kain':
        a = n.wave(64, 'BANDS', 'X', 0, 'SIN')
        b = n.wave(64, 'BANDS', 'Y', 0, 'SIN')
        return n.around(n.math('MULTIPLY', n.math('ADD', a, b, False), 0.5, False), 0.16)
    if k == 'daun':
        cells = n.voronoi(14, 'F1', 'EUCLIDEAN')
        leaf = n.around(n.math('SUBTRACT', 1.0, cells), 0.32)
        return n.math('ADD', leaf, n.around(n.noise(40, detail=3), 0.12, 0.0))
    raise ValueError(k)


def seamless(a):
    """Sambung tepi per sumbu: campur dengan salinan yang digeser setengah bingkai di satu sumbu saja,
    dengan bobot nol di tengah (tempat sambungan salinan) dan penuh di tepi. Lalu ulangi untuk sumbu lain."""
    def axis(a, ax):
        n = a.shape[ax]
        s = np.roll(a, n // 2, ax)
        t = np.abs(np.linspace(-1, 1, n))
        w = np.clip((t - 0.5) / 0.45, 0, 1)
        w = w * w * (3 - 2 * w)
        w = w[:, None] if ax == 0 else w[None, :]
        return a * (1 - w) + s * w
    return axis(axis(a, 1), 0)


def main():
    sc, plane = scene()
    tiles = []
    tmp = os.path.join(OUT, '_lapisan.png')
    for k in KELAS:
        mat = bpy.data.materials.new(k)
        mat.use_nodes = True
        n = Nodes(mat)
        n.out(build(n, k))
        plane.data.materials.clear()
        plane.data.materials.append(mat)
        sc.render.filepath = os.path.abspath(tmp)
        bpy.ops.render.render(write_still=True)
        img = bpy.data.images.load(os.path.abspath(tmp))
        px = np.array(img.pixels[:], dtype=np.float32).reshape(N, N, 4)[::-1, :, 0]
        bpy.data.images.remove(img)
        a = seamless(px)
        sd = a.std()
        a = 0.5 + (a - a.mean()) * (SEBARAN[k] / sd if sd > 1e-4 else 0.0)
        a = np.clip(a, 0.02, 0.98)
        print(f'{k:8s} rata-rata {a.mean():.2f}  sebaran {a.std():.2f}')
        tiles.append(a)
    os.remove(tmp)
    atlas = np.zeros((4 * N, 4 * N), dtype=np.float32)
    for i, a in enumerate(tiles):
        r, c = divmod(i, 4)
        atlas[r * N:(r + 1) * N, c * N:(c + 1) * N] = a
    im = bpy.data.images.new('detail', 4 * N, 4 * N, alpha=False)
    im.colorspace_settings.name = 'Non-Color'          # simpan nilai mentah, jangan digelapkan kurva sRGB
    rgba = np.ones((4 * N, 4 * N, 4), dtype=np.float32)
    rgba[..., 0] = rgba[..., 1] = rgba[..., 2] = np.clip(atlas, 0, 1)
    im.pixels = rgba[::-1].ravel()
    im.filepath_raw = os.path.abspath(os.path.join(OUT, 'detail.webp'))
    im.file_format = 'WEBP'
    sc.render.image_settings.file_format = 'WEBP'
    sc.render.image_settings.color_mode = 'RGB'
    sc.view_settings.view_transform = 'Raw'
    sc.render.image_settings.quality = 82
    im.save_render(im.filepath_raw, scene=sc)
    print('atlas', im.filepath_raw, os.path.getsize(im.filepath_raw) // 1024, 'KB')


if __name__ == '__main__':
    main()
