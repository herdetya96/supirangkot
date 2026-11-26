/* Bot sopir untuk menyeimbangkan mini-game nyetir. `node drivebot.js`
   Membandingkan ongkos hasil nyetir dengan pendapatan rit mode "Narik biasa" (rasio 1,00 = sama). */
const G = require('./game.js');
const DR = require('./drive.js');
const BRAKE = 540;

function policy(S, p) {
  const inp = { tx: DR.LANES[1], brake: false };
  const need = S.riders.some(r => r.st !== 'ride' && (p.kiri || r.st === 'marah'));
  const free = S.riders.length < S.spec.seats;
  const stopDist = S.v * S.v / (2 * BRAKE * S.brakeK) + 12;
  let target = null;
  if (free) target = S.groups.find(g => !g.taken && g.n > 0 && g.d > S.d - 40 && g.d - S.d < p.look);
  if (need) { inp.tx = DR.LANES[0]; if (S.x < DR.CURB_X + 4) inp.brake = true; }
  else if (target) {
    inp.tx = DR.LANES[0];
    if (S.x < DR.CURB_X + 4 && target.d - S.d <= stopDist) inp.brake = true;
    if (Math.abs(target.d - S.d) < 50 && S.x < DR.CURB_X) inp.brake = true;
  }
  // hindari lubang kalau tidak sedang menepi
  if (p.careful && !inp.brake && S.x > DR.CURB_X - 10) { const pot = S.pots.find(q => !q.used && q.d > S.d && q.d - S.d < 90 + S.v * 0.4 && Math.abs(q.x - inp.tx) < 35); if (pot) inp.tx = DR.LANES.filter(l => Math.abs(l - pot.x) >= 35).sort((x, y) => Math.abs(x - S.x) - Math.abs(y - S.x))[0]; }
  // hindari kendaraan di depan
  const veh = S.cars.concat(S.biru);
  const ahead = veh.map(o => ({ x: o.x, d: o.d - o.l / 2, v: o.state === 'ngetem' ? 0 : o.v, w: o.w }))
    .filter(o => o.d > S.d && o.d - S.d < 70 + S.v * 0.6 && Math.abs(o.x - inp.tx) < (o.w + 44) / 2 + 4 && o.v < S.v);
  if (ahead.length && !inp.brake) {
    const lanes = DR.LANES.filter(l => !veh.some(o => o.d + o.l / 2 > S.d - 60 && o.d - o.l / 2 - S.d < 200 && Math.abs(o.x - l) < (o.w + 44) / 2 + 2));
    if (lanes.length) inp.tx = lanes.sort((a, b) => Math.abs(a - S.x) - Math.abs(b - S.x))[0];
    else inp.brake = true;
  }
  // lampu merah, palang kereta, tikungan
  const L = p.nekat ? null : S.nextLight(S.d + DR.PL / 2);
  if (L) { const gap = L.d - 70 - (S.d + DR.PL / 2), st = S.lightState(L); if (st !== 'hijau' && gap > -2 && gap < stopDist + 25 && !(st === 'kuning' && gap < 30 && p.careful === false)) inp.brake = true; }
  // persimpangan: rem supaya masuk belokan di bawah laju aman lajurnya (S.turnV)
  if (p.careful) { for (let a = 0; a < 480; a += 20) { const vt = S.turnV(S.d + a, inp.tx) - 12; if (S.v > vt && (S.v * S.v - vt * vt) / (2 * BRAKE * S.brakeK) + 25 > a) { inp.brake = true; break; } } }
  inp.gas = 1;
  if (p.careful && S.police.some(q => !q.done && q.d - S.d < 650) && S.v > 0.78 * S.vMax) inp.brake = true;
  if (inp.brake) inp.gas = 0;
  return inp;
}
function play(spec, p) { const S = new DR.Sim(spec); while (!S.over) S.step(1 / 30, policy(S, p)); return S.result(); }

const POL = {
  rapi: { look: 900, kiri: true, careful: true },
  ceroboh: { look: 350, kiri: false, careful: false },
  nekat: { look: 900, kiri: true, careful: false, nekat: true }
};
const N = 200;
for (const [name, p] of Object.entries(POL)) {
  let ratio = 0, riders = 0, hits = 0, skids = 0, merah = 0, severe = 0, missed = 0, stolen = 0, tilang = 0, pots = 0, avgV = 0;
  for (let i = 0; i < N; i++) {
    const s = G.newGame('Bot', 500 + i * 131); s.day = 2 + (i % 28); s.wx.today = i % 5 === 0 ? 'hujan' : 'cerah';
    G.startDay(s); s.today.force = null; G.depart(s);
    s.fleet[0].route = ['05', '09', '12'][i % 3]; const sh = i % 3, spec = G.driveSpec(s, sh), R = play(spec, p);
    const a = s.fleet[0], normal = spec.fare * G.DRIVE.par * G.demand(s, a.route, sh);
    ratio += R.fares / normal; riders += R.riders; hits += R.hits; severe += R.severe; missed += R.missed; stolen += R.stolen; tilang += R.tilang; merah += R.merah; skids += R.skids; pots += R.potholes; avgV += R.avgV;
  }
  const f = v => (v / N).toFixed(2);
  console.log(name.padEnd(8), 'ongkos/biasa:', f(ratio), '| naik:', f(riders), '| serempet:', f(hits), 'tikungan:', f(skids), 'parah:', f(severe), '| lubang:', f(pots), '| kelewatan:', f(missed), '| diserobot:', f(stolen), '| tilang:', f(tilang), 'merah:', f(merah), '| laju:', f(avgV));
}
