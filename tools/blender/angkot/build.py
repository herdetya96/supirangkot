"""Angkot Indonesia (generic cab-over minibus, no brand marks).
Front points to -X, up +Z. Right-hand drive: driver on +Y. Passenger doorway on the left (-Y).
python3 tools/blender/angkot/build.py -> art/angkot/angkot.blend + angkot.glb (OUT=<folder> untuk tempat lain)
"""
import bpy, bmesh, math, os
import numpy as np
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get("OUT", os.path.normpath(os.path.join(HERE, "..", "..", "..", "art", "angkot")))
os.makedirs(OUT, exist_ok=True)
FONT = os.environ.get("FONT", "/usr/share/fonts/truetype/dejavu/DejaVuSansCondensed-Bold.ttf")
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene; col = scene.collection

# ================================================================ helpers
def activate(obj):
    for o in bpy.context.view_layer.objects:
        if o is not None: o.select_set(False)
    obj.select_set(True); bpy.context.view_layer.objects.active = obj

def apply_mods(obj):
    activate(obj)
    for m in list(obj.modifiers): bpy.ops.object.modifier_apply(modifier=m.name)

def smooth(obj, angle=35):
    activate(obj); bpy.ops.object.shade_smooth()
    try: bpy.ops.object.shade_smooth_by_angle(angle=math.radians(angle))
    except Exception: pass

def fix_normals(obj):
    activate(obj); bpy.ops.object.mode_set(mode="EDIT"); bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.mesh.normals_make_consistent(inside=False); bpy.ops.object.mode_set(mode="OBJECT")

def mesh_obj(name, verts, faces, material=None):
    me = bpy.data.meshes.new(name); me.from_pydata(verts, [], faces); me.update()
    ob = bpy.data.objects.new(name, me); col.objects.link(ob)
    if material: ob.data.materials.append(material)
    return ob

def cube(name, loc, size, material, rot=(0, 0, 0), bevel=0.0, segs=3):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc, rotation=rot)
    ob = bpy.context.active_object; ob.name = name; ob.scale = size
    bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
    if bevel:
        b = ob.modifiers.new("bevel", "BEVEL"); b.width = bevel; b.segments = segs; apply_mods(ob)
    if material: ob.data.materials.append(material)
    return ob

def box(name, x0, x1, y0, y1, z0, z1, material, bevel=0.0, segs=3):
    return cube(name, ((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), (x1 - x0, y1 - y0, z1 - z0), material, bevel=bevel, segs=segs)

def cyl(name, loc, r, depth, material, rot=(0, 0, 0), verts=48, fill="NGON"):
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=depth, location=loc, rotation=rot, end_fill_type=fill)
    ob = bpy.context.active_object; ob.name = name
    if material: ob.data.materials.append(material)
    return ob

def join(objs, name):
    objs = [o for o in objs if o is not None]; activate(objs[0])
    for o in objs: o.select_set(True)
    bpy.ops.object.join(); ob = bpy.context.active_object; ob.name = name; return ob

def boolean(target, cutter, op="DIFFERENCE", transfer=True):
    m = target.modifiers.new("bool", "BOOLEAN"); m.operation = op; m.object = cutter; m.solver = "EXACT"
    m.use_self = True
    if transfer:
        try: m.material_mode = "TRANSFER"
        except Exception: pass
    apply_mods(target); bpy.data.objects.remove(cutter, do_unlink=True)

def prism(name, pts2d, axis, a0, a1, material):
    n = len(pts2d); V = []
    for a in (a0, a1):
        for u, v in pts2d:
            V.append((u, a, v) if axis == "y" else (a, u, v) if axis == "x" else (u, v, a))
    F = [tuple(range(n))[::-1], tuple(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n; F.append((i, j, n + j, n + i))
    ob = mesh_obj(name, V, F, material); fix_normals(ob); return ob

def fillet(pts, radii, seg=10):
    out = []; n = len(pts)
    for i in range(n):
        P = np.array(pts[i], float); A = np.array(pts[i - 1], float); B = np.array(pts[(i + 1) % n], float); r = radii[i]
        if r <= 0: out.append(tuple(P)); continue
        u = (A - P) / np.linalg.norm(A - P); v = (B - P) / np.linalg.norm(B - P)
        th = math.acos(np.clip(np.dot(u, v), -1, 1)); d = r / math.tan(th / 2)
        d = min(d, 0.45 * np.linalg.norm(A - P), 0.45 * np.linalg.norm(B - P))
        p1, p2 = P + u * d, P + v * d
        for k in range(seg + 1):
            t = k / seg; out.append(tuple((1 - t) ** 2 * p1 + 2 * (1 - t) * t * P + t ** 2 * p2))
    return out

def rrect(c0, c1, r, seg=6):
    (a0, b0), (a1, b1) = c0, c1
    return fillet([(a0, b0), (a1, b0), (a1, b1), (a0, b1)], [r] * 4, seg)

def clip_below(ob, z):
    bpy.context.view_layer.update()
    me = ob.data; me.transform(ob.matrix_world); ob.matrix_world = Matrix.Identity(4)
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, 0, z), plane_no=(0, 0, 1), clear_inner=True)
    bm.to_mesh(me); bm.free()

def seg_bar(name, p0, p1, w, t, y, material):
    """thin strip in an XZ-plane at depth y (side seams, stripes)"""
    dx, dz = p1[0] - p0[0], p1[1] - p0[1]; ln = math.hypot(dx, dz)
    return cube(name, ((p0[0] + p1[0]) / 2, y, (p0[1] + p1[1]) / 2), (ln + w * 0.5, t, w), material, rot=(0, math.atan2(-dz, dx), 0))

