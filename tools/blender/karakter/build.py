"""Karakter cerita Narik versi detail tinggi: Mang Ujang, Haji Sobari, Teh Rina, Dimas.

Badan dan mata dari MakeHuman (CC0), dibentuk dengan morf umur/postur/wajah, dipose, lalu diberi pakaian
yang dijatuhkan dengan simulasi kain. Rambut, alis, kumis, bulu mata berupa helai (Curves).
Menghadap -Y, atas +Z, kiri karakter = +X.

    sh tools/blender/karakter/ambil_data.sh          # sekali saja: ambil data MakeHuman
    CHAR=ujang python3 tools/blender/karakter/build.py    # ujang | sobari | rina | dimas

Hasil: art/karakter/blend/<nama>.blend dan art/karakter/glb/<nama>.glb (helai rambut tidak ikut ke GLB).
Variabel lingkungan: CHAR, NOSIM=1 (lewati simulasi kain, untuk mencoba wajah/rambut dengan cepat), OUT (folder hasil),
MPFB_DATA dan MH_EYES (lokasi data MakeHuman kalau tidak di tools/blender/karakter/data).
"""
import os, sys, json, gzip, math
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(HERE, "lib.py")).read())
from mathutils import kdtree
DATA = os.environ.get("MPFB_DATA", os.path.join(HERE, "data", "mpfb2", "src", "mpfb", "data"))
OUTDIR = os.environ.get("OUT", os.path.normpath(os.path.join(HERE, "..", "..", "..", "art", "karakter")))
for d_ in ("blend", "glb"): os.makedirs(os.path.join(OUTDIR, d_), exist_ok=True)
STAGE = int(os.environ.get("STAGE", "9")); SOLE_T = 0.019

UJ_DETAIL = {"arms/{s}-lowerarm-muscle-incr": 0.55, "arms/{s}-upperarm-muscle-incr": 0.30, "legs/{s}-lowerleg-muscle-incr": 0.35, "legs/{s}-upperleg-muscle-incr": 0.20,
             "hands/{s}-hand-fingers-diameter-incr": 0.30, "torso/torso-muscle-pectoral-incr": 0.25, "torso/torso-muscle-dorsi-incr": 0.30, "stomach/stomach-tone-decr": 0.45,
             "stomach/stomach-pregnant-incr": 0.09, "neck/measure-neck-height-incr": 0.08, "head/head-age-incr": 0.45, "head/head-scale-horiz-decr": 0.05, "head/head-scale-depth-decr": 0.03}
CHARS = {
 "ujang": dict(name="MangUjang", sex="male", age={"young": 0.28, "old": 0.72}, mus={"averagemuscle": 0.78, "maxmuscle": 0.22}, wt={"averageweight": 0.8, "maxweight": 0.2}, detail=UJ_DETAIL,
               skin=((0.300, 0.155, 0.085), (0.200, 0.098, 0.054)), wr=0.55, hairline=0.036, brow=1500, brow_mix={"black": 0.8, "grey": 0.2},
               hair=dict(mode="crop", count=34000, top=0.028, side=0.012, part=0.035, vol=0.004, lift=(0.5, 0.08), mix={"softblack": 0.86, "grey": 0.14}), mous_mix={"softblack": 0.5, "grey": 0.5}, stubble=0.30, scalp_dark=0.55, scalp_col=(0.09, 0.085, 0.08),
               face={"expression/units/asian/mouth-corner-puller": 0.22, "eyes/{s}-eye-height2-incr": 0.7, "expression/units/asian/eye-left-opened-up": 0.25, "expression/units/asian/eye-right-opened-up": 0.25, "eyes/{s}-eye-bag-incr": 0.25,
                     "nose/nose-width2-incr": 0.35, "nose/nose-flaring-incr": 0.3, "cheek/{s}-cheek-bones-incr": 0.35, "mouth/mouth-laugh-lines-in": 0.5, "chin/chin-width-incr": 0.25},
               mustache=True, mous_grey=0.33, shirt="kemeja", shirt_col=(0.095, 0.19, 0.285), fr=0.74, sleeve_ease=0.024, hem=0.030, pants_col=(0.045, 0.045, 0.05), towel=True, strap=(0.03, 0.12, 0.42)),
 "sobari": dict(name="HajiSobari", sex="male", age={"young": 0.12, "old": 0.88}, mus={"averagemuscle": 1.0}, wt={"averageweight": 0.35, "maxweight": 0.65},
               detail={"stomach/stomach-tone-decr": 0.6, "stomach/stomach-pregnant-incr": 0.10, "head/head-age-incr": 0.6, "head/head-fat-incr": 0.35, "neck/neck-double-incr": 0.45, "hands/{s}-hand-fingers-diameter-incr": 0.3},
               skin=((0.360, 0.200, 0.120), (0.250, 0.130, 0.075)), wr=0.7, hairline=0.036, brow=1300, brow_mix={"grey": 0.6, "white": 0.4},
               hair=dict(mode="crop", count=14000, top=0.010, side=0.010, vol=0.002, mix={"white": 0.75, "grey": 0.25}), mous_mix={"white": 0.8, "grey": 0.2}, scalp_dark=0.0,
               face={"expression/units/asian/eyebrows-left-down": 0.45, "expression/units/asian/eyebrows-right-down": 0.45, "eyes/{s}-eye-height2-incr": 0.5,
                     "expression/units/asian/mouth-compression": 0.3, "mouth/mouth-angles-down": 0.35, "eyes/{s}-eye-bag-incr": 0.8, "nose/nose-volume-incr": 0.35, "chin/chin-width-incr": 0.4, "mouth/mouth-laugh-lines-in": 0.7},
               mustache=True, mous_grey=0.9, spread=3.0, arm_out=0.17, shirt="koko", shirt_col=(0.50, 0.49, 0.45), fr=1.70, sleeve_ease=0.011, hem=0.090, pants_col=(0.025, 0.025, 0.03), peci=True, strap=(0.05, 0.03, 0.02), sole=(0.07, 0.05, 0.04)),
 "rina": dict(name="TehRina", sex="female", age={"young": 1.0}, mus={"averagemuscle": 0.75, "maxmuscle": 0.25}, wt={"averageweight": 1.0}, detail={},
               skin=((0.360, 0.200, 0.115), (0.260, 0.135, 0.075)), wr=0.0, hairline=0.010, brow=1000, lash=130, lip_col=(0.270, 0.105, 0.095),
               hair=dict(mode="pony", count=34000, mix={"black": 1}), scalp_dark=0.9,
               face={"expression/units/asian/mouth-corner-puller": 0.28, "eyes/{s}-eye-height2-incr": 0.5, "mouth/mouth-lowerlip-volume-incr": 0.35,
                     "mouth/mouth-upperlip-volume-incr": 0.3, "cheek/{s}-cheek-bones-incr": 0.25, "chin/chin-triangle": 0.3, "nose/nose-scale-horiz-decr": 0.25, "eyes/{s}-eye-scale-incr": 0.15, "chin/chin-width-decr": 0.3},
               mustache=False, spread=2.5, arm_out=0.15, shirt="kerja", shirt_col=(0.05, 0.085, 0.075), fr=0.60, sleeve_ease=0.020, hem=0.030, pants_col=(0.035, 0.04, 0.05), strap=(0.02, 0.02, 0.02)),
 "dimas": dict(name="Dimas", sex="male", age={"young": 1.0}, mus={"minmuscle": 0.4, "averagemuscle": 0.6}, wt={"minweight": 0.35, "averageweight": 0.65}, detail={},
               skin=((0.330, 0.180, 0.100), (0.230, 0.120, 0.068)), wr=0.0, hairline=0.026, brow=1500, stubble=0.08,
               hair=dict(mode="fringe", count=36000, top=0.044, side=0.016, part=0.02, vol=0.0045, mix={"black": 1}), scalp_dark=0.9,
               face={"expression/units/asian/mouth-corner-puller": 0.15, "eyes/{s}-eye-height2-incr": 0.5, "chin/chin-prominent-incr": 0.2,
                     "nose/nose-point-up": 0.2, "cheek/{s}-cheek-volume-decr": 0.2},
               mustache=False, spread=2.0, arm_out=0.12, shirt="kaos", shirt_col=(0.52, 0.33, 0.05), fr=0.55, sleeve_ease=0.022, hem=0.020, pants_col=(0.03, 0.06, 0.13), strap=(0.02, 0.02, 0.02)),
}
CID = os.environ.get("CHAR", "ujang"); C = CHARS[CID]; SEX = C["sex"]
def setcol(m, c): m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (*c, 1); m.diffuse_color = (*c, 1)
setcol(SHIRT, C["shirt_col"]); setcol(PANTS, C["pants_col"]); setcol(STRAP, C["strap"])
if "sole" in C: setcol(SOLE, C["sole"])

# ================================================================ 1. mesh dasar + morf
Vmh, VT, FACES = [], [], []; grp = None
for line in open(f"{DATA}/3dobjs/base.obj"):
    if line.startswith("v "): Vmh.append([float(x) for x in line.split()[1:4]])
    elif line.startswith("vt "): VT.append([float(x) for x in line.split()[1:3]])
    elif line.startswith("g "): grp = line.split()[1]
    elif line.startswith("f "):
        vi, ti = [], []
        for tok in line.split()[1:]:
            a = tok.split("/"); vi.append(int(a[0]) - 1); ti.append(int(a[1]) - 1 if len(a) > 1 and a[1] else 0)
        FACES.append((grp, vi, ti))
Vmh = np.array(Vmh)
def target(name, w):
    with gzip.open(f"{DATA}/targets/{name}.target.gz", "rt") as f:
        rows = [ln.split() for ln in f if ln.strip() and not ln.startswith("#")]
    if not rows or not w: return
    arr = np.array(rows, float); Vmh[arr[:, 0].astype(int)] += w * arr[:, 1:4]
for age, wa in C["age"].items():
    target(f"macrodetails/asian-{SEX}-{age}", wa)
    for mu, wm in C["mus"].items():
        for wt, ww in C["wt"].items():
            target(f"macrodetails/universal-{SEX}-{age}-{mu}-{wt}", wa * wm * ww)
            target(f"macrodetails/proportions/{SEX}-{age}-{mu}-{wt}-idealproportions", wa * wm * ww * 0.45)
for k, w_ in list(C["detail"].items()) + list(C.get("face", {}).items()):
    for s_ in (("l", "r") if "{s}" in k else ("",)): target(k.format(s=s_), w_)
