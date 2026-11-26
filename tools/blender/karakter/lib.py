"""Pustaka bersama untuk build.py: pembantu mesh (tabung, elipsoid, loft), material dasar, dan studio.
Dijalankan lewat exec() dari build.py, bukan diimpor.
"""
import bpy, bmesh, math, os, sys
import numpy as np
from mathutils import Vector, Matrix

OUT = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; col = scene.collection
PI = math.pi

# ================================================================ helpers
def activate(obj):
    for o in bpy.context.view_layer.objects:
        if o is not None: o.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj
def apply_mods(obj):
    activate(obj)
    for m in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)
def shade(obj):
    activate(obj); bpy.ops.object.shade_smooth()
def fix_normals(obj):
    activate(obj); bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode="OBJECT")
def mesh_obj(name, V, F, material=None):
    me = bpy.data.meshes.new(name); me.from_pydata([tuple(v) for v in V], [], F); me.update()
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    if material: ob.data.materials.append(material)
    return ob
def build(name, parts, material):
    V, F = [], []
    for v, f in parts:
        o = len(V); V += list(v); F += [tuple(i + o for i in face) for face in f]
    ob = mesh_obj(name, V, F, material); fix_normals(ob); return ob
def pchip(xk, yk):
    xk = np.array(xk, float); yk = np.array(yk, float); h = np.diff(xk); d = np.diff(yk) / h
    m = np.zeros_like(yk)
    for i in range(1, len(xk) - 1):
        if d[i - 1] * d[i] > 0:
            w1, w2 = 2 * h[i] + h[i - 1], h[i] + 2 * h[i - 1]; m[i] = (w1 + w2) / (w1 / d[i - 1] + w2 / d[i])
    m[0], m[-1] = d[0], d[-1]
    def f(x):
        x = min(max(x, xk[0]), xk[-1]); i = int(min(max(np.searchsorted(xk, x) - 1, 0), len(xk) - 2)); t = (x - xk[i]) / h[i]
        return ((2 * t**3 - 3 * t**2 + 1) * yk[i] + (t**3 - 2 * t**2 + t) * h[i] * m[i] + (-2 * t**3 + 3 * t**2) * yk[i + 1] + (t**3 - t**2) * h[i] * m[i + 1])
    return f
def chaikin_open(A, it):
    A = np.asarray(A, float)
    for _ in range(it):
        out = [A[0]]
        for i in range(len(A) - 1): out.append(0.75 * A[i] + 0.25 * A[i + 1]); out.append(0.25 * A[i] + 0.75 * A[i + 1])
        out.append(A[-1]); A = np.array(out)
    return A
def stack_vf(pole0, rings, pole1):
    seg = len(rings[0]); V = [tuple(pole0)]
    for r in rings: V += [tuple(p) for p in r]
    V.append(tuple(pole1)); last = len(V) - 1; F = []
    for k in range(seg): F.append((0, 1 + k, 1 + (k + 1) % seg))
    for r in range(len(rings) - 1):
        o = 1 + r * seg; o2 = o + seg
        for k in range(seg): F.append((o + k, o2 + k, o2 + (k + 1) % seg, o + (k + 1) % seg))
    o = 1 + (len(rings) - 1) * seg
    for k in range(seg): F.append((last, o + (k + 1) % seg, o + k))
    return V, F
