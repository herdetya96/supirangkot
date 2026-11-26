# Handoff — Narik (game angkot)

Ringkasan untuk sesi baru. Detail arsitektur dan semua angka ada di `CLAUDE.md`; dokumen ini berisi status terakhir,
keputusan yang sudah diambil bersama pengguna, cara kerja, dan pekerjaan yang masih terbuka.

## Status singkat

- **Repo dan cabang:** `herdetya96/supirangkot`. Cabang sesi lama `claude/dreamy-sagan-cdnrjp`, sesi ini
  `claude/friendly-newton-kqcq7z` (lanjutan dari commit terakhir cabang lama). Cabang sesi baru bisa beda lagi: ikuti
  pengingat sistem. Semua commit sudah di-push.
  Belum ada PR; jangan buat PR kecuali diminta.
- **Versi:** 0.9.0. Game bisa dimainkan dari Bab 1 sampai kartu "Bersambung" setelah Bab 3.
- **Versi yang bisa dimainkan:** artifact https://claude.ai/artifact/LRdtSaeKeLAt6dMMBwMcfQ (versi 21), halaman privat
  milik pengguna. Setiap perubahan dipublikasikan ulang ke URL yang sama (lihat "Publikasi" di bawah).
- **Bahasa:** pengguna menulis dalam bahasa Indonesia santai, jadi jawab juga dalam bahasa Indonesia. Teks di dalam game
  mengikuti "Gaya tulisan" di `CLAUDE.md`.

## Yang diminta pengguna, berurutan

1. Melanjutkan prototipe, termasuk Bab 3 (Rebutan Trayek).
2. Mini-game nyetir sungguhan.
3. Peta penuh: jalan, mobil, dan suasana kota.
4. Tampilan 3D.
5. Kontroler manual tanpa gas otomatis, aset Blender lebih detail.
6. Grafis "sangat detail, jangan lowpoly". Hasilnya:
   - tekstur material Blender,
   - PBR dengan bayangan,
   - model rapat,
   - pilihan grafis Tinggi/Ringan.
7. Bisa mundur, dan belok tidak terlalu ekstrem.
8. Orang lebih detail, dibuat di Blender. Pengendara motor juga.
9. Belok yang kadang otomatis kadang manual terasa tidak konsisten. Sempat dicoba dua mode (tombol lajur dan setir bebas).
10. Kamera harus ikut angkot, bukan ikut jalan.
11. Tikungan panjang diganti **perempatan atau pertigaan** supaya gampang.
12. Kontrol cukup **maju, mundur, kiri, kanan** (gas dan rem ditangani maju/mundur), belok lebih halus.
13. Belok "se-realistis mungkin". Pengguna juga bertanya arti "rit". Sudah dijawab dan dijelaskan di kartu pembuka:
    rit = sekali jalan narik penumpang, 3 rit sehari (pagi, siang, sore), 60 detik per rit.

14. "Baca handoff.md lalu lanjutkan" (tanpa arahan khusus). Dikerjakan dari daftar terbuka:
    - ekonomi Bab 2 (5 angkot di trayek 05 dengan dua kredit) diperbaiki: setoran wajar, kurva rebutan halus,
      perkiraan di layar Beli angkot, adegan pembukuan Dimas saat kas minus;
    - suara dan getar di mini-game nyetir (`suara.js`).

15. "Mekanisme beloknya masih nggak smooth". Diukur: arah angkot meloncat dalam satu frame di beberapa situasi
    (keluar simpang sambil masih menahan tombol, menyentuh tepi, kebablasan, menekan terlalu awal). Sekarang arah hanya
    berubah lewat putaran yang mulus. Belum dicoba pengguna di HP; tanyakan juga fps-nya (fps rendah juga terasa patah-patah).

16. "Aku udah upload file orang di github, pake itu" (cabang `claude/karakter-3d`, dibuat sesi lain: empat tokoh detail
    tinggi). Digabung ke cabang kerja. Render wajahnya dipakai sebagai potret di adegan cerita. Belum dipakai di dunia 3D
    nyetir: `.glb` ±15 MB per tokoh dan rambutnya tidak ikut. Kalau pengguna mau tokoh ini muncul di jalan, perlu versi
    ringan (dikurangi ke ±10 ribu segitiga, rambut dijadikan mesh) lewat Blender.