P = np.stack([Vmh[:, 0], -Vmh[:, 2], Vmh[:, 1]], axis=1) * 0.1
NB = 13380
P[:, 2] += SOLE_T - P[:NB, 2].min(); P[:, 1] -= np.median(P[:NB, 1])
VG = json.load(open(f"{DATA}/mesh_metadata/basemesh_vertex_groups.json"))
def vg_idx(name): return np.concatenate([np.arange(a, b + 1) for a, b in VG[name]])
JN = [k for k in VG if k.startswith("joint-")]
J = {k: P[vg_idx(k)].mean(0) for k in JN}

# ================================================================ 2. pose (linear blend skinning dengan bobot rig MakeHuman)
RIG = json.load(open(f"{DATA}/rigs/standard/rig.default.json")); WJ = json.load(open(f"{DATA}/rigs/standard/weights.default.json"))["weights"]
children = {}
for b, d in RIG.items(): children.setdefault(d["parent"], []).append(b)
def desc(b):
    out = [b]
    for c in children.get(b, []): out += desc(c)
    return out
def chainw(b):
    w = np.zeros(len(P))
    for d in desc(b):
        if d in WJ and WJ[d]: a = np.array(WJ[d]); w[a[:, 0].astype(int)] += a[:, 1]
    return np.clip(w, 0, 1)
def rotate(bone, axis, ang):
    piv = Vector(J[RIG[bone]["head"]["cube_name"]]); R = np.array(Matrix.Rotation(ang, 3, Vector(axis).normalized())); pv = np.array(piv)
    w = chainw(bone); P[:] = P + w[:, None] * ((P - pv) @ R.T + pv - P)
    ds = desc(bone); moved = set()
    for d in ds:
        hc = RIG[d]["head"].get("cube_name"); tc = RIG[d]["tail"].get("cube_name")
        if d != bone and hc: moved.add(hc)
        if tc: moved.add(tc)
    for j in moved: J[j] = (J[j] - pv) @ R.T + pv
for L, sx in (("l", 1), ("r", -1)):
    S, E = Vector(J[f"joint-{L}-shoulder"]), Vector(J[f"joint-{L}-elbow"]); cur = (E - S).normalized(); tgt = Vector((sx * C.get("arm_out", 0.105), 0.035, -1)).normalized()
    rotate(f"upperarm01.{L.upper()}", cur.cross(tgt), cur.angle(tgt))
    E, Wr = Vector(J[f"joint-{L}-elbow"]), Vector(J[f"joint-{L}-hand"]); cur = (Wr - E).normalized()
    rotate(f"lowerarm01.{L.upper()}", cur.cross(Vector((0, -1, 0))), math.radians(-15))
    Wr = Vector(J[f"joint-{L}-hand"]); cur = (Vector(J[f"joint-{L}-finger-3-1"]) - Wr).normalized(); dn = Vector((0, -0.12, -1)).normalized()
    rotate(f"wrist.{L.upper()}", cur.cross(dn), min(cur.angle(dn), math.radians(24)))
    Wr = Vector(J[f"joint-{L}-hand"]); a = Vector(J[f"joint-{L}-finger-5-1"]) - Vector(J[f"joint-{L}-finger-2-1"]); b = Vector(J[f"joint-{L}-finger-3-1"]) - Wr
    npalm = a.cross(b).normalized() * sx
    for n in (2, 3, 4, 5):
        for k, ang in ((1, 10), (2, 16), (3, 10)):
            h = Vector(J[f"joint-{L}-finger-{n}-{k}"]); t = Vector(J[f"joint-{L}-finger-{n}-{k + 1}"]); d = (t - h).normalized()
            rotate(f"finger{n}-{k}.{L.upper()}", d.cross(npalm), math.radians(ang * (1 + 0.12 * (n - 2))))
    print(L, "palm normal", [round(v, 2) for v in npalm])

SPREAD = math.radians(C.get("spread", 0.0))
if SPREAD:
    for L, sx in (("l", 1), ("r", -1)):
        rotate(f"upperleg01.{L.upper()}", (0, 1, 0), -sx * SPREAD); rotate(f"foot.{L.upper()}", (0, 1, 0), sx * SPREAD)
    dz_ = SOLE_T - P[:NB, 2].min(); P[:, 2] += dz_
    for k_ in J: J[k_] = J[k_] + np.array([0, 0, dz_])
B = P[:NB]
ARM = {L: chainw(f"upperarm01.{L.upper()}")[:NB] for L in "lr"}; LEG = {L: chainw(f"upperleg01.{L.upper()}")[:NB] for L in "lr"}
FOOT = {L: chainw(f"foot.{L.upper()}")[:NB] for L in "lr"}; HD = chainw("neck01")[:NB]
A_all = ARM["l"] + ARM["r"]; L_all = LEG["l"] + LEG["r"]
zS = (J["joint-l-shoulder"][2] + J["joint-r-shoulder"][2]) / 2; zH = (J["joint-l-upper-leg"][2] + J["joint-r-upper-leg"][2]) / 2
zN = J["joint-neck"][2]; zAnk = (J["joint-l-ankle"][2] + J["joint-r-ankle"][2]) / 2; xSh = J["joint-l-shoulder"][0]
EYE = {sx: P[vg_idx(f"helper-{L}-eye")].mean(0) for L, sx in (("l", 1), ("r", -1))}
EYE_R = float(np.linalg.norm(P[vg_idx("helper-l-eye")] - EYE[1], axis=1).mean())
HEIGHT = B[:, 2].max(); print("height %.3f  shoulder z %.3f  hip z %.3f  neck z %.3f  eye r %.4f" % (HEIGHT, zS, zH, zN, EYE_R))
# leher
core = A_all < 0.2; scan = []
for z in np.arange(zS + 0.03, zS + 0.20, 0.004):
    sel = core & (np.abs(B[:, 2] - z) < 0.006)
    if sel.sum() > 8: scan.append((z, float(np.abs(B[sel, 0]).max()), float(B[sel, 1].min()), float(B[sel, 1].max())))
i_n = int(np.argmin([c[1] for c in scan])); z_nar, nrx, y0n, y1n = scan[i_n]; nr = nrx + 0.004; ncy = y1n - nr
i_f = i_n
while i_f > 0 and scan[i_f][1] < nrx + 0.018: i_f -= 1
z_top = scan[i_f][0] - 0.020; print("neck narrow z %.3f rx %.3f ry %.3f" % (z_nar, nrx, (y1n - y0n) / 2))
print("neck r %.3f cy %.3f z_top %.3f" % (nr, ncy, z_top))

# ================================================================ 3. pakaian: dibentuk dari permukaan badan lalu disimulasikan sebagai kain
zK = (J["joint-l-knee"][2] + J["joint-r-knee"][2]) / 2
z_cr = float(B[(np.abs(B[:, 0]) < 0.006) & (B[:, 2] > zK + 0.1), 2].min()); z_hem = z_cr + 0.060; print("crotch z %.3f (hip joint %.3f)" % (z_cr, zH)); z_phem = zAnk + 0.022; FR = C["fr"]
SL = {}; arm_low = np.zeros(NB, bool); arm_edge = np.zeros(NB, bool)
for L in "lr":
    S, E = Vector(J[f"joint-{L}-shoulder"]), Vector(J[f"joint-{L}-elbow"]); u = np.array((E - S).normalized()); ln = (E - S).length; t = (B - np.array(S)) @ u
    SL[L] = (S, u, ln, t); arm_low |= (ARM[L] > 0.5) & (t > FR * ln); arm_edge |= (ARM[L] > 0.5) & (t > FR * ln - 0.045)
NK = 0.50 if C["shirt"] == "kaos" else 0.86
shirt_reg = (HD < NK) & (B[:, 2] > z_hem) & ~arm_low
pants_reg = (B[:, 2] < zH + 0.105) & (B[:, 2] > z_phem) & (A_all < 0.5)
cov_shirt = shirt_reg & (HD < (0.22 if C["shirt"] == "kaos" else 0.55)) & ~arm_edge
cov_pants = (B[:, 2] < zH + 0.060) & (B[:, 2] > z_phem + 0.04) & (A_all < 0.5)
body_all = [(vi, ti) for g, vi, ti in FACES if g == "body"]
nme = bpy.data.meshes.new("NrmTmp"); nme.from_pydata([tuple(p) for p in B], [], [f[0] for f in body_all]); nme.update()
NRM = np.empty(NB * 3); nme.vertices.foreach_get("normal", NRM); NRM = NRM.reshape(-1, 3); bpy.data.meshes.remove(nme)
HAND = chainw("wrist.L")[:NB] + chainw("wrist.R")[:NB]          # tangan tidak ikut ditabrak kain, supaya kain tidak tersangkut
cme = bpy.data.meshes.new("Collider"); cme.from_pydata([tuple(p) for p in B], [], [f[0] for f in body_all if not all(HAND[i] > 0.5 for i in f[0])]); cme.update()
collider = bpy.data.objects.new("Collider", cme); col.objects.link(collider)
cs_ = collider.modifiers.new("ss", "SUBSURF"); cs_.levels = 1; apply_mods(collider)
collider.modifiers.new("Collision", "COLLISION"); collider.collision.thickness_outer = 0.0015; collider.collision.cloth_friction = 12
def sstep(a, b, v): t_ = np.clip((v - a) / (b - a), 0, 1); return t_ * t_ * (3 - 2 * t_)
ease_s = 0.009 + 0.012 * sstep(zS - 0.08, zS - 0.22, B[:, 2])
for L, sx in (("l", 1), ("r", -1)):
    S, u, ln, t = SL[L]; lat = np.clip((NRM[:, 0] * sx + 1) / 1.2, 0, 1)
    sl_e = 0.009 + C["sleeve_ease"] * sstep(0.05 * ln, FR * ln, t) * (0.25 + 0.75 * lat); aw = np.clip((ARM[L] - 0.2) / 0.4, 0, 1); ease_s = ease_s * (1 - aw) + sl_e * aw
ease_p = np.interp(B[:, 2], [z_phem, zK, zH - 0.06, zH + 0.10], [0.030, 0.026, 0.018, 0.007])

