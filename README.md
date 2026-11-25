# Narik — Kisah Juragan Angkot

Prototipe web game manajemen angkot dengan cerita. Mulai dari satu angkot warisan
dan utang Rp 4,5 juta, sampai punya lima angkot.

## Jalankan

```
npm run serve     # buka http://localhost:5173
npm run sim       # simulasi keseimbangan ekonomi (300 permainan per strategi)
```

Tidak ada build step dan tidak ada dependensi.

## Isi

| File | Isi |
|---|---|
| `index.html` | Kerangka halaman dan seluruh CSS |
| `game.js` | Mesin game: ekonomi, sopir, trayek, kejadian, cerita. Logika murni, jalan juga di Node |
| `ui.js` | Tampilan dan interaksi. Tidak menyimpan aturan main |
| `sim.js` | Bot yang memainkan ratusan permainan untuk menguji keseimbangan |
| `angkot.webp` | Render angkot dari model Blender |
| `CLAUDE.md` | Catatan desain, angka keseimbangan, dan rencana lanjutan |
