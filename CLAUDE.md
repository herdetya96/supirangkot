# Narik — catatan proyek

Web game manajemen angkot dengan cerita, bahasa Indonesia, dimainkan di browser HP (portrait).
Status: prototipe Bab 1–3 bisa dimainkan dari awal sampai "bersambung".

## Perintah

- `npm run serve` lalu buka `http://localhost:5173`
- `npm run sim` menjalankan `sim.js` (300 permainan per strategi). Jalankan setiap kali angka ekonomi diubah.
- `npm run drive` menjalankan `drivebot.js`: dua bot sopir memainkan mini-game nyetir 200 kali. Jalankan setiap kali `drive.js` atau `G.DRIVE` diubah.
- `npm run uji:setir` menguji setir pemain tanpa browser (`tools/uji/setir.js`): pindah lajur, persimpangan, bot jempol tombol.
  `npm run uji:alur` memainkan satu rit penuh di Chromium headless lewat Playwright (`tools/uji/alur.js`, butuh `npm run serve`).
- Ringkasan status dan riwayat permintaan pengguna untuk sesi baru: `handoff.md`.
- `npm run assets` membuat ulang tekstur material `assets/img/detail.webp` (`tools/blender/build_textures.py`), model 3D
  `assets/models/*.glb` (`tools/blender/build_assets.py`), membungkus model jadi `assets/models.js` (`tools/pack_models.js`),
  lalu merender gambar angkot menu `assets/img/angkot-<warna>.webp` dengan Cycles (`tools/blender/render_sprites.py`).
  Butuh Blender sebagai modul Python (`pip install bpy`, Blender 4.2+; dibuat dengan bpy 5.3.0, Python 3.13).
  Hasil `.glb` dan bundel ikut di-commit, jadi game tidak butuh Blender untuk jalan. `tools/pack_models.js` mengubah `.glb`
  jadi format ringkas sendiri (posisi uint16 terkuantisasi, normal int8, warna+jenis material uint8×4, ±13 byte per titik)
  di `assets/models.js` (±2,8 MB, ±0,7 MB terkompresi). `drive3d.js` memuatnya saat 3D pertama dipakai; GLTFLoader tidak dipakai.

## Arsitektur

- `game.js` = semua aturan main, tanpa DOM. Diekspor sebagai `window.NARIK` dan `module.exports`.
  State `s` adalah JSON polos (kecuali `s.today._choices`, yang dikosongkan sebelum disimpan).
  Acak memakai `rng(s)` berbasis `s.seed`, jadi satu seed = satu jalan cerita yang bisa diulang.
- `ui.js` = render ulang penuh ke `#v` lewat template string, aksi lewat `data-act`. Tidak boleh berisi aturan main.
- `drive.js` = mini-game nyetir (`window.NARIK_DRIVE`). `Sim` adalah fisika murni tanpa DOM, `mount` memasang canvas dan kontrol ke `#ny`.
  Juga berisi peta 2D (`draw`) dan HUD bersama (`drawHUD`, menerima `proj(d, x)` → titik layar).
- `drive3d.js` = tampilan 3D (`window.NARIK_3D`) memakai three.js r128 di `vendor/three.min.js` (MIT, `vendor/THREE-LICENSE`).
  Dua mode grafis (`localStorage` kunci `narik-grafis`, tombol di kartu pembuka rit):
  - **Tinggi** (bawaan, butuh WebGL2): `MeshStandardMaterial` PBR, warna linear + tone mapping ACES, peta pantulan langit
    (PMREM), bayangan matahari 2048² yang ikut kamera. Shader disisipi (`inject`): tiap titik membawa jenis material
    (atribut `cls`, 16 jenis, lihat `KELAS`/`DETAIL`), lalu fragmen mengambil tekstur detail Blender secara triplanar
    (ruang dunia untuk benda diam, ruang benda untuk kendaraan dan orang), memberi relief (bump dari turunan layar),
    kekasaran, dan logam per jenis. Tekstur detail = `assets/img/detail.webp` (atlas 4×4 lapisan 512 px) dimuat jadi
    `DataTexture2DArray` satu kanal.
  - **Ringan**: Lambert tanpa bayangan dan tanpa tekstur, seperti sebelumnya.
  Instance bangunan, pohon, tiang dipecah per blok 1400 unit (`chunked`); blok lebih jauh dari 3600 unit disembunyikan.
  Hanya menggambar: dunia statis per trayek dibangun sekali (`buildStatic`, jalan sebagai pita berwarna per titik, bangunan dan pohon
  lewat `InstancedMesh`), lalu tiap frame memindahkan kendaraan, orang, lampu, kamera. Satu `WebGLRenderer` dipakai ulang antar rit.
  Kalau three.js atau WebGL tidak ada, `mount` otomatis memakai peta 2D.
