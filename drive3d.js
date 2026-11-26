/* NARIK — tampilan 3D mini-game nyetir (three.js r128 dari vendor/three.min.js).
   Hanya menggambar. Fisika, peta, dan isi pinggir jalan tetap dari drive.js (Sim, buildWorld, buildScenery).
   Sumbu: dunia 2D (x, y) dari peta → three.js (X = x, Z = y), Y ke atas. 1 unit ≈ 1 px peta 2D.
   Kalau three.js atau WebGL tidak ada, drive.js memakai peta 2D. */
(function (root) {
'use strict';
let REN = null, GL_OK = null;
const STATIC = {}, GEO = {}, COLS = {};

function glOK() {
  if (GL_OK != null) return GL_OK;
  try { const c = document.createElement('canvas'); GL_OK = !!(root.WebGLRenderingContext && (c.getContext('webgl') || c.getContext('experimental-webgl'))); }
  catch (e) { GL_OK = false; }
  return GL_OK;
}
function available() { return !!root.THREE && !!root.NARIK_DRIVE && glOK(); }
// LIN: mode grafis tinggi memakai warna linear + tone mapping; semua warna palet (sRGB) dikonversi di sini
let LIN = false, HI = false;
function C(hex) { const k = (LIN ? 'L' : 'S') + hex; return COLS[k] || (COLS[k] = LIN ? new root.THREE.Color(hex).convertSRGBToLinear() : new root.THREE.Color(hex)); }
const rotOf = a => -a - Math.PI / 2;            // arah jalan → rotation.y benda yang menghadap -Z

/* ---------- aset dari Blender (tools/blender/build_assets.py → assets/models.js lewat tools/pack_models.js) ---------- */
const M2U = 25;                                   // 1 meter Blender = 25 unit game
const ASSET_NAMES = ['angkot', 'angkot_05', 'angkot_09', 'angkot_12', 'mobil', 'pikap', 'truk', 'motor', 'motor_parkir', 'kereta', 'orang', 'pohon_mangga', 'pohon_kelapa',
  'lampu_jalan', 'lampu_merah', 'gerobak', 'ruko', 'rumah', 'warung', 'tiang', 'tiang_trafo', 'rumah_jauh', 'pohon_jauh', 'palang',
  'lm_terminal', 'lm_pasar', 'lm_masjid', 'lm_sekolah', 'lm_spbu', 'lm_alun', 'lm_kampus', 'lm_stasiun', 'lm_griya'];
const MARK = { cat: [1, 0, 1], kedua: [0, 1, 1], ketiga: [0.5, 0, 1] };
// jenis material: urutan = lapisan assets/img/detail.webp = KELAS di build_assets.py.
// [kekuatan tekstur warna, kekuatan relief, kekasaran, logam, ukuran ulang (unit game)]
const KELAS = ['polos', 'cat', 'logam', 'kaca', 'karet', 'plester', 'bata', 'genteng', 'seng', 'kayu', 'aspal', 'paving', 'beton', 'rumput', 'kain', 'daun'];
const DETAIL = [[0, 0, 0.8, 0, 100], [0.25, 0.04, 0.3, 0.2, 120], [0.45, 0.1, 0.28, 0.9, 60], [0.15, 0, 0.05, 0.1, 200], [0.6, 0.9, 0.9, 0, 30],
  [0.75, 0.35, 0.92, 0, 140], [0.95, 1.0, 0.88, 0, 80], [0.85, 1.0, 0.7, 0, 70], [0.6, 1.1, 0.45, 0.6, 40], [0.9, 0.5, 0.72, 0, 60],
  [0.5, 0.28, 0.93, 0, 260], [0.75, 0.8, 0.85, 0, 60], [0.6, 0.4, 0.9, 0, 120], [0.9, 0.6, 0.95, 0, 90], [0.5, 0.3, 0.9, 0, 35], [0.9, 0.8, 0.85, 0, 45]];
const KI = k => Math.max(0, KELAS.indexOf(k));
const AS = { state: 'idle', geo: {}, promise: null, det: null };
function b64(s, Ty) { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return new Ty(u.buffer); }
function decode(m) {
  // format ringkas tools/pack_models.js → BufferGeometry: posisi (unit game), normal, warna sRGB mentah, jenis material
  const T = root.THREE, g = new T.BufferGeometry(), n = m.n;
  const qp = b64(m.p, Uint16Array), qn = b64(m.nr, Int8Array), qc = b64(m.c, Uint8Array);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3), cls = new Float32Array(n);
  for (let i = 0; i < n * 3; i++) { const c = i % 3; pos[i] = (m.min[c] + qp[i] / 65535 * m.size[c]) * M2U; nrm[i] = qn[i] / 127; }
  for (let i = 0; i < n; i++) { col[i * 3] = qc[i * 4] / 255; col[i * 3 + 1] = qc[i * 4 + 1] / 255; col[i * 3 + 2] = qc[i * 4 + 2] / 255; cls[i] = Math.floor(qc[i * 4 + 3] / 255 * 16); }
  g.setAttribute('position', new T.BufferAttribute(pos, 3)); g.setAttribute('normal', new T.BufferAttribute(nrm, 3));
  g.setAttribute('color', new T.BufferAttribute(col, 3)); g.setAttribute('cls', new T.BufferAttribute(cls, 1));
  if (m.i) g.setIndex(new T.BufferAttribute(b64(m.i, m.i32 ? Uint32Array : Uint16Array), 1));
  g.computeBoundingSphere(); return g;
}
function loadDetail() {
  // atlas 4×4 lapisan 512 px (tools/blender/build_textures.py) → DataTexture2DArray satu kanal, dengan mipmap
  return new Promise(res => {
    const T = root.THREE; if (!T.DataTexture2DArray) { res(null); return; }
    const im = new Image();
    im.onload = () => {
      try {
        const N = im.width / 4, cv = document.createElement('canvas'); cv.width = cv.height = im.width;
        const cx = cv.getContext('2d'); cx.drawImage(im, 0, 0); const px = cx.getImageData(0, 0, im.width, im.width).data;
        const data = new Uint8Array(N * N * 16);
        for (let l = 0; l < 16; l++) { const r0 = Math.floor(l / 4) * N, c0 = (l % 4) * N; for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) data[l * N * N + y * N + x] = px[((r0 + y) * im.width + c0 + x) * 4]; }
        const t = new T.DataTexture2DArray(data, N, N, 16);
        t.format = T.RedFormat; t.type = T.UnsignedByteType; t.wrapS = t.wrapT = T.RepeatWrapping;
        t.minFilter = T.LinearMipmapLinearFilter; t.magFilter = T.LinearFilter; t.generateMipmaps = true; t.needsUpdate = true;
        res(t);
      } catch (e) { res(null); }
    };
    im.onerror = () => res(null); im.src = 'assets/img/detail.webp';
  });
}
function loadAssets() {
  if (AS.promise) return AS.promise;
  AS.state = 'memuat';
  const bundle = () => new Promise(res => {
    if (root.NARIK_MODEL) { res(true); return; }
    const sc = document.createElement('script'); sc.src = 'assets/models.js'; sc.async = true;
    sc.onload = () => res(!!root.NARIK_MODEL); sc.onerror = () => res(false); document.head.appendChild(sc);
  });
  AS.promise = Promise.all([bundle(), loadDetail()]).then(([ok, det]) => {
    AS.det = det;
    if (!ok) { AS.state = 'gagal'; return false; }
    try { for (const n of ASSET_NAMES) { const parts = root.NARIK_MODEL[n]; if (!parts) continue; AS.geo[n] = {}; for (const [k, m] of Object.entries(parts)) AS.geo[n][k] = decode(m); } }
    catch (e) { AS.state = 'gagal'; return false; }
    AS.state = ASSET_NAMES.every(n => AS.geo[n]) ? 'siap' : 'gagal'; return AS.state === 'siap';
  });
  return AS.promise;
}
const hasAsset = n => AS.state === 'siap' && !!AS.geo[n];
function assetGeo(name, part, cols) {
  // salin geometri aset, ganti warna penanda (cat/kedua/ketiga), dan ubah ke linear di mode grafis tinggi
  part = part || 'main';
  const key = 'A:' + LIN + name + ':' + part + ':' + JSON.stringify(cols || {}); if (GEO[key]) return GEO[key];
  const src = AS.geo[name][part]; if (!cols && !LIN) return (GEO[key] = src);
  const g = src.clone(), a = g.getAttribute('color').array;
  const rep = Object.entries(cols || {}).map(([k, hex]) => [MARK[k], new root.THREE.Color(hex)]);
  const tmp = new root.THREE.Color();
  for (let i = 0; i < a.length; i += 3) {
    // penanda boleh digelapkan (g × penanda, g ≥ 0,5) untuk kelim, manset, bibir helm: hasilnya g × warna pengganti
    for (const [m, col] of rep) {
      const g = (a[i] * m[0] + a[i + 1] * m[1] + a[i + 2] * m[2]) / (m[0] * m[0] + m[1] * m[1] + m[2] * m[2]);
      if (g >= 0.5 && Math.abs(a[i] - g * m[0]) < 0.02 && Math.abs(a[i + 1] - g * m[1]) < 0.02 && Math.abs(a[i + 2] - g * m[2]) < 0.02) { a[i] = col.r * g; a[i + 1] = col.g * g; a[i + 2] = col.b * g; break; }
    }
    if (LIN) { tmp.setRGB(a[i], a[i + 1], a[i + 2]).convertSRGBToLinear(); a[i] = tmp.r; a[i + 1] = tmp.g; a[i + 2] = tmp.b; }
  }
  return (GEO[key] = g);
}

