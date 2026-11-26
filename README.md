# Narik — Kisah Juragan Angkot

Prototipe web game manajemen angkot dengan cerita. Mulai dari satu angkot warisan
dan utang Rp 4,5 juta, sampai punya lima angkot dan merebut kembali trayek Bapak di sidang Dishub.

## Jalankan

```
npm run serve     # buka http://localhost:5173
npm run sim       # simulasi keseimbangan ekonomi (300 permainan per strategi)
npm run drive     # bot sopir memainkan mini-game nyetir
npm run assets    # buat ulang model 3D dari skrip Blender (butuh `pip install bpy`)
npm run karakter  # buat ulang empat karakter detail tinggi (lihat art/karakter/README.md)
```

Tidak ada build step. Satu-satunya pustaka, three.js r128 untuk tampilan 3D, disimpan di `vendor/`.

## Isi

| File | Isi |
|---|---|
| `index.html` | Kerangka halaman dan seluruh CSS |
| `game.js` | Mesin game: ekonomi, sopir, trayek, kejadian, cerita. Logika murni, jalan juga di Node |
| `ui.js` | Tampilan dan interaksi. Tidak menyimpan aturan main |
| `drive.js` | Mini-game nyetir: fisika jalan, peta 2D, HUD |
| `drive3d.js` | Tampilan 3D mini-game nyetir (three.js) |
| `vendor/three.min.js` | three.js r128 (lisensi MIT di `vendor/THREE-LICENSE`) |
| `tools/blender/build_assets.py` | Skrip Blender yang memodelkan semua aset 3D (33 model) |
| `tools/blender/render_sprites.py` | Render Cycles gambar angkot menu per warna |
| `tools/blender/build_textures.py` | Tekstur material prosedural Blender → `assets/img/detail.webp` |
| `tools/pack_models.js` | Bungkus `.glb` jadi format ringkas `assets/models.js` |
| `assets/img/angkot-*.webp` | Gambar angkot menu hasil render Blender |
| `assets/models/*.glb` | Hasil ekspor skrip Blender: kendaraan, orang, bangunan, perabot jalan |
| `assets/models.js` | Semua model dalam format ringkas (dibuat `tools/pack_models.js`) |
| `tools/blender/karakter/` | Skrip Blender karakter detail tinggi: `build.py`, `lib.py`, `render.py`, `ambil_data.sh` |
| `art/karakter/` | Empat tokoh cerita versi realistis (`.blend`, `.glb`, render). Tidak dipakai game |
| `tools/blender/angkot/build.py` | Skrip Blender angkot detail tinggi (`npm run angkot-detail`) |
| `art/angkot/` | Angkot trayek 05 versi detail (`.blend`, `.glb`, render). Tidak dipakai game |
| `drivebot.js` | Bot sopir untuk menyeimbangkan mini-game nyetir |
| `sim.js` | Bot yang memainkan ratusan permainan untuk menguji keseimbangan |
| `angkot.webp` | Render angkot asli prototipe (tidak dipakai lagi) |
| `CLAUDE.md` | Catatan desain, angka keseimbangan, dan rencana lanjutan |
