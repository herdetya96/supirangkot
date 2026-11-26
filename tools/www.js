/* Salin berkas game ke www/ untuk dibundel Capacitor ke aplikasi iOS (npx cap sync ios).
   Jalankan: node tools/www.js   (atau npm run www). Paket model HD (assets/models_hd.js) ikut kalau ada. */
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..'), OUT = path.join(ROOT, 'www');
const FILES = ['index.html', 'game.js', 'ui.js', 'drive.js', 'suara.js', 'drive3d.js', 'rumah3d.js', 'vendor/three.min.js', 'vendor/THREE-LICENSE',
  'assets/models.js', 'assets/models_hd.js'];
fs.rmSync(OUT, { recursive: true, force: true });
let n = 0, bytes = 0;
const salin = rel => {
  const src = path.join(ROOT, rel); if (!fs.existsSync(src)) return;
  const dst = path.join(OUT, rel); fs.mkdirSync(path.dirname(dst), { recursive: true }); fs.copyFileSync(src, dst); n++; bytes += fs.statSync(src).size;
};
FILES.forEach(salin);
for (const f of fs.readdirSync(path.join(ROOT, 'assets/img'))) if (/\.(webp|png|jpg)$/.test(f)) salin('assets/img/' + f);
console.log(`www/: ${n} berkas, ${(bytes / 1048576).toFixed(1)} MB`);
