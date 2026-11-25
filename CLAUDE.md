# Narik — catatan proyek

Web game manajemen angkot dengan cerita, bahasa Indonesia, dimainkan di browser HP (portrait).
Status: prototipe Bab 1–2 bisa dimainkan dari awal sampai "bersambung".

## Perintah

- `npm run serve` lalu buka `http://localhost:5173`
- `npm run sim` menjalankan `sim.js` (300 permainan per strategi). Jalankan setiap kali angka ekonomi diubah.

## Arsitektur

- `game.js` = semua aturan main, tanpa DOM. Diekspor sebagai `window.NARIK` dan `module.exports`.
  State `s` adalah JSON polos (kecuali `s.today._choices`, yang dikosongkan sebelum disimpan).
  Acak memakai `rng(s)` berbasis `s.seed`, jadi satu seed = satu jalan cerita yang bisa diulang.
- `ui.js` = render ulang penuh ke `#v` lewat template string, aksi lewat `data-act`. Tidak boleh berisi aturan main.
- Simpan: `localStorage` kunci `narik-save-v1`, hanya di batas fase (pagi dan malam). Per browser, tidak lintas perangkat.
- Uang dalam ribuan rupiah (`250` = Rp 250.000). Format lewat `G.fmt`.

Alur satu hari: `startDay` → pemain mengatur armada → `depart` → tiga kali (`rollEvent` → `resolveEvent` → `runShift`) → `endDay` → adegan malam (`scenes`/`sceneDone`) → `nextDay`.

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

Catatan: angka ini dari bot, bukan manusia. Retensi belum pernah diuji ke pemain sungguhan.

## Yang belum ada

- Bab 3–5 (rebutan trayek, masuknya ojol, integrasi Pemkot dan beberapa akhir cerita).
- Simpan lintas perangkat, suara, tutorial bertahap, pencapaian, berbagi tangkapan layar.
- Pendapatan saat pemain pergi sudah ada (`G.offline`, maks 8 jam, hanya Bab 2) tapi belum diseimbangkan.
- Peta masih skematis; sprite angkot cuma satu sudut dan warna lain memakai filter CSS.
- Belum ada tes unit; `sim.js` satu-satunya jaring pengaman.

## Gaya tulisan

Kalimat pendek, percakapan sehari-hari dengan sedikit warna Sunda. Dimas memanggil "Kak". Mang Ujang memanggil "Jang".
Tanpa nama merek kendaraan. Kota fiktif: Cibening.