/* ---------- material: PBR dengan tekstur detail triplanar (grafis tinggi) atau Lambert (ringan) ---------- */
let DETP = null;
function detailUniforms() {
  if (DETP) return DETP;
  const T = root.THREE;
  DETP = { detArr: { value: AS.det }, detP: { value: DETAIL.map(d => new T.Vector4(d[0], d[1], d[2], d[3])) }, detS: { value: DETAIL.map(d => d[4]) } };
  return DETP;
}
function inject(sh, obj) {
  Object.assign(sh.uniforms, detailUniforms());
  sh.vertexShader = 'attribute float cls;\nvarying float vCls;\nvarying vec3 vDP;\nvarying vec3 vDN;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
    vCls = cls;
    ${obj ? 'vDP = position; vDN = objectNormal;' : `vec4 dwp = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      dwp = instanceMatrix * dwp;
    #endif
    dwp = modelMatrix * dwp; vDP = dwp.xyz;
    vec3 dn = objectNormal;
    #ifdef USE_INSTANCING
      dn = mat3(instanceMatrix) * dn;
    #endif
    vDN = normalize(mat3(modelMatrix) * dn);`}`);
  sh.fragmentShader = `precision highp sampler2DArray;
uniform sampler2DArray detArr; uniform vec4 detP[16]; uniform float detS[16];
varying float vCls; varying vec3 vDP; varying vec3 vDN;
float detTri(float layer, float sc) {
  vec3 w = pow(abs(normalize(vDN)), vec3(4.0)); w /= (w.x + w.y + w.z + 1e-5);
  vec3 p = vDP / sc;
  return texture(detArr, vec3(p.zy, layer)).r * w.x + texture(detArr, vec3(p.xz, layer)).r * w.y + texture(detArr, vec3(p.xy, layer)).r * w.z;
}
vec3 detBump(vec3 sp, vec3 sn, vec2 dH) {
  vec3 sx = dFdx(sp), sy = dFdy(sp), r1 = cross(sy, sn), r2 = cross(sn, sx);
  float det = dot(sx, r1); vec3 grad = sign(det) * (dH.x * r1 + dH.y * r2);
  return normalize(abs(det) * sn - grad);
}
` + sh.fragmentShader
    .replace('#include <map_fragment>', `#include <map_fragment>
    int dci = int(vCls + 0.5); vec4 dp = detP[dci];
    float dh = detTri(float(dci), detS[dci]);
    diffuseColor.rgb *= mix(1.0, dh * 2.0, dp.x);`)
    .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
    roughnessFactor = clamp(dp.z * (0.75 + 0.5 * dh), 0.04, 1.0);`)
    .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
    metalnessFactor = dp.w;`)
    .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
    if (dp.y > 0.0) normal = detBump(-vViewPosition, normal, vec2(dFdx(dh), dFdy(dh)) * dp.y * 7.0);`);
}
function mat(o) {
  // o: { vc: warna per titik, color, obj: tekstur ikut benda (kendaraan, orang) bukan dunia, emissive }
  const T = root.THREE;
  if (!HI) return new T.MeshLambertMaterial({ vertexColors: !!o.vc, color: o.color != null ? C(o.color) : 0xffffff, emissive: o.emissive || 0 });
  const m = new T.MeshStandardMaterial({ vertexColors: !!o.vc, color: o.color != null ? C(o.color) : 0xffffff, roughness: 0.8, metalness: 0, emissive: o.emissive || 0 });
  if (AS.det) { m.onBeforeCompile = sh => inject(sh, !!o.obj); m.customProgramCacheKey = () => 'narik-det' + (o.obj ? 'o' : 'w'); }
  return m;
}
const HELM = ['#e33b2f', '#ffcc00', '#f2f2f2', '#3399ff', '#1b1b1b', '#33aa55', '#ff8800', '#cc33cc'];
const RAMBUT = ['#1b1714', '#2a221c', '#1b1714', '#f2f2f2', '#d9a1b8', '#3e6fb1', '#1b1714', '#6b3b2a'];
const CELANA = ['#2f3d4a', '#4a4a4a', '#3b5b7a', '#6b5a45', '#22262a'];

/* ---------- pembuat geometri berwarna per titik ---------- */
class GB {
  // this.k = jenis material untuk segitiga berikutnya (lihat KELAS)
  constructor() { this.p = []; this.c = []; this.q = []; this.k = 0; }
  kls(k) { this.k = KI(k); return this; }
  tri(a, b, c, col) { const q = typeof col === 'string' ? C(col) : col; this.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]); for (let i = 0; i < 3; i++) { this.c.push(q.r, q.g, q.b); this.q.push(this.k); } }
  quad(a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); }
  box(x0, x1, y0, y1, z0, z1, col) {
    this.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col);
    this.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col);
    this.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col);
    this.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col);
    this.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col);
    this.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col);
  }
  prism(x0, x1, y0, y1, z0, z1, col, gable) {       // atap pelana, bubungan searah Z
    const xm = (x0 + x1) / 2;
    this.quad([x0, y0, z0], [x0, y0, z1], [xm, y1, z1], [xm, y1, z0], col);
    this.quad([x1, y0, z1], [x1, y0, z0], [xm, y1, z0], [xm, y1, z1], col);
    this.tri([x0, y0, z1], [x1, y0, z1], [xm, y1, z1], gable || col);
    this.tri([x1, y0, z0], [x0, y0, z0], [xm, y1, z0], gable || col);
  }
  flat(pts, y, col) { for (let i = 1; i < pts.length - 1; i++) this.tri([pts[0][0], y, pts[0][1]], [pts[i + 1][0], y, pts[i + 1][1]], [pts[i][0], y, pts[i][1]], col); }   // titik searah jarum jam di peta (z ke bawah) → menghadap ke atas
  geo() {
    const T = root.THREE, g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(this.p, 3));
    g.setAttribute('color', new T.Float32BufferAttribute(this.c, 3));
    g.setAttribute('cls', new T.Float32BufferAttribute(this.q, 1));
    g.computeVertexNormals(); g.computeBoundingSphere(); return g;
  }
}

/* ---------- model kendaraan (sekali per jenis dan warna) ---------- */
const DARK = '#1d2a33', TIRE = '#151515';
function wheels(b, w, l, r) { for (const sx of [-1, 1]) for (const sz of [-1, 1]) b.box(sx * w / 2 - 3, sx * w / 2 + 3, 0, r * 2, sz * (l / 2 - r - 4) - r, sz * (l / 2 - r - 4) + r, TIRE); }
function vehicleGeo(kind, col, col2, col3) {
  if (hasAsset(kind)) return assetGeo(kind, 'main', kind === 'motor' ? { cat: col, kedua: col2 || '#3e7cb1', ketiga: col3 || '#e33b2f' } : { cat: col });
  const key = kind + col; if (GEO[key]) return GEO[key];
  const b = new GB(), light = '#fff6c8', tail = '#8a1c14';
  if (kind === 'angkot') {
    wheels(b, 42, 84, 8);
    b.box(-22, 22, 8, 46, -42, 42, col);
    b.box(22, 22.8, 28, 42, -30, 34, DARK); b.box(-22.8, -22, 28, 42, -30, 34, DARK);
    b.box(-19, 19, 26, 44, -42.8, -42, DARK); b.box(-17, 17, 28, 42, 42, 42.8, DARK);
    b.box(22, 22.6, 19, 23, -38, 40, '#f4f4f4'); b.box(-22.6, -22, 19, 23, -38, 40, '#f4f4f4');
    b.box(-20, 20, 46, 49, -38, 40, col);
    for (const z of [-24, 0, 24]) b.box(-18, 18, 49, 51, z - 1.5, z + 1.5, '#333');
    b.box(-15, 15, 49, 58, -38, -35, '#fbfbf2');
    b.box(-19, -13, 13, 19, -42.8, -42, light); b.box(13, 19, 13, 19, -42.8, -42, light);
    b.box(-20, -14, 14, 19, 42, 42.8, tail); b.box(14, 20, 14, 19, 42, 42.8, tail);
  } else if (kind === 'mobil') {
    wheels(b, 34, 66, 7);
    b.box(-17, 17, 6, 24, -33, 33, col);
    b.box(-15, 15, 24, 39, -12, 18, DARK); b.box(-15.2, 15.2, 39, 41, -11, 17, col);
    b.box(-15, -10, 12, 17, -33.8, -33, light); b.box(10, 15, 12, 17, -33.8, -33, light);
    b.box(-15, -10, 14, 19, 33, 33.8, tail); b.box(10, 15, 14, 19, 33, 33.8, tail);
  } else if (kind === 'pikap') {
    wheels(b, 36, 76, 8);
    b.box(-18, 18, 8, 24, -38, 38, col);
    b.box(-16, 16, 24, 44, -38, -10, col); b.box(-16.6, 16.6, 30, 42, -36, -12, DARK);
    b.box(-18, -15, 24, 34, -8, 38, col); b.box(15, 18, 24, 34, -8, 38, col); b.box(-18, 18, 24, 34, 35, 38, col);
    for (let i = 0; i < 4; i++) b.box(-12 + (i % 2) * 13, -1 + (i % 2) * 13, 24, 34, -2 + Math.floor(i / 2) * 18, 12 + Math.floor(i / 2) * 18, '#c8b07a');
    b.box(-16, -11, 14, 20, -38.8, -38, light); b.box(11, 16, 14, 20, -38.8, -38, light);
  } else if (kind === 'truk') {
    wheels(b, 44, 118, 10);
    b.box(-22, 22, 10, 64, -59, -29, col); b.box(-20, 20, 40, 60, -59.8, -59, DARK);
    b.box(-22, 22, 12, 82, -27, 59, '#e8e2d0'); b.box(-22.4, 22.4, 60, 66, -20, 50, '#a3312a');
    b.box(-18, -12, 18, 24, -59.8, -59, light); b.box(12, 18, 18, 24, -59.8, -59, light);
  } else if (kind === 'motor') {
    b.box(-2, 2, 0, 12, -17, -9, TIRE); b.box(-2, 2, 0, 12, 9, 17, TIRE);
    b.box(-4, 4, 8, 18, -15, 15, '#2a2a2a');
    b.box(-7, 7, 18, 36, -4, 8, col);
    b.box(-5, 5, 36, 46, -2, 7, ['#e33', '#fc0', '#fff', '#39f', '#111', '#3c6', '#f80', '#c3c'][(col.charCodeAt(2) + col.charCodeAt(4)) % 8]);
  } else if (kind === 'kereta') {
    b.box(-20, 20, 4, 8, -92, 92, '#333');
    b.box(-20, 20, 8, 58, -90, 90, col); b.box(20, 20.8, 32, 46, -80, 80, DARK); b.box(-20.8, -20, 32, 46, -80, 80, DARK);
    b.box(-20, 20, 58, 62, -88, 88, '#d8d8d8'); b.box(20.2, 20.8, 14, 18, -90, 90, '#f2f2f2'); b.box(-20.8, -20.2, 14, 18, -90, 90, '#f2f2f2');
  }
  b.flat([[-26, -46], [26, -46], [26, 46], [-26, 46]].map(([x, z]) => kind === 'motor' ? [x * 0.4, z * 0.45] : kind === 'kereta' ? [x * 0.9, z * 2] : [x * (kind === 'truk' ? 1 : 0.85), z * (kind === 'truk' ? 1.35 : kind === 'angkot' ? 1 : 0.8)]), 0.7, '#20262b');
  return (GEO[key] = b.geo());
}

