# Narik sebagai aplikasi iOS

Game ini dibungkus jadi aplikasi iOS dengan [Capacitor](https://capacitorjs.com) 8: kode game tetap sama (HTML + JS +
three.js), berjalan di WKWebView di dalam aplikasi. Proyek Xcode ada di `ios/` (dibuat `npx cap add ios --packagemanager SPM`).

## Yang beda dibanding versi browser

- **Grafis Ultra** jadi bawaan (`drive3d.js`, `quality()`): resolusi layar Retina penuh (rasio piksel sampai 3, browser 1,5),
  antialias, bayangan matahari 4096², jarak pandang dan kabut lebih jauh, dan **paket model HD** `assets/models_hd.js`:
  orang ±13 ribu segitiga (browser ±5.300), angkot lebih rapat, motor dan pengendara 2×, rumah sopir dengan genteng
  bergelombang per keping (±39 ribu segitiga). Bisa diganti ke Tinggi/Ringan di kartu sebelum rit.
- **Getar sungguhan di iPhone** lewat plugin `@capacitor/haptics` (`suara.js`, `getar`): benturan, selip, lubang, tilang.
  Safari tidak mendukung `navigator.vibrate`, jadi di browser iPhone tidak ada getar.
- Layar penuh tanpa status bar (`@capacitor/status-bar`), dikunci tegak, area aman (poni/Dynamic Island) dihormati.
- Semua aset di dalam aplikasi, jadi bisa main tanpa internet. Simpanan tetap `localStorage` di dalam aplikasi.

## Membuat dan menjalankan (butuh Mac)

Dibutuhkan macOS dengan Xcode 16 atau lebih baru dan Node 22+ (syarat Capacitor 8). Untuk memasang di iPhone sendiri cukup Apple ID gratis;
untuk TestFlight/App Store perlu Apple Developer Program.

```
npm install
npm run ios            # salin game ke www/ lalu npx cap sync ios
npx cap open ios       # buka di Xcode
```

Di Xcode: pilih target **App** → Signing & Capabilities → pilih Team (Apple ID), lalu pilih iPhone dan tekan Run.
Bundle ID bawaan `id.cibening.narik` (ubah di `capacitor.config.json` dan Xcode kalau sudah dipakai).

Setiap kali kode game berubah: `npm run ios` lalu Run lagi di Xcode.

## Mencoba di Simulator (tanpa iPhone, tanpa akun Apple)

```
git clone --branch claude/friendly-newton-kqcq7z --single-branch https://github.com/herdetya96/supirangkot.git
cd supirangkot
npm install
npm run ios
npx cap run ios        # pilih simulator iPhone dari daftar; atau buka Xcode: npx cap open ios
```

Simulator tidak butuh Signing. Kalau daftar simulator kosong, pasang runtime iOS di Xcode → Settings → Components.
Getar (Haptics) tidak terasa di Simulator. Untuk melihat error JavaScript: Safari → Settings → Advanced → Show features for
web developers, lalu menu Develop → Simulator → Narik.

## Paket model HD

`assets/models_hd.js` ikut di-commit, jadi build aplikasi tidak butuh Blender. Membuat ulang (butuh `pip install bpy`):

```
npm run assets-hd
```

Pengali detail: `SKALA` (orang, motor), `HALUS` (angkot), `DETAIL=1` (rumah); lihat skrip `assets-hd` di `package.json`.

## Belum diuji

Proyek dibuat di Linux (tanpa Xcode), jadi belum pernah dikompilasi atau dijalankan di iPhone sungguhan. Yang perlu dicek
pertama: aplikasi terbuka, adegan rumah 3D tampil, getar terasa saat menabrak, fps mode Ultra (kalau berat, pilih Tinggi).