def shape_shirt(Vg, src):
    """Potongan lurus: tiap irisan badan diganti selubung terluar dari irisan di atasnya, seperti kain yang menggantung."""
    tor = A_all[src] < 0.35; yc = float(np.median(Vg[tor, 1])); zt0, zt1 = z_hem - 0.01, zS - 0.03; NZ = int((zt1 - zt0) / 0.01) + 1; NT = 48
    th = np.arctan2(Vg[:, 0], Vg[:, 1] - yc); r = np.hypot(Vg[:, 0], Vg[:, 1] - yc)
    zb = np.clip(((Vg[:, 2] - zt0) / 0.01).astype(int), 0, NZ - 1); tb = ((th + PI) / (2 * PI) * NT).astype(int) % NT
    R = np.zeros((NZ, NT)); sel = tor & (Vg[:, 2] > zt0) & (Vg[:, 2] < zt1); np.maximum.at(R, (zb[sel], tb[sel]), r[sel])
    for i in range(NZ):
        nz = R[i] > 0
        if nz.sum() >= 6: R[i] = np.interp(np.arange(NT), np.where(nz)[0], R[i][nz], period=NT)
        elif i > 0: R[i] = R[i - 1]
    Rm = np.max([np.roll(R, k, axis=1) for k in range(-2, 3)], axis=0); Rm = (np.roll(Rm, 1, axis=1) + 2 * Rm + np.roll(Rm, -1, axis=1)) / 4
    i_ch = min(NZ - 1, int((zS - 0.10 - zt0) / 0.01)); Renv = Rm.copy()
    for i in range(i_ch - 1, -1, -1): Renv[i] = np.maximum(Renv[i], Renv[i + 1])
    Renv[1:-1] = (Renv[:-2] + 2 * Renv[1:-1] + Renv[2:]) / 4
    fz = np.clip((Vg[:, 2] - zt0) / 0.01 - 0.5, 0, NZ - 1.001); i0 = fz.astype(int); a = fz - i0
    ft = ((th + PI) / (2 * PI) * NT - 0.5) % NT; j0 = ft.astype(int) % NT; b = ft - np.floor(ft); j1 = (j0 + 1) % NT
    tgt = (1 - a) * (1 - b) * Renv[i0, j0] + (1 - a) * b * Renv[i0, j1] + a * (1 - b) * Renv[i0 + 1, j0] + a * b * Renv[i0 + 1, j1]
    wt = np.clip((0.35 - A_all[src]) / 0.15, 0, 1) * np.clip((zt1 - Vg[:, 2]) / 0.03, 0, 1)
    wt *= np.where(Vg[:, 2] > zS - 0.10, np.clip((0.80 - np.abs(np.sin(th))) / 0.15, 0, 1), 1.0)
    cap = 0.016 + 0.05 * np.clip((0.92 - np.abs(np.sin(th))) / 0.25, 0, 1)
    sc = (r + np.minimum(np.maximum(r, tgt) - r, cap) * wt) / np.maximum(r, 1e-6); Vg[:, 0] *= sc; Vg[:, 1] = yc + (Vg[:, 1] - yc) * sc
def shape_pants(Vg, src):
    """Celana lurus: pipa kaki dilebarkan jadi tabung dari paha ke mata kaki."""
    for L, sx in (("l", 1), ("r", -1)):
        Hj, Kn, An = J[f"joint-{L}-upper-leg"], J[f"joint-{L}-knee"], J[f"joint-{L}-ankle"]
        m = np.where((LEG[L][src] > 0.5) & (Vg[:, 2] < z_cr + 0.03))[0]; z = Vg[m, 2]
        ax = np.interp(z, [An[2], Kn[2], Hj[2]], [An[0], Kn[0], Hj[0]]); ay = np.interp(z, [An[2], Kn[2], Hj[2]], [An[1] - 0.012, Kn[1], Hj[1]])
        dx = Vg[m, 0] - ax; dy = Vg[m, 1] - ay; r = np.hypot(dx, dy); top = (z > z_cr - 0.05) & (z < z_cr)
        r_th = float(np.percentile(r[top], 85)) if top.sum() > 5 else 0.095
        r_t = np.interp(z, [z_phem, Kn[2], z_cr], [0.071, 0.081, r_th]); w = sstep(z_cr + 0.03, z_cr - 0.07, z)
        sc = (r + (np.maximum(r, r_t) - r) * w) / np.maximum(r, 1e-6); x = ax + dx * sc
        Vg[m, 0] = sx * np.maximum(sx * x, 0.005); Vg[m, 1] = ay + dy * sc
def garment(name, reg, ease, material, hem=None, flat=None, bridge=None, shape=None):
    mp, Vg, Fg = {}, [], []
    for vi, ti in body_all:
        if all(reg[i] for i in vi):
            f_ = []
            for i in vi:
                if i not in mp: mp[i] = len(Vg); Vg.append(B[i] + NRM[i] * ease[i])
                f_.append(mp[i])
            Fg.append(f_)
    Vg = np.array(Vg)
    if shape: shape(Vg, np.array(list(mp.keys())))
    if bridge:                                   # jembatani lekukan tengah (belahan pantat, selangkangan) supaya kain tidak ikut masuk
        z0b, z1b, wb = bridge; ymid = float(np.median(Vg[:, 1]))
        for zb in np.arange(z0b, z1b, 0.008):
            sl = (np.abs(Vg[:, 2] - zb) < 0.008) & (np.abs(Vg[:, 0]) < 2.2 * wb)
            for sgn in (1, -1):
                side = sl & ((Vg[:, 1] - ymid) * sgn > 0.02)
                if side.sum() < 4: continue
                ext = (Vg[side, 1] * sgn).max() * sgn; idx = np.where(side & (np.abs(Vg[:, 0]) < wb))[0]
                wgt = (1 - np.abs(Vg[idx, 0]) / wb) ** 0.5
                Vg[idx, 1] += (ext - Vg[idx, 1]) * wgt * 0.9
    ob = mesh_obj(name, Vg, Fg, material); bm = bmesh.new(); bm.from_mesh(ob.data)
    if flat:
        for v in bm.verts:
            if v.is_boundary: flat(v)
    nk = [v for v in bm.verts if v.is_boundary and v.co.z > zS + 0.03]              # haluskan garis leher
    if nk:
        cz_ = np.array([tuple(v.co) for v in nk]); Aq = np.c_[cz_[:, 0], cz_[:, 1], np.ones(len(nk))]; pl_ = np.linalg.lstsq(Aq, cz_[:, 2], rcond=None)[0]
        for v in nk: v.co.z = 0.3 * v.co.z + 0.7 * float(pl_[0] * v.co.x + pl_[1] * v.co.y + pl_[2])
        for _ in range(6):
            newc = {}
            for v in nk:
                nb_ = [e.other_vert(v) for e in v.link_edges if e.is_boundary]
                if len(nb_) == 2: newc[v] = (v.co * 2 + nb_[0].co + nb_[1].co) / 4
            for v, c_ in newc.items(): v.co = c_
    if hem:
        zlim, steps, dz = hem; cur = [e for e in bm.edges if e.is_boundary and all(v.co.z < zlim for v in e.verts)]
        for _ in range(steps):
            ret = bmesh.ops.extrude_edge_only(bm, edges=cur); nv_ = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMVert)]
            for v in nv_: v.co.z -= dz
            cur = [g for g in ret["geom"] if isinstance(g, bmesh.types.BMEdge)]
    for _ in range(3): bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(ob.data); bm.free()
    m_ = ob.modifiers.new("ss", "SUBSURF"); m_.levels = 1; apply_mods(ob); return ob
def flat_shirt(v):
    if v.co.z < z_hem + 0.04 and abs(v.co.x) < xSh + 0.03 and v.co.z < zH + 0.02: v.co.z = z_hem + 0.004; return
    if v.co.z > zS + 0.03: return
    S, u, ln, t = SL["l" if v.co.x > 0 else "r"]; d_ = (np.array(v.co) - np.array(S)) @ u
    if d_ > 0.3 * ln: v.co = Vector(np.array(v.co) - u * (d_ - FR * ln))
def flat_pants(v):
    if v.co.z > zH: v.co.z = zH + 0.100
    elif v.co.z < z_phem + 0.06: v.co.z = z_phem
shirt = garment("Kemeja", shirt_reg, ease_s, SHIRT, hem=(z_hem + 0.04, 5, (z_hem - (z_cr - C["hem"])) / 5), flat=flat_shirt, bridge=(z_hem - 0.01, zH + 0.13, 0.060), shape=shape_shirt)
pants = garment("Celana", pants_reg, ease_p, PANTS, flat=flat_pants, bridge=(zH - 0.10, zH + 0.06, 0.055), shape=shape_pants)
def boundary_verts(ob, zmin):
    bm = bmesh.new(); bm.from_mesh(ob.data); out = sorted({v.index for e in bm.edges if e.is_boundary for v in e.verts if v.co.z > zmin}); cs = [tuple(bm.verts[i].co) if False else None for i in ()]; bm.verts.ensure_lookup_table()
    pts = [bm.verts[i].co.copy() for i in out]; bm.free(); return out, pts
def pin_group(ob, weights):
    g = ob.vertex_groups.new(name="pin"); idx = [int(i) for i in np.where(weights > 0.5)[0]]
    if idx: g.add(idx, 1.0, "REPLACE")
cs_co, _ = get_co(shirt); nb_i, nb_p = boundary_verts(shirt, zS + 0.03)
kdn = kdtree.KDTree(len(nb_p))
for i, p_ in enumerate(nb_p): kdn.insert(p_, i)
kdn.balance(); pin_group(shirt, np.array([1.0 if kdn.find(Vector(c))[2] < 0.022 else 0.0 for c in cs_co]))
cp_co, _ = get_co(pants); pin_group(pants, (cp_co[:, 2] > zH + 0.072).astype(float))
print("garment verts: shirt %d pants %d, neck ring %d" % (len(cs_co), len(cp_co), len(nb_i)))
NOSIM = bool(os.environ.get("NOSIM")); FRAMES = 0 if NOSIM else int(os.environ.get("FRAMES", "60")); CACHE = os.path.join(OUTDIR, f".sim_cache_{CID}.npz")
if os.environ.get("REUSE") and os.path.exists(CACHE):
    cz = np.load(CACHE)
    if len(cz["shirt"]) == len(cs_co) and len(cz["pants"]) == len(cp_co): set_co(shirt, cz["shirt"]); set_co(pants, cz["pants"]); FRAMES = 0; print("sim cache reused")
def run_sim(ob, stiff, bend):
    m_ = ob.modifiers.new("Cloth", "CLOTH"); st = m_.settings; st.quality = 8; st.mass = 0.25; st.vertex_group_mass = "pin"
    st.tension_stiffness = stiff; st.compression_stiffness = stiff; st.shear_stiffness = stiff * 0.4; st.bending_stiffness = bend; st.air_damping = 2.0
    st.tension_damping = 6; st.compression_damping = 6; st.bending_damping = 0.5
    cc = m_.collision_settings; cc.use_collision = True; cc.distance_min = 0.002; cc.collision_quality = 4; cc.use_self_collision = False; cc.friction = 15
    m_.point_cache.frame_start = 1; m_.point_cache.frame_end = FRAMES; scene.frame_start = 1; scene.frame_end = FRAMES
    scene.frame_set(0)
    for f_ in range(1, FRAMES + 1): scene.frame_set(f_)
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get()); n_ = len(ev.data.vertices); c_ = np.empty(n_ * 3); ev.data.vertices.foreach_get("co", c_); old, _ = get_co(ob)
    mv = np.linalg.norm(c_.reshape(-1, 3) - old, axis=1); print(ob.name, "sim move mean %.4f max %.4f nan %s" % (mv.mean(), mv.max(), np.isnan(c_).any())); sys.stdout.flush()
    ob.modifiers.remove(ob.modifiers["Cloth"]); set_co(ob, c_.reshape(-1, 3)); scene.frame_set(0)