/* ---------- geometri satuan untuk instancing ---------- */
function unitGeos() {
  if (GEO.unit) return GEO.unit;
  const T = root.THREE;
  const box = new T.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
  const pr = new GB(); pr.prism(-0.5, 0.5, 0, 1, -0.5, 0.5, '#ffffff', '#ffffff');
  const ico = new T.IcosahedronGeometry(1, 0);
  const cyl = new T.CylinderGeometry(1, 1, 1, 10); cyl.translate(0, 0.5, 0);
  const pb = new GB(); pb.box(-6, 6, 0, 26, -4.5, 4.5, '#ffffff');
  const ph = new GB(); ph.box(-4.5, 4.5, 26, 35, -4.5, 4.5, '#ffffff');
  const oct = new T.OctahedronGeometry(1, 0);
  return (GEO.unit = { box, prism: pr.geo(), ico, cyl, body: pb.geo(), head: ph.geo(), oct });
}
function instanced(geo, list, mat) {
  const T = root.THREE, m = new T.InstancedMesh(geo, mat, Math.max(1, list.length)), o = new T.Object3D();
  list.forEach((it, i) => {
    o.position.set(it.x, it.y || 0, it.z); o.rotation.set(it.rx || 0, it.ry || 0, it.rz || 0); o.scale.set(it.sx, it.sy, it.sz); o.updateMatrix();
    m.setMatrixAt(i, o.matrix); m.setColorAt(i, C(it.col));
  });
  if (!list.length) m.count = 0;
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.frustumCulled = false; return m;
}
function chunked(geo, list, mat, out, cast) {
  // pecah instance per blok 1400 unit supaya blok jauh bisa disembunyikan (kamera dan bayangan); out = daftar blok
  const T = root.THREE, g = new T.Group(), by = new Map();
  for (const it of list) { const k = Math.floor(it.x / 1400) + ',' + Math.floor(it.z / 1400); if (!by.has(k)) by.set(k, []); by.get(k).push(it); }
  for (const arr of by.values()) {
    const m = instanced(geo, arr, mat); let cx = 0, cz = 0; for (const it of arr) { cx += it.x; cz += it.z; }
    m.userData.c = [cx / arr.length, cz / arr.length]; m.castShadow = cast !== false; m.receiveShadow = true; out.push(m); g.add(m);
  }
  return g;
}
function labelTex(text, bg, fg, w, h) {
  const T = root.THREE, cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'); c.fillStyle = bg; c.fillRect(0, 0, w, h);
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = Math.max(2, h / 16); c.strokeRect(1, 1, w - 2, h - 2);
  c.fillStyle = fg; let fs = Math.floor(h * 0.62); c.font = `800 ${fs}px "Plus Jakarta Sans", Arial, sans-serif`;
  while (c.measureText(text).width > w * 0.9 && fs > 8) { fs -= 2; c.font = `800 ${fs}px "Plus Jakarta Sans", Arial, sans-serif`; }
  c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(text, w / 2, h / 2 + 1);
  const t = new T.CanvasTexture(cv); t.anisotropy = 2; if (LIN) t.encoding = T.sRGBEncoding; return t;
}

