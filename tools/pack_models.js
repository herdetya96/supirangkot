/* Bungkus assets/models/*.glb jadi satu skrip ringkas assets/models.js untuk drive3d.js.
   Format per mesh (bukan glTF lagi, supaya kecil dan cepat dibaca di HP):
     posisi  uint16 ×3, dikuantisasi dalam kotak batas mesh (presisi < 1 mm)
     normal  int8 ×3
     warna   uint8 ×4: RGB apa adanya dari Blender, A = jenis material (lihat KELAS di build_assets.py)
     indeks  uint16 atau uint32
   Jalankan: node tools/pack_models.js   (ikut dijalankan oleh `npm run assets`) */
const fs = require('fs'), path = require('path');
// node tools/pack_models.js [folder .glb] [berkas keluaran]  (bawaan assets/models -> assets/models.js)
const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'assets', 'models'));
const keluar = path.resolve(process.argv[3] || path.join(__dirname, '..', 'assets', 'models.js'));
function readGLB(buf) {
  const jl = buf.readUInt32LE(12), J = JSON.parse(buf.slice(20, 20 + jl).toString());
  const bin = buf.slice(20 + jl + 8);
  const acc = i => {
    const a = J.accessors[i], bv = J.bufferViews[a.bufferView], comp = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type];
    const Ty = { 5126: Float32Array, 5123: Uint16Array, 5125: Uint32Array, 5121: Uint8Array, 5122: Int16Array }[a.componentType];
    const off = (bv.byteOffset || 0) + (a.byteOffset || 0), stride = bv.byteStride || comp * Ty.BYTES_PER_ELEMENT;
    const out = new Float64Array(a.count * comp), max = { 5123: 65535, 5121: 255 }[a.componentType] || 1;
    for (let k = 0; k < a.count; k++) for (let c = 0; c < comp; c++) {
      const o = off + k * stride + c * Ty.BYTES_PER_ELEMENT;
      const v = Ty === Float32Array ? bin.readFloatLE(o) : Ty === Uint16Array ? bin.readUInt16LE(o) : Ty === Uint32Array ? bin.readUInt32LE(o) : Ty === Int16Array ? bin.readInt16LE(o) : bin.readUInt8(o);
      out[k * comp + c] = a.normalized ? v / max : v;
    }
    return { data: out, comp, count: a.count };
  };
  const meshes = {};
  for (const node of J.nodes) {
    if (node.mesh == null) continue;
    const pr = J.meshes[node.mesh].primitives[0];
    // atribut khusus glTF (nama diawali _, mis. bobot kerangka orang) dan custom property mesh (extras) ikut dibawa
    const extra = {}; for (const k of Object.keys(pr.attributes)) if (k[0] === '_') extra[k.slice(1)] = acc(pr.attributes[k]);
    const ex = (J.meshes[node.mesh].extras) || node.extras || null;
    meshes[node.name] = { pos: acc(pr.attributes.POSITION), nrm: pr.attributes.NORMAL != null ? acc(pr.attributes.NORMAL) : null, col: pr.attributes.COLOR_0 != null ? acc(pr.attributes.COLOR_0) : null, idx: pr.indices != null ? acc(pr.indices) : null, t: node.translation || [0, 0, 0], extra, ex };
  }
  return meshes;
}
const b64 = ta => Buffer.from(ta.buffer, ta.byteOffset, ta.byteLength).toString('base64');
const out = {}; let raw = 0;
for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.glb')).sort()) {
  const ms = readGLB(fs.readFileSync(path.join(dir, f))), parts = {};
  for (const [name, m] of Object.entries(ms)) {
    const n = m.pos.count, P = m.pos.data, mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) { const v = P[i * 3 + c] + m.t[c]; mn[c] = Math.min(mn[c], v); mx[c] = Math.max(mx[c], v); }
    const size = mx.map((v, c) => Math.max(1e-6, v - mn[c]));
    const qp = new Uint16Array(n * 3), qn = new Int8Array(n * 3), qc = new Uint8Array(n * 4);
    for (let i = 0; i < n; i++) for (let c = 0; c < 3; c++) {
      qp[i * 3 + c] = Math.round((P[i * 3 + c] + m.t[c] - mn[c]) / size[c] * 65535);
      qn[i * 3 + c] = m.nrm ? Math.round(m.nrm.data[i * 3 + c] * 127) : 0;
    }
    for (let i = 0; i < n; i++) for (let c = 0; c < 4; c++) qc[i * 4 + c] = m.col ? Math.round(m.col.data[i * m.col.comp + c] * 255) : (c < 3 ? 255 : 0);
    const I = m.idx ? (n > 65535 ? Uint32Array : Uint16Array).from(m.idx.data) : null;
    parts[name] = { n, min: mn.map(v => +v.toFixed(5)), size: size.map(v => +v.toFixed(5)), p: b64(qp), nr: b64(qn), c: b64(qc), i: I ? b64(I) : null, i32: I instanceof Uint32Array };
    // atribut khusus: uint8 0..255 (bobot 0..1)
    const xk = Object.keys(m.extra);
    if (xk.length) { parts[name].x = {}; for (const k of xk) { const a = m.extra[k], q = new Uint8Array(n); for (let i = 0; i < n; i++) q[i] = Math.max(0, Math.min(255, Math.round(a.data[i * a.comp] * 255))); parts[name].x[k] = b64(q); raw += n; } }
    if (m.ex) parts[name].ex = m.ex;
    raw += qp.byteLength + qn.byteLength + qc.byteLength + (I ? I.byteLength : 0);
  }
  out[f.replace(/\.glb$/, '')] = parts;
}
const js = '/* Dibuat oleh tools/pack_models.js dari assets/models/*.glb. Jangan diubah manual. */\nwindow.NARIK_MODEL = ' + JSON.stringify(out) + ';\n';
fs.writeFileSync(keluar, js);
console.log(Object.keys(out).length, 'model →', path.relative(process.cwd(), keluar), (js.length / 1024).toFixed(0), 'KB (data mentah', (raw / 1024).toFixed(0), 'KB)');