if FRAMES:
    shirt.hide_viewport = True; run_sim(pants, 20, 0.8); shirt.hide_viewport = False
    pants.modifiers.new("Collision", "COLLISION"); pants.collision.thickness_outer = 0.004; pants.collision.cloth_friction = 10
    run_sim(shirt, 16, 0.25); pants.modifiers.remove(pants.modifiers["Collision"])
if FRAMES: np.savez(CACHE, shirt=get_co(shirt)[0], pants=get_co(pants)[0])
_, NECK_PTS = boundary_verts(shirt, zS + 0.03); NECK_PTS = np.array([tuple(p) for p in NECK_PTS])
shirt_px = None
if C.get("towel"):                      # salinan kemeja satu lapis, untuk ditabrak handuk
    shirt_px = shirt.copy(); shirt_px.data = shirt.data.copy(); shirt_px.name = "KemejaProxy"; col.objects.link(shirt_px)
    spm = shirt_px.modifiers.new("sm", "SMOOTH"); spm.factor = 0.5; spm.iterations = 2; apply_mods(shirt_px)
for ob in (shirt, pants):
    sm_ = ob.modifiers.new("sm", "SMOOTH"); sm_.factor = 0.5; sm_.iterations = 2
    so_ = ob.modifiers.new("so", "SOLIDIFY"); so_.thickness = 0.0016; so_.offset = 1
    s2_ = ob.modifiers.new("ss", "SUBSURF"); s2_.levels = 1; apply_mods(ob); shade(ob); print(ob.name, "faces:", len(ob.data.polygons))

# ================================================================ 4. objek badan
body_faces = body_all
me = bpy.data.meshes.new("Badan"); me.from_pydata([tuple(p) for p in B], [], [f[0] for f in body_faces]); me.update()
uvl = me.uv_layers.new(name="UVMap"); k = 0
for vi, ti in body_faces:
    for t_ in ti: uvl.data[k].uv = VT[t_]; k += 1
body = bpy.data.objects.new("Badan", me); col.objects.link(body)
for gname, arr in (("tutup_baju", cov_shirt), ("tutup_celana", cov_pants)):
    g_ = body.vertex_groups.new(name=gname); g_.add([int(i) for i in np.where(arr)[0]], 1.0, "REPLACE")
ss = body.modifiers.new("ss", "SUBSURF"); ss.levels = 2; ss.render_levels = 2; apply_mods(body); shade(body)
for gname in ("tutup_baju", "tutup_celana"):
    mk = body.modifiers.new("Mask_" + gname, "MASK"); mk.vertex_group = gname; mk.invert_vertex_group = True; mk.threshold = 0.6
print("Badan faces:", len(body.data.polygons))

# ---- material kulit
def skin_material():
    m, N, Lk, p = new_mat("Kulit_Realistis")
    def img(name):
        im = bpy.data.images.load(f"{DATA}/textures/{name}"); im.colorspace_settings.name = "Non-Color"; n = N.new("ShaderNodeTexImage"); n.image = im; return n.outputs["Color"]
    def math_(op, a, b):
        n = N.new("ShaderNodeMath"); n.operation = op
        for i, v in enumerate((a, b)):
            if isinstance(v, (int, float)): n.inputs[i].default_value = v
            else: Lk.new(v, n.inputs[i])
        return n.outputs[0]
    def mix(fac, a, b):
        n = N.new("ShaderNodeMix"); n.data_type = "RGBA"
        if isinstance(fac, (int, float)): n.inputs[0].default_value = fac
        else: Lk.new(fac, n.inputs[0])
        for i, v in ((6, a), (7, b)):
            if isinstance(v, tuple): n.inputs[i].default_value = (*v, 1)
            else: Lk.new(v, n.inputs[i])
        return n.outputs[2]
    tc = N.new("ShaderNodeTexCoord")
    def noise(scale, detail=4):
        n = N.new("ShaderNodeTexNoise"); n.inputs["Scale"].default_value = scale; n.inputs["Detail"].default_value = detail; Lk.new(tc.outputs["Object"], n.inputs["Vector"]); return n.outputs["Fac"]
    lips, face, ears, lids = img("mpfb_lips.jpg"), img("mpfb_face.jpg"), img("mpfb_ears.jpg"), img("mpfb_eyelids.jpg")
    nails = math_("ADD", img("mpfb_fingernails.jpg"), img("mpfb_toenails.jpg"))
    c = mix(math_("MULTIPLY", noise(22, 5), 0.75), (0.300, 0.155, 0.085), (0.200, 0.098, 0.054))
    c = mix(math_("MULTIPLY", noise(160, 6), 0.35), c, (0.200, 0.100, 0.060))
    c = mix(math_("MULTIPLY", face, 0.28), c, (0.360, 0.165, 0.105))
    c = mix(math_("MULTIPLY", ears, 0.40), c, (0.330, 0.130, 0.090))
    c = mix(math_("MULTIPLY", lids, 0.50), c, (0.190, 0.100, 0.065))
    c = mix(math_("MULTIPLY", lips, 0.85), c, C.get("lip_col", (0.250, 0.095, 0.075)))
    c = mix(math_("MULTIPLY", nails, 0.80), c, (0.520, 0.360, 0.280))
    def attr(nm):
        n = N.new("ShaderNodeAttribute"); n.attribute_name = nm; return n.outputs["Fac"]
    c = mix(math_("MULTIPLY", math_("MULTIPLY", attr("m_stubble"), math_("SUBTRACT", 1.0, lips)), math_("ADD", 0.55, math_("MULTIPLY", noise(1400, 2), 0.9))), c, C.get("stubble_col", (0.10, 0.085, 0.075)))
    c = mix(attr("m_scalp"), c, C.get("scalp_col", (0.035, 0.028, 0.024)))
    Lk.new(c, p.inputs["Base Color"])
    Lk.new(math_("SUBTRACT", math_("ADD", 0.47, math_("MULTIPLY", noise(90, 3), 0.12)), math_("MULTIPLY", nails, 0.25)), p.inputs["Roughness"])
    try:
        p.inputs["Subsurface Weight"].default_value = 0.16; p.inputs["Subsurface Radius"].default_value = (1.0, 0.36, 0.2); p.inputs["Subsurface Scale"].default_value = 0.010
    except Exception: pass
    b1 = N.new("ShaderNodeBump"); b1.inputs["Strength"].default_value = 0.10; b1.inputs["Distance"].default_value = 0.0006; Lk.new(noise(2600, 3), b1.inputs["Height"])
    b2 = N.new("ShaderNodeBump"); b2.inputs["Strength"].default_value = 0.20; b2.inputs["Distance"].default_value = 0.0015; Lk.new(noise(420, 6), b2.inputs["Height"]); Lk.new(b1.outputs["Normal"], b2.inputs["Normal"])
    vo = N.new("ShaderNodeTexVoronoi"); vo.feature = "DISTANCE_TO_EDGE"; vo.inputs["Scale"].default_value = 520; Lk.new(tc.outputs["Object"], vo.inputs["Vector"])
    b3 = N.new("ShaderNodeBump"); b3.inputs["Strength"].default_value = 0.07; b3.inputs["Distance"].default_value = 0.0008; Lk.new(vo.outputs["Distance"], b3.inputs["Height"]); Lk.new(b2.outputs["Normal"], b3.inputs["Normal"])
    Lk.new(b3.outputs["Normal"], p.inputs["Normal"]); m.diffuse_color = (0.33, 0.18, 0.105, 1); return m
SKINR = skin_material(); body.data.materials.append(SKINR)

# ---- mata: mesh mata MakeHuman (CC0) dipasang lewat tabel mhclo, dengan tekstur iris
EYEDIR = os.environ.get("MH_EYES", os.path.join(HERE, "data", "makehuman", "makehuman", "data", "eyes"))
def load_mhclo(path):
    sc = {}; rows = []; inv = False
    for ln in open(path):
        tk = ln.split()
        if not tk or tk[0].startswith("#"): continue
        if tk[0] in ("x_scale", "y_scale", "z_scale"): sc[tk[0][0]] = (int(tk[1]), int(tk[2]), float(tk[3])); continue
        if tk[0] == "verts": inv = True; continue
        if inv:
            try: vals = [float(v) for v in tk]
            except ValueError: inv = False; continue
            rows.append(vals)
    ax = {"x": 0, "y": 1, "z": 2}; S3 = np.ones(3)
    for k_, (i, j, den) in sc.items(): S3[ax[k_]] = abs(Vmh[i][ax[k_]] - Vmh[j][ax[k_]]) / den
    out = []
    for r_ in rows:
        if len(r_) == 1: out.append(P[int(r_[0])].copy()); continue
        i0, i1, i2 = int(r_[0]), int(r_[1]), int(r_[2]); off = np.array(r_[6:9]) * S3
        out.append(P[i0] * r_[3] + P[i1] * r_[4] + P[i2] * r_[5] + np.array([off[0], -off[2], off[1]]) * 0.1)
    return np.array(out)
EV = load_mhclo(f"{EYEDIR}/high-poly/high-poly.mhclo"); EUV, EF, EFT = [], [], []
for ln in open(f"{EYEDIR}/high-poly/high-poly.obj"):
    if ln.startswith("vt "): EUV.append([float(v) for v in ln.split()[1:3]])
    elif ln.startswith("f "):
        tk = [t.split("/") for t in ln.split()[1:]]; EF.append([int(t[0]) - 1 for t in tk]); EFT.append([int(t[1]) - 1 for t in tk])
eme = bpy.data.meshes.new("Mata"); eme.from_pydata([tuple(v) for v in EV], [], EF); eme.update(); euv = eme.uv_layers.new(name="UVMap"); k = 0
for ft in EFT:
    for t_ in ft: euv.data[k].uv = EUV[t_]; k += 1