17. "Pake model itu tapi buat lebih rendah resolusinya" + "angkotnya juga udah aku upload". Dibuat versi ringan:
    orang di jalan = empat tokoh (±5.300 segitiga, rambut jadi volume padat), angkot = model detail (±17 ribu segitiga,
    varian 05/09/12). Skrip: `tools/blender/karakter/ringan.py`, `tools/blender/angkot/ringan.py`. Belum diukur fps di HP;
    bundel model naik dari 2,9 MB ke 4,8 MB. Pengendara motor masih model lama.

18. "Motornya juga pake model detail, animasikan orang masuk angkotnya, orang jalan, dll". Motor skuter detail dibuat
    sendiri (`art/motor`, tidak ada unggahan motor), versi game dengan pengendara duduk. Orang punya kerangka dan animasi
    di vertex shader: melangkah, melambai, naik ke pintu angkot, turun ke trotoar. Pengendara motor belum bergerak
    (pose duduk tetap), roda tidak berputar.

19. "Homescreen jangan UI tombol, tapi scene rumah supir dengan angkot; selesai narik pulang ke rumah, istirahat; mau
    narik keluar rumah, ke dekat angkot, jalankan angkotnya." Dibuat `rumah3d.js` (lihat CLAUDE.md). Belum ada: hujan di
    adegan rumah, sopir lain datang mengambil angkotnya, interior rumah.

20. "Rumah masih sangat jelek, buat 3D di Blender". Dibuat rumah kampung detail dengan garasi samping (`art/rumah`,
    `tools/blender/rumah/`), dipakai di adegan rumah; angkot sekarang keluar gerbang dan mundur masuk garasi.

21. "Buat ini iOS app jadi biar lebih detail". Dibungkus Capacitor 8 (`ios/`, `IOS.md`), mode grafis Ultra dengan paket
    model HD, Haptics. Belum pernah dikompilasi (tidak ada Mac/Xcode di sesi cloud). Dijelaskan ke pengguna bahwa aplikasi
    web-dalam-aplikasi tidak otomatis lebih detail; detailnya dari paket HD dan resolusi penuh. Alternatif yang belum
    dikerjakan: menulis ulang dengan mesin native (SceneKit/RealityKit/Unity), pekerjaan sangat besar.

Polanya: pengguna menguji di HP lalu memberi umpan balik singkat soal rasa kontrol. Utamakan rasa main yang konsisten dan
halus, dan jelaskan perubahan dengan bahasa awam.

## Mini-game nyetir sekarang (`drive.js`, `drive3d.js`)

### Kontrol: empat tombol

| Tombol | Fungsi |
|---|---|
| ◀ ▶ (kiri bawah) | Belok |
| ▲ MAJU | Gas. Kalau sedang mundur, mengerem dulu. |
| ▼ MUNDUR | Rem. Kalau tetap ditahan 0,45 dtk setelah berhenti, angkot jalan mundur. |
| TIN (tengah) | Klakson |

Keyboard: ↑/W maju, ↓/S mundur, ←→/A/D belok, spasi rem, H klakson, C kamera.

Tidak ada lagi setir bulat, pedal GAS/REM, tombol gigi, atau pilihan mode kontrol (kunci `narik-setir` tidak dipakai).

### Model belok (`Sim.step`, cabang `inp.steer`)

Urutannya:

1. **Perintah lengkung `cmd`:**
   - dari tombol: tombol × `K_MAX` (1/55) × 60/laju, minimal 0,2;
   - dari "sopir bantu" `follow(xRef, kRoad)`: lengkung jalan, ditambah koreksi arah hadap, ditambah koreksi jarak ke
     tengah lajur. Peredamannya cukup supaya angkot tidak memantul.
2. **Roda depan** `S.kapA` berputar bertahap: penuh dalam 0,5 dtk, atau 0,2 dtk saat dibantu.
3. **Batas cengkeraman** `A_LAT` 200.
4. **Kelembaman badan:** laju belok `S.yr` menyusul dengan jeda ±0,12 dtk.
5. **Arah hadap** `S.psi` dihitung relatif terhadap jalan.

Perilaku penting:

