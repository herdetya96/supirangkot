/* NARIK — mini-game nyetir di kota Cibening. Tampak atas, kamera ikut berputar mengikuti jalan.
   Fisika memakai dua sumbu: d = jarak sepanjang rute, x = posisi lateral (lajur kita 70–290, lajur kiri menempel trotoar).
   buildWorld(trayek) membuat peta tetap per trayek: tikungan, perempatan, lampu merah, rel, sungai, landmark.
   Sim = fisika murni (jalan juga di Node untuk bot penyeimbang). mount = canvas + kontrol di browser.
   Uang dalam ribuan rupiah, sama seperti game.js. */
(function (root) {
'use strict';
const W = 360, ROAD_L = 70, ROAD_R = 290, LANES = [106, 180, 254], CURB_X = 128;
const PW = 44, PL = 84;
const ACC = 170, BRAKE = 540, COAST = 75, LAT = 380, STOP_V = 30, CORNER_V = 235;
// bot (inp.tx): jalan membelokkan angkot sendiri; ngebut di persimpangan menumpuk 'selip' (kelebihan laju × detik),
// lewat SLIDE_MAX = kebablasan.
const SLIDE_MAX = 40;
// pemain (inp.steer): K_MAX = lengkung roda penuh (1/radius; roda berputar dari lurus ke penuh dalam 0,5 dtk).
// A_LAT = batas cengkeraman: belok kiri lajur tengah (R 142) aman sampai ±168 (30 km/j), belok kanan (R 302) ±246.
const K_MAX = 1 / 55, A_LAT = 200;
// mundur: laju maksimum dan percepatan. YAW_MAX = sudut badan maksimum bot saat pindah lajur.
const V_REV = 90, ACC_REV = 110, YAW_MAX = 0.2;
const KIND = { motor: { w: 18, l: 44 }, mobil: { w: 34, l: 66 }, pikap: { w: 36, l: 76 }, truk: { w: 44, l: 118 } };
const STEP = 8, DMIN = -1000, DMAX = 17000;
// belok di persimpangan: jalan dua arah selebar 444 (u -142..302). Belok kiri memutari pojok dalam kotak simpang
// (R 142 di lajur tengah), belok kanan menyeberangi kotak (R 302). Busurnya pas di dalam kotak simpang.
const R_KIRI = 142, R_KANAN = 302, JW = 444, JU0 = -142;
const LIGHT_T = 16, RAIL_T = 22, CAM_U = -50, Z_STOP = 0.66, Z_FAST = 0.56;

function mulberry(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const hash = n => { n = Math.imul((n | 0) ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return (n ^ (n >>> 16)) >>> 0; };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const overlap = (ax, ad, aw, al, bx, bd, bw, bl) => Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ad - bd) < (al + bl) / 2;

/* ---------- peta ---------- */
const LM = {
  terminal: { label: 'TERMINAL CIBENING', name: 'Terminal' }, pasar: { label: 'PASAR BARU', name: 'Pasar Baru' },
  masjid: { label: 'MASJID AL-IKHLAS', name: 'Masjid Al-Ikhlas' }, sekolah: { label: 'SDN CIBENING 2', name: 'SD Cibening 2' },
  spbu: { label: 'SPBU 34.401', name: 'SPBU', side: 1 }, alun: { label: 'ALUN-ALUN', name: 'Alun-alun' },
  kampus: { label: 'KAMPUS UNIBEN', name: 'Kampus' }, stasiun: { label: 'STASIUN CIBENING', name: 'Stasiun' },
  griya: { label: 'GRIYA ASRI', name: 'Griya Asri' }
};
const ROUTE_LM = { '05': ['terminal', 'masjid', 'sekolah', 'spbu', 'pasar'], '09': ['terminal', 'masjid', 'alun', 'spbu', 'kampus'], '12': ['pasar', 'sekolah', 'stasiun', 'spbu', 'griya'] };
const WORLDS = {};
function buildWorld(route) {
  route = ROUTE_LM[route] ? route : '05';
  if (WORLDS[route]) return WORLDS[route];
  const r = mulberry(hash(route.charCodeAt(0) * 131 + route.charCodeAt(1) * 7 + 99));
  const segs = []; let total = DMIN, dir = r() < 0.5 ? 1 : -1;
  segs.push({ t: 'S', len: 1700 }); total += 1700;
  while (total < DMAX + 400) {
    const R = dir > 0 ? R_KIRI : R_KANAN, len = R * Math.PI / 2; segs.push({ t: 'A', len, R, dir, tipe: r() < 0.5 ? 'perempatan' : 'pertigaan', lurus: r() < 0.5 }); total += len; dir = -dir;
    const L = 1500 + Math.floor(r() * 1000); segs.push({ t: 'S', len: L }); total += L;
  }
  let d0 = DMIN; for (const sg of segs) { sg.d0 = d0; sg.d1 = d0 + sg.len; d0 = sg.d1; }
  const n = Math.ceil((total - DMIN) / STEP) + 1;
  const px = new Float64Array(n), py = new Float64Array(n), pa = new Float64Array(n), pk = new Float64Array(n);
  let x = 0, y = 0, a = -Math.PI / 2, si = 0;
  for (let i = 0; i < n; i++) {
    const d = DMIN + i * STEP;
    while (si < segs.length - 1 && d >= segs[si].d1) si++;
    const sg = segs[si];
    px[i] = x; py[i] = y; pa[i] = a; pk[i] = sg.t === 'A' ? sg.dir / sg.R : 0;
    if (sg.t === 'A') { const am = a - sg.dir * STEP / (2 * sg.R); x += Math.cos(am) * STEP; y += Math.sin(am) * STEP; a -= sg.dir * STEP / sg.R; }
    else { x += Math.cos(a) * STEP; y += Math.sin(a) * STEP; }
  }
  const Wd = { route, segs, n, px, py, pa, pk, total };
  Wd.at = function (d) {
    const f = clamp((d - DMIN) / STEP, 0, n - 1.001), i = Math.floor(f), t = f - i;
    const A = pa[i] + (pa[i + 1] - pa[i]) * t, tx = Math.cos(A), ty = Math.sin(A);
    return { x: px[i] + (px[i + 1] - px[i]) * t, y: py[i] + (py[i + 1] - py[i]) * t, a: A, tx, ty, nx: -ty, ny: tx, k: pk[i] };
  };
  Wd.pt = function (d, u) { const p = Wd.at(d); return [p.x + p.nx * u, p.y + p.ny * u]; };
  const straights = segs.filter(s => s.t === 'S'), arcs = segs.filter(s => s.t === 'A');
  // landmark: yang pertama di titik berangkat, sisanya di tengah ruas lurus, yang terakhir tujuan
  const names = ROUTE_LM[route], landmarks = [];
  names.forEach((k, i) => {
    const d = i === 0 ? -260 : straights[i].d0 + 380;
    landmarks.push({ kind: k, d, side: LM[k].side || -1, label: LM[k].label, name: LM[k].name, len: 560, dest: i === names.length - 1 });
  });
  const busy = (d, m) => landmarks.some(l => Math.abs(l.d - d) < l.len / 2 + m);
  const river = { d: straights[2].d1 - 400 };
  const rail = { d: straights[3].d1 - 420 };
  const cross = [];
  for (const sg of straights) {
    for (let d = Math.max(sg.d0 + 360, 150); d < sg.d1 - 330; d += 620 + r() * 360) {
      if (busy(d, 140) || Math.abs(d - river.d) < 300 || Math.abs(d - rail.d) < 300) continue;
      cross.push({ d, light: r() < 0.6 });
    }
  }
  // persimpangan tempat rute berbelok: kotak simpang JW × JW mulai di awal busur, ditambah lengan jalan
  // 'lurus' (terusan jalan datang) dan/atau 'seberang' (terusan jalan keluar ke arah sebaliknya).
  // Perempatan punya keduanya, pertigaan salah satu.
  const junctions = arcs.map(sg => {
    const p = Wd.at(sg.d0), t = [p.tx, p.ty], n = [p.nx, p.ny], S0 = [p.x, p.y];
    const L = (al, u) => [S0[0] + t[0] * al + n[0] * u, S0[1] + t[1] * al + n[1] * u];
    const arms = [];
    const lurus = sg.tipe === 'perempatan' || sg.lurus, seberang = sg.tipe === 'perempatan' || !sg.lurus;
    if (lurus) arms.push({ o: L(JW, JU0 + JW / 2), dir: t });
    if (seberang) { const sd = sg.dir; arms.push({ o: L(JW / 2, sd > 0 ? JU0 + JW : JU0), dir: [n[0] * sd, n[1] * sd] }); }
    return { d0: sg.d0, d1: sg.d1, dir: sg.dir, R: sg.R, tipe: sg.tipe, lurus, seberang, a: p.a, S: S0, t, n, L, arms, nama: sg.tipe === 'perempatan' ? 'Perempatan' : 'Pertigaan' };
  });
  const stubs = [];
  Object.assign(Wd, { straights, arcs, junctions, landmarks, river, rail, cross, stubs, dest: landmarks[landmarks.length - 1] });
  // di dalam kotak simpang (dengan jarak m)?
  Wd.inJ = (d, m) => junctions.some(j => d > j.d0 - (m || 0) && d < j.d1 + (m || 0));
  // jari-jari lintasan di lateral x (lajur dalam lebih sempit) dan laju belok aman di sana
  Wd.radius = (d, x) => { const k = Wd.at(d).k; return k ? 1 / Math.abs(k) + Math.sign(k) * (x - 180) : Infinity; };
  // faktor jarak: di tikungan lajur dalam lebih pendek, jadi d (diukur di garis tengah) maju lebih cepat
  Wd.sf = (d, x) => { const k = Wd.at(d).k; return k ? 1 / Math.max(0.2, 1 + k * (x - 180)) : 1; };
  // peta hambatan: titik-titik jalan untuk mencegah bangunan menimpa jalan
  const H = new Map(), B = 300;
  const add = (x, y, half, d) => { const k = Math.floor(x / B) + ',' + Math.floor(y / B); let L = H.get(k); if (!L) H.set(k, L = []); L.push({ x, y, half, d }); };
  for (let d = DMIN; d < total - 10; d += 24) { const [qx, qy] = Wd.pt(d, 80); add(qx, qy, 220, d); }
  for (const l of landmarks) for (let d = l.d - l.len / 2; d <= l.d + l.len / 2; d += 60) { const [qx, qy] = Wd.pt(d, l.side < 0 ? -320 : 480); add(qx, qy, 175, null); }
  const across = (d, u0, u1, half) => { for (let u = u0; u <= u1; u += 40) { const [qx, qy] = Wd.pt(d, u); add(qx, qy, half, null); } };
  for (const c of cross) across(c.d, -720, 920, 70);
  across(river.d, -2600, 2600, 100); across(rail.d, -2600, 2600, 36);
  for (const j of junctions) {
    for (let al = 0; al <= JW; al += 60) for (let u = JU0; u <= JU0 + JW; u += 60) { const [qx, qy] = j.L(al, u); add(qx, qy, 70, null); }
    for (const a of j.arms) for (let k = 0; k <= 960; k += 40) add(a.o[0] + a.dir[0] * k, a.o[1] + a.dir[1] * k, 250, null);
  }
  Wd.blocked = function (x, y, m, ownD) {
    const bx = Math.floor(x / B), by = Math.floor(y / B);
    for (let i = -2; i <= 2; i++) for (let j = -2; j <= 2; j++) {
      const L = H.get((bx + i) + ',' + (by + j)); if (!L) continue;
      for (const s of L) { if (ownD != null && s.d != null && Math.abs(s.d - ownD) < 420) continue; const dx = s.x - x, dy = s.y - y; if (dx * dx + dy * dy < (s.half + m) * (s.half + m)) return true; }
    }
    return false;
  };
  WORLDS[route] = Wd; return Wd;
}

/* ---------- fisika ---------- */
class Sim {
  constructor(spec) {
    this.spec = spec; this.r = mulberry(spec.seed || 1); this.world = buildWorld(spec.route);
    const Wd = this.world;
    this.t = 0; this.d = 0; this.v = 0; this.x = LANES[1]; this.tx = LANES[1]; this.vx = 0; this.yaw = 0; this.rev = false; this.psi = 0; this.kapA = 0; this.yr = 0; this.latA = 0; this.slip = 0; this.refX = null; this.fwd = 1; this.under = false;
    this.vMax = spec.vMax || 340; this.brakeK = spec.wet ? 0.6 : 1;
    this.riders = []; this.fares = 0; this.boarded = 0;
    this.hits = 0; this.severe = 0; this.potholes = 0; this.tilang = 0; this.missed = 0; this.stolen = 0; this.merah = 0; this.skids = 0;
    this.cool = 0; this.shake = 0; this.stopT = 0; this.braking = false; this.over = false; this.mogok = false; this.deadT = 0; this.skidCool = 0; this.slide = 0;
    this.msgs = []; this.pops = []; this.crossers = []; this.sfx = null;   // sfx: antrean bunyi, diisi hanya kalau mount memasang []
    const gaps = [...Wd.cross.map(c => c.d), Wd.river.d, Wd.rail.d];
    const nudge = d => { for (const g of gaps) if (Math.abs(d - g) < 115) return g + 125; for (const j of Wd.junctions) if (d > j.d0 - 140 && d < j.d1 + 80) return j.d1 + 150; return d; };
    this.groups = spec.groups.map(g => ({ d: nudge(g.d), n: g.n, n0: g.n, prog: 0, taken: null, lure: this.r() < 0.4 }));
    this.cars = spec.traffic.map(m => { const kind = m.kind || 'motor', K = KIND[kind];
      return { kind, w: K.w, l: K.l, d: m.d, x: LANES[m.lane], tx: LANES[m.lane], v: m.v, v0: m.v, hue: Math.floor(this.r() * 8), next: 2 + this.r() * 6 }; });
    this.biru = spec.biru.map(b => ({ kind: 'biru', w: PW, l: PL, d: b.d, x: LANES[1], tx: LANES[1], v: b.v, v0: b.v, state: 'jalan', g: null, timer: 0, left: spec.steal || 1 }));
    this.pots = spec.potholes.map(p => ({ d: nudge(p.d), x: p.x, used: false }));
    this.police = spec.police.map(p => ({ d: nudge(p.d), done: false }));
    this.lights = Wd.cross.filter(c => c.light).map(c => ({ d: c.d, off: this.r() * LIGHT_T, rail: false, done: false }));
    this.lights.push({ d: Wd.rail.d, off: this.r() * RAIL_T, rail: true, done: false });
    this.lights.sort((p, q) => p.d - q.d);
  }
  phase(L) { return (this.t + L.off) % (L.rail ? RAIL_T : LIGHT_T); }
  lightState(L) { const p = this.phase(L); if (L.rail) return p < 14 ? 'hijau' : p < 15.5 ? 'kuning' : 'merah'; return p < 11 ? 'hijau' : p < 12.5 ? 'kuning' : 'merah'; }
  nextLight(d) { return this.lights.find(L => L.d - 70 > d); }
  say(text, kind) { if (this.msgs.some(m => m.text === text && m.t < 1.5)) return; this.msgs.push({ text, kind: kind || '', t: 0 }); if (this.msgs.length > 3) this.msgs.shift(); }
  fx(name) { if (this.sfx && this.sfx.length < 16) this.sfx.push(name); }
  pop(text, good) { this.pops.push({ x: this.x, d: this.d, text, good, t: 0 }); }
  turnV(d, x) { const r = this.world.radius(d, x); return r === Infinity ? Infinity : Math.sqrt(A_LAT * Math.max(20, r)) * (this.spec.wet ? 0.9 : 1); }
  atCurb() { return this.x < CURB_X && Math.abs(this.v) < STOP_V; }
  step(dt, inp) {
    if (this.over) return;
    const S = this.spec; this.t += dt;
    for (const m of this.msgs) m.t += dt; this.msgs = this.msgs.filter(m => m.t < 2.6);
    for (const p of this.pops) p.t += dt; this.pops = this.pops.filter(p => p.t < 1.2);
    this.cool = Math.max(0, this.cool - dt); this.shake = Math.max(0, this.shake - dt); this.skidCool = Math.max(0, this.skidCool - dt);
    if (S.mogokAt != null && this.t >= S.mogokAt && !this.mogok) { this.mogok = true; this.say('Mesin mati! Mogok.', 'bad'); this.fx('mogok'); }
    // gas dan rem: tanpa gas angkot melambat sendiri (rem mesin). inp.gas kosong = gas terus (bot lama)
    // Gigi mundur (inp.mundur): gas mendorong ke belakang. Kalau angkot masih maju, gas mengerem dulu sampai berhenti
    // (dan sebaliknya). Tombol ▼ di mount mengisi inp.mundur. Bot tidak mengisi inp.mundur, jadi selalu maju.
    this.braking = !!inp.brake;
    const gas = inp.gas == null ? 1 : +inp.gas; this.gas = gas > 0 && !this.braking;
    const wantR = !!inp.mundur, toward0 = (v, a) => v > 0 ? Math.max(0, v - a) : Math.min(0, v + a);
    if (Math.abs(this.v) < 1) this.rev = wantR;
    if (this.mogok) this.v = toward0(this.v, BRAKE * 0.5 * dt);
    else if (this.braking) this.v = toward0(this.v, BRAKE * this.brakeK * dt);
    else if (gas > 0 && wantR !== this.rev) this.v = toward0(this.v, BRAKE * 0.6 * dt);
    else if (gas > 0 && wantR) this.v = Math.max(-V_REV, this.v - ACC_REV * gas * dt);
    else if (gas > 0) this.v = Math.min(this.vMax, this.v + ACC * gas * dt);
    else this.v = toward0(this.v, COAST * dt);
    const spd = Math.abs(this.v), x0 = this.x;
    // setir, plus terlempar keluar kalau menikung terlalu kencang
    const k = this.world.at(this.d).k, over = this.v - this.turnV(this.d, this.x), sf = this.world.sf(this.d, this.x);
    // skid hanya untuk tampilan (buntut angkot mengayun) dan peringatan; posisi lateral tidak didorong
    this.skid = k && over > 0 ? Math.sign(k) * over * 3.2 : 0;
    const bebas = inp.steer != null;
    this.slide = this.skid && !bebas ? this.slide + over * dt : Math.max(0, this.slide - 30 * dt);
    const grip = S.wet ? 0.85 : 1;
    const wob = S.wobble ? Math.sin(this.t * 1.7) * 0.25 * S.wobble : 0;
    this.fwd = 1;
    if (inp.steer != null) {
      // SETIR PEMAIN, model kendaraan sederhana tapi realistis:
      //  1. perintah lengkung (cmd) dari tombol, atau dari "sopir bantu" (persimpangan / merapat ke lajur)
      //  2. roda depan berputar dengan laju terbatas (kapA tidak bisa melompat), dibatasi cengkeraman ban
      //  3. badan angkot menyusul dengan kelembaman (laju belok r tertinggal ±0,12 dtk)
      // psi = arah hadap relatif terhadap jalan; jalan yang menikung ikut memutar psi.
      const raw = clamp(inp.steer, -1, 1) + wob, sgnV = Math.sign(this.v) || 1, vv = Math.max(spd, 50);
      // sopir melihat ±0,35 dtk ke depan, jadi belokan dimulai sedikit sebelum mulut simpang dan keluar dengan mulus
      const look = clamp(spd * 0.35, 30, 130), kP = this.world.at(this.d + look * sgnV).k, kT = k || kP;
      // jaga lajur: lengkung jalan + koreksi arah hadap + koreksi jarak ke tengah lajur (teredam, tidak memantul)
      const follow = (xRef, kRoad) => {
        const kEff = kRoad ? kRoad / Math.max(0.2, 1 + kRoad * (xRef - 180)) : 0;
        return -kEff - this.psi * 2.4 / (sgnV * vv) - (this.x - xRef) * 3 / (vv * vv);
      };
      if (this.rescue != null && (this.d > this.rescue || !kT)) this.rescue = null;
      // BANTUAN BELOK: tahan tombol ke arah belokan (atau sesudah sekali kebablasan), angkot dibelokkan seperti sopir.
      // Berlaku dari 200 unit sebelum mulut simpang (tekan lebih awal = angkot tetap di lajurnya sampai saatnya belok)
      // sampai ±0,45 dtk sesudah keluar simpang kalau tombol masih ditahan (jempol telat melepas = tetap lurus di lajur).
      // Ditahan lebih lama lagi = setir biasa (misalnya menepi ke trotoar sesudah belok kiri).
      const jN = this.world.junctions.find(j => this.d > j.d0 - 200 && this.d < j.d1 + 500);
      const toward = !!jN && Math.sign(raw) === -jN.dir && Math.abs(raw) > 0.2;
      if (!toward || !jN || (this.d > jN.d1 && this.jLatch !== jN)) this.jLatch = toward && jN && this.d <= jN.d1 ? jN : null;
      else if (this.d <= jN.d1) this.jLatch = jN;
      this.assist = (!!kT && this.rescue != null) || (toward && (this.d <= jN.d1 || (this.jLatch === jN && this.d < jN.d1 + Math.max(60, spd * 0.45))));
      let cmd;
      if (this.assist) {
        if (this.refX == null) this.refX = LANES.reduce((b, l) => Math.abs(l - this.x) < Math.abs(b - this.x) ? l : b, LANES[0]);
        cmd = follow(this.refX, (k + kP) / 2);
      } else {
        this.refX = null;
        if (Math.abs(raw) >= 0.08) cmd = raw * K_MAX * clamp(60 / vv, 0.2, 1);
        else if (kT) cmd = 0;                       // dilepas di persimpangan: angkot lurus terus (harus ditahan ke arah panah)
        else {
          // dilepas di jalan lurus: lurus lagi dan merapat ke tengah lajur yang sedang dituju
          const aim = this.x + Math.sign(this.psi * this.v) * 32, ln = LANES.reduce((b, l) => Math.abs(l - aim) < Math.abs(b - aim) ? l : b, LANES[0]);
          cmd = clamp(follow(ln, 0), -K_MAX * 0.5, K_MAX * 0.5);
        }
      }
      // roda depan berputar bertahap: dari lurus ke penuh ±0,5 dtk
      // (sopir bantu di persimpangan memutar roda lebih sigap: penuh dalam ±0,2 dtk)
      const kr = K_MAX * (this.assist ? 5 : 2) * dt;
      this.kapA += clamp(cmd - this.kapA, -kr, kr);
      const kLim = spd > 1 ? A_LAT * (S.wet ? 0.81 : 1) / (spd * spd) : K_MAX, kap = clamp(this.kapA, -kLim, kLim);
      this.under = Math.abs(this.kapA) > kLim * 1.02 && spd > 100 && !!kT;      // di jalan lurus batas belok tidak dihitung selip
      // laju belok yang dituju badan angkot
      let yrT = this.v * kap, lag = 0.12;
      // di jalan lurus sudut hadap dibatasi; makin kencang makin kecil (pindah lajur di laju tinggi pakai sudut landai).
      // Batasnya lunak: makin dekat batas, putaran ke luar makin pelan; lewat batas (misalnya keluar simpang) kembali pelan-pelan.
      const pm = k ? 1.1 : clamp(0.45 * 110 / vv, 0.2, 0.45), ps = Math.sign(this.psi);
      if (ps && Math.sign(yrT) === ps) yrT = ps * Math.min(Math.abs(yrT), (pm - Math.abs(this.psi)) * 5);
      else if (ps && Math.abs(this.psi) > pm) yrT = ps * Math.min(ps * yrT, (pm - Math.abs(this.psi)) * 5);
      // menempel di tepi jalan sambil masih mengarah ke luar: badan diluruskan dengan cepat tapi tetap berputar, tidak meloncat
      const lvx = this.v * Math.sin(this.psi);
      if ((this.x <= ROAD_L + PW / 2 + 0.5 && lvx < 0) || (this.x >= ROAD_R - PW / 2 - 0.5 && lvx > 0)) { yrT = -this.psi * 6; lag = 0.08; }
      // kelembaman badan: laju belok menyusul
      this.yr += (yrT - this.yr) * Math.min(1, dt / lag);
      // arah hadap relatif jalan: berubah karena laju belok; perubahan arah jalan dikurangkan sesudah d maju (lihat bawah)
      if (spd > 1) this.psi += this.yr * dt;
      else this.yr = 0;
      this.x += this.v * Math.sin(this.psi) * dt; this.fwd = Math.cos(this.psi);
      this.latA = this.v * this.yr;                 // percepatan ke samping, untuk badan miring di 3D
      this.steer = raw; this.tx = this.x;
      this.skid = this.under ? -Math.sign(kap) * 60 : 0;
    } else {
      if (inp.tx != null) this.tx = inp.tx;
      let tx = clamp(this.tx, ROAD_L + PW / 2, ROAD_R - PW / 2);
      if (S.wobble) tx += Math.sin(this.t * 1.7) * 22 * S.wobble;
      const dx = tx - this.x, lat = LAT * grip * dt;
      this.x += Math.abs(dx) < lat ? dx : Math.sign(dx) * lat;
    }
    const xmin = ROAD_L + PW / 2, xmax = ROAD_R - PW / 2;
    if (this.skid && this.slide > SLIDE_MAX * 0.35) { this.say('Ban berdecit! Rem!', 'bad'); this.fx('decit'); }
    if (this.slide >= SLIDE_MAX && this.skidCool <= 0) {
      this.skids++; this.v *= 0.55; this.slide = 0; this.skidCool = 1.2; this.shake = 0.3; this.say('Kebablasan di persimpangan!', 'bad'); this.fx('selip');
    }
    if (bebas) {
      if (this.under) { this.say('Ban berdecit! Kurangi gas!', 'bad'); this.fx('decit'); }
      // menabrak tepi jalan: menyentuh pelan (geser ke samping < 45) = cuma mentok dan sejajar; benturan keras = kebablasan.
      const lv = this.v * Math.sin(this.psi), into = Math.abs(lv) > 45 && ((this.x <= xmin && lv < 0) || (this.x >= xmax && lv > 0));
      if (into) {
        if (spd > 110 && this.skidCool <= 0) { this.skids++; this.v *= 0.6; this.skidCool = 1.2; this.shake = 0.3; this.say(k ? 'Kebablasan di persimpangan!' : 'Nyenggol pinggir jalan!', 'bad'); this.fx('selip'); }
        if (k) { const j = this.world.junctions.find(j => this.d >= j.d0 && this.d <= j.d1); if (j) this.rescue = j.d1; }
      }
      this.x = clamp(this.x, xmin, xmax);
      this.yaw = this.psi;
    } else {
      this.x = clamp(this.x, xmin, xmax);
      // arah hadap badan angkot dihitung dari gerak sebenarnya (geser ÷ maju), dihaluskan
      const lv = dt > 0 ? (this.x - x0) / dt : 0, yt = spd < 2 ? this.yaw : clamp(Math.atan(lv / Math.max(spd, 110)), -YAW_MAX, YAW_MAX) * Math.sign(this.v || 1);
      this.yaw += (yt - this.yaw) * Math.min(1, dt * 7);
    }
    // buntut angkot mengayun waktu selip (hanya tampilan), dihaluskan supaya tidak tersentak
    this.slip += ((this.skid ? Math.sign(this.skid) * 0.12 : 0) - this.slip) * Math.min(1, dt * 5);
    const prev = this.d, aPrev = bebas ? this.world.at(this.d).a : 0; this.d = Math.max(-200, this.d + this.v * this.fwd * sf * dt);
    // arah hadap di dunia = arah jalan + psi. Jalan yang membelok memutar psi sebanyak perubahan arah jalan yang
    // benar-benar dilewati, jadi arah di dunia hanya berubah lewat laju belok (tidak berkedut di mulut dan ujung simpang)
    if (bebas) { this.psi -= this.world.at(this.d).a - aPrev; this.yaw = this.psi; }
    // lampu merah dan palang kereta
    for (const L of this.lights) {
      const sl = L.d - 70;
      if (prev + PL / 2 < sl && this.d + PL / 2 >= sl && this.lightState(L) === 'merah') {
        this.tilang++; this.merah++; this.say(L.rail ? 'Menerobos palang kereta! Ditilang.' : 'Menerobos lampu merah! Ditilang.', 'bad'); this.fx('tilang');
      }
    }
    this.stepTraffic(dt);
    this.stepCrossers();
    this.collide();
    this.passengers(dt);
    for (const p of this.police) if (!p.done && this.d >= p.d) { p.done = true; if (this.v > 0.82 * this.vMax) { this.tilang++; this.say('Ditilang polisi! Kebut-kebutan.', 'bad'); this.fx('tilang'); } else this.say('Polisi mengangguk. Aman.'); }
    if (this.t >= S.dur || (this.mogok && this.v <= 0 && (this.deadT += dt) > 1.2)) this.finish();
  }
  stopFor(o) {
    // kendaraan lain ikut berhenti di lampu merah dan di belakang kendaraan yang berhenti
    const L = this.nextLight(o.d + o.l / 2 - 2);
    if (L) { const gap = L.d - 70 - (o.d + o.l / 2), st = this.lightState(L); if (gap < 130 && gap > -4 && (st === 'merah' || (st === 'kuning' && gap > 30))) return L.d - 70 - o.l / 2; }
    return null;
  }
  stepTraffic(dt) {
    const r = this.r, all = this.cars.concat(this.biru);
    for (const m of all) {
      if (m.kind === 'biru') continue;
      m.next -= dt;
      if (m.next <= 0) { m.tx = m.kind === 'motor' ? LANES[Math.floor(r() * 3)] : m.kind === 'truk' ? LANES[2] : LANES[1 + Math.floor(r() * 2)]; m.next = (m.kind === 'motor' ? 3 : 8) + r() * 6; }
      let v = m.v0;
      const behind = m.d < this.d && this.d - m.d < (PL + m.l) / 2 + 40 && Math.abs(m.x - this.x) < (PW + m.w) / 2 + 4;
      if (behind) { v = Math.min(v, Math.max(0, this.v)); if (m.kind === 'motor') m.tx = this.x < 180 ? LANES[2] : LANES[0]; }
      for (const o of all) { if (o === m || o.d <= m.d || Math.abs(o.x - m.x) > (o.w + m.w) / 2 + 2) continue; const gap = o.d - o.l / 2 - (m.d + m.l / 2); if (gap < 26 + m.v * 0.25) { v = Math.min(v, o.state === 'ngetem' ? 0 : o.v); if (gap < 3) m.d = o.d - o.l / 2 - m.l / 2 - 3; } }
      const stop = this.stopFor(m); if (stop != null) { v = 0; m.d = Math.min(m.d, stop); }
      m.v = v; m.x += clamp(m.tx - m.x, -(m.kind === 'motor' ? 90 : 50) * dt, (m.kind === 'motor' ? 90 : 50) * dt); m.d += m.v * dt * this.world.sf(m.d, m.x);
    }
    for (const b of this.biru) {
      if (b.state === 'jalan') {
        const behind = b.d < this.d && this.d - b.d < 150 && Math.abs(b.x - this.x) < 46;
        b.v = behind ? Math.min(b.v0, Math.max(0, this.v)) : b.v0;
        if (behind) b.tx = this.x < 180 ? LANES[2] : LANES[1];
        else if (!b.g) b.tx = LANES[1];
        if (!b.g && b.left > 0) { const g = this.groups.find(g => g.lure && !g.taken && g.d > b.d + 40 && g.d - b.d < 500 && !this.biru.some(o => o.g === g)); if (g) b.g = g; }
        if (b.g) {
          b.tx = LANES[0];
          if (b.g.taken) b.g = null;
          else if (b.d >= b.g.d - 8 && Math.abs(b.x - LANES[0]) < 6) { b.state = 'ngetem'; b.timer = 0; b.v = 0; }
          else if (b.g.d - b.d < 120) b.v = Math.max(40, b.v0 * (b.g.d - b.d) / 120);
        }
        for (const o of this.cars) { if (o.d <= b.d || Math.abs(o.x - b.x) > (o.w + b.w) / 2 + 2) continue; const gap = o.d - o.l / 2 - (b.d + b.l / 2); if (gap < 30) { b.v = Math.min(b.v, o.v); if (gap < 3) b.d = o.d - o.l / 2 - b.l / 2 - 3; } }
        const stop = this.stopFor(b); if (stop != null) { b.v = 0; b.d = Math.min(b.d, stop); }
        b.x += clamp(b.tx - b.x, -70 * dt, 70 * dt); b.d += b.v * dt * this.world.sf(b.d, b.x);
      } else if (b.state === 'ngetem') {
        b.timer += dt;
        const g = b.g;
        if (g && !g.taken && g.prog <= 0 && b.timer > 2.4) { g.taken = 'biru'; this.stolen += g.n; g.n = 0; b.left--; if (Math.abs(g.d - this.d) < 700) this.say('Penumpang diserobot angkot biru!', 'bad'); }
        if (b.timer > 3.2 || (g && g.taken === 'me')) { b.state = 'jalan'; b.g = null; b.tx = LANES[1]; }
      }
    }
  }
  stepCrossers() {
    // mobil di jalan melintang lewat saat lampu kita merah; kereta lewat saat palang tertutup
    const out = [];
    for (const L of this.lights) {
      if (Math.abs(L.d - this.d) > 1400) continue;
      const p = this.phase(L);
      if (L.rail) { if (p >= 16.3 && p < 21.8) out.push({ kind: 'kereta', x: -1700 + 780 * (p - 16.3), d: L.d, w: 1150, l: 40, v: 0 }); continue; }
      if (p < 12.5) continue;
      for (let k = 0; k < 2; k++) {
        const e = p - (12.6 + k * 1.1); if (e < 0) continue;
        const left = (k + Math.floor(L.d)) % 2 === 0, x = left ? -650 + 460 * e : 1010 - 460 * e;
        if (x < -700 || x > 1060) continue;
        out.push({ kind: 'lintas', x, d: L.d + (left ? 28 : -28), w: 66, l: 34, v: 0, dir: left ? 1 : -1, hue: hash(k * 7 + Math.floor(L.d)) % 8 });
      }
    }
    this.crossers = out;
  }
  collide() {
    if (this.cool > 0) return;
    for (const c of this.crossers) {
      if (!overlap(this.x, this.d, PW, PL, c.x, c.d, c.w, c.l)) continue;
      this.hits++; this.severe += c.kind === 'kereta' ? 2 : 1; this.v = 0; this.d = c.d - c.l / 2 - PL / 2 - 2; this.cool = 1.5; this.shake = 0.5;
      this.say(c.kind === 'kereta' ? 'Disambar kereta! Untung masih hidup.' : 'Brak! Ditabrak dari samping.', 'bad'); this.fx('tabrak'); return;
    }
    const hit = o => {
      if (!overlap(this.x, this.d, PW, PL, o.x, o.d, o.w, o.l)) return false;
      if (o.d < this.d) {
        // mundur menabrak kendaraan di belakang = salah kita; kalau tidak, dia yang menyeruduk dan ikut berhenti
        if (this.v < -15) { this.hits++; this.say('Nyerempet waktu mundur!', 'bad'); this.fx('serempet'); this.v = 0; this.d = o.d + (PL + o.l) / 2 + 2; this.cool = 1; this.shake = 0.3; return true; }
        o.d = this.d - (PL + o.l) / 2 - 2; o.v = Math.min(o.v, Math.max(0, this.v)); return false;
      }
      const ov = o.state === 'ngetem' ? 0 : o.v, rel = this.v - ov;
      if (this.v < 0) { this.v = 0; return false; }
      this.hits++; if (rel > 150) { this.severe++; this.say('Brak! Nabrak, harus ganti rugi.', 'bad'); this.fx('tabrak'); } else { this.say('Nyerempet!', 'bad'); this.fx('serempet'); }
      this.v = Math.min(this.v, ov * 0.5); o.d = this.d + (PL + o.l) / 2 + 6; this.cool = 1; this.shake = 0.35;
      return true;
    };
    for (const m of this.cars) if (hit(m)) return;
    for (const b of this.biru) if (hit(b)) return;
    for (const p of this.pots) if (!p.used && this.v > 100 && overlap(this.x, this.d, PW, PL, p.x, p.d, 26, 16)) {
      p.used = true; this.potholes++; this.v *= 0.75; this.shake = 0.25; this.say('Gluduk! Lubang.', 'bad'); this.fx('lubang');
    }
  }
  passengers(dt) {
    const curb = this.atCurb(), seats = this.spec.seats;
    for (const g of this.groups) {
      if (g.taken || g.n <= 0) continue;
      if (curb && Math.abs(g.d - this.d) < 50) {
        g.prog += dt;
        if (g.prog >= 0.45) {
          const k = Math.min(g.n, seats - this.riders.length);
          if (k <= 0) { this.say('Penuh!'); g.prog = 0.46; continue; }
          for (let i = 0; i < k; i++) this.riders.push({ drop: this.d + 900 + this.r() * 2200, st: 'ride' });
          g.n -= k; this.boarded += k; if (g.n <= 0) g.taken = 'me'; g.prog = 0;
          this.say(k === 1 ? 'Satu naik.' : `${k} orang naik.`, 'good'); this.fx('naik');
        }
      } else g.prog = Math.max(0, g.prog - dt * 2);
    }
    for (const p of this.riders) {
      if (p.st === 'ride' && this.d >= p.drop) { p.st = 'kiri'; p.dead = p.drop + 500; this.say('“Kiri, Bang!”', 'kiri'); this.fx('kiri'); }
      else if (p.st === 'kiri' && this.d > p.dead) { p.st = 'marah'; this.say('“Kelewatan! Nggak mau bayar!”', 'bad'); this.fx('marah'); }
    }
    this.stopT = curb ? this.stopT + dt : 0;
    if (this.stopT >= 0.35) {
      const out = this.riders.filter(p => p.st === 'kiri' || p.st === 'marah');
      if (out.length) {
        let pay = 0; for (const p of out) { if (p.st === 'marah') this.missed++; else pay += this.spec.fare; }
        this.fares += pay; this.riders = this.riders.filter(p => !out.includes(p));
        this.pop(pay ? '+' + Math.round(pay) + ' rb' : 'Ogah bayar!', pay > 0); this.fx(pay ? 'bayar' : 'marah');
      }
    }
  }
  finish() {
    if (this.over) return; this.over = true;
    let pay = 0; for (const p of this.riders) { if (p.st === 'marah') this.missed++; else pay += this.spec.fare * (this.mogok ? 0.5 : 1); }
    this.fares += pay; this.endPay = pay; this.riders = [];
  }
  result() {
    return { fares: Math.round(this.fares), riders: this.boarded, t: Math.min(this.t, this.spec.dur), avgV: this.t ? clamp(this.d / (this.t * this.vMax), 0, 1) : 0,
      hits: this.hits, skids: this.skids, severe: this.severe, potholes: this.potholes, tilang: this.tilang, merah: this.merah, missed: this.missed, stolen: this.stolen, mogok: this.mogok,
      sampai: this.d >= this.world.dest.d };
  }
  kiriCount() { return this.riders.filter(p => p.st !== 'ride').length; }
}

/* ---------- gambar ---------- */
const SHOPS = ['WARUNG', 'APOTEK', 'FOTOKOPI', 'BAKSO', 'KONTER HP', 'BENGKEL', 'TOKO EMAS', 'MIE AYAM', 'LAUNDRY', 'MATERIAL', 'SEMBAKO', 'PANGKAS', 'SATE', 'BATAGOR', 'ATK', 'PULSA'];
const ROOF = ['#b5523b', '#c4683f', '#8e3f32', '#a85a46', '#6f7d86', '#8a9296', '#3f6f8f', '#5f7f4f'];
const WALLC = ['#e4a33a', '#3f8f6b', '#c0573e', '#4f77b8', '#8c5aa8', '#d0b03a', '#5d6f7a', '#c46a8c', '#e07b39', '#2f8f9d'];
const CARC = ['#c9ccd1', '#2b2f36', '#f2f2f2', '#a3312a', '#2f5d9e', '#6b7b3a', '#8f8f8f', '#d9b23d'];
const SHIRT = ['#d9534f', '#3e7cb1', '#e6b33a', '#5aa469', '#8e6bbf', '#e07b39', '#f0f0f0', '#2f3d4a'];
const SKIN = ['#8d5a3b', '#a8714a', '#c68b5b', '#6f4630'];
const FONT = '"Plus Jakarta Sans", sans-serif';

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function txt(c, t, x, y, size, col, rot) { c.save(); c.translate(x, y); if (rot) c.rotate(rot); c.fillStyle = col; c.font = `800 ${size}px ${FONT}`; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, 0, 0); c.restore(); }
function shadow(c, w, l) { c.fillStyle = 'rgba(0,0,0,.25)'; rr(c, -w / 2 + 3, -l / 2 + 4, w, l, Math.min(8, w / 3)); c.fill(); }
function angkot(c, col, o) {
  o = o || {};
  shadow(c, PW, PL);
  c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 2; rr(c, -PW / 2, -PL / 2, PW, PL, 8); c.fill(); c.stroke();
  c.fillStyle = '#1d2a33'; rr(c, -PW / 2 + 5, -PL / 2 + 8, PW - 10, 14, 4); c.fill();
  c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(-PW / 2 + 3, -PL / 2 + 30, 3, PL - 44); c.fillRect(PW / 2 - 6, -PL / 2 + 30, 3, PL - 44);
  c.fillStyle = 'rgba(0,0,0,.18)'; rr(c, -PW / 2 + 8, -PL / 2 + 27, PW - 16, PL - 40, 3); c.fill();
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-PW / 2 + 10, -PL / 2 + 34 + i * 10); c.lineTo(PW / 2 - 10, -PL / 2 + 34 + i * 10); c.stroke(); }
  c.fillStyle = '#1d2a33'; rr(c, -PW / 2 + 7, PL / 2 - 12, PW - 14, 7, 2); c.fill();
  txt(c, o.no || '', 0, 2, 11, '#fff');
  c.fillStyle = '#111'; c.fillRect(-PW / 2 - 4, -PL / 2 + 22, 4, 5); c.fillRect(PW / 2, -PL / 2 + 22, 4, 5);
  c.fillStyle = o.brake ? '#ff3b2f' : '#7a1d16'; c.fillRect(-PW / 2 + 3, PL / 2 - 4, 8, 3); c.fillRect(PW / 2 - 11, PL / 2 - 4, 8, 3);
  if (o.rev) { c.fillStyle = '#fffbe6'; c.fillRect(-PW / 2 + 12, PL / 2 - 4, 4, 3); c.fillRect(PW / 2 - 16, PL / 2 - 4, 4, 3); }
  if (o.sein && Math.floor((o.t || 0) * 3) % 2 === 0) { c.fillStyle = '#ffb000'; c.fillRect(-PW / 2 - 1, PL / 2 - 10, 4, 6); c.fillRect(-PW / 2 - 1, -PL / 2 + 2, 4, 6); }
}
function motor(c, hue) {
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(2, 3, 8, 17, 0, 0, 7); c.fill();
  c.fillStyle = '#222'; c.beginPath(); c.ellipse(0, 0, 6, 17, 0, 0, 7); c.fill();
  c.fillStyle = SHIRT[hue % 8]; c.beginPath(); c.ellipse(0, 3, 8, 7, 0, 0, 7); c.fill();
  c.fillStyle = ['#e33', '#fc0', '#fff', '#39f', '#111', '#3c6', '#f80', '#c3c'][hue % 8]; c.beginPath(); c.arc(0, -3, 5.5, 0, 7); c.fill();
}
function mobil(c, w, l, col, brake) {
  shadow(c, w, l);
  c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 1.5; rr(c, -w / 2, -l / 2, w, l, 9); c.fill(); c.stroke();
  c.fillStyle = '#22303a'; rr(c, -w / 2 + 4, -l / 2 + 12, w - 8, 12, 4); c.fill(); rr(c, -w / 2 + 5, l / 2 - 16, w - 10, 9, 3); c.fill();
  c.fillStyle = 'rgba(255,255,255,.18)'; rr(c, -w / 2 + 5, -l / 2 + 26, w - 10, l - 44, 4); c.fill();
  c.fillStyle = '#fff6c8'; c.fillRect(-w / 2 + 3, -l / 2 + 1, 6, 3); c.fillRect(w / 2 - 9, -l / 2 + 1, 6, 3);
  c.fillStyle = brake ? '#ff3b2f' : '#7a1d16'; c.fillRect(-w / 2 + 3, l / 2 - 4, 6, 3); c.fillRect(w / 2 - 9, l / 2 - 4, 6, 3);
}
function pikap(c, w, l, col, brake) {
  shadow(c, w, l);
  c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 1.5; rr(c, -w / 2, -l / 2, w, l * 0.42, 7); c.fill(); c.stroke();
  c.fillStyle = '#22303a'; rr(c, -w / 2 + 4, -l / 2 + 8, w - 8, 10, 3); c.fill();
  c.fillStyle = '#5b4632'; c.strokeStyle = '#111'; rr(c, -w / 2, -l / 2 + l * 0.44, w, l * 0.56, 3); c.fill(); c.stroke();
  c.fillStyle = '#c8b07a'; for (let i = 0; i < 4; i++) { c.beginPath(); c.ellipse(-8 + (i % 2) * 16, -l / 2 + l * 0.55 + Math.floor(i / 2) * 16, 7, 6, 0, 0, 7); c.fill(); }
  c.fillStyle = brake ? '#ff3b2f' : '#7a1d16'; c.fillRect(-w / 2 + 2, l / 2 - 3, 6, 3); c.fillRect(w / 2 - 8, l / 2 - 3, 6, 3);
}
function truk(c, w, l, col, brake) {
  shadow(c, w, l);
  c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 1.5; rr(c, -w / 2, -l / 2, w, 30, 6); c.fill(); c.stroke();
  c.fillStyle = '#22303a'; c.fillRect(-w / 2 + 4, -l / 2 + 6, w - 8, 9);
  c.fillStyle = '#e8e2d0'; rr(c, -w / 2, -l / 2 + 33, w, l - 33, 3); c.fill(); c.stroke();
  txt(c, 'EKSPEDISI', 0, 14, 8, '#a3312a', -Math.PI / 2);
  c.fillStyle = brake ? '#ff3b2f' : '#7a1d16'; c.fillRect(-w / 2 + 2, l / 2 - 3, 7, 3); c.fillRect(w / 2 - 9, l / 2 - 3, 7, 3);
}
function orang(c, x, y, seed, t, wave) {
  const h = hash(seed);
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(x + 1, y + 7, 7, 4, 0, 0, 7); c.fill();
  c.fillStyle = SHIRT[h % 8]; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill();
  if (wave) { c.strokeStyle = SKIN[(h >>> 3) % 4]; c.lineWidth = 3; c.lineCap = 'round'; const a = Math.sin(t * 9 + seed) * 0.5; c.beginPath(); c.moveTo(x + 5, y - 2); c.lineTo(x + 13 + Math.cos(a) * 2, y - 10 + Math.sin(a) * 4); c.stroke(); c.lineCap = 'butt'; }
  c.fillStyle = (h >>> 5) % 3 === 0 ? '#2b2b2b' : (h >>> 5) % 3 === 1 ? '#e8e2d0' : SKIN[(h >>> 3) % 4]; c.beginPath(); c.arc(x, y - 1, 4.5, 0, 7); c.fill();
}
function pohon(c, x, y, r, h) { c.fillStyle = 'rgba(0,0,0,.18)'; c.beginPath(); c.arc(x + 4, y + 5, r, 0, 7); c.fill(); c.fillStyle = ['#4f8a3c', '#3f7a35', '#5e9a46'][h % 3]; c.beginPath(); c.arc(x, y, r, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.45, 0, 7); c.fill(); }
function atap(c, x, y, w, h, col, ridge) {
  // atap pelana tampak atas: dua sisi beda terang, bubungan di tengah
  c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x + 4, y + 4, w, h);
  c.fillStyle = col; c.fillRect(x, y, w, h);
  c.fillStyle = 'rgba(0,0,0,.16)';
  if (ridge === 'v') c.fillRect(x + w / 2, y, w / 2, h); else c.fillRect(x, y + h / 2, w, h / 2);
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; c.beginPath();
  if (ridge === 'v') { c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); } else { c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2); } c.stroke();
}