def beam(name, p0, p1, w, h, material, bevel=0.0):
    p0, p1 = Vector(p0), Vector(p1); d = p1 - p0
    ob = cube(name, (p0 + p1) / 2, (w, h, d.length), material, bevel=bevel)
    ob.rotation_euler = d.to_track_quat("Z", "Y").to_euler(); return ob

def text(name, s, size, loc, facing, material, extrude=0.0012):
    cu = bpy.data.curves.new(name, "FONT"); cu.body = s; cu.size = size; cu.extrude = extrude
    cu.align_x = "CENTER"; cu.align_y = "CENTER"
    try: cu.font = bpy.data.fonts.load(FONT, check_existing=True)
    except Exception: pass
    ob = bpy.data.objects.new(name, cu); col.objects.link(ob); ob.location = loc
    rz = {"-y": 0, "+y": math.pi, "-x": -math.pi / 2, "+x": math.pi / 2}[facing]
    ob.rotation_euler = (math.pi / 2, 0, rz)
    activate(ob); bpy.ops.object.convert(target="MESH"); ob = bpy.context.active_object
    ob.data.materials.append(material); return ob

# ================================================================ materials
def new_mat(name):
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    return m, m.node_tree.nodes, m.node_tree.links, m.node_tree.nodes.get("Principled BSDF")

def mat(name, color, metallic=0.0, rough=0.5, coat=0.0, emit=None, emit_str=0.0):
    m, N, L, p = new_mat(name)
    p.inputs["Base Color"].default_value = (*color, 1); p.inputs["Metallic"].default_value = metallic
    p.inputs["Roughness"].default_value = rough
    if coat: p.inputs["Coat Weight"].default_value = coat; p.inputs["Coat Roughness"].default_value = 0.05
    if emit: p.inputs["Emission Color"].default_value = (*emit, 1); p.inputs["Emission Strength"].default_value = emit_str
    m.diffuse_color = (*color, 1); return m

def glass(name, tint=(0.55, 0.62, 0.62), blend=0.22):
    m, N, L, p = new_mat(name); out = N.get("Material Output"); N.remove(p)
    tr = N.new("ShaderNodeBsdfTransparent"); tr.inputs[0].default_value = (*tint, 1)
    gl = N.new("ShaderNodeBsdfGlossy"); gl.inputs["Roughness"].default_value = 0.02
    lw = N.new("ShaderNodeLayerWeight"); lw.inputs["Blend"].default_value = blend
    mx = N.new("ShaderNodeMixShader")
    L.new(lw.outputs["Fresnel"], mx.inputs[0]); L.new(tr.outputs[0], mx.inputs[1]); L.new(gl.outputs[0], mx.inputs[2])
    L.new(mx.outputs[0], out.inputs["Surface"]); m.diffuse_color = (*tint, 0.4); return m

def checker_plate(name):
    m, N, L, p = new_mat(name)
    tc = N.new("ShaderNodeTexCoord"); ck = N.new("ShaderNodeTexChecker"); ck.inputs["Scale"].default_value = 120
    bump = N.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.4
    L.new(tc.outputs["Object"], ck.inputs["Vector"]); L.new(ck.outputs["Fac"], bump.inputs["Height"])
    L.new(bump.outputs["Normal"], p.inputs["Normal"])
    p.inputs["Base Color"].default_value = (0.6, 0.6, 0.62, 1); p.inputs["Metallic"].default_value = 1; p.inputs["Roughness"].default_value = 0.3
    return m

PAINT    = mat("Paint_HijauAngkot", (0.02, 0.30, 0.04), rough=0.32, coat=0.7)
WHITE    = mat("Paint_White", (0.85, 0.85, 0.83), rough=0.3, coat=0.6)
YELLOW   = mat("Paint_Yellow", (0.95, 0.70, 0.02), rough=0.3, coat=0.6)
INTER    = mat("Interior_Cream", (0.62, 0.58, 0.48), rough=0.6)
BLACK    = mat("Black_Plastic", (0.015, 0.015, 0.016), rough=0.55)
RUBBER   = mat("Rubber", (0.012, 0.012, 0.012), rough=0.8)
TYRE     = mat("Tyre", (0.02, 0.02, 0.02), rough=0.85)
CHROME   = mat("Chrome", (0.85, 0.85, 0.87), metallic=1.0, rough=0.07)
STEEL    = mat("Steel_Wheel", (0.55, 0.56, 0.58), metallic=0.8, rough=0.35)
GLASS    = glass("Glass")
TINT     = glass("Glass_SunStrip", (0.05, 0.22, 0.10), 0.3)
VINYL    = mat("Vinyl_Seat", (0.16, 0.035, 0.03), rough=0.38, coat=0.3)
FLOORM   = mat("Floor_Mat", (0.05, 0.05, 0.055), rough=0.9)
PLATE    = mat("Plate_Yellow", (0.95, 0.72, 0.02), rough=0.35)
INK      = mat("Ink_Black", (0.01, 0.01, 0.01), rough=0.5)
SIGNW    = mat("Sign_White", (0.92, 0.92, 0.9), rough=0.4, emit=(1, 1, 0.95), emit_str=0.4)
LENS     = mat("Headlamp_Lens", (0.9, 0.9, 0.92), metallic=0.6, rough=0.05, emit=(1, 0.97, 0.9), emit_str=0.6)
AMBER    = mat("Lamp_Amber", (1.0, 0.45, 0.0), rough=0.15, emit=(1.0, 0.4, 0.0), emit_str=1.2)
RED      = mat("Lamp_Red", (0.7, 0.02, 0.01), rough=0.15, emit=(1.0, 0.03, 0.02), emit_str=2.0)
REVERSE  = mat("Lamp_White", (0.9, 0.9, 0.9), rough=0.1)
GAP      = mat("Seam", (0.0, 0.0, 0.0), rough=0.9)
CHECKER  = checker_plate("Step_Plate")
CEILLAMP = mat("Ceiling_Lamp", (1, 1, 1), emit=(1, 0.95, 0.85), emit_str=6)
FLOOR    = mat("Studio_Floor", (0.04, 0.04, 0.045), rough=0.25)