- Aset 3D (`assets/models/*.glb`) dimodelkan prosedural di Blender lewat `tools/blender/build_assets.py`: 33 model.
  Kendaraan: angkot (kabin penumpang berongga, jok, pintu geser terbuka, tulisan 3D dari huruf Blender; varian `angkot_05`,
  `angkot_09`, `angkot_12` dengan nomor dan papan trayek masing-masing, `angkot` = 05 untuk angkot lain), mobil, pikap, truk,
  motor dan versi parkir, kereta. Orang. Pinggir jalan: ruko, rumah, warung, pohon mangga dan kelapa, tiang listrik dan trafo,
  lampu jalan, lampu merah, gerobak, palang kereta (mesh `lengan` berporos, mesh `lampu`). Latar: `rumah_jauh` dan `pohon_jauh`
  (±50 segitiga). Landmark `lm_<jenis>`: terminal, pasar, masjid, sekolah, spbu, alun, kampus, stasiun, griya; muka di x = 0
  menghadap +X, luas 13,6 × 22,4 m, dipasang di u = −150 (kiri) atau u = 310 diputar 180° (kanan). Papan nama tetap tekstur
  kanvas di JS (`LBL` di `drive3d.js`), diletakkan tepat di depan papan pada model. `.glb` diekspor tanpa normal; JS menghitung
  normal bidang datar. Satuan meter, 1 m = 25 unit game (`M2U` di `drive3d.js`).
  Kendaraan menghadap +Y Blender (−Z three.js), bangunan menghadap +X (ke jalan). Warna disimpan per sudut, tanpa tekstur.
  Warna penanda diganti di JS (`assetGeo`): (1,0,1) cat badan/dinding, (0,1,1) baju/genteng, (0.5,0,1) helm/kanopi/terpal.
  Penanda yang digelapkan (g × penanda, g ≥ 0,5) diganti jadi g × warna pengganti, untuk kelim, manset, bibir helm.
  Orang (±5.700 segitiga) dibentuk dari permukaan halus (`grid`, `loft`, `tube`, `head_pt` di `build_assets.py`): kemeja
  berkerah dengan plaket, kancing, saku; celana dengan lipatan; sepatu bersol; tangan; kepala dengan rahang, hidung, mata,
  alis, telinga, bibir; rambut bergaris dahi. Mesh `celana`, `baju`, `kulit`, `rambut` memakai warna per titik (abu = bayangan
  lipatan, gelap = mata, sol) dikali warna per instance. Pengendara motor dibuat sama, duduk, dengan jaket ritsleting dan helm
  terbuka berkaca. Kalau aset gagal dimuat, bentuk kotak lama dipakai. Kampung jauh di belakang tetap kotak sederhana.
  Isi jalan (penumpang, motor, angkot biru, lubang, polisi, mogok) dibuat `G.driveSpec` dari seed game, jadi tetap aturan main di `game.js`.
  Hasilnya dikirim balik ke `G.runShift(s, sh, 'setir', hasil)`, yang mengubahnya jadi uang, bensin, kondisi, denda, dan nama baik.
- Simpan: `localStorage` kunci `narik-save-v1`, hanya di batas fase (pagi dan malam). Per browser, tidak lintas perangkat.
- Uang dalam ribuan rupiah (`250` = Rp 250.000). Format lewat `G.fmt`.