/* ---------- dunia statis per trayek ---------- */
function buildStatic(Wd) {
  const SK = Wd.route + (HI ? ':H' : ':L');
  if (STATIC[SK]) return STATIC[SK];
  const T = root.THREE, A = root.NARIK_DRIVE._, sc = A.buildScenery(Wd), U = unitGeos();
  const grp = new T.Group(), hash = A.hash;
  const P = (d, u, y) => { const p = Wd.at(d); return [p.x + p.nx * u, y, p.y + p.ny * u]; };
  const dEnd = Wd.total - 40;
  const vmat = mat({ vc: true });
  const imat = mat({}), chunks = [];
  // tanah
  let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
  for (let d = A.DMIN; d < dEnd; d += 200) { const p = Wd.at(d); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.y); z1 = Math.max(z1, p.y); }
  const gg = new T.PlaneGeometry(x1 - x0 + 6000, z1 - z0 + 6000, 1, 1); gg.setAttribute('cls', new T.Float32BufferAttribute(new Float32Array(gg.getAttribute('position').count).fill(KI('rumput')), 1));
  const ground = new T.Mesh(gg, mat({ color: '#a3b582' })); ground.receiveShadow = true;
  ground.rotation.x = -Math.PI / 2; ground.position.set((x0 + x1) / 2, -1, (z0 + z1) / 2); grp.add(ground);

  // jalan utama: aspal, trotoar berundak, median, marka
  const R = new GB(), gaps = Wd.cross.map(c => c.d);
  const inCross = (d, m) => gaps.some(g => Math.abs(g - d) < m);
  const ASP = '#3e474f', SW = '#d6ccb2', CURB = '#bdb39a';
  const strip = (dA, dB, u0, u1, y, col) => { const a = P(dA, u0, y), b = P(dA, u1, y), c = P(dB, u1, y), d = P(dB, u0, y); R.quad(a, b, c, d, col); };
  const wall = (dA, dB, u, y0, y1, col, faceRight) => { const a = P(dA, u, y0), b = P(dB, u, y0), c = P(dB, u, y1), d = P(dA, u, y1); if (faceRight) R.quad(a, b, c, d, col); else R.quad(b, a, d, c, col); };
  for (let d = A.DMIN; d < dEnd; d += 16) {
    const e = d + 16, cr = inCross(d + 8, 62);
    R.kls('aspal'); strip(d, e, -110, 270, 0.5, ASP);
    if (!cr) {
      R.kls('paving'); strip(d, e, -142, -110, 4, SW); strip(d, e, 270, 302, 4, SW);
      R.kls('beton'); wall(d, e, -110, 0, 4, CURB, true); wall(d, e, 270, 0, 4, CURB, false);
      strip(d, e, 110, 124, 3, '#c9c3b4'); R.kls('cat'); wall(d, e, 110, 0, 3, '#e8c547', false); wall(d, e, 124, 0, 3, '#e8c547', true);
      R.kls('polos'); strip(d, e, -108, -106, 0.8, '#e6e6e6'); strip(d, e, 266, 268, 0.8, '#e6e6e6');
    }
  }
  for (let d = Math.floor(A.DMIN / 44) * 44; d < dEnd; d += 44) {
    if (inCross(d + 11, 70)) continue;
    R.kls('polos');
    for (const u of [-37, 37, 197]) strip(d, d + 22, u - 1.5, u + 1.5, 0.8, u === 197 ? '#f0f0f0' : '#f4f4f4');
  }
  // perempatan: jalan melintang, zebra, garis henti
  const local = (d0, dd, u, y) => P(d0 + dd, u, y);
  const rect = (d0, dd0, dd1, u0, u1, y, col) => R.quad(local(d0, dd0, u0, y), local(d0, dd0, u1, y), local(d0, dd1, u1, y), local(d0, dd1, u0, y), col);
  for (const c of Wd.cross) {
    R.kls('aspal'); rect(c.d, -60, 60, -720, 920, 0.9, ASP);
    R.kls('paving'); rect(c.d, -78, -60, -720, -142, 4, SW); rect(c.d, 60, 78, -720, -142, 4, SW); rect(c.d, -78, -60, 302, 920, 4, SW); rect(c.d, 60, 78, 302, 920, 4, SW);
    R.kls('polos'); for (let u = -104; u < 106; u += 18) rect(c.d, -62, -46, u, u + 9, 1.2, '#f2f2f2');
    for (let u = 130; u < 266; u += 18) rect(c.d, 46, 62, u, u + 9, 1.2, '#f2f2f2');
    rect(c.d, -72, -67, -110, 110, 1.2, '#ffffff'); rect(c.d, 67, 72, 124, 270, 1.2, '#ffffff');
    for (let u = -700; u < 900; u += 44) if (u < -150 || u > 310) rect(c.d, -1.5, 1.5, u, u + 22, 1.2, '#e8e8e8');
  }
  // ujung jalan di tikungan (jalan yang lurus terus)
  for (const s of Wd.stubs) {
    const p = Wd.at(s.d), tx = p.tx * s.dir, ty = p.ty * s.dir;
    const Q = (k, u, y) => [p.x + p.nx * u + tx * k, y, p.y + p.ny * u + ty * k];
    const sq = (k0, k1, u0, u1, y, col) => { const a = Q(k0, u0, y), b = Q(k0, u1, y), c2 = Q(k1, u1, y), d2 = Q(k1, u0, y); if (s.dir > 0) R.quad(a, b, c2, d2, col); else R.quad(b, a, d2, c2, col); };
    R.kls('aspal'); sq(0, 900, -44, 204, 0.3, ASP); R.kls('paving'); sq(560, 900, -70, -44, 4, SW); sq(560, 900, 204, 230, 4, SW); R.kls('polos');
    for (let k = 140; k < 880; k += 44) sq(k, k + 22, 78.5, 81.5, 0.6, '#eeeeee');
  }
  // sungai dan jembatan
  const rv = Wd.river.d;
  R.kls('kaca'); rect(rv, -80, 80, -2600, 2600, 0.1, '#3f86a8'); R.kls('beton'); rect(rv, -92, -80, -2600, 2600, 0.2, '#8f7d55'); rect(rv, 80, 92, -2600, 2600, 0.2, '#8f7d55');
  // jembatan: dinding pengaman
  R.kls('beton'); for (const [u0, u1] of [[-148, -140], [300, 308]]) { wall(rv - 96, rv + 96, u0, 4, 22, false); wall(rv - 96, rv + 96, u1, 4, 22, true); strip(rv - 96, rv + 96, u0, u1, 22, '#c3c7c9'); }
  // rel kereta
  const rl = Wd.rail.d;
  R.kls('beton'); rect(rl, -34, 34, -2600, -142, 1, '#9a9184'); rect(rl, -34, 34, 302, 2600, 1, '#9a9184');
  R.kls('kayu'); for (let u = -2600; u < 2600; u += 16) if (u < -142 || u > 302) rect(rl, -22, 22, u, u + 8, 1.4, '#6b5a45');
  R.kls('logam'); rect(rl, -12, -9, -2600, 2600, 2.6, '#c0c4c7'); rect(rl, 9, 12, -2600, 2600, 2.6, '#c0c4c7');
  const roadMesh = new T.Mesh(R.geo(), vmat); roadMesh.frustumCulled = false; roadMesh.receiveShadow = true; grp.add(roadMesh);

  // kampung di belakang (sel sepanjang rute)
  const seen = new Set(), cells = [];
  for (let d = A.DMIN; d < dEnd; d += 120) {
    const p = Wd.at(d), r = 1150, i0 = Math.floor((p.x - r) / 150), i1 = Math.floor((p.x + r) / 150), j0 = Math.floor((p.y - r) / 150), j1 = Math.floor((p.y + r) / 150);
    for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
      const k = i + ',' + j; if (seen.has(k)) continue;
      const cx = i * 150 + 75, cy = j * 150 + 75; if ((cx - p.x) ** 2 + (cy - p.y) ** 2 > r * r) continue;
      seen.add(k); const cell = A.cellAt(Wd, sc, i, j); if (cell.kind) cells.push(cell);
    }
  }
  const walls = [], roofs = [], trunks = [], leaves = [], boxes = [], F = new GB();
  const WALLS = ['#e8dfc8', '#d9cdb0', '#efe6d2', '#cfd5c8', '#e6d3b8'];
  // kelompok instance aset Blender: kunci → { geo, mat, list }
  const AG = {}, useA = AS.state === 'siap';
  const addA = (key, name, part, cols, it, mat) => { (AG[key] = AG[key] || { geo: () => assetGeo(name, part, cols), mat, list: [] }).list.push(Object.assign({ col: '#ffffff' }, it)); };
  const tree = (x, z, r, h, y0, near) => {
    if (near && useA) { const kel = h % 4 === 0, sc2 = r / 15 * (kel ? 0.8 : 0.75); addA(kel ? 'kelapa' : 'mangga', kel ? 'pohon_kelapa' : 'pohon_mangga', 'main', null, { x, z, y: y0 || 0, ry: (h % 628) / 100, sx: sc2, sy: sc2 * (0.9 + (h % 20) / 100), sz: sc2 }); return; }
    trunks.push({ x, z, y: y0 || 0, sx: 4, sy: r * 1.6, sz: 4, col: '#6b4f33' }); leaves.push({ x, z, y: (y0 || 0) + r * 1.9, sx: r * 1.25, sy: r * 1.15, sz: r * 1.25, col: ['#4f8a3c', '#3f7a35', '#5e9a46'][h % 3], ry: h % 6 }); };
  for (const cell of cells) {
    const { cx, cy, h } = cell;
    if (cell.kind === 'rumah' && useA) {
      for (let k = 0; k < 4; k++) {
        const hh = hash(h + k); if (hh % 5 === 0) continue;
        const w = 44 + hh % 22, l = 40 + (hh >>> 4) % 26, x = cx - 70 + (k % 2) * 72 + (hh >>> 8) % 8 + w / 2, z = cy - 70 + Math.floor(k / 2) * 72 + (hh >>> 11) % 8 + l / 2;
        const ri = (hh >>> 14) % A.ROOF.length;
        addA('jauh' + ri, 'rumah_jauh', 'main', { cat: WALLS[ri % WALLS.length], kedua: A.ROOF[ri] }, { x, z, ry: hh % 2 ? 0 : Math.PI / 2, sx: (w - 6) / 25, sy: (34 + hh % 16) / 15, sz: (l - 6) / 25 });
      }
    } else if (cell.kind === 'rumah') {
      for (let k = 0; k < 4; k++) {
        const hh = hash(h + k); if (hh % 5 === 0) continue;
        const w = 44 + hh % 22, l = 40 + (hh >>> 4) % 26, x = cx - 70 + (k % 2) * 72 + (hh >>> 8) % 8 + w / 2, z = cy - 70 + Math.floor(k / 2) * 72 + (hh >>> 11) % 8 + l / 2;
        const wh = 34 + hh % 16, rot = hh % 2 ? 0 : Math.PI / 2;
        walls.push({ x, z, sx: w - 8, sy: wh, sz: l - 8, col: WALLS[(hh >>> 3) % WALLS.length] });
        roofs.push({ x, z, y: wh, ry: rot, sx: rot ? l : w, sy: 22 + hh % 12, sz: rot ? w : l, col: A.ROOF[(hh >>> 14) % A.ROOF.length] });
      }
    } else if (cell.kind === 'pohon') { for (let k = 0; k < 6; k++) { const hh = hash(h + k * 11), x = cx - 60 + hh % 120, z = cy - 60 + (hh >>> 7) % 120, r = 14 + hh % 10; if (useA) addA('pjauh', 'pohon_jauh', 'main', null, { x, z, ry: (hh % 628) / 100, sx: r / 16, sy: r / 15, sz: r / 16 }); else tree(x, z, r, hh); } }
    else if (cell.kind === 'sawah') {
      F.kls('rumput'); F.flat([[cx - 72, cy - 72], [cx + 72, cy - 72], [cx + 72, cy + 72], [cx - 72, cy + 72]], 0.2, (h % 2) ? '#8fbf5a' : '#a7c96a');
      for (let k = -66; k < 72; k += 12) F.flat([[cx - 70, cy + k], [cx + 70, cy + k], [cx + 70, cy + k + 2], [cx - 70, cy + k + 2]], 0.4, '#79a84a');
    } else if (cell.kind === 'lapangan') {
      F.kls('rumput'); F.flat([[cx - 70, cy - 50], [cx + 70, cy - 50], [cx + 70, cy + 50], [cx - 70, cy + 50]], 0.2, '#7fb04f');
      for (const [a, b, c2, d2] of [[-62, -42, 62, -40], [-62, 40, 62, 42], [-62, -42, -60, 42], [60, -42, 62, 42], [-1, -42, 1, 42]]) F.flat([[cx + a, cy + b], [cx + c2, cy + b], [cx + c2, cy + d2], [cx + a, cy + d2]], 0.4, '#f2f2f2');
      boxes.push({ x: cx - 62, z: cy, sx: 3, sy: 18, sz: 24, col: '#f2f2f2' }); boxes.push({ x: cx + 62, z: cy, sx: 3, sy: 18, sz: 24, col: '#f2f2f2' });
    } else if (cell.kind === 'kolam') {
      const pts = []; for (let k = 0; k < 12; k++) { const a = k / 12 * Math.PI * 2; pts.push([cx + Math.cos(a) * 58, cy + Math.sin(a) * 38]); }
      F.kls('kaca'); F.flat(pts, 0.3, '#4b97bd'); tree(cx + 60, cy - 40, 16, h);
    }
  }
  // deretan pinggir jalan
  const signs = {};
  const roadSide = it => it.u0 < 0 ? -1 : 1;
  for (const it of sc.items) {
    const p = Wd.at(it.d), ry = rotOf(p.a), side = roadSide(it), toward = -side, h = it.h;
    const uc = (it.u0 + it.u1) / 2, w = Math.abs(it.u1 - it.u0), [x, , z] = P(it.d, uc, 0);
    const at = (u, extra) => { const q = P(it.d, u, 0); return Object.assign({ x: q[0], z: q[2], ry }, extra); };
    const face = ry + (side > 0 ? Math.PI : 0);         // model Blender menghadap +X, putar supaya muka ke jalan
    if (useA && it.kind !== 'kebun') {
      if (it.kind === 'ruko') {
        const i = h % A.WALLC.length, sx = w / 125, sy = 0.72 + ((h >>> 9) % 26) / 100, sz = it.len / 100;
        addA('ruko' + i, 'ruko', 'main', { cat: A.WALLC[i], ketiga: ['#d9534f', '#3e7cb1', '#2f8f4f', '#e6b33a', '#7a5a9e'][i % 5] }, { x, z, ry: face, sx, sy, sz });
        const name = A.SHOPS[(h >>> 4) % A.SHOPS.length];
        (signs[name] = signs[name] || []).push({ d: it.d, u: uc + toward * (66.25 * sx + 0.8), w: Math.min(it.len * 0.9, 120), y0: 86 * sy, y1: 104 * sy, side });
      } else if (it.kind === 'rumah') {
        const i = h % A.ROOF.length, sx = w / 125, sz = it.len / 150;
        addA('rumah' + i, 'rumah', 'main', { cat: WALLS[i % WALLS.length], kedua: A.ROOF[i] }, { x, z, ry: face, sx, sy: Math.max(0.75, Math.min(1.05, (sx + sz) / 2)), sz });
      } else if (it.kind === 'warung') {
        const i = h % 4;
        addA('warung' + i, 'warung', 'main', { ketiga: ['#d9534f', '#3e7cb1', '#2f8f4f', '#e6b33a'][i] }, { x, z, ry: face, sx: Math.min(w, 110) / 75, sy: 1, sz: Math.min(it.len, 120) / 80 });
      }
      continue;
    }
    if (it.kind === 'ruko') {
      const H = 80 + h % 80;
      walls.push({ x, z, ry, sx: w, sy: H, sz: it.len - 2, col: A.WALLC[h % A.WALLC.length] });
      boxes.push({ x, z, y: H, ry, sx: w + 4, sy: 5, sz: it.len + 2, col: '#7d776c' });
      boxes.push(at(it.u0 + toward * 1, { y: 0, sx: 3, sy: 40, sz: it.len * 0.8, col: (h >>> 6) % 3 ? '#2d3338' : '#f1e3b5' }));
      boxes.push(at(it.u0 + toward * 9, { y: 42, sx: 18, sy: 3, sz: it.len * 0.9, col: ['#d9534f', '#3e7cb1', '#2f8f4f', '#e6b33a', '#7a5a9e'][h % 5] }));
      const name = A.SHOPS[(h >>> 4) % A.SHOPS.length], sw = Math.min(it.len * 0.8, 96), su = it.u0 + toward * 1.5;
      (signs[name] = signs[name] || []).push({ d: it.d, u: su, w: sw, y0: 50, y1: 72, side });
    } else if (it.kind === 'rumah') {
      walls.push({ x, z, ry, sx: w - 16, sy: 46, sz: it.len - 16, col: WALLS[h % WALLS.length] });
      const along = it.len > w; roofs.push({ x, z, y: 46, ry: ry + (along ? 0 : Math.PI / 2), sx: along ? w - 6 : it.len - 6, sy: 30, sz: along ? it.len - 6 : w - 6, col: A.ROOF[h % A.ROOF.length] });
      const q = P(it.d - it.len / 2 + 12, it.u0 + toward * 4, 0); tree(q[0], q[2], 11, h);
    } else if (it.kind === 'warung') {
      walls.push({ x, z, ry, sx: w - 12, sy: 40, sz: it.len - 12, col: '#e2d6bb' });
      boxes.push(at(it.u0 + toward * 12, { y: 34, rz: -toward * 0.28, sx: 30, sy: 2, sz: it.len - 12, col: ['#d9534f', '#3e7cb1', '#2f8f4f', '#e6b33a'][h % 4] }));
      boxes.push(at(it.u0 + toward * 4, { y: 0, sx: 8, sy: 16, sz: it.len * 0.5, col: '#7a5a2e' }));
    } else {
      const pts = [P(it.d - it.len / 2, it.u0, 0), P(it.d - it.len / 2, it.u1, 0), P(it.d + it.len / 2, it.u1, 0), P(it.d + it.len / 2, it.u0, 0)].map(q => [q[0], q[2]]);
      F.kls('rumput'); F.flat(side < 0 ? pts : pts.slice().reverse(), 0.3, '#93b06a');
      for (let k = 0; k < 3; k++) { const hh = hash(h + k), q = P(it.d - it.len / 2 + 14 + hh % Math.max(1, it.len - 28), Math.min(it.u0, it.u1) + 14 + (hh >>> 6) % Math.max(1, w - 28), 0); tree(q[0], q[2], 10 + hh % 6, hh, 0, true); }
    }
  }
  // tiang, lampu jalan, pohon peneduh, motor parkir, gerobak
  const lampBulbs = [], wires = [];
  for (const pr of sc.props) {
    if (pr.kind === 'pejalan') continue;
    const p = Wd.at(pr.d), ry = rotOf(p.a), [x, , z] = P(pr.d, pr.u, 0), toward = -pr.side;
    if (useA && pr.kind !== 'pohon') {
      const face = ry + (pr.side > 0 ? Math.PI : 0);
      if (pr.kind === 'tiang') {
        const tr = pr.h % 5 === 0; addA(tr ? 'trafo' : 'tiang', tr ? 'tiang_trafo' : 'tiang', 'main', null, { x, z, y: 4, ry, sx: 1, sy: 1, sz: 1 });
        if (pr.prev) { const q = P(pr.prev.d, pr.prev.u, 0); for (const off of [-16, 16]) { const a = Wd.at(pr.prev.d), b = Wd.at(pr.d); wires.push(q[0] + a.nx * off, 223, q[2] + a.ny * off, x + b.nx * off, 223, z + b.ny * off); } }
      } else if (pr.kind === 'lampu') { addA('lampu', 'lampu_jalan', 'main', null, { x, z, y: 4, ry: face, sx: 1, sy: 1, sz: 1 }); addA('bohlam', 'lampu_jalan', 'bulb', null, { x, z, y: 4, ry: face, sx: 1, sy: 1, sz: 1 }, 'lamp'); }
      else if (pr.kind === 'parkir') { const i = pr.h % 3; addA('parkir' + i, 'motor_parkir', 'main', { cat: ['#c0392b', '#1b1b1b', '#2f5d9e'][i] }, { x, z, y: 4, ry: ry + 1.3, sx: 1, sy: 1, sz: 1 }); }
      else if (pr.kind === 'gerobak') addA('gerobak', 'gerobak', 'main', null, { x, z, y: 4, ry: face + Math.PI / 2, sx: 1, sy: 1, sz: 1 });
      continue;
    }
    if (pr.kind === 'tiang') {
      boxes.push({ x, z, y: 4, ry, sx: 5, sy: 226, sz: 5, col: '#6b6b6b' }); boxes.push({ x, z, y: 214, ry, sx: 40, sy: 3, sz: 3, col: '#4a4a4a' });
      if (pr.prev) { const q = P(pr.prev.d, pr.prev.u, 0); for (const off of [-16, 16]) { const a = Wd.at(pr.prev.d), b = Wd.at(pr.d); wires.push(q[0] + a.nx * off, 216, q[2] + a.ny * off, x + b.nx * off, 216, z + b.ny * off); } }
    } else if (pr.kind === 'lampu') {
      boxes.push({ x, z, y: 4, ry, sx: 4, sy: 170, sz: 4, col: '#777777' });
      const q = P(pr.d, pr.u + toward * 18, 0); boxes.push({ x: q[0], z: q[2], y: 170, ry, sx: 36, sy: 3, sz: 3, col: '#777777' });
      const b2 = P(pr.d, pr.u + toward * 34, 0); lampBulbs.push({ x: b2[0], z: b2[2], y: 164, ry, sx: 10, sy: 5, sz: 10, col: '#ffffff' });
    } else if (pr.kind === 'pohon') tree(x, z, 15, pr.h, 4, true);
    else if (pr.kind === 'parkir') { boxes.push({ x, z, y: 4, ry: ry + 1.3, sx: 8, sy: 16, sz: 30, col: '#2a2a2a' }); boxes.push({ x, z, y: 18, ry: ry + 1.3, sx: 10, sy: 4, sz: 14, col: A.SHIRT[pr.h % 8] }); }
    else if (pr.kind === 'gerobak') { boxes.push({ x, z, y: 4, ry, sx: 18, sy: 26, sz: 30, col: '#f1ede2' }); boxes.push({ x, z, y: 40, ry, sx: 22, sy: 3, sz: 34, col: '#d33a2b' }); boxes.push({ x, z, y: 30, ry, sx: 2, sy: 10, sz: 2, col: '#555' }); }
  }
  // rambu tikungan
  for (const a of Wd.arcs) { const sd = a.d0 - 420, p = Wd.at(sd), ry = rotOf(p.a), [x, , z] = P(sd, 300, 0); boxes.push({ x, z, y: 4, ry, sx: 3, sy: 60, sz: 3, col: '#666' }); boxes.push({ x, z, y: 62, ry, rz: Math.PI / 4, sx: 22, sy: 22, sz: 2, col: '#f2c230' }); }
  { const fm = new T.Mesh(F.geo(), vmat); fm.receiveShadow = true; grp.add(fm); }
  for (const [geo, list] of [[U.box, walls], [U.prism, roofs], [U.box, trunks], [U.ico, leaves], [U.box, boxes]]) grp.add(chunked(geo, list, imat, chunks));
  const lampMat = mat({ color: '#fff1c2' }); lampMat.emissive = C('#ffe08a').clone(); lampMat.emissiveIntensity = 0;
  grp.add(chunked(U.box, lampBulbs, lampMat, chunks, false));
  const amat = mat({ vc: true });
  for (const g of Object.values(AG)) grp.add(chunked(g.geo(), g.list, g.mat === 'lamp' ? lampMat : amat, chunks, g.mat !== 'lamp'));
  if (wires.length) { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(wires, 3)); grp.add(new T.LineSegments(g, new T.LineBasicMaterial({ color: 0x2a2a2a }))); }
  // papan nama toko (satu geometri per nama)
  for (const name of Object.keys(signs)) {
    const pos = [], uv = [];
    for (const s of signs[name]) {
      const a = P(s.d - s.w / 2, s.u, s.y0), b = P(s.d + s.w / 2, s.u, s.y0), c2 = P(s.d + s.w / 2, s.u, s.y1), d2 = P(s.d - s.w / 2, s.u, s.y1);
      const [ua, ub] = s.side < 0 ? [0, 1] : [1, 0];
      pos.push(...a, ...b, ...c2, ...a, ...c2, ...d2); uv.push(ua, 0, ub, 0, ub, 1, ua, 0, ub, 1, ua, 1);
    }
    const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    const i = A.SHOPS.indexOf(name), mat = new T.MeshBasicMaterial({ map: labelTex(name, ['#fffdf5', '#ffd400', '#1f6fb5', '#c0392b', '#1f9d55'][i % 5], i % 5 === 0 || i % 5 === 1 ? '#1b2630' : '#ffffff', 256, 64), side: T.DoubleSide });
    grp.add(new T.Mesh(g, mat));
  }
  // landmark
  for (const L of Wd.landmarks) grp.add(landmark(Wd, L, A));
  const out = { grp, lampMat, chunks };
  STATIC[SK] = out; return out;
}