# ================================================================ dimensions
HW = 0.80                       # half width
FA, RA = -1.30, 1.15            # front / rear axle x
WR_, TRK = 0.29, 0.68           # wheel radius, wheel centre |y|
WELL = 0.36

# ================================================================ body shell
outline = [(-2.00, 0.36), (-2.03, 0.74), (-1.99, 1.02), (-1.74, 1.78), (-1.66, 1.89), (1.98, 1.89), (2.00, 0.36)]
radii   = [0.05, 0.10, 0.06, 0.10, 0.12, 0.10, 0.05]
OUTL = fillet(outline, radii, 10)
body = prism("Body", OUTL, "y", -HW, HW, PAINT)
bv = body.modifiers.new("bevel", "BEVEL"); bv.width = 0.05; bv.segments = 6
bv.limit_method = "ANGLE"; bv.angle_limit = math.radians(30)
apply_mods(body)
def inset(poly, d):
    P = np.array(poly); n = len(P); out = []
    c = P.mean(axis=0)
    for i in range(n):
        a, b, q = P[i - 1], P[i], P[(i + 1) % n]
        e1 = b - a; e2 = q - b
        n1 = np.array([-e1[1], e1[0]]); n2 = np.array([-e2[1], e2[0]])
        n1 /= np.linalg.norm(n1) + 1e-12; n2 /= np.linalg.norm(n2) + 1e-12
        nn = n1 + n2; nn /= np.linalg.norm(nn) + 1e-12
        if np.dot(nn, c - b) < 0: nn = -nn
        out.append(tuple(b + nn * d))
    return out
inner = prism("Inner", inset(OUTL, 0.025), "y", -HW + 0.025, HW - 0.025, INTER)
body.data.materials.append(INTER)
boolean(body, inner)
print("shell faces", len(body.data.polygons))
# windscreen geometry (flat face from P0 to P1)
P0, P1 = Vector((-1.99, 0, 1.02)), Vector((-1.74, 0, 1.78))
TW = (P1 - P0).normalized(); NW = Vector((-TW.z, 0, TW.x))    # outward normal (points forward/up)
WS_LEN = (P1 - P0).length
PHI = math.atan2(TW.x, TW.z)
def ws_point(s, y, off=0.0): return P0 + TW * s + Vector((0, y, 0)) + NW * off

# --- cutters
C = []
for wx in (FA, RA):
    for s_ in (1, -1):
        C.append(cyl("well", (wx, s_ * 0.88, 0.30), WELL, 0.66, RUBBER, rot=(math.pi / 2, 0, 0), verts=96))
# windscreen
wc = cube("ws_cut", tuple(ws_point(0.42, 0)), (0.30, 1.40, 0.64), RUBBER, rot=(0, PHI, 0), bevel=0.07, segs=5)
C.append(wc)
# side windows: (x0, x1) per side; z 1.12..1.68
WZ0, WZ1 = 1.12, 1.68
LEFT_WIN  = [(-0.05, 0.74), (0.86, 1.62), (1.72, 1.90)]
RIGHT_WIN = [(-1.00, -0.22), (-0.10, 0.70), (0.82, 1.62), (1.72, 1.90)]
DOOR_WIN  = [(-1.93, 1.10), (-1.20, 1.10), (-1.20, 1.70), (-1.78, 1.70)]   # front doors (x,z)
for side, wins in ((-1, LEFT_WIN), (1, RIGHT_WIN)):
    for x0, x1 in wins:
        C.append(prism("win_cut", rrect((x0, WZ0), (x1, WZ1), 0.05), "y", side * 0.55, side * 1.2, RUBBER))
    C.append(prism("door_win_cut", fillet(DOOR_WIN, [0.03, 0.05, 0.05, 0.05], 6), "y", side * 0.55, side * 1.2, RUBBER))
# rear window
C.append(prism("rear_win_cut", rrect((-0.55, 1.14), (0.55, 1.66), 0.06), "x", 1.80, 2.30, RUBBER))
# passenger doorway (left side), floor level 0.52
DX0, DX1, DZ0, DZ1 = -0.90, -0.15, 0.52, 1.74
C.append(prism("door_cut", fillet([(DX0, DZ0), (DX1, DZ0), (DX1, DZ1), (DX0, DZ1)], [0.0, 0.0, 0.05, 0.05], 6), "y", -0.55, -1.2, PAINT))
cutter = join(C, "Cutter")
for m_ in (RUBBER,): body.data.materials.append(m_)
boolean(body, cutter)
print("cut faces", len(body.data.polygons))
smooth(body, 40)

PARTS = []        # everything that gets the tumblehome taper

# ================================================================ glass + rubber surrounds
def frame_y(name, pts_outer, pts_inner, y, depth, material):
    o = prism(name, pts_outer, "y", y - depth / 2, y + depth / 2, material)
    i = prism("fi", pts_inner, "y", y - depth, y + depth, material)
    boolean(o, i, transfer=False); return o

def frame_x(name, pts_outer, pts_inner, x, depth, material):
    o = prism(name, pts_outer, "x", x - depth / 2, x + depth / 2, material)
    i = prism("fi", pts_inner, "x", x - depth, x + depth, material)
    boolean(o, i, transfer=False); return o

def offset_rrect(x0, x1, z0, z1, r, d): return rrect((x0 - d, z0 - d), (x1 + d, z1 + d), r + d)

