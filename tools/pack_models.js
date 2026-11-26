/* Bungkus assets/models/*.glb jadi satu skrip assets/models.js (base64), supaya model bisa dimuat
   di tempat yang tidak menyajikan file .glb. drive3d.js memuat skrip ini saat mode 3D pertama dipakai.
   Jalankan: node tools/pack_models.js   (ikut dijalankan oleh `npm run assets`) */
const fs = require('fs'), path = require('path');
const dir = path.join(__dirname, '..', 'assets', 'models');
const out = {};
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.glb')).sort()) out[f.replace(/\.glb$/, '')] = fs.readFileSync(path.join(dir, f)).toString('base64');
const js = '/* Dibuat oleh tools/pack_models.js dari assets/models/*.glb. Jangan diubah manual. */\nwindow.NARIK_GLB = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(path.join(dir, '..', 'models.js'), js);
console.log(Object.keys(out).length, 'model →', 'assets/models.js', (js.length / 1024).toFixed(0), 'KB');
