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
60 detik. Menepi ke lajur kiri dan berhenti di kotak kuning untuk menaikkan penumpang. Penumpang teriak "Kiri!" setelah
900–3100 unit; berhenti di pinggir untuk menurunkan. Ongkos dibayar waktu turun; yang kelewatan tidak bayar.
Tarif per penumpang = pendapatan rit dasar trayek × kondisi × upgrade × kejadian ÷ `G.DRIVE.par` (13,5).
Jumlah penumpang = 24 × permintaan, jadi hari ramai terasa ramai. Angkot biru menyerobot satu rombongan
(dua di Bab 3). Tenaga −20 per rit (−26 kalau rata-rata laju di atas 85%).

Hasil `drivebot.js` (200 rit), dibanding pendapatan mode "Narik biasa":

| Bot | Ongkos | Naik | Kelewatan | Tilang |
|---|---|---|---|---|
| Rapi (berhenti untuk "kiri", hindari lubang, pelan dekat polisi) | 1,13× | 16 | 0,1 | 0 |
| Ceroboh (abaikan "kiri", tidak hati-hati) | 0,82× | 18 | 6,8 | 0,4 |

Mode "Ngebut" otomatis tetap 1,3×, tapi tenaga −30 dan risiko tilang dan serempet. Bot belum pernah diuji melawan
tangan manusia di HP; kemungkinan manusia di awal lebih buruk dari bot rapi.

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

## Gaya tulisan

Kalimat pendek, percakapan sehari-hari dengan sedikit warna Sunda. Dimas memanggil "Kak". Mang Ujang memanggil "Jang".
Tanpa nama merek kendaraan. Kota fiktif: Cibening.