for side, wins in ((-1, LEFT_WIN), (1, RIGHT_WIN)):
    for x0, x1 in wins:
        PARTS.append(prism("SideGlass", offset_rrect(x0, x1, WZ0, WZ1, 0.05, 0.02), "y", side * (HW - 0.016), side * (HW - 0.010), GLASS))
        PARTS.append(frame_y("WinRubber", offset_rrect(x0, x1, WZ0, WZ1, 0.05, 0.018), rrect((x0, WZ0), (x1, WZ1), 0.05), side * (HW + 0.003), 0.008, RUBBER))
        if x1 - x0 > 0.4:      # sliding-window centre rail + latch
            xm = (x0 + x1) / 2
            PARTS.append(box("SlideRail", xm - 0.012, xm + 0.012, side * (HW - 0.008) - 0.004, side * (HW - 0.008) + 0.004, WZ0, WZ1, BLACK))
            PARTS.append(box("Latch", xm - 0.04, xm - 0.012, side * (HW - 0.020) - 0.006, side * (HW - 0.020) + 0.006, (WZ0 + WZ1) / 2 - 0.02, (WZ0 + WZ1) / 2 + 0.02, CHROME))
    dw_in = fillet(DOOR_WIN, [0.03, 0.05, 0.05, 0.05], 6)
    dw_out = fillet([(-1.95, 1.085), (-1.185, 1.085), (-1.185, 1.715), (-1.79, 1.715)], [0.04, 0.06, 0.06, 0.06], 6)
    dw_gl = fillet([(-1.97, 1.075), (-1.175, 1.075), (-1.175, 1.725), (-1.80, 1.725)], [0.04, 0.06, 0.06, 0.06], 6)
    PARTS.append(prism("DoorGlass", dw_gl, "y", side * (HW - 0.016), side * (HW - 0.010), GLASS))
    PARTS.append(frame_y("DoorRubber", dw_out, dw_in, side * (HW + 0.003), 0.008, RUBBER))
# windscreen glass + rubber + sun strip
wsg = cube("Windscreen", tuple(ws_point(0.42, 0, -0.012)), (0.006, 1.44, 0.68), GLASS, rot=(0, PHI, 0), bevel=0.08, segs=5)
PARTS.append(wsg)
ro = cube("WSRubberO", tuple(ws_point(0.42, 0, 0.002)), (0.008, 1.43, 0.67), RUBBER, rot=(0, PHI, 0), bevel=0.085, segs=5)
ri = cube("WSRubberI", tuple(ws_point(0.42, 0, 0.002)), (0.05, 1.40, 0.64), RUBBER, rot=(0, PHI, 0), bevel=0.07, segs=5)
boolean(ro, ri, transfer=False); PARTS.append(ro)
PARTS.append(cube("SunStrip", tuple(ws_point(0.70, 0, -0.009)), (0.002, 1.40, 0.09), TINT, rot=(0, PHI, 0)))
PARTS.append(text("SunStripText", "TERMINAL  -  PASAR BARU", 0.045, tuple(ws_point(0.70, 0, -0.0075)), "-x", WHITE))
PARTS[-1].rotation_euler = (math.pi / 2 - 0, 0, -math.pi / 2)
# rear glass
PARTS.append(prism("RearGlass", rrect((-0.57, 1.12), (0.57, 1.68), 0.08), "x", 2.0 - 0.016, 2.0 - 0.010, GLASS))
PARTS.append(frame_x("RearRubber", rrect((-0.568, 1.122), (0.568, 1.678), 0.078), rrect((-0.55, 1.14), (0.55, 1.66), 0.06), 2.0 + 0.003, 0.008, RUBBER))

# ================================================================ seams, gutters, handles
def seam_poly(pts, side, w=0.005):
    for a, b in zip(pts[:-1], pts[1:]):
        PARTS.append(seg_bar("Seam", a, b, w, 0.004, side * (HW + 0.0012), GAP))
for side in (1, -1):
    seam_poly([(-1.92, 0.44), (-1.15, 0.44), (-1.15, 1.76)], side)          # front door
    seam_poly([(-1.95, 0.70), (-1.92, 0.44)], side)
    PARTS.append(box("Gutter", -1.62, 1.96, side * HW - 0.006, side * HW + 0.012 * side + 0.006 * (1 - side), 1.77, 1.79, PAINT))
    PARTS.append(box("DoorHandle", -1.36, -1.24, side * (HW + 0.004) - 0.006, side * (HW + 0.004) + 0.006, 1.00, 1.03, CHROME, bevel=0.004))
    PARTS.append(box("KeyHole", -1.21, -1.19, side * (HW + 0.002) - 0.003, side * (HW + 0.002) + 0.003, 1.005, 1.025, CHROME))
seam_poly([(-0.10, 0.44), (-0.10, 0.46)], 1)
# sliding door seam on right side? (right side is solid) -- left side doorway already open
# rear door seams + handle
for a, b in (((-0.70, 0.45), (0.70, 0.45)), ((0.70, 0.45), (0.70, 1.80)), ((-0.70, 0.45), (-0.70, 1.80)), ((-0.70, 1.80), (0.70, 1.80))):
    d = Vector((0, b[0] - a[0], b[1] - a[1])); ln = d.length
    PARTS.append(cube("RearSeam", (2.0012, (a[0] + b[0]) / 2, (a[1] + b[1]) / 2), (0.004, abs(b[0] - a[0]) + 0.005, abs(b[1] - a[1]) + 0.005), GAP))
