/* NARIK — adegan rumah sopir (window.NARIK_RUMAH): layar utama pagi dan malam dalam 3D.
   Rumah keluarga = model Blender `rumah_sopir` (tools/blender/rumah/build.py → ringan.py): rumah kampung dengan teras,
   garasi samping berkanopi tempat Si Ijo, pagar besi dan gerbang geser. Di sekitarnya ruko, warung, pohon, tiang, jalan gang.
   Pemain (tokoh) berjalan dengan mengetuk tanah atau angkot. Pagi: jalan ke pintu angkot di garasi, lalu berangkat (tokoh
   naik, angkot keluar gerbang dan belok kanan). Malam: angkot datang dari kiri, berhenti, lalu mundur masuk garasi; tokoh
   turun dan jalan ke teras; istirahat = masuk pintu rumah. Hanya tampilan; aturan main tetap di game.js.
   Renderer, material, dan aset dipakai bersama drive3d.js (NARIK_3D._).
   Satuan meter di kode ini (dikali M2U untuk three.js). Sumbu adegan: x kanan, z ke arah kamera/jalan.
   Titik di model (custom property 'titik', ruang Blender x, y, z) → adegan (x, -y), tinggi z. */
(function (root) {
'use strict';
const D3 = () => root.NARIK_3D, I = () => root.NARIK_3D._;
function available() { return !!(root.THREE && D3() && D3().available()); }

// warna penanda bangunan tetangga: [dinding (CAT), atap (KEDUA)]
const WARNA_BANGUNAN = { ruko: ['#e6c84a', '#8e3f32'], warung: ['#9fd0c0', '#3e6fb1'], rumah_jauh: ['#d9cdb0', '#a85a46'], rumah: ['#e8d9c0', '#a85a46'] };
const JALUR_Z = 8.6;          // lajur jalan gang yang dipakai angkot datang dan pergi
const TEPI_Z = 6.3;           // angkot armada lain parkir di tepi jalan

function mount(host, opt) {
  const T = root.THREE, X = I(), M = X.M2U, REN = X.siapRen();
  const C = X.C, mat = X.mat, HI = X.HI;
  const u = v => v * M;
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(56, 0.5, u(0.5), u(140));
  const mats = [], geos = [];
  const vmat = mat({ vc: true, obj: true }); mats.push(vmat);
  const wmat = mat({ vc: true }); mats.push(wmat);

  // ---------- titik penting dari model rumah
  const rg = D3().assets.geo.rumah_sopir, tk = (rg && rg.main.userData.ex && rg.main.userData.ex.titik) || {};
  const tt = (k, d) => tk[k] ? [tk[k][0], -tk[k][1], tk[k][2]] : d;
  const PINTU = tt('pintu', [3.25, 0.55, 0.35]), MASUK = tt('masuk', [3.25, -0.4, 0.35]);
  const PARKIR = tt('parkir', [-3.7, -0.9, 0]); PARKIR[1] = -0.4;
  const L_TERAS = tt('lampu_teras', [4.35, 0.25, 2.6]), L_GARASI = tt('lampu_garasi', [-3.9, -0.65, 2.55]);
  // angkot menghadap +Z (ke jalan); pintu penumpang di sisi kirinya = +X (ke rumah)
  const NAIK = [PARKIR[0] + 1.45, PARKIR[1] - 0.48];

  // ---------- langit dan cahaya
  const hemi = new T.HemisphereLight(0xffffff, 0x6f6a55, 0.8); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, 1); scene.add(sun); scene.add(sun.target);
  if (HI) {
    scene.environment = X.envMap(); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    const sc = sun.shadow.camera; sc.left = -u(17); sc.right = u(17); sc.top = u(17); sc.bottom = -u(17); sc.near = u(1); sc.far = u(90); sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 1.2;
  }
  scene.fog = new T.Fog(0xcfe6f2, u(30), u(80));
  const teras = new T.PointLight(0xffc27a, 0, u(9), 1.6); teras.position.set(u(L_TERAS[0]), u(L_TERAS[2]), u(L_TERAS[1])); scene.add(teras);
  const garasiL = new T.PointLight(0xfff0c8, 0, u(8), 1.6); garasiL.position.set(u(L_GARASI[0]), u(L_GARASI[2]), u(L_GARASI[1])); scene.add(garasiL);
  const jalanL = new T.PointLight(0xffe2a8, 0, u(14), 1.4); jalanL.position.set(u(-8.2), u(7), u(5.6)); scene.add(jalanL);
  const lampu = new T.SpotLight(0xfff2cc, 0, u(16), 0.5, 0.6, 1.2); scene.add(lampu); scene.add(lampu.target);

  // ---------- tanah luar kavling, trotoar, jalan gang
  const tanah = (w, d, x, z, y, col) => {
    const m = new T.Mesh(new T.PlaneGeometry(u(w), u(d)), mat({ color: col })); m.rotation.x = -Math.PI / 2; m.position.set(u(x), u(y), u(z));
    m.receiveShadow = true; scene.add(m); mats.push(m.material); geos.push(m.geometry); return m;
  };
  tanah(180, 180, 0, -20, -0.03, '#8d9468');
  tanah(90, 1.3, 0, 4.85, 0.01, '#cfc7b0');               // trotoar depan pagar
  tanah(90, 6.4, 0, 8.7, 0.012, '#5a6066');               // jalan gang
  for (let x = -42; x < 44; x += 4) tanah(1.6, 0.14, x, 8.7, 0.02, '#e8e2d0');   // marka putus-putus
  tanah(90, 1.4, 0, 12.6, 0.015, '#cfc7b0');

  // ---------- rumah dan benda di sekitarnya (aset Blender)
  const pasang = (nama, x, z, ry, s, part, m) => {
    if (!X.hasAsset(nama)) return null;
    const cols = WARNA_BANGUNAN[nama] ? { cat: WARNA_BANGUNAN[nama][0], kedua: WARNA_BANGUNAN[nama][1] } : null;
    const ob = new T.Mesh(X.assetGeo(nama, part || 'main', cols), m || wmat);
    ob.position.set(u(x), 0, u(z)); ob.rotation.y = ry || 0; if (s) ob.scale.setScalar(s);
    ob.castShadow = ob.receiveShadow = true; scene.add(ob); return ob;
  };
  const MUKA = -Math.PI / 2;                              // bangunan biasa menghadap +X -> menghadap +Z
  pasang('rumah_sopir', 0, 0, 0, 1);
  const lampuM = new T.MeshBasicMaterial({ color: C('#5a5548') }); mats.push(lampuM);
  if (rg && rg.lampu) { const b = new T.Mesh(X.assetGeo('rumah_sopir', 'lampu'), lampuM); scene.add(b); }
  // kanopi garasi tembus pandang: kamera melihat dari atas, angkot dan tokoh di bawahnya tetap terlihat
  if (rg && rg.kanopi) {
    const km = mat({ vc: true }); km.transparent = true; km.opacity = 0.28; km.depthWrite = false; mats.push(km);
    const k = new T.Mesh(X.assetGeo('rumah_sopir', 'kanopi'), km); k.castShadow = true; k.renderOrder = 2; scene.add(k);
  }
  pasang('ruko', -12.6, -2.6, MUKA, 1.15);
  pasang('rumah', 11.2, -2.2, MUKA, 1.1);
  pasang('warung', 17.5, -1.6, MUKA, 1.1);
  pasang('pohon_mangga', 8.4, 1.6, 0.6, 1.2);
  pasang('pohon_kelapa', -10.2, 2.2, 1.1, 1.0);
  pasang('tiang', 7.4, 5.2, 0, 1);
  pasang('lampu_jalan', -8.2, 5.2, MUKA, 1);
  pasang('gerobak', 9.8, 4.9, 0.25, 1);
  for (let i = 0; i < 11; i++) {                          // kampung di belakang
    const x = -30 + i * 6.2 + (i % 2) * 1.5, z = -15 - (i % 3) * 3.2;
    const r = pasang('rumah_jauh', x, z, 0, 0); if (r) r.scale.set(4.6, 3.6, 4.2);
    if (i % 2) pasang('pohon_jauh', x + 3, z - 2, 0, 1.7);
  }
  // cahaya dari pintu yang terbuka (malam): bidang hangat di balik pintu
  const pintuM = new T.MeshBasicMaterial({ color: C('#15191c') }); mats.push(pintuM);
  const pintuG = new T.Mesh(new T.PlaneGeometry(u(1.5), u(2.2)), pintuM); geos.push(pintuG.geometry);
  pintuG.position.set(u(MASUK[0]), u(0.35 + 1.1), u(-0.57)); scene.add(pintuG);

  // ---------- lantai teras lebih tinggi; rintangan untuk tokoh berjalan
  const tinggi = (x, z) => {
    if (x > 0.4 && x < 6.1 && z > -0.7 && z < 2.0) return 0.35;               // teras dan ambang pintu
    if (x > 2.35 && x < 4.15 && z >= 2.0 && z < 2.3) return 0.23;             // anak tangga
    if (x > 2.35 && x < 4.15 && z >= 2.3 && z < 2.6) return 0.12;
    return 0;
  };
  const BATAS = { x0: -6.0, x1: 6.8, z0: -4.9, z1: 3.7 };
  const RUMAH = [{ x0: -1.55, x1: 6.55, z0: -7.1, z1: 0.0 }, { x0: 0.6, x1: 2.5, z0: 1.7, z1: 2.0 }, { x0: 4.0, x1: 5.9, z0: 1.7, z1: 2.0 },
    { x0: 0.38, x1: 0.75, z0: 1.62, z1: 2.0 }, { x0: 5.78, x1: 6.15, z0: 1.62, z1: 2.0 }, { x0: -6.3, x1: -4.8, z0: -5.3, z1: -4.4 }];
  const RINTANG = RUMAH.slice();

  // ---------- armada: angkot pemain di garasi, sisanya parkir di tepi jalan
  const parkir = [];
  function bangunArmada(fleet) {
    for (const p of parkir) scene.remove(p.m);
    parkir.length = 0; RINTANG.length = RUMAH.length;
    const TEPI = [3.0, 8.2, -8.6, 13.4, -13.8];
    fleet.slice(0, 6).forEach((a, i) => {
      const nama = X.hasAsset('angkot_' + a.route) ? 'angkot_' + a.route : 'angkot';
      const m = new T.Mesh(X.vehicleGeo(nama, a.hex), vmat); m.castShadow = m.receiveShadow = true;
      const x = i === 0 ? PARKIR[0] : TEPI[i - 1], z = i === 0 ? PARKIR[1] : TEPI_Z, ry = i === 0 ? Math.PI : -Math.PI / 2;
      m.position.set(u(x), 0, u(z)); m.rotation.y = ry; scene.add(m);
      parkir.push({ m, x, z, ry, a });
      if (i === 0) RINTANG.push({ x0: x - 0.95, x1: x + 0.95, z0: z - 2.2, z1: z + 1.9 });
    });
  }

  // ---------- tokoh: bagian-bagian orang ringan dengan kerangka (InstancedMesh satu orang, animasi di shader)
  function tokoh(nama, warna) {
    const geo = D3().assets.geo[nama]; if (!geo) return null;
    const anim = new T.InstancedBufferAttribute(new Float32Array(4), 4); anim.setUsage(T.DynamicDrawUsage);
    const J = X.sendiOf(geo.kulit), parts = [], dummy = new T.Object3D();
    for (const k of ['celana', 'baju', 'kulit', 'rambut', 'lain']) {
      if (!geo[k]) continue;
      const g = X.assetGeo(nama, k).clone(); geos.push(g); g.setAttribute('aAnim', anim);
      const ma = mat({ vc: true, obj: true }); mats.push(ma);
      const im = new T.InstancedMesh(g, J ? X.animMat(ma, J) : ma, 1); im.castShadow = true; im.frustumCulled = false;
      if (J && HI) { const dm = new T.MeshDepthMaterial({ depthPacking: T.RGBADepthPacking }); dm.onBeforeCompile = sh => X.animShader(sh, J); im.customDepthMaterial = dm; mats.push(dm); }
      im.setColorAt(0, C(warna[k] || '#ffffff')); scene.add(im); parts.push(im);
    }
    const o = { x: 0, z: 0, y: 0, ry: 0, ph: 0, am: 0, wv: 0, vis: true, tx: null, tz: null, cb: null };
    o.draw = () => {
      dummy.position.set(u(o.x), u(o.y), u(o.z)); dummy.rotation.set(0, o.ry, 0); dummy.updateMatrix();
      anim.array[0] = o.ph; anim.array[1] = o.am; anim.array[2] = o.wv; anim.needsUpdate = true;
      for (const p of parts) { p.visible = o.vis; p.setMatrixAt(0, dummy.matrix); p.instanceMatrix.needsUpdate = true; }
    };
    return o;
  }
  const aku = tokoh('orang_dimas', { baju: opt.kaos || '#2f8f5b', kulit: '#a8714a', celana: '#2f3d4a', rambut: '#1b1714', lain: '#ffffff' });
  const dimas = tokoh('orang_dimas', { baju: '#e6c84a', kulit: '#b07a52', celana: '#3b5b7a', rambut: '#2a221c', lain: '#ffffff' });
  const TEMPAT_DIMAS = [4.5, 0.75];

  // ---------- gerak tokoh: lurus ke tujuan, menyusuri sisi rintangan kalau menabrak; naik-turun lantai teras
  const di = (x, z) => RINTANG.find(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  function jalanKe(o, x, z, cb, bebas) {
    o.tx = bebas ? x : Math.max(BATAS.x0, Math.min(BATAS.x1, x)); o.tz = bebas ? z : Math.max(BATAS.z0, Math.min(BATAS.z1, z));
    const r = !bebas && di(o.tx, o.tz);
    if (r) {   // tujuan di dalam rintangan: ke tepi terdekat
      const opsi = [[r.x0 - 0.15, o.tz], [r.x1 + 0.15, o.tz], [o.tx, r.z0 - 0.15], [o.tx, r.z1 + 0.15]]
        .sort((a, b) => Math.hypot(a[0] - o.tx, a[1] - o.tz) - Math.hypot(b[0] - o.tx, b[1] - o.tz));
      o.tx = opsi[0][0]; o.tz = opsi[0][1];
    }
    o.cb = cb || null; o.bebas = !!bebas; o.macet = 0;
  }
  function gerak(o, dt) {
    if (!o) return;
    o.y += (tinggi(o.x, o.z) - o.y) * Math.min(1, dt * 14);
    if (o.tx == null) { o.am = Math.max(0, o.am - dt * 4); return; }
    const dx = o.tx - o.x, dz = o.tz - o.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { o.tx = null; o.am = 0; const cb = o.cb; o.cb = null; if (cb) cb(); return; }
    const sp = Math.min(d, 1.7 * dt); let nx = o.x + dx / d * sp, nz = o.z + dz / d * sp;
    const r = o.bebas ? null : di(nx, nz);
    if (r) {
      // menyusuri sisi rintangan, ke arah sudut yang lebih dekat dengan tujuan
      if (!di(nx, o.z)) nz = o.z; else if (!di(o.x, nz)) nx = o.x;
      else { const kiri = Math.abs(o.tx - r.x0) < Math.abs(o.tx - r.x1); nx = o.x + (kiri ? -sp : sp); nz = o.z; }
    }
    const mx = nx - o.x, mz = nz - o.z;
    if (Math.hypot(mx, mz) < 1e-4) { if ((o.macet += dt) > 0.4) { o.tx = null; o.am = 0; } return; }
    o.x = nx; o.z = nz; o.ph += Math.hypot(mx, mz) * M * 0.21; o.am = Math.min(1, o.am + dt * 6);
    const ry = Math.atan2(-mx, -mz); let dr = ry - o.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); o.ry += dr * Math.min(1, dt * 12);
  }

  // ---------- jalur angkot: titik-titik (x, z); mundur = badan menghadap berlawanan dengan arah gerak
  function jalur(bagian) {
    const P = [];
    for (const b of bagian) {
      if (b.garis) { const [a, c] = b.garis, n = Math.max(2, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 0.1)); for (let i = 0; i <= n; i++) P.push([a[0] + (c[0] - a[0]) * i / n, a[1] + (c[1] - a[1]) * i / n]); }
      if (b.busur) { const { c, r, a0, a1 } = b.busur, n = Math.ceil(Math.abs(a1 - a0) * r / 0.1); for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; P.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } }
    }
    const L = [0]; for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]));
    return { P, L, len: L[L.length - 1] };
  }
  function diJalur(j, s) {
    s = Math.max(0, Math.min(j.len, s)); let i = 1; while (i < j.L.length - 1 && j.L[i] < s) i++;
    const a = j.P[i - 1], b = j.P[i], f = (s - j.L[i - 1]) / Math.max(1e-6, j.L[i] - j.L[i - 1]);
    return { x: a[0] + (b[0] - a[0]) * f, z: a[1] + (b[1] - a[1]) * f, dx: b[0] - a[0], dz: b[1] - a[1] };
  }
  const px = PARKIR[0], pz = PARKIR[1], R1 = 1.8, R2 = 3.2;
  // berangkat: maju keluar gerbang, belok kanan ke lajur, lalu lurus ke kanan
  const J_BERANGKAT = jalur([{ garis: [[px, pz], [px, JALUR_Z - R1]] }, { busur: { c: [px + R1, JALUR_Z - R1], r: R1, a0: Math.PI, a1: Math.PI / 2 } },
    { garis: [[px + R1, JALUR_Z], [px + 40, JALUR_Z]] }]);
  // pulang: datang dari kiri di lajur, berhenti melewati gerbang, lalu mundur berbelok masuk garasi
  const J_DATANG = jalur([{ garis: [[px - 26, JALUR_Z], [px + R2, JALUR_Z]] }]);
  const J_MUNDUR = jalur([{ busur: { c: [px + R2, JALUR_Z - R2], r: R2, a0: Math.PI / 2, a1: Math.PI } }, { garis: [[px, JALUR_Z - R2], [px, pz]] }]);
  function taruh(p, j, s, mundur) {
    const q = diJalur(j, s); p.m.position.set(u(q.x), 0, u(q.z));
    let ry = Math.atan2(-q.dx, -q.dz); if (mundur) ry += Math.PI; p.m.rotation.y = ry;
    return q;
  }

  // ---------- keadaan adegan
  let mode = 'pagi', seq = null, dekat = false, fokus = { x: 0, z: 0 }, naik = 0;
  const api = { onDekat: null, get dekat() { return dekat; }, _: () => ({ scene, parkir, aku, cam }) };   // _: untuk pemeriksaan
  function suasana(m) {
    const malam = m === 'malam';
    const langit = malam ? '#1b2440' : opt.wx === 'hujan' ? '#9aa6ad' : opt.wx === 'mendung' ? '#b7c4cb' : '#cfe6f2';
    scene.background = C(langit); scene.fog.color.copy(C(langit));
    hemi.color.copy(C(malam ? '#6f7fb0' : '#dfeaf2')); hemi.groundColor.copy(C(malam ? '#1c1a22' : '#6f6a55'));
    hemi.intensity = (malam ? 0.3 : 0.8) * (HI ? 0.8 : 1);
    sun.color.copy(C(malam ? '#9fb2e6' : '#fff1d8')); sun.intensity = (malam ? 0.16 : 0.9) * (HI ? 2.4 : 1) * (opt.wx === 'hujan' && !malam ? 0.5 : 1);
    teras.intensity = malam ? (HI ? 2.4 : 1.3) : 0; garasiL.intensity = malam ? (HI ? 1.8 : 1.0) : 0; jalanL.intensity = malam ? (HI ? 2.6 : 1.4) : 0;
    pintuM.color.copy(C(malam ? '#ffd27a' : '#15191c'));
    lampuM.color.copy(C(malam ? '#fff2c0' : '#8a8578'));
    if (HI) REN.toneMappingExposure = malam ? 1.15 : 1.0;
  }
  function setel(o) {
    Object.assign(opt, o || {});
    mode = opt.phase === 'malam' ? 'malam' : 'pagi';
    bangunArmada(opt.fleet || []);
    suasana(mode);
    seq = null; lampu.intensity = 0;
    if (aku) { aku.vis = true; aku.tx = null; aku.am = 0; aku.wv = 0; }
    if (mode === 'pagi') { if (aku) { aku.x = PINTU[0]; aku.z = PINTU[1]; aku.ry = Math.PI; } }
    else if (aku) { aku.x = PINTU[0] - 0.5; aku.z = PINTU[1] + 0.6; aku.ry = Math.PI * 0.9; }
    if (dimas) { dimas.vis = mode === 'pagi'; dimas.x = TEMPAT_DIMAS[0]; dimas.z = TEMPAT_DIMAS[1]; dimas.ry = Math.PI * 1.1; dimas.wv = 0; }
    if (aku) aku.y = tinggi(aku.x, aku.z); if (dimas) dimas.y = tinggi(dimas.x, dimas.z);
    fokus = { x: aku ? aku.x : 0, z: aku ? aku.z : 0 };
    cekDekat();
  }
  function angkotku() { return parkir[0]; }
  function cekDekat() {
    const d = angkotku() && aku ? Math.hypot(aku.x - NAIK[0], aku.z - NAIK[1]) : 99;
    const now = mode === 'pagi' && !seq && d < 1.1;
    if (now !== dekat) { dekat = now; if (api.onDekat) api.onDekat(dekat); }
  }

  // ---------- urutan: berangkat, pulang, istirahat
  api.keAngkot = cb => {
    if (!angkotku() || !aku) { if (cb) cb(); return; }
    jalanKe(aku, NAIK[0], NAIK[1], () => { aku.ry = Math.PI / 2; cekDekat(); if (cb) cb(); });
  };
  // ikut = pemain sendiri yang menyetir (naik ke angkot); kalau tidak, sopirnya yang membawa angkot pergi
  api.berangkat = (cb, ikut) => {
    const p = angkotku(); if (!p) { cb(); return; }
    api.keAngkot(() => { seq = { k: 'berangkat', t: 0, p, cb, s: 0, v: 0, ikut: ikut !== false }; dekat = false; if (api.onDekat) api.onDekat(false); });
  };
  api.pulang = ikut => {
    const p = angkotku(); if (!p || !aku) return;
    if (ikut !== false) aku.vis = false;
    seq = { k: 'pulang', t: 0, p, s: 0, v: 7, tahap: 0, ikut: ikut !== false }; taruh(p, J_DATANG, 0, false);
    lampu.intensity = HI ? 3 : 1.6;
  };
  api.istirahat = cb => {
    if (!aku) { cb(); return; }
    seq = null; aku.vis = true;
    jalanKe(aku, PINTU[0], PINTU[1], () => { jalanKe(aku, MASUK[0], MASUK[1], () => { aku.vis = false; setTimeout(cb, 300); }, true); });
  };
  function langkahSeq(dt) {
    if (!seq) return;
    const s = seq, p = s.p; s.t += dt;
    if (s.k === 'berangkat') {
      if (s.t > 0.35 && s.ikut) aku.vis = false;                   // naik ke angkot
      if (dimas) { dimas.wv = 1; dimas.ph += dt * 9; }
      if (s.t > 0.8) {
        const q = diJalur(J_BERANGKAT, s.s), belok = Math.abs(q.dx) > 0.01 && Math.abs(q.dz) > 0.01;
        s.v = Math.min(belok ? 2.6 : 7, s.v + dt * 2.6); s.s += s.v * dt; taruh(p, J_BERANGKAT, s.s, false);
        fokus.x += (p.m.position.x / M - fokus.x) * Math.min(1, dt * 1.2); fokus.z += (Math.min(5, p.m.position.z / M) - fokus.z) * Math.min(1, dt * 1.2);
      }
      if ((s.s > J_BERANGKAT.len - 26 || s.t > 7) && !s.done) { s.done = true; if (s.cb) s.cb(); }
    } else if (s.k === 'pulang') {
      if (s.tahap === 0) {                                            // datang, melambat sampai berhenti melewati gerbang
        const sisa = J_DATANG.len - s.s; s.v = Math.max(0.6, Math.min(7, Math.sqrt(2 * 2.4 * sisa))); s.s = Math.min(J_DATANG.len, s.s + s.v * dt);
        const q = taruh(p, J_DATANG, s.s, false);
        lampu.position.set(u(q.x + 2.2), u(1), u(q.z)); lampu.target.position.set(u(q.x + 9), 0, u(q.z));
        if (sisa < 0.02) { s.tahap = 1; s.t = 0; s.s = 0; lampu.intensity = 0; }
      } else if (s.tahap === 1) {                                     // mundur masuk garasi
        if (s.t > 0.5) { s.s = Math.min(J_MUNDUR.len, s.s + Math.min(1.8, 0.4 + s.t) * dt); taruh(p, J_MUNDUR, s.s, true); }
        if (s.s >= J_MUNDUR.len) {
          p.m.position.set(u(p.x), 0, u(p.z)); p.m.rotation.y = p.ry;
          seq = null;
          if (!s.ikut) return;
          aku.vis = true; aku.x = NAIK[0]; aku.z = NAIK[1]; aku.ry = -Math.PI / 2;
          setTimeout(() => jalanKe(aku, PINTU[0] - 0.5, PINTU[1] + 0.6, () => { aku.ry = Math.PI * 0.05; }), 300);
          return;
        }
      }
      const q = p.m.position; fokus.x += (q.x / M - fokus.x) * Math.min(1, dt * 2); fokus.z += (Math.min(4, q.z / M) - fokus.z) * Math.min(1, dt * 2);
    }
  }

  // ---------- kamera dan gambar
  const ray = new T.Raycaster(), tm = new T.Vector2(), bidang = new T.Plane(new T.Vector3(0, 1, 0), 0), titik = new T.Vector3();
  let Wc = 1, Hc = 1;
  function ketuk(e) {
    if (seq || !aku || !aku.vis) return;
    const r = REN.domElement.getBoundingClientRect();
    tm.set((e.clientX - r.left) / r.width * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(tm, cam);
    if (mode === 'pagi' && parkir.length && ray.intersectObject(parkir[0].m, false).length) { api.keAngkot(); return; }
    if (ray.ray.intersectPlane(bidang, titik)) jalanKe(aku, titik.x / M, titik.z / M, cekDekat);
  }
  function gambar(dt) {
    langkahSeq(dt); gerak(aku, dt); gerak(dimas, dt);
    if (dimas && mode === 'pagi' && !(seq && seq.k === 'berangkat') && aku) {
      // Dimas menoleh ke kakaknya
      const t = Math.atan2(-(aku.x - dimas.x), -(aku.z - dimas.z)); let dr = t - dimas.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); dimas.ry += dr * Math.min(1, dt * 3);
      dimas.wv = 0;
    }
    if (aku) aku.draw(); if (dimas) dimas.draw();
    if (!seq && aku) { fokus.x += (aku.x - fokus.x) * Math.min(1, dt * 2.5); fokus.z += (aku.z - fokus.z) * Math.min(1, dt * 2.5); }
    cekDekat();
    // kamera dari depan-atas, sedikit dari kanan; layar sempit = mundur supaya rumah dan garasi tetap terlihat.
    // malam: panel buku menutupi separuh bawah layar, jadi adegan digeser ke atas
    const jauh = Wc / Hc < 0.7 ? 1.3 : 1;
    naik += ((mode === 'malam' ? 1 : 0) - naik) * Math.min(1, dt * 3);
    const fx = Math.max(-4.5, Math.min(5.5, fokus.x)), fz = Math.max(-2.5, Math.min(5, fokus.z));
    cam.position.set(u(fx + 1.6), u(8.8 * jauh), u(fz + 11.5 * jauh)); cam.lookAt(u(fx * 0.92), u(0.9 - naik * 1.5), u(fz - 1.8 + naik * 6.5));
    if (HI) { sun.target.position.set(u(fx), 0, u(fz)); sun.position.set(u(fx + (mode === 'malam' ? 10 : -12)), u(26), u(fz + 18)); }
    REN.render(scene, cam);
  }

  // ---------- pasang, ukuran, perulangan
  let raf = 0, last = 0, aktif = false;
  function ukur() {
    const r = host.getBoundingClientRect(); Wc = Math.max(1, r.width); Hc = Math.max(1, r.height);
    REN.setSize(Wc, Hc); cam.aspect = Wc / Hc; cam.updateProjectionMatrix();
  }
  function loop(t) {
    if (!aktif) return;
    const dt = Math.min(0.1, (t - last) / 1000 || 0); last = t;
    gambar(dt); raf = requestAnimationFrame(loop);
  }
  api.lanjut = () => {
    // kanvas renderer bersama dipindah ke sini lagi (sesudah rit nyetir memakainya)
    X.siapRen(); const cv = REN.domElement; cv.className = 'rm-3d';
    if (cv.parentNode !== host) host.insertBefore(cv, host.firstChild);
    ukur(); if (!aktif) { aktif = true; last = performance.now(); raf = requestAnimationFrame(loop); }
  };
  api.jeda = () => { aktif = false; cancelAnimationFrame(raf); };
  api.setel = setel;
  api.armada = f => { opt.fleet = f; bangunArmada(f); cekDekat(); };
  api.lepas = () => {
    api.jeda(); host.removeEventListener('pointerdown', ketuk); root.removeEventListener('resize', ukur);
    for (const m of mats) m.dispose(); for (const g of geos) g.dispose();
    const cv = REN.domElement; if (cv.parentNode === host) host.removeChild(cv);
  };
  host.addEventListener('pointerdown', ketuk); root.addEventListener('resize', ukur);
  setel(opt);
  api.lanjut();
  return api;
}

root.NARIK_RUMAH = { available, mount };
})(typeof window !== 'undefined' ? window : globalThis);