eyes_ob = bpy.data.objects.new("Mata", eme); col.objects.link(eyes_ob)
EM, N_, Lk_, p_ = new_mat("Mata_Tekstur"); eimg = bpy.data.images.load(f"{EYEDIR}/materials/brown_eye.png"); tex = N_.new("ShaderNodeTexImage"); tex.image = eimg
mxe = N_.new("ShaderNodeMix"); mxe.data_type = "RGBA"; mxe.blend_type = "MULTIPLY"; mxe.inputs[0].default_value = 1.0; mxe.inputs[7].default_value = (*C.get("eye_tint", (0.62, 0.52, 0.46)), 1)
Lk_.new(tex.outputs["Color"], mxe.inputs[6]); Lk_.new(mxe.outputs[2], p_.inputs["Base Color"]); p_.inputs["Roughness"].default_value = 0.30
CM, N2, L2, p2 = new_mat("Mata_Kornea"); out2 = N2.get("Material Output"); N2.remove(p2)
tr2 = N2.new("ShaderNodeBsdfTransparent"); gl2 = N2.new("ShaderNodeBsdfGlossy"); gl2.inputs["Roughness"].default_value = 0.02; lw2 = N2.new("ShaderNodeLayerWeight"); lw2.inputs["Blend"].default_value = 0.025; mx2 = N2.new("ShaderNodeMixShader")
mx2.inputs[0].default_value = 0.022; L2.new(tr2.outputs[0], mx2.inputs[1]); L2.new(gl2.outputs[0], mx2.inputs[2]); L2.new(mx2.outputs[0], out2.inputs["Surface"])
eme.materials.append(EM); eme.materials.append(CM); ncor = 0
for pl, ft in zip(eme.polygons, EFT):
    uvc = np.mean([EUV[t_] for t_ in ft], axis=0)
    if uvc[0] > 0.80 and uvc[1] < 0.20: pl.material_index = 1; ncor += 1
print("eye verts %d faces %d cornea faces %d" % (len(EV), len(EF), ncor))
es = eyes_ob.modifiers.new("ss", "SUBSURF"); es.levels = 1; apply_mods(eyes_ob); shade(eyes_ob)

# ---- rambut, alis, kumis (partikel rambut)
ez = (EYE[1][2] + EYE[-1][2]) / 2; ey = EYE[1][1]; ex = abs(EYE[1][0])
def onf(x, z):
    p_, n_ = hit(body, (x, -1.0, z), (0, 1, 0)); return p_ if p_ else Vector((x, ey, z))
def prof(z): return onf(0, z).y
zz = np.arange(ez - 0.012, ez - 0.115, -0.001); yy = np.array([prof(z) for z in zz])
i_tip = int(np.argmin(yy[:70])); i = i_tip
while i < len(yy) - 2 and yy[i + 1] >= yy[i]: i += 1
i_sub = i
while i < len(yy) - 2 and yy[i + 1] <= yy[i]: i += 1
i_ul = i
while i < len(yy) - 2 and yy[i + 1] >= yy[i]: i += 1
i_st = i
z_tip, z_sub, z_ul, z_st = zz[i_tip], zz[i_sub], zz[i_ul], zz[i_st]; print("nose tip z %.3f subnasal %.3f upper lip %.3f mouth %.3f (eye %.3f)" % (z_tip, z_sub, z_ul, z_st, ez))
WR = C["wr"]; _groove = groove
def groove(ob, line, radius, depth):
    if WR > 0: _groove(ob, line, radius, depth * WR)
for dz_, w_ in ((0.040, 0.040), (0.052, 0.046), (0.064, 0.042)):
    groove(body, [onf(x, ez + dz_ + 0.002 * math.cos(x * 45)) for x in np.linspace(-w_, w_, 11)], 0.0022, 0.0011)
for sx in (1, -1):
    groove(body, [onf(sx * 0.021, z_tip - 0.004), onf(sx * 0.030, z_sub - 0.008), onf(sx * 0.036, z_st - 0.003)], 0.0038, 0.0024)
    groove(body, [onf(sx * 0.031, z_st - 0.005), onf(sx * 0.035, z_st - 0.022)], 0.0030, 0.0012)
    groove(body, [onf(sx * (ex - 0.015), ez - 0.014), onf(sx * ex, ez - 0.0185), onf(sx * (ex + 0.015), ez - 0.0145)], 0.0024, 0.0012)
    for dz_ in (0.005, 0.0, -0.005):
        groove(body, [onf(sx * (ex + 0.021), ez + dz_), onf(sx * (ex + 0.031), ez + dz_ * 2.2)], 0.0012, 0.00045)
groove(body, [onf(-0.006, ez + 0.012), onf(-0.007, ez + 0.030)], 0.0018, 0.0009); groove(body, [onf(0.006, ez + 0.012), onf(0.007, ez + 0.030)], 0.0018, 0.0009)
body.data.update(); shade(body)
co, no = get_co(body); nv = len(co)
kd = kdtree.KDTree(len(vg_idx("helper-hair")))
for i, p_ in enumerate(P[vg_idx("helper-hair")]): kd.insert(Vector(p_), i)
kd.balance()
headsel = np.where(co[:, 2] > ez - 0.09)[0]
dh = np.full(nv, 1.0)
for i in headsel: dh[i] = kd.find(Vector(co[i]))[2]
top = dh[co[:, 2] > ez + 0.085]; d0 = float(np.median(top)); print("hair helper dist median %.4f" % d0)
fwd = ey - co[:, 1]                                             # >0 = di depan bola mata
scalp = np.clip((d0 * 1.9 - dh) / (d0 * 0.6), 0, 1)
scalp *= np.clip((co[:, 2] - (ez + C["hairline"] + 0.9 * np.clip(fwd + 0.02, 0, 1))) / 0.008, 0, 1)        # garis rambut depan agak mundur
scalp[(np.abs(co[:, 0]) > ex + 0.028) & (co[:, 2] < ez + 0.030) & (fwd > -0.075)] = 0             # jangan tumbuh di telinga
z_rim = ez + 0.047
if C.get("peci"): scalp[co[:, 2] > z_rim - 0.003] = 0
front = (no[:, 1] < -0.2) & (fwd > -0.03)
brow = np.zeros(nv); mous = np.zeros(nv)
for sx in (1, -1):
    xs_ = co[:, 0] * sx; arc = ez + 0.0235 + 0.0065 * np.clip(1 - ((xs_ - ex - 0.002) / 0.026) ** 2, -1, 1)
    inx = np.clip((xs_ - (ex - 0.022)) / 0.004, 0, 1) * np.clip(((ex + 0.027) - xs_) / 0.006, 0, 1)
    brow = np.maximum(brow, np.exp(-((co[:, 2] - arc) / 0.0038) ** 2) * inx * front)
zm0, zm1 = z_st + 0.0045, z_sub - 0.0005
mous = np.clip((co[:, 2] - zm0) / 0.002, 0, 1) * np.clip((zm1 + 0.004 * (np.abs(co[:, 0]) / 0.03) - 0.010 * (np.abs(co[:, 0]) / 0.03) ** 2 - co[:, 2]) / 0.002, 0, 1) * np.clip((0.031 - np.abs(co[:, 0])) / 0.004, 0, 1) * front
for name, arr in (("scalp", scalp), ("brow", brow), ("mous", mous)):
    g = body.vertex_groups.new(name=name)
    for w10 in range(1, 11):
        idx = np.where(np.round(arr * 10) == w10)[0]
        if len(idx): g.add([int(i_) for i_ in idx], w10 / 10, "REPLACE")
    print(name, "verts:", int((arr > 0.05).sum()))
# ================================================================ 4b. rambut, alis, kumis, bulu mata sebagai helai (Curves)
from scipy.spatial import cKDTree
rng = np.random.default_rng(11)
me_b = body.data; me_b.calc_loop_triangles()
TRI = np.empty(len(me_b.loop_triangles) * 3, np.int32); me_b.loop_triangles.foreach_get("vertices", TRI); TRI = TRI.reshape(-1, 3)
head_i = np.where(co[:, 2] > ez - 0.13)[0]; HCO = co[head_i]; HNO = no[head_i]; KD = cKDTree(HCO)
tri_h = TRI[co[TRI[:, 0], 2] > ez - 0.13]
_a, _b, _c = co[tri_h[:, 0]], co[tri_h[:, 1]], co[tri_h[:, 2]]; TAREA = 0.5 * np.linalg.norm(np.cross(_b - _a, _c - _a), axis=1)
def unit(v): return v / np.maximum(np.linalg.norm(v, axis=-1, keepdims=True), 1e-9)
def sample_roots(mask, n):
    w = mask[tri_h].mean(1) * TAREA
    if w.sum() <= 0 or n <= 0: return np.zeros((0, 3)), np.zeros((0, 3))
    idx = rng.choice(len(tri_h), n, p=w / w.sum()); r1 = np.sqrt(rng.random(n)); r2 = rng.random(n)
    bw = np.stack([1 - r1, r1 * (1 - r2), r1 * r2], axis=1)[:, :, None]; t = tri_h[idx]
    return (co[t] * bw).sum(1), unit((no[t] * bw).sum(1))
def march(p0, length, dirfn, steps=7, lift=(0.7, 0.08), minh=(0.0005, 0.003), jitter=0.15, goal=None):
    p = p0.copy(); out = [p.copy()]; n = len(p); jit = rng.normal(0, jitter, (n, 3)); hv = rng.uniform(0.35, 1.6, n)
    for k in range(steps):
        t = (k + 0.5) / steps; _, ii = KD.query(p); nn = HNO[ii]
        comb = unit(dirfn(p, t) + jit); tang = unit(comb - nn * (comb * nn).sum(1, keepdims=True))
        lf = lift[0] + (lift[1] - lift[0]) * min(1.0, t * 1.6); d = unit(tang * (1 - lf) + nn * lf)
        p = p + d * (length / steps)[:, None]
        _, ii = KD.query(p); h = ((p - HCO[ii]) * HNO[ii]).sum(1); mh = (minh[0] + (minh[1] - minh[0]) * t) * hv
        p = p + HNO[ii] * np.clip(mh - h, 0, None)[:, None]
        if goal is not None:
            g_, rad_ = goal; dg = np.linalg.norm(p - g_, axis=1); near = np.clip(1 - dg / rad_, 0, 1)[:, None] * min(1.0, t * 1.5)
            p = p * (1 - near) + (g_ + (p - g_) * 0.35) * near
        out.append(p.copy())
    return np.stack(out, axis=1)
def make_curves(name, S, radius, material, taper=0.25):
    if len(S) == 0: return None
    n, k, _ = S.shape; cd = bpy.data.hair_curves.new(name); cd.add_curves([k] * n); cd.points.foreach_set("position", S.reshape(-1).astype(np.float32))
    rad = np.tile(radius * (1 - (1 - taper) * np.linspace(0, 1, k) ** 2), n).astype(np.float32)
    ra = cd.attributes.get("radius") or cd.attributes.new("radius", "FLOAT", "POINT"); ra.data.foreach_set("value", rad)
    cd.materials.append(material); ob = bpy.data.objects.new(name, cd); col.objects.link(ob); return ob