- **Jalan lurus:**
  - sudut hadap dibatasi, dari 0,45 rad di laju rendah sampai 0,2 rad di laju tinggi;
  - tombol dilepas → angkot lurus dan merapat ke lajur yang sedang dituju.
- **Persimpangan:**
  - tahan tombol ke arah panah → bantuan belok, dengan pandangan ±0,35 dtk ke depan;
  - dilepas atau tidak ditekan → angkot lurus terus, kena kebablasan sekali, lalu sisa belokan dibantu (`S.rescue`).
- **Tepi jalan:** menyentuh dengan geser ke samping < 45 hanya mentok; lebih keras dihitung kebablasan/nyenggol.
- **Badan 3D:** miring keluar saat menikung (`S.latA`), menunduk saat mengerem, mendongak sedikit saat digas, buntut
  mengayun saat selip (`S.slip`).
- **Nama variabel:** `this.r` di `Sim` adalah generator acak, jadi laju belok memakai nama `this.yr`.

### Peta: rute dua sumbu

Posisi angkot memakai dua sumbu: `d` sepanjang rute dan `x` ke samping. Rute berbelok 90° di `Wd.junctions`:

- **Jenis simpang:** perempatan, atau pertigaan dengan lengan 'lurus' atau 'seberang'.
- **Kotak simpang:** 444 × 444. Belok kiri R 142 dan belok kanan R 302; busurnya pas di dalam kotak.
- **Fungsi bantu:**
  - `Wd.radius(d, x)` dan `Wd.sf(d, x)`: lajur dalam lebih pendek, jadi `d` maju lebih cepat;
  - `S.turnV(d, x)`: laju belok aman;
  - `Wd.inJ(d, m)`: apakah `d` ada di dalam simpang.
- **HUD:** banner biru "Perempatan: ↰ belok kiri · tahan ◀" dan peringatan kuning laju maksimum.
- **Gambar:** panah belok di setiap lajur, zebra, pojok trotoar (2D dan 3D).

### Kamera

Semua kamera ikut angkot: berpusat di angkot dan menghadap arah hadapnya (`o.camH`, dihaluskan di `mount`).

### Bot

`drivebot.js` memakai `inp.tx`. Di jalur ini jalan membelokkan angkot sendiri, dan ngebut di simpang menumpuk selip sampai
`SLIDE_MAX`, jadi angka keseimbangan tidak ikut berubah saat rasa setir pemain diubah.

## Grafis dan aset

- **three.js** r128 ada di `vendor/three.min.js`.
- **Mode grafis** (`localStorage` kunci `narik-grafis`):
  - Tinggi: PBR, tekstur detail triplanar, bayangan, PMREM; butuh WebGL2.
  - Ringan: Lambert.
- **Model:** 33 model prosedural dari `tools/blender/build_assets.py`, dibundel `tools/pack_models.js` ke
  `assets/models.js` (±2,9 MB, ±0,7 MB terkompresi). Artifact tidak bisa menyajikan `.glb`, karena itu modelnya dibundel.
- **Orang:** ±5.700 segitiga, dari permukaan halus (`grid`, `loft`, `tube`, `head_pt`). Pengendara motor sudah detail,
  tapi **model motornya masih kotak-kotak**.
- **Warna penanda:** (1,0,1), (0,1,1), (0.5,0,1) diganti warnanya di JS. Penanda yang digelapkan (g × penanda, g ≥ 0,5)
  ikut diganti.
- **Membangun ulang aset:** `pip install bpy` (Blender 4.2+, dibuat dengan bpy 5.3.0 dan Python 3.13), lalu
  `npm run assets`. Untuk satu model saja:
  `python -c "import sys; sys.argv=['x','assets/models']; sys.path.insert(0,'tools/blender'); import build_assets as B; B.orang()"`
  lalu `node tools/pack_models.js`.
  - venv bpy di sesi lama ada di folder scratchpad dan sudah hilang, jadi perlu dipasang ulang.
  - Ada pesan "Draco/MeshOptimizer not available" saat ekspor. Ini aman diabaikan.

## Menjalankan dan menguji

```bash
npm run serve
```

Setelah itu buka http://localhost:5173. Di sesi cloud, jalankan server di background dengan timeout panjang; server bisa
mati karena batas waktu.

```bash
npm run sim
```