PARTS.append(box("RearHandle", 2.0, 2.012, -0.08, 0.08, 1.00, 1.035, CHROME, bevel=0.004))
PARTS.append(box("RearHinge1", 2.0, 2.01, -0.69, -0.65, 0.65, 0.73, BLACK))
PARTS.append(box("RearHinge2", 2.0, 2.01, -0.69, -0.65, 1.45, 1.53, BLACK))
# fuel flap (right side, rear)
PARTS.append(cyl("FuelFlap", (1.72, HW + 0.002, 0.82), 0.06, 0.004, PAINT, rot=(math.pi / 2, 0, 0), verts=32))
PARTS.append(cyl("FuelRing", (1.72, HW + 0.001, 0.82), 0.064, 0.002, GAP, rot=(math.pi / 2, 0, 0), verts=32))

# ================================================================ livery
def stripe(side, x0, x1, z0, z1, m):
    PARTS.append(box("Stripe", x0, x1, side * (HW + 0.0006) - 0.0007, side * (HW + 0.0006) + 0.0007, z0, z1, m))
for side, segs in ((-1, [(-1.96, -0.95), (-0.10, 1.97)]), (1, [(-1.96, 1.97)])):
    for x0, x1 in segs:
        stripe(side, x0, x1, 0.95, 1.00, WHITE)
        stripe(side, x0, x1, 1.01, 1.03, YELLOW)
for z0, z1, m in ((0.95, 1.00, WHITE), (1.01, 1.03, YELLOW)):
    PARTS.append(box("RearStripe", 2.0, 2.0014, -0.78, 0.78, z0, z1, m))
# lettering
PARTS.append(text("RouteR", "TERMINAL - PASAR BARU", 0.10, (0.45, HW + 0.0025, 0.82), "+y", WHITE))
PARTS.append(text("RouteL", "TERMINAL - PASAR BARU", 0.085, (0.95, -HW - 0.0025, 0.82), "-y", WHITE))
for side, f in ((1, "+y"), (-1, "-y")):
    PARTS.append(text("No", "05", 0.30, (-1.55, side * (HW + 0.0025), 0.70), f, WHITE))
    PARTS.append(text("Trayek", "TRAYEK", 0.065, (-1.55, side * (HW + 0.0025), 0.88), f, YELLOW))
    PARTS.append(text("Koperasi", "KOPERASI ANGKUTAN KOTA", 0.032, (0.45 if side > 0 else 0.95, side * (HW + 0.0025), 0.70), f, YELLOW))
PARTS.append(text("RearNo", "05", 0.26, (2.0025, 0.0, 0.72), "+x", WHITE))
PARTS.append(text("RearRoute", "TERMINAL - PASAR BARU", 0.06, (2.0025, 0.0, 1.07), "+x", WHITE))

# ================================================================ front end
for s_ in (1, -1):
    y = s_ * 0.57
    PARTS.append(box("HeadBezel", -2.055, -2.02, y - 0.16, y + 0.16, 0.73, 0.89, CHROME, bevel=0.012))
    PARTS.append(box("HeadLens", -2.062, -2.05, y - 0.145, y + 0.145, 0.745, 0.875, LENS, bevel=0.01))
    for k in range(5):
        yy = y - 0.12 + 0.06 * k
        PARTS.append(box("LensRib", -2.065, -2.06, yy - 0.003, yy + 0.003, 0.75, 0.87, CHROME))
    PARTS.append(box("TurnFront", -2.05, -2.02, y - 0.12, y + 0.12, 0.63, 0.69, AMBER, bevel=0.01))
    PARTS.append(box("SideMarker", -1.80, -1.74, s_ * (HW + 0.004) - 0.005, s_ * (HW + 0.004) + 0.005, 0.86, 0.89, AMBER, bevel=0.003))
PARTS.append(box("Grille", -2.05, -2.02, -0.38, 0.38, 0.72, 0.90, BLACK, bevel=0.01))
for k in range(5):
    z = 0.74 + 0.035 * k
    PARTS.append(box("GrilleSlat", -2.058, -2.048, -0.37, 0.37, z, z + 0.012, CHROME))
PARTS.append(box("FrontBumper", -2.12, -1.98, -0.83, 0.83, 0.38, 0.55, BLACK, bevel=0.03, segs=4))
PARTS.append(box("BumperLip", -2.125, -2.10, -0.80, 0.80, 0.53, 0.545, CHROME))
PARTS.append(box("FrontPlate", -2.128, -2.122, -0.20, 0.20, 0.405, 0.525, PLATE, bevel=0.004))
PARTS.append(text("FrontPlateTxt", "F 1705 AK", 0.075, (-2.1295, 0, 0.462), "-x", INK))
PARTS.append(box("TowHook", -2.14, -2.10, 0.42, 0.47, 0.40, 0.43, BLACK))
# wipers
for y0 in (-0.55, 0.05):
    a = ws_point(0.07, y0, 0.014); b = ws_point(0.13, y0 + 0.50, 0.014)
    PARTS.append(beam("WiperBlade", tuple(a), tuple(b), 0.012, 0.016, BLACK))
    PARTS.append(cyl("WiperPivot", tuple(ws_point(0.04, y0, 0.01)), 0.015, 0.03, BLACK, rot=(0, PHI, 0), verts=16))
# mirrors (on stalks)
for s_ in (1, -1):
    PARTS.append(beam("MirrorStalk", (-1.92, s_ * 0.80, 1.12), (-1.98, s_ * 1.00, 1.30), 0.018, 0.018, BLACK))
    PARTS.append(box("MirrorHead", -2.00, -1.95, s_ * 1.02 - 0.075, s_ * 1.02 + 0.075, 1.22, 1.44, BLACK, bevel=0.015))
    PARTS.append(box("MirrorGlass", -1.952, -1.948, s_ * 1.02 - 0.06, s_ * 1.02 + 0.06, 1.24, 1.42, CHROME))