def hair_mat(name, color, rough=0.5):
    m, N, Lk, p = new_mat(name); out = N.get("Material Output")
    dark = max(color) < 0.05
    h = N.new("ShaderNodeBsdfHairPrincipled"); h.parametrization = "COLOR"; h.inputs["Color"].default_value = (*color, 1); h.inputs["Roughness"].default_value = 0.62 if dark else rough; h.inputs["Radial Roughness"].default_value = 0.75 if dark else 0.55
    if dark: h.inputs["IOR"].default_value = 1.30
    try: h.inputs["Random Color"].default_value = 0.35; h.inputs["Random Roughness"].default_value = 0.3
    except Exception: pass
    Lk.new(h.outputs[0], out.inputs["Surface"]); m.diffuse_color = (*color, 1); return m
HCOL = {"black": (0.010, 0.008, 0.007), "softblack": (0.030, 0.024, 0.020), "grey": (0.30, 0.30, 0.31), "white": (0.66, 0.66, 0.65)}
HM_ = {k_: hair_mat("Rambut_" + k_, v_) for k_, v_ in HCOL.items()}
def split_make(name, S, radius, mix):
    """mix: {warna: porsi}. Helai dibagi acak ke beberapa objek supaya uban bercampur."""
    if len(S) == 0: return
    keys = list(mix); pr = np.array([mix[k_] for k_ in keys], float); pick = rng.choice(len(keys), len(S), p=pr / pr.sum())
    for i_, k_ in enumerate(keys):
        if (pick == i_).any(): make_curves(f"{name}_{k_}", S[pick == i_], radius, HM_[k_])

hc = C["hair"]; HC_ = HCO[scalp[head_i] > 0.5].mean(0) if (scalp[head_i] > 0.5).any() else np.array([0, ey + 0.09, ez + 0.05])
scalp_m = scalp.copy(); part_x = hc.get("part", 0.0)
oc, _n = hit(body, (0, 1.0, ez + 0.040), (0, -1, 0)); oc = np.array(oc) if oc else np.array([0, ey + 0.19, ez + 0.04])
topness = lambda p: np.clip((p[:, 2] - (ez + hc.get("top_z", 0.060))) / 0.03, 0, 1)[:, None]
if True:                                                        # garis rambut: pelipis, belakang telinga, tengkuk
    nape_ = 0.062 if hc["mode"] == "pony" else 0.050
    low_ = np.where(fwd < -0.118, ez - nape_, np.where(fwd < -0.060, ez - 0.004, ez + C["hairline"] + 0.9 * np.clip(fwd + 0.02, 0, 1) - 0.022 * np.clip((np.abs(co[:, 0]) - 0.035) / 0.03, 0, 1)))
    ears_ = (np.abs(co[:, 0]) > ex + 0.026) & (co[:, 2] < ez + 0.006) & (fwd > -0.118)
    wide = (dh < d0 * 2.2) & (co[:, 2] > low_) & ~ears_; scalp_m = np.maximum(scalp_m, np.clip((co[:, 2] - low_) / (0.010 if hc["mode"] == "pony" else 0.022), 0, 1) * wide)
    if C.get("peci"): scalp_m[co[:, 2] > z_rim - 0.003] = 0
if STAGE >= 1 and hc["mode"] == "crop":
    p0, n0 = sample_roots(scalp_m, hc["count"]); tp = topness(p0)[:, 0]
    ln = (hc["side"] + (hc["top"] - hc["side"]) * tp) * rng.uniform(0.75, 1.15, len(p0))
    def d_crop(p, t):
        tp_ = topness(p); sd = np.sign(p[:, 0] - part_x)[:, None]
        return (np.array([0.9, 0.55, -0.1]) * np.c_[sd, np.ones_like(sd), np.ones_like(sd)]) * tp_ + np.array([0, 0.35, -1.0]) * (1 - tp_)
    S = march(p0, ln, d_crop, steps=6, lift=hc.get("lift", (0.72, 0.10)), minh=(0.0005, hc.get("vol", 0.004)), jitter=0.22)
    split_make("Rambut", S, hc.get("radius", 0.00010), hc["mix"])
if STAGE >= 1 and hc["mode"] == "fringe":
    p0, n0 = sample_roots(scalp_m, hc["count"]); tp = topness(p0)[:, 0]; nape = np.clip((ez + 0.02 - p0[:, 2]) / 0.05, 0, 1)
    ln = (hc["side"] * (1 - 0.45 * nape) + (hc["top"] - hc["side"]) * tp) * rng.uniform(0.75, 1.15, len(p0))
    def d_fringe(p, t):
        tp_ = topness(p); fr_ = np.clip((HC_[1] + 0.035 - p[:, 1]) / 0.05, 0, 1)[:, None]; sd = np.sign(p[:, 0] - part_x)[:, None]
        fwd_d = np.c_[sd * 0.45, -np.ones_like(sd), -0.35 * np.ones_like(sd)]; back_d = np.c_[sd * 0.3, 0.6 * np.ones_like(sd), -0.8 * np.ones_like(sd)]
        return (fwd_d * fr_ + back_d * (1 - fr_)) * tp_ + np.array([0, 0.15, -1.0]) * (1 - tp_)
    S = march(p0, ln, d_fringe, steps=8, lift=(0.62, 0.03), minh=(0.0006, hc.get("vol", 0.008)), jitter=0.25)
    split_make("Rambut", S, hc.get("radius", 0.00010), hc["mix"])
if STAGE >= 1 and hc["mode"] == "pony":
    G_ = oc + np.array([0, 0.004, 0.0]); p0, n0 = sample_roots(scalp_m, hc["count"])
    Rh = np.linalg.norm(p0 - HC_, axis=1); ang = np.arccos(np.clip((unit(p0 - HC_) * unit((G_ - HC_)[None, :])).sum(1), -1, 1)); ln = np.maximum(ang * Rh * 1.02, 0.02) * rng.uniform(0.97, 1.04, len(p0))
    def d_pony(p, t): return unit(G_[None, :] - p)
    S = march(p0, ln, d_pony, steps=16, lift=(0.12, 0.0), minh=(0.0004, 0.0026), jitter=0.04, goal=(G_, 0.03))
    split_make("Rambut", S, hc.get("radius", 0.00011), hc["mix"])
    nt = hc.get("tail", 4500); s_ = np.linspace(0, 1, 14)[None, :, None]; a_ = rng.uniform(0, 2 * PI, nt); r_ = np.sqrt(rng.random(nt))
    oa = (r_ * np.cos(a_))[:, None, None]; ob_ = (r_ * np.sin(a_))[:, None, None]; Ls = (hc.get("tail_len", 0.17) * rng.uniform(0.85, 1.05, nt))[:, None, None]
    cen = G_[None, None, :] + np.array([0, 1, 0]) * 0.042 * (1 - np.exp(-5 * s_)) + np.array([0, 0, 1]) * (0.012 * np.sin(PI * np.minimum(1, s_ * 3)) - Ls * s_ ** 1.5)
    Rr = 0.008 + 0.012 * np.sin(PI * np.minimum(1, s_ * 1.15)) ** 0.8 - 0.004 * s_
    wob = 0.0025 * np.sin(s_ * 9 + rng.uniform(0, 6.28, nt)[:, None, None])
    T_ = cen + np.array([1, 0, 0]) * (oa * Rr + wob) + np.array([0, 0.75, 0.66]) * ob_ * Rr
    split_make("RambutIkat", T_, hc.get("radius", 0.00011), hc["mix"])
    band = build("IkatRambut", [tube([G_ + np.array([0, 0.006, 0.001]), G_ + np.array([0, 0.016, 0.003])], [0.0105, 0.0105], up=(1, 0, 0), seg=20, it=0, capr=0.15)], mat("Karet_Rambut", (0.45, 0.04, 0.05), rough=0.6)); shade(band)
# alis
if STAGE >= 1:
    bm_ = brow.copy()
    if SEX == "female": bm_ = bm_ ** 2.2
    p0, n0 = sample_roots(bm_, C["brow"]); xr = (np.abs(p0[:, 0]) - (ex - 0.022)) / 0.049
    def d_brow(p, t):
        x_ = (np.abs(p[:, 0]) - (ex - 0.022)) / 0.049; sd = np.sign(p[:, 0]); up = np.interp(x_, [0, 0.25, 0.6, 1.0], [0.95, 0.45, 0.12, -0.25])
        return np.c_[sd * np.interp(x_, [0, 0.3, 1], [0.35, 0.9, 1.0]), np.zeros(len(p)), up]
    S = march(p0, rng.uniform(0.0055, 0.0095, len(p0)), d_brow, steps=4, lift=(0.30, 0.04), minh=(0.0002, 0.0011), jitter=0.12)
    split_make("Alis", S, 0.000055, C.get("brow_mix", {"black": 1}))
    if C["mustache"]:
        p0, n0 = sample_roots(mous, C.get("mous_count", 2600))
        def d_mous(p, t): return np.c_[np.sign(p[:, 0]) * 0.55 * np.clip(np.abs(p[:, 0]) / 0.012, 0, 1), -0.25 * np.ones(len(p)), -np.ones(len(p))]
        S = march(p0, rng.uniform(0.007, 0.012, len(p0)), d_mous, steps=4, lift=(0.35, 0.02), minh=(0.0002, 0.0016), jitter=0.16)
        split_make("Kumis", S, 0.00007, C["mous_mix"])
# bulu mata dari geometri bantu MakeHuman
if STAGE >= 1:
    LM = hair_mat("BuluMata", (0.008, 0.007, 0.006), rough=0.4); lash = []
    for L, sx in (("l", 1), ("r", -1)):
        ec = EYE[sx]
        for gi, (cnt, lscale, curl) in ((1, (C.get("lash", 95), 0.85, 0.0030)), (2, (40, 0.45, -0.0012))):
            gname = f"helper-{L}-eyelashes-{gi}"; quads = [vi for g, vi, ti in FACES if g == gname and len(vi) == 4]
            if not quads: continue
            segs = []
            for q in quads:
                d_ = [np.linalg.norm(P[i] - ec) for i in q]; o_ = np.argsort(d_); r0, r1 = q[o_[0]], q[o_[1]]; t0, t1 = q[o_[3]], q[o_[2]]
                if np.linalg.norm(P[r0] - P[t0]) + np.linalg.norm(P[r1] - P[t1]) > np.linalg.norm(P[r0] - P[t1]) + np.linalg.norm(P[r1] - P[t0]): t0, t1 = t1, t0
                segs.append((P[r0], P[r1], P[t0], P[t1]))
            wl = np.array([np.linalg.norm(a - b) for a, b, _, _ in segs]); pick = rng.choice(len(segs), cnt, p=wl / wl.sum()); u_ = rng.random(cnt)
            for k_, uu in zip(pick, u_):
                a, b, ta, tb = segs[k_]; root = a + (b - a) * uu; tipv = (ta + (tb - ta) * uu) - root; Lh = np.linalg.norm(tipv) * lscale * rng.uniform(0.7, 1.1)
                dvec = unit(tipv + rng.normal(0, 0.12, 3) * np.linalg.norm(tipv)); ss = np.linspace(0, 1, 5)[:, None]
                lash.append(root + dvec * Lh * ss + np.array([0, 0, 1]) * curl * (ss ** 2) * (Lh / 0.008))
    if lash: make_curves("BuluMata", np.array(lash), 0.00007, LM, taper=0.15); print("lashes:", len(lash))
