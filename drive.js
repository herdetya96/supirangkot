/* NARIK — mini-game nyetir. Tampak atas, jalan bergerak ke atas, lajur kiri menempel trotoar.
   Sim = fisika murni (jalan juga di Node untuk bot penyeimbang). mount = canvas + kontrol di browser.
   Satuan: 1 unit dunia = 1 px logis. Lebar logis 360. Uang dalam ribuan rupiah, sama seperti game.js. */
(function (root) {
'use strict';
const W = 360, ROAD_L = 70, ROAD_R = 290, LANES = [106, 180, 254], CURB_X = 128;
const PW = 44, PL = 84, MW = 16, ML = 34;
const ACC = 170, BRAKE = 540, LAT = 380, STOP_V = 30;

function mulberry(seed) {
  let a = seed | 0;
  return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), a | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const overlap = (ax, ad, aw, al, bx, bd, bw, bl) => Math.abs(ax - bx) < (aw + bw) / 2 && Math.abs(ad - bd) < (al + bl) / 2;

class Sim {
  constructor(spec) {
    this.spec = spec; this.r = mulberry(spec.seed || 1);
    this.t = 0; this.d = 0; this.v = 0; this.x = LANES[1]; this.tx = LANES[1];
    this.vMax = spec.vMax || 340; this.brakeK = spec.wet ? 0.6 : 1;
    this.riders = []; this.fares = 0; this.boarded = 0;
    this.hits = 0; this.severe = 0; this.potholes = 0; this.tilang = 0; this.missed = 0; this.stolen = 0;
    this.cool = 0; this.shake = 0; this.stopT = 0; this.braking = false; this.over = false; this.mogok = false; this.deadT = 0;
    this.msgs = []; this.pops = [];
    this.groups = spec.groups.map(g => ({ d: g.d, n: g.n, n0: g.n, prog: 0, taken: null, wave: this.r() * 6, lure: this.r() < 0.4 }));
    this.motors = spec.traffic.map(m => ({ d: m.d, x: LANES[m.lane], tx: LANES[m.lane], v: m.v, v0: m.v, hue: Math.floor(this.r() * 6), next: 2 + this.r() * 6 }));
    this.biru = spec.biru.map(b => ({ d: b.d, x: LANES[1], tx: LANES[1], v: b.v, v0: b.v, state: 'jalan', g: null, timer: 0, left: spec.steal || 1 }));
    this.pots = spec.potholes.map(p => ({ d: p.d, x: p.x, used: false }));
    this.police = spec.police.map(p => ({ d: p.d, done: false }));
  }
  say(text, kind) { this.msgs.push({ text, kind: kind || '', t: 0 }); if (this.msgs.length > 3) this.msgs.shift(); }
  pop(text, good) { this.pops.push({ x: this.x, d: this.d, text, good, t: 0 }); }
  atCurb() { return this.x < CURB_X && this.v < STOP_V; }
  step(dt, inp) {
    if (this.over) return;
    const S = this.spec; this.t += dt;
    for (const m of this.msgs) m.t += dt; this.msgs = this.msgs.filter(m => m.t < 2.6);
    for (const p of this.pops) p.t += dt; this.pops = this.pops.filter(p => p.t < 1.2);
    this.cool = Math.max(0, this.cool - dt); this.shake = Math.max(0, this.shake - dt);
    // mesin mati
    if (S.mogokAt != null && this.t >= S.mogokAt && !this.mogok) { this.mogok = true; this.say('Mesin mati! Mogok.', 'bad'); }
    // gas dan rem
    this.braking = !!inp.brake;
    if (this.mogok) this.v = Math.max(0, this.v - BRAKE * 0.5 * dt);
    else if (this.braking) this.v = Math.max(0, this.v - BRAKE * this.brakeK * dt);
    else this.v = Math.min(this.vMax, this.v + ACC * dt);
    // setir
    if (inp.tx != null) this.tx = inp.tx;
    let tx = clamp(this.tx, ROAD_L + PW / 2, ROAD_R - PW / 2);
    if (S.wobble) tx += Math.sin(this.t * 1.7) * 22 * S.wobble;
    const dx = tx - this.x, lat = LAT * (S.wet ? 0.85 : 1) * dt;
    this.x += Math.abs(dx) < lat ? dx : Math.sign(dx) * lat;
    this.x = clamp(this.x, ROAD_L + PW / 2, ROAD_R - PW / 2);
    this.d += this.v * dt;

    this.stepTraffic(dt);
    this.collide();
    this.passengers(dt);

    // polisi
    for (const p of this.police) if (!p.done && this.d >= p.d) { p.done = true; if (this.v > 0.82 * this.vMax) { this.tilang++; this.say('Ditilang polisi! Kebut-kebutan.', 'bad'); } else this.say('Polisi mengangguk. Aman.'); }

    if (this.t >= S.dur || (this.mogok && this.v <= 0 && (this.deadT += dt) > 1.2)) this.finish();
  }
  stepTraffic(dt) {
    const r = this.r;
    for (const m of this.motors) {
      m.next -= dt;
      if (m.next <= 0) { m.tx = LANES[Math.floor(r() * 3)]; m.next = 3 + r() * 6; }
      // jangan menabrak angkot pemain dari belakang
      const behind = m.d < this.d && this.d - m.d < 110 && Math.abs(m.x - this.x) < 34;
      m.v = behind ? Math.min(m.v0, this.v) : m.v0;
      if (behind && Math.abs(m.tx - this.x) < 34) m.tx = this.x < 180 ? LANES[2] : LANES[0];
      m.x += clamp(m.tx - m.x, -90 * dt, 90 * dt); m.d += m.v * dt;
    }
    for (const b of this.biru) {
      if (b.state === 'jalan') {
        const behind = b.d < this.d && this.d - b.d < 150 && Math.abs(b.x - this.x) < 46;
        b.v = behind ? Math.min(b.v0, this.v) : b.v0;
        if (behind) b.tx = this.x < 180 ? LANES[2] : LANES[1];
        else if (!b.g) b.tx = LANES[1];
        if (!b.g && b.left > 0) { const g = this.groups.find(g => g.lure && !g.taken && g.d > b.d + 40 && g.d - b.d < 500 && !this.biru.some(o => o.g === g)); if (g) { b.g = g; } }
        if (b.g) {
          b.tx = LANES[0];
          if (b.g.taken) b.g = null;
          else if (b.d >= b.g.d - 8 && Math.abs(b.x - LANES[0]) < 6) { b.state = 'ngetem'; b.timer = 0; b.v = 0; }
          else if (b.g.d - b.d < 120) b.v = Math.max(40, b.v0 * (b.g.d - b.d) / 120);
        }
        b.x += clamp(b.tx - b.x, -70 * dt, 70 * dt); b.d += b.v * dt;
      } else if (b.state === 'ngetem') {
        b.timer += dt;
        const g = b.g;
        if (g && !g.taken && g.prog <= 0 && b.timer > 2.4) { g.taken = 'biru'; this.stolen += g.n; g.n = 0; b.left--; if (Math.abs(g.d - this.d) < 700) this.say('Penumpang diserobot angkot biru!', 'bad'); }
        if (b.timer > 3.2 || (g && g.taken === 'me')) { b.state = 'jalan'; b.g = null; b.tx = LANES[1]; }
      }
    }
  }
  collide() {
    if (this.cool > 0) return;
    const hit = (o, w, l, ov) => {
      if (!overlap(this.x, this.d, PW, PL, o.x, o.d, w, l)) return false;
      if (o.d < this.d) { o.d = this.d - (PL + l) / 2 - 2; o.v = Math.min(o.v, this.v); return false; }
      const rel = this.v - ov;
      this.hits++; if (rel > 150) { this.severe++; this.say('Brak! Nabrak, harus ganti rugi.', 'bad'); } else this.say('Nyerempet!', 'bad');
      this.v = Math.min(this.v, ov * 0.5); o.d = this.d + (PL + l) / 2 + 6; this.cool = 1; this.shake = 0.35;
      return true;
    };
    for (const m of this.motors) if (hit(m, MW, ML, m.v)) return;
    for (const b of this.biru) if (hit(b, PW, PL, b.state === 'ngetem' ? 0 : b.v)) return;
    for (const p of this.pots) if (!p.used && this.v > 100 && overlap(this.x, this.d, PW, PL, p.x, p.d, 26, 16)) {
      p.used = true; this.potholes++; this.v *= 0.75; this.shake = 0.25; this.say('Gluduk! Lubang.', 'bad');
    }
  }
  passengers(dt) {
    const curb = this.atCurb(), seats = this.spec.seats;
    // naik
    for (const g of this.groups) {
      if (g.taken || g.n <= 0) continue;
      if (curb && Math.abs(g.d - this.d) < 50) {
        g.prog += dt;
        if (g.prog >= 0.45) {
          const k = Math.min(g.n, seats - this.riders.length);
          if (k <= 0) { if (g.prog < 0.5) this.say('Penuh!'); g.prog = 0.46; continue; }
          for (let i = 0; i < k; i++) this.riders.push({ drop: this.d + 900 + this.r() * 2200, st: 'ride' });
          g.n -= k; this.boarded += k; if (g.n <= 0) g.taken = 'me'; g.prog = 0;
          this.say(k === 1 ? 'Satu naik.' : `${k} orang naik.`, 'good');
        }
      } else g.prog = Math.max(0, g.prog - dt * 2);
    }
    // teriak kiri
    for (const p of this.riders) {
      if (p.st === 'ride' && this.d >= p.drop) { p.st = 'kiri'; p.dead = p.drop + 500; this.say('“Kiri, Bang!”', 'kiri'); }
      else if (p.st === 'kiri' && this.d > p.dead) { p.st = 'marah'; this.say('“Kelewatan! Nggak mau bayar!”', 'bad'); }
    }
    // turun
    this.stopT = curb ? this.stopT + dt : 0;
    if (this.stopT >= 0.35) {
      const out = this.riders.filter(p => p.st === 'kiri' || p.st === 'marah');
      if (out.length) {
        let pay = 0; for (const p of out) { if (p.st === 'marah') this.missed++; else pay += this.spec.fare; }
        this.fares += pay; this.riders = this.riders.filter(p => !out.includes(p));
        this.pop(pay ? '+' + Math.round(pay) + ' rb' : 'Ogah bayar!', pay > 0);
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
      hits: this.hits, severe: this.severe, potholes: this.potholes, tilang: this.tilang, missed: this.missed, stolen: this.stolen, mogok: this.mogok };
  }
  kiriCount() { return this.riders.filter(p => p.st !== 'ride').length; }
}

/* ---------- gambar ---------- */
const SHOPS = ['WARUNG', 'APOTEK', 'FOTOKOPI', 'BAKSO', 'KONTER HP', 'BENGKEL', 'TOKO EMAS', 'MIE AYAM', 'LAUNDRY', 'MATERIAL', 'SEMBAKO', 'PANGKAS'];
const SHOP_C = ['#e4a33a', '#3f8f6b', '#c0573e', '#4f77b8', '#8c5aa8', '#d0b03a', '#5d6f7a', '#c46a8c'];
const SHIRT = ['#d9534f', '#3e7cb1', '#e6b33a', '#5aa469', '#8e6bbf', '#e07b39', '#f0f0f0', '#2f3d4a'];
const SKIN = ['#8d5a3b', '#a8714a', '#c68b5b', '#6f4630'];
const hash = n => { n = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b); n ^= n >>> 13; n = Math.imul(n, 0xc2b2ae35); return (n ^ (n >>> 16)) >>> 0; };

function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
function angkot(c, x, y, col, o) {
  o = o || {};
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.28)'; rr(c, -PW / 2 + 3, -PL / 2 + 5, PW, PL, 8); c.fill();
  c.fillStyle = col; c.strokeStyle = '#111'; c.lineWidth = 2; rr(c, -PW / 2, -PL / 2, PW, PL, 8); c.fill(); c.stroke();
  c.fillStyle = '#1d2a33'; rr(c, -PW / 2 + 5, -PL / 2 + 8, PW - 10, 14, 4); c.fill();            // kaca depan
  c.fillStyle = 'rgba(255,255,255,.85)'; c.fillRect(-PW / 2 + 3, -PL / 2 + 30, 3, PL - 44); c.fillRect(PW / 2 - 6, -PL / 2 + 30, 3, PL - 44); // list samping
  c.fillStyle = 'rgba(0,0,0,.18)'; rr(c, -PW / 2 + 8, -PL / 2 + 27, PW - 16, PL - 40, 3); c.fill();  // atap
  c.strokeStyle = 'rgba(0,0,0,.35)'; c.lineWidth = 1.5; for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-PW / 2 + 10, -PL / 2 + 34 + i * 10); c.lineTo(PW / 2 - 10, -PL / 2 + 34 + i * 10); c.stroke(); }
  c.fillStyle = '#1d2a33'; rr(c, -PW / 2 + 7, PL / 2 - 12, PW - 14, 7, 2); c.fill();               // kaca belakang
  c.fillStyle = '#fff'; c.font = '800 11px "Plus Jakarta Sans", sans-serif'; c.textAlign = 'center'; c.fillText(o.no || '', 0, 4);
  c.fillStyle = '#111'; c.fillRect(-PW / 2 - 4, -PL / 2 + 22, 4, 5); c.fillRect(PW / 2, -PL / 2 + 22, 4, 5);   // spion
  c.fillStyle = o.brake ? '#ff3b2f' : '#7a1d16'; c.fillRect(-PW / 2 + 3, PL / 2 - 4, 8, 3); c.fillRect(PW / 2 - 11, PL / 2 - 4, 8, 3);
  if (o.sein) { c.fillStyle = '#ffb000'; c.fillRect(-PW / 2 - 1, PL / 2 - 10, 4, 6); c.fillRect(-PW / 2 - 1, -PL / 2 + 2, 4, 6); }
  c.restore();
}
function motor(c, x, y, hue) {
  c.save(); c.translate(x, y);
  c.fillStyle = 'rgba(0,0,0,.25)'; c.beginPath(); c.ellipse(2, 3, 8, 17, 0, 0, 7); c.fill();
  c.fillStyle = '#222'; c.beginPath(); c.ellipse(0, 0, 6, 17, 0, 0, 7); c.fill();
  c.fillStyle = SHIRT[hue]; c.beginPath(); c.ellipse(0, 3, 8, 7, 0, 0, 7); c.fill();
  c.fillStyle = ['#e33', '#fc0', '#fff', '#39f', '#111', '#3c6'][hue]; c.beginPath(); c.arc(0, -3, 5.5, 0, 7); c.fill();
  c.restore();
}
function orang(c, x, y, seed, t, wave) {
  const h = hash(seed);
  c.fillStyle = 'rgba(0,0,0,.2)'; c.beginPath(); c.ellipse(x + 1, y + 7, 7, 4, 0, 0, 7); c.fill();
  c.fillStyle = SHIRT[h % 8]; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill();
  if (wave) { c.strokeStyle = SKIN[(h >>> 3) % 4]; c.lineWidth = 3; c.lineCap = 'round'; const a = Math.sin(t * 9 + seed) * 0.5; c.beginPath(); c.moveTo(x + 5, y - 2); c.lineTo(x + 13 + Math.cos(a) * 2, y - 10 + Math.sin(a) * 4); c.stroke(); }
  c.fillStyle = (h >>> 5) % 3 === 0 ? '#2b2b2b' : (h >>> 5) % 3 === 1 ? '#e8e2d0' : SKIN[(h >>> 3) % 4]; c.beginPath(); c.arc(x, y - 1, 4.5, 0, 7); c.fill();
}

