# Narik — catatan proyek

Web game manajemen angkot dengan cerita, bahasa Indonesia, dimainkan di browser HP (portrait).
Status: prototipe Bab 1–3 bisa dimainkan dari awal sampai "bersambung".

## Perintah

- `npm run serve` lalu buka `http://localhost:5173`
- `npm run sim` menjalankan `sim.js` (300 permainan per strategi). Jalankan setiap kali angka ekonomi diubah.
- `npm run drive` menjalankan `drivebot.js`: dua bot sopir memainkan mini-game nyetir 200 kali. Jalankan setiap kali `drive.js` atau `G.DRIVE` diubah.

## Arsitektur

- `game.js` = semua aturan main, tanpa DOM. Diekspor sebagai `window.NARIK` dan `module.exports`.
  State `s` adalah JSON polos (kecuali `s.today._choices`, yang dikosongkan sebelum disimpan).
  Acak memakai `rng(s)` berbasis `s.seed`, jadi satu seed = satu jalan cerita yang bisa diulang.
- `ui.js` = render ulang penuh ke `#v` lewat template string, aksi lewat `data-act`. Tidak boleh berisi aturan main.
- `drive.js` = mini-game nyetir (`window.NARIK_DRIVE`). `Sim` adalah fisika murni tanpa DOM, `mount` memasang canvas dan kontrol ke `#ny`.
  Juga berisi peta 2D (`draw`) dan HUD bersama (`drawHUD`, menerima `proj(d, x)` → titik layar).
- `drive3d.js` = tampilan 3D (`window.NARIK_3D`) memakai three.js r128 di `vendor/three.min.js` (MIT, `vendor/THREE-LICENSE`).
  Hanya menggambar: dunia statis per trayek dibangun sekali (`buildStatic`, jalan sebagai pita berwarna per titik, bangunan dan pohon
  lewat `InstancedMesh`), lalu tiap frame memindahkan kendaraan, orang, lampu, kamera. Satu `WebGLRenderer` dipakai ulang antar rit.
  Kalau three.js atau WebGL tidak ada, `mount` otomatis memakai peta 2D.
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
60 detik di kota Cibening. Tiga kamera, diganti dengan tombol di bawah (atau tombol C), pilihan disimpan di
`localStorage` kunci `narik-kamera`: 3D atas (bawaan), 3D belakang, dan peta 2D. Setir jari memakai posisi angkot di layar
(`o.psx`, `o.ppu`), jadi sama untuk ketiganya. Fisika dijalankan dalam langkah ≤0,05 dtk per frame, jadi di HP lambat
waktu rit tetap sama dengan waktu nyata.

- Peta: `buildWorld(trayek)` membuat rute tetap per trayek dari seed nomor trayek (sama setiap main):
  ruas lurus dan tikungan 90° bergantian, 10–12 perempatan (sekitar 60% berlampu merah), satu sungai dengan jembatan,
  satu perlintasan kereta, dan lima landmark (05: Terminal, Masjid, SD, SPBU, Pasar Baru; 09 berakhir di Kampus;
  12 dari Pasar Baru ke Stasiun dan Griya Asri). Bangunan pinggir jalan, tiang listrik, pejalan, dan kampung di
  belakang dibuat dari hash dan dicek tidak menimpa jalan (`Wd.blocked`).
- Fisika tetap dua sumbu: `d` sepanjang rute, `x` lateral. Gambar memetakan (d, x) ke dunia lewat `Wd.at(d)`.
- Penumpang: menepi ke kotak kuning dan berhenti untuk naik; berhenti di pinggir waktu "Kiri!". Ongkos dibayar saat turun,
  yang kelewatan tidak bayar.
- Lampu merah: siklus 16 dtk (hijau 11, kuning 1,5, merah 3,5). Palang kereta: 22 dtk, tertutup 6,5 dtk. Menerobos = tilang
  Rp 75 rb. Saat merah ada mobil melintas, dan saat palang tertutup kereta lewat; ditabrak = ganti rugi.
- Tikungan: di atas 235 (90% saat hujan) angkot terlempar ke luar; menyentuh tepi = "kebablasan" (kondisi −1, laju turun).
- Kendaraan searah (motor, mobil, pikap, truk, angkot biru) ikut berhenti di lampu merah dan di belakang kendaraan lain.
  Kendaraan arah berlawanan hanya hiasan.