Alur satu hari: `startDay` → pemain mengatur armada → `depart` → tiga kali (`rollEvent` → `resolveEvent` → `runShift`) → `endDay` → adegan malam (`scenes`/`sceneDone`) → `nextDay`.

Bab 3 (Rebutan Trayek) disimpan di `s.b3` (`start`, `hearing`, `petisi`, `halaman`, `suap`, `deal`, `result`). Semua angka di `G.B3`.
Selama `G.b3on(s)`, mod `biru` menurunkan permintaan trayek 05 ×0,9, dan `endDay` memanggil `b3Day`:
tiap angkot yang jalan di trayek 05 menambah petisi (`G.petisiOf`). Di hari sidang `G.sidang(s)` dihitung jadi `s.b3.result`.
Skor: petisi 30, paguyuban 25 (nama baik ≥70, separuh di ≥55), armada 30 (angkot dengan `a.kir` dan kondisi ≥50), halaman buku Bapak 15.
Menang di skor 75: mod `trayek_bapak` (05 ×1,1). Kalah: `s.kuota05 = 2`, angkot lebihan dipindah (`kuotaFix`), dan kalau tidak ada izin lain
pemain dapat izin 09 gratis. Jalan ketiga: terima tawaran Sobari di adegan `b3_tekanan` (jual 2 angkot, kuota 3, tanpa sidang).
Suap ke oknum (`b3_oknum`): 50% +20 poin, 50% ketahuan −25 poin dan nama baik −15.

## Mini-game nyetir

Dipilih per rit kalau pemain sendiri yang pegang angkot. Mode otomatis (ngebut, biasa, ngetem, istirahat) tetap ada.
60 detik di kota Cibening. Empat tombol: ◀ ▶ di kiri (belok), klakson di tengah, ▼ MUNDUR dan ▲ MAJU di kanan.
- ▲ MAJU = gas (kalau sedang mundur, mengerem dulu). Dilepas, angkot melambat sendiri (`COAST` 75/dtk²).
- ▼ MUNDUR = rem; tetap ditahan 0,45 dtk setelah berhenti, angkot jalan mundur sampai `V_REV` 90 (`inp.mundur`).
  Mundur menabrak kendaraan di belakang = serempet. Lampu mundur putih di 2D dan 3D.
- ◀ ▶ = setir (`inp.steer`). Di `mount` nilai tombol naik ±0,25 dtk sampai penuh dan turun sedikit lebih cepat. Fisika
  (model kendaraan sederhana): perintah lengkung `cmd` → roda depan berputar bertahap (`S.kapA`, penuh dalam 0,5 dtk; 0,2 dtk
  saat dibantu) → dibatasi cengkeraman `A_LAT` → badan menyusul dengan kelembaman (`S.yr`, ±0,12 dtk) → arah hadap `S.psi`
  relatif terhadap jalan. Tombol: `cmd` = tombol × `K_MAX` (1/55) × 60/laju (min 0,2). Di jalan lurus sudut dibatasi
  0,45 rad di laju rendah sampai 0,2 rad di laju tinggi. Dilepas di jalan lurus: "sopir bantu" (`follow`) meluruskan dan
  merapatkan ke tengah lajur yang sedang dituju (teredam, tidak memantul). Tahan 0,15 dtk = geser kecil, lebih lama = pindah
  lajur. Badan 3D miring keluar saat menikung (`S.latA`), menunduk saat mengerem; buntut mengayun saat selip (`S.slip`).
  Menyentuh tepi dengan geser ke samping < 45 = hanya mentok; lebih keras = kebablasan/nyenggol.
- Persimpangan: tahan ◀ atau ▶ ke arah panah (>0,2) = bantuan belok: sopir bantu melihat ±0,35 dtk ke depan, jadi angkot
  mulai berbelok sedikit sebelum mulut simpang dan tetap di lajurnya (meleset ±16 unit kalau baru ditekan di mulut simpang,
  ±8 kalau sedikit lebih awal). Dilepas atau tidak
  ditekan di dalam simpang = angkot lurus terus, menabrak tepi = kebablasan sekali, sisa belokan dibantu.
  Daya belok dibatasi cengkeraman `A_LAT`, jadi ngebut = melebar ke tepi = kebablasan.