def tube(pts, radii, up=(0, 1, 0), seg=20, it=2, cup=None, capr=1.0):
    """Tabung melengkung berujung bulat. radii: skalar atau (ra, rb). cup=(depth, wall): ujung akhir berlubang (lengan baju, pipa celana)."""
    rad = [(r, r) if np.isscalar(r) else r for r in radii]
    A = chaikin_open(np.hstack([np.array([tuple(p) for p in pts], float), np.array(rad, float)]), it)
    P = A[:, :3]; R = A[:, 3:]; n = len(P)
    T = np.gradient(P, axis=0); T /= np.linalg.norm(T, axis=1)[:, None]
    a = np.cross(np.array(up, float), T[0])
    if np.linalg.norm(a) < 1e-4: a = np.cross(np.array([1.0, 0, 0]), T[0])
    AX, BX = [], []
    for i in range(n):
        a = a - T[i] * np.dot(a, T[i]); a /= np.linalg.norm(a); AX.append(a.copy()); BX.append(np.cross(T[i], a))
    th = np.linspace(0, 2 * PI, seg, endpoint=False); C, S = np.cos(th)[:, None], np.sin(th)[:, None]
    ring = lambda c, av, bv: c + av * C + bv * S
    K = 5; rings = []
    def capring(i, sign, j):
        phi = (PI / 2) * j / (K + 1); rm = (R[i][0] + R[i][1]) / 2 * capr
        return ring(P[i] + sign * T[i] * rm * math.sin(phi), AX[i] * R[i][0] * math.cos(phi), BX[i] * R[i][1] * math.cos(phi))
    for j in range(K, 0, -1): rings.append(capring(0, -1, j))
    for i in range(n): rings.append(ring(P[i], AX[i] * R[i][0], BX[i] * R[i][1]))
    p0 = P[0] - T[0] * (R[0][0] + R[0][1]) / 2 * capr
    if cup:
        depth, wall = cup; i = n - 1
        rings.append(ring(P[i], AX[i] * (R[i][0] - wall), BX[i] * (R[i][1] - wall)))
        rings.append(ring(P[i] - T[i] * depth, AX[i] * (R[i][0] - wall), BX[i] * (R[i][1] - wall)))
        p1 = P[i] - T[i] * depth
    else:
        for j in range(1, K + 1): rings.append(capring(n - 1, 1, j))
        p1 = P[n - 1] + T[n - 1] * (R[n - 1][0] + R[n - 1][1]) / 2 * capr
    return stack_vf(p0, rings, p1)
def ell(center, ax, ay, az, seg=24, rg=12):
    """Elipsoid dengan tiga vektor sumbu (sudah berskala)."""
    c = np.array(center, float); ax, ay, az = (np.array(v, float) for v in (ax, ay, az))
    th = np.linspace(0, 2 * PI, seg, endpoint=False); rings = []
    for j in range(1, rg):
        ph = PI * j / rg; rings.append(c + (ax * np.cos(th)[:, None] + ay * np.sin(th)[:, None]) * math.sin(ph) - az * math.cos(ph))
    return stack_vf(c - az, rings, c + az)
def sph(center, rx, ry=None, rz=None):
    ry = rx if ry is None else ry; rz = rx if rz is None else rz
    return ell(center, (rx, 0, 0), (0, ry, 0), (0, 0, rz))
def loft_z(rings, n=2.3, seg=56, steps=44, cup=None):
    zs = [r[0] for r in rings]; frx = pchip(zs, [r[1] for r in rings]); fry = pchip(zs, [r[2] for r in rings]); fcy = pchip(zs, [r[3] for r in rings])
    th = np.linspace(0, 2 * PI, seg, endpoint=False); Cn = np.sign(np.cos(th)) * np.abs(np.cos(th)) ** (2 / n); Sn = np.sign(np.sin(th)) * np.abs(np.sin(th)) ** (2 / n)
    rg = lambda z, d=0.0: np.stack([(frx(z) - d) * Cn, fcy(z) + (fry(z) - d) * Sn, np.full(seg, z)], axis=1)
    out = []; z0, z1 = zs[0], zs[-1]
    if cup:
        wall, depth = cup; out += [rg(z0 + depth, wall), rg(z0, wall)]; p0 = (0, fcy(z0 + depth), z0 + depth)
    else: p0 = (0, fcy(z0), z0 - 0.004)
    for z in np.linspace(z0, z1, steps): out.append(rg(z))
    return stack_vf(p0, out, (0, fcy(z1), z1 + 0.004))
def remesh(ob, voxel, smooth=10, factor=0.5):
    m = ob.modifiers.new("rm", "REMESH"); m.mode = "VOXEL"; m.voxel_size = voxel; m.adaptivity = 0.0; m.use_smooth_shade = True
    apply_mods(ob)
    if smooth:
        s = ob.modifiers.new("sm", "SMOOTH"); s.factor = factor; s.iterations = smooth; apply_mods(ob)
    shade(ob); print(ob.name, "faces:", len(ob.data.polygons)); sys.stdout.flush()
def cloth_noise(ob, scale, strength):
    tex = bpy.data.textures.new(ob.name + "_fold", "CLOUDS"); tex.noise_scale = scale; tex.noise_depth = 1
    d = ob.modifiers.new("fold", "DISPLACE"); d.texture = tex; d.strength = strength; d.mid_level = 0.5; d.texture_coords = "LOCAL"
    apply_mods(ob)
def get_co(ob):
    n = len(ob.data.vertices); co = np.empty(n * 3); ob.data.vertices.foreach_get("co", co); no = np.empty(n * 3); ob.data.vertices.foreach_get("normal", no)
    return co.reshape(-1, 3), no.reshape(-1, 3)