/* isi pinggir jalan, dibuat sekali per trayek */
function buildScenery(Wd) {
  if (Wd.scen) return Wd.scen;
  const r = mulberry(hash(Wd.route.charCodeAt(1) * 977 + 5)), items = [], props = [];
  const nearGap = (d, m) => Wd.cross.some(c => Math.abs(c.d - d) < m) || Math.abs(Wd.river.d - d) < m + 40 || Math.abs(Wd.rail.d - d) < m || Wd.inJ(d, m);
  const lmAt = (d, side, m) => Wd.landmarks.find(l => l.side === side && Math.abs(l.d - d) < l.len / 2 + m);
  const fits = (d, u0, u1, len) => {
    for (const [dd, uu] of [[d - len / 2, u0], [d + len / 2, u0], [d - len / 2, u1], [d + len / 2, u1], [d, (u0 + u1) / 2]]) {
      const [x, y] = Wd.pt(dd, uu); if (Wd.blocked(x, y, 4, null)) return false;
    }
    return true;
  };
  for (const side of [-1, 1]) {
    const base = side < 0 ? -150 : 310;
    for (let d = DMIN + 60; d < 13500;) {
      const len = 70 + Math.floor(r() * 110), dc = d + len / 2;
      const lm = lmAt(dc, side, 10); if (lm) { d = lm.d + lm.len / 2 + 10; continue; }
      if (nearGap(dc, len / 2 + 70)) { d += 40; continue; }
      const depth = 70 + Math.floor(r() * 60), u0 = base, u1 = base + side * depth;
      const kind = r() < 0.5 ? 'ruko' : r() < 0.6 ? 'rumah' : r() < 0.7 ? 'warung' : 'kebun';
      if (fits(dc, Math.min(u0, u1), Math.max(u0, u1), len)) items.push({ kind, d: dc, u0, u1, len, h: hash(Math.floor(d) * 3 + side) });
      d += len + 4 + Math.floor(r() * 14);
    }
    // tiang listrik, lampu jalan, pohon peneduh, motor parkir, pejalan
    const su = side < 0 ? -128 : 288;
    let lastPole = null;
    for (let d = DMIN + 80; d < 13500; d += 70 + r() * 60) {
      if (nearGap(d, 90) || lmAt(d, side, -40)) { lastPole = null; continue; }
      const roll = r(), kind = roll < 0.28 ? 'tiang' : roll < 0.42 ? 'lampu' : roll < 0.62 ? 'pohon' : roll < 0.72 ? 'parkir' : roll < 0.78 ? 'gerobak' : roll < 0.92 ? 'pejalan' : null;
      if (!kind) continue;
      const p = { kind, d, u: su + side * (kind === 'pohon' ? 6 : 0), side, h: hash(Math.floor(d) + side * 17), v: (r() < 0.5 ? -1 : 1) * (18 + r() * 22) };
      if (kind === 'tiang') { p.prev = lastPole; lastPole = p; }
      props.push(p);
    }
  }
  // lalu lintas arah berlawanan (hiasan, tidak bisa ditabrak)
  const oncoming = [];
  for (let i = 0; i < 26; i++) { const roll = r(); oncoming.push({ d0: r() * 2600, v: 170 + r() * 140, u: r() < 0.5 ? 160 : 234, kind: roll < 0.45 ? 'motor' : roll < 0.8 ? 'mobil' : roll < 0.92 ? 'angkot' : 'truk', hue: Math.floor(r() * 8) }); }
  // minimap
  const mm = []; let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let d = DMIN; d < Wd.dest.d + 600; d += 80) { const p = Wd.at(d); mm.push([p.x, p.y]); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }
  Wd.scen = { items, props, oncoming, mm, box: [x0, y0, x1, y1], cells: new Map() };
  return Wd.scen;
}
function cellAt(Wd, sc, i, j) {
  const key = i + ',' + j; let c = sc.cells.get(key); if (c) return c;
  const h = hash(i * 73856093 ^ j * 19349663), cx = i * 150 + 75 + (h % 30) - 15, cy = j * 150 + 75 + ((h >>> 5) % 30) - 15;
  const roll = (h >>> 10) % 100;
  const kind = Wd.blocked(cx, cy, 170, null) ? null : roll < 52 ? 'rumah' : roll < 70 ? 'pohon' : roll < 86 ? 'sawah' : roll < 93 ? 'lapangan' : 'kolam';
  c = { kind, cx, cy, h }; sc.cells.set(key, c); return c;
}
function drawCell(c, cell) {
  const { cx, cy, h } = cell;
  if (cell.kind === 'rumah') {
    for (let k = 0; k < 4; k++) { const hh = hash(h + k); if (hh % 5 === 0) continue; const w = 44 + hh % 22, l = 40 + (hh >>> 4) % 26, x = cx - 70 + (k % 2) * 72 + (hh >>> 8) % 8, y = cy - 70 + Math.floor(k / 2) * 72 + (hh >>> 11) % 8; atap(c, x, y, w, l, ROOF[(hh >>> 14) % ROOF.length], hh % 2 ? 'v' : 'h'); }
    c.fillStyle = 'rgba(120,100,70,.35)'; c.fillRect(cx - 72, cy - 3, 144, 6);
  } else if (cell.kind === 'pohon') { for (let k = 0; k < 6; k++) { const hh = hash(h + k * 11); pohon(c, cx - 60 + hh % 120, cy - 60 + (hh >>> 7) % 120, 14 + hh % 10, hh); } }
  else if (cell.kind === 'sawah') {
    c.fillStyle = (h % 2) ? '#8fbf5a' : '#a7c96a'; c.fillRect(cx - 72, cy - 72, 144, 144);
    c.strokeStyle = 'rgba(60,90,30,.35)'; c.lineWidth = 1; c.beginPath(); for (let k = -66; k < 72; k += 9) { c.moveTo(cx - 72, cy + k); c.lineTo(cx + 72, cy + k); } c.stroke();
    c.strokeStyle = '#7d6a45'; c.lineWidth = 3; c.strokeRect(cx - 72, cy - 72, 144, 144);
  } else if (cell.kind === 'lapangan') {
    c.fillStyle = '#7fb04f'; c.fillRect(cx - 70, cy - 50, 140, 100); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2; c.strokeRect(cx - 62, cy - 42, 124, 84); c.beginPath(); c.moveTo(cx, cy - 42); c.lineTo(cx, cy + 42); c.stroke(); c.beginPath(); c.arc(cx, cy, 14, 0, 7); c.stroke();
  } else if (cell.kind === 'kolam') {
    c.fillStyle = '#5aa6c8'; c.beginPath(); c.ellipse(cx, cy, 58, 38, (h % 10) / 10, 0, 7); c.fill(); c.strokeStyle = '#7d6a45'; c.lineWidth = 3; c.stroke(); pohon(c, cx + 60, cy - 40, 16, h);
  }
}
function drawItem(c, it, sideSign) {
  const x0 = Math.min(it.u0, it.u1), w = Math.abs(it.u1 - it.u0), y0 = -it.len / 2, h = it.h, front = sideSign < 0 ? x0 + w : x0;
  if (it.kind === 'ruko') {
    c.fillStyle = 'rgba(0,0,0,.22)'; c.fillRect(x0 + 4, y0 + 4, w, it.len);
    c.fillStyle = WALLC[h % WALLC.length]; c.fillRect(x0, y0, w, it.len);
    c.fillStyle = 'rgba(255,255,255,.12)'; c.fillRect(x0 + 6, y0 + 6, w - 12, it.len - 12);
    c.fillStyle = 'rgba(0,0,0,.2)'; c.fillRect(sideSign < 0 ? front - 8 : front, y0, 8, it.len);
    txt(c, SHOPS[(h >>> 4) % SHOPS.length], front - sideSign * 22, 0, 12, '#fff', sideSign < 0 ? -Math.PI / 2 : Math.PI / 2);
  } else if (it.kind === 'rumah') {
    c.fillStyle = '#c9c1a6'; c.fillRect(x0, y0, w, it.len);
    atap(c, x0 + 8, y0 + 8, w - 16, it.len - 16, ROOF[h % ROOF.length], it.len > w ? 'v' : 'h');
    pohon(c, front - sideSign * 6, y0 + 10, 9, h);
  } else if (it.kind === 'warung') {
    c.fillStyle = '#c9c1a6'; c.fillRect(x0, y0, w, it.len);
    atap(c, x0 + 6, y0 + 6, w - 12, it.len - 12, ROOF[(h >>> 3) % ROOF.length], 'h');
    const tw = 26; c.fillStyle = ['#d9534f', '#3e7cb1', '#2f8f4f', '#e6b33a'][h % 4];
    const tx = sideSign < 0 ? front - tw : front; c.fillRect(tx, y0 + 6, tw, it.len - 12);
    c.fillStyle = 'rgba(255,255,255,.55)'; for (let k = y0 + 10; k < -y0 - 6; k += 12) c.fillRect(tx, k, tw, 5);
    c.fillStyle = '#7a5a2e'; for (let k = 0; k < 2; k++) c.fillRect(sideSign < 0 ? front + 4 : front - 10, -10 + k * 14, 6, 8);
  } else {
    c.fillStyle = '#93b06a'; c.fillRect(x0, y0, w, it.len); c.strokeStyle = '#7d6a45'; c.lineWidth = 2; c.strokeRect(x0 + 2, y0 + 2, w - 4, it.len - 4);
    for (let k = 0; k < 3; k++) { const hh = hash(h + k); pohon(c, x0 + 14 + hh % Math.max(1, w - 28), y0 + 14 + (hh >>> 6) % Math.max(1, it.len - 28), 10 + hh % 6, hh); }
  }
}
function drawLandmark(c, L, t) {
  const s = L.side, half = L.len / 2;
  const X = (a, b) => s < 0 ? [-a, -b] : [a, b];        // jarak dari tepi jalan → koordinat u
  const box = (a, b, y0, y1, col) => { const [u0, u1] = X(a, b); c.fillStyle = col; c.fillRect(Math.min(u0, u1), y0, Math.abs(u1 - u0), y1 - y0); };
  const edge = s < 0 ? -150 : 310;
  const U0 = s < 0 ? 150 : 310;                          // tepi bangunan sisi jalan, dalam jarak
  const lab = (a, y, size, col) => { const [u] = X(a, a); txt(c, L.label, u, y, size, col, s < 0 ? -Math.PI / 2 : Math.PI / 2); };
  box(U0, U0 + 340, -half, half, '#cfc7b0');
  if (L.kind === 'terminal' || L.kind === 'pasar') {
    box(U0, U0 + 330, -half + 10, half - 10, '#9aa0a3');
    if (L.kind === 'terminal') {
      for (let k = 0; k < 4; k++) { const y = -half + 60 + k * 120; box(U0 + 60, U0 + 280, y, y + 22, '#d8d2c0'); for (let j = 0; j < 4; j++) { const [u] = X(U0 + 85 + j * 50, 0); c.save(); c.translate(u, y + 70); c.rotate(Math.PI / 2 * (s < 0 ? 1 : -1)); c.scale(0.8, 0.8); angkot(c, ['#1a8f4c', '#35b3c9', '#f2b90f', '#1a8f4c'][(j + k) % 4], { no: ['05', '09', '12'][(j + k) % 3] }); c.restore(); } }
      lab(U0 + 30, 0, 18, '#1b2630');
    } else {
      box(U0 + 40, U0 + 320, -half + 40, half - 40, '#7d8a90');
      c.strokeStyle = 'rgba(0,0,0,.25)'; c.lineWidth = 2; for (let y = -half + 50; y < half - 40; y += 16) { const [u0, u1] = X(U0 + 40, U0 + 320); c.beginPath(); c.moveTo(u0, y); c.lineTo(u1, y); c.stroke(); }
      for (let k = 0; k < 9; k++) { const y = -half + 30 + k * 56; box(U0 + 8, U0 + 36, y, y + 40, ['#d9534f', '#3e7cb1', '#e6b33a', '#2f8f4f', '#e07b39'][k % 5]); }
      lab(U0 + 180, 0, 26, '#fff');
    }
  } else if (L.kind === 'masjid') {
    box(U0 + 20, U0 + 260, -170, 170, '#e9e4d6'); box(U0 + 60, U0 + 230, -110, 110, '#f4efe2');
    const [u] = X(U0 + 145, 0); c.fillStyle = '#2f8f5b'; c.beginPath(); c.arc(u, 0, 70, 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.2)'; c.beginPath(); c.arc(u - 18, -18, 28, 0, 7); c.fill();
    c.fillStyle = '#e6c84a'; c.beginPath(); c.arc(u, 0, 8, 0, 7); c.fill();
    const [m] = X(U0 + 40, 0); c.fillStyle = '#f4efe2'; c.beginPath(); c.arc(m, -150, 16, 0, 7); c.fill(); c.fillStyle = '#2f8f5b'; c.beginPath(); c.arc(m, -150, 10, 0, 7); c.fill();
    lab(U0 + 8, 110, 11, '#2f6b4b');
  } else if (L.kind === 'sekolah') {
    box(U0 + 30, U0 + 300, -220, -140, '#b5523b'); box(U0 + 230, U0 + 300, -140, 140, '#b5523b'); box(U0 + 30, U0 + 300, 140, 220, '#b5523b');
    box(U0 + 40, U0 + 220, -130, 130, '#c9b98a');
    const [f] = X(U0 + 120, 0); c.fillStyle = '#666'; c.fillRect(f - 2, -6, 4, 12); c.fillStyle = '#d33'; c.fillRect(f + 2, -6, 14, 5); c.fillStyle = '#fff'; c.fillRect(f + 2, -1, 14, 5);
    lab(U0 + 14, 0, 11, '#8e3f32');
  } else if (L.kind === 'spbu') {
    box(U0, U0 + 300, -half + 20, half - 20, '#a7abad');
    box(U0 + 60, U0 + 230, -140, 140, '#f2f2f2'); box(U0 + 60, U0 + 230, -140, -120, '#d33');
    for (let k = 0; k < 3; k++) { const [u] = X(U0 + 100 + k * 50, 0); c.fillStyle = '#d33'; c.fillRect(u - 8, -20, 16, 40); }
    lab(U0 + 260, 0, 14, '#d33');
  } else if (L.kind === 'alun') {
    box(U0 + 10, U0 + 330, -half + 10, half - 10, '#7fb04f');
    const [u] = X(U0 + 170, 0); c.strokeStyle = '#e6dcc0'; c.lineWidth = 10; c.beginPath(); c.arc(u, 0, 120, 0, 7); c.stroke();
    for (let k = 0; k < 14; k++) { const a = k / 14 * Math.PI * 2; pohon(c, u + Math.cos(a) * 150, Math.sin(a) * 200, 14, k); }
    pohon(c, u, 0, 46, 1); lab(U0 + 8, 160, 12, '#2f5d2a');
  } else if (L.kind === 'kampus') {
    box(U0 + 20, U0 + 320, -half + 20, half - 20, '#d8d2c0');
    box(U0 + 80, U0 + 300, -220, -60, '#6f7d86'); box(U0 + 80, U0 + 300, 40, 220, '#6f7d86'); box(U0 + 140, U0 + 240, -40, 20, '#3f6f8f');
    const [g] = X(U0 + 4, 0); c.fillStyle = '#1b2630'; c.fillRect(g - 6, -70, 12, 140);
    lab(U0 + 40, 0, 15, '#1b2630');
  } else if (L.kind === 'stasiun') {
    box(U0 + 30, U0 + 160, -half + 30, half - 30, '#c4683f'); box(U0 + 170, U0 + 200, -half, half, '#bdb7a4');
    c.strokeStyle = '#555'; c.lineWidth = 3; for (const a of [U0 + 220, U0 + 250]) { const [u] = X(a, a); c.beginPath(); c.moveTo(u, -half); c.lineTo(u, half); c.stroke(); }
    lab(U0 + 95, 0, 14, '#fff');
  } else if (L.kind === 'griya') {
    for (let k = 0; k < 8; k++) { const y = -half + 30 + k * 66; box(U0 + 60, U0 + 130, y, y + 50, '#c9c1a6'); box(U0 + 180, U0 + 250, y, y + 50, '#c9c1a6'); const [a1] = X(U0 + 66, 0), [b1] = X(U0 + 186, 0); atap(c, Math.min(a1, a1 - s * 58), y + 4, 58, 42, '#8e3f32', 'h'); atap(c, Math.min(b1, b1 - s * 58), y + 4, 58, 42, '#8e3f32', 'h'); }
    const [g] = X(U0 + 20, 0); c.fillStyle = '#e8e2d0'; c.strokeStyle = '#1b2630'; c.lineWidth = 2; c.fillRect(g - 14, -60, 28, 120); c.strokeRect(g - 14, -60, 28, 120);
    lab(U0 + 20, 0, 12, '#1b2630');
  }
  void edge; void t;
}