- Keyboard: ↑/W maju, ↓/S mundur, ←→/A/D belok, spasi rem, H klakson, C kamera.
Bot jempol tombol (reaksi 0,25 dtk, pelan di persimpangan, mulai menepi 900 unit sebelum penumpang): 12,3 penumpang,
Rp 88 rb per rit (kalau baru menepi 500 unit sebelumnya: 9,7 penumpang, Rp 65 rb). Bot drivebot tetap memakai
target lajur `inp.tx` (jalan membelokkan sendiri), jadi angka keseimbangan tidak berubah.
Angkot diam tidak bisa bergeser. Kamera atas menoleh ke landmark yang sedang dilewati. Tiga kamera, diganti dengan tombol di bawah (atau tombol C), pilihan disimpan di
`localStorage` kunci `narik-kamera`: 3D atas (bawaan), 3D belakang, dan peta 2D. Semua kamera ikut angkot, bukan jalan: berpusat di angkot dan
menghadap arah hadap angkot (`o.camH` = arah jalan + `S.yaw`, dihaluskan di `mount`), jadi di tikungan jalan terlihat
membelok di depan dan pemain tahu harus membelokkan. Fisika dijalankan dalam langkah ≤0,05 dtk per frame, jadi di HP lambat
waktu rit tetap sama dengan waktu nyata. Tombol Lanjut di ringkasan dikunci 0,7 dtk supaya rem/spasi yang masih
ditahan tidak menutupnya.

- Peta: `buildWorld(trayek)` membuat rute tetap per trayek dari seed nomor trayek (sama setiap main):
  ruas lurus dan persimpangan tempat rute belok 90° (kiri dan kanan bergantian, `Wd.junctions`: perempatan atau pertigaan), 10–12 perempatan (sekitar 60% berlampu merah), satu sungai dengan jembatan,
  satu perlintasan kereta, dan lima landmark (05: Terminal, Masjid, SD, SPBU, Pasar Baru; 09 berakhir di Kampus;
  12 dari Pasar Baru ke Stasiun dan Griya Asri). Bangunan pinggir jalan, tiang listrik, pejalan, dan kampung di
  belakang dibuat dari hash dan dicek tidak menimpa jalan (`Wd.blocked`).
- Fisika tetap dua sumbu: `d` sepanjang rute, `x` lateral. Gambar memetakan (d, x) ke dunia lewat `Wd.at(d)`.
- Penumpang: menepi ke kotak kuning dan berhenti untuk naik; berhenti di pinggir waktu "Kiri!". Ongkos dibayar saat turun,
  yang kelewatan tidak bayar.
- Lampu merah: siklus 16 dtk (hijau 11, kuning 1,5, merah 3,5). Palang kereta: 22 dtk, tertutup 6,5 dtk. Menerobos = tilang
  Rp 75 rb. Saat merah ada mobil melintas, dan saat palang tertutup kereta lewat; ditabrak = ganti rugi.
- Belok di persimpangan: kotak simpang 444 × 444 (lebar jalan dua arah dengan trotoar), lengan 'lurus' dan/atau 'seberang'
  (perempatan punya keduanya, pertigaan salah satu), panah belok di aspal, zebra. Lintasan belok kiri R 142 (memutari pojok
  dalam), kanan R 302 (menyeberangi kotak); busurnya pas di dalam kotak. Lajur dalam lebih sempit: `Wd.radius(d, x)`, dan
  `Wd.sf(d, x)` mempercepat d di lajur dalam supaya laju nyata sama. Laju belok aman `S.turnV(d, x)` = √(`A_LAT` 200 × jari-jari):
  kiri lajur tengah ±168 (30 km/j), lajur trotoar ±117, kanan ±246. Banner biru "Perempatan: ↰ belok kiri" dan peringatan
  kuning laju maks muncul 560 unit sebelumnya ("· tahan ◀" saat sudah dekat). Bot: jalan membelokkan sendiri, ngebut
  menumpuk selip sampai `SLIDE_MAX`. Bot rapi mengerem untuk `turnV`.