/* ---------- landmark ---------- */
// papan nama landmark versi Blender: [jarak dari tengah lajur kiri (a), tinggi, lebar, tinggi papan, geser sepanjang jalan]
const LBL = { terminal: [154, 120, 300, 46, 0, '#1f6fb5', '#ffffff'], pasar: [190, 140, 280, 50, 0, '#c0392b', '#ffffff'],
  masjid: [160, 40, 200, 30, 0, '#2f8f5b', '#ffffff'], sekolah: [164, 50, 180, 28, 0, '#ffffff', '#8e3f32'],
  spbu: [160, 190, 120, 40, 200, '#d33a2b', '#ffffff'], alun: [158, 30, 150, 26, 0, '#2f5d2a', '#ffffff'],
  kampus: [156, 96, 150, 26, 0, '#1b2630', '#ffd400'], stasiun: [168, 70, 215, 34, 0, '#1f6fb5', '#ffffff'],
  griya: [166, 86, 120, 24, 0, '#ffffff', '#1b2630'] };
function landmark(Wd, L, A) {
  const T = root.THREE, p = Wd.at(L.d), g = new T.Group(), b = new GB(), s = L.side, half = L.len / 2;
  g.position.set(p.x, 0, p.y); g.rotation.y = rotOf(p.a);
  if (hasAsset('lm_' + L.kind)) {
    // model Blender: muka di x = 0 menghadap +X; sisi kiri jalan di u = -150, sisi kanan di u = 310 diputar 180°
    const m = new T.Mesh(assetGeo('lm_' + L.kind), mat({ vc: true })); m.castShadow = m.receiveShadow = true;
    m.position.set(s < 0 ? -150 : 310, 0, 0); m.rotation.y = s < 0 ? 0 : Math.PI; g.add(m);
    const [a, y, w, h, dz, bg, fg] = LBL[L.kind];
    const lab = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: labelTex(L.label, bg, fg, 512, Math.round(512 * h / w)), side: T.DoubleSide }));
    lab.position.set(s < 0 ? -a + 2 : a + 160 - 2, y, s < 0 ? -dz : dz); lab.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(lab);
    if (L.kind === 'terminal') {
      const cols = ['#1a8f4c', '#f2b90f', '#35b3c9', '#1a8f4c', '#d43a2b'], vm = mat({ vc: true, obj: true });
      let i = 0;
      for (const u of [-265, -365]) for (const dd of [-200, -100, 0, 100, 200]) { if ((i * 7) % 5 === 3) { i++; continue; } const v = new T.Mesh(vehicleGeo('angkot', cols[i % cols.length]), vm); v.castShadow = v.receiveShadow = true; v.position.set(u, 0, -dd); v.rotation.y = i % 2 ? Math.PI : 0; g.add(v); i++; }
    }
    return g;
  }
  const E = 150;                                        // jarak tepi bangunan dari tengah lajur kita (sisi kiri)
  const U = a => s < 0 ? -a : a + 160;                  // jarak dari tepi jalan → koordinat lateral lokal
  const bx = (a0, a1, d0, d1, y0, y1, col) => { const u0 = U(a0), u1 = U(a1); b.box(Math.min(u0, u1), Math.max(u0, u1), y0, y1, -d1, -d0, col); };
  const pr = (a0, a1, d0, d1, y0, y1, col, along) => { const u0 = U(a0), u1 = U(a1); if (along) b.prism(Math.min(u0, u1), Math.max(u0, u1), y0, y1, -d1, -d0, col); else { const xm = (u0 + u1) / 2, w = Math.abs(u1 - u0); const bb = new GB(); bb.prism(-(d1 - d0) / 2, (d1 - d0) / 2, y0, y1, -w / 2, w / 2, col); for (let i = 0; i < bb.p.length; i += 3) { const lx = bb.p[i], lz = bb.p[i + 2]; b.p.push(xm - lz, bb.p[i + 1], -((d0 + d1) / 2) + lx); } b.c.push(...bb.c); } };
  const sign = (text, a, y, w, h, bg, fg) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ map: labelTex(text, bg, fg, 512, Math.round(512 * h / w)), side: T.DoubleSide })); m.position.set(U(a) + (s < 0 ? 2 : -2), y, 0); m.rotation.y = s < 0 ? Math.PI / 2 : -Math.PI / 2; g.add(m); };
  bx(E, E + 340, -half, half, 0, 1, '#cfc7b0');
  const k = L.kind;
  if (k === 'terminal') {
    bx(E, E + 330, -half + 10, half - 10, 1, 1.6, '#9aa0a3');
    for (let i = 0; i < 4; i++) { const d = -half + 70 + i * 120; for (const a of [E + 70, E + 270]) bx(a, a + 6, d, d + 6, 1, 92, '#8d9396'); bx(E + 60, E + 290, d - 12, d + 26, 92, 98, '#3e7cb1'); }
    sign(L.label, E + 4, 120, 300, 46, '#1f6fb5', '#ffffff'); bx(E + 2, E + 8, -150, -146, 0, 140, '#777'); bx(E + 2, E + 8, 146, 150, 0, 140, '#777');
  } else if (k === 'pasar') {
    bx(E + 40, E + 320, -half + 40, half - 40, 0, 110, '#d8cfb8'); pr(E + 30, E + 330, -half + 30, half - 30, 110, 170, '#8f9aa0', true);
    for (let i = 0; i < 9; i++) { const d = -half + 34 + i * 56; bx(E + 6, E + 36, d, d + 40, 0, 34, '#e9e2cf'); bx(E + 2, E + 40, d - 2, d + 42, 34, 37, ['#d9534f', '#3e7cb1', '#e6b33a', '#2f8f4f', '#e07b39'][i % 5]); }
    sign(L.label, E + 40, 140, 280, 50, '#c0392b', '#ffffff');
  } else if (k === 'masjid') {
    bx(E + 20, E + 260, -170, 170, 0, 10, '#e9e4d6'); bx(E + 60, E + 230, -110, 110, 10, 90, '#f4efe2');
    bx(E + 30, E + 54, -170, -146, 10, 230, '#f4efe2'); bx(E + 28, E + 56, -172, -144, 230, 240, '#2f8f5b');
    sign(L.label, E + 10, 40, 200, 30, '#2f8f5b', '#ffffff');
    const dome = new T.Mesh(new T.SphereGeometry(80, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat({ color: '#2f8f5b' })); dome.position.set(U(E + 145), 90, 0); g.add(dome);
    const top = new T.Mesh(new T.ConeGeometry(10, 40, 8), mat({ color: '#e6c84a' })); top.position.set(U(E + 145), 185, 0); g.add(top);
    const mt = new T.Mesh(new T.ConeGeometry(18, 40, 8), mat({ color: '#2f8f5b' })); mt.position.set(U(E + 42), 260, 158); g.add(mt);
  } else if (k === 'sekolah') {
    bx(E + 30, E + 300, -220, -140, 0, 80, '#efe6d2'); bx(E + 230, E + 300, -140, 140, 0, 80, '#efe6d2'); bx(E + 30, E + 300, 140, 220, 0, 80, '#efe6d2');
    pr(E + 26, E + 304, -224, -136, 80, 120, '#b5523b', false); pr(E + 226, E + 304, -140, 140, 80, 120, '#b5523b', true); pr(E + 26, E + 304, 136, 224, 80, 120, '#b5523b', false);
    bx(E + 40, E + 220, -130, 130, 0, 1.5, '#c9b98a'); bx(E + 118, E + 121, -2, 1, 0, 150, '#888');
    bx(E + 121, E + 160, -2, 0, 128, 148, '#d33a2b'); bx(E + 121, E + 160, -2, 0, 108, 128, '#ffffff');
    sign(L.label, E + 14, 50, 180, 28, '#ffffff', '#8e3f32');
  } else if (k === 'spbu') {
    bx(E, E + 300, -half + 20, half - 20, 0, 1.5, '#a7abad');
    for (const a of [E + 70, E + 220]) for (const d of [-120, 120]) bx(a, a + 8, d, d + 8, 0, 110, '#dddddd');
    bx(E + 60, E + 236, -140, 140, 110, 122, '#f2f2f2'); bx(E + 58, E + 238, -142, 142, 104, 110, '#d33a2b');
    for (let i = 0; i < 3; i++) bx(E + 100 + i * 50, E + 116 + i * 50, -20, 20, 0, 30, '#d33a2b');
    bx(E + 6, E + 12, 200, 206, 0, 170, '#888'); sign(L.label, E + 10, 190, 120, 40, '#d33a2b', '#ffffff');
  } else if (k === 'alun') {
    bx(E + 10, E + 330, -half + 10, half - 10, 0, 1.2, '#7fb04f');
    for (let i = 0; i < 28; i++) { const a = i / 28 * Math.PI * 2; b.box(U(E + 170) + Math.cos(a) * 120 - 6, U(E + 170) + Math.cos(a) * 120 + 6, 1.2, 2, Math.sin(a) * 120 - 6, Math.sin(a) * 120 + 6, '#e6dcc0'); }
    for (let i = 0; i < 14; i++) { const a = i / 14 * Math.PI * 2, t = new T.Mesh(unitGeos().ico, mat({ color: '#4f8a3c' })); t.scale.set(20, 18, 20); t.position.set(U(E + 170) + Math.cos(a) * 150, 34, Math.sin(a) * 200); g.add(t); }
    const big = new T.Mesh(unitGeos().ico, mat({ color: '#3f7a35' })); big.scale.set(60, 50, 60); big.position.set(U(E + 170), 80, 0); g.add(big);
    bx(E + 166, E + 174, -4, 4, 0, 60, '#6b4f33'); sign(L.label, E + 8, 30, 150, 26, '#2f5d2a', '#ffffff');
  } else if (k === 'kampus') {
    bx(E + 20, E + 320, -half + 20, half - 20, 0, 1.2, '#d8d2c0');
    bx(E + 80, E + 300, -220, -60, 0, 200, '#9aa7af'); bx(E + 80, E + 300, 40, 220, 0, 160, '#9aa7af'); bx(E + 140, E + 240, -40, 20, 0, 90, '#3f6f8f');
    bx(E + 2, E + 14, -80, -68, 0, 120, '#1b2630'); bx(E + 2, E + 14, 68, 80, 0, 120, '#1b2630'); bx(E + 2, E + 14, -80, 80, 110, 124, '#1b2630');
    sign(L.label, E + 16, 96, 150, 26, '#1b2630', '#ffd400');
  } else if (k === 'stasiun') {
    bx(E + 30, E + 160, -half + 30, half - 30, 0, 90, '#efe6d2'); pr(E + 24, E + 166, -half + 24, half - 24, 90, 130, '#c4683f', true);
    bx(E + 170, E + 200, -half, half, 0, 8, '#bdb7a4');
    sign(L.label, E + 30, 70, 220, 34, '#1f6fb5', '#ffffff');
  } else if (k === 'griya') {
    for (let i = 0; i < 8; i++) { const d = -half + 30 + i * 66; for (const a of [E + 60, E + 180]) { bx(a, a + 70, d, d + 50, 0, 44, '#efe6d2'); pr(a - 4, a + 74, d - 4, d + 54, 44, 72, '#8e3f32', false); } }
    bx(E + 6, E + 20, -64, -50, 0, 110, '#e8e2d0'); bx(E + 6, E + 20, 50, 64, 0, 110, '#e8e2d0'); bx(E + 6, E + 20, -64, 64, 100, 116, '#e8e2d0');
    sign(L.label, E + 22, 86, 120, 24, '#ffffff', '#1b2630');
  }
  g.add(new T.Mesh(b.geo(), mat({ vc: true })));
  return g;
}

