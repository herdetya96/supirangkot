# Narik — Kisah Juragan Angkot

Prototipe web game manajemen angkot dengan cerita. Mulai dari satu angkot warisan
dan utang Rp 4,5 juta, sampai punya lima angkot dan merebut kembali trayek Bapak di sidang Dishub.

## Jalankan

```
npm run serve     # buka http://localhost:5173
npm run sim       # simulasi keseimbangan ekonomi (300 permainan per strategi)
npm run drive     # bot sopir memainkan mini-game nyetir
npm run assets    # buat ulang model 3D dari skrip Blender (butuh `pip install bpy`)
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
| `vendor/three.min.js`, `vendor/GLTFLoader.js` | three.js r128 dan pemuat glTF-nya (lisensi MIT di `vendor/THREE-LICENSE`) |
| `tools/blender/build_assets.py` | Skrip Blender yang memodelkan semua aset 3D |
| `assets/models/*.glb` | Hasil ekspor skrip Blender: kendaraan, orang, bangunan, perabot jalan |
| `drivebot.js` | Bot sopir untuk menyeimbangkan mini-game nyetir |
| `sim.js` | Bot yang memainkan ratusan permainan untuk menguji keseimbangan |
| `angkot.webp` | Render angkot dari model Blender |
| `CLAUDE.md` | Catatan desain, angka keseimbangan, dan rencana lanjutan |