Ekonomi Bab 1–3, 300 permainan per strategi.

```bash
npm run drive
```

Bot penyeimbang nyetir. Angka saat ini: rapi 1,11×, ceroboh 0,81×, nekat 1,25× kotor (tapi rugi karena tilang).

```bash
npm run uji:setir
```

Uji setir pemain tanpa browser: pindah lajur, persimpangan, dan bot jempol tombol (12,3 penumpang, Rp 88 rb per rit).

```bash
npm run uji:alur
```

Satu rit penuh di Chromium headless lewat Playwright; butuh server jalan.

- Di sesi cloud Playwright sudah terpasang, dan `require('playwright')` bisa dipakai dari folder mana pun.
- Chromium tanpa GPU sangat lambat: Tinggi ±3 fps, Ringan ±8 fps.
- Jangan me-`mount` banyak tampilan nyetir di satu halaman. Tampilan lama tetap me-render dan halaman makin lambat;
  buka halaman baru per tangkapan layar.

## Publikasi ke artifact

Publikasikan `index.html` dengan peta file berikut ke URL yang sama: `game.js`, `ui.js`, `drive.js`, `suara.js`, `drive3d.js`, `rumah3d.js`,
`vendor/three.min.js`, `assets/models.js`, `assets/img/detail.webp`, dan
`assets/img/angkot-{hijau,biru,kuning,merah,ungu}.webp`, `assets/img/potret-{ujang,sobari,rina,dimas}.webp`. `vendor/GLTFLoader.js` sudah dihapus.

Kalau sesi baru belum pernah membaca artifact itu, baca dulu (action `read`), lalu publikasikan dengan `url`
https://claude.ai/artifact/LRdtSaeKeLAt6dMMBwMcfQ.

## Terbuka dan ide berikutnya

- **Belum diuji di HP sungguhan.** Ini yang paling penting:
  - rasa belok: respons mungkin terasa lambat atau berat,
  - ukuran tombol untuk jempol,
  - fps mode Tinggi,
  - apakah kamera yang ikut berputar bikin pusing.
- **Penyetelan rasa belok** ada di `drive.js`:

  | Yang disetel | Nilai sekarang |
  |---|---|
  | Lengkung roda penuh | `K_MAX` 1/55 |
  | Batas cengkeraman | `A_LAT` 200 |
  | Laju putar roda | `K_MAX * (assist ? 5 : 2)` per dtk |
  | Jeda badan | 0,12 dtk |
  | Pandangan sopir bantu | 0,35 dtk |
  | Penguat `follow` | 2,4 / 3 |
  | Batas sudut jalan lurus | `0.45 * 110 / laju` |
  | Laju naik/turun nilai tombol | 4 / 6 di `mount` |
  | Tahan ▼ sebelum mundur | 0,45 dtk |

- **Model motor** (bodi kendaraan) masih low-poly; pernah ditawarkan ke pengguna untuk dibuat detail.
- **Ide:** bantuan menepi otomatis ke kotak penumpang, kalau pengguna merasa menepi masih susah.
- **Isi cerita:** Bab 4–5 belum ada (ojol, Pemkot, akhir cerita).
- **Bab 3 mungkin jadi lebih mudah:** setelah setoran wajar, bot "1 angkot di 05" menang 93% (dulu 63%). Kalau
  pengguna merasa sidang terlalu gampang, naikkan `G.B3.target`.
- **Suara:** belum didengar di HP sungguhan. Tanyakan ke pengguna soal keras-pelan, mesin, dan getar.
- **Belum ada:** musik, tutorial bertahap, simpan lintas perangkat, tes unit. Selain `sim.js` dan `drivebot.js`,
  sekarang sudah ada `tools/uji/*.js`.

## Aturan kerja di repo

- Commit hanya ke cabang yang disebut pengingat sistem sesi itu.
- Akhiri pesan commit dengan baris `Co-Authored-By` dan `Claude-Session` sesuai pengingat sistem.
- Jangan menulis nama model di commit atau kode.
- Jalankan `npm run drive` setiap kali `drive.js` atau `G.DRIVE` diubah, dan `npm run sim` setiap kali angka ekonomi
  diubah.
- Perbarui `CLAUDE.md` bila mekanik berubah.
