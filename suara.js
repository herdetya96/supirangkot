/* NARIK — suara dan getar mini-game nyetir (window.NARIK_SUARA).
   Semua bunyi disintesis dengan Web Audio, tanpa berkas audio. Pilihan hidup/mati di localStorage kunci `narik-suara`
   ('0' = mati), dan getar ikut pilihan yang sama. AudioContext baru dibuat di gestur pengguna pertama (tombol Gas!),
   karena browser HP menolak bunyi sebelum itu. */
(function (root) {
'use strict';
const KEY = 'narik-suara';
let ctx = null, master = null, noise = null, on = load();
function load() { try { return localStorage.getItem(KEY) !== '0'; } catch (e) { return true; } }
function setOn(v) {
  on = !!v; try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* tanpa penyimpanan tetap jalan */ }
  if (master) master.gain.setTargetAtTime(on ? 0.8 : 0, ctx.currentTime, 0.03);
}
function ensure() {
  if (!ctx) {
    const AC = root.AudioContext || root.webkitAudioContext; if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain(); master.gain.value = on ? 0.8 : 0;
    const comp = ctx.createDynamicsCompressor(); master.connect(comp); comp.connect(ctx.destination);
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const ch = noise.getChannelData(0); for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
    // tab disembunyikan: bunyi mesin yang terus menyala dihentikan
    if (root.document) root.document.addEventListener('visibilitychange', () => { if (!ctx) return; if (root.document.hidden) ctx.suspend(); else ctx.resume(); });
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/* ---------- potongan bunyi ---------- */
function env(g, t, a, peak, hold, rel) {
  g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + a);
  g.gain.setValueAtTime(peak, t + a + hold); g.gain.exponentialRampToValueAtTime(0.0001, t + a + hold + rel);
}
function osc(type, f, t, dur, peak, opt) {
  opt = opt || {};
  const o = ctx.createOscillator(), g = ctx.createGain(); o.type = type; o.frequency.setValueAtTime(f, t);
  if (opt.to) o.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
  if (opt.vib) { const l = ctx.createOscillator(), lg = ctx.createGain(); l.frequency.value = opt.vib[0]; lg.gain.value = opt.vib[1]; l.connect(lg); lg.connect(o.frequency); l.start(t); l.stop(t + dur + 0.05); }
  let node = o;
  if (opt.lp || opt.bp) { const f2 = ctx.createBiquadFilter(); f2.type = opt.lp ? 'lowpass' : 'bandpass'; f2.frequency.value = opt.lp || opt.bp; f2.Q.value = opt.q || 1; o.connect(f2); node = f2; }
  node.connect(g); g.connect(master); env(g, t, opt.a || 0.005, peak, opt.hold || 0, dur);
  o.start(t); o.stop(t + (opt.a || 0.005) + (opt.hold || 0) + dur + 0.05);
}
function hiss(t, dur, peak, type, f, opt) {
  opt = opt || {};
  const s = ctx.createBufferSource(), fl = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noise; s.loop = true; fl.type = type; fl.frequency.setValueAtTime(f, t); fl.Q.value = opt.q || 1;
  if (opt.to) fl.frequency.exponentialRampToValueAtTime(opt.to, t + dur);
  s.connect(fl); fl.connect(g); g.connect(master); env(g, t, opt.a || 0.005, peak, opt.hold || 0, dur);
  s.start(t, Math.random() * 0.5); s.stop(t + (opt.a || 0.005) + (opt.hold || 0) + dur + 0.05);
}
const last = {};
const FX = {
  // klakson angkot: dua nada sumbang
  tin(t) { osc('square', 392, t, 0.06, 0.16, { lp: 1800, hold: 0.2 }); osc('square', 494, t, 0.06, 0.12, { lp: 1800, hold: 0.2 }); },
  // koin dan uang kertas: ongkos dibayar
  bayar(t) { osc('sine', 2093, t, 0.18, 0.12); osc('sine', 2637, t + 0.06, 0.25, 0.1); osc('sine', 3136, t + 0.12, 0.3, 0.07); },
  // pintu geser dan langkah naik
  naik(t) { hiss(t, 0.28, 0.12, 'bandpass', 1400, { to: 500, q: 2 }); osc('sine', 110, t + 0.22, 0.12, 0.25, { to: 60 }); },
  // penumpang mengetuk koin ke kaca: tek-tek-tek, tanda minta turun
  kiri(t) { for (let i = 0; i < 3; i++) osc('triangle', 3300, t + i * 0.11, 0.04, 0.18, { bp: 3300, q: 3 }); },
  marah(t) { osc('square', 200, t, 0.35, 0.08, { to: 110, lp: 900 }); },
  serempet(t) { hiss(t, 0.3, 0.3, 'bandpass', 1600, { q: 2, to: 900 }); osc('sawtooth', 160, t, 0.25, 0.08, { lp: 700, vib: [40, 30] }); },
  tabrak(t) { osc('sine', 95, t, 0.4, 0.6, { to: 38 }); hiss(t, 0.5, 0.45, 'lowpass', 1400, { to: 300 }); hiss(t + 0.05, 0.25, 0.2, 'bandpass', 3200, { q: 2 }); },
  // ban berdecit
  selip(t) { osc('sawtooth', 1150, t, 0.5, 0.09, { bp: 1300, q: 6, vib: [32, 70], hold: 0.1 }); },
  decit(t) { if (t - (last.decit || 0) < 0.8) return; last.decit = t; osc('sawtooth', 1250, t, 0.35, 0.05, { bp: 1400, q: 6, vib: [30, 60], a: 0.05 }); },
  lubang(t) { osc('sine', 75, t, 0.2, 0.5, { to: 42 }); hiss(t, 0.15, 0.25, 'lowpass', 350); },
  // peluit polisi
  tilang(t) { for (const d of [0, 0.42]) osc('sine', 2900, t + d, 0.08, 0.13, { vib: [27, 160], hold: 0.25 }); },
  mogok(t) { for (let i = 0; i < 3; i++) osc('sawtooth', 50 - i * 6, t + i * 0.22, 0.14, 0.18 - i * 0.04, { lp: 300 }); }
};
const BUZZ = { tabrak: 140, serempet: 50, selip: 70, lubang: 40, tilang: [50, 60, 50], mogok: [80, 60, 80] };
function play(name) {
  if (!on) return;
  if (ctx && master && FX[name] && ctx.state === 'running') FX[name](ctx.currentTime + 0.01);
  if (BUZZ[name] && root.navigator && root.navigator.vibrate) { try { root.navigator.vibrate(BUZZ[name]); } catch (e) { /* abaikan */ } }
}

/* ---------- mesin: dengung yang naik-turun dengan laju dan gas, pindah gigi di empat titik ---------- */
const GEAR = [0, 0.18, 0.42, 0.68, 1.01];
function engine(wet) {
  if (!ensure()) return null;
  const t = ctx.currentTime;
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), lp = ctx.createBiquadFilter(), g = ctx.createGain();
  o1.type = 'sawtooth'; o2.type = 'square'; lp.type = 'lowpass'; lp.Q.value = 2; g.gain.value = 0;
  o1.frequency.value = 26; o2.frequency.value = 13; lp.frequency.value = 300;
  const g2 = ctx.createGain(); g2.gain.value = 0.5;
  o1.connect(lp); o2.connect(g2); g2.connect(lp); lp.connect(g); g.connect(master); o1.start(t); o2.start(t);
  let rain = null;
  if (wet) {
    const s = ctx.createBufferSource(), hp = ctx.createBiquadFilter(), rg = ctx.createGain();
    s.buffer = noise; s.loop = true; hp.type = 'highpass'; hp.frequency.value = 900; rg.gain.value = 0;
    s.connect(hp); hp.connect(rg); rg.connect(master); s.start(t); rg.gain.setTargetAtTime(0.05, t, 0.5); rain = { s, rg };
  }
  let dead = false;
  return {
    update(S, inp) {
      if (dead) return; const now = ctx.currentTime;
      if (S.mogok || S.over) { g.gain.setTargetAtTime(0, now, 0.15); return; }
      const s = Math.min(1, Math.abs(S.v) / S.vMax); let i = 0; while (i < 3 && s >= GEAR[i + 1]) i++;
      const rpm = 0.25 + 0.75 * (s - GEAR[i]) / (GEAR[i + 1] - GEAR[i]), load = inp.gas ? 1 : 0;
      const f = 24 + 62 * rpm + 6 * load;
      o1.frequency.setTargetAtTime(f, now, 0.06); o2.frequency.setTargetAtTime(f / 2, now, 0.06);
      lp.frequency.setTargetAtTime(260 + 700 * rpm * (0.5 + 0.5 * load), now, 0.08);
      g.gain.setTargetAtTime(0.05 + 0.05 * load + 0.03 * rpm, now, 0.08);
    },
    stop() {
      if (dead) return; dead = true; const now = ctx.currentTime;
      g.gain.setTargetAtTime(0, now, 0.1); o1.stop(now + 0.6); o2.stop(now + 0.6);
      if (rain) { rain.rg.gain.setTargetAtTime(0, now, 0.2); rain.s.stop(now + 1); }
    }
  };
}

root.NARIK_SUARA = { ensure, play, engine, get on() { return on; }, setOn };
})(typeof window !== 'undefined' ? window : globalThis);