# roof route sign
PARTS.append(box("SignBox", -1.42, -1.30, -0.56, 0.56, 1.92, 2.13, BLACK, bevel=0.01))
PARTS.append(box("SignFace", -1.425, -1.418, -0.53, 0.53, 1.94, 2.11, SIGNW))
PARTS.append(text("SignTxt", "05  TERMINAL - PASAR BARU", 0.085, (-1.427, 0, 2.025), "-x", PAINT))
for y in (-0.40, 0.40):
    PARTS.append(box("SignLeg", -1.38, -1.34, y - 0.02, y + 0.02, 1.88, 1.93, BLACK))

# ================================================================ rear end
for s_ in (1, -1):
    y = s_ * 0.735
    PARTS.append(box("TailBezel", 2.0, 2.02, y - 0.055, y + 0.055, 0.58, 1.07, CHROME, bevel=0.008))
    PARTS.append(box("TailRed", 2.012, 2.026, y - 0.045, y + 0.045, 0.59, 0.80, RED, bevel=0.006))
    PARTS.append(box("TailAmber", 2.012, 2.026, y - 0.045, y + 0.045, 0.81, 0.94, AMBER, bevel=0.006))
    PARTS.append(box("TailRev", 2.012, 2.026, y - 0.045, y + 0.045, 0.95, 1.06, REVERSE, bevel=0.006))
PARTS.append(box("RearBumper", 1.98, 2.12, -0.83, 0.83, 0.36, 0.52, BLACK, bevel=0.03, segs=4))
PARTS.append(box("RearStep", 2.00, 2.16, -0.32, 0.32, 0.515, 0.535, CHECKER, bevel=0.004))
PARTS.append(box("RearPlate", 2.122, 2.128, -0.20, 0.20, 0.385, 0.505, PLATE, bevel=0.004))
PARTS.append(text("RearPlateTxt", "F 1705 AK", 0.075, (2.1295, 0, 0.442), "+x", INK))
PARTS.append(cyl("Exhaust", (1.95, -0.45, 0.26), 0.026, 0.40, CHROME, rot=(0, math.pi / 2, 0), verts=24, fill="NOTHING"))

# ================================================================ doorway hardware
PARTS.append(box("StepPlate", DX0 + 0.02, DX1 - 0.02, -HW - 0.12, -HW + 0.02, 0.36, 0.40, CHECKER, bevel=0.005))
PARTS.append(box("StepBracket", DX0 + 0.05, DX1 - 0.05, -HW - 0.02, -HW + 0.02, 0.30, 0.37, BLACK))
PARTS.append(box("DoorSill", DX0, DX1, -HW + 0.0, -HW + 0.05, 0.505, 0.525, CHECKER))
for x in (DX0 + 0.04, DX1 - 0.04):
    PARTS.append(cyl("GrabPole", (x, -HW + 0.07, 1.10), 0.016, 1.10, CHROME, verts=20))

# ================================================================ undercarriage + wheel liners + arch trims
PARTS.append(box("Chassis", -1.85, 1.85, -0.50, 0.50, 0.20, 0.36, BLACK))
for wx in (FA, RA):
    for s_ in (1, -1):
        ln = cyl("Liner", (wx, s_ * 0.70, 0.30), WELL - 0.005, 0.22, RUBBER, rot=(math.pi / 2, 0, 0), verts=64)
        clip_below(ln, 0.37); PARTS.append(ln)
        bpy.ops.mesh.primitive_torus_add(major_radius=WELL + 0.01, minor_radius=0.014, location=(wx, s_ * HW, 0.30),
                                         rotation=(math.pi / 2, 0, 0), major_segments=96, minor_segments=10)
        tr = bpy.context.active_object; tr.name = "ArchTrim"; tr.data.materials.append(RUBBER); clip_below(tr, 0.37)
        PARTS.append(tr)
    for s_ in (1, -1):
        PARTS.append(box("MudFlap", wx + 0.38, wx + 0.39, s_ * 0.68 - 0.09, s_ * 0.68 + 0.09, 0.10, 0.37, RUBBER))

# ================================================================ interior
FLZ = 0.52
PARTS.append(box("Floor", -1.12, 1.97, -0.775, 0.775, FLZ - 0.04, FLZ, FLOORM))
PARTS.append(box("CabFloor", -1.97, -1.12, -0.775, 0.775, 0.66, 0.70, FLOORM))
def bench(name, x0, x1, ys, wall_side):
    y_in, y_wall = ys
    lo, hi = min(y_in, y_wall), max(y_in, y_wall)
    P = [box(name + "Base", x0, x1, lo, hi, FLZ, 0.88, INTER),
         box(name + "Cushion", x0, x1, lo - 0.01 * wall_side * 0, hi, 0.88, 0.97, VINYL, bevel=0.03, segs=3)]
    yb0 = y_wall - wall_side * 0.07
    P.append(box(name + "Back", x0 + 0.02, x1 - 0.02, min(yb0, y_wall), max(yb0, y_wall), 1.02, 1.40, VINYL, bevel=0.03, segs=3))
    for k in range(int((x1 - x0) / 0.45)):
        xx = x0 + 0.45 * (k + 1)
        P.append(box(name + "Tuck", xx - 0.004, xx + 0.004, min(yb0, y_wall) - 0.003, max(yb0, y_wall) + 0.003, 1.04, 1.38, INK))
    return P