- Kendaraan searah (motor, mobil, pikap, truk, angkot biru) ikut berhenti di lampu merah dan di belakang kendaraan lain.
  Kendaraan arah berlawanan hanya hiasan.
- Tarif per penumpang = pendapatan rit dasar × kondisi × upgrade × kejadian ÷ `G.DRIVE.par` (12,5).
  Jumlah penumpang = 24 × permintaan. Angkot biru menyerobot satu rombongan (dua di Bab 3). Tenaga −20 per rit.

Hasil `drivebot.js` (200 rit, tiga trayek), dibanding pendapatan mode "Narik biasa":

| Bot | Ongkos | Naik | Serempet | Kebablasan | Kelewatan | Tilang |
|---|---|---|---|---|---|---|
| Rapi (patuh lampu, pelan di persimpangan, berhenti untuk "kiri") | 1,11× | 13,6 | 1,1 | 0 | 0 | 0 |
| Ceroboh (abaikan "kiri", tidak hati-hati) | 0,81× | 15,8 | 2,8 | 6,3 | 5,7 | 0,3 |
| Nekat (rapi tapi terobos lampu, ngebut di persimpangan) | 1,25× kotor | 15,3 | 1,7 | 5,5 | 0 | 1,2 |

Nekat dapat ongkos kotor ±Rp 13 rb lebih besar, tapi tilang (±Rp 75 rb per kejadian) dan ganti rugi tabrakan membuatnya rugi bersih.
Bot belum pernah diuji melawan tangan manusia di HP.

## Pilar desain

1. Setoran adalah timbangan. Sopir menanggung bensin dan membayar setoran tetap. Kalau sisa untuknya di bawah
   kebutuhan × 1,15 dia "tertekan": ngebut, mobil cepat rusak, risiko kecelakaan naik, kesetiaan turun, lalu pergi.
   Kalau tidak sanggup setor, dia mengamankan kebutuhan dapurnya dulu, jadi memeras tidak menambah uang.
2. Satu hari = 3–5 menit, ditutup "kabar besok" (cuaca, tanggal, jatuh tempo, pancingan cerita).
3. Selalu ada tiga target dengan jarak berbeda: hari ini, jatuh tempo terdekat, bab.
4. Gagal tidak mematikan: perpanjangan utang sekali, lalu "merintis lagi" dengan sedikit bekal.

## Angka keseimbangan (hasil `sim.js`, 300 permainan)

Bab 1, peluang lunas tepat waktu (hari ke-30):

| Gaya main | Lunas ≤ hari 30 |
|---|---|
| Santai (istirahat tiap siang), Dimas cuti | 40% |
| Narik biasa terus, Dimas cuti | 98% |
| Narik biasa terus, semesteran Dimas dibayar | 59% |
| Ngebut terus, semesteran dibayar | 23% |
| Atur tenaga dengan cermat, semesteran dibayar | 97% |

Bab 2, rata-rata hari sampai 5 angkot (pemain ikut narik): setoran bawaan 36 hari; setoran 0,65 × bersih trayek 35 hari;
0,80 → 33 hari dengan rata-rata 1 sopir pergi; 1,0 → 33 hari dengan 2,6 sopir pergi dan nama baik anjlok;
0,40 → 43 hari. Tanpa ikut narik: sekitar 71 hari, dan 18% permainan tidak sampai.
Semua angkot di trayek 05 dengan dua kredit (tanpa buka trayek lain): 47 hari, 21% permainan pernah kena jual paksa
(sebelum perbaikan setoran wajar dan kurva rebutan: 57 hari, 40%, dan 2,2 sopir pergi).

