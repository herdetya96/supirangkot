/* NARIK — adegan rumah sopir (window.NARIK_RUMAH): layar utama pagi dan malam dalam 3D.
   Halaman rumah di gang Cibening: rumah, angkot armada diparkir menghadap kanan, Dimas di teras, tetangga, pohon, tiang.
   Pemain (tokoh) berjalan dengan mengetuk tanah atau angkot. Pagi: jalan ke pintu angkot, lalu berangkat (tokoh masuk,
   angkot melaju ke kanan). Malam: angkot pulang dari kiri dan parkir, tokoh turun lalu jalan ke teras; istirahat = masuk rumah.
   Hanya tampilan; aturan main tetap di game.js. Renderer, material, dan aset dipakai bersama drive3d.js (NARIK_3D._).
   Satuan: meter di kode ini, dikali M2U (25) untuk three.js. Kamera di +Z melihat ke -Z; rumah menghadap +Z. */
(function (root) {
'use strict';
const D3 = () => root.NARIK_3D, I = () => root.NARIK_3D._;
function available() { return !!(root.THREE && D3() && D3().available()); }

// warna penanda bangunan: [dinding (CAT), atap (KEDUA)]
const WARNA_BANGUNAN = { rumah: ['#efe6d2', '#b5523b'], ruko: ['#e6c84a', '#8e3f32'], warung: ['#9fd0c0', '#3e6fb1'],
  rumah_jauh: ['#d9cdb0', '#a85a46'] };
// tata letak (meter)
const RUMAH = { x: 0, z: -5.5, s: 1.25 };
const PINTU = [-0.25, -3.0];             // berdiri di teras depan pintu
const ANGKOT = { x: 0.5, z: 1.6 };       // angkot pemain, menghadap +X, pintu penumpang di sisi rumah (-Z)
const NAIK = [0.05, 0.15];               // titik berdiri untuk naik
const BATAS = { x0: -8.6, x1: 8.6, z0: -3.1, z1: 4.4 };
const RINTANG = [{ x0: -4.4, x1: 4.4, z0: -9.2, z1: -3.3 }];   // rumah; angkot ditambah saat dibangun

function mount(host, opt) {
  const T = root.THREE, X = I(), M = X.M2U, REN = X.siapRen();
  const C = X.C, mat = X.mat;
  const u = v => v * M;
  const scene = new T.Scene();
  const cam = new T.PerspectiveCamera(58, 0.5, u(0.5), u(120));
  const mats = [], geos = [];
  const vmat = mat({ vc: true, obj: true }); mats.push(vmat);
  const wmat = mat({ vc: true }); mats.push(wmat);
  const HI = X.HI;

  // ---------- langit dan cahaya
  const hemi = new T.HemisphereLight(0xffffff, 0x6f6a55, 0.8); scene.add(hemi);
  const sun = new T.DirectionalLight(0xffffff, 1); scene.add(sun); scene.add(sun.target);
  if (HI) {
    scene.environment = X.envMap(); sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
    const sc = sun.shadow.camera; sc.left = -u(16); sc.right = u(16); sc.top = u(16); sc.bottom = -u(16); sc.near = u(1); sc.far = u(90); sc.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 1.5;
  }
  scene.fog = new T.Fog(0xcfe6f2, u(28), u(70));
  const teras = new T.PointLight(0xffc27a, 0, u(9), 1.6); teras.position.set(u(PINTU[0]), u(2.6), u(-2.6)); scene.add(teras);
  const jalanL = new T.PointLight(0xffe2a8, 0, u(14), 1.4); jalanL.position.set(u(-8.6), u(7), u(6.9)); scene.add(jalanL);
  const lampu = new T.SpotLight(0xfff2cc, 0, u(16), 0.5, 0.6, 1.2); scene.add(lampu); scene.add(lampu.target);

  // ---------- tanah, halaman, jalan, pagar
  const tanah = (w, d, x, z, y, col) => {
    const m = new T.Mesh(new T.PlaneGeometry(u(w), u(d)), mat({ color: col })); m.rotation.x = -Math.PI / 2; m.position.set(u(x), u(y), u(z));
    m.receiveShadow = true; scene.add(m); mats.push(m.material); geos.push(m.geometry); return m;
  };
  tanah(160, 160, 0, -20, 0, '#8d9468');                  // kebun dan lahan
  tanah(18.4, 8, 0, 0.8, 0.01, '#b9b1a0');                // halaman semen
  tanah(80, 1.6, 0, 5.6, 0.015, '#cfc7b0');               // trotoar
  tanah(80, 6, 0, 9.4, 0.012, '#5a6066');                 // jalan gang
  for (let x = -38; x < 40; x += 4) tanah(1.6, 0.14, x, 9.4, 0.02, '#e8e2d0');   // marka putus-putus
  tanah(80, 1.6, 0, 13.2, 0.015, '#cfc7b0');
  const box = (w, h, d, x, y, z, col) => {
    const m = new T.Mesh(new T.BoxGeometry(u(w), u(h), u(d)), mat({ color: col })); m.position.set(u(x), u(y + h / 2), u(z));
    m.castShadow = m.receiveShadow = true; scene.add(m); mats.push(m.material); geos.push(m.geometry); return m;
  };
  // pagar tembok rendah di depan halaman, terbuka di kiri dan kanan untuk angkot
  box(14, 0.7, 0.18, 0, 0, 4.75, '#e9e4d6'); box(14.2, 0.08, 0.26, 0, 0.7, 4.75, '#a85a46');
  for (const x of [-7, 7]) box(0.32, 1.1, 0.32, x, 0, 4.75, '#e9e4d6');
  box(0.18, 1.0, 12, -9.4, 0, -3.2, '#e9e4d6'); box(0.18, 1.0, 12, 9.4, 0, -3.2, '#e9e4d6');

  // ---------- benda dari aset Blender
  const pasang = (nama, x, z, ry, s, part, m) => {
    if (!X.hasAsset(nama)) return null;
    const cols = WARNA_BANGUNAN[nama] ? { cat: WARNA_BANGUNAN[nama][0], kedua: WARNA_BANGUNAN[nama][1] } : null;
    const ob = new T.Mesh(X.assetGeo(nama, part || 'main', cols), m || wmat);
    ob.position.set(u(x), 0, u(z)); ob.rotation.y = ry || 0; if (s) ob.scale.setScalar(s);
    ob.castShadow = ob.receiveShadow = true; scene.add(ob); return ob;
  };
  const MUKA = -Math.PI / 2;                              // bangunan menghadap +X -> menghadap +Z (ke kamera)
  pasang('rumah', RUMAH.x, RUMAH.z, MUKA, RUMAH.s);
  pasang('ruko', -13.5, -5.2, MUKA, 1.1);
  pasang('warung', 12, -4.2, MUKA, 1.1);
  pasang('pohon_mangga', 7.3, -1.6, 0.6, 1.15);
  pasang('pohon_kelapa', -7.8, -1.2, 1.1, 1.0);
  pasang('tiang', 9.7, 5.9, 0, 1);
  const lj = pasang('lampu_jalan', -8.6, 5.9, MUKA, 1);
  let bohlam = null;
  if (lj && X.hasAsset('lampu_jalan') && D3().assets.geo.lampu_jalan.bulb) {
    const bm = new T.MeshBasicMaterial({ color: C('#5a5548') }); mats.push(bm);
    bohlam = new T.Mesh(X.assetGeo('lampu_jalan', 'bulb'), bm); lj.add(bohlam);
  }
  pasang('gerobak', -3.6, 3.3, 0.3, 1);
  for (let i = 0; i < 9; i++) {                           // kampung di belakang
    const x = -26 + i * 6.5 + (i % 2) * 1.5, z = -15 - (i % 3) * 3;
    const r = pasang('rumah_jauh', x, z, 0, 0); if (r) r.scale.set(u(4.6) / M, u(3.6) / M, u(4.2) / M);
    if (i % 2) pasang('pohon_jauh', x + 3, z - 2, 0, 1.6);
  }
  // cahaya dari pintu yang terbuka (malam)
  const pintuM = new T.MeshBasicMaterial({ color: C('#2a2418') }); mats.push(pintuM);
  const pintuG = new T.Mesh(new T.PlaneGeometry(u(0.95), u(1.95)), pintuM); geos.push(pintuG.geometry);
  pintuG.position.set(u(PINTU[0]), u(0.24 + 0.98), u(RUMAH.z + 1.62 * RUMAH.s + 0.02)); scene.add(pintuG);

  // ---------- armada yang diparkir
  const parkir = [];
  function bangunArmada(fleet) {
    for (const p of parkir) { scene.remove(p.m); }
    parkir.length = 0; RINTANG.length = 1;
    // dua angkot muat di halaman; sisanya parkir di pinggir jalan depan rumah
    fleet.slice(0, 6).forEach((a, i) => {
      const nama = X.hasAsset('angkot_' + a.route) ? 'angkot_' + a.route : 'angkot';
      const m = new T.Mesh(X.vehicleGeo(nama, a.hex), vmat); m.castShadow = m.receiveShadow = true;
      const x = i < 2 ? ANGKOT.x - i * 4.9 : 5.5 - (i - 2) * 5.2, z = i < 2 ? ANGKOT.z : 7.7;
      m.position.set(u(x), 0, u(z)); m.rotation.y = -Math.PI / 2; scene.add(m);
      parkir.push({ m, x, a });
      if (i < 2) RINTANG.push({ x0: x - 2.25, x1: x + 2.45, z0: ANGKOT.z - 1.3, z1: ANGKOT.z + 1.3 });
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
    const o = { x: 0, z: 0, ry: 0, ph: 0, am: 0, wv: 0, vis: true, tx: null, tz: null, cb: null };
    o.draw = () => {
      dummy.position.set(u(o.x), 0, u(o.z)); dummy.rotation.set(0, o.ry, 0); dummy.updateMatrix();
      anim.array[0] = o.ph; anim.array[1] = o.am; anim.array[2] = o.wv; anim.needsUpdate = true;
      for (const p of parts) { p.visible = o.vis; p.setMatrixAt(0, dummy.matrix); p.instanceMatrix.needsUpdate = true; }
    };
    return o;
  }
  const aku = tokoh('orang_dimas', { baju: opt.kaos || '#2f8f5b', kulit: '#a8714a', celana: '#2f3d4a', rambut: '#1b1714', lain: '#ffffff' });
  const dimas = tokoh('orang_dimas', { baju: '#e6c84a', kulit: '#b07a52', celana: '#3b5b7a', rambut: '#2a221c', lain: '#ffffff' });
  if (dimas) { dimas.x = 1.7; dimas.z = -2.75; dimas.ry = -0.35; }

  // ---------- gerak tokoh: lurus ke tujuan, menyusuri tepi rintangan kalau menabrak
  const di = (x, z) => RINTANG.find(r => x > r.x0 && x < r.x1 && z > r.z0 && z < r.z1);
  function jalanKe(o, x, z, cb, bebas) {
    o.tx = bebas ? x : Math.max(BATAS.x0, Math.min(BATAS.x1, x)); o.tz = bebas ? z : Math.max(BATAS.z0, Math.min(BATAS.z1, z)); o.cb = cb || null; o.bebas = !!bebas;
  }
  function gerak(o, dt) {
    if (!o || o.tx == null) { if (o) o.am = Math.max(0, o.am - dt * 4); return; }
    const dx = o.tx - o.x, dz = o.tz - o.z, d = Math.hypot(dx, dz);
    if (d < 0.08) { o.tx = null; o.am = 0; const cb = o.cb; o.cb = null; if (cb) cb(); return; }
    const sp = Math.min(d, 1.7 * dt); let nx = o.x + dx / d * sp, nz = o.z + dz / d * sp;
    const r = o.bebas ? null : di(nx, nz);
    if (r) {
      // geser sepanjang sisi rintangan ke arah sudut yang lebih dekat dengan tujuan
      if (!di(nx, o.z)) nz = o.z; else if (!di(o.x, nz)) nx = o.x;
      else { const keKiri = Math.abs(o.tx - r.x0) < Math.abs(o.tx - r.x1); nx = o.x + (keKiri ? -sp : sp); nz = o.z; }
    }
    const mx = nx - o.x, mz = nz - o.z;
    if (Math.hypot(mx, mz) < 1e-4) { o.tx = null; o.am = 0; return; }
    o.x = nx; o.z = nz; o.ph += Math.hypot(mx, mz) * M * 0.21; o.am = Math.min(1, o.am + dt * 6);
    const ry = Math.atan2(-mx, -mz); let dr = ry - o.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); o.ry += dr * Math.min(1, dt * 12);
  }

  // ---------- keadaan adegan
  let mode = 'pagi', seq = null, dekat = false, waktu = 0, fokus = { x: 0, z: 0 }, naik = 0;
  const api = { onDekat: null, get dekat() { return dekat; } };
  function suasana(m) {
    const malam = m === 'malam';
    const langit = malam ? '#1b2440' : opt.wx === 'hujan' ? '#9aa6ad' : opt.wx === 'mendung' ? '#b7c4cb' : '#cfe6f2';
    scene.background = C(langit); scene.fog.color.copy(C(langit));
    hemi.color.copy(C(malam ? '#6f7fb0' : '#dfeaf2')); hemi.groundColor.copy(C(malam ? '#1c1a22' : '#6f6a55'));
    hemi.intensity = (malam ? 0.32 : 0.8) * (HI ? 0.8 : 1);
    sun.color.copy(C(malam ? '#9fb2e6' : '#fff1d8')); sun.intensity = (malam ? 0.18 : 0.9) * (HI ? 2.4 : 1) * (opt.wx === 'hujan' && !malam ? 0.5 : 1);
    sun.position.set(u(malam ? 10 : -14), u(26), u(16)); sun.target.position.set(0, 0, 0);
    teras.intensity = malam ? (HI ? 2.2 : 1.2) : 0; jalanL.intensity = malam ? (HI ? 2.6 : 1.4) : 0;
    pintuM.color.copy(C(malam ? '#ffd27a' : '#2a2418'));
    if (bohlam) bohlam.material.color.copy(C(malam ? '#fff2c0' : '#5a5548'));
    if (HI) REN.toneMappingExposure = malam ? 1.15 : 1.0;
  }
  function setel(o) {
    Object.assign(opt, o || {});
    mode = opt.phase === 'malam' ? 'malam' : 'pagi';
    bangunArmada(opt.fleet || []);
    suasana(mode);
    seq = null; lampu.intensity = 0;
    if (aku) { aku.vis = true; aku.tx = null; aku.am = 0; aku.wv = 0; }
    if (mode === 'pagi') {
      if (aku) { aku.x = PINTU[0]; aku.z = PINTU[1] + 0.3; aku.ry = Math.PI; }
      if (dimas) { dimas.vis = true; dimas.wv = 0; }
    } else if (aku) { aku.x = PINTU[0] + 0.4; aku.z = PINTU[1] + 0.5; aku.ry = Math.PI * 0.9; }
    if (dimas) dimas.vis = mode === 'pagi';
    fokus = { x: aku ? aku.x : 0, z: aku ? aku.z : 0 };
    cekDekat();
  }
  function angkotku() { return parkir.find(p => p.a.self) || parkir[0]; }
  function cekDekat() {
    const p = angkotku(); const d = p && aku ? Math.hypot(aku.x - (p.x + NAIK[0] - ANGKOT.x), aku.z - NAIK[1]) : 99;
    const now = mode === 'pagi' && !seq && d < 1.1;
    if (now !== dekat) { dekat = now; if (api.onDekat) api.onDekat(dekat); }
  }

  // ---------- urutan: berangkat, pulang, istirahat
  api.keAngkot = cb => {
    const p = angkotku(); if (!p || !aku) { if (cb) cb(); return; }
    jalanKe(aku, p.x + NAIK[0] - ANGKOT.x, NAIK[1], () => { aku.ry = 0; cekDekat(); if (cb) cb(); });
  };
  // ikut = pemain sendiri yang menyetir (naik ke angkot); kalau tidak, sopirnya yang membawa angkot pergi
  api.berangkat = (cb, ikut) => {
    const p = angkotku(); if (!p) { cb(); return; }
    api.keAngkot(() => {
      aku.ry = 0; seq = { k: 'berangkat', t: 0, p, cb, v: 0, ikut: ikut !== false }; dekat = false; if (api.onDekat) api.onDekat(false);
    });
  };
  api.pulang = ikut => {
    const p = angkotku(); if (!p || !aku) return;
    if (ikut !== false) aku.vis = false;
    p.m.position.x = u(p.x - 22); seq = { k: 'pulang', t: 0, p, v: 7, ikut: ikut !== false };
    lampu.intensity = HI ? 3 : 1.6;
  };
  api.istirahat = cb => {
    if (!aku) { cb(); return; }
    seq = null; aku.vis = true;
    jalanKe(aku, PINTU[0], PINTU[1] - 0.05, () => { jalanKe(aku, PINTU[0], -3.6, () => { aku.vis = false; setTimeout(cb, 300); }, true); });
  };
  function langkahSeq(dt) {
    if (!seq) return;
    seq.t += dt; const s = seq, p = s.p;
    if (s.k === 'berangkat') {
      if (s.t > 0.35 && s.ikut) aku.vis = false;          // naik ke angkot
      if (dimas) { dimas.wv = 1; dimas.ph += dt * 9; }
      if (s.t > 0.7) { s.v = Math.min(9, s.v + dt * 3.2); p.m.position.x += u(s.v * dt); }
      fokus.x += (p.m.position.x / M - fokus.x) * Math.min(1, dt * 1.5);
      if (s.t > 3.4 && !s.done) { s.done = true; s.cb && s.cb(); }
    } else if (s.k === 'pulang') {
      // datang dari kiri, melambat, berhenti di tempat parkir; lalu turun dan jalan ke teras
      const sisa = u(p.x) - p.m.position.x;
      if (sisa > 0.5) { s.v = Math.max(1.1, Math.min(7, Math.sqrt(2 * 2.2 * sisa / M))); p.m.position.x = Math.min(u(p.x), p.m.position.x + u(s.v * dt)); }
      else if (!s.turun) {
        s.turun = true; p.m.position.x = u(p.x); lampu.intensity = 0;
        if (!s.ikut) { seq = null; return; }
        aku.vis = true; aku.x = p.x + NAIK[0] - ANGKOT.x; aku.z = NAIK[1]; aku.ry = Math.PI;
        setTimeout(() => jalanKe(aku, PINTU[0] + 0.5, PINTU[1] + 0.45, () => { aku.ry = Math.PI * 0.05; }), 250);
        seq = null;
      }
      fokus.x += (p.m.position.x / M - fokus.x) * Math.min(1, dt * 2);
      const hp = p.m.position; lampu.position.set(hp.x + u(2.2), u(1), hp.z); lampu.target.position.set(hp.x + u(9), 0, hp.z);
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
    if (mode === 'pagi' && parkir.length && ray.intersectObjects(parkir.map(p => p.m), false).length) { api.keAngkot(); return; }
    if (ray.ray.intersectPlane(bidang, titik)) jalanKe(aku, titik.x / M, titik.z / M, cekDekat);
  }
  function gambar(dt) {
    waktu += dt;
    langkahSeq(dt); gerak(aku, dt); gerak(dimas, dt);
    if (dimas && mode === 'pagi' && !(seq && seq.k === 'berangkat')) {
      // Dimas menoleh ke kakaknya
      const t = Math.atan2(-(aku.x - dimas.x), -(aku.z - dimas.z)); let dr = t - dimas.ry; dr = Math.atan2(Math.sin(dr), Math.cos(dr)); dimas.ry += dr * Math.min(1, dt * 3);
      dimas.wv = 0;
    }
    if (aku) aku.draw(); if (dimas) dimas.draw();
    if (!seq && aku) { fokus.x += (aku.x - fokus.x) * Math.min(1, dt * 2.5); fokus.z += (aku.z - fokus.z) * Math.min(1, dt * 2.5); }
    cekDekat();
    // kamera: dari depan-atas; makin sempit layar, makin mundur supaya rumah dan angkot tetap terlihat
    const lebar = Wc / Hc, jauh = lebar < 0.7 ? 1.25 : 1;
    const fx = Math.max(-5, Math.min(6, fokus.x)), fz = Math.max(-2.5, Math.min(2.5, fokus.z));
    // malam: panel buku menutupi separuh bawah layar, jadi adegan digeser ke atas (kamera menatap lebih dekat)
    naik += ((mode === 'malam' ? 1 : 0) - naik) * Math.min(1, dt * 3);
    cam.position.set(u(fx + 1.2), u(9.5 * jauh), u(fz + 12.5 * jauh)); cam.lookAt(u(fx * 0.9), u(0.6 - naik * 1.5), u(fz - 2.2 + naik * 6.5));
    if (HI) { sun.target.position.set(u(fx), 0, u(fz)); sun.position.set(u(fx + (mode === 'malam' ? 10 : -14)), u(26), u(fz + 16)); }
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