PARTS += bench("BenchR", -1.02, 1.92, (0.39, 0.775), 1)
PARTS += bench("BenchL", -0.05, 1.92, (-0.39, -0.775), -1)
# kursi tambahan: small seat by the doorway, facing the passengers (rearward)
PARTS.append(box("ExtraSeatBase", -1.08, -0.78, -0.70, -0.38, FLZ, 0.86, INTER))
PARTS.append(box("ExtraSeat", -1.10, -0.76, -0.72, -0.36, 0.86, 0.94, VINYL, bevel=0.025))
PARTS.append(box("ExtraBack", -1.12, -1.06, -0.70, -0.38, 0.98, 1.28, VINYL, bevel=0.02))
# partition behind the front seats + grab bar
PARTS.append(box("Partition", -1.14, -1.10, -0.775, 0.775, FLZ, 1.08, INTER))
PARTS.append(cyl("PartitionBar", (-1.12, 0, 1.12), 0.016, 1.50, CHROME, rot=(math.pi / 2, 0, 0), verts=20))
# ceiling rails + lamp
for y in (-0.42, 0.42):
    PARTS.append(cyl("RoofRail", (0.45, y, 1.74), 0.014, 2.8, CHROME, rot=(0, math.pi / 2, 0), verts=16))
PARTS.append(box("CeilLamp", 0.20, 0.50, -0.08, 0.08, 1.830, 1.850, CEILLAMP, bevel=0.005))
# front cabin: driver seat (right), passenger bench (left), dash, steering wheel
PARTS.append(box("DriverSeat", -1.62, -1.22, 0.18, 0.68, 0.70, 0.98, VINYL, bevel=0.03))
PARTS.append(box("DriverBack", -1.26, -1.16, 0.18, 0.68, 0.98, 1.50, VINYL, bevel=0.03))
PARTS.append(box("PassSeat", -1.62, -1.22, -0.70, -0.10, 0.70, 0.98, VINYL, bevel=0.03))
PARTS.append(box("PassBack", -1.26, -1.16, -0.70, -0.10, 0.98, 1.45, VINYL, bevel=0.03))
PARTS.append(box("Dash", -1.97, -1.80, -0.77, 0.77, 0.96, 1.12, BLACK, bevel=0.03))
PARTS.append(box("Cluster", -1.84, -1.80, 0.28, 0.52, 1.08, 1.16, INK, bevel=0.01))
bpy.ops.mesh.primitive_torus_add(major_radius=0.20, minor_radius=0.016, location=(-1.70, 0.43, 1.22),
                                 rotation=(0, math.radians(-55), 0), major_segments=48, minor_segments=10)
sw = bpy.context.active_object; sw.name = "SteeringWheel"; sw.data.materials.append(BLACK); PARTS.append(sw)
PARTS.append(beam("SteeringColumn", (-1.70, 0.43, 1.22), (-1.86, 0.43, 1.02), 0.04, 0.04, BLACK))
for a in (0, 120, 240):
    r_ = math.radians(a)
    loc = Vector((0.2 * math.cos(r_), 0.2 * math.sin(r_), 0))
    rot = Matrix.Rotation(math.radians(-55), 3, "Y")
    p = Vector((-1.70, 0.43, 1.22)) + rot @ loc
    PARTS.append(beam("SWSpoke", (-1.70, 0.43, 1.22), tuple(p), 0.03, 0.01, BLACK))
PARTS.append(beam("GearLever", (-1.55, 0.05, 0.70), (-1.50, 0.05, 1.00), 0.015, 0.015, BLACK))
PARTS.append(cyl("GearKnob", (-1.50, 0.05, 1.01), 0.025, 0.03, INK, verts=16))
PARTS.append(box("Dashboard_Doll_Mat", -1.93, -1.85, -0.40, -0.10, 1.12, 1.125, PAINT))
PARTS.append(box("RearViewMirror", -1.80, -1.77, -0.12, 0.12, 1.66, 1.71, BLACK, bevel=0.01))

# ================================================================ tumblehome taper (upper body leans in)
def taper_y(y, z): return y * (1 - 0.05 * min(max((z - 1.0) / 0.89, 0.0), 1.0) ** 1.3)
for ob in [body] + PARTS:
    if ob is None or ob.type != "MESH": continue
    me = ob.data; me.transform(ob.matrix_world); ob.matrix_world = Matrix.Identity(4)
    for v in me.vertices: v.co.y = taper_y(v.co.y, v.co.z)
    me.update()

# ================================================================ wheels (steel 13", hub cap)
def lathe(name, r_in, r_out, half_w, material, n=4.5, seg=96, prof=72, grooves=()):
    rc, rr = (r_in + r_out) / 2, (r_out - r_in) / 2; pp = []
    for i in range(prof):
        t = 2 * math.pi * i / prof; c, s_ = math.cos(t), math.sin(t)
        rad = rc + rr * math.copysign(abs(c) ** (2 / n), c); ax = half_w * math.copysign(abs(s_) ** (2 / n), s_)
        if c > 0.7 and any(abs(ax - g) < 0.006 for g in grooves): rad -= 0.007
        pp.append((rad, ax))
    V, F = [], []
    for k in range(seg):
        ph = 2 * math.pi * k / seg
        for rad, ax in pp: V.append((rad * math.cos(ph), ax, rad * math.sin(ph)))
    for k in range(seg):
        for i in range(prof):
            a = k * prof + i; b = k * prof + (i + 1) % prof
            a2 = ((k + 1) % seg) * prof + i; b2 = ((k + 1) % seg) * prof + (i + 1) % prof
            F.append((a, b, b2, a2))
    ob = mesh_obj(name, V, F, material); fix_normals(ob); smooth(ob, 50); return ob

