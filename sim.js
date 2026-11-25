const G = require('./game.js');
function pickEvent(s, ev, pol) {
  const oks = ev.choices.map((c, i) => c.ok ? i : -1).filter(i => i >= 0);
  if (pol === 'last') return oks[oks.length - 1];
  return oks[0];
}
function playScenes(s, when, pol) {
  let guard = 0;
  while (guard++ < 10) {
    const sc = G.scenes(s, when); if (!sc.length) break;
    for (const x of sc) { let ch = null; if (x.choices) { const oks = x.choices.map((c, i) => c.ok ? i : -1).filter(i => i >= 0); ch = x.id === 'dimas2' ? (pol.dimas === 'full' ? oks[0] : oks[oks.length - 1]) : oks[0]; } G.sceneDone(s, x.id, ch); }
  }
}
function selfMode(s, sh, pol) {
  if (pol.self === 'normal') return s.stamina < 20 ? 'istirahat' : 'normal';
  if (pol.self === 'lazy') return sh === 1 ? 'istirahat' : 'normal';
  if (pol.self === 'gas') return s.stamina >= 30 ? 'ngebut' : 'istirahat';
  // smart
  const a = s.fleet.find(x => x.driver === 'self'); if (!a) return 'normal'; const base = G.ROUTES[a.route].base[sh] * G.demand(s, a.route, sh);
  if (s.stamina < 22) return 'istirahat';
  if (sh === 1 && s.stamina < 48) return 'istirahat';
  if (base > 100 && s.stamina >= 50 && a.cond > 48) return 'ngebut';
  if (s.stamina < 35) return 'ngetem';
  return 'normal';
}
function manage(s, pol) {
  for (const a of s.fleet) {
    if (a.cond < (pol.svc || 46) && s.money >= 120) G.service(s, a.id, s.money > 700 && a.cond < 40 ? 'besar' : 'ringan');
  }
  if (s.bab >= 2) {
    // buy
    const order = ['titip', 'tua', 'baru'];
    for (const k of order) { const K = G.DEALER[k]; if (s.fleet.length < 5 && s.money >= K.price + 150 && !(K.once && s.flags['beli_' + k])) { if (k === 'baru' && s.fleet.filter(a => a.loan).length >= 2) continue; G.buy(s, k); break; } }
    for (const id of [...s.cand]) if (s.fleet.length > Object.values(s.drivers).filter(d => d.hired).length + (pol.selfB2 ? 1 : 0)) G.hire(s, id);
    if (!s.routes['09'] && s.fleet.length >= 3 && s.money >= 800) G.openRoute(s, '09');
    if (!s.routes['12'] && s.fleet.length >= 4 && s.money >= 1900) G.openRoute(s, '12');
    // assign
    const free = G.freeDrivers(s);
    for (const a of s.fleet) { if (!a.driver) { if (pol.selfB2 && !s.fleet.some(x => x.driver === 'self')) G.assign(s, a.id, 'self'); else if (free.length) G.assign(s, a.id, free.shift().id); } }
    if (!pol.selfB2) { const me = s.fleet.find(a => a.driver === 'self'); const f = G.freeDrivers(s); if (me && f.length) G.assign(s, me.id, f[0].id); }
    const open = Object.keys(s.routes).filter(r => s.routes[r]);
    s.fleet.forEach((a, i) => { const r = open[i % open.length]; if (a.route !== r) G.setRoute(s, a.id, r); if (pol.setK && G.drv(s, a)) G.setSetoran(s, a.id, G.expNet(a.route) * pol.setK); });
  }
}
function run(seed, pol, maxDay) {
  const s = G.newGame('Tes', seed); const log = { paidDay: null, fleetDay: {}, quits: 0 };
  while (s.day <= maxDay && !s.over) {
    playScenes(s, 'pagi', pol); manage(s, pol); G.depart(s);
    for (let sh = 0; sh < 3; sh++) { const ev = G.rollEvent(s, sh); if (ev) G.resolveEvent(s, pickEvent(s, ev, pol.ev)); G.runShift(s, sh, selfMode(s, sh, pol)); }
    G.endDay(s);
    if (s.bab === 1 && pol.early && G.debtLeft(s) > 0) { const due = G.nextDue(s); if (s.money > 300) G.payDebt(s, s.money - 250); }
    playScenes(s, 'malam', pol);
    if (s.flags.lunas && log.paidDay == null) log.paidDay = s.flags.lunas;
    if (!log.fleetDay[s.fleet.length]) log.fleetDay[s.fleet.length] = s.day;
    if (pol.stopB1 && s.bab === 1 && s.flags.lunas) break;
    if (s.flags.tamat) break;
    G.nextDay(s);
  }
  log.s = s; return log;
}
const N = 300;
function report(name, pol, maxDay) {
  let win30 = 0, win40 = 0, sita = 0, days = [], money = [], f = {2: [], 3: [], 4: [], 5: []}, tamat = [], quits = 0, rep = 0, cuti = 0;
  for (let i = 0; i < N; i++) { const L = run(1000 + i * 7919, pol, maxDay); const s = L.s;
    if (L.paidDay && L.paidDay <= 30) win30++; if (L.paidDay) { win40++; days.push(L.paidDay); } if (s.over) sita++;
    money.push(s.money); rep += s.rep; if (s.flags.semester === 'cuti') cuti++;
    for (const k of [2, 3, 4, 5]) if (L.fleetDay[k]) f[k].push(L.fleetDay[k] - (s.flags.bab2day || 0));
    if (s.flags.tamat) tamat.push(s.flags.tamat - s.flags.bab2day);
    quits += Object.values(s.drivers).filter(d => d.gone).length; }
  const avg = a => a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : '-';
  console.log(name.padEnd(26), 'lunas≤30:', (100 * win30 / N).toFixed(0) + '%', '| lunas:', (100 * win40 / N).toFixed(0) + '%', '| sita:', (100 * sita / N).toFixed(0) + '%', '| hari lunas:', avg(days), '| uang akhir:', avg(money), '| rep:', (rep / N).toFixed(0), '| cuti:', (100 * cuti / N).toFixed(0) + '%',
    maxDay > 45 ? `| B2 hari→ 2:${avg(f[2])} 3:${avg(f[3])} 4:${avg(f[4])} 5:${avg(f[5])} tamat:${(100 * tamat.length / N).toFixed(0)}%@${avg(tamat)} quit:${(quits / N).toFixed(2)}` : '');
}
console.log('--- BAB 1 ---');
report('santai (istirahat siang)', { self: 'lazy', ev: 'first', stopB1: true, dimas: 'cuti' }, 42);
report('biasa, Dimas cuti', { self: 'normal', ev: 'first', stopB1: true, dimas: 'cuti' }, 42);
report('biasa, Dimas lunas', { self: 'normal', ev: 'first', stopB1: true, dimas: 'full' }, 42);
report('gaspol, Dimas lunas', { self: 'gas', ev: 'first', stopB1: true, dimas: 'full' }, 42);
report('pintar, Dimas lunas', { self: 'smart', ev: 'first', stopB1: true, dimas: 'full' }, 42);
report('pintar, pilihan terakhir', { self: 'smart', ev: 'last', stopB1: true, dimas: 'full' }, 42);
console.log('--- BAB 1+2 ---');
report('pintar + ikut narik', { self: 'smart', ev: 'first', dimas: 'full', selfB2: true }, 140);
report('pintar, tidak narik', { self: 'smart', ev: 'first', dimas: 'full', selfB2: false }, 140);
report('setoran tinggi 0.80', { self: 'smart', ev: 'first', dimas: 'full', selfB2: true, setK: 0.80 }, 140);
report('setoran sangat tinggi 1.0', { self: 'smart', ev: 'first', dimas: 'full', selfB2: true, setK: 1.0 }, 140);
report('setoran 0.65', { self: 'smart', ev: 'first', dimas: 'full', selfB2: true, setK: 0.65 }, 140);
report('setoran rendah 0.40', { self: 'smart', ev: 'first', dimas: 'full', selfB2: true, setK: 0.40 }, 140);
