/* Uji setir pemain (tanpa browser). Jalankan: node tools/uji/setir.js   (atau npm run uji:setir)
   1. Pindah lajur dengan tombol: tahan ▶ sebentar lalu lepas, di tiga laju. Harus berhenti pas di tengah lajur.
   2. Persimpangan: belok dengan menahan tombol ke arah panah (di mulut simpang / sedikit lebih awal), ngebut, dan tidak menekan.
   3. Bot "jempol tombol" (reaksi 0,25 dtk, pelan di persimpangan) memainkan 150 rit: penumpang, ongkos, kebablasan.
   Pakai setiap kali fisika setir di drive.js diubah (drivebot.js tidak memakai setir pemain). */
const path = require('path');
const D = require(path.join(__dirname, '..', '..', 'drive.js'));
const G = require(path.join(__dirname, '..', '..', 'game.js'));
const kosong = r => ({ seed: 3, route: r, dur: 300, groups: [], traffic: [], biru: [], potholes: [], police: [], fare: 8, seats: 12, vMax: 340 });

console.log('--- 1. pindah lajur (tombol ditahan lalu dilepas; nilai tombol naik 4/dtk, turun 6/dtk seperti di mount)');
for (const v of [60, 150, 250]) for (const hold of [0.15, 0.35, 0.7]) {
  const S = new D.Sim(kosong('05')); S.lights = []; S.d = S.world.straights.find(g => g.len > 2200).d0 + 100;
  let sv = 0, t = 0, maxPsi = 0, maxX = 0; S.v = v;
  while (t < 5) { const want = t < hold ? 1 : 0, rate = want ? 4 : 6; sv += Math.max(-rate * 0.02, Math.min(rate * 0.02, want - sv)); S.step(0.02, { gas: S.v < v ? 1 : 0, steer: sv }); t += 0.02; maxPsi = Math.max(maxPsi, Math.abs(S.psi)); maxX = Math.max(maxX, S.x); }
  const pas = D.LANES.some(l => Math.abs(l - S.x) < 3);
  console.log(`laju ${String(v).padStart(3)} tahan ${hold}s: akhir x=${S.x.toFixed(0)} ${pas ? 'pas di lajur' : 'MELESET'} | x maks ${maxX.toFixed(0)} | sudut maks ${(maxPsi * 57.3).toFixed(0)}°`);
}

console.log('--- 2. persimpangan (trayek 05)');
const W = D.buildWorld('05');
console.log(W.junctions.map(j => `${j.nama} ${j.dir > 0 ? 'kiri' : 'kanan'} d${Math.round(j.d0)}`).join(' | '));
function simpang(how, lane) {
  const S = new D.Sim(kosong('05')); S.lights = []; S.x = D.LANES[lane]; let maxDx = 0;
  while (!S.over && S.d < S.world.dest.d) {
    const j = S.world.junctions.find(j => j.d1 > S.d && j.d0 - S.d < 300);
    let v = 300; if (j && how !== 'ngebut') v = Math.min(v, S.turnV((j.d0 + j.d1) / 2, S.x) - 10);
    const k = S.world.at(S.d).k, kk = how === 'awal' ? (k || S.world.at(S.d + 40).k) : k;
    const inp = { gas: S.v < v ? 1 : 0, brake: S.v > v + 15 };
    inp.steer = how === 'diam' ? 0 : kk ? -Math.sign(kk) * 0.6 : Math.max(-1, Math.min(1, -S.psi * 2 + (D.LANES[lane] - S.x) * 0.01));
    S.step(0.02, inp); maxDx = Math.max(maxDx, Math.abs(S.x - D.LANES[lane]));
  }
  console.log(`${how.padEnd(7)} lajur ${lane}: meleset maks ${maxDx.toFixed(0).padStart(3)} unit | kebablasan ${S.skids}`);
}
for (const lane of [0, 1, 2]) simpang('mulut', lane);
for (const lane of [0, 1, 2]) simpang('awal', lane);
simpang('ngebut', 1); simpang('diam', 1);

console.log('--- 3. bot jempol tombol, 150 rit');
function rit(seed) {
  const s = G.newGame('b', seed); s.day = 2 + seed % 20; G.startDay(s); s.today.force = null; G.depart(s);
  const S = new D.Sim(G.driveSpec(s, seed % 3)); let st = 0, plan = 0;
  while (!S.over) {
    const inp = { gas: 1, brake: false, steer: st };
    const want = S.riders.some(r => r.st !== 'ride') || S.groups.some(g => !g.taken && g.n > 0 && g.d > S.d - 30 && g.d - S.d < 900 && S.riders.length < 12);
    plan -= 1 / 30;
    if (plan <= 0) {
      plan = 0.15; const tx = want ? D.LANES[0] : D.LANES[1], kk = S.world.at(S.d + 20).k, lv = S.v * Math.sin(S.psi);
      st = kk ? -Math.sign(kk) : Math.abs(tx - S.x) > 20 + Math.abs(lv) * 0.4 ? Math.sign(tx - S.x) : 0; inp.steer = st;
    }
    const g = S.groups.find(g => !g.taken && g.n > 0 && g.d > S.d - 40 && g.d - S.d < 260);
    if ((g && S.x < D.CURB_X && g.d - S.d < S.v * S.v / 1080 + 30) || (S.riders.some(r => r.st !== 'ride') && S.x < D.CURB_X)) { inp.brake = true; inp.gas = 0; }
    if (S.v > 220) inp.gas = 0;
    const j = S.world.junctions.find(j => j.d1 > S.d && j.d0 - S.d < 250); if (j && S.v > S.turnV((j.d0 + j.d1) / 2, S.x) - 10) { inp.gas = 0; inp.brake = true; }
    const L = S.nextLight(S.d + 42); if (L && S.lightState(L) !== 'hijau' && L.d - 70 - S.d - 42 < S.v * S.v / 1080 + 30 && L.d - 70 - S.d - 42 > -2) { inp.brake = true; inp.gas = 0; }
    S.step(1 / 30, inp);
  }
  return S.result();
}
let n = 0, naik = 0, ongkos = 0, miss = 0, sk = 0;
for (let i = 0; i < 150; i++) { const r = rit(300 + i); n++; naik += r.riders; ongkos += r.fares; miss += r.missed; sk += r.skids; }
console.log(`naik ${(naik / n).toFixed(1)} | ongkos Rp ${(ongkos / n).toFixed(0)} rb | kelewatan ${(miss / n).toFixed(1)} | kebablasan ${(sk / n).toFixed(2)}`);