function draw(c, S, H, o) {
  const Wd = S.world, sc = buildScenery(Wd), d = S.d, PY = H * 0.72, t = S.t, Z = o.zoom || Z_STOP;
  // kamera ikut angkot: berpusat di angkot dan berputar mengikuti arah hadap angkot (o.camH), bukan arah jalan
  const cam = Wd.at(d), u0 = S.x - 180, h = o.camH != null ? o.camH : cam.a, hx = Math.cos(h), hy = Math.sin(h);
  const cx = cam.x + cam.nx * u0 - hy * CAM_U, cy = cam.y + cam.ny * u0 + hx * CAM_U, rot = -Math.PI / 2 - h;
  const cr = Math.cos(rot), sr = Math.sin(rot);
  const toScreen = (wx, wy) => [W / 2 + Z * (cr * (wx - cx) - sr * (wy - cy)), PY + Z * (sr * (wx - cx) + cr * (wy - cy))];
  const dA = d - (H - PY) / Z - 350, dB = d + PY / Z + 450;
  c.fillStyle = '#a9b98a'; c.fillRect(0, 0, W, H);
  c.save();
  if (S.shake && !o.reduce) c.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  c.translate(W / 2, PY); c.scale(Z, Z); c.rotate(rot); c.translate(-cx, -cy);
  const place = (dd, u, fn) => { const p = Wd.at(dd); c.save(); c.translate(p.x + p.nx * u, p.y + p.ny * u); c.rotate(p.a + Math.PI / 2); fn(p); c.restore(); };
  // kampung di belakang
  const RAD = Math.hypot(W / 2, PY) / Z + 160, i0 = Math.floor((cx - RAD) / 150), i1 = Math.floor((cx + RAD) / 150), j0 = Math.floor((cy - RAD) / 150), j1 = Math.floor((cy + RAD) / 150);
  for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) { const cell = cellAt(Wd, sc, i, j); if (cell.kind) drawCell(c, cell); }
  // sungai
  if (Math.abs(Wd.river.d - d) < 1600) place(Wd.river.d, 0, () => { c.fillStyle = '#4b97bd'; c.fillRect(-2600, -80, 5200, 160); c.fillStyle = 'rgba(255,255,255,.18)'; for (let k = -2600; k < 2600; k += 90) c.fillRect(k + ((t * 30) % 90), -30 + (k % 3) * 20, 40, 3); c.fillStyle = '#8f7d55'; c.fillRect(-2600, -86, 5200, 8); c.fillRect(-2600, 78, 5200, 8); });
  // rel kereta (kerikil di luar jalan)
  if (Math.abs(Wd.rail.d - d) < 1600) place(Wd.rail.d, 0, () => { c.fillStyle = '#9a9184'; c.fillRect(-2600, -34, 5200, 68); });
  // jalan melintang dan ujung perempatan di tikungan
  const crossRoad = (dd, u0, u1) => place(dd, 0, () => { c.fillStyle = '#d9cfb6'; c.fillRect(u0, -78, u1 - u0, 156); c.fillStyle = '#3b454d'; c.fillRect(u0, -60, u1 - u0, 120); c.fillStyle = 'rgba(255,255,255,.7)'; for (let u = u0; u < u1; u += 44) c.fillRect(u, -1.5, 22, 3); });
  for (const cr2 of Wd.cross) if (cr2.d > dA - 200 && cr2.d < dB + 200) crossRoad(cr2.d, -720, 920);
  for (const s of Wd.stubs) {
    if (Math.abs(s.d - d) > 1800) continue;
    const p = Wd.at(s.d); c.save(); c.translate(p.x + p.nx * 80, p.y + p.ny * 80); c.rotate(p.a + Math.PI / 2 + (s.dir < 0 ? Math.PI : 0));
    c.fillStyle = '#d9cfb6'; c.fillRect(-150, -900, 300, 900); c.fillStyle = '#3b454d'; c.fillRect(-124, -900, 248, 900);
    c.fillStyle = 'rgba(255,255,255,.7)'; for (let k = -880; k < -140; k += 44) c.fillRect(-1.5, k, 3, 22); c.restore();
  }
  // jalan utama
  const band = (u, w, col, dash) => {
    c.beginPath(); let first = true;
    const a0 = dash ? Math.floor(dA / 44) * 44 : dA;
    for (let dd = a0; dd <= dB; dd += 16) { const p = Wd.at(dd), X = p.x + p.nx * u, Y = p.y + p.ny * u; if (first) { c.moveTo(X, Y); first = false; } else c.lineTo(X, Y); }
    c.lineWidth = w; c.strokeStyle = col; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]);
  };
  c.lineCap = 'butt'; c.lineJoin = 'round';
  band(-125, 30, '#d9cfb6'); band(285, 30, '#d9cfb6');
  band(0, 220, o.wet ? '#2f383f' : '#3b454d'); band(197, 146, o.wet ? '#2f383f' : '#3b454d');
  band(117, 14, '#c9c3b4'); band(111, 2, '#e8c547'); band(123, 2, '#e8c547');
  band(-108, 2, '#e9e9e9'); band(268, 2, '#e9e9e9');
  band(-37, 3, 'rgba(255,255,255,.75)', [22, 22]); band(37, 3, 'rgba(255,255,255,.75)', [22, 22]); band(197, 3, 'rgba(255,255,255,.7)', [22, 22]);
  // persimpangan tempat rute berbelok: kotak simpang menutupi pita jalan yang menikung, plus lengan jalan
  for (const j of Wd.junctions) {
    if (j.d1 < dA - 1200 || j.d0 > dB + 1200) continue;
    const asp = o.wet ? '#2f383f' : '#3b454d', sw = '#d9cfb6';
    for (const arm of j.arms) {
      c.save(); c.translate(arm.o[0], arm.o[1]); c.rotate(Math.atan2(arm.dir[1], arm.dir[0]) + Math.PI / 2);
      c.fillStyle = sw; c.fillRect(-222, -960, 444, 960); c.fillStyle = asp; c.fillRect(-190, -960, 380, 960);
      c.fillStyle = 'rgba(255,255,255,.85)'; for (let w = -184; w < 186; w += 18) c.fillRect(w, -30, 9, 18);
      c.fillStyle = 'rgba(255,255,255,.7)'; for (let k = 70; k < 940; k += 44) c.fillRect(-1.5, -k - 22, 3, 22);
      c.restore();
    }
    place(j.d0, 0, () => {
      c.fillStyle = asp; c.fillRect(-142, -444, 444, 444);
      c.fillStyle = sw; for (const [u0, a0] of [[-142, 0], [270, 0], [-142, 412], [270, 412]]) c.fillRect(u0, -a0 - 32, 32, 32);
      if (!j.lurus) c.fillRect(-142, -444, 444, 32);
      if (!j.seberang) { if (j.dir > 0) c.fillRect(270, -444, 32, 444); else c.fillRect(-142, -444, 32, 444); }
      c.fillStyle = '#fff'; c.fillRect(-110, 9, 220, 5);
      c.fillStyle = 'rgba(255,255,255,.85)'; for (let u = -104; u < 106; u += 18) c.fillRect(u, -10, 9, 16);
      // panah belok di aspal
      c.save(); c.translate(0, -150); c.scale(j.dir > 0 ? -1 : 1, 1); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 8; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 60); c.lineTo(0, 0); c.quadraticCurveTo(0, -30, 30, -30); c.lineTo(50, -30); c.stroke();
      c.fillStyle = 'rgba(255,255,255,.8)'; c.beginPath(); c.moveTo(70, -30); c.lineTo(48, -46); c.lineTo(48, -14); c.closePath(); c.fill(); c.restore();
    });
  }
  // perempatan menutup marka, garis henti, zebra
  for (const cr2 of Wd.cross) {
    if (cr2.d < dA || cr2.d > dB) continue;
    place(cr2.d, 0, () => {
      c.fillStyle = o.wet ? '#2f383f' : '#3b454d'; c.fillRect(-142, -60, 444, 120);
      c.fillStyle = '#fff'; c.fillRect(-110, 66, 220, 5); c.fillRect(124, -71, 146, 5);
      c.fillStyle = 'rgba(255,255,255,.85)'; for (let u = -104; u < 106; u += 18) c.fillRect(u, 46, 9, 16); for (let u = 130; u < 266; u += 18) c.fillRect(u, -62, 9, 16);
    });
  }
  // jembatan
  if (Math.abs(Wd.river.d - d) < 1600) place(Wd.river.d, 0, () => { c.fillStyle = '#8d9396'; c.fillRect(-146, -96, 8, 192); c.fillRect(298, -96, 8, 192); c.fillStyle = '#c3c7c9'; for (let k = -90; k < 96; k += 16) { c.fillRect(-148, k, 12, 4); c.fillRect(296, k, 12, 4); } });
  // rel di atas jalan, palang, kereta
  const RL = S.lights.find(L => L.rail);
  if (Math.abs(Wd.rail.d - d) < 1600) place(Wd.rail.d, 0, () => {
    c.fillStyle = '#6b5a45'; for (let u = -2600; u < 2600; u += 14) c.fillRect(u, -22, 7, 44);
    c.fillStyle = '#c0c4c7'; c.fillRect(-2600, -12, 5200, 3); c.fillRect(-2600, 9, 5200, 3);
    const st = S.lightState(RL), closed = st !== 'hijau', blink = Math.floor(t * 3) % 2;
    c.fillStyle = closed && blink ? '#ff3b2f' : '#552'; c.beginPath(); c.arc(-136, 70, 7, 0, 7); c.fill(); c.beginPath(); c.arc(296, -70, 7, 0, 7); c.fill();
    c.save(); c.translate(-136, 64); c.rotate(closed ? 0 : -Math.PI / 2.4); for (let k = 0; k < 16; k++) { c.fillStyle = k % 2 ? '#fff' : '#d33'; c.fillRect(k * 15, -3, 15, 6); } c.restore();
  });
  // pinggir jalan
  for (const it of sc.items) { if (it.d < dA - 200 || it.d > dB + 200) continue; place(it.d, 0, () => drawItem(c, it, it.u0 < 0 ? -1 : 1)); }
  for (const L of Wd.landmarks) { if (Math.abs(L.d - d) > 1800) continue; place(L.d, 0, () => drawLandmark(c, L, t)); }
  for (const p of sc.props) {
    let pd = p.d; if (p.kind === 'pejalan') { pd = p.d + p.v * t; if (Wd.inJ(pd, 40)) continue; } if (pd < dA || pd > dB) continue;
    place(pd, p.u, () => {
      if (p.kind === 'tiang') { c.fillStyle = '#5d5d5d'; c.fillRect(-4, -4, 8, 8); c.fillStyle = '#333'; c.fillRect(-14, -1, 28, 2); }
      else if (p.kind === 'lampu') { c.fillStyle = '#777'; c.fillRect(-2, -2, 4, 4); c.fillRect(-p.side * 2, -1.5, p.side * 34, 3); c.fillStyle = '#ffe9a8'; c.beginPath(); c.arc(p.side * 34, 0, 5, 0, 7); c.fill(); }
      else if (p.kind === 'pohon') pohon(c, p.side * -2, 0, 15, p.h);
      else if (p.kind === 'parkir') { c.rotate(Math.PI / 2.2); motor(c, p.h % 8); }
      else if (p.kind === 'gerobak') { c.fillStyle = '#e8e2d0'; c.fillRect(-9, -16, 18, 30); c.fillStyle = '#d33'; c.fillRect(-9, -16, 18, 8); txt(c, 'BAKSO', 0, 2, 5, '#a3312a', -Math.PI / 2); }
      else if (p.kind === 'pejalan') { c.rotate(p.v > 0 ? 0 : Math.PI); orang(c, 0, 0, p.h, t, false); }
    });
  }
  // kabel listrik
  c.strokeStyle = 'rgba(30,30,30,.45)'; c.lineWidth = 1;
  for (const p of sc.props) { if (p.kind !== 'tiang' || !p.prev || p.d < dA || p.prev.d > dB) continue; const [ax, ay] = Wd.pt(p.prev.d, p.prev.u), [bx, by] = Wd.pt(p.d, p.u); c.beginPath(); c.moveTo(ax, ay); c.lineTo(bx, by); c.stroke(); }
  // lubang
  for (const p of S.pots) { if (p.d < dA || p.d > dB) continue; place(p.d, p.x - 180, () => { c.fillStyle = p.used ? '#2a3136' : '#252b30'; c.beginPath(); c.ellipse(0, 0, 13, 8, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1.5; c.stroke(); }); }
  // rambu tikungan
  for (const a of Wd.arcs) { const sd = a.d0 - 420; if (sd < dA || sd > dB) continue; place(sd, 300, () => { c.fillStyle = '#666'; c.fillRect(-1.5, 0, 3, 18); c.fillStyle = '#f2c230'; c.strokeStyle = '#111'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, -14); c.lineTo(14, 0); c.lineTo(0, 14); c.lineTo(-14, 0); c.closePath(); c.fill(); c.stroke(); c.strokeStyle = '#111'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(0, 7); c.lineTo(0, -2); c.lineTo(a.dir > 0 ? -6 : 6, -6); c.stroke(); }); }
  // polisi
  for (const p of S.police) {
    if (p.d - 520 > dA && p.d - 520 < dB) place(p.d - 520, 300, () => { c.fillStyle = '#666'; c.fillRect(-1.5, 0, 3, 20); c.fillStyle = '#fff'; c.strokeStyle = '#d33'; c.lineWidth = 3; c.beginPath(); c.arc(0, 0, 12, 0, 7); c.fill(); c.stroke(); txt(c, '40', 0, 0, 9, '#111'); });
    if (p.d > dA && p.d < dB) place(p.d, -126, () => { c.fillStyle = '#5b4a2e'; c.beginPath(); c.arc(0, 0, 8, 0, 7); c.fill(); c.fillStyle = '#e8d21a'; c.fillRect(-8, -2, 16, 4); c.fillStyle = '#222'; c.beginPath(); c.arc(0, -1, 4.5, 0, 7); c.fill(); });
  }
  // kotak berhenti dan penumpang
  for (const g of S.groups) {
    if (g.n <= 0 || g.d - d > 900 || g.d < d - 300) continue;
    place(g.d, 0, () => {
      c.fillStyle = g.prog > 0 ? 'rgba(46,204,113,.28)' : 'rgba(255,212,0,.16)'; c.fillRect(-106, -50, 66, 100);
      c.strokeStyle = g.prog > 0 ? '#2ecc71' : '#ffd400'; c.lineWidth = 2; c.setLineDash([8, 6]); c.strokeRect(-106, -50, 66, 100); c.setLineDash([]);
      for (let i = 0; i < g.n; i++) orang(c, -128 + (i % 2) * 10, -10 + i * 11, Math.floor(g.d) + i, t, i === 0);
      if (g.prog > 0) { c.strokeStyle = '#2ecc71'; c.lineWidth = 4; c.beginPath(); c.arc(-124, 0, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, g.prog / 0.45)); c.stroke(); }
    });
  }
  // lampu lalu lintas
  for (const L of S.lights) {
    if (L.rail || L.d < dA || L.d > dB) continue;
    const st = S.lightState(L), col = { hijau: '#2ecc71', kuning: '#ffcc00', merah: '#ff3b2f' }[st];
    place(L.d, 0, () => {
      c.fillStyle = '#555'; c.fillRect(-132, 72, 6, 6); c.fillRect(-129, 73, 120, 4);
      c.fillStyle = '#111'; rr(c, -40, 66, 40, 16, 4); c.fill();
      ['merah', 'kuning', 'hijau'].forEach((k, i) => { c.fillStyle = k === st ? col : '#333'; c.beginPath(); c.arc(-32 + i * 12, 74, 5, 0, 7); c.fill(); });
      c.fillStyle = col; c.globalAlpha = 0.25; c.beginPath(); c.arc(-32 + ['merah', 'kuning', 'hijau'].indexOf(st) * 12, 74, 11, 0, 7); c.fill(); c.globalAlpha = 1;
    });
  }
  // lalu lintas arah berlawanan
  for (const v of sc.oncoming) {
    const base = d - 900, dd = base + ((((v.d0 - v.v * t) - base) % 2600) + 2600) % 2600;
    if (dd < dA || dd > dB) continue;
    place(dd, v.u, () => { c.rotate(Math.PI); if (v.kind === 'motor') motor(c, v.hue); else if (v.kind === 'angkot') angkot(c, ['#1a8f4c', '#f2b90f', '#35b3c9'][v.hue % 3], { no: '05' }); else if (v.kind === 'truk') truk(c, 44, 118, CARC[v.hue], false); else mobil(c, 34, 66, CARC[v.hue], false); });
  }
  // kendaraan searah
  for (const m of S.cars) { if (m.d < dA || m.d > dB) continue; place(m.d, m.x - 180, () => { if (m.kind === 'motor') motor(c, m.hue); else if (m.kind === 'mobil') mobil(c, m.w, m.l, CARC[m.hue], m.v < 20); else if (m.kind === 'pikap') pikap(c, m.w, m.l, CARC[m.hue], m.v < 20); else truk(c, m.w, m.l, CARC[m.hue], m.v < 20); }); }
  for (const b of S.biru) { if (b.d < dA - 100 || b.d > dB) continue; place(b.d, b.x - 180, () => angkot(c, '#35b3c9', { no: '05', brake: b.state === 'ngetem' || b.v < 20, sein: !!b.g, t })); }
  for (const x of S.crossers) {
    place(x.d, x.x - 180, () => {
      if (x.kind === 'kereta') { for (let k = 0; k < 6; k++) { const u = -x.w / 2 + k * (x.w / 6); c.fillStyle = k === 0 ? '#e07b39' : '#3e6fb1'; c.strokeStyle = '#111'; c.lineWidth = 2; rr(c, u + 4, -18, x.w / 6 - 8, 36, 6); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.6)'; for (let j = 0; j < 5; j++) c.fillRect(u + 16 + j * 34, -10, 18, 6); } }
      else { c.rotate(x.dir > 0 ? Math.PI / 2 : -Math.PI / 2); mobil(c, 34, 66, CARC[x.hue], false); }
    });
  }
  // angkot pemain
  const yaw = S.yaw + (S.slip || 0);
  place(d, S.x - 180, () => { c.rotate(yaw); angkot(c, o.hex, { no: o.route, brake: S.braking || Math.abs(S.v) < 5, rev: S.rev, sein: S.x < CURB_X, t }); });
  c.restore();
  // suasana: hujan, sore makin gelap, lampu depan
  if (o.sh === 2) {
    const dark = 0.5 * clamp((t / S.spec.dur - 0.15) / 0.85, 0, 1);
    c.fillStyle = `rgba(255,120,40,${0.12 - dark * 0.1})`; c.fillRect(0, 0, W, H);
    if (dark > 0.02) {
      const [hx, hy] = toScreen(...Wd.pt(d + 120, S.x - 180));
      const g = c.createRadialGradient(hx, hy, 10, hx, hy, 230); g.addColorStop(0, 'rgba(10,14,40,0)'); g.addColorStop(1, `rgba(10,14,40,${dark})`);
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    }
  }
  if (o.wet) { c.strokeStyle = 'rgba(200,220,255,.35)'; c.lineWidth = 1; c.beginPath(); for (let i = 0; i < 60; i++) { const x = (hash(i * 13) % W), y = ((hash(i * 7) % H) + t * 700 + i * 37) % H; c.moveTo(x, y); c.lineTo(x - 3, y + 12); } c.stroke(); }
  const [qx] = toScreen(...Wd.pt(d, S.x - 180)); o.psx = qx; o.ppu = Z;
  drawHUD(c, S, H, o, (dd, xx) => toScreen(...Wd.pt(dd, xx - 180)));
}