Rebutan penumpang: angkotmu sendiri di satu trayek dikali `G.crowdF(n)` = 1 / (1 + 0,12 (n − 1)), jadi tiap angkot
tambahan tetap menambah tapi makin sedikit (total 1; 1,79; 2,42; 2,94; 3,38). Setoran yang belum diubah pemain
(`a.setoranSet` kosong) mengikuti `G.fairSetoran`: 0,56 × bersih trayek, diturunkan kalau trayek sesak supaya sopir
membawa pulang kebutuhan × 1,25 di hari biasa. Disinkronkan (`syncSetoran`) tiap armada/trayek/sopir berubah, dan tiap
pagi kalau selisihnya ≥ Rp 20 rb. Tombol "Setoran wajar" di kartu angkot mengembalikan ke otomatis. Angkot baru masuk
trayek berizin yang paling sepi (`bestRoute`). Layar Beli angkot menampilkan perkiraan tambahan pemasukan per trayek
(`G.buyPreview`, menyalin state lalu menghitung `G.ownerDay`). Kas minus di Bab 2+ memicu adegan pembukuan Dimas
(`kasWarn`, paling sering sekali seminggu) sebelum jual paksa di −Rp 800 rb. Urutan trayek selalu `G.RIDS`
(`Object.keys` menaruh '12' duluan).

Bab 3, peluang menang sidang (bot ikut narik, setoran bawaan, nama baik bot ±90):

| Gaya main | Menang | Skor rata-rata |
|---|---|---|
| 2 angkot di 05, semua uji KIR, tebus halaman | 100% | 100 |
| 3 angkot di 05, sama | 99% | 100 (uang akhir ±2 jt lebih sedikit) |
| 1 angkot di 05, sama | 93% | 88 |
| 2 di 05, KIR, tanpa halaman | 99% | 85 |
| 2 di 05, halaman, tanpa uji KIR | 21% | 71 |
| Selalu pilihan terakhir | 3% | 38 |

Karena nama baik bot hampir selalu di atas 70, pilar paguyuban hampir selalu penuh di sim. Pemain sungguhan
mungkin lebih sering kehilangan pilar ini. Sejak setoran wajar, sopir jarang tertekan, jadi nama baik bot lebih tinggi
dan "1 angkot di 05" naik dari 63% ke 93%. Kalau Bab 3 terasa terlalu mudah, naikkan `G.B3.target` (petisi).

Catatan: angka ini dari bot, bukan manusia. Retensi belum pernah diuji ke pemain sungguhan.

## Yang belum ada

- Bab 4–5 (masuknya ojol, integrasi Pemkot dan beberapa akhir cerita). Bab 3 berakhir dengan kartu "Bersambung"
  dan permainan tetap bisa lanjut tanpa target bab.
- Simpan lintas perangkat, suara, tutorial bertahap, pencapaian, berbagi tangkapan layar.
- Pendapatan saat pemain pergi sudah ada (`G.offline`, maks 8 jam, hanya Bab 2) tapi belum diseimbangkan.
- Peta siang di layar rit masih skematis (SVG). Gambar angkot menu sekarang render Blender per warna; `angkot.webp`
  (render asli prototipe) tidak dipakai lagi tapi disimpan.
- Belum ada tes unit; `sim.js` dan `drivebot.js` satu-satunya jaring pengaman.
- Mini-game nyetir belum punya suara, getar, atau tutorial bertahap; penjelasannya hanya kartu sebelum rit.
- Tampilan 3D belum pernah diukur di HP sungguhan. Di Chromium headless (WebGL perangkat lunak): mode Tinggi ±3 fps,
  Ringan ±8 fps. Fisika memakai langkah ≤0,05 dtk dengan batas 0,5 dtk per frame; di bawah 2 fps waktu rit melambat.
- Masih bentuk JS sederhana: aspal, marka, sungai, jembatan, rambu, kampung jauh kalau aset gagal dimuat.
- Kontroler belum diuji dengan jari di HP sungguhan; ukuran tombol mungkin perlu disesuaikan.

## Gaya tulisan

Kalimat pendek, percakapan sehari-hari dengan sedikit warna Sunda. Dimas memanggil "Kak". Mang Ujang memanggil "Jang".
Tanpa nama merek kendaraan. Kota fiktif: Cibening.