/* ---------- penggambar per rit ---------- */
function quality() { try { return localStorage.getItem('narik-grafis') || 'tinggi'; } catch (e) { return 'tinggi'; } }
function setQuality(q) { try { localStorage.setItem('narik-grafis', q); } catch (e) { /* tetap jalan tanpa penyimpanan */ } }
let ENVT = null;
function envMap() {
  // pantulan langit untuk material PBR: bola gradasi (langit, cakrawala, tanah) diproses PMREM sekali saja
  if (ENVT) return ENVT;
  const T = root.THREE, sc = new T.Scene(), g = new T.SphereGeometry(100, 32, 16), n = g.getAttribute('position').count, col = new Float32Array(n * 3);
  const top = C('#5f97cf'), hor = C('#e6eef2'), bot = C('#57503f'), tmp = new T.Color();
  for (let i = 0; i < n; i++) { const y = g.getAttribute('position').getY(i) / 100; if (y > 0) tmp.copy(hor).lerp(top, Math.pow(y, 0.6)); else tmp.copy(hor).lerp(bot, Math.min(1, -y * 4)); col.set([tmp.r, tmp.g, tmp.b], i * 3); }
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  sc.add(new T.Mesh(g, new T.MeshBasicMaterial({ vertexColors: true, side: T.BackSide })));
  const sunB = new T.Mesh(new T.SphereGeometry(6, 12, 8), new T.MeshBasicMaterial({ color: new T.Color(8, 7.5, 6.5) })); sunB.position.set(-45, 80, 35); sc.add(sunB);
  const pm = new T.PMREMGenerator(REN); ENVT = pm.fromScene(sc, 0.02).texture; pm.dispose();
  return ENVT;
}
function create(box, S, spec, o) {
  // kanvas dipasang langsung; isi 3D dibangun setelah aset Blender selesai dimuat (api.ready)
  const T = root.THREE;
  if (!REN) {
    REN = new T.WebGLRenderer({ antialias: (root.devicePixelRatio || 1) < 2, powerPreference: 'high-performance' });
    REN.setPixelRatio(Math.min(1.5, root.devicePixelRatio || 1));
  }
  const canvas = REN.domElement; canvas.className = 'ny-3d';
  box.insertBefore(canvas, box.firstChild);
  // mode grafis: 'tinggi' (PBR, tekstur Blender, bayangan) butuh WebGL2; 'ringan' = tampilan lama
  HI = quality() === 'tinggi' && REN.capabilities.isWebGL2; LIN = HI;
  REN.outputEncoding = HI ? T.sRGBEncoding : T.LinearEncoding;
  REN.toneMapping = HI ? T.ACESFilmicToneMapping : T.NoToneMapping; REN.toneMappingExposure = 1.0;
  REN.shadowMap.enabled = HI; REN.shadowMap.type = T.PCFSoftShadowMap;
  let impl = null, size = null, gone = false;
  const api = {
    canvas, ready: false, proj: () => [180, 400], get scene() { return impl && impl.scene; },
    render(dt, mode) { if (impl) impl.render(dt, mode); else { REN.setClearColor(0xa9d8f0); REN.clear(); } },
    resize(a, b, c, d) { size = [a, b, c, d]; REN.setSize(a, b); if (impl) impl.resize(a, b, c, d); },
    detach() { gone = true; if (impl) impl.detach(); if (canvas.parentNode) canvas.parentNode.removeChild(canvas); }
  };
  loadAssets().then(() => {
    if (gone) return;
    impl = createImpl(canvas, S, spec, o); if (size) impl.resize(...size);
    api.proj = impl.proj; api.ready = true;
  });
  return api;
}
function createImpl(canvas, S, spec, o) {
  const T = root.THREE, A = root.NARIK_DRIVE._, Wd = S.world, U = unitGeos();
  const st = buildStatic(Wd);
  const scene = new T.Scene(); scene.add(st.grp);
  const dyn = new T.Group(); scene.add(dyn);
  const cam = new T.PerspectiveCamera(66, 0.5, 4, 3200);
  const hemi = new T.HemisphereLight(0xffffff, 0x7a8a5a, 0.75); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, 0.8); sun.position.set(-0.5, 1, 0.3); scene.add(sun); scene.add(sun.target);
  const head = new T.SpotLight(0xfff2cc, 0, 900, 0.55, 0.6, 1.2); scene.add(head); scene.add(head.target);
  if (HI) {
    hemi.color.copy(C('#dfeaf2')); hemi.groundColor.copy(C('#6f6a55'));
    scene.environment = envMap();
    sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc2 = sun.shadow.camera; sc2.left = -720; sc2.right = 720; sc2.top = 720; sc2.bottom = -720; sc2.near = 50; sc2.far = 4000; sc2.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 1.5;
  }
  scene.fog = new T.Fog(0xa9d8f0, 900, 2600);
  const vmat = mat({ vc: true, obj: true });
  const mats = [];
  const P = (d, u, y) => { const p = Wd.at(d); return [p.x + p.nx * u, y, p.y + p.ny * u]; };
  const put = (m, d, u, y, extraRot) => { const p = Wd.at(d); m.position.set(p.x + p.nx * u, y, p.y + p.ny * u); m.rotation.set(0, rotOf(p.a) + (extraRot || 0), 0); return p; };
  const mk = (kind, col, c2, c3) => { const m = new T.Mesh(vehicleGeo(kind, col, c2, c3), vmat); m.castShadow = m.receiveShadow = true; dyn.add(m); return m; };
  const motorCols = h => hasAsset('motor') ? [A.CARC[(h + 3) % 8], A.SHIRT[h % 8], HELM[h % 8]] : [A.SHIRT[h % 8]];
  // angkot pemain
  const me = mk(hasAsset('angkot_' + spec.route) ? 'angkot_' + spec.route : 'angkot', o.hex);
  const brakeMat = new T.MeshBasicMaterial({ color: C('#5a1410').clone() }); mats.push(brakeMat);
  const revMat = new T.MeshBasicMaterial({ color: C('#3a3a34').clone() }); mats.push(revMat);
  if (hasAsset('angkot')) { for (const sx of [-1, 1]) { const b = new T.Mesh(new T.BoxGeometry(4.6, 9.4, 1), brakeMat); b.position.set(sx * 19, 19.5, 42.6); me.add(b); const r = new T.Mesh(new T.BoxGeometry(3.4, 5, 1), revMat); r.position.set(sx * 14, 21.5, 42.6); me.add(r); } }
  else { const brake = new T.Mesh(new T.BoxGeometry(40, 5, 1.5), brakeMat); brake.position.set(0, 16.5, 43.2); me.add(brake); }
  // kendaraan lain
  const cars = S.cars.map(m => ({ o: m, mesh: m.kind === 'motor' ? mk('motor', ...motorCols(m.hue)) : mk(m.kind, A.CARC[m.hue % 8]) }));
  const birus = S.biru.map(b => ({ o: b, mesh: mk('angkot', '#35b3c9') }));
  const sc = A.buildScenery(Wd);
  const onc = sc.oncoming.map(v => ({ v, mesh: v.kind === 'motor' ? mk('motor', ...motorCols(v.hue + 1)) : mk(v.kind, v.kind === 'angkot' ? ['#1a8f4c', '#f2b90f', '#35b3c9'][v.hue % 3] : A.CARC[v.hue % 8]) }));
  const xcars = [0, 1, 2, 3].map(i => mk('mobil', A.CARC[(i * 3 + 1) % 8]));
  const train = new T.Group(); dyn.add(train);
  for (let i = 0; i < 6; i++) { const m = new T.Mesh(vehicleGeo('kereta', i === 0 ? '#e07b39' : '#3e6fb1'), vmat); m.position.set(-575 + 96 + i * 192, 0, 0); m.rotation.y = Math.PI / 2; train.add(m); }
  // orang: badan dan kepala (instanced, diperbarui tiap frame)
  const NP = 260;
  const PARTS = hasAsset('orang') ? ['celana', 'baju', 'kulit', 'rambut'].map(k => [k, assetGeo('orang', k)]) : [['baju', U.body], ['kulit', U.head]];
  const pm = PARTS.map(([k, g]) => { const m = new T.InstancedMesh(g, mat({ vc: hasAsset('orang'), obj: true }), NP); m.frustumCulled = false; m.castShadow = true; dyn.add(m); for (let i = 0; i < NP; i++) m.setColorAt(i, C('#ffffff')); return { k, m }; });
  const dummy = new T.Object3D();
  // penanda penumpang dan kotak berhenti
  const markMat = mat({ color: '#ffd400' }); markMat.emissive = C('#806a00').clone(); mats.push(markMat);
  const marks = [], zones = [];
  for (let i = 0; i < 8; i++) {
    const m = new T.Mesh(U.oct, markMat); m.scale.set(9, 14, 9); dyn.add(m); marks.push(m);
    const zm = new T.MeshBasicMaterial({ color: C('#ffd400').clone(), transparent: true, opacity: 0.28, depthWrite: false }); mats.push(zm);
    const z = new T.Mesh(new T.PlaneGeometry(66, 100), zm); z.rotation.order = 'YXZ'; dyn.add(z); zones.push(z);
  }
  // lubang
  const potM = instanced(U.cyl, S.pots.map(p => { const q = P(p.d, p.x - 180, 0.6); return { x: q[0], y: 0.55, z: q[2], sx: 13, sy: 0.4, sz: 8, ry: rotOf(Wd.at(p.d).a), col: '#22282d' }; }), mat({ color: '#ffffff' }));
  dyn.add(potM);
  // polisi dan rambu 40
  for (const pl of S.police) {
    const sgn = new GB(); sgn.box(-1.5, 1.5, 0, 60, -1.5, 1.5, '#666'); sgn.box(-14, 14, 58, 86, -1.2, 1.2, '#d33a2b'); sgn.box(-11, 11, 61, 83, -1.6, 1.6, '#ffffff');
    const m = new T.Mesh(sgn.geo(), vmat); put(m, pl.d - 520, 300, 4); dyn.add(m);
  }
  // lampu lalu lintas dan palang kereta
  const tls = [];
  for (const L of S.lights) {
    const g = new T.Group(); put(g, L.d, 0, 0); dyn.add(g);
    if (!L.rail && hasAsset('lampu_merah')) {
      // tiang Blender di trotoar kiri, lengan ke tengah jalan, lampu menghadap pengemudi yang datang
      const tm = new T.Mesh(assetGeo('lampu_merah'), vmat); tm.position.set(-132, 4, 74); g.add(tm);
      const lamps = ['merah', 'kuning', 'hijau'].map((k, i) => { const mt = new T.MeshBasicMaterial({ color: C('#333333').clone() }); mats.push(mt); const m = new T.Mesh(assetGeo('lampu_merah', 'lamp' + i), mt); m.position.set(-132, 4, 74); g.add(m); return { k, mt }; });
      tls.push({ L, lamps });
    } else if (!L.rail) {
      const b = new GB(); b.box(-135, -129, 4, 150, 71, 77, '#555'); b.box(-132, -8, 142, 147, 72, 76, '#555'); b.box(-44, 0, 126, 146, 70, 78, '#151515');
      g.add(new T.Mesh(b.geo(), vmat));
      const lamps = ['merah', 'kuning', 'hijau'].map((k, i) => { const mt = new T.MeshBasicMaterial({ color: C('#333333').clone() }); mats.push(mt); const m = new T.Mesh(new T.BoxGeometry(9, 9, 2), mt); m.position.set(-36 + i * 13, 136, 78.6); g.add(m); return { k, mt }; });
      tls.push({ L, lamps });
    } else {
      const lt = new T.MeshBasicMaterial({ color: C('#441111').clone() }); mats.push(lt);
      if (hasAsset('palang')) {
        // tiang palang Blender di kedua sisi; lengan berporos di 1,3 m dan diputar naik saat terbuka
        const arms = [];
        for (const [x, z, ry] of [[-137, 63, 0], [299, -63, Math.PI]]) {
          const post = new T.Mesh(assetGeo('palang'), vmat); post.position.set(x, 4, z); post.rotation.y = ry; g.add(post);
          const lp = new T.Mesh(assetGeo('palang', 'lampu'), lt); lp.position.copy(post.position); lp.rotation.y = ry; g.add(lp);
          const pv = new T.Group(); pv.position.set(x, 4 + 32.5, z); pv.rotation.y = ry; pv.userData.up = 1; g.add(pv);
          pv.add(new T.Mesh(assetGeo('palang', 'lengan'), vmat)); arms.push(pv);
        }
        tls.push({ L, rail: true, arms, lt });
        continue;
      }
      { const b = new GB(); b.box(-140, -134, 4, 70, 60, 66, '#555'); b.box(296, 302, 4, 70, -66, -60, '#555'); g.add(new T.Mesh(b.geo(), vmat)); }
      const arm = (x, z, dir) => { const pv = new T.Group(); pv.position.set(x, 36, z); g.add(pv); const ab = new GB(); for (let i = 0; i < 16; i++) ab.box(dir > 0 ? i * 15 : -(i + 1) * 15, dir > 0 ? (i + 1) * 15 : -i * 15, -3, 3, -2, 2, i % 2 ? '#ffffff' : '#d33a2b'); pv.add(new T.Mesh(ab.geo(), vmat)); return pv; };
      const l1 = new T.Mesh(new T.BoxGeometry(10, 10, 3), lt); l1.position.set(-137, 66, 67); g.add(l1);
      const l2 = new T.Mesh(new T.BoxGeometry(10, 10, 3), lt); l2.position.set(299, 66, -67); g.add(l2);
      tls.push({ L, rail: true, arms: [arm(-137, 63, 1), arm(299, -63, -1)], lt });
    }
  }
  // hujan
  let rain = null;
  if (spec.wet) {
    const n = 700, pos = new Float32Array(n * 6), g = new T.BufferGeometry(); g.setAttribute('position', new T.BufferAttribute(pos, 3));
    for (let i = 0; i < n; i++) { const x = (Math.random() - 0.5) * 900, y = Math.random() * 500, z = (Math.random() - 0.5) * 900; pos.set([x, y, z, x - 2, y - 18, z], i * 6); }
    rain = new T.LineSegments(g, new T.LineBasicMaterial({ color: 0xc8d8e8, transparent: true, opacity: 0.55 })); scene.add(rain);
  }
  let Wl = 360, Hl = 640, camPos = null, camLook = null;
  const v3 = new T.Vector3();
  function proj(d, x) { const q = P(d, x - 180, 60); v3.set(q[0], q[1], q[2]).project(cam); return [(v3.x + 1) / 2 * Wl, (1 - v3.y) / 2 * Hl]; }
  const skyDay = new T.Color(), tmp = new T.Color();
  function sky(t) {
    const sh = spec.sh, f = Math.min(1, t / spec.dur);
    let dark = 0;
    if (sh === 0) skyDay.set('#cfe6f2'); else if (sh === 1) skyDay.set('#a3d4ef');
    else { dark = Math.max(0, Math.min(1, (f - 0.15) / 0.85)); skyDay.set('#f2b27a').lerp(tmp.set('#27304d'), dark); }
    if (spec.wet) skyDay.lerp(tmp.set(dark > 0.5 ? '#3b4250' : '#8d99a1'), 0.6);
    if (LIN) skyDay.convertSRGBToLinear();
    scene.background = skyDay; scene.fog.color.copy(skyDay);
    hemi.intensity = (0.78 - dark * 0.45 - (spec.wet ? 0.1 : 0)) * (HI ? 0.75 : 1); sun.intensity = (sh === 2 ? 0.7 : 0.85) * (1 - dark * 0.85) * (spec.wet ? 0.5 : 1) * (HI ? 2.6 : 1);
    sun.color.copy(C(sh === 2 ? '#ffc58a' : sh === 0 ? '#fff1d8' : '#ffffff'));
    if (HI) REN.toneMappingExposure = 1.05 - dark * 0.25;
    st.lampMat.emissiveIntensity = dark * 1.6; head.intensity = dark > 0.2 ? dark * 2.2 : 0;
    return dark;
  }
  function render(dt, mode) {
    const d = S.d, t = S.t, pc = Wd.at(d), dA = d - 600, dB = d + 2700;
    // pemain
    const yaw = S.yaw + (S.skid ? Math.sign(S.skid) * 0.12 : 0);
    put(me, d, S.x - 180, 0, -yaw); me.rotation.x = S.braking && Math.abs(S.v) > 40 ? 0.025 * Math.sign(S.v) : 0;
    brakeMat.color.copy(C(S.braking || Math.abs(S.v) < 5 ? '#ff3b2f' : '#5a1410'));
    revMat.color.copy(C(S.rev ? '#fffbe6' : '#3a3a34'));
    // kendaraan
    for (const c of cars) { const vis = c.o.d > dA && c.o.d < dB; c.mesh.visible = vis; if (vis) put(c.mesh, c.o.d, c.o.x - 180, 0); }
    for (const c of birus) { const vis = c.o.d > dA && c.o.d < dB; c.mesh.visible = vis; if (vis) put(c.mesh, c.o.d, c.o.x - 180, 0); }
    for (const c of onc) { const base = d - 900, dd = base + ((((c.v.d0 - c.v.v * t) - base) % 2600) + 2600) % 2600; c.mesh.visible = dd > dA && dd < dB; if (c.mesh.visible) put(c.mesh, dd, c.v.u, 0, Math.PI); }
    let xi = 0; train.visible = false;
    for (const x of S.crossers) {
      if (x.kind === 'kereta') { train.visible = true; put(train, x.d, x.x - 180, 0); continue; }
      if (xi < xcars.length) { const m = xcars[xi++]; m.visible = true; put(m, x.d, x.x - 180, 0, x.dir > 0 ? -Math.PI / 2 : Math.PI / 2); }
    }
    for (; xi < xcars.length; xi++) xcars[xi].visible = false;
    // orang
    let n = 0, mi = 0;
    const person = (d2, u, y, ry, shirt, skin, h) => {
      if (n >= NP) return; const q = P(d2, u, y); dummy.position.set(q[0], q[1], q[2]); dummy.rotation.set(0, ry, 0); dummy.scale.set(1, 1, 1); dummy.updateMatrix();
      const col = { baju: shirt, kulit: skin, celana: CELANA[(h || 0) % CELANA.length], rambut: RAMBUT[(h || 0) % RAMBUT.length] };
      for (const p of pm) { p.m.setMatrixAt(n, dummy.matrix); p.m.setColorAt(n, C(col[p.k])); }
      n++;
    };
    for (const g of S.groups) {
      if (g.n <= 0 || g.d < dA || g.d > d + 1600) { continue; }
      const ry = rotOf(Wd.at(g.d).a) - Math.PI / 2;
      for (let i = 0; i < g.n; i++) { const h = A.hash(Math.floor(g.d) + i); person(g.d + 10 - i * 11, -128 + (i % 2) * 10, 4 + (i === 0 ? Math.abs(Math.sin(t * 7 + g.d)) * 7 : 0), ry, A.SHIRT[h % 8], A.SKIN[(h >>> 3) % 4], h >>> 6); }
      if (mi < marks.length && g.d < d + 1100) {
        const m = marks[mi], z = zones[mi]; mi++;
        const q = P(g.d, -128, 70 + Math.sin(t * 3 + g.d) * 6); m.position.set(q[0], q[1], q[2]); m.rotation.y = t * 2; m.visible = true;
        const zq = P(g.d, -73, 1.3); z.position.set(zq[0], zq[1], zq[2]); z.rotation.set(-Math.PI / 2, rotOf(Wd.at(g.d).a), 0); z.material.color.copy(C(g.prog > 0 ? '#2ecc71' : '#ffd400')); z.material.opacity = g.prog > 0 ? 0.45 : 0.28; z.visible = true;
      }
    }
    for (; mi < marks.length; mi++) { marks[mi].visible = false; zones[mi].visible = false; }
    for (const pr of sc.props) { if (pr.kind !== 'pejalan') continue; const pd = pr.d + pr.v * t; if (pd < dA || pd > dB) continue; person(pd, pr.u, 4 + Math.abs(Math.sin(t * 8 + pr.h)) * 2, rotOf(Wd.at(pd).a) + (pr.v > 0 ? 0 : Math.PI), A.SHIRT[pr.h % 8], A.SKIN[(pr.h >>> 3) % 4], pr.h >>> 6); }
    for (const pl of S.police) if (pl.d > dA && pl.d < dB) person(pl.d, -126, 4, rotOf(Wd.at(pl.d).a) - Math.PI / 2, '#5b4a2e', '#8d5a3b', 0);
    for (const p of pm) { p.m.count = n; p.m.instanceMatrix.needsUpdate = true; if (p.m.instanceColor) p.m.instanceColor.needsUpdate = true; }
    // lampu dan palang
    for (const tl of tls) {
      const stt = S.lightState(tl.L);
      if (tl.rail) {
        const closed = stt !== 'hijau', blink = Math.floor(t * 3) % 2;
        tl.lt.color.copy(C(closed && blink ? '#ff3b2f' : '#441111'));
        for (const a of tl.arms) { const target = closed ? 0 : (a.userData.up || a.position.x < 0 ? 1.35 : -1.35); a.rotation.z += (target - a.rotation.z) * Math.min(1, dt * 4); }
      } else for (const lp of tl.lamps) lp.mt.color.copy(C(lp.k === stt ? { merah: '#ff3b2f', kuning: '#ffcc00', hijau: '#2ecc71' }[stt] : '#333333'));
    }
    // kamera
    const dark = sky(t);
    const low = mode === 'belakang', sp = Math.abs(S.v) / S.vMax;
    const back = low ? 210 : 190 + sp * 50, up = low ? 98 : 420 + sp * 40, ahead = low ? 430 : 230;
    // kamera atas sedikit menoleh ke landmark yang sedang dilewati supaya bangunannya terlihat
    let bias = 0;
    if (!low) for (const L of Wd.landmarks) { const k = Math.max(0, 1 - Math.abs(L.d - d - 120) / 520); bias += k * (L.side < 0 ? -95 : 85); }
    const lat = low ? (S.x - 180) * 0.9 : (S.x - 180) * 0.45 - 34 + bias;
    const cp = P(d - back, lat, up), lk = P(d + ahead, low ? (S.x - 180) * 0.6 : lat * 0.7, low ? 24 : 0);
    if (!camPos || dt === 0 || Math.hypot(cp[0] - camPos[0], cp[2] - camPos[2]) > 500) { camPos = cp.slice(); camLook = lk.slice(); }
    const f = 1 - Math.exp(-dt * 7);
    for (let i = 0; i < 3; i++) { camPos[i] += (cp[i] - camPos[i]) * f; camLook[i] += (lk[i] - camLook[i]) * f; }
    const sh = S.shake && !o.reduce ? 6 : 0;
    cam.position.set(camPos[0] + (Math.random() - 0.5) * sh, camPos[1] + (Math.random() - 0.5) * sh, camPos[2] + (Math.random() - 0.5) * sh);
    cam.fov = (low ? 70 : 64) + sp * 7; cam.updateProjectionMatrix(); cam.lookAt(camLook[0], camLook[1], camLook[2]);
    scene.fog.near = low ? 700 : 1000; scene.fog.far = low ? 2300 : 2900;
    // matahari (dan kotak bayangannya) ikut titik pandang kamera
    sun.position.set(camLook[0] - 700, 1400, camLook[2] + 450); sun.target.position.set(camLook[0], 0, camLook[2]);
    // blok kota yang jauh disembunyikan (juga dari bayangan)
    for (const ch of st.chunks) { const dx = ch.userData.c[0] - camLook[0], dz = ch.userData.c[1] - camLook[2]; ch.visible = dx * dx + dz * dz < 3600 * 3600; }
    if (head.intensity > 0) { const hp = P(d + 30, S.x - 180, 40), ht = P(d + 400, S.x - 180, 0); head.position.set(hp[0], hp[1], hp[2]); head.target.position.set(ht[0], ht[1], ht[2]); }
    if (rain) { rain.position.set(camLook[0], 0, camLook[2]); const pos = rain.geometry.attributes.position.array; for (let i = 0; i < pos.length; i += 6) { let y = pos[i + 1] - 900 * dt; if (y < 0) y += 500; pos[i + 1] = y; pos[i + 4] = y - 18; } rain.geometry.attributes.position.needsUpdate = true; }
    REN.render(scene, cam);
    const p0 = proj(d, S.x), p1 = proj(d, S.x + 50); o.psx = p0[0]; o.ppu = Math.max(0.05, (p1[0] - p0[0]) / 50);
    void dark;
  }
  function resize(cssW, cssH, wl, hl) { Wl = wl; Hl = hl; REN.setSize(cssW, cssH); cam.aspect = cssW / cssH; cam.updateProjectionMatrix(); }
  function detach() {
    if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
    scene.remove(st.grp);
    for (const m of mats) m.dispose(); potM.geometry && potM.dispose && potM.dispose();
    if (rain) { rain.geometry.dispose(); rain.material.dispose(); }
  }
  return { canvas, render, resize, proj, detach, scene };
}

const API = { available, create, loadAssets, quality, setQuality, assets: AS, _static: STATIC };
if (available()) loadAssets();
root.NARIK_3D = API;
})(typeof window !== 'undefined' ? window : globalThis);
