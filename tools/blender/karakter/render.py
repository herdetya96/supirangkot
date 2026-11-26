"""Render satu kamera dari file karakter.

    python3 tools/blender/karakter/render.py art/karakter/blend/ujang.blend Cam_Face keluar.png [sampel] [persen]

Kamera: Cam_Full, Cam_Bust, Cam_Face, Cam_Head34, Cam_HeadBack, Cam_Eyes, Cam_Back, Cam_Side, Cam_Hand, Cam_Feet.
"""
import bpy, sys, os
blend, cam, out = sys.argv[1], sys.argv[2], os.path.abspath(sys.argv[3])
samples = int(sys.argv[4]) if len(sys.argv) > 4 else 32
pct = int(sys.argv[5]) if len(sys.argv) > 5 else 80
bpy.ops.wm.open_mainfile(filepath=blend); s = bpy.context.scene
s.camera = bpy.data.objects[cam]; s.cycles.samples = samples; s.render.resolution_percentage = pct; s.render.filepath = out
bpy.ops.render.render(write_still=True); print("RENDER OK", out)