/* HUD di atas peta 2D maupun 3D. proj(d, x) memetakan titik jalan ke layar logis. */
function drawHUD(c, S, H, o, proj) {
  const Wd = S.world, sc = buildScenery(Wd), d = S.d, t = S.t, cam = Wd.at(d);
  const [psx, psy] = proj(d, S.x);
  const kiri = S.kiriCount();
  if (kiri) { const blink = Math.floor(t * 4) % 2; c.fillStyle = blink ? '#ffd400' : '#fff'; c.strokeStyle = '#111'; c.lineWidth = 2; rr(c, psx - 38, psy - 86, 76, 26, 8); c.fill(); c.stroke(); txt(c, `KIRI! ×${kiri}`, psx, psy - 73, 14, '#111'); }
  for (const p of S.pops) { const [sx2, sy2] = proj(p.d, p.x); c.globalAlpha = 1 - p.t / 1.2; txt(c, p.text, sx2 + 40, sy2 - 50 - p.t * 50, 18, p.good ? '#1f9d55' : '#d33'); c.globalAlpha = 1; }
  // HUD
  const left = Math.max(0, Math.ceil(S.spec.dur - t));
  c.fillStyle = 'rgba(17,24,30,.85)'; c.fillRect(0, 0, W, 52);
  c.font = `800 15px ${FONT}`; c.textAlign = 'left'; c.textBaseline = 'alphabetic'; c.fillStyle = left <= 10 ? '#ff6b5a' : '#fff'; c.fillText(`⏱ ${left}`, 12, 24);
  c.fillStyle = '#fff'; c.fillText(`👥 ${S.riders.length}/${S.spec.seats}`, 74, 24);
  c.textAlign = 'right'; c.fillStyle = '#ffd400'; c.fillText(`Rp ${Math.round(S.fares)} rb`, W - 12, 24);
  const nx = Wd.landmarks.find(l => l.d > d - 150);
  c.textAlign = 'left'; c.font = `600 11px ${FONT}`; c.fillStyle = '#aeb9c1'; c.fillText(nx ? (nx.d - d < 300 ? `Di ${nx.name}` : `Menuju ${nx.name}`) : 'Rit terakhir', 12, 43);
  const NL = S.nextLight(d + PL / 2);
  if (NL && NL.d - d < 700) { const st = S.lightState(NL); c.textAlign = 'right'; c.fillStyle = { hijau: '#7ddc8f', kuning: '#ffcc00', merah: '#ff6b5a' }[st]; c.fillText(`${NL.rail ? 'Palang kereta' : 'Lampu'}: ${st}`, W - 12, 43); }
  // minimap
  const [bx0, by0, bx1, by1] = sc.box, MW = 84, MH = 100, k = Math.min((MW - 12) / (bx1 - bx0 || 1), (MH - 12) / (by1 - by0 || 1));
  const mx = W - MW - 8, my = 60, map = (x, y) => [mx + 6 + (x - bx0) * k + ((MW - 12) - (bx1 - bx0) * k) / 2, my + 6 + (y - by0) * k + ((MH - 12) - (by1 - by0) * k) / 2];
  c.fillStyle = 'rgba(17,24,30,.72)'; rr(c, mx, my, MW, MH, 8); c.fill();
  c.strokeStyle = o.routeCol || '#ffd400'; c.lineWidth = 3; c.beginPath(); sc.mm.forEach(([x, y], i) => { const [a, b] = map(x, y); i ? c.lineTo(a, b) : c.moveTo(a, b); }); c.stroke();
  for (const L of Wd.landmarks) { const [a, b] = map(...Wd.pt(L.d, 0)); c.fillStyle = L.dest ? '#ffd400' : '#fff'; c.beginPath(); c.arc(a, b, L.dest ? 4 : 2.5, 0, 7); c.fill(); }
  { const [a, b] = map(cam.x, cam.y); c.fillStyle = '#ff3b2f'; c.strokeStyle = '#fff'; c.lineWidth = 1.5; c.beginPath(); c.arc(a, b, 4.5, 0, 7); c.fill(); c.stroke(); }
  // speedometer
  const sp = Math.abs(S.v) / S.vMax; c.fillStyle = 'rgba(17,24,30,.75)'; rr(c, W - 72, H - 34, 62, 22, 6); c.fill();
  c.fillStyle = sp > 0.82 ? '#ff6b5a' : S.skid ? '#ffcc00' : '#7ddc8f'; c.fillRect(W - 66, H - 28, 50 * sp, 10);
  txt(c, (S.rev ? 'R · ' : '') + Math.round(sp * 60) + ' km/j', W - 41, H - 42, 9, S.rev ? '#ffd400' : '#fff');
  // pesan
  S.msgs.forEach((m, i) => { c.globalAlpha = Math.min(1, (2.6 - m.t) * 2); c.fillStyle = m.kind === 'bad' ? '#d33' : m.kind === 'good' ? '#1f9d55' : m.kind === 'kiri' ? '#b8860b' : '#1b2630'; rr(c, 60, 62 + i * 30, 200, 24, 12); c.fill(); txt(c, m.text, 160, 74 + i * 30, 12, '#fff'); c.globalAlpha = 1; });
  if (Math.abs(S.v) < 5 && !S.gas && !S.rev && S.t < 6 && !S.over) { c.fillStyle = 'rgba(31,157,85,.95)'; rr(c, 80, H - 112, 200, 30, 15); c.fill(); txt(c, 'Tahan ▲ MAJU untuk jalan', 180, H - 97, 13, '#fff'); }
  // persimpangan di depan: arah belok, dan laju belok aman (km/j) kalau masih terlalu kencang
  const J = !S.over && Wd.junctions.find(j => j.d1 > d && j.d0 - d < 560);
  if (J) {
    const kiri = J.dir > 0, now = J.d0 <= d, vt = S.turnV((J.d0 + J.d1) / 2, S.x);
    const putar = J.d0 - d < 160 ? (kiri ? ' · tahan ◀' : ' · tahan ▶') : '';
    c.fillStyle = now ? 'rgba(53,120,229,.95)' : 'rgba(53,120,229,.85)'; rr(c, 40, H - 150, 280, 30, 15); c.fill();
    txt(c, `${J.nama}: ${kiri ? '↰ belok kiri' : 'belok kanan ↱'}${putar}`, 180, H - 135, 12.5, '#fff');
    if (S.v > vt + 8) { c.fillStyle = 'rgba(242,194,48,.95)'; rr(c, 70, H - 112, 220, 26, 13); c.fill(); txt(c, `Pelan! Belok maks ±${Math.round(vt / 340 * 60)} km/j`, 180, H - 99, 12, '#111'); }
  }
}

