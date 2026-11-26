/* NARIK — mesin game (logika murni, jalan di browser dan Node).
   Uang dalam ribuan rupiah: 250 = Rp 250.000 */
(function (root) {
'use strict';
const G = {};
G.SHIFT = ['Pagi', 'Siang', 'Sore'];
G.JAM = ['05.00–10.00', '10.00–15.00', '15.00–20.00'];
G.DOW = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

G.ROUTES = {
  '05': { id: '05', name: 'Terminal – Pasar Baru', base: [124, 76, 104], fuel: 22, wear: 1.0, izin: 0,
    tip: 'Pendek dan irit. Ramai pagi, apalagi tanggal muda dan Minggu pagi.' },
  '09': { id: '09', name: 'Terminal – Kampus', base: [96, 130, 122], fuel: 27, wear: 1.1, izin: 600,
    tip: 'Ramai siang sampai sore. Sepi Sabtu–Minggu karena kampus libur.' },
  '12': { id: '12', name: 'Pasar Baru – Stasiun – Griya Asri', base: [160, 112, 176], fuel: 40, wear: 1.4, izin: 1500,
    tip: 'Jauh dan boros, tapi paling gemuk. Hujan bikin macet. Jumat sore ramai.' }
};
G.RIDS = ['05', '09', '12'];   // urutan tetap (Object.keys menaruh '12' duluan karena angka)
G.DRIVERS = {
  ujang: { id: 'ujang', name: 'Mang Ujang', age: 54, skill: 1.08, g: 0.97, w: 0.8, need: 85, tag: 'Kalem',
    bio: 'Tiga puluh tahun di jalan. Pelan, mesin awet.', perk: 'Jadi mandor: semua angkot lebih awet.' },
  jajang: { id: 'jajang', name: 'Jajang', age: 19, skill: 0.82, grow: 0.012, cap: 1.06, g: 1, w: 1.2, need: 65, tag: 'Pemula',
    bio: 'Bekas kernet. Belum lancar, tapi cepat belajar.', perk: 'Lulus ujian SIM: makin jago.' },
  asep: { id: 'asep', name: 'Asep Gaspol', age: 23, skill: 1.0, g: 1.15, w: 1.5, risk: 0.04, need: 95, tag: 'Ngebut',
    bio: 'Mantan anak balap liar. Rit-nya banyak, kampas rem cepat habis.', perk: 'Insaf: tetap kencang, tapi tidak merusak mobil.' },
  dadang: { id: 'dadang', name: 'Kang Dadang', age: 37, skill: 0.95, g: 1, w: 0.8, f: 0.8, vary: 0.3, licin: true, need: 75, tag: 'Tukang ngetem',
    bio: 'Sabar menunggu penuh. Setorannya kadang ajaib.', perk: 'Mengaku pernah nilep, dan berhenti.' },
  ucok: { id: 'ucok', name: 'Bang Ucok', age: 33, skill: 1.12, g: 1.05, w: 1.1, need: 110, tag: 'Pekerja keras',
    bio: 'Perantau dari Medan. Narik dari subuh, sering minta kasbon.', perk: 'Utang kampung lunas: makin semangat.' },
  tini: { id: 'tini', name: 'Bu Tini', age: 41, skill: 1.0, g: 1, w: 1, need: 90, tag: 'Ramah', home: '05',
    bio: 'Disayang ibu-ibu pasar. Paling cocok di trayek 05.', perk: 'Langganan pasar: tambah ramai di trayek 05.' }
};
G.CAND_ORDER = ['jajang', 'asep', 'dadang', 'ucok', 'tini'];
G.UPGRADES = {
  jok: { name: 'Jok baru', price: 220, desc: 'Penumpang betah. Pendapatan +6%.' },
  sound: { name: 'Sound system', price: 300, desc: 'Pendapatan +5%, di trayek Kampus +12%.' },
  mesin: { name: 'Karburator irit', price: 250, desc: 'Bensin lebih hemat 12%.' }
};
G.COLORS = { hijau: 'Hijau', biru: 'Biru telur asin', kuning: 'Kuning', merah: 'Merah', ungu: 'Ungu' };
G.DEALER = {
  tua: { id: 'tua', label: 'Bekas tua', price: 1900, cond: 46, desc: 'Keluaran 90-an. Jalan, tapi rewel.' },
  bagus: { id: 'bagus', label: 'Bekas terawat', price: 3300, cond: 78, desc: 'Satu tangan, servis rutin.' },
  baru: { id: 'baru', label: 'Baru, kredit', price: 1500, daily: 130, days: 30, cond: 100, mesin: true,
    desc: 'DP Rp 1,5 jt, lalu cicilan Rp 130 rb per hari selama 30 hari. Mesin irit.' },
  titip: { id: 'titip', label: 'Titipan Teh Rina', price: 300, daily: 90, days: 20, cond: 55, once: true,
    desc: 'Pemiliknya pindah ke Kalimantan. DP Rp 300 rb, lalu Rp 90 rb per hari selama 20 hari.' }
};
G.NAMES = ['Si Ijo', 'Berkah Jalan', 'Putra Cibening', 'Sinar Pagi', 'Laskar Pasar', 'Si Kabayan', 'Bintang 05', 'Mekar Jaya'];
G.SERVIS = { ringan: { price: 120, add: 22, name: 'Servis ringan' }, besar: { price: 340, add: 55, name: 'Servis besar' } };
G.MAX_FLEET = 8;
/* Bab 3: sidang perpanjangan izin trayek 05 */
G.B3 = { len: 30, target: 900, kir: 120, kirCond: 60, lulus: 50, win: 75, kuota: 2,
  w: { pet: 30, pag: 25, arm: 30, hal: 15 } };

/* ---------- util ---------- */
function rng(s) {
  s.seed = (s.seed + 0x6D2B79F5) | 0; let t = s.seed;
  t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const R10 = v => Math.round(v);
G.fmt = function (n) {
  const neg = n < 0; n = Math.abs(Math.round(n));
  let t;
  if (n >= 1000) { t = (n / 1000).toFixed(2).replace(/0+$/, '').replace(/\.$/, '').replace('.', ',') + ' jt'; }
  else t = n + ' rb';
  return (neg ? '−' : '') + 'Rp ' + t;
};
G.cal = function (s, day) { day = day || s.day; return { dow: (day - 1) % 7, dom: ((day - 1) % 30) + 1 }; };
function rollWx(s) { const r = rng(s); return r < 0.6 ? 'cerah' : r < 0.8 ? 'mendung' : 'hujan'; }
function ledger(s, k, v) {
  if (!v) return; const L = s.today.ledger; const e = L.find(x => x.k === k);
  if (e) e.v += v; else L.push({ k, v });
}
function cash(s, v, k) { s.money += v; ledger(s, k, v); }
function rep(s, n) { s.rep = clamp(s.rep + n, 0, 100); }
function cond(a, n) { a.cond = clamp(a.cond + n, 5, 100); }
function hasMod(s, id) { return s.mods.some(m => m.id === id && (!m.until || s.day <= m.until)); }
function addMod(s, m) { s.mods = s.mods.filter(x => x.id !== m.id); s.mods.push(m); }
G.debtLeft = s => s.debt.sched.reduce((t, x) => t + x.amt, 0);
G.nextDue = s => s.debt.sched.find(x => x.amt > 0) || null;
G.expNet = rid => { const r = G.ROUTES[rid]; return r.base[0] + r.base[1] + r.base[2] - 3 * r.fuel; };
G.drv = (s, a) => (a.driver && a.driver !== 'self') ? s.drivers[a.driver] : null;
G.active = s => s.fleet.filter(a => a.driver && !a.off);
G.living = s => s.bab === 1 ? 35 : 60;
G.b3on = s => s.bab === 3 && !!s.b3 && !s.b3.result;
G.d3 = s => s.b3 ? s.day - s.b3.start : -1;
G.kuotaFull = (s, rid, except) => rid === '05' && !!s.kuota05 && s.fleet.filter(a => a !== except && a.route === '05').length >= s.kuota05;

function newAngkot(s, o) {
  const a = { id: 'a' + (s.nextId++), name: o.name, cond: o.cond, color: o.color || 'hijau',
    ups: { jok: false, sound: false, mesin: !!o.mesin }, driver: null, route: '05', setoran: 120,
    stiker: o.stiker || '', loan: o.loan || null, off: false };
  s.fleet.push(a); return a;
}

/* ---------- permintaan penumpang ---------- */
/* angkotmu sendiri di satu trayek berebut penumpang: tiap angkot tambahan tetap menambah, tapi makin sedikit
   (1 → 1,0; 2 → 1,79; 3 → 2,42; 4 → 2,94; 5 → 3,38 kali penumpang satu angkot) */
G.crowdF = n => 1 / (1 + 0.12 * Math.max(0, n - 1));
G.demand = function (s, rid, sh, day, wx) {
  const d = G.cal(s, day || s.day); const w = wx || s.wx.today; let m = 1;
  if (rid === '05') { if (d.dow === 6 && sh === 0) m *= 1.25; if (d.dom <= 5) m *= 1.18; if (d.dom >= 25) m *= 0.93; if (w === 'hujan') m *= 1.08; }
  if (rid === '09') { if (d.dow >= 5) m *= 0.55; if (w === 'hujan') m *= 1.12; }
  if (rid === '12') { if (w === 'hujan') m *= 0.8; if (d.dow === 4 && sh === 2) m *= 1.25; if (d.dow === 0 && sh === 0) m *= 1.2; }
  for (const md of s.mods) {
    if (md.until && s.day > md.until) continue;
    if (md.route && md.route !== rid) continue;
    if (md.shift != null && md.shift !== sh) continue;
    if (md.demand) m *= md.demand;
  }
  m *= G.crowdF(G.crowd(s, rid));
  m *= 0.9 + s.rep / 500;
  return m * s.tarifK;
};
function upF(a) { let f = 1; if (a.ups.jok) f *= 1.06; if (a.ups.sound) f *= (a.route === '09' ? 1.12 : 1.05); return f; }
function condF(a) { return a.cond >= 60 ? 1 : a.cond >= 40 ? 0.92 : 0.8; }
function fuelOf(s, a) { return G.ROUTES[a.route].fuel * s.fuelK * (a.ups.mesin ? 0.88 : 1); }
function drvStyle(s, a, dr) {
  const D = G.DRIVERS[dr.id];
  let g = D.g || 1, w = D.w || 1, f = D.f || 1, risk = D.risk || 0, sk = dr.skill;
  if (dr.perk) { if (dr.id === 'asep') { w = 1.0; risk = 0.01; } if (dr.id === 'tini' && a.route === '05') g *= 1.15; }
  else if (D.home === a.route) g *= 1.08;
  const Rt = G.ROUTES[a.route]; let calm = 0;
  for (let sh = 0; sh < 3; sh++) calm += Rt.base[sh] * G.demand(s, a.route, sh) * sk * g * condF(a) * upF(a);
  calm -= 3 * fuelOf(s, a) * f;
  const pressured = calm - a.setoran < D.need * 1.15;
  if (pressured) { g *= 1.05; w *= 1.8; risk += 0.07; }
  return { g, w, f, risk, sk, pressured, vary: D.vary || 0 };
}
/* Setoran wajar: separuh lebih sedikit dari bersih trayek, tapi diturunkan kalau trayeknya sesak,
   supaya sopir tetap bawa pulang kebutuhannya × 1,25 di hari biasa (cuaca dan tanggal netral). */
G.crowd = (s, rid, extra) => s.fleet.filter(a => a.route === rid && a.driver && !a.off).length + (extra || 0);
G.fairSetoran = function (s, a) {
  const dr = G.drv(s, a); const top = Math.round(G.expNet(a.route) * 0.56 / 10) * 10;
  if (!dr) return top;
  const D = G.DRIVERS[dr.id], Rt = G.ROUTES[a.route];
  let m = G.crowdF(G.crowd(s, a.route)) * (0.9 + s.rep / 500) * s.tarifK;
  for (const md of s.mods) if (md.demand && md.shift == null && (!md.route || md.route === a.route) && (!md.until || s.day <= md.until)) m *= md.demand;
  const gross = (Rt.base[0] + Rt.base[1] + Rt.base[2]) * m * dr.skill * (D.g || 1) * upF(a);
  const net = gross - 3 * fuelOf(s, a) * (D.f || 1);
  return clamp(Math.min(top, Math.round((net - D.need * 1.25) / 10) * 10), 60, 260);
};
/* Setoran yang belum diubah pemain ikut keramaian trayek. min: beda minimal sebelum diubah (hindari naik-turun tiap hari). */
function syncSetoran(s, min) {
  for (const a of s.fleet) {
    if (a.setoranSet || !G.drv(s, a)) continue;
    const f = G.fairSetoran(s, a); if (Math.abs(f - a.setoran) >= (min || 0)) a.setoran = f;
  }
}
G.syncSetoran = syncSetoran;
/* pemasukan pemilik sehari (perkiraan): hasil narik sendiri + setoran sopir */
G.ownerDay = s => s.fleet.reduce((t, a) => { const p = G.project(s, a); return t + (!p ? 0 : a.driver === 'self' ? p.net : p.paid); }, 0);
G.fixedDay = s => G.living(s) + s.fleet.reduce((t, a) => t + (a.loan ? a.loan.daily : 0), 0) + (s.flags.preman_bayar ? 20 * G.active(s).length : 0);
/* trayek untuk angkot baru: yang paling sepi dari angkotmu sendiri */
function bestRoute(s, except) {
  let best = null, bn = 1e9;
  for (const r of G.RIDS) {
    if (!s.routes[r] || (except && G.kuotaFull(s, r, except))) continue;
    const n = s.fleet.filter(a => a !== except && a.route === r).length; if (n < bn) { bn = n; best = r; }
  }
  return best || '05';
}
/* perkiraan tambahan pemasukan kalau beli satu angkot lagi dan diberi sopir biasa */
G.buyPreview = function (s, rid) {
  const c = JSON.parse(JSON.stringify(Object.assign({}, s, { today: Object.assign({}, s.today, { _choices: null }) })));
  const before = G.ownerDay(c);
  const a = newAngkot(c, { name: '?', cond: 70 }); a.route = rid || bestRoute(c, a);
  if (!c.drivers.ujang) c.drivers.ujang = { id: 'ujang', hired: true, loyalty: 50, skill: 1.0, days: 0, short: 0 };
  a.driver = 'ujang'; syncSetoran(c);
  return { route: a.route, n: G.crowd(c, a.route), gain: G.ownerDay(c) - before, freeDriver: G.freeDrivers(s).length > 0 };
};

/* perkiraan satu hari untuk satu angkot (tanpa acak) */
G.project = function (s, a) {
  if (!a.driver) return null;
  const Rt = G.ROUTES[a.route]; let gross = 0, st = null, mult = 1;
  if (a.driver === 'self') { mult = s.flags.kernet ? 1.08 : 1; }
  else { st = drvStyle(s, a, s.drivers[a.driver]); mult = st.sk * st.g; }
  for (let sh = 0; sh < 3; sh++) gross += Rt.base[sh] * G.demand(s, a.route, sh) * mult * condF(a) * upF(a);
  const fuel = 3 * fuelOf(s, a) * (st ? st.f : 1);
  const net = gross - fuel;
  const o = { gross: R10(gross), fuel: R10(fuel), net: R10(net) };
  if (st) { const keep = G.DRIVERS[a.driver].need; o.paid = net - a.setoran >= keep ? a.setoran : Math.max(0, R10(net - keep)); o.take = R10(net - o.paid); o.pressured = st.pressured; o.need = G.DRIVERS[a.driver].need; }
  return o;
};

/* ---------- game baru ---------- */
G.newGame = function (name, seed, retry) {
  const s = { v: 1, name: (name || 'Bayu').slice(0, 16), seed: (seed == null ? Date.now() : seed) | 0, day: 1, bab: 1,
    money: 120, rep: 50, stamina: 100, phase: 'pagi',
    debt: { sched: [{ day: 10, amt: 1200 }, { day: 20, amt: 1500 }, { day: 30, amt: 1800 }], extended: false },
    fleet: [], nextId: 1, drivers: {}, cand: [], routes: { '05': true, '09': false, '12': false },
    mods: [], flags: {}, seen: {}, adhoc: [], adN: 1, wx: { today: 'cerah', tomorrow: 'cerah' },
    streak: 0, stats: { earned: 0, best: 0 }, fuelK: 1, tarifK: 1, today: null, retry: retry || 0, over: null, lastSeen: 0 };
  const a = newAngkot(s, { name: 'Si Ijo', cond: 58, stiker: 'DOA IBU' }); a.driver = 'self';
  if (retry) { s.money += 200; s.rep += 5; }
  s.wx.tomorrow = rollWx(s);
  G.startDay(s); return s;
};

G.startDay = function (s) {
  s.phase = 'pagi';
  const per = {};
  for (const a of s.fleet) { per[a.id] = { gross: 0, fuel: 0, mult: [1, 1, 1], notes: [] }; a.off = false; }
  s.today = { per, ledger: [], evShift: -1, evDone: false, force: null, shift: 0, target: 0, narik: 0 };
  if (s.day === 2) { s.today.evShift = 0; s.today.force = 'anak_sekolah'; }
  else if (s.day > 2 && rng(s) < 0.62) s.today.evShift = Math.floor(rng(s) * 3);
  if (s.bab >= 2 && s.cand.length < 2 && rng(s) < 0.4 / (1 + (s.flags.quits || 0))) {
    const nx = G.CAND_ORDER.find(id => !s.drivers[id] && !s.cand.includes(id) && (id !== 'tini' || s.fleet.length >= 3));
    if (nx) s.cand.push(nx);
  }
  s.mods = s.mods.filter(m => !m.until || s.day <= m.until);
  syncSetoran(s, 20);
};

G.depart = function (s) {
  let exp = 0;
  for (const a of s.fleet) { const p = G.project(s, a); if (!p) continue; exp += a.driver === 'self' ? p.net : p.paid; }
  s.today.target = Math.max(50, Math.round(exp * 0.85 / 10) * 10);
  s.phase = 'siang'; s.today.shift = 0;
};

/* ---------- kejadian ---------- */
function ctxOf(s, a) {
  const self = a.driver === 'self'; const dr = self ? null : s.drivers[a.driver];
  return { a, self, dr, D: dr ? G.DRIVERS[dr.id] : null, who: self ? 'Kamu' : G.DRIVERS[dr.id].name };
}
const say = (c, selfT, drvT) => c.self ? selfT : `${c.who} menelepon. “${drvT}”`;
function tmul(s, c, sh, m) { s.today.per[c.a.id].mult[sh] *= m; }

const EVENTS = [
  { id: 'anak_sekolah', w: 2, title: 'Ongkosnya kurang',
    text: (s, c) => say(c, 'Tiga anak SD naik dari depan gang. Uang mereka cuma cukup untuk satu orang.', 'Bos, ada tiga anak SD, duitnya cuma buat satu. Gimana?'),
    choices: (s, c, sh) => [
      { label: 'Angkut saja', hint: 'Nama baik naik', run: () => { rep(s, 3); return 'Mereka turun di depan sekolah sambil teriak, “Makasih, Mang!” Besok ibunya pasti dengar.'; } },
      { label: 'Tagih penuh', hint: '+Rp 6 rb, nama baik turun', run: () => { cash(s, 6, 'Lain-lain'); rep(s, -2); return 'Dua anak turun lagi dan jalan kaki. Penumpang lain melirik.'; } }] },
  { id: 'ban_bocor', w: 3, title: 'Ban bocor',
    text: (s, c) => say(c, `Ban kiri belakang ${c.a.name} kempes kena paku di depan pasar.`, `Bos, ban ${c.a.name} kena paku di depan pasar.`),
    choices: (s, c, sh) => [
      { label: 'Tambal di pinggir jalan', hint: 'Rp 25 rb, rit berkurang', ok: s.money >= 25, run: () => { cash(s, -25, 'Perbaikan'); tmul(s, c, sh, 0.7); return 'Setengah jam hilang, tapi ban aman lagi.'; } },
      { label: 'Ganti ban baru', hint: 'Rp 160 rb, kondisi +8', ok: s.money >= 160, run: () => { cash(s, -160, 'Perbaikan'); cond(c.a, 8); tmul(s, c, sh, 0.85); return 'Ban baru terpasang. Jalannya terasa lebih mantap.'; } },
      { label: 'Paksa jalan pelan-pelan', hint: 'Gratis, merusak velg', run: () => { cond(c.a, -9); tmul(s, c, sh, 0.6); return 'Sampai juga ke terminal, tapi velgnya peyang.'; } }] },
  { id: 'razia', w: 2, ok: s => s.day >= 4 && !hasMod(s, 'kir'), title: 'Razia gabungan',
    text: (s, c) => say(c, `Razia di perempatan. Petugas memeriksa buku KIR ${c.a.name}: masa berlakunya sudah lewat.`, `Bos, kena razia. KIR ${c.a.name} mati katanya.`),
    choices: (s, c, sh) => [
      { label: 'Urus KIR resmi', hint: 'Rp 180 rb, aman 25 hari', ok: s.money >= 180, run: () => { cash(s, -180, 'Surat & denda'); rep(s, 3); addMod(s, { id: 'kir', until: s.day + 25 }); if (s.bab === 3 && c.a.cond >= G.B3.kirCond) c.a.kir = true; tmul(s, c, sh, 0.6); return 'Antre lama di Dishub, tapi sekarang surat lengkap. Sopir lain mulai segan.'; } },
      { label: 'Titip sidang ke oknum', hint: 'Rp 60 rb, nama baik turun', ok: s.money >= 60, run: () => { cash(s, -60, 'Surat & denda'); rep(s, -3); return 'Urusan beres dalam lima menit. Minggu depan dia pasti menunggu di tempat yang sama.'; } },
      { label: 'Terima ditilang', hint: 'Rp 100 rb', run: () => { cash(s, -100, 'Surat & denda'); tmul(s, c, sh, 0.8); return 'Slip biru di tangan. KIR tetap mati.'; } }] },
  { id: 'dompet', w: 2, title: 'Dompet tertinggal',
    text: (s, c) => say(c, 'Ada dompet tertinggal di jok belakang. Isinya Rp 400 ribu dan sebuah KTP.', 'Bos, ada dompet ketinggalan. Isinya empat ratus ribu sama KTP.'),
    choices: (s, c, sh) => [
      { label: 'Antar ke alamat di KTP', hint: 'Rit berkurang, nama baik naik', run: () => { rep(s, 6); tmul(s, c, sh, 0.8); if (rng(s) < 0.45) { cash(s, 150, 'Lain-lain'); return 'Pemiliknya ternyata juragan toko kain. Dia memaksa kasih Rp 150 ribu dan janji carter kalau ada kondangan.'; } return 'Pemiliknya ibu penjual gorengan. Dia hampir menangis. Kamu dibekali sekantong bala-bala.'; } },
      { label: 'Ambil uangnya', hint: '+Rp 400 rb, nama baik anjlok', run: () => { cash(s, 400, 'Lain-lain'); rep(s, -8); return 'Uang masuk saku. Sorenya kabar dompet hilang sudah sampai ke warung terminal.'; } }] },
  { id: 'banjir', w: 6, ok: s => s.wx.today === 'hujan', title: 'Jalan tergenang',
    text: (s, c) => say(c, 'Hujan deras. Jalan depan pasar tergenang selutut dan angkot lain mulai putar balik.', 'Bos, depan pasar banjir selutut. Terobos jangan?'),
    choices: (s, c, sh) => [
      { label: 'Putar lewat jalan tikus', hint: 'Bensin tambah Rp 20 rb', run: () => { cash(s, -20, 'Bensin'); return 'Lebih jauh, tapi penumpang sampai dengan kaki kering.'; } },
      { label: 'Terobos', hint: 'Untung besar atau mogok', run: () => { if (rng(s) < 0.5) { tmul(s, c, sh, 1.4); return 'Lolos! Penumpang yang terjebak hujan berebut naik.'; } cond(c.a, -15); cash(s, -120, 'Perbaikan'); tmul(s, c, sh, 0.2); return `${c.a.name} mogok di tengah genangan. Busi basah, didorong ramai-ramai, lalu masuk bengkel.`; } },
      { label: 'Pulang dulu', hint: 'Rit ini hampir kosong', run: () => { tmul(s, c, sh, 0.35); return 'Kamu menunggu hujan reda di warung. Aman, tapi sepi pemasukan.'; } }] },
  { id: 'preman', w: 3, ok: s => s.day >= 5 && !s.flags.preman_beres && !hasMod(s, 'preman_cd'), title: 'Uang keamanan',
    text: (s, c) => 'Dua orang berdiri di pintu keluar terminal. “Uang keamanan, Bos. Dua puluh ribu sehari per mobil. Biar aman.”',
    choices: (s, c, sh) => [
      { label: 'Bayar', hint: 'Rp 20 rb per angkot tiap hari', run: () => { s.flags.preman_bayar = true; addMod(s, { id: 'preman_cd', until: s.day + 12 }); return 'Mereka mencatat platmu di buku kecil. Mulai hari ini kamu “aman”.'; } },
      { label: 'Tolak baik-baik', hint: 'Mereka bisa balas', run: () => { addMod(s, { id: 'preman_cd', until: s.day + 4 }); if (rng(s) < 0.35) { cash(s, -90, 'Perbaikan'); return 'Malamnya kaca spion pecah. Tidak ada saksi, tentu saja.'; } return 'Mereka meludah ke samping, lalu minggir. Untuk hari ini.'; } },
      { label: 'Lapor paguyuban sopir', hint: s.rep >= 60 ? 'Nama baikmu cukup' : 'Butuh nama baik 60', run: () => { if (s.rep >= 60) { s.flags.preman_beres = true; s.flags.preman_bayar = false; rep(s, 4); return 'Ketua paguyuban turun tangan bersama dua puluh sopir. Dua orang itu tidak kelihatan lagi.'; } addMod(s, { id: 'preman_cd', until: s.day + 4 }); return 'Pengurus paguyuban mengangkat bahu. “Kamu anak baru. Buktikan dulu di jalan.”'; } }] },
  { id: 'kasbon', w: 3, ok: (s, c) => !c.self, title: 'Minta kasbon',
    text: (s, c) => `${c.who} menunggu di garasi sebelum berangkat. “Bos, anak saya panas tinggi dari semalam. Boleh kasbon dua ratus ribu?”`,
    choices: (s, c, sh) => [
      { label: 'Kasih penuh', hint: 'Rp 200 rb, makin setia', ok: s.money >= 200, run: () => { cash(s, -200, 'Kasbon sopir'); c.dr.loyalty = clamp(c.dr.loyalty + 12, 0, 100); return `${c.who} menjabat tanganmu lama sekali. “Saya nggak akan lupa, Bos.”`; } },
      { label: 'Kasih separuh', hint: 'Rp 100 rb', ok: s.money >= 100, run: () => { cash(s, -100, 'Kasbon sopir'); c.dr.loyalty = clamp(c.dr.loyalty + 5, 0, 100); return '“Segini juga sudah nolong, Bos. Nuhun.”'; } },
      { label: 'Tolak', hint: 'Kesetiaan turun', run: () => { c.dr.loyalty = clamp(c.dr.loyalty - 8, 0, 100); return `${c.who} mengangguk pelan dan naik ke angkot tanpa bicara.`; } }] },
  { id: 'carter', w: 3, title: 'Tawaran carter',
    text: (s, c) => say(c, `Rombongan ibu pengajian mau carter ${c.a.name} ke kondangan sekarang juga. Rp 250 ribu, bensin mereka tanggung.`, `Bos, ada ibu-ibu pengajian mau carter ${c.a.name} ke kondangan. Dua ratus lima puluh, bensin dari mereka.`),
    choices: (s, c, sh) => [
      { label: 'Terima', hint: '+Rp 250 rb, trayek ditinggal', run: () => { cash(s, 250, 'Carter'); rep(s, 2); const P = s.today.per[c.a.id]; P.mult[sh] *= 0.1; if (sh < 2) P.mult[sh + 1] *= 0.6; return 'Sepanjang jalan mereka salawatan. Pulangnya kamu dibekali nasi kotak.'; } },
      { label: 'Tolak, tetap di trayek', hint: 'Penumpang langganan tidak terlantar', run: () => { rep(s, 1); return 'Kamu menunjuk angkot kosong di belakang. Langgananmu tetap terangkut.'; } }] },
  { id: 'serobot', w: 3, ok: s => s.day >= 3 && !hasMod(s, 'serobot_cd'), title: 'Diserobot angkot biru',
    text: (s, c) => say(c, 'Angkot biru milik Haji Sobari menyalip dan menyerobot penumpang di halte pasar. Sopirnya nyengir lewat spion.', 'Bos, anak buah Haji Sobari nyerobot terus di halte pasar!'),
    choices: (s, c, sh) => [
      { label: 'Balas kebut', hint: 'Bisa untung, bisa serempet', run: () => { if (rng(s) < 0.55) { tmul(s, c, sh, 1.3); return 'Kamu menyalip di tikungan dan sampai lebih dulu di halte berikutnya. Penumpang penuh.'; } cond(c.a, -12); cash(s, -80, 'Perbaikan'); rep(s, -2); return 'Serempetan. Bemper penyok, penumpang turun sambil mengomel.'; } },
      { label: 'Biarkan', hint: 'Rit ini agak sepi', run: () => { tmul(s, c, sh, 0.8); return 'Kamu menahan diri. Rezeki tidak ke mana, kata Bapak dulu.'; } },
      { label: 'Catat platnya, lapor paguyuban', hint: s.rep >= 60 ? 'Nama baikmu cukup' : 'Butuh nama baik 60', run: () => { tmul(s, c, sh, 0.85); if (s.rep >= 60) { addMod(s, { id: 'serobot_cd', until: s.day + 10 }); rep(s, 2); return 'Paguyuban menegur mandor Haji Sobari. Untuk sementara angkot biru jaga jarak.'; } return 'Laporanmu dicatat di buku besar, lalu bukunya ditutup.'; } }] },
  { id: 'melahirkan', w: 1, ok: s => s.day >= 6 && !s.flags.bayi, title: 'Penumpang darurat',
    text: (s, c) => say(c, 'Seorang ibu hamil besar naik dari pasar. Belum sampai perempatan, ketubannya pecah.', 'Bos! Ada ibu mau melahirkan di angkot! Saya harus gimana?!'),
    choices: (s, c, sh) => [
      { label: 'Ngebut ke puskesmas', hint: 'Rit ini hilang', run: () => { s.flags.bayi = true; rep(s, 10); tmul(s, c, sh, 0.1); addMod(s, { id: 'viral', demand: 1.12, until: s.day + 4 }); return `Bayinya lahir selamat, sepuluh menit setelah sampai. Fotonya ramai di grup warga: “Sopir ${c.a.name} pahlawan pasar.”`; } },
      { label: 'Carikan ojek, lanjut narik', hint: 'Nama baik turun', run: () => { s.flags.bayi = true; rep(s, -4); return 'Ibu itu dibonceng ojek. Penumpang lain diam sepanjang jalan.'; } }] },
  { id: 'iklan', w: 2, ok: s => !s.flags.iklan, title: 'Stiker iklan',
    text: (s, c) => 'Pemilik toko kelontong “Sumber Rejeki” mau pasang stiker iklan di kaca belakang angkotmu. Rp 120 ribu, dibayar di muka.',
    choices: (s, c, sh) => [
      { label: 'Pasang', hint: '+Rp 120 rb', run: () => { s.flags.iklan = true; cash(s, 120, 'Lain-lain'); c.a.stiker = 'SUMBER REJEKI'; return 'Kaca belakang sekarang bertuliskan SUMBER REJEKI – GROSIR & ECERAN.'; } },
      { label: 'Tolak', hint: 'Kaca belakang tetap milikmu', run: () => { s.flags.iklan = true; return 'Kamu bilang kaca belakang itu tempat stiker pilihan Bapak.'; } }] },
  { id: 'turis', w: 2, ok: (s, c) => s.day >= 3, title: 'Turis nyasar',
    text: (s, c) => say(c, 'Dua turis ransel kebingungan membaca papan trayek. Mereka mencari stasiun.', 'Bos, ada bule dua nyasar nyari stasiun.'),
    choices: (s, c, sh) => [
      { label: 'Antar sampai stasiun', hint: 'Keluar trayek sebentar', run: () => { cash(s, 60, 'Lain-lain'); rep(s, 2); tmul(s, c, sh, 0.9); return 'Mereka kasih tip Rp 60 ribu dan minta foto bareng di depan angkot.'; } },
      { label: 'Tunjukkan arahnya saja', hint: 'Tetap di trayek', run: () => { rep(s, 1); return 'Kamu gambar peta di balik karcis parkir. Mereka mengacungkan jempol.'; } }] },
  { id: 'lubang', w: 3, title: 'Lubang jalan',
    text: (s, c) => say(c, `Jalan berlubang parah sehabis hujan. ${c.a.name} menghantam satu yang dalam. Ada bunyi “gluduk” dari kolong.`, `Bos, ${c.a.name} ngehantam lubang gede. Kolongnya bunyi.`),
    choices: (s, c, sh) => { cond(c.a, -8); return [
      { label: 'Cek ke bengkel sekarang', hint: 'Rp 70 rb', ok: s.money >= 70, run: () => { cash(s, -70, 'Perbaikan'); cond(c.a, 10); tmul(s, c, sh, 0.8); return 'Teh Rina mengencangkan baut as roda. “Untung langsung ke sini.”'; } },
      { label: 'Lanjut narik', hint: 'Bisa tambah parah', run: () => { if (rng(s) < 0.3) { cond(c.a, -10); return 'Bunyinya makin keras menjelang sore. Kondisi turun lagi.'; } return 'Bunyinya hilang sendiri. Mungkin.'; } }]; } },
  { id: 'sakit', w: 2, ok: (s, c) => !c.self, title: 'Sopir sakit',
    text: (s, c) => `${c.who} mengirim pesan suara sambil batuk. “Bos, masuk angin berat. Izin dulu hari ini.”`,
    choices: (s, c, sh) => [
      { label: 'Pakai sopir tembak', hint: 'Setoran seadanya, mobil lebih capek', run: () => { const P = s.today.per[c.a.id]; P.mult = P.mult.map(m => m * 0.7); P.tembak = true; return 'Sopir tembak datang sambil mengunyah gorengan. Semoga mobilnya pulang utuh.'; } },
      { label: 'Angkot libur', hint: 'Tidak ada setoran hari ini', run: () => { c.a.off = true; c.dr.loyalty = clamp(c.dr.loyalty + 3, 0, 100); return `${c.a.name} istirahat di garasi. ${c.who} kirim stiker terima kasih.`; } }] },
  { id: 'rina_mesin', w: 2, ok: (s, c) => s.day >= 8 && !c.a.ups.mesin && !s.flags.rina_tawar, title: 'Tawaran Teh Rina',
    text: (s, c) => `Teh Rina melambai dari bengkel. “Ada karburator bekas masih bagus buat ${c.a.name}. Dua ratus ribu, pasang gratis. Irit bensin.”`,
    choices: (s, c, sh) => [
      { label: 'Beli dan pasang', hint: 'Rp 200 rb, bensin −12%', ok: s.money >= 200, run: () => { s.flags.rina_tawar = true; cash(s, -200, 'Bengkel'); c.a.ups.mesin = true; return 'Suara mesin jadi lebih halus. Jarum bensin turun lebih pelan.'; } },
      { label: 'Nanti dulu', hint: 'Masih bisa beli di bengkel, harga normal', run: () => { s.flags.rina_tawar = true; return '“Ya sudah. Barangnya keburu laku lho.”'; } }] },
  { id: 'pasar_malam', w: 2, ok: s => s.day >= 4 && !hasMod(s, 'pasar_malam') && !hasMod(s, 'pm_cd'), title: 'Pasar malam buka',
    text: () => 'Spanduk baru dipasang di lapangan dekat Pasar Baru: pasar malam buka lima hari. Sore sampai malam, trayek 05 bakal ramai.',
    choices: (s) => [{ label: 'Siap-siap narik sore', hint: 'Trayek 05 sore +30% selama 5 hari', run: () => { addMod(s, { id: 'pasar_malam', route: '05', shift: 2, demand: 1.3, until: s.day + 5 }); addMod(s, { id: 'pm_cd', until: s.day + 20 }); return 'Bau jagung bakar sudah tercium dari terminal.'; } }] },
  { id: 'bbm', w: 2, ok: s => s.day >= 12 && !s.flags.bbm, title: 'Harga BBM naik',
    text: () => 'Pengumuman di radio: harga BBM naik mulai tengah malam. Sopir-sopir di terminal ribut soal tarif.',
    choices: (s) => [
      { label: 'Naikkan tarif seribu', hint: 'Pendapatan +8%, nama baik turun', run: () => { s.flags.bbm = true; s.fuelK = 1.15; s.tarifK = 1.08; rep(s, -4); return 'Kamu tempel kertas “TARIF NAIK Rp 1.000” di kaca. Penumpang menggerutu, tapi tetap naik.'; } },
      { label: 'Tahan tarif lama', hint: 'Bensin lebih mahal, nama baik naik', run: () => { s.flags.bbm = true; s.fuelK = 1.15; rep(s, 5); return 'Angkotmu jadi yang paling dicari di terminal. Dompetmu yang paling tipis.'; } }] },
  { id: 'kernet', w: 4, ok: (s, c) => s.bab === 1 && s.day >= 5 && !s.flags.kernet_tanya && c.self, title: 'Anak muda di terminal',
    text: () => 'Seorang anak kurus mendekat sambil menenteng lap. “Kang, saya Jajang. Butuh kernet? Nggak usah digaji. Makan siang aja.”',
    choices: (s) => [
      { label: 'Terima jadi kernet', hint: 'Rp 10 rb sehari, pendapatan +8%', run: () => { s.flags.kernet_tanya = true; s.flags.kernet = true; return 'Jajang langsung gelantungan di pintu. “Pasar, pasar, pasar! Kosong, Bu, kosong!”'; } },
      { label: 'Belum bisa', hint: 'Mungkin lain waktu', run: () => { s.flags.kernet_tanya = true; return '“Nggak apa-apa, Kang. Saya di sini terus kok.”'; } }] },
  /* --- Bab 3 --- */
  { id: 'b3_gratis', w: 4, ok: (s, c) => G.b3on(s) && c.a.route === '05' && !hasMod(s, 'gratis_cd'), title: 'Angkot biru gratis',
    text: (s, c) => say(c, 'Angkot biru Haji Sobari memasang kertas di kaca: “GRATIS SAMPAI PASAR”. Penumpang di halte langsung pindah antre.', 'Bos, angkot biru gratisin penumpang ke pasar! Halte kosong buat kita.'),
    choices: (s, c, sh) => [
      { label: 'Ikut gratiskan rit ini', hint: 'Rit ini hampir kosong, petisi +40', run: () => { addMod(s, { id: 'gratis_cd', until: s.day + 5 }); tmul(s, c, sh, 0.3); s.b3.petisi += 40; rep(s, 2); return 'Ibu-ibu pasar tertawa. “Dua-duanya gratis, ya naik yang langganan.” Map petisi penuh satu halaman.'; } },
      { label: 'Biarkan, tetap tarik ongkos', hint: 'Rit ini sepi', run: () => { addMod(s, { id: 'gratis_cd', until: s.day + 5 }); tmul(s, c, sh, 0.7); return 'Yang naik cuma langganan lama. Mereka bayar sambil menggerutu soal angkot biru.'; } }] },
  { id: 'b3_pengajian', w: 3, ok: s => G.b3on(s) && !s.flags.b3_ngaji, title: 'Pengajian akbar',
    text: (s, c) => say(c, 'Ketua majelis taklim pasar menawarkan bantuan: jemaahnya mau tanda tangan petisi, asal diantar ke pengajian akbar hari ini. Gratis.', 'Bos, ibu-ibu majelis taklim mau tanda tangan petisi semua. Syaratnya diantar ke pengajian, gratis.'),
    choices: (s, c, sh) => [
      { label: 'Antar gratis', hint: 'Rit ini setengah, petisi +80', run: () => { s.flags.b3_ngaji = true; tmul(s, c, sh, 0.5); s.b3.petisi += 80; rep(s, 2); return 'Delapan puluh tanda tangan, lengkap dengan nomor KTP. Ada yang menambahkan doa di pinggir kertas.'; } },
      { label: 'Tidak bisa sekarang', hint: 'Tetap di trayek', run: () => { s.flags.b3_ngaji = true; return '“Ya sudah. Mungkin angkot biru mau.”'; } }] },
  { id: 'b3_bajak', w: 3, ok: (s, c) => G.b3on(s) && !c.self && !hasMod(s, 'bajak_cd'), title: 'Sopirmu dibajak',
    text: (s, c) => `${c.who} menunjukkan pesan dari Kohar. “Pindah ke Pak Haji. Setoran lebih ringan dua puluh ribu. Mulai besok.”`,
    choices: (s, c, sh) => [
      { label: 'Turunkan setorannya Rp 20 rb', hint: 'Setoran turun, makin setia', run: () => { addMod(s, { id: 'bajak_cd', until: s.day + 6 }); c.a.setoran = clamp(c.a.setoran - 20, 60, 260); c.a.setoranSet = true; c.dr.loyalty = clamp(c.dr.loyalty + 10, 0, 100); return `${c.who} menghapus pesan itu di depanmu. “Saya di sini saja, Bos.”`; } },
      { label: 'Percayakan padanya', hint: c.dr.loyalty >= 55 ? 'Dia cukup setia' : 'Kesetiaannya rendah', run: () => { addMod(s, { id: 'bajak_cd', until: s.day + 6 }); if (c.dr.loyalty >= 55) { c.dr.loyalty = clamp(c.dr.loyalty + 4, 0, 100); return '“Pak Haji pecat Mang Ujang karena ngopi. Saya nggak mau kerja di tempat begitu.”'; } c.dr.loyalty = clamp(c.dr.loyalty - 12, 0, 100); return `${c.who} diam lama sebelum menjawab. “Saya pikir-pikir dulu, Bos.”`; } }] },
  { id: 'b3_wartawan', w: 2, ok: s => G.b3on(s) && !s.flags.b3_koran, title: 'Wartawan koran',
    text: () => 'Wartawan “Kabar Cibening” mencegatmu di terminal. Dia sedang menulis soal sidang trayek 05 dan mau dengar dari pihakmu.',
    choices: (s) => [
      { label: 'Cerita soal Bapak, apa adanya', hint: 'Nama baik naik, petisi bertambah', run: () => { s.flags.b3_koran = true; rep(s, 4); s.b3.petisi += 30; return 'Besoknya fotomu di samping Si Ijo masuk halaman tiga. Judulnya: “Anak Sopir Melawan.”'; } },
      { label: '“Tidak ada komentar.”', hint: 'Aman', run: () => { s.flags.b3_koran = true; return 'Wartawan itu beralih ke Kohar. Kamu tidak mau tahu apa yang dia tulis.'; } }] },
  { id: 'b3_oknum', w: 2, ok: s => G.b3on(s) && G.d3(s) >= 8 && !s.flags.b3_oknum, title: 'Jalur cepat',
    text: () => 'Seorang pria berseragam cokelat duduk di sampingmu di warung. “Sidangnya bisa saya bantu. Satu setengah juta. Dijamin lancar.”',
    choices: (s) => [
      { label: 'Tolak', hint: 'Nama baik naik', run: () => { s.flags.b3_oknum = true; rep(s, 2); return 'Dia mengangkat bahu dan membayar kopinya sendiri. Untuk pertama kalinya.'; } },
      { label: 'Bayar', hint: 'Rp 1,5 jt. Bisa ketahuan', ok: s.money >= 1500, run: () => { s.flags.b3_oknum = true; s.b3.suap = true; cash(s, -1500, 'Lain-lain'); return 'Amplop berpindah tangan di bawah meja. Dia tidak memberi kuitansi.'; } }] }
];
G.EVENTS = EVENTS;

G.rollEvent = function (s, sh) {
  const T = s.today;
  if (T.evDone || T.evShift !== sh) return null;
  T.evDone = true;
  const act = G.active(s); if (!act.length) return null;
  const a = act[Math.floor(rng(s) * act.length)]; const c = ctxOf(s, a);
  let pool = EVENTS.filter(e => !e.ok || e.ok(s, c));
  if (T.force) pool = EVENTS.filter(e => e.id === T.force);
  const p2 = pool.filter(e => e.id !== s.lastEv); if (p2.length) pool = p2;
  if (!pool.length) return null;
  let tot = pool.reduce((t, e) => t + e.w, 0), r = rng(s) * tot, ev = pool[0];
  for (const e of pool) { r -= e.w; if (r <= 0) { ev = e; break; } }
  s.lastEv = ev.id;
  const choices = ev.choices(s, c, sh);
  T.ev = { id: ev.id, aid: a.id, sh };
  T._choices = choices;
  return { id: ev.id, title: ev.title, text: ev.text(s, c), angkot: a.name,
    choices: choices.map(ch => ({ label: ch.label, hint: ch.hint, ok: ch.ok !== false })) };
};
G.resolveEvent = function (s, idx) {
  const ch = s.today._choices[idx]; const out = ch.run();
  s.today._choices = null; s.today.ev = null; return out;
};

/* ---------- satu rit (shift) ---------- */
G.SELF_MODES = {
  ngebut: { name: 'Ngebut', g: 1.3, st: -30, w: 1.7, f: 1.1, desc: 'Pendapatan +30%. Boros tenaga dan mesin, bisa kena tilang.' },
  normal: { name: 'Narik biasa', g: 1.0, st: -20, w: 1.0, f: 1.0, desc: 'Aman dan stabil.' },
  ngetem: { name: 'Ngetem', g: 0.85, st: -11, w: 0.6, f: 0.55, desc: 'Tunggu sampai penuh. Irit tenaga dan bensin, hasilnya untung-untungan.' },
  istirahat: { name: 'Istirahat', g: 0, st: 35, w: 0, f: 0, desc: 'Tenaga +35. Tidak ada pemasukan.' }
};
/* ---------- nyetir sendiri (mini-game) ----------
   Mesin hanya menyiapkan isi jalan (spec) dan mengubah hasilnya jadi uang. Fisika dan gambar ada di drive.js. */
G.DRIVE = { dur: 60, par: 12.5, spawn: 24, seats: 12, place: 14000, vMax: 340 };
G.driveSpec = function (s, sh) {
  const a = s.fleet.find(x => x.driver === 'self' && !x.off); if (!a) return null;
  const Rt = G.ROUTES[a.route], P = s.today.per[a.id], D = G.DRIVE;
  const dm = G.demand(s, a.route, sh);
  const fare = Rt.base[sh] * condF(a) * upF(a) * P.mult[sh] * (s.flags.kernet ? 1.08 : 1) / D.par;
  const n = Math.max(6, Math.round(D.spawn * dm));
  const groups = []; let left = n;
  while (left > 0) { const k = Math.min(left, 1 + Math.floor(rng(s) * 3)); left -= k; groups.push({ d: 500 + rng(s) * (D.place - 500), n: k }); }
  groups.sort((x, y) => x.d - y.d);
  const traffic = [], nm = sh === 1 ? 14 : 22;
  for (let i = 0; i < nm; i++) {
    const roll = rng(s), kind = roll < 0.5 ? 'motor' : roll < 0.78 ? 'mobil' : roll < 0.9 ? 'pikap' : 'truk';
    const v = kind === 'truk' ? 110 + rng(s) * 50 : kind === 'motor' ? 140 + rng(s) * 120 : 160 + rng(s) * 90;
    traffic.push({ d: 300 + rng(s) * D.place * 0.9, lane: kind === 'truk' ? 2 : rng(s) < 0.2 ? 0 : rng(s) < 0.55 ? 1 : 2, v, kind });
  }
  const biru = [], nb = hasMod(s, 'biru') ? 7 : s.bab >= 2 ? 4 : 2;
  for (let i = 0; i < nb; i++) biru.push({ d: 400 + rng(s) * D.place * 0.8, v: 150 + rng(s) * 60 });
  const wet = s.wx.today === 'hujan', potholes = [];
  for (let i = 0, np = wet ? 18 : 10; i < np; i++) potholes.push({ d: 600 + rng(s) * D.place, x: 84 + rng(s) * 192 });
  const steal = hasMod(s, 'biru') ? 2 : 1;
  const police = rng(s) < 0.6 ? [{ d: 2500 + rng(s) * 7000 }] : [];
  const mogokAt = a.cond < 40 && rng(s) < (40 - a.cond) * 0.015 ? 15 + rng(s) * 35 : null;
  const ends = Rt.name.split(' – ');
  return { dur: D.dur, seats: D.seats, vMax: D.vMax, fare, groups, traffic, biru, steal, potholes, police, mogokAt, wet, sh,
    wobble: s.stamina < 25 ? (25 - s.stamina) / 25 : 0, route: a.route, from: ends[0], to: ends[ends.length - 1],
    name: a.name, color: a.color, seed: Math.floor(rng(s) * 2147483647), tarif: Math.round(fare) };
};
function driveShift(s, a, sh, D, res, mandor) {
  const Rt = G.ROUTES[a.route], P = s.today.per[a.id];
  s.stamina = clamp(s.stamina - 20 - (D.avgV > 0.85 ? 6 : 0), 0, 100);
  const frac = Math.min(1, D.t / G.DRIVE.dur);
  const gross = R10(Math.max(0, D.fares)), fuel = R10(fuelOf(s, a) * (0.6 + 0.5 * D.avgV) * frac);
  cond(a, -1.1 * Rt.wear * (0.6 + 0.6 * D.avgV) * mandor - 3 * D.hits - 1 * ((D.potholes || 0) + (D.skids || 0)));
  const n = [`${D.riders} penumpang.`];
  if (D.mogok) { cond(a, 8); cash(s, -150, 'Perbaikan'); res.down = true; n.push(`${a.name} mogok, derek Rp 150 rb.`); }
  if (D.severe) { cash(s, -50 * D.severe, 'Perbaikan'); rep(s, -D.severe); n.push(`Nabrak ${D.severe}×, ganti rugi ${G.fmt(50 * D.severe)}.`); }
  else if (D.hits) n.push(`Nyerempet ${D.hits}×.`);
  if (D.skids) n.push(`Kebablasan di persimpangan ${D.skids}×.`);
  if (D.tilang) { cash(s, -75 * D.tilang, 'Surat & denda'); n.push(D.merah ? `Terobos lampu merah, ditilang ${G.fmt(75 * D.tilang)}.` : `Ditilang ${G.fmt(75 * D.tilang)}.`); }
  if (D.missed) { rep(s, -0.4 * D.missed); n.push(`${D.missed} penumpang kelewatan turun.`); }
  if (D.stolen) n.push(`${D.stolen} diserobot angkot biru.`);
  res.gross = gross; res.fuel = fuel; res.note = n.join(' '); res.drive = D;
  P.gross += gross; P.fuel += fuel;
  cash(s, gross, 'Narik sendiri'); cash(s, -fuel, 'Bensin'); s.today.narik += gross - fuel;
}
G.runShift = function (s, sh, selfMode, drive) {
  const out = { shift: sh, results: [] };
  const mandor = s.drivers.ujang && s.drivers.ujang.hired && s.drivers.ujang.perk ? 0.88 : 1;
  for (const a of s.fleet) {
    const P = s.today.per[a.id];
    if (!a.driver || a.off) { out.results.push({ id: a.id, idle: true }); continue; }
    const Rt = G.ROUTES[a.route]; const res = { id: a.id, gross: 0, fuel: 0, note: '' };
    let g = 1, w = 1, f = 1, risk = 0, sk = 1, vary = 0; const self = a.driver === 'self';
    if (self && selfMode === 'setir' && drive) { res.mode = 'setir'; driveShift(s, a, sh, drive, res, mandor); out.results.push(res); continue; }
    if (self) {
      let mode = selfMode || 'normal';
      if (mode === 'ngebut' && s.stamina < 20) mode = 'normal';
      const M = G.SELF_MODES[mode]; res.mode = mode;
      s.stamina = clamp(s.stamina + M.st, 0, 100);
      if (mode === 'istirahat') { res.note = 'Istirahat di warung. Tenaga pulih.'; res.rest = true; out.results.push(res); continue; }
      g = M.g; w = M.w; f = M.f;
      if (mode === 'ngetem') { vary = 0.4; if (sh === 0) g *= 1.12; }
      if (mode === 'ngebut') risk = 0.09;
      if (s.stamina < 15) { g *= 0.85; risk += 0.05; res.note = 'Kamu mengantuk di belakang setir. '; }
      if (s.flags.kernet) g *= 1.08;
    } else {
      const st = drvStyle(s, a, s.drivers[a.driver]); g = st.g; w = st.w; f = st.f; risk = st.risk; sk = st.sk; vary = st.vary; P.pressured = st.pressured;
      if (P.tembak) { w *= 1.5; sk = 0.9; }
    }
    if (a.cond < 40 && rng(s) < (40 - a.cond) * 0.015) {
      cond(a, 8); cash(s, -150, 'Perbaikan'); res.note += `${a.name} mogok di jalan. Derek dan bengkel Rp 150 rb.`; res.down = true;
      out.results.push(res); continue;
    }
    const spread = 0.14 + vary;
    let gross = Rt.base[sh] * G.demand(s, a.route, sh) * sk * g * condF(a) * upF(a) * P.mult[sh] * (1 - spread + 2 * spread * rng(s));
    let fuel = fuelOf(s, a) * f;
    if (risk && rng(s) < risk) {
      if (rng(s) < 0.65) { cash(s, -75, 'Surat & denda'); res.note += 'Kena tilang karena ngebut: Rp 75 rb. '; }
      else { cond(a, -12); cash(s, -100, 'Perbaikan'); rep(s, -2); res.note += 'Nyerempet gerobak sayur, ganti rugi Rp 100 rb. '; }
    }
    cond(a, -1.1 * Rt.wear * w * mandor);
    gross = R10(gross); fuel = R10(fuel);
    res.gross = gross; res.fuel = fuel; P.gross += gross; P.fuel += fuel;
    if (self) { cash(s, gross, 'Narik sendiri'); cash(s, -fuel, 'Bensin'); s.today.narik += gross - fuel; }
    out.results.push(res);
  }
  s.today.shift = sh + 1;
  return out;
};

/* ---------- tutup hari ---------- */
function adhoc(s, when, lines, extra) { s.adhoc.push(Object.assign({ id: 'x' + (s.adN++), when, lines }, extra || {})); }
G.endDay = function (s) {
  const T = s.today; s.phase = 'malam'; const rows = [];
  for (const a of s.fleet) {
    const dr = G.drv(s, a); if (!dr) continue; const P = T.per[a.id]; const D = G.DRIVERS[dr.id];
    if (a.off) { rows.push({ id: a.id, name: a.name, who: D.name, off: true }); dr.short = 0; continue; }
    const net = P.gross - P.fuel;
    const keep = D.need;
    let paid = net - a.setoran >= keep ? a.setoran : Math.max(0, R10(net - keep));
    let nilep = 0;
    if (D.licin && !dr.perk && !(dr.watch >= s.day) && rng(s) < 0.3) { nilep = Math.min(paid, 20 + Math.floor(rng(s) * 40)); paid -= nilep; }
    if (P.tembak) paid = R10(paid * 0.85);
    const take = net - paid; const short = a.setoran - paid;
    cash(s, paid, 'Setoran sopir'); T.narik += paid;
    dr.days++; if (D.grow) dr.skill = Math.min(D.cap, dr.skill + D.grow);
    const r = take / D.need; let d = r >= 1.3 ? 2 : r >= 1 ? 1 : r >= 0.8 ? -1 : -4;
    if (a.cond < 40) d -= 1; if (P.pressured) { d -= 2; rep(s, -0.34); } if (short > 0) d -= 2; if (P.tembak) d = 0;
    dr.loyalty = clamp(dr.loyalty + d, 0, 100);
    dr.short = short > 0 ? (dr.short || 0) + 1 : 0;
    rows.push({ id: a.id, name: a.name, who: D.name, gross: P.gross, fuel: P.fuel, paid, short: Math.max(0, short), take: R10(take), dl: d });
  }
  T.rows = rows;
  cash(s, -G.living(s), 'Makan & rumah');
  if (s.flags.kernet && s.bab === 1) cash(s, -10, 'Makan & rumah');
  if (s.flags.preman_bayar) cash(s, -20 * G.active(s).length, 'Uang keamanan');
  for (const a of s.fleet) if (a.loan) { cash(s, -a.loan.daily, 'Cicilan angkot'); a.loan.left--; if (a.loan.left <= 0) a.loan = null; }
  s.stamina = clamp(s.stamina + 50, 0, 100);
  // target harian
  T.hit = T.narik >= T.target; s.streak = T.hit ? s.streak + 1 : 0; if (T.hit && s.streak % 3 === 0) rep(s, 1);
  s.stats.earned += Math.max(0, T.narik); s.stats.best = Math.max(s.stats.best, T.narik);
  // sopir yang setor kurang berturut-turut / pergi
  for (const a of s.fleet) {
    const dr = G.drv(s, a); if (!dr) continue; const D = G.DRIVERS[dr.id];
    if (dr.loyalty < 25 && dr.id === 'ujang') {
      a.setoran = Math.round(G.expNet(a.route) * 0.5 / 10) * 10; a.setoranSet = true; dr.loyalty = 40; rep(s, -3);
      adhoc(s, 'malam', [['ujang', 'Saya tidak ikut bapakmu dua belas tahun buat diperas anaknya.'], ['ujang', `Mulai besok setoran saya ${G.fmt(a.setoran)}. Kalau tidak terima, cari sopir lain.`], ['narator', 'Sopir-sopir di warung mendengar semuanya. Nama baik turun.']]);
    } else if (dr.loyalty < 25) {
      adhoc(s, 'malam', [['narator', `${D.name} mengembalikan kunci ${a.name} malam ini.`], [dr.id, 'Maaf, Bos. Di tempat Haji Sobari setorannya lebih masuk akal.'], ['narator', `${D.name} berhenti dan cerita ke mana-mana. ${a.name} sekarang tanpa sopir, nama baikmu turun.`]]);
      dr.hired = false; dr.gone = true; a.driver = null; rep(s, -6); s.flags.quits = (s.flags.quits || 0) + 1;
      for (const o of Object.values(s.drivers)) if (o.hired && o.id !== 'ujang') o.loyalty = clamp(o.loyalty - 6, 0, 100);
    } else if (dr.short >= 3 && !dr.asked) {
      dr.asked = true;
      adhoc(s, 'malam', [[dr.id, 'Bos, tiga hari ini saya nombok terus. Setorannya ketinggian buat trayek segini.'], ['narator', `Catatan: setoran ${a.name} lebih besar daripada yang bisa didapat ${D.name}. Turunkan setoran atau pindahkan trayeknya.`]]);
    }
  }
  if (G.b3on(s)) b3Day(s);
  // utang ke Haji Sobari
  const due = s.debt.sched.find(x => x.day === s.day && x.amt > 0);
  if (due) {
    const pay = Math.min(Math.max(0, s.money), due.amt);
    if (pay > 0) { cash(s, -pay, 'Bayar utang'); due.amt -= pay; }
    const last = s.debt.sched[s.debt.sched.length - 1] === due;
    if (due.amt <= 0) {
      if (G.debtLeft(s) > 0) adhoc(s, 'malam', [['kohar', `Cicilan hari ke-${s.day}, ${G.fmt(pay)}. Pas.`], ['kohar', 'Pak Haji titip salam. Katanya, jangan senang dulu.']]);
    } else if (!last) {
      const sisa = due.amt; const nx = s.debt.sched[s.debt.sched.indexOf(due) + 1];
      nx.amt += Math.round(sisa * 1.1); due.amt = 0; rep(s, -4);
      adhoc(s, 'malam', [['kohar', `Kurang ${G.fmt(sisa)}. Pak Haji nggak suka angka kurang.`], ['kohar', 'Sisanya saya pindah ke cicilan berikutnya. Tambah bunga sepuluh persen.'], ['narator', 'Kabar kamu menunggak menyebar di terminal. Nama baik turun.']]);
    } else if (!s.debt.extended) {
      s.debt.extended = true; due.amt = Math.round(due.amt * 1.2); due.day += 10;
      adhoc(s, 'malam', [['sobari', `Hari ketiga puluh. Masih kurang ${G.fmt(Math.round(due.amt / 1.2))}.`], ['sobari', 'Bapakmu dulu pernah saya kasih waktu. Sekali. Kamu juga saya kasih sekali.'], ['sobari', `Sepuluh hari. Jadi ${G.fmt(due.amt)}. Setelah itu kuncinya saya ambil sendiri.`]]);
    } else {
      s.over = 'sita';
      adhoc(s, 'malam', [['narator', 'Sedan putih itu datang lagi. Kali ini ada truk derek di belakangnya.'], ['sobari', 'Kuncinya.'], ['narator', 'Si Ijo ditarik keluar gang. Dimas berdiri di sampingmu, tidak bicara apa-apa.'], ['ujang', 'Belum habis, Jang. Bapakmu dulu juga mulai dari nol. Saya ada tabungan sedikit. Kita tebus, kita mulai lagi.']]);
    }
  }
  if (s.money < 0) rep(s, -1);
  if (s.bab >= 2 && s.money < 0 && s.money >= -800 && !(s.flags.warnKas > s.day - 7)) kasWarn(s);
  if (s.bab >= 2 && s.money < -800 && s.fleet.length > 1) {
    const a = s.fleet.slice().sort((x, y) => x.cond - y.cond)[0];
    s.fleet = s.fleet.filter(x => x !== a); s.money += 1300; s.flags.dijual = (s.flags.dijual || 0) + 1; syncSetoran(s);
    adhoc(s, 'malam', [['kohar', `Utang warung, utang bengkel, utang bensin. Pak Haji mau bantu: ${a.name} dia beli, Rp 1,3 juta. Tunai.`], ['narator', `Kamu tidak punya pilihan. ${a.name} berpindah tangan dan dicat biru.`]]);
  }
  return { rows, ledger: T.ledger, hit: T.hit, target: T.target, narik: T.narik };
};

/* Dimas membuka pembukuan saat kas minus: dari mana uang bocor, dan apa yang bisa dilakukan */
function kasWarn(s) {
  s.flags.warnKas = s.day;
  const loans = s.fleet.reduce((t, a) => t + (a.loan ? a.loan.daily : 0), 0), inc = G.ownerDay(s), fixed = G.fixedDay(s);
  const L = [['dimas', `Kak, kas kita minus ${G.fmt(-s.money)}. Aku hitung pembukuannya semalaman.`]];
  L.push(['dimas', `Tiap hari pasti keluar ${G.fmt(fixed)}: ${loans ? `cicilan ${G.fmt(loans)}, ` : ''}makan dan rumah ${G.fmt(G.living(s))}. Masuknya ±${G.fmt(inc)}, belum servis dan kejadian di jalan.`]);
  const sisa = inc - fixed;
  if (sisa >= 80) L.push(['dimas', `Sebenarnya tiap hari masih sisa ±${G.fmt(sisa)}. Asal jangan belanja besar dulu, kasnya pulih sendiri.`]);
  else {
    L.push(['dimas', sisa > 0 ? `Jadi tiap hari cuma sisa ±${G.fmt(sisa)}. Sekali mogok atau ditilang, kita nombok.` : `Jadi tiap hari kita nombok ±${G.fmt(-sisa)}.`]);
    let top = null, tn = 0; for (const r of G.RIDS) { const n = G.crowd(s, r); if (n > tn) { tn = n; top = r; } }
    const other = G.RIDS.filter(r => r !== top && s.routes[r]);
    if (tn >= 3) {
      L.push(['ujang', `Trayek ${top} isinya ${tn} angkot kita sendiri, Jang. Rebutan penumpang sama saudara sendiri. Tiap mobil cuma dapat sedikit.`]);
      L.push(['ujang', other.length ? `Pindahkan satu-dua ke trayek ${other.join(' atau ')}.` : 'Jangan tambah mobil di sini lagi. Kumpulkan buat izin trayek lain, lalu pindahkan satu-dua ke sana.']);
    } else if (loans > inc * 0.4) L.push(['ujang', 'Cicilan itu yang mencekik, Jang. Jangan tambah mobil kredit dulu sebelum yang ini lunas.']);
    else L.push(['ujang', 'Lihat setoran sopir-sopirmu. Yang nombok terus, nanti ngebut dan mobilnya cepat rusak.']);
  }
  L.push(['narator', 'Kalau kas tembus minus Rp 800 rb, Haji Sobari akan “membantu” dengan membeli salah satu angkotmu.']);
  adhoc(s, 'malam', L);
}

/* Bab 3: petisi harian dan hasil sidang */
G.petisiOf = function (s, a) {
  let n = 5 + s.rep / 10;
  if (a.driver === 'self') n *= 1.2;
  const dr = G.drv(s, a); if (dr && dr.id === 'tini') n *= dr.perk ? 1.6 : 1.3;
  return Math.round(n);
};
function b3Day(s) {
  const B = s.b3; let add = 0;
  for (const a of s.fleet) { const P = s.today.per[a.id]; if (a.route === '05' && a.driver && !a.off && P && P.gross > 0) add += G.petisiOf(s, a); }
  B.petisi += add; s.today.petisi = add;
  if (s.day >= B.hearing) {
    const sc = G.sidang(s); let total = sc.total, exposed = false;
    if (B.suap) { if (rng(s) < 0.5) { exposed = true; total -= 25; rep(s, -15); } else total += 20; }
    total = Math.round(total);
    const win = total >= G.B3.win;
    B.result = Object.assign({}, sc, { total, exposed, win, day: s.day });
    s.mods = s.mods.filter(m => m.id !== 'biru');
    if (win) { addMod(s, { id: 'trayek_bapak', route: '05', demand: 1.1 }); rep(s, 5); }
    else { s.kuota05 = G.B3.kuota; addMod(s, { id: 'biru', route: '05', demand: 0.9 }); kuotaFix(s); }
  }
}
function kuotaFix(s) {
  let n = 0;
  for (const a of s.fleet) {
    if (a.route !== '05') continue; n++; if (n <= s.kuota05) continue;
    let r = G.RIDS.find(k => k !== '05' && s.routes[k]);
    if (!r) { s.routes['09'] = true; r = '09'; s.flags.izin_ganti = true; }
    a.route = r;
  }
  syncSetoran(s);
}
G.sidang = function (s) {
  const B = s.b3 || { petisi: 0 };
  const W = G.B3.w;
  const pet = Math.min(1, B.petisi / G.B3.target) * W.pet;
  const pag = s.rep >= 70 ? W.pag : s.rep >= 55 ? Math.round(W.pag / 2) : 0;
  const okA = s.fleet.filter(a => a.kir && a.cond >= G.B3.lulus).length;
  const arm = s.fleet.length ? okA / s.fleet.length * W.arm : 0;
  const hal = B.halaman ? W.hal : 0;
  return { pet: Math.round(pet), pag, arm: Math.round(arm), hal, okA, n: s.fleet.length, total: Math.round(pet + pag + arm + hal) };
};
G.ujiKir = function (s, aid) {
  const a = s.fleet.find(x => x.id === aid); if (!a || a.kir || s.bab < 3 || s.money < G.B3.kir) return false;
  if (a.cond < G.B3.kirCond) return 'gagal';
  cash(s, -G.B3.kir, 'Surat & denda'); a.kir = true; return true;
};

G.nextDay = function (s) {
  s.day++; s.wx.today = s.wx.tomorrow; s.wx.tomorrow = rollWx(s);
  G.startDay(s);
};

/* ---------- aksi pemain ---------- */
G.payDebt = function (s, amt) {
  amt = Math.min(amt, Math.max(0, s.money), G.debtLeft(s)); if (amt <= 0) return 0; let left = amt;
  for (const x of s.debt.sched) { const p = Math.min(left, x.amt); x.amt -= p; left -= p; if (!left) break; }
  cash(s, -amt, 'Bayar utang'); return amt;
};
G.service = function (s, aid, kind) {
  const a = s.fleet.find(x => x.id === aid), K = G.SERVIS[kind]; if (!a || s.money < K.price || a.cond >= 100) return false;
  cash(s, -K.price, 'Bengkel'); cond(a, K.add); return true;
};
G.upgrade = function (s, aid, key) {
  const a = s.fleet.find(x => x.id === aid), U = G.UPGRADES[key]; if (!a || a.ups[key] || s.money < U.price) return false;
  cash(s, -U.price, 'Bengkel'); a.ups[key] = true; return true;
};
G.paint = function (s, aid, color) {
  const a = s.fleet.find(x => x.id === aid); if (!a || a.color === color || s.money < 150) return false;
  cash(s, -150, 'Bengkel'); a.color = color; return true;
};
G.openRoute = function (s, rid) {
  const r = G.ROUTES[rid]; if (s.routes[rid] || s.money < r.izin) return false;
  cash(s, -r.izin, 'Izin trayek'); s.routes[rid] = true; return true;
};
G.assign = function (s, aid, who) {
  const a = s.fleet.find(x => x.id === aid); if (!a) return;
  if (who) for (const b of s.fleet) if (b !== a && b.driver === who) b.driver = null;
  a.driver = who || null;
  if (who && who !== 'self') a.setoran = clamp(a.setoran, 60, 260);
  syncSetoran(s);
};
G.setRoute = function (s, aid, rid) { const a = s.fleet.find(x => x.id === aid); if (a && s.routes[rid] && a.route !== rid && !G.kuotaFull(s, rid, a)) { a.route = rid; syncSetoran(s); } };
G.setSetoran = function (s, aid, v) { const a = s.fleet.find(x => x.id === aid); if (a) { a.setoran = clamp(Math.round(v / 10) * 10, 60, 260); a.setoranSet = true; } };
G.setoranWajar = function (s, aid) { const a = s.fleet.find(x => x.id === aid); if (a) { a.setoranSet = false; a.setoran = G.fairSetoran(s, a); } };
G.hire = function (s, id) {
  if (!s.cand.includes(id)) return false; const D = G.DRIVERS[id];
  s.cand = s.cand.filter(x => x !== id);
  s.drivers[id] = { id, hired: true, loyalty: id === 'jajang' && s.flags.kernet ? 65 : 50, skill: D.skill, days: 0, short: 0, perk: false };
  if (id === 'jajang') s.flags.kernet = false;
  return true;
};
G.fire = function (s, id) { const dr = s.drivers[id]; if (!dr || id === 'ujang') return false; dr.hired = false; dr.gone = true; for (const a of s.fleet) if (a.driver === id) a.driver = null; syncSetoran(s); return true; };
G.buy = function (s, kind) {
  const K = G.DEALER[kind]; if (s.bab < 2 || s.fleet.length >= G.MAX_FLEET || s.money < K.price) return null;
  if (K.once) { if (s.flags['beli_' + kind]) return null; s.flags['beli_' + kind] = true; }
  cash(s, -K.price, 'Beli angkot');
  const used = s.fleet.map(a => a.name); const name = G.NAMES.find(n => !used.includes(n)) || ('Angkot ' + (s.fleet.length + 1));
  const a = newAngkot(s, { name, cond: K.cond, mesin: K.mesin, loan: K.daily ? { daily: K.daily, left: K.days } : null });
  a.route = bestRoute(s, a); s.today.per[a.id] = { gross: 0, fuel: 0, mult: [1, 1, 1], notes: [] };
  return a;
};
G.rename = function (s, aid, name, stiker) { const a = s.fleet.find(x => x.id === aid); if (!a) return; if (name) a.name = name.slice(0, 18); if (stiker != null) a.stiker = stiker.slice(0, 22).toUpperCase(); };
G.freeDrivers = s => Object.values(s.drivers).filter(d => d.hired && !s.fleet.some(a => a.driver === d.id));

/* ---------- cerita ---------- */
const STORY = [
  { id: 'intro', when: 'pagi', test: s => s.day === 1,
    lines: s => [
      ['narator', 'Cibening, Senin pagi. Tujuh hari setelah Bapak dimakamkan.'],
      ['narator', 'Di garasi samping rumah, angkot hijau tua itu masih di tempatnya. Si Ijo. Trayek 05, Terminal – Pasar Baru. Dua puluh dua tahun Bapak narik pakai mobil ini.'],
      ['dimas', 'Kak, ada tamu. Haji Sobari.'],
      ['sobari', `Turut berduka, ${s.name}. Bapakmu orang baik.`],
      ['sobari', 'Tapi utang tetap utang. Empat setengah juta, pinjaman turun mesin tahun lalu. Tiga kali bayar: hari ke-10, ke-20, ke-30.'],
      ['sobari', 'Kalau lewat, Si Ijo saya ambil. Suratnya ada. Bapakmu sendiri yang tanda tangan.'],
      ['narator', 'Dia pergi naik sedan putihnya. Di ujung gang, tiga angkot biru miliknya lewat beriringan.'],
      ['dimas', 'Kak… gimana?'],
      ['kamu', 'Kuncinya mana, Dim. Kakak yang narik.']] },
  { id: 'rina1', when: 'malam', test: s => s.day >= 1,
    lines: s => [
      ['rina', `Jadi kamu yang nerusin Si Ijo? Saya Rina. Bapakmu servis di bengkel ini dari saya masih SMP.`],
      ['rina', 'Mobilnya bandel, tapi sudah tua. Jaga kondisinya jangan sampai di bawah 40. Di bawah itu bisa mogok di jalan, dan derek lebih mahal daripada servis.'],
      ['rina', 'Satu lagi. Kamu juga punya batas. Narik ngebut dari subuh sampai magrib tiap hari, yang turun mesin duluan itu kamu.']] },
  { id: 'dimas1', when: 'malam', test: s => s.day >= 3,
    lines: s => [
      ['dimas', 'Kak, bayar semesteran paling lambat hari ke-16. Tujuh ratus ribu.'],
      ['dimas', 'Tapi kalau nggak ada, aku cuti dulu juga nggak apa-apa. Serius.'],
      ['narator', 'Dia bilang begitu sambil pura-pura sibuk mencuci piring.']] },
  { id: 'ujang1', when: 'malam', test: s => s.day >= 6,
    lines: s => [
      ['narator', 'Warung kopi terminal. Seorang sopir tua berseragam biru menggeser gelasnya ke mejamu.'],
      ['ujang', 'Kamu anaknya Kang Darma, ya? Saya Ujang. Dua belas tahun narik bareng bapakmu, sebelum saya pindah ke Haji Sobari.'],
      ['ujang', 'Saya kasih tahu satu hal. Tanggal muda, pasar ramai dari subuh. Tanggal tua, jangan habiskan tenaga buat ngebut. Percuma.'],
      ['ujang', 'Bapakmu itu dulu bukan cuma sopir, Jang. Trayek 05 itu dulunya…'],
      ['narator', 'Ponselnya berbunyi. Dia melihat layarnya dan langsung berdiri.'],
      ['ujang', 'Mandor. Lain kali saya ceritakan.']] },
  { id: 'buku', when: 'malam', test: s => s.day >= 13 && s.bab === 1,
    lines: s => [
      ['narator', 'Laci dasbor Si Ijo macet sejak dulu. Malam ini kamu paksa buka pakai obeng.'],
      ['narator', 'Sebuah buku tulis bersampul batik jatuh ke lantai. Tulisan tangan Bapak.'],
      ['narator', 'Halaman pertama: “Trayek 05 — pembagian. D: 3 unit. S: 3 unit.” Tanggalnya dua puluh tahun lalu.'],
      ['narator', 'Halaman-halaman sesudahnya disobek rapi.'],
      ['dimas', 'D itu Darma. Bapak. Terus S…?']] },
  { id: 'dimas2', when: 'malam', test: s => s.day >= 16 && !s.flags.semester,
    lines: s => [['dimas', 'Kak, hari ini batas bayar semesteran.'], ['narator', `Uang di tanganmu: ${G.fmt(s.money)}. Cicilan Haji Sobari juga menunggu.`]],
    choices: s => [
      { label: 'Bayar penuh, Rp 700 rb', ok: s.money >= 700, run: () => { cash(s, -700, 'Kuliah Dimas'); s.flags.semester = 'lunas'; return [['dimas', 'Kak… makasih. Aku janji IP-ku nggak bakal bikin malu.'], ['narator', 'Dimas tetap kuliah. Sorenya dia mulai merapikan catatan setoranmu di buku tulis.']]; } },
      { label: 'Bayar separuh, sisanya Dimas cicil', ok: s.money >= 350, run: () => { cash(s, -350, 'Kuliah Dimas'); s.flags.semester = 'separuh'; return [['dimas', 'Sisanya aku urus. Ada lowongan jaga fotokopian dekat kampus.'], ['narator', 'Dimas tetap kuliah, sambil kerja malam.']]; } },
      { label: 'Minta Dimas cuti satu semester', ok: true, run: () => { s.flags.semester = 'cuti'; return [['dimas', 'Iya. Nggak apa-apa, Kak.'], ['narator', 'Malam itu lampu kamarnya menyala sampai subuh.']]; } }] },
  { id: 'tawar', when: 'malam', test: s => s.day >= 17 && s.bab === 1 && G.debtLeft(s) > 0,
    lines: s => [
      ['narator', 'Sedan putih parkir di depan gang. Yang turun bukan Haji Sobari, tapi Kohar, tukang tagihnya.'],
      ['kohar', 'Pak Haji mau beli Si Ijo. Utang dianggap lunas, kamu masih terima satu juta. Bersih.']],
    choices: s => [
      { label: '“Si Ijo tidak dijual.”', ok: true, run: () => { rep(s, 3); return [['kohar', 'Pak Haji bilang kamu bakal jawab begitu. Katanya bapakmu dulu juga keras kepala.'], ['kohar', 'Lihat saja akhirnya.']]; } },
      { label: '“Saya pikir dulu.”', ok: true, run: () => [['kohar', 'Jangan kelamaan. Harga mobil tua turun tiap hari.'], ['narator', 'Malam itu kamu duduk lama di jok sopir, memegang setir yang sudah licin oleh tangan Bapak.']] }] },
  { id: 'ujang2', when: 'malam', test: s => s.seen.ujang1 && (s.day >= 24 || G.debtLeft(s) === 0),
    lines: s => [
      ['ujang', 'Saya belum selesai cerita waktu itu.'],
      ['ujang', 'Trayek 05 itu dirintis berdua. Bapakmu sama Haji Sobari. Enam angkot, dibagi rata.'],
      ['ujang', 'Lalu krismon. Adikmu lahir, bapakmu butuh biaya. Dia jual bagiannya ke Sobari. Murah. Terlalu murah. Sobari tahu bapakmu tidak punya pilihan.'],
      ['ujang', 'Yang tersisa cuma Si Ijo. Makanya saya tidak pernah enak makan gaji dari dia.']] },
  { id: 'lunas', when: 'malam', test: s => s.bab === 1 && G.debtLeft(s) === 0 && !s.over,
    lines: s => [
      ['narator', 'Kali ini Haji Sobari datang sendiri. Dia menghitung uangnya dua kali.'],
      ['sobari', 'Lunas.'],
      ['sobari', 'Kamu mirip bapakmu. Itu bukan pujian.'],
      ['narator', 'Surat utang itu dia sobek di depanmu. Si Ijo sekarang milikmu sepenuhnya.']],
    done: s => { s.flags.lunas = s.day; rep(s, s.day <= 30 ? 6 : 2); } },
  { id: 'bab2', when: 'pagi', test: s => s.bab === 1 && s.flags.lunas,
    lines: s => [
      ['narator', 'Pagi berikutnya ada yang mengetuk pintu garasi. Mang Ujang, tanpa seragam biru.'],
      ['ujang', 'Saya dipecat. Ada yang lapor saya ngopi sama kamu.'],
      ['ujang', 'Saya sudah tua buat melamar ke mana-mana. Kamu butuh sopir?'],
      ['kamu', 'Angkot saya cuma satu, Mang.'],
      ['ujang', 'Ya beli lagi. Bapakmu dulu mulai dari satu juga.'],
      ['rina', 'Kebetulan. Di bengkel ada angkot titipan, pemiliknya pindah ke Kalimantan. DP tiga ratus ribu, sisanya cicil harian. Bawa dulu saja.']],
    done: s => {
      s.bab = 2; s.flags.bab2day = s.day;
      s.drivers.ujang = { id: 'ujang', hired: true, loyalty: 62, skill: G.DRIVERS.ujang.skill, days: 0, short: 0, perk: false };
      s.cand = s.flags.kernet || s.flags.kernet_tanya ? ['jajang'] : ['jajang', 'asep'];
    } },
  { id: 'b_setoran', when: 'malam', test: s => s.bab >= 2 && Object.values(s.drivers).some(d => d.days >= 1),
    lines: s => [
      ['ujang', 'Ini setoran pertama. Hitung dulu.'],
      ['ujang', `Setoran itu timbangan, ${s.name}. Ketinggian, sopir ngebut, mobil rusak, orangnya kabur. Kerendahan, kamu yang tidak makan.`],
      ['ujang', 'Sopir yang bawa pulang cukup buat dapurnya, itu sopir yang besok datang lagi.']] },
  { id: 'b_dua', when: 'malam', test: s => s.bab >= 2 && s.fleet.length >= 2,
    lines: s => [
      ['dimas', 'Kak, aku bikinin pembukuan. Soalnya sekarang kita punya armada.'],
      ['kamu', 'Dua biji, Dim.'],
      ['dimas', 'Armada tetap armada.']] },
  { id: 'b_tiga', when: 'malam', test: s => s.bab >= 2 && s.fleet.length >= 3,
    lines: s => [
      ['narator', 'Tiga angkot berjajar di depan rumah. Tetangga mulai memanggilmu “Juragan”, separuh bercanda.'],
      ['kohar', 'Trayek 05 itu sudah penuh. Pak Haji minta kamu tahu diri.'],
      ['ujang', 'Biarkan saja. Tapi dia ada benarnya: tiga mobil di satu trayek itu rebutan penumpang sendiri. Coba urus izin trayek lain.']],
  },
  { id: 'b_empat', when: 'malam', test: s => s.bab >= 2 && s.fleet.length >= 4,
    lines: s => [
      ['narator', 'Seorang ibu berjaket biru menunggu di depan garasi. Jaket seragam Haji Sobari.'],
      ['tini', 'Saya Tini. Tujuh tahun narik buat Pak Haji. Katanya di sini sopir boleh bawa pulang cukup buat dapur.'],
      ['tini', 'Kalau ada mobil kosong, saya siap.']],
    done: s => { if (!s.drivers.tini && !s.cand.includes('tini')) s.cand.push('tini'); } },
  { id: 'b_lima', when: 'malam', test: s => s.bab >= 2 && s.fleet.length >= 5,
    lines: s => [
      ['narator', 'Lima angkot. Garasi sudah tidak muat, dua parkir di lapangan RT.'],
      ['narator', 'Malam itu sedan putih berhenti tepat di depannya.'],
      ['sobari', 'Lima. Bapakmu dulu berhenti di tiga.'],
      ['sobari', 'Bulan depan izin trayek 05 diperpanjang. Yang pegang suara di Dishub itu saya.'],
      ['sobari', 'Kita lihat kamu masih punya trayek atau tidak.'],
      ['narator', 'Lampu belakang sedannya menghilang di ujung gang.'],
      ['ujang', 'Halaman yang disobek dari buku bapakmu itu… saya tahu siapa yang pegang.']],
    done: s => { s.flags.tamat = s.day; } },
  /* ---------- Bab 3: Rebutan Trayek ---------- */
  { id: 'bab3', when: 'pagi', test: s => s.bab === 2 && s.flags.tamat && s.day > s.flags.tamat,
    lines: s => [
      ['narator', 'Pak RT mengantar sepucuk surat bercap Dinas Perhubungan Kota Cibening.'],
      ['dimas', `“Sidang perpanjangan izin trayek 05. Hari ke-${s.day + G.B3.len}.” Penilaiannya tiga, Kak: dukungan penumpang, dukungan paguyuban sopir, kelayakan armada.`],
      ['narator', 'Siangnya angkot biru di terminal bertambah. Enam. Delapan. Sepuluh. Semuanya trayek 05.'],
      ['ujang', 'Dia banjiri trayeknya. Penumpang dibagi tipis-tipis, biar di sidang kelihatan kita tidak perlu ada.'],
      ...(s.routes['09'] || s.routes['12'] ? [] : [['ujang', 'Kalau semua mobilmu di 05, kamu ikut tenggelam. Urus izin trayek lain, taruh dua atau tiga saja di 05.']]),
      ['dimas', 'Kita bikin petisi. Tiap angkot kita yang lewat trayek 05 bawa map tanda tangan. Langganan pasti mau.'],
      ['rina', `Satu lagi. Semua mobil harus lulus uji KIR. Kondisinya minimal ${G.B3.kirCond} waktu diuji, dan jangan sampai di bawah ${G.B3.lulus} pas hari sidang. Dishub cek ulang.`]],
    done: s => {
      s.bab = 3;
      s.b3 = { start: s.day, hearing: s.day + G.B3.len, petisi: 0, halaman: false, suap: false, deal: false, result: null };
      addMod(s, { id: 'biru', route: '05', demand: 0.9, until: s.b3.hearing });
    } },
  { id: 'b3_endang', when: 'malam', test: s => G.b3on(s) && G.d3(s) >= 3,
    lines: s => [
      ['narator', 'Rapat paguyuban sopir di warung terminal. Asap kretek, kopi hitam, dan tiga puluh pasang mata yang menatapmu.'],
      ['endang', 'Saya Endang, ketua paguyuban. Kami tidak memihak juragan mana pun. Juragan datang dan pergi.'],
      ['endang', 'Kami memihak nama yang bersih. Nama baikmu 70 ke atas, paguyuban berdiri di belakangmu di sidang.'],
      ['endang', 'Di atas 55, kami datang, tapi diam. Di bawah itu, jangan harap.'],
      ['narator', `Nama baikmu sekarang ${Math.round(s.rep)}.`]] },
  { id: 'b3_halaman', when: 'malam', test: s => G.b3on(s) && G.d3(s) >= 9 && !s.b3.halaman,
    lines: s => [
      ['ujang', 'Halaman yang disobek dari buku bapakmu ada di Kohar. Pak Haji suruh dia bakar. Dia simpan. Buat jaga-jaga, katanya.'],
      ['narator', 'Kohar menunggu di ujung gang, tanpa sedan putih. Dia kelihatan lebih tua dari biasanya.'],
      ['kohar', 'Saya cuma tukang tagih. Tapi saya juga punya anak, dan Pak Haji sudah tiga bulan tidak bayar saya.'],
      ['kohar', 'Isinya surat pembagian trayek. Tiga dan tiga, ditandatangani dua-duanya. Di sidang, itu berat.']],
    choices: s => [
      { label: 'Tebus Rp 1 juta', ok: s.money >= 1000, why: 'Uang tidak cukup', run: () => { cash(s, -1000, 'Lain-lain'); s.b3.halaman = true; return [['kohar', 'Jangan bilang dari saya.'], ['narator', 'Kertasnya menguning, tapi tanda tangan Bapak masih jelas. Di sebelahnya: Sobari.']]; } },
      { label: 'Bujuk dia baik-baik', ok: s.rep >= 65, why: 'Butuh nama baik 65', run: () => { s.b3.halaman = true; rep(s, 1); return [['kohar', 'Semua orang di terminal bilang kamu lurus. Bapakmu juga dulu begitu.'], ['kohar', 'Ambil. Saya sudah capek jadi orang jahat di cerita orang lain.']]; } },
      { label: 'Biarkan dulu', ok: true, run: () => [['kohar', 'Terserah. Tapi tawarannya tidak lama.']] }] },
  { id: 'b3_halaman2', when: 'malam', test: s => G.b3on(s) && G.d3(s) >= 20 && !s.b3.halaman && s.seen.b3_halaman,
    lines: s => [
      ['kohar', 'Pak Haji mulai curiga. Kalau mau, malam ini terakhir.'],
      ['kohar', 'Harganya naik. Saya harus pindah kota setelah ini.']],
    choices: s => [
      { label: 'Tebus Rp 1,5 juta', ok: s.money >= 1500, why: 'Uang tidak cukup', run: () => { cash(s, -1500, 'Lain-lain'); s.b3.halaman = true; return [['narator', 'Kohar menyerahkan amplop cokelat, lalu pergi tanpa menoleh.']]; } },
      { label: 'Lepaskan', ok: true, run: () => [['narator', 'Lampu motor Kohar menghilang di tikungan. Halaman itu ikut pergi.']] }] },
  { id: 'b3_tekanan', when: 'malam', test: s => G.b3on(s) && G.d3(s) >= 15 && s.fleet.length >= 4,
    lines: s => [
      ['narator', 'Sedan putih. Kali ini Haji Sobari sendiri yang turun, dan dia tersenyum.'],
      ['sobari', 'Kita tidak usah ribut di depan orang Dishub. Malu.'],
      ['sobari', 'Jual dua angkotmu ke saya, Rp 1,3 juta satu. Kamu tetap pegang tiga di trayek 05, saya tarik angkot-angkot biru itu. Tidak ada sidang.']],
    choices: s => [
      { label: '“Kita ketemu di sidang, Pak Haji.”', ok: true, run: () => { rep(s, 2); return [['sobari', 'Bapakmu juga bilang begitu dua puluh tahun lalu.'], ['sobari', 'Dia kalah.']]; } },
      { label: 'Terima tawarannya', ok: true, run: () => {
        const sold = s.fleet.slice().sort((x, y) => x.cond - y.cond).slice(0, 2);
        s.fleet = s.fleet.filter(a => !sold.includes(a)); cash(s, 2600, 'Jual angkot');
        for (const a of sold) { const dr = G.drv(s, a); if (dr) { dr.loyalty = clamp(dr.loyalty - 10, 0, 100); } }
        s.b3.deal = true; s.kuota05 = 3; s.mods = s.mods.filter(m => m.id !== 'biru'); kuotaFix(s);
        s.b3.result = { deal: true, win: false, day: s.day, total: 0 };
        return [['narator', `${sold.map(a => a.name).join(' dan ')} dicat biru minggu itu juga.`], ['ujang', 'Saya tidak akan bilang kamu salah, Jang. Tapi bapakmu tidak akan ambil uang itu.']]; } }] },
  { id: 'b3_wulan', when: 'malam', test: s => G.b3on(s) && G.d3(s) >= 22,
    lines: s => { const sc = G.sidang(s), L = [
      ['narator', 'Seorang perempuan berseragam Dishub naik Si Ijo dari pasar sampai terminal. Diam sepanjang jalan, mencatat.'],
      ['wulan', 'Saya Wulan, kepala seksi angkutan. Saya yang memimpin sidang. Saya tidak terima tamu di kantor, jadi saya naik angkot.']];
      if (sc.pet < G.B3.w.pet) L.push(['wulan', `Tanda tangan penumpang baru ${s.b3.petisi} dari ${G.B3.target}. Angkot yang lewat 05 yang paling didengar penumpangnya.`]);
      if (sc.okA < sc.n) L.push(['wulan', `Armadamu ${sc.n}, yang KIR-nya beres dan layak jalan baru ${sc.okA}.`]);
      if (sc.pag < G.B3.w.pag) L.push(['wulan', 'Paguyuban belum bulat di belakangmu. Mereka lihat nama baik.']);
      if (!s.b3.halaman) L.push(['wulan', 'Dan saya dengar ada dokumen lama soal pembagian trayek ini. Kalau ada, bawa.']);
      if (L.length === 2) L.push(['wulan', 'Berkasmu lengkap. Sampai ketemu di sidang.']);
      return L; } },
  { id: 'b3_sidang', when: 'malam', test: s => s.bab === 3 && s.b3 && s.b3.result && !s.flags.tamat3,
    lines: s => { const R = s.b3.result;
      if (R.deal) return [
        ['narator', 'Seminggu kemudian, perkara trayek 05 dicoret dari jadwal sidang Dishub. Alasannya: “sudah ada kesepakatan para pihak”.'],
        ['narator', 'Kamu pegang tiga kursi di trayek 05. Sisanya biru.'],
        ['dimas', 'Kak, kita masih punya trayek lain. Masih bisa tumbuh.'],
        ['narator', 'BERSAMBUNG — Bab 4: Ojol Masuk Kota.']];
      const L = [
        ['narator', 'Ruang rapat Dishub. Haji Sobari duduk di kursi depan bersama dua pengacara.'],
        ['wulan', `Dukungan penumpang: ${s.b3.petisi} tanda tangan.`],
        ['wulan', R.pag >= G.B3.w.pag ? 'Paguyuban sopir menyatakan dukungan penuh.' : R.pag > 0 ? 'Paguyuban hadir, tapi tidak menyatakan sikap.' : 'Paguyuban tidak hadir.'],
        ['wulan', `Kelayakan armada: ${R.okA} dari ${R.n} angkot lulus pemeriksaan.`]];
      if (R.hal) L.push(['narator', 'Kamu meletakkan halaman-halaman buku Bapak di meja. Pengacara Haji Sobari berhenti menulis.']);
      if (R.exposed) L.push(['wulan', 'Satu hal lagi. Ada petugas kami yang menerima amplop atas nama perkara ini. Sudah kami periksa.'], ['narator', 'Seisi ruangan menoleh ke arahmu.']);
      if (R.win) L.push(
        ['wulan', 'Izin trayek 05 diperpanjang. Kuota dibagi ulang sesuai surat pembagian awal dan dukungan di lapangan.'],
        ['narator', 'Haji Sobari berdiri lebih dulu. Di pintu dia berhenti.'],
        ['sobari', 'Bapakmu pasti bangga. Saya tidak.'],
        ['ujang', 'Darma… anakmu sudah pulang ke trayeknya.'],
        ['narator', 'BERSAMBUNG — Bab 4: Ojol Masuk Kota.']);
      else L.push(
        ['wulan', `Izin trayek 05 diperpanjang dengan kuota. Pihakmu dapat ${G.B3.kuota} kursi. Sisanya ke Haji Sobari.`],
        ['sobari', 'Tidak usah sedih. Bapakmu dulu dapat lebih sedikit.'],
        ['ujang', 'Kita kalah di ruangan ini. Di jalan belum.'],
        ['narator', s.flags.izin_ganti ? 'Sebagai ganti, Dishub memberimu izin trayek 09. Angkot yang lain dipindah ke sana.' : 'Angkot yang tidak dapat kursi dipindah ke trayekmu yang lain.'],
        ['narator', 'BERSAMBUNG — Bab 4: Ojol Masuk Kota.']);
      return L; },
    done: s => { s.flags.tamat3 = s.day; } }
];
const PERK = {
  ujang: s => [['ujang', 'Saya sudah tidak kuat narik seharian. Tapi mata saya masih awas.'], ['ujang', 'Tiap pagi saya cek oli, air radiator, sama angin ban semua mobil. Anggap saja saya mandor.'], ['narator', 'Mang Ujang jadi mandor. Semua angkotmu sekarang lebih awet.']],
  jajang: s => [['jajang', 'Kang! Eh, Bos! Saya lulus ujian SIM! Sekali coba!'], ['narator', 'Dia memamerkan SIM barunya ke semua orang di terminal, termasuk tukang parkir.'], ['narator', 'Jajang makin percaya diri di belakang setir.']],
  asep: s => [['asep', 'Bos, tadi saya hampir nabrak anak kecil di depan pasar. Hampir.'], ['asep', 'Dulu saya ngebut biar dianggap jago. Sekarang saya bawa orang. Beda.'], ['narator', 'Asep tetap cepat, tapi tidak lagi menyiksa mobil.']],
  dadang: s => [['dadang', 'Bos, saya mau ngaku. Beberapa kali setoran saya kurang itu… bukan karena sepi.'], ['dadang', 'Ini saya balikin. Bos baik sama saya, saya malu sendiri.'], ['narator', 'Kang Dadang mengembalikan Rp 150 ribu. Sejak itu setorannya tidak pernah “ajaib” lagi.']],
  ucok: s => [['ucok', 'Bos, utang mamak di kampung lunas minggu ini. Dari hasil narik di sini.'], ['ucok', 'Aku tak pandai bilang terima kasih. Jadi aku narik lebih kencang saja.'], ['narator', 'Bang Ucok makin bersemangat.']],
  tini: s => [['tini', 'Ibu-ibu pasar sekarang hafal jadwal saya, Bos. Mereka nunggu, nggak mau naik yang lain.'], ['narator', 'Bu Tini punya langganan tetap. Trayek 05 makin ramai kalau dia yang bawa.']]
};
G.CHAR = {
  narator: { name: '', c: '#5b6770' }, kamu: { name: 'Kamu', c: '#1f9d55' }, dimas: { name: 'Dimas', c: '#e2852b' },
  rina: { name: 'Teh Rina', c: '#c2418b' }, ujang: { name: 'Mang Ujang', c: '#7a5a2e' }, sobari: { name: 'Haji Sobari', c: '#2a6fdb' },
  kohar: { name: 'Kohar', c: '#34507a' }, wulan: { name: 'Bu Wulan', c: '#a35a1f' }, endang: { name: 'Pak Endang', c: '#4d6b3c' }, jajang: { name: 'Jajang', c: '#2f9c95' }, asep: { name: 'Asep', c: '#d8402f' },
  dadang: { name: 'Kang Dadang', c: '#6b7d2a' }, ucok: { name: 'Bang Ucok', c: '#8a4fd0' }, tini: { name: 'Bu Tini', c: '#d0577a' }
};
G.scenes = function (s, when) {
  const out = [];
  for (const x of s.adhoc) if (x.when === when) out.push({ id: x.id, lines: x.lines });
  if (s.over) return out;
  for (const st of STORY) if (st.when === when && !s.seen[st.id] && st.test(s)) {
    out.push({ id: st.id, lines: st.lines(s), choices: st.choices ? st.choices(s).map(c => ({ label: c.label, ok: c.ok, why: c.why })) : null });
    if (out.length >= 2) break;
  }
  if (when === 'malam' && out.length < 2) for (const d of Object.values(s.drivers)) {
    if (d.hired && !d.perk && d.loyalty >= 70 && d.days >= 6) { out.push({ id: 'perk_' + d.id, lines: PERK[d.id](s) }); break; }
  }
  return out;
};
G.sceneDone = function (s, id, choice) {
  if (id[0] === 'x') { s.adhoc = s.adhoc.filter(x => x.id !== id); return null; }
  if (id.startsWith('perk_')) {
    const d = s.drivers[id.slice(5)]; d.perk = true;
    if (d.id === 'dadang') cash(s, 150, 'Lain-lain');
    if (d.id === 'ucok') d.skill += 0.05; if (d.id === 'jajang') d.skill = Math.max(d.skill, 1.08);
    return null;
  }
  const st = STORY.find(x => x.id === id); s.seen[id] = s.day; let extra = null;
  if (st.choices && choice != null) extra = st.choices(s)[choice].run();
  if (st.done) st.done(s);
  return extra;
};

/* ---------- kabar & target ---------- */
G.kabar = function (s, tomorrow) {
  const day = s.day + (tomorrow ? 1 : 0), wx = tomorrow ? s.wx.tomorrow : s.wx.today, d = G.cal(s, day), out = [];
  const W = { cerah: 'Cerah.', mendung: 'Mendung, belum tentu hujan.', hujan: 'Hujan deras. Trayek 12 macet, trayek pendek malah ramai.' };
  out.push((tomorrow ? 'Besok ' : 'Hari ini ') + G.DOW[d.dow] + '. ' + W[wx]);
  if (d.dom === 1) out.push('Tanggal muda mulai. Pasar Baru ramai sampai tanggal 5.');
  else if (d.dom <= 5) out.push('Masih tanggal muda, pasar ramai.');
  if (d.dom === 25) out.push('Masuk tanggal tua. Pasar mulai sepi.');
  if (d.dow === 6) out.push('Minggu pagi ada pasar kaget. Kampus libur.');
  if (d.dow === 5) out.push('Sabtu, kampus libur.');
  if (d.dow === 4) out.push('Jumat sore stasiun ramai orang pulang kampung.');
  if (hasMod(s, 'pasar_malam')) out.push('Pasar malam masih buka: trayek 05 ramai sore hari.');
  if (hasMod(s, 'viral')) out.push('Orang-orang masih membicarakan bayi yang lahir berkat angkotmu.');
  const due = s.debt.sched.find(x => x.amt > 0 && x.day === day);
  if (due) out.push(`${tomorrow ? 'Besok' : 'Malam ini'} jatuh tempo ${G.fmt(due.amt)} ke Haji Sobari.`);
  if (tomorrow && !s.over) {
    const T = { 6: 'Penjaga warung kopi titip pesan: ada sopir tua yang menanyakan kamu.', 13: 'Laci dasbor Si Ijo berbunyi klotak-klotak sejak sore.', 16: 'Dimas dari tadi bolak-balik di depan kamarmu.', 17: 'Kata tukang parkir, ada sedan putih mondar-mandir di depan gang.', 24: 'Mang Ujang: “Besok malam ngopi. Ada yang belum saya ceritakan.”' };
    if (s.bab === 1 && T[day]) out.push(T[day]);
    if (G.b3on(s)) {
      const T3 = { 3: 'Pak Endang, ketua paguyuban, mengumpulkan sopir besok malam di warung terminal.', 9: 'Mang Ujang: “Besok malam jangan ke mana-mana. Ada yang mau ketemu.”', 15: 'Sedan putih parkir di depan gang dari sore. Mesinnya tidak dimatikan.', 22: 'Kata tukang parkir, ada pegawai Dishub yang naik-turun angkot di pasar.' };
      if (T3[day - s.b3.start]) out.push(T3[day - s.b3.start]);
    }
  }
  if (G.b3on(s)) {
    const left = s.b3.hearing - day;
    out.push(left > 0 ? `Sidang izin trayek 05: ${left} hari lagi.` : (tomorrow ? 'Besok' : 'Hari ini') + ' sidang izin trayek 05 di Dishub.');
    if (hasMod(s, 'biru')) out.push('Angkot biru membanjiri trayek 05. Penumpang dibagi tipis.');
  }
  if (hasMod(s, 'trayek_bapak')) out.push('Trayek 05 dibagi ulang. Penumpang pasar kembali ke angkotmu.');
  return out;
};
G.goals = function (s) {
  const g = [];
  const T = s.today;
  g.push({ scope: 'Hari ini', text: T.target ? `Bawa pulang ${G.fmt(T.target)} dari narik` : 'Berangkat narik', cur: Math.max(0, T.narik), max: T.target || 1, note: s.streak >= 2 ? `${s.streak} hari berturut-turut tercapai` : '' });
  if (s.bab === 1) {
    const due = G.nextDue(s);
    if (due) g.push({ scope: `Hari ke-${due.day}`, text: `Cicilan ${G.fmt(due.amt)} ke Haji Sobari`, cur: clamp(s.money, 0, due.amt), max: due.amt, note: due.day - s.day > 0 ? `${due.day - s.day} hari lagi` : 'Malam ini' });
    if (s.seen.dimas1 && !s.flags.semester) g.push({ scope: 'Hari ke-16', text: 'Semesteran Dimas Rp 700 rb', cur: clamp(s.money, 0, 700), max: 700, note: s.day <= 16 ? `${16 - s.day} hari lagi` : '' });
    g.push({ scope: 'Bab 1', text: 'Lunasi utang Bapak', cur: 4500 - Math.min(4500, G.debtLeft(s)), max: 4500, note: `Sisa ${G.fmt(G.debtLeft(s))}` });
  } else if (G.b3on(s)) {
    const sc = G.sidang(s), left = s.b3.hearing - s.day;
    g.push({ scope: `Hari ke-${s.b3.hearing}`, text: 'Menangkan sidang izin trayek 05', cur: sc.total, max: G.B3.win, note: `Skor ${sc.total}, butuh ${G.B3.win} · ${left > 0 ? left + ' hari lagi' : 'malam ini'}` });
    g.push({ scope: 'Petisi', text: 'Tanda tangan penumpang', cur: s.b3.petisi, max: G.B3.target, note: `${s.b3.petisi} dari ${G.B3.target}. Hanya angkot di trayek 05 yang mengumpulkan.` });
    g.push({ scope: 'Armada', text: 'Lulus uji KIR, kondisi layak', cur: sc.okA, max: Math.max(1, sc.n), note: `${sc.okA} dari ${sc.n} angkot` });
    g.push({ scope: 'Paguyuban', text: 'Nama baik 70', cur: Math.min(70, s.rep), max: 70, note: s.rep >= 70 ? 'Dukungan penuh' : s.rep >= 55 ? 'Hadir tapi diam' : 'Tidak mendukung' });
  } else {
    if (s.fleet.length < (s.bab >= 3 ? G.MAX_FLEET : 5)) g.push({ scope: 'Berikutnya', text: `Beli angkot ke-${s.fleet.length + 1}`, cur: clamp(s.money, 0, G.DEALER.tua.price), max: G.DEALER.tua.price, note: s.flags.beli_titip ? `Kredit mulai ${G.fmt(G.DEALER.baru.price)}` : 'Ada titipan di Teh Rina, DP Rp 300 rb' });
    if (s.bab === 2) g.push({ scope: 'Bab 2', text: 'Punya 5 angkot', cur: Math.min(5, s.fleet.length), max: 5, note: `${s.fleet.length} dari 5` });
  }
  return g;
};
/* pendapatan selama pemain pergi (maks 8 jam) */
G.offline = function (s, now) {
  const last = s.lastSeen || now; s.lastSeen = now;
  const h = Math.min(8, (now - last) / 3.6e6); if (h < 1 || s.bab < 2 || s.over) return null;
  let per = 0; for (const a of s.fleet) if (G.drv(s, a)) per += a.setoran;
  const amt = Math.round(per * 0.04 * h); if (amt <= 0) return null;
  s.money += amt; return { amt, hours: Math.floor(h) };
};

root.NARIK = G;
if (typeof module !== 'undefined') module.exports = G;
})(typeof window !== 'undefined' ? window : globalThis);