- Tarif per penumpang = pendapatan rit dasar × kondisi × upgrade × kejadian ÷ `G.DRIVE.par` (12,5).
  Jumlah penumpang = 24 × permintaan. Angkot biru menyerobot satu rombongan (dua di Bab 3). Tenaga −20 per rit.

Hasil `drivebot.js` (200 rit, tiga trayek), dibanding pendapatan mode "Narik biasa":

| Bot | Ongkos | Naik | Serempet | Kebablasan | Kelewatan | Tilang |
|---|---|---|---|---|---|---|
| Rapi (patuh lampu, pelan di tikungan, berhenti untuk "kiri") | 1,10× | 13,5 | 0,9 | 0 | 0 | 0 |
| Ceroboh (abaikan "kiri", tidak hati-hati) | 0,76× | 15,2 | 3,1 | 5,1 | 5,8 | 0,4 |
| Nekat (rapi tapi terobos lampu, ngebut di tikungan) | 1,17× kotor | 14,6 | 1,7 | 4,6 | 0,3 | 1,0 |

Nekat dapat ongkos kotor lebih besar, tapi tilang (±Rp 75 rb) dan ganti rugi tabrakan membuatnya rugi bersih.
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
0,80 → 33 hari dengan rata-rata 1 sopir pergi; 1,0 → 32 hari dengan 2,5 sopir pergi dan nama baik anjlok;
0,40 → 43 hari. Tanpa ikut narik: sekitar 70 hari, dan 22% permainan tidak sampai.

Bab 3, peluang menang sidang (bot ikut narik, setoran bawaan, nama baik bot ±90):

| Gaya main | Menang | Skor rata-rata |
|---|---|---|
| 2 angkot di 05, semua uji KIR, tebus halaman | 97% | 99 |
| 3 angkot di 05, sama | 97% | 98 (uang akhir ±2,4 jt lebih sedikit) |
| 1 angkot di 05, sama | 63% | 74 |
| 2 di 05, KIR, tanpa halaman | 97% | 84 |
| 2 di 05, halaman, tanpa uji KIR | 16% | 69 |
| Selalu pilihan terakhir | 0% | 32 |

Karena nama baik bot hampir selalu di atas 70, pilar paguyuban hampir selalu penuh di sim. Pemain sungguhan
mungkin lebih sering kehilangan pilar ini.

Catatan: angka ini dari bot, bukan manusia. Retensi belum pernah diuji ke pemain sungguhan.

## Yang belum ada

- Bab 4–5 (masuknya ojol, integrasi Pemkot dan beberapa akhir cerita). Bab 3 berakhir dengan kartu "Bersambung"
  dan permainan tetap bisa lanjut tanpa target bab.
- Masalah ekonomi Bab 2 yang terlihat saat menguji Bab 3: kalau 5 angkot semuanya di trayek 05 dan masih ada dua cicilan
  kredit, uang turun ratusan ribu per hari bahkan tanpa angkot biru, lalu angkot terjual paksa di −Rp 800 rb.
  Adegan pembuka Bab 3 sekarang memberi peringatan, tapi akar masalahnya di Bab 2 belum diseimbangkan.
- Simpan lintas perangkat, suara, tutorial bertahap, pencapaian, berbagi tangkapan layar.
- Pendapatan saat pemain pergi sudah ada (`G.offline`, maks 8 jam, hanya Bab 2) tapi belum diseimbangkan.
- Peta masih skematis; sprite angkot cuma satu sudut dan warna lain memakai filter CSS.
- Belum ada tes unit; `sim.js` dan `drivebot.js` satu-satunya jaring pengaman.
- Mini-game nyetir belum punya suara, getar, atau tutorial bertahap; penjelasannya hanya kartu sebelum rit.
- Tampilan 3D belum pernah diukur di HP sungguhan. Di Chromium headless (WebGL perangkat lunak) sekitar 10 fps;
  dunia statis trayek dibangun ±150 ms. Belum ada pilihan kualitas grafis.

## Gaya tulisan

Kalimat pendek, percakapan sehari-hari dengan sedikit warna Sunda. Dimas memanggil "Kak". Mang Ujang memanggil "Jang".
Tanpa nama merek kendaraan. Kota fiktif: Cibening.