/* ---------- pasang di halaman ---------- */
const MUTU = { ultra: 'Ultra', tinggi: 'Tinggi', ringan: 'Ringan' };
const CAMS = { atas: 'Kamera atas', belakang: 'Kamera belakang', '2d': 'Peta 2D' };
function camLoad() { try { return localStorage.getItem('narik-kamera'); } catch (e) { return null; } }
function camSave(v) { try { localStorage.setItem('narik-kamera', v); } catch (e) { /* tanpa penyimpanan tetap jalan */ } }
function mount(host, spec, opts, done) {
  const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  const Wd = buildWorld(spec.route), stops = Wd.landmarks.map(l => l.name);
  const R3 = root.NARIK_3D && root.NARIK_3D.available() ? root.NARIK_3D : null;
  const SU = root.NARIK_SUARA || null; let eng = null;
  const modes = R3 ? ['atas', 'belakang', '2d'] : ['2d'];
  let mode = modes.includes(camLoad()) ? camLoad() : modes[0];
  host.innerHTML = `<div class="nyetir" role="application" aria-label="Nyetir angkot">
    <div class="ny-kanvas"><canvas class="ny-hud"></canvas>${modes.length > 1 ? `<button class="ny-kam" data-ny="kam" aria-label="Ganti kamera">🎥 <span>${CAMS[mode]}</span></button>` : ''}${SU ? `<button class="ny-suara" data-ny="suara" aria-label="Suara dan getar" aria-pressed="${SU.on}">${SU.on ? '🔊' : '🔇'}</button>` : ''}
      <div class="ny-lapis" data-ny="intro"><div class="ny-kartu"><span class="eyebrow">Rit ${esc(opts.shiftName)} · Trayek ${esc(spec.route)}</span><h2>${esc(stops[0])} → ${esc(stops[stops.length - 1])}</h2>
        <p class="ny-rute">${stops.map(esc).join(' · ')}</p>
        <p class="ny-rit"><b>Rit</b> = sekali jalan narik penumpang di trayek ini, dari ${esc(stops[0])} ke arah ${esc(stops[stops.length - 1])}. Sehari ada tiga rit: pagi, siang, sore. Satu rit 60 detik.</p>
        <ul><li>Tahan <b>▲ MAJU</b> untuk jalan. Lepas, angkot melambat sendiri.</li>
        <li>Tahan <b>▼ MUNDUR</b> untuk mengerem. Tetap ditahan setelah berhenti, angkot jalan mundur (misalnya menjemput penumpang yang kelewatan).</li>
        <li>Tahan <b>◀ ▶</b> untuk belok. Lepas, angkot lurus lagi dan merapat ke tengah lajur.</li>
        <li>Rute berbelok di <b>perempatan</b> dan <b>pertigaan</b>; arahnya ditunjuk panah. Pelan-pelan, lalu <b>tahan ◀ atau ▶ ke arah panah</b> sampai lurus lagi. Terlalu kencang (kiri ±30 km/j, kanan ±44 km/j) = <b>kebablasan</b>.</li>
        <li>Orang melambai di trotoar: <b>menepi ke kotak kuning dan berhenti</b>.</li><li>Ada yang teriak <b>“Kiri!”</b>: menepi dan berhenti. Ongkos dibayar waktu turun. Kelewatan, dia tidak mau bayar.</li>
        <li>Patuhi <b>lampu merah</b> dan <b>palang kereta</b>. Awas motor, mobil, lubang, dan polisi. Angkot biru suka menyerobot penumpang.</li>
        <li>Keyboard: ↑/W maju, ↓/S mundur, ←→/A/D belok, spasi rem, H klakson, C kamera.</li>${SU ? '<li>Ada suara dan getar. Matikan dengan tombol 🔊 di kiri atas.</li>' : ''}</ul>
        ${spec.wet ? '<p><b>Hujan:</b> rem licin, penumpang lebih banyak.</p>' : ''}${spec.wobble ? '<p><b>Kamu ngantuk:</b> setir agak goyang.</p>' : ''}${spec.sh === 2 ? '<p><b>Sore:</b> makin lama makin gelap.</p>' : ''}
        <p>Tarif ±Rp ${spec.tarif} rb per penumpang.</p>
        <button class="gas" data-ny="go">Gas!</button>${R3 ? `<button class="btn-teks" data-ny="grafis">Grafis: <b>${MUTU[R3.quality()] || 'Tinggi'}</b> (ketuk untuk ganti)</button>` : ''}<button class="btn-teks" data-ny="auto">Narik otomatis saja</button></div></div>
    </div>
    <div class="ny-kontrol">
      <div class="arah-grup"><button class="arah-btn" data-ny="kiri" aria-label="Belok kiri">◀</button><button class="arah-btn" data-ny="kanan" aria-label="Belok kanan">▶</button></div>
      <button class="klakson" data-ny="tin" aria-label="Klakson">TIN</button>
      <div class="pedal-grup"><button class="rem" data-ny="mundur" aria-label="Mundur atau rem">▼<small>MUNDUR</small></button><button class="gaspol" data-ny="maju" aria-label="Maju">▲<small>MAJU</small></button></div>
    </div></div>`;
  const root2 = host.firstElementChild, cv = root2.querySelector('canvas.ny-hud'), box = root2.querySelector('.ny-kanvas'), c = cv.getContext('2d');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = new Sim(spec); if (SU) S.sfx = []; let H = 640, k = 1, raf = 0, last = 0, running = false, closed = false;
  const inp = { tx: null, brake: false, gas: 0, steer: 0, mundur: false }, keys = {}, btn = { l: false, r: false, up: false, dn: false };
  let steerVal = 0, holdR = 0, r3 = null;
  const o = { hex: opts.hex, route: spec.route, wet: spec.wet, sh: spec.sh, reduce, routeCol: opts.routeCol, zoom: Z_STOP, psx: W / 2, ppu: Z_STOP, cam: mode };
  if (R3) { try { r3 = R3.create(box, S, spec, o); } catch (e) { r3 = null; mode = '2d'; o.cam = '2d'; } }
  const dpr = () => Math.min(2, window.devicePixelRatio || 1);
  function size() {
    const r = box.getBoundingClientRect();
    k = r.width / W; H = Math.max(420, Math.round(r.height / k));
    cv.width = Math.round(r.width * dpr()); cv.height = Math.round(H * k * dpr()); cv.style.width = r.width + 'px'; cv.style.height = (H * k) + 'px';
    if (r3) r3.resize(r.width, H * k, W, H);
  }
  function frame(now) {
    // HP lambat: fisika tetap memakai langkah kecil supaya waktu rit sama dengan waktu nyata
    const dt = Math.min(0.5, (now - last) / 1000 || 0); last = now;
    // belok: ◀ ▶ ditahan = setir berputar bertahap (±0,25 dtk sampai penuh), dilepas = kembali sedikit lebih cepat
    const want = ((keys.r || btn.r) ? 1 : 0) - ((keys.l || btn.l) ? 1 : 0);
    const rate = want !== 0 && Math.sign(want) === Math.sign(steerVal || want) && Math.abs(want) > Math.abs(steerVal) ? 4 : 6;
    steerVal += clamp(want - steerVal, -rate * dt, rate * dt); inp.steer = steerVal;
    // ▲ MAJU = gas (mengerem dulu kalau sedang mundur); ▼ MUNDUR = rem, lalu mundur kalau tetap ditahan setelah berhenti
    const up = keys.g || btn.up, dn = keys.b || btn.dn;
    inp.gas = 0; inp.brake = !!keys.x; inp.mundur = false;
    if (up && !dn) { holdR = 0; if (S.v < -1) inp.brake = true; else inp.gas = 1; }
    else if (dn && !up) {
      if (S.v > 1) { inp.brake = true; holdR = 0; }
      else { holdR += dt; if (S.v < -1 || holdR > 0.45) { inp.gas = 1; inp.mundur = true; } else inp.brake = true; }
    } else { holdR = 0; if (up && dn) inp.brake = true; else inp.mundur = S.v < -1; }
    if (r3 && !r3.ready && !running) { goBtn.disabled = true; goBtn.textContent = 'Memuat kota 3D…'; }
    else if (goBtn.disabled && !running) { goBtn.disabled = false; goBtn.textContent = 'Gas!'; }
    if (running) for (let left = dt; left > 1e-6 && !S.over; left -= 0.05) S.step(Math.min(0.05, left), inp);
    if (SU) { if (eng) eng.update(S, inp); while (S.sfx.length) SU.play(S.sfx.shift()); }
    // arah kamera = arah hadap angkot (arah jalan + sudut badan), dihaluskan supaya tidak ikut gemetar
    { const hc = Wd.at(S.d).a + S.yaw; if (o.camH == null || !dt) o.camH = hc; else { const dh = Math.atan2(Math.sin(hc - o.camH), Math.cos(hc - o.camH)); o.camH += dh * Math.min(1, dt * 6); } }
    o.zoom += (Z_STOP - (Z_STOP - Z_FAST) * Math.abs(S.v) / S.vMax - o.zoom) * Math.min(1, dt * 1.5);
    c.setTransform(k * dpr(), 0, 0, k * dpr(), 0, 0);
    if (r3 && mode !== '2d') {
      r3.canvas.style.visibility = 'visible';
      r3.render(dt, mode);
      c.clearRect(0, 0, W, H);
      drawHUD(c, S, H, o, r3.proj);
    } else {
      if (r3) r3.canvas.style.visibility = 'hidden';
      draw(c, S, H, o);
    }
    if (S.over && running) { running = false; end(); }
    if (!closed) raf = requestAnimationFrame(frame);
  }
  function end() {
    const R = S.result(), L = root2.querySelector('.ny-lapis');
    if (eng) { eng.stop(); eng = null; } if (SU && S.endPay) SU.play('bayar');
    const lines = [`${R.riders} penumpang naik. Ongkos terkumpul <b>Rp ${R.fares} rb</b>.`];
    if (S.endPay) lines.push(`Sisa penumpang turun di akhir rit: Rp ${Math.round(S.endPay)} rb.`);
    if (R.missed) lines.push(`${R.missed} penumpang kelewatan turun dan tidak mau bayar.`);
    if (R.stolen) lines.push(`${R.stolen} penumpang diserobot angkot biru.`);
    if (R.hits) lines.push(`Nyerempet atau nabrak ${R.hits}×${R.severe ? `, ${R.severe} parah` : ''}.`);
    if (R.skids) lines.push(`Kebablasan di persimpangan ${R.skids}×.`);
    if (R.potholes) lines.push(`Masuk lubang ${R.potholes}×.`);
    if (R.merah) lines.push(`Menerobos lampu merah atau palang ${R.merah}×.`);
    if (R.tilang - R.merah > 0) lines.push('Kena tilang karena ngebut.');
    if (R.mogok) lines.push('Angkot mogok di jalan.');
    const dest = Wd.dest.name;
    L.innerHTML = `<div class="ny-kartu"><span class="eyebrow">${R.mogok ? 'Mogok' : 'Rit selesai'}</span><h2>${R.mogok ? 'Mesin mati' : R.sampai ? 'Sampai ' + esc(dest) : 'Belum sampai ' + esc(dest)}</h2><ul>${lines.map(x => `<li>${x}</li>`).join('')}</ul><button class="gas" data-ny="done">Lanjut</button></div>`;
    // tombol dikunci sebentar supaya rem/spasi yang masih ditahan tidak langsung menutup ringkasan
    L.hidden = false; const bt = L.querySelector('button'); bt.disabled = true; setTimeout(() => { bt.disabled = false; bt.focus(); }, 700);
  }
  function close(res) { if (eng) { eng.stop(); eng = null; } closed = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('resize', size); if (r3) r3.detach(); host.innerHTML = ''; done(res); }
  const goBtn = root2.querySelector('[data-ny="go"]');
  // tombol arah: ditahan selama jari menempel (pointer capture, jadi jari yang bergeser tidak melepas tombol)
  const hold = (el, key) => {
    el.addEventListener('pointerdown', e => { btn[key] = true; el.classList.add('on'); el.setPointerCapture(e.pointerId); e.preventDefault(); });
    const off = () => { btn[key] = false; el.classList.remove('on'); };
    el.addEventListener('pointerup', off); el.addEventListener('pointercancel', off); el.addEventListener('lostpointercapture', off);
    el.addEventListener('contextmenu', e => e.preventDefault());
  };
  hold(root2.querySelector('[data-ny="kiri"]'), 'l'); hold(root2.querySelector('[data-ny="kanan"]'), 'r');
  hold(root2.querySelector('[data-ny="maju"]'), 'up'); hold(root2.querySelector('[data-ny="mundur"]'), 'dn');
  const tinBtn = root2.querySelector('[data-ny="tin"]');
  function klakson() { if (SU) { SU.ensure(); SU.play('tin'); } if (running) S.say('Tin tin!'); tinBtn.classList.add('on'); setTimeout(() => tinBtn.classList.remove('on'), 180); }
  tinBtn.addEventListener('pointerdown', e => { e.preventDefault(); klakson(); });
  const KM = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ' ': 'x', ArrowDown: 'b', s: 'b', S: 'b', ArrowUp: 'g', w: 'g', W: 'g' };
  function kd(e) {
    const m = KM[e.key];
    if (m && running) { keys[m] = true; e.preventDefault(); } if ((e.key === 'c' || e.key === 'C') && modes.length > 1) cycle(); if (e.key === 'h' || e.key === 'H') klakson(); }
  function ku(e) { const m = KM[e.key]; if (m) keys[m] = false; }
  function cycle() { mode = modes[(modes.indexOf(mode) + 1) % modes.length]; o.cam = mode; camSave(mode); const lb = root2.querySelector('.ny-kam span'); if (lb) lb.textContent = CAMS[mode]; }
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('resize', size);
  root2.addEventListener('click', e => {
    const b = e.target.closest('[data-ny]'); if (!b) return; const a = b.dataset.ny;
    if (a === 'go') { b.closest('.ny-lapis').hidden = true; running = true; if (SU && SU.ensure()) eng = SU.engine(spec.wet); }
    if (a === 'suara' && SU) { SU.setOn(!SU.on); if (SU.on) SU.ensure(); b.textContent = SU.on ? '🔊' : '🔇'; b.setAttribute('aria-pressed', SU.on); }
    if (a === 'auto') close(null);
    if (a === 'done') close(S.result());
    if (a === 'kam') cycle();
    if (a === 'grafis' && R3 && !running) {
      // ganti mode grafis: bangun ulang tampilan 3D dengan material dan bayangan yang sesuai
      // Ultra -> Tinggi -> Ringan -> Ultra (model HD baru dipakai setelah game dibuka ulang)
      const urut = ['ultra', 'tinggi', 'ringan'], q = urut[(urut.indexOf(R3.quality()) + 1) % 3]; R3.setQuality(q); b.querySelector('b').textContent = MUTU[q];
      if (r3) r3.detach();
      try { r3 = R3.create(box, S, spec, o); } catch (e) { r3 = null; }
      size();
    }
  });
  size(); raf = requestAnimationFrame(t => { last = t; frame(t); });
  goBtn.focus();
  return { sim: S, get mode() { return mode; }, get r3() { return r3; }, cycle, input: inp, set: (up, dn, st) => { btn.up = !!up; btn.dn = !!dn; btn.l = st < 0; btn.r = st > 0; } };
}

const API = { Sim, mount, buildWorld, LANES, CURB_X, W, PL, PW, CORNER_V, BRAKE,
  _: { buildScenery, cellAt, hash, mulberry, clamp, SHOPS, ROOF, WALLC, CARC, SHIRT, SKIN, KIND, DMIN, ROAD_L, ROAD_R } };
root.NARIK_DRIVE = API;
if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