# atribut untuk shader kulit: bayangan kulit kepala di bawah rambut + bekas cukur
def set_attr(name, arr):
    at = body.data.attributes.get(name) or body.data.attributes.new(name, "FLOAT", "POINT"); at.data.foreach_set("value", np.asarray(arr, np.float32))
set_attr("m_scalp", np.clip(scalp_m, 0, 1) * C.get("scalp_dark", 0.8))
jaw = np.clip((z_sub - 0.002 - co[:, 2]) / 0.006, 0, 1) * np.clip((co[:, 2] - (z_st - 0.062)) / 0.012, 0, 1) * np.clip((fwd + 0.095) / 0.02, 0, 1) * (no[:, 2] < 0.75)
set_attr("m_stubble", jaw * C.get("stubble", 0.0))
print("groom objects:", [o.name for o in col.objects if o.type == "CURVES"])

# ================================================================ 5. detail kemeja + handuk
if STAGE >= 2:
    sc, _ = get_co(shirt); nbp = NECK_PTS
    ncx2, ncy2 = float(nbp[:, 0].mean()), float(nbp[:, 1].mean()); ang_ = np.arctan2(nbp[:, 0] - ncx2, nbp[:, 1] - ncy2); order = np.argsort(ang_)
    A_, R_, Z_ = ang_[order], np.hypot(nbp[:, 0] - ncx2, nbp[:, 1] - ncy2)[order], nbp[:, 2][order]
    def neckline(th):
        return float(np.interp(th, A_, R_, period=2 * PI)), float(np.interp(th, A_, Z_, period=2 * PI))
    def patch(name, grid_fn, nu, nv_, material, lift=0.0012, thick=0.0020):
        Vv, okv = [], []
        for i in range(nu):
            for j in range(nv_):
                x, z = grid_fn(i / (nu - 1), j / (nv_ - 1)); p_, n_ = hit(shirt, (x, -1.0, z), (0, 1, 0)); okv.append(p_ is not None); Vv.append(tuple(p_ + n_ * lift) if p_ else (0, 0, 0))
        Ff = [(i * nv_ + j, i * nv_ + j + 1, (i + 1) * nv_ + j + 1, (i + 1) * nv_ + j) for i in range(nu - 1) for j in range(nv_ - 1) if okv[i * nv_ + j] and okv[i * nv_ + j + 1] and okv[(i + 1) * nv_ + j] and okv[(i + 1) * nv_ + j + 1]]
        ob = mesh_obj(name, Vv, Ff, material); so = ob.modifiers.new("so", "SOLIDIFY"); so.thickness = thick; so.offset = 1; apply_mods(ob); shade(ob); return ob
    fr_ = (np.abs(sc[:, 0]) < 0.03) & (sc[:, 1] < ncy2); zb0 = float(sc[fr_, 2].min()) + 0.014; zb1 = neckline(PI)[1] - 0.012
    HAS_PLACKET = C["shirt"] != "kaos"; HAS_POCKET = C["shirt"] in ("kemeja", "kerja")
    if HAS_PLACKET: patch("Plaket", lambda u_, v_: (-0.015 + 0.030 * u_, zb0 + (zb1 - zb0) * v_), 6, 90, SHIRT)
    for fz in ((0.10, 0.30, 0.50, 0.70, 0.90) if HAS_PLACKET else ()):
        p_, n_ = hit(shirt, (0, -1.0, zb0 + (zb1 - zb0) * fz), (0, 1, 0))
        if p_:
            bpy.ops.mesh.primitive_cylinder_add(vertices=20, radius=0.0056, depth=0.0028, location=p_ + n_ * 0.0036); b_ = bpy.context.active_object
            b_.name = "Kancing"; b_.rotation_euler = n_.to_track_quat("Z", "Y").to_euler(); b_.data.materials.append(BUTTON); shade(b_)
    if HAS_POCKET: patch("Saku", lambda u_, v_: (0.050 + 0.074 * u_, zS - 0.205 + 0.088 * v_), 16, 18, SHIRT, lift=0.0014, thick=0.0022)
    if HAS_POCKET: patch("SakuLipat", lambda u_, v_: (0.048 + 0.078 * u_, zS - 0.132 + 0.017 * v_), 16, 4, SHIRT, lift=0.0034, thick=0.0018)
    CT = {"kemeja": "fold", "kerja": "fold", "koko": "stand", "kaos": "rib"}[C["shirt"]]; CA = {"fold": 160, "stand": 166, "rib": 180}[CT]
    def CPROF(tip):
        if CT == "fold": return ((0.000, -0.002), (0.002, 0.020), (0.008, 0.025), (0.026 + 0.014 * tip, -0.007 - 0.030 * tip))
        if CT == "stand": return ((0.000, -0.002), (0.001, 0.010), (0.002, 0.022), (0.003, 0.030))
        return ((-0.002, -0.016), (0.002, -0.006), (0.003, 0.002), (0.0015, 0.008))
    N_ = 48; CV, CF = [], []
    for i in range(N_ + 1):
        th = math.radians(-CA + 2 * CA * i / N_); tip = (max(0.0, (abs(math.degrees(th)) - 95) / 65) ** 1.5) if CT == "fold" else 0.0; r0, z0 = neckline(th)
        for k, (dr, dz) in enumerate(CPROF(tip)):
            CV.append((ncx2 + (r0 + dr) * math.sin(th), ncy2 + (r0 + dr) * math.cos(th) - 0.010 * tip * (k == 2), z0 + dz))
    for i in range(N_):
        for k in range(3): a = i * 4 + k; CF.append((a, a + 4, a + 5, a + 1))
    collar = mesh_obj("Kerah", CV, CF, SHIRT)
    if CT == "rib":
        bmc = bmesh.new(); bmc.from_mesh(collar.data); bmesh.ops.remove_doubles(bmc, verts=bmc.verts, dist=0.0005); bmc.to_mesh(collar.data); bmc.free()
    so = collar.modifiers.new("so", "SOLIDIFY"); so.thickness = 0.0024; s2 = collar.modifiers.new("ss", "SUBSURF"); s2.levels = 2; apply_mods(collar); fix_normals(collar); shade(collar)
    if C.get("towel"):                              # handuk kecil: pita kain yang dijatuhkan ke bahu dengan simulasi
        def on_chest(x, z, lift): p_, n_ = hit(shirt, (x, -1.0, z), (0, 1, 0)); return Vector((x, (p_.y if p_ else -0.12) - lift, z))
        def on_top(x, y, lift): p_, n_ = hit(shirt, (x, y, 2.5), (0, 0, -1)); return Vector((x, y, (p_.z if p_ else zS + 0.04) + lift))
        rb_, zb_ = neckline(0.0); rs_, zs_ = neckline(PI / 2); xt = rs_ + 0.050; HWt = 0.033; LFT = 0.016
        ctrl = [(on_chest(xt, zS - 0.165, LFT), (0, -1, 0)), (on_chest(xt, zS - 0.12, LFT), (0, -1, 0)), (on_chest(xt, zS - 0.045, LFT), (0, -0.9, 0.4)),
                (on_top(xt, ncy2 - 0.055, LFT), (0, -0.3, 0.95)), (on_top(xt - 0.004, ncy2 + 0.005, LFT), (0.1, 0.1, 1)),
                (Vector((rs_ + 0.034, ncy2 + rb_ * 0.60, zb_ + 0.016)), (0.55, 0.55, 0.6)), (Vector((0.0, ncy2 + rb_ + 0.036, zb_ + 0.014)), (0, 0.9, 0.45))]
        right = [(Vector((-p.x, p.y, p.z)), (-n[0], n[1], n[2])) for p, n in ctrl[:-1]][::-1]; right[-1] = (on_chest(-xt, zS - 0.195, LFT), (0, -1, 0))
        A = chaikin_open(np.array([[*p, *n] for p, n in ctrl + right], float), 3); Pt = A[:, :3]; Nt = A[:, 3:] / np.linalg.norm(A[:, 3:], axis=1)[:, None]
        Tt = np.gradient(Pt, axis=0); Tt /= np.linalg.norm(Tt, axis=1)[:, None]; Wt = np.cross(Nt, Tt); Wt /= np.linalg.norm(Wt, axis=1)[:, None]
        nr_, nw_ = len(Pt), 9; TV = [tuple(Pt[i] + Wt[i] * HWt * (2 * j / (nw_ - 1) - 1)) for i in range(nr_) for j in range(nw_)]
        TF = [(i * nw_ + j, i * nw_ + j + 1, (i + 1) * nw_ + j + 1, (i + 1) * nw_ + j) for i in range(nr_ - 1) for j in range(nw_ - 1)]
        towel = mesh_obj("Handuk", TV, TF, TOWEL); towel.data.materials.append(STRIPE)
        for pl in towel.data.polygons:
            row = pl.index // (nw_ - 1)
            if min(row, nr_ - 2 - row) in (3, 6): pl.material_index = 1
        g_ = towel.vertex_groups.new(name="pin"); mid = nr_ // 2; g_.add([i * nw_ + j for i in range(mid - 2, mid + 3) for j in range(nw_)], 1.0, "REPLACE")
        shirt_px.modifiers.new("Collision", "COLLISION"); shirt_px.collision.thickness_outer = 0.0045; shirt_px.collision.cloth_friction = 30
        FRAMES = 45; z_before = float(get_co(towel)[0][:, 2].min())
        if not NOSIM: run_sim(towel, 15, 0.4)
        tz = get_co(towel)[0][:, 2]; print("towel z min before %.3f after %.3f (shoulder %.3f)" % (z_before, tz.min(), zS))
        sm_ = towel.modifiers.new("sm", "SMOOTH"); sm_.factor = 0.5; sm_.iterations = 2
        so_ = towel.modifiers.new("so", "SOLIDIFY"); so_.thickness = 0.0045; so_.offset = 0
        s2_ = towel.modifiers.new("ss", "SUBSURF"); s2_.levels = 1; apply_mods(towel); shade(towel)
bpy.data.objects.remove(collider, do_unlink=True)
if shirt_px: bpy.data.objects.remove(shirt_px, do_unlink=True)