def make_wheel():
    P = []; hw = 0.082; ro = hw - 0.012; rim = 0.168
    P.append(lathe("Tyre", rim - 0.005, WR_, hw, TYRE, grooves=(-0.45 * hw, 0.0, 0.45 * hw)))
    P.append(cyl("Rim", (0, ro - 0.04, 0), rim, 0.08, STEEL, rot=(math.pi / 2, 0, 0), verts=64, fill="NOTHING"))
    d = cyl("Disc", (0, ro - 0.025, 0), rim - 0.004, 0.01, STEEL, rot=(math.pi / 2, 0, 0), verts=64)
    P.append(d)
    for k in range(6):
        a = 2 * math.pi * k / 6
        P.append(cyl("VentHole", (math.cos(a) * 0.115, ro - 0.019, math.sin(a) * 0.115), 0.022, 0.004, INK, rot=(math.pi / 2, 0, 0), verts=20))
    bpy.ops.mesh.primitive_uv_sphere_add(radius=0.075, location=(0, ro - 0.02, 0), segments=32, ring_count=16)
    cap = bpy.context.active_object; cap.scale = (1, 0.35, 1); cap.data.materials.append(CHROME); smooth(cap, 80); P.append(cap)
    for k in range(4):
        a = 2 * math.pi * k / 4 + math.pi / 4
        P.append(cyl("Lug", (math.cos(a) * 0.05, ro + 0.006, math.sin(a) * 0.05), 0.009, 0.015, CHROME, rot=(math.pi / 2, 0, 0), verts=6))
    return join(P, "Wheel")
proto = make_wheel()
for wx in (FA, RA):
    for s_ in (1, -1):
        ob = proto.copy(); ob.data = proto.data.copy(); col.objects.link(ob)
        ob.location = (wx, s_ * TRK, WR_); ob.rotation_euler = (0, 0, 0 if s_ > 0 else math.pi)
bpy.data.objects.remove(proto, do_unlink=True)

root = bpy.data.objects.new("Angkot", None); col.objects.link(root)
for o in list(col.objects):
    if o is not root and o.type == "MESH": o.parent = root

# ================================================================ studio
SV, SF = [], []
prof_pts = [(y, 0.0) for y in np.linspace(-30, 6, 30)]
for k in range(1, 16):
    a = (math.pi / 2) * k / 15; prof_pts.append((6 + 3 * math.sin(a), 3 - 3 * math.cos(a)))
prof_pts += [(9.0, z) for z in np.linspace(3.5, 14, 6)]
for x in (-30, 30):
    for y, z in prof_pts: SV.append((x, y, z))
Pn = len(prof_pts)
for i in range(Pn - 1): SF.append((i, i + 1, Pn + i + 1, Pn + i))
cyc = mesh_obj("Cyclorama", SV, SF, FLOOR); smooth(cyc, 80)

world = bpy.data.worlds.new("Studio"); scene.world = world
try: world.use_nodes = True
except Exception: pass
world.node_tree.nodes["Background"].inputs[0].default_value = (0.02, 0.02, 0.024, 1)

def aim(ob, target): ob.rotation_euler = (Vector(target) - ob.location).to_track_quat("-Z", "Y").to_euler()
def area(name, loc, sx, sy, power, target=(0, 0, 0.9)):
    ld = bpy.data.lights.new(name, "AREA"); ld.energy = power; ld.shape = "RECTANGLE"; ld.size = sx; ld.size_y = sy
    ob = bpy.data.objects.new(name, ld); col.objects.link(ob); ob.location = loc; aim(ob, target); return ob
area("Key", (0, 0, 6.5), 7.0, 4.0, 2000, target=(0, 0, 0))
for i, y in enumerate((-1.4, 0.0, 1.4)):
    area(f"Strip{i}", (0, y, 4.6), 8.0, 0.25, 350, target=(0, y, 0))
area("FrontFill", (-6.0, -4.0, 2.0), 5.0, 1.2, 900)
area("RearFill", (6.0, -3.5, 2.2), 5.0, 1.2, 700)
area("RimFar", (0.5, 5.5, 3.0), 8.0, 1.0, 800)
area("LowSide", (0, -7, 0.9), 9.0, 0.5, 350, target=(0, 0, 0.8))
cab = area("Cabin", (0.4, 0, 1.80), 2.4, 1.0, 70, target=(0.4, 0, 0.5)); cab.visible_camera = False; cab.visible_glossy = False

def camera(name, loc, target, lens=50):
    cd = bpy.data.cameras.new(name); cd.lens = lens
    ob = bpy.data.objects.new(name, cd); col.objects.link(ob); ob.location = loc; aim(ob, target); return ob
scene.camera = camera("Cam_FrontLeft", (-6.6, -5.2, 1.7), (0.05, 0, 0.95), 45)
camera("Cam_SideLeft", (0.0, -8.8, 1.15), (0.0, 0, 1.0), 45)
camera("Cam_RearLeft", (6.4, -4.9, 2.0), (0.0, 0, 0.95), 45)
camera("Cam_Front", (-8.0, -0.9, 1.25), (0.0, 0, 1.0), 50)
camera("Cam_Doorway", (-0.35, -2.55, 1.30), (0.55, 0.35, 0.95), 26)

r = scene.render; r.engine = "CYCLES"; r.resolution_x, r.resolution_y = 1600, 900
scene.cycles.samples = 64; scene.cycles.use_adaptive_sampling = True; scene.cycles.use_denoising = True
try: scene.cycles.denoiser = "OPENIMAGEDENOISE"
except Exception: pass
try: scene.view_settings.view_transform = "AgX"; scene.view_settings.look = "AgX - Punchy"
except Exception:
    try: scene.view_settings.look = "Punchy"
    except Exception: pass

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(OUT, "angkot.blend"))
for o in bpy.context.view_layer.objects: o.select_set(o.type == "MESH" and o.name != "Cyclorama")
try: bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "angkot.glb"), use_selection=True, export_format="GLB", export_apply=True)
except Exception as e: print("GLB export failed:", e)
print("BUILD OK", len([o for o in col.objects if o.type == "MESH"]), "meshes")