def set_co(ob, co): ob.data.vertices.foreach_set("co", co.reshape(-1)); ob.data.update()
def push(ob, center, radius, vec):
    co, no = get_co(ob); d2 = ((co - np.array(center)) ** 2).sum(1); co += np.exp(-d2 / (2 * radius ** 2))[:, None] * np.array(vec); set_co(ob, co)
def groove(ob, line, radius, depth):
    co, no = get_co(ob); L = np.array([tuple(p) for p in line], float); dmin = np.full(len(co), 1e9)
    for a, b in zip(L[:-1], L[1:]):
        ab = b - a; t = np.clip(((co - a) @ ab) / (ab @ ab), 0, 1); d = np.linalg.norm(co - (a + t[:, None] * ab), axis=1); dmin = np.minimum(dmin, d)
    co -= no * (np.exp(-(dmin / radius) ** 2) * depth)[:, None]; set_co(ob, co)
def hit(obj, origin, direction):
    ok, loc, nor, _ = obj.ray_cast(Vector(origin), Vector(direction).normalized()); return (loc, nor) if ok else (None, None)

# ================================================================ materials
def new_mat(name):
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes.get("Principled BSDF")
def mat(name, color, rough=0.5, metallic=0.0, coat=0.0, sss=0.0, bump=None, sheen=0.0):
    m, N, L, p = new_mat(name)
    p.inputs["Base Color"].default_value = (*color, 1); p.inputs["Roughness"].default_value = rough; p.inputs["Metallic"].default_value = metallic
    if coat: p.inputs["Coat Weight"].default_value = coat; p.inputs["Coat Roughness"].default_value = 0.03
    if sss:
        try:
            p.inputs["Subsurface Weight"].default_value = sss; p.inputs["Subsurface Radius"].default_value = (1.0, 0.35, 0.18); p.inputs["Subsurface Scale"].default_value = 0.012
        except Exception: pass
    if sheen:
        try: p.inputs["Sheen Weight"].default_value = sheen
        except Exception: pass
    if bump:
        scale, strength = bump; tc = N.new("ShaderNodeTexCoord"); nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = scale
        try: nz.inputs["Detail"].default_value = 6
        except Exception: pass
        b = N.new("ShaderNodeBump"); b.inputs["Strength"].default_value = strength
        L.new(tc.outputs["Object"], nz.inputs["Vector"]); L.new(nz.outputs["Fac"], b.inputs["Height"]); L.new(b.outputs["Normal"], p.inputs["Normal"])
    m.diffuse_color = (*color, 1); return m

SKIN   = mat("Kulit", (0.42, 0.235, 0.14), rough=0.52, sss=0.18, bump=(900, 0.04))
SHIRT  = mat("Kemeja", (0.20, 0.33, 0.44), rough=0.8, sheen=0.3, bump=(1400, 0.12))
PANTS  = mat("Celana", (0.045, 0.045, 0.05), rough=0.85, sheen=0.2, bump=(1400, 0.12))
TOWEL  = mat("Handuk", (0.80, 0.78, 0.72), rough=0.95, sheen=0.5, bump=(2200, 0.5))
STRIPE = mat("Handuk_Garis", (0.55, 0.05, 0.05), rough=0.95, bump=(2200, 0.5))
HAIR   = mat("Rambut", (0.22, 0.22, 0.225), rough=0.6, bump=(1800, 0.5))
BROW   = mat("Alis_Kumis", (0.12, 0.12, 0.125), rough=0.65, bump=(2500, 0.5))
SOLE   = mat("Sandal_Alas", (0.78, 0.76, 0.70), rough=0.75, bump=(600, 0.15))
STRAP  = mat("Sandal_Tali", (0.03, 0.12, 0.42), rough=0.45)
NAIL   = mat("Kuku", (0.62, 0.45, 0.36), rough=0.3, coat=0.4)
BUTTON = mat("Kancing", (0.85, 0.84, 0.80), rough=0.3, coat=0.5)
SCLERA = mat("Mata_Putih", (0.86, 0.84, 0.80), rough=0.12, coat=1.0)
IRIS   = mat("Mata_Iris", (0.07, 0.035, 0.018), rough=0.15, coat=1.0)
PUPIL  = mat("Mata_Pupil", (0.0, 0.0, 0.0), rough=0.1, coat=1.0)
LIP    = mat("Bibir", (0.33, 0.16, 0.12), rough=0.42, sss=0.15)
FLOOR  = mat("Studio", (0.16, 0.155, 0.15), rough=0.6)