# ---- peci
if C.get("peci"):
    hs = co[(co[:, 2] > z_rim) & (co[:, 2] < z_rim + 0.03)]; pcy = float((hs[:, 1].max() + hs[:, 1].min()) / 2); prx = float(np.abs(hs[:, 0]).max()) + 0.004; pry = float((hs[:, 1].max() - hs[:, 1].min()) / 2) + 0.004
    ptop = max(z_rim + 0.066, float(co[:, 2].max()) + 0.004); print("peci rim %.3f top %.3f head top %.3f" % (z_rim, ptop, co[:, 2].max()))
    PECI = mat("Peci_Beludru", (0.004, 0.004, 0.005), rough=0.75, sheen=0.15, bump=(2500, 0.25))
    Vp, Fp = loft_z([(z_rim - 0.004, prx, pry, pcy), ((z_rim + ptop) / 2, prx * 0.985, pry * 0.985, pcy), (ptop, prx * 0.93, pry * 0.93, pcy)], n=2.15, seg=72, steps=20)
    peci = mesh_obj("Peci", Vp, Fp, PECI); fix_normals(peci); activate(peci); bpy.ops.object.shade_smooth()
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
    except Exception: pass

# ================================================================ 6. sandal jepit
def hull2d(pts):
    pts = sorted(set((round(x, 5), round(y, 5)) for x, y in pts))
    def cr(o, a, b): return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
    lo, hi = [], []
    for p_ in pts:
        while len(lo) >= 2 and cr(lo[-2], lo[-1], p_) <= 0: lo.pop()
        lo.append(p_)
    for p_ in reversed(pts):
        while len(hi) >= 2 and cr(hi[-2], hi[-1], p_) <= 0: hi.pop()
        hi.append(p_)
    return lo[:-1] + hi[:-1]
if STAGE >= 3:
    for L, sx in (("l", 1), ("r", -1)):
        fm = (FOOT[L] > 0.5) & (B[:, 2] < SOLE_T + 0.035); H2 = np.array(hull2d(B[fm][:, :2])); cen = H2.mean(0)
        # rapatkan titik hull lalu geser keluar 6 mm
        dense = []
        for a, b_ in zip(H2, np.roll(H2, -1, axis=0)):
            n_ = max(1, int(np.linalg.norm(b_ - a) / 0.01))
            for k in range(n_): dense.append(a + (b_ - a) * k / n_)
        dense = np.array(dense); out = []
        for i in range(len(dense)):
            tg = dense[(i + 1) % len(dense)] - dense[i - 1]; nrm = np.array([tg[1], -tg[0]]); nrm /= np.linalg.norm(nrm) + 1e-9
            if nrm @ (dense[i] - cen) < 0: nrm = -nrm
            out.append(dense[i] + nrm * 0.007)
        out = np.array(out)
        for _ in range(3): out = (np.roll(out, 1, axis=0) + 2 * out + np.roll(out, -1, axis=0)) / 4
        n_ = len(out); Vv = [(x, y, 0.0) for x, y in out] + [(x, y, SOLE_T) for x, y in out]
        Ff = [tuple(range(n_))[::-1], tuple(range(n_, 2 * n_))] + [(i, (i + 1) % n_, n_ + (i + 1) % n_, n_ + i) for i in range(n_)]
        so = mesh_obj("SandalAlas", Vv, Ff, SOLE); fix_normals(so)
        bv = so.modifiers.new("bv", "BEVEL"); bv.width = 0.004; bv.segments = 3; bv.limit_method = "ANGLE"; apply_mods(so); shade(so)
        try: activate(so); bpy.ops.object.shade_smooth_by_angle(angle=math.radians(40))
        except Exception: pass
        t1, t2 = Vector(J[f"joint-{L}-toe-1-1"]), Vector(J[f"joint-{L}-toe-2-1"]); An = Vector(J[f"joint-{L}-ankle"])
        f = (t1 + t2) / 2 - An; f.z = 0; f.normalize(); lat = Vector((-f.y, f.x, 0)); lat = lat if lat.x * sx > 0 else -lat
        def on_foot(pt, lift=0.0042):
            p_, n_ = hit(body, (pt.x, pt.y, 0.5), (0, 0, -1)); return Vector((pt.x, pt.y, max(SOLE_T + 0.003, (p_.z if p_ else 0.0) + lift)))
        post = (t1 + t2) / 2 + f * 0.016; post.z = 0
        fo = out @ np.array([f.x, f.y]); lo_ = out @ np.array([lat.x, lat.y]); f0 = fo.min() + 0.40 * (fo.max() - fo.min()); near = np.abs(fo - f0) < 0.012
        c_l = float((cen @ np.array([lat.x, lat.y]))); base2 = Vector((0, 0, 0)) + f * f0
        straps = [tube([Vector((post.x, post.y, SOLE_T - 0.002)), on_foot(post, 0.006)], [0.0046, 0.0046], seg=10, it=0)]
        for sgn in (1, -1):
            lv = (lo_[near].max() - 0.005) if sgn > 0 else (lo_[near].min() + 0.005); anchor = f * f0 + lat * lv; anchor.z = 0
            mid = post.lerp(anchor, 0.55) + lat * sgn * 0.012
            path = [on_foot(post, 0.006)] + [on_foot(post.lerp(mid, t_)) for t_ in (0.35, 0.7, 1.0)] + [on_foot(mid.lerp(anchor, t_)) for t_ in (0.4, 0.75)] + [Vector((anchor.x, anchor.y, SOLE_T + 0.001))]
            straps.append(tube(path, [(0.0072, 0.0034)] * len(path), up=(0, 0, 1), seg=12, it=2))
        st_ = build("SandalTali", straps, STRAP); shade(st_)

# ================================================================ 7. rapikan + studio
root = bpy.data.objects.new(C["name"], None); col.objects.link(root)
for o in list(col.objects):
    if o is not root and o.type == "MESH": o.parent = root
print("TOTAL FACES", sum(len(o.data.polygons) for o in col.objects if o.type == "MESH"))
SV, SF = [], []
prof_ = [(-7.2, z) for z in np.linspace(9, 2.6, 5)] + [(-5.0 - 2.2 * math.sin((PI / 2) * (15 - k) / 15), 2.2 - 2.2 * math.cos((PI / 2) * (15 - k) / 15)) for k in range(0, 15)] + [(y, 0.0) for y in np.linspace(-5.0, 2.5, 16)]
for k in range(1, 16): a = (PI / 2) * k / 15; prof_.append((2.5 + 2.2 * math.sin(a), 2.2 - 2.2 * math.cos(a)))
prof_ += [(4.7, z) for z in np.linspace(2.6, 9, 5)]
for x in (-14, 14):
    for y, z in prof_: SV.append((x, y, z))
Pn = len(prof_)
for i in range(Pn - 1): SF.append((i, i + 1, Pn + i + 1, Pn + i))
cyc = mesh_obj("Cyclorama", SV, SF, FLOOR); shade(cyc)
world = bpy.data.worlds.new("Studio"); scene.world = world
try: world.use_nodes = True
except Exception: pass
world.node_tree.nodes["Background"].inputs[0].default_value = (0.025, 0.025, 0.028, 1)
def aim(ob, target): ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()
def area(name, loc, sx_, sy_, power, target=(0, 0, 1.0), color=(1, 1, 1)):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = power; ld.shape = "RECTANGLE"; ld.size = sx_; ld.size_y = sy_; ld.color = color
    ob = bpy.data.objects.new(name, ld); col.objects.link(ob); ob.location = loc; aim(ob, target); return ob
area("Key", (-2.0, -2.9, 2.7), 2.4, 2.4, 250, target=(0, 0, 1.25), color=(1.0, 0.95, 0.88))
area("Fill", (2.6, -2.4, 1.5), 3.0, 2.2, 80, target=(0, 0, 1.1), color=(0.88, 0.93, 1.0))
area("Rim", (1.5, 2.6, 2.6), 2.0, 1.2, 230, target=(0, 0, 1.3))
area("Top", (0, -0.4, 3.6), 3.0, 2.0, 60, target=(0, 0, 0.8))
def camera(name, loc, target, lens):
    cd = bpy.data.cameras.new(name); cd.lens = lens; ob = bpy.data.objects.new(name, cd); col.objects.link(ob); ob.location = loc; aim(ob, target); return ob
hz_ = float(ez)
scene.camera = camera("Cam_Full", (1.45, -4.3, 1.15), (0, 0, 0.84), 70)
camera("Cam_Face", (0.19, -0.80, hz_ + 0.01), (0, ey + 0.06, hz_ - 0.03), 85)
camera("Cam_Head34", (-0.52, -0.56, hz_ + 0.06), (0, ey + 0.08, hz_ - 0.015), 85)
camera("Cam_Eyes", (0.06, -0.80, hz_ + 0.0), (0, ey, hz_ - 0.002), 230)
camera("Cam_HeadBack", (0.42, 0.78, hz_ + 0.08), (0, ey + 0.10, hz_ - 0.03), 85)
camera("Cam_Bust", (-0.55, -1.60, hz_ - 0.08), (0, 0, hz_ - 0.20), 70)
camera("Cam_Back", (-2.2, 3.8, 1.3), (0, 0, HEIGHT * 0.5), 70)
camera("Cam_Feet", (0.75, -0.95, 0.42), (0.02, -0.03, 0.10), 60)
camera("Cam_Side", (-4.6, -0.5, 1.15), (0, 0, HEIGHT * 0.5), 70)
camera("Cam_Torso", (0.95, -2.55, zS - 0.02), (0, 0, zS - 0.20), 70)
camera("Cam_TorsoBack", (-0.95, 2.75, zS - 0.02), (0, 0.02, zS - 0.20), 70)
Wl = J["joint-l-hand"]; camera("Cam_Hand", (Wl[0] + 0.62, Wl[1] - 0.55, Wl[2] + 0.10), (Wl[0], Wl[1] - 0.01, Wl[2] - 0.07), 85)
r = scene.render; r.engine = "CYCLES"; r.resolution_x, r.resolution_y = 1000, 1250
scene.cycles.samples = 64; scene.cycles.transparent_max_bounces = 24; scene.cycles.use_adaptive_sampling = True; scene.cycles.use_denoising = True
try: scene.cycles.denoiser = "OPENIMAGEDENOISE"
except Exception: pass
try: scene.view_settings.view_transform = "AgX"; scene.view_settings.look = "AgX - Medium High Contrast"
except Exception: pass
try: bpy.ops.file.pack_all()
except Exception as e: print("pack:", e)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUTDIR, "blend", CID + ".blend"), compress=True)
for o in bpy.context.view_layer.objects: o.select_set(o.type == "MESH" and o.name != "Cyclorama")
try: bpy.ops.export_scene.gltf(filepath=os.path.join(OUTDIR, "glb", CID + ".glb"), use_selection=True, export_format="GLB", export_apply=True)
except Exception as e: print("GLB export failed:", e)
print("BUILD OK")