function draw(c, S, H, o) {
  const d = S.d, PY = H * 0.74, sy = wd => PY - (wd - d);
  const top = d + PY + 60, bot = d - (H - PY) - 60;
  c.save();
  if (S.shake && !o.reduce) c.translate((Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
  // trotoar dan toko
  c.fillStyle = '#d9cfb6'; c.fillRect(0, 0, ROAD_L, H);
  for (let k = Math.floor(bot / 230); k <= Math.floor(top / 230); k++) {
    const h = hash(k + 77), y0 = sy(k * 230 + 214), hh = 200;
    c.fillStyle = SHOP_C[h % SHOP_C.length]; c.fillRect(0, y0, 38, hh);
    c.fillStyle = 'rgba(0,0,0,.18)'; c.fillRect(32, y0, 6, hh);
    c.save(); c.translate(19, y0 + hh / 2); c.rotate(-Math.PI / 2); c.fillStyle = '#fff'; c.font = '800 12px "Plus Jakarta Sans", sans-serif'; c.textAlign = 'center'; c.fillText(SHOPS[(h >>> 4) % SHOPS.length], 0, 4); c.restore();
  }
  c.fillStyle = '#b8ad94'; c.fillRect(ROAD_L - 6, 0, 6, H);
  // jalan
  c.fillStyle = o.wet ? '#2f383f' : '#3b454d'; c.fillRect(ROAD_L, 0, ROAD_R - ROAD_L, H);
  c.fillStyle = 'rgba(255,255,255,.75)';
  for (let m = Math.floor(bot / 44); m <= Math.floor(top / 44); m++) { const y = sy(m * 44 + 22); c.fillRect(142, y, 3, 22); c.fillRect(216, y, 3, 22); }
  c.fillStyle = '#e9e9e9'; c.fillRect(ROAD_L + 2, 0, 2, H);
  // median dan rumput
  c.fillStyle = '#e8c547'; c.fillRect(ROAD_R, 0, 4, H); c.fillStyle = '#7fae5c'; c.fillRect(ROAD_R + 4, 0, W - ROAD_R - 4, H);
  for (let k = Math.floor(bot / 120); k <= Math.floor(top / 120); k++) { const h = hash(k * 31 + 5), y = sy(k * 120 + (h % 60)); c.fillStyle = '#4f8a3c'; c.beginPath(); c.arc(318 + (h % 26), y, 14 + (h % 7), 0, 7); c.fill(); c.fillStyle = 'rgba(255,255,255,.12)'; c.beginPath(); c.arc(314 + (h % 26), y - 4, 6, 0, 7); c.fill(); }
  // papan awal/akhir
  if (sy(0) < H + 40) { c.fillStyle = '#fff'; c.fillRect(ROAD_L, sy(0) - 2, ROAD_R - ROAD_L, 4); c.fillStyle = '#111'; c.font = '800 12px "Plus Jakarta Sans", sans-serif'; c.textAlign = 'center'; c.fillText(o.from.toUpperCase(), 180, sy(0) + 20); }
  // lubang
  for (const p of S.pots) { const y = sy(p.d); if (y < -30 || y > H + 30) continue; c.fillStyle = p.used ? '#2a3136' : '#252b30'; c.beginPath(); c.ellipse(p.x, y, 13, 8, 0, 0, 7); c.fill(); c.strokeStyle = 'rgba(255,255,255,.12)'; c.lineWidth = 1.5; c.stroke(); }
  // polisi
  for (const p of S.police) {
    const y = sy(p.d), ys = sy(p.d - 520);
    if (ys > -30 && ys < H + 30) { c.fillStyle = '#fff'; c.strokeStyle = '#d33'; c.lineWidth = 3; c.fillStyle = '#666'; c.fillRect(323, ys, 3, 22); c.fillStyle = '#fff'; c.beginPath(); c.arc(324, ys, 12, 0, 7); c.fill(); c.stroke(); c.fillStyle = '#111'; c.font = '800 9px sans-serif'; c.textAlign = 'center'; c.fillText('40', 324, ys + 3); }
    if (y > -30 && y < H + 30) { c.fillStyle = '#5b4a2e'; c.beginPath(); c.arc(56, y, 8, 0, 7); c.fill(); c.fillStyle = '#e8d21a'; c.fillRect(48, y - 2, 16, 4); c.fillStyle = '#222'; c.beginPath(); c.arc(56, y - 1, 4.5, 0, 7); c.fill(); }
  }
  // kotak berhenti di lajur kiri
  for (const g of S.groups) {
    if (g.n <= 0 || g.d - d > 700 || g.d < d - 200) continue; const y = sy(g.d);
    c.fillStyle = g.prog > 0 ? 'rgba(46,204,113,.28)' : 'rgba(255,212,0,.16)'; c.fillRect(ROAD_L + 4, y - 50, 66, 100);
    c.strokeStyle = g.prog > 0 ? '#2ecc71' : '#ffd400'; c.lineWidth = 2; c.setLineDash([8, 6]); c.strokeRect(ROAD_L + 4, y - 50, 66, 100); c.setLineDash([]);
  }
  // penumpang menunggu
  for (const g of S.groups) {
    if (g.n <= 0) continue; const y = sy(g.d); if (y < -40 || y > H + 40) continue;
    for (let i = 0; i < g.n; i++) orang(c, 52 + (i % 2) * 10, y - 10 + i * 11, Math.floor(g.d) + i, S.t, i === 0);
    if (g.prog > 0) { c.strokeStyle = '#2ecc71'; c.lineWidth = 4; c.beginPath(); c.arc(56, y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.min(1, g.prog / 0.45)); c.stroke(); }
    else if (Math.abs(g.d - d) < 600) { c.fillStyle = '#fff'; rr(c, 28, y - 34, 22, 15, 4); c.fill(); c.fillStyle = '#111'; c.font = '800 10px "Plus Jakarta Sans", sans-serif'; c.textAlign = 'center'; c.fillText(g.n, 39, y - 23); }
  }
  // kendaraan
  for (const m of S.motors) { const y = sy(m.d); if (y > -30 && y < H + 30) motor(c, m.x, y, m.hue); }
  for (const b of S.biru) { const y = sy(b.d); if (y > -60 && y < H + 60) angkot(c, b.x, y, '#35b3c9', { no: '05', brake: b.state === 'ngetem', sein: b.g && b.state === 'jalan' }); }
  angkot(c, S.x, PY, o.hex, { no: o.route, brake: S.braking || S.v < 5, sein: S.x < CURB_X });
  // gelembung "kiri"
  const kiri = S.kiriCount();
  if (kiri) { const blink = Math.floor(S.t * 4) % 2; c.fillStyle = blink ? '#ffd400' : '#fff'; c.strokeStyle = '#111'; c.lineWidth = 2; rr(c, S.x - 38, PY - 86, 76, 26, 8); c.fill(); c.stroke(); c.fillStyle = '#111'; c.font = '800 14px "Plus Jakarta Sans", sans-serif'; c.textAlign = 'center'; c.fillText(`KIRI! ×${kiri}`, S.x, PY - 68); }
  for (const p of S.pops) { const y = sy(p.d) - 50 - p.t * 50; c.globalAlpha = 1 - p.t / 1.2; c.fillStyle = p.good ? '#1f9d55' : '#d33'; c.font = '800 18px "Plus Jakarta Sans", sans-serif'; c.textAlign = 'center'; c.fillText(p.text, p.x + 40, y); c.globalAlpha = 1; }
  // suasana
  if (o.sh === 2) { c.fillStyle = 'rgba(255,128,40,.12)'; c.fillRect(0, 0, W, H); }
  if (o.wet) { c.strokeStyle = 'rgba(200,220,255,.35)'; c.lineWidth = 1; c.beginPath(); for (let i = 0; i < 60; i++) { const x = (hash(i * 13) % W), y = ((hash(i * 7) % H) + S.t * 700 + i * 37) % H; c.moveTo(x, y); c.lineTo(x - 3, y + 12); } c.stroke(); }
  c.restore();
  // HUD
  const left = Math.max(0, Math.ceil(S.spec.dur - S.t));
  c.fillStyle = 'rgba(17,24,30,.82)'; c.fillRect(0, 0, W, 40);
  c.font = '800 15px "Plus Jakarta Sans", sans-serif'; c.textAlign = 'left'; c.fillStyle = left <= 10 ? '#ff6b5a' : '#fff'; c.fillText(`⏱ ${left}`, 12, 26);
  c.fillStyle = '#fff'; c.fillText(`👥 ${S.riders.length}/${S.spec.seats}`, 78, 26);
  c.textAlign = 'right'; c.fillStyle = '#ffd400'; c.fillText(`Rp ${Math.round(S.fares)} rb`, W - 12, 26);
  // speedometer
  const sp = S.v / S.vMax; c.fillStyle = 'rgba(17,24,30,.75)'; rr(c, W - 72, H - 34, 62, 22, 6); c.fill();
  c.fillStyle = sp > 0.82 ? '#ff6b5a' : '#7ddc8f'; c.fillRect(W - 66, H - 28, 50 * sp, 10);
  c.fillStyle = '#fff'; c.font = '700 9px sans-serif'; c.textAlign = 'center'; c.fillText(Math.round(sp * 60) + ' km/j', W - 41, H - 38);
  // pesan
  S.msgs.forEach((m, i) => { c.globalAlpha = Math.min(1, (2.6 - m.t) * 2); c.fillStyle = m.kind === 'bad' ? '#d33' : m.kind === 'good' ? '#1f9d55' : m.kind === 'kiri' ? '#b8860b' : '#1b2630'; rr(c, 80, 50 + i * 30, 200, 24, 12); c.fill(); c.fillStyle = '#fff'; c.font = '700 12px "Plus Jakarta Sans", sans-serif'; c.textAlign = 'center'; c.fillText(m.text, 180, 66 + i * 30); c.globalAlpha = 1; });
}

/* ---------- pasang di halaman ---------- */
function mount(host, spec, opts, done) {
  const esc = t => String(t).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
  host.innerHTML = `<div class="nyetir" role="application" aria-label="Nyetir angkot">
    <div class="ny-kanvas"><canvas></canvas>
      <div class="ny-lapis" data-ny="intro"><div class="ny-kartu"><span class="eyebrow">Rit ${esc(opts.shiftName)} · Trayek ${esc(spec.route)}</span><h2>${esc(spec.from)} → ${esc(spec.to)}</h2>
        <ul><li><b>Geser jari</b> kiri-kanan untuk setir. Di keyboard: panah dan spasi.</li><li>Tahan <b>REM</b>. Lepas, angkot jalan sendiri.</li>
        <li>Orang melambai di trotoar: <b>menepi ke lajur kiri dan berhenti</b> di dekatnya.</li><li>Ada yang teriak <b>“Kiri!”</b>: menepi dan berhenti. Ongkos dibayar waktu turun. Kelewatan, dia tidak mau bayar.</li>
        <li>Awas motor, lubang, dan polisi. Angkot biru suka menyerobot penumpang.</li></ul>
        ${spec.wet ? '<p><b>Hujan:</b> rem lebih licin, penumpang lebih banyak.</p>' : ''}${spec.wobble ? '<p><b>Kamu ngantuk:</b> setir agak goyang.</p>' : ''}
        <p>Tarif ±Rp ${spec.tarif} rb per penumpang.</p>
        <button class="gas" data-ny="go">Gas!</button><button class="btn-teks" data-ny="auto">Narik otomatis saja</button></div></div>
    </div>
    <div class="ny-kontrol"><p>Geser jari di jalan untuk setir</p><button class="rem" data-ny="rem" aria-label="Rem">REM</button></div></div>`;
  const root = host.firstElementChild, cv = root.querySelector('canvas'), box = root.querySelector('.ny-kanvas'), c = cv.getContext('2d');
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const S = new Sim(spec); let H = 640, k = 1, raf = 0, last = 0, running = false, closed = false;
  const inp = { tx: null, brake: false }, keys = {};
  function size() {
    const r = box.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1);
    k = r.width / W; H = Math.max(420, Math.round(r.height / k));
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(H * k * dpr); cv.style.width = r.width + 'px'; cv.style.height = (H * k) + 'px';
    c.setTransform(k * dpr, 0, 0, k * dpr, 0, 0);
  }
  const o = { hex: opts.hex, route: spec.route, from: spec.from, wet: spec.wet, sh: spec.sh, reduce };
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000 || 0); last = now;
    if (keys.l || keys.r) inp.tx = S.x + (keys.r ? 70 : 0) - (keys.l ? 70 : 0);
    inp.brake = keys.b || remDown;
    if (running) S.step(dt, inp);
    draw(c, S, H, o);
    if (S.over && running) { running = false; end(); }
    if (!closed) raf = requestAnimationFrame(frame);
  }
  function end() {
    const R = S.result(), L = root.querySelector('.ny-lapis');
    const lines = [`${R.riders} penumpang naik. Ongkos terkumpul <b>Rp ${R.fares} rb</b>.`];
    if (S.endPay) lines.push(`Sisa penumpang turun di ${esc(spec.to)}: Rp ${Math.round(S.endPay)} rb.`);
    if (R.missed) lines.push(`${R.missed} penumpang kelewatan turun dan ngomel.`);
    if (R.stolen) lines.push(`${R.stolen} penumpang diserobot angkot biru.`);
    if (R.hits) lines.push(`Nyerempet ${R.hits}×${R.severe ? `, ${R.severe} parah` : ''}.`);
    if (R.potholes) lines.push(`Masuk lubang ${R.potholes}×.`);
    if (R.tilang) lines.push('Kena tilang.');
    if (R.mogok) lines.push('Angkot mogok di jalan.');
    L.innerHTML = `<div class="ny-kartu"><span class="eyebrow">${R.mogok ? 'Mogok' : 'Rit selesai'}</span><h2>${R.mogok ? 'Mesin mati' : 'Sampai ' + esc(spec.to)}</h2><ul>${lines.map(x => `<li>${x}</li>`).join('')}</ul><button class="gas" data-ny="done">Lanjut</button></div>`;
    L.hidden = false; L.querySelector('button').focus();
  }
  function close(res) { closed = true; cancelAnimationFrame(raf); window.removeEventListener('keydown', kd); window.removeEventListener('keyup', ku); window.removeEventListener('resize', size); host.innerHTML = ''; done(res); }
  let remDown = false, steering = false;
  const lx = e => { const r = cv.getBoundingClientRect(); return (e.clientX - r.left) / k; };
  cv.addEventListener('pointerdown', e => { steering = true; inp.tx = lx(e); cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => { if (steering) inp.tx = lx(e); });
  const up = () => { steering = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  const rem = root.querySelector('[data-ny="rem"]');
  rem.addEventListener('pointerdown', e => { remDown = true; rem.classList.add('on'); rem.setPointerCapture(e.pointerId); e.preventDefault(); });
  const remUp = () => { remDown = false; rem.classList.remove('on'); };
  rem.addEventListener('pointerup', remUp); rem.addEventListener('pointercancel', remUp); rem.addEventListener('lostpointercapture', remUp);
  rem.addEventListener('contextmenu', e => e.preventDefault());
  const KM = { ArrowLeft: 'l', a: 'l', A: 'l', ArrowRight: 'r', d: 'r', D: 'r', ' ': 'b', ArrowDown: 'b', s: 'b', S: 'b' };
  function kd(e) { const m = KM[e.key]; if (m && running) { keys[m] = true; e.preventDefault(); } }
  function ku(e) { const m = KM[e.key]; if (m) { keys[m] = false; if (m !== 'b') inp.tx = S.x; } }
  window.addEventListener('keydown', kd); window.addEventListener('keyup', ku); window.addEventListener('resize', size);
  root.addEventListener('click', e => {
    const b = e.target.closest('[data-ny]'); if (!b) return; const a = b.dataset.ny;
    if (a === 'go') { b.closest('.ny-lapis').hidden = true; running = true; cv.focus && cv.focus(); }
    if (a === 'auto') close(null);
    if (a === 'done') close(S.result());
  });
  size(); raf = requestAnimationFrame(t => { last = t; frame(t); });
  root.querySelector('[data-ny="go"]').focus();
  return { sim: S };
}

const API = { Sim, mount, LANES, CURB_X, W };
root.NARIK_DRIVE = API;
if (typeof module !== 'undefined') module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
