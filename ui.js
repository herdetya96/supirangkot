/* NARIK — tampilan. Semua aturan main ada di game.js. */
(function () {
'use strict';
const G = window.NARIK, app = document.getElementById('app'), KEY = 'narik-save-v1';
app.innerHTML = '<div id="v"></div><div id="ny"></div><div id="roti" class="roti" hidden role="status"></div>';
const V = document.getElementById('v'), roti = document.getElementById('roti'), NY = document.getElementById('ny');
const fmt = G.fmt;
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const HEX = { hijau: '#1a8f4c', biru: '#35b3c9', kuning: '#f2b90f', merah: '#d43a2b', ungu: '#7a4fd0' };
const RC = { '05': 'var(--t05)', '09': 'var(--t09)', '12': 'var(--t12)' };
const PATHS = { '05': 'M48 138 C 92 154, 122 120, 172 110', '09': 'M48 138 C 38 100, 68 72, 96 46', '12': 'M172 110 C 200 82, 222 68, 252 60 S 302 112, 298 148' };
const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

let S = null, view = 'title', lastSave = null, toastT = null, raf = 0;
let U = { modal: null, sc: null, card: null, shift: 0, stage: '', ev: null, evOut: '', res: null, night: 0, ask: false };

/* ---------- simpan ---------- */
function save() {
  if (!S || (view !== 'pagi' && view !== 'malam')) return;
  S.lastSeen = Date.now(); const c = S.today._choices; S.today._choices = null;
  lastSave = JSON.stringify(S); S.today._choices = c;
  try { localStorage.setItem(KEY, lastSave); } catch (e) { /* tanpa penyimpanan pun game tetap jalan */ }
}
function load() { try { const t = localStorage.getItem(KEY); return t ? JSON.parse(t) : null; } catch (e) { return null; } }
function wipe() { try { localStorage.removeItem(KEY); } catch (e) { } lastSave = null; }
function toast(t) { roti.textContent = t; roti.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { roti.hidden = true; }, 3200); }

/* ---------- potongan tampilan ---------- */
function bar(v, max, cls) { const p = Math.max(0, Math.min(100, 100 * v / (max || 1))); return `<span class="bar ${cls || ''}"><i style="width:${p}%"></i></span>`; }
const condCls = c => c < 40 ? 'bad' : c < 60 ? 'warn' : '';
function hdr() {
  const c = G.cal(S), due = S.bab === 1 ? G.nextDue(S) : null, self = S.fleet.some(a => a.driver === 'self');
  const wx = { cerah: 'Cerah', mendung: 'Mendung', hujan: 'Hujan' }[S.wx.today];
  return `<header class="hud">
    <div class="hud-row">
      <div class="plat"><small>HARI ${S.day}</small><b>${G.DOW[c.dow].toUpperCase()}</b></div>
      <div class="plat grow"><small>UANG</small><b class="num">${fmt(S.money)}</b></div>
      ${due ? `<div class="plat merah"><small>UTANG · ${Math.max(0, due.day - S.day)} HARI</small><b class="num">${fmt(G.debtLeft(S)).replace('Rp ', '')}</b></div>`
        : G.b3on(S) ? `<div class="plat merah"><small>SIDANG · ${Math.max(0, S.b3.hearing - S.day)} HARI</small><b class="num">${G.sidang(S).total}/${G.B3.win}</b></div>`
        : `<div class="plat"><small>ARMADA</small><b>${S.fleet.length}</b></div>`}
    </div>
    <div class="hud-meta"><span>${wx} · tanggal ${c.dom}</span><span>Nama baik <b>${Math.round(S.rep)}</b></span>
      ${self ? `<span class="meter">Tenaga ${bar(S.stamina, 100, S.stamina < 25 ? 'bad' : S.stamina < 50 ? 'warn' : '')}<b>${S.stamina}</b></span>` : ''}</div>
    <div class="marka"></div>
  </header>`;
}
function goalsHTML() {
  return G.goals(S).map(g => { const done = g.cur >= g.max; return `<div class="karcis ${done ? 'done' : ''}"><div class="stub">${esc(g.scope)}</div><div class="isi"><p>${esc(g.text)}</p>${bar(g.cur, g.max)}${g.note ? `<small>${esc(g.note)}</small>` : ''}</div></div>`; }).join('');
}
function img(a) { return `<img src="assets/img/angkot-${a ? a.color : 'hijau'}.webp" alt="" width="720" height="439">`; }   // render Blender per warna cat (tools/blender/render_sprites.py)

/* ---------- pagi ---------- */
function angkotCard(a) {
  const p = G.project(S, a), dr = G.drv(S, a);
  let opt = `<option value="">Kosong</option><option value="self" ${a.driver === 'self' ? 'selected' : ''}>Kamu sendiri</option>`;
  for (const d of Object.values(S.drivers)) if (d.hired) { const at = S.fleet.find(b => b.driver === d.id && b !== a); opt += `<option value="${d.id}" ${a.driver === d.id ? 'selected' : ''}>${esc(G.DRIVERS[d.id].name)}${at ? ' (dari ' + esc(at.name) + ')' : ''}</option>`; }
  let ropt = ''; for (const r of G.RIDS.map(k => G.ROUTES[k])) if (S.routes[r.id]) { const full = a.route !== r.id && G.kuotaFull(S, r.id, a); ropt += `<option value="${r.id}" ${a.route === r.id ? 'selected' : ''} ${full ? 'disabled' : ''}>${r.id} · ${esc(r.name)}${full ? ' (kuota penuh)' : ''}</option>`; }
  let low = '';
  if (dr) {
    const D = G.DRIVERS[dr.id]; const st = !p.pressured ? ['ok', 'Cukup'] : p.paid < a.setoran ? ['bad', 'Nombok'] : ['warn', 'Mepet, dia bakal ngebut'];
    low = `<div class="fld">Setoran per hari<div class="setoran"><button class="step" data-act="set" data-id="${a.id}" data-d="-10" aria-label="Kurangi setoran">−</button><span class="val num">${fmt(a.setoran)}</span><button class="step" data-act="set" data-id="${a.id}" data-d="10" aria-label="Tambah setoran">+</button></div></div>
      <div class="proy"><span>${esc(D.name)} bawa pulang ±<b>${fmt(p.take)}</b>, butuh ${fmt(p.need)}</span><span class="pill ${st[0]}">${st[1]}</span>${a.setoranSet && G.fairSetoran(S, a) !== a.setoran ? `<button class="btn sm" data-act="wajar" data-id="${a.id}">Setoran wajar ${fmt(G.fairSetoran(S, a)).replace('Rp ', '')}</button>` : ''}</div>`;
  } else if (a.driver === 'self') {
    low = `<div class="proy"><span>Perkiraan bersih hari ini ±<b>${fmt(p.net)}</b></span><span class="pill ok">Kamu yang narik</span></div>`;
  } else low = `<div class="proy"><span>Tidak jalan hari ini.</span><span class="pill warn">Belum ada sopir</span></div>`;
  return `<article class="kartu angkot">
    <div class="a-top">${img(a)}<div><h3>${esc(a.name)}</h3>${a.stiker ? `<p class="stiker">“${esc(a.stiker)}”</p>` : ''}
      <div class="a-kondisi">Kondisi ${bar(a.cond, 100, condCls(a.cond))}<b>${Math.round(a.cond)}</b></div>${a.loan ? `<p class="stiker">CICILAN ${fmt(a.loan.daily)}/HARI · ${a.loan.left} HARI LAGI</p>` : ''}${G.b3on(S) ? kirPill(a) : ''}</div></div>
    <div class="a-row">
      <label class="fld">Sopir<select id="drv-${a.id}" data-chg="driver" data-id="${a.id}">${opt}</select></label>
      <label class="fld">Trayek<select id="rt-${a.id}" data-chg="route" data-id="${a.id}">${ropt}</select></label>
    </div>${low}
    <div class="a-foot"><button class="btn sm" data-act="modal" data-m="bengkel" data-id="${a.id}">Bengkel${a.cond < 45 ? ' · perlu servis' : ''}</button></div>
  </article>`;
}
function kirPill(a) {
  if (!a.kir) return `<p><span class="pill warn">Belum uji KIR</span></p>`;
  return a.cond >= G.B3.lulus ? `<p><span class="pill ok">KIR lulus</span></p>` : `<p><span class="pill bad">KIR lulus, kondisi di bawah ${G.B3.lulus}</span></p>`;
}
function pagi() {
  const kabar = G.kabar(S, false).map(k => `<li>${esc(k)}</li>`).join('');
  const b2 = S.bab >= 2, freeDrv = b2 ? G.freeDrivers(S).length : 0;
  return hdr() + `<main>
    <section><div class="sec-h"><h2>Kabar pagi</h2></div><div class="kartu papan"><ul>${kabar}</ul></div></section>
    <section><div class="sec-h"><h2>Target</h2></div>${goalsHTML()}</section>
    <section><div class="sec-h"><h2>Armada</h2><span>${S.fleet.length} angkot${freeDrv ? ` · ${freeDrv} sopir menganggur` : ''}</span></div>${S.fleet.map(angkotCard).join('')}</section>
    <section><div class="menu">
      <button class="btn" data-act="modal" data-m="trayek">Trayek</button>
      ${G.b3on(S) ? `<button class="btn plat-b" data-act="modal" data-m="sidang">Berkas sidang</button>` : ''}
      ${b2 ? `<button class="btn" data-act="modal" data-m="sopir">Sopir${S.cand.length ? ' · ' + S.cand.length + ' pelamar' : ''}</button><button class="btn" data-act="modal" data-m="dealer">Beli angkot</button>`
        : `<button class="btn" data-act="modal" data-m="bayar">Bayar utang</button>`}
      <button class="btn" data-act="modal" data-m="bantuan">Cara main</button>
    </div></section>
  </main><footer class="cta"><button class="gas" data-act="depart">Berangkat narik</button></footer>`;
}

/* ---------- siang ---------- */
function mapSVG() {
  const used = {}; S.fleet.forEach(a => { if (a.driver && !a.off) used[a.route] = 1; });
  let lines = '', marks = '';
  for (const id of ['09', '12', '05']) lines += `<path id="p${id}" d="${PATHS[id]}" fill="none" stroke="${S.routes[id] ? RC[id] : '#b9c2b4'}" stroke-width="${used[id] ? 6 : 4}" stroke-linecap="round" ${S.routes[id] ? '' : 'stroke-dasharray="3 7"'} opacity="${used[id] ? 1 : .55}"/>`;
  S.fleet.forEach((a, i) => { if (!a.driver || a.off) return; marks += `<g class="mk" data-r="${a.route}" data-i="${i}"><circle r="8" fill="${HEX[a.color]}" stroke="#111" stroke-width="2"/><text y="3.5" text-anchor="middle" font-size="9" font-weight="800" fill="#fff" font-family="Plus Jakarta Sans, sans-serif">${i + 1}</text></g>`; });
  const node = (x, y, t, ax) => `<circle cx="${x}" cy="${y}" r="5" fill="#fff" stroke="#111" stroke-width="2"/><text x="${x + (ax === 'end' ? -9 : 9)}" y="${y + 4}" text-anchor="${ax || 'start'}" font-size="10" font-weight="700" fill="#1b2630" font-family="Plus Jakarta Sans, sans-serif">${t}</text>`;
  return `<svg viewBox="0 0 340 180" role="img" aria-label="Peta trayek Cibening">
    <rect width="340" height="180" fill="#e7efe2"/>
    <path d="M-10 20 C 60 10, 120 96, 210 150 S 300 170, 350 176" fill="none" stroke="#bfdcea" stroke-width="13" stroke-linecap="round"/>
    <g fill="#d6e2cf"><rect x="118" y="20" width="44" height="30" rx="4"/><rect x="176" y="14" width="34" height="24" rx="4"/><rect x="262" y="88" width="50" height="26" rx="4"/><rect x="14" y="52" width="30" height="34" rx="4"/><rect x="226" y="112" width="36" height="24" rx="4"/><rect x="98" y="146" width="48" height="22" rx="4"/></g>
    ${lines}
    ${node(48, 138, 'Terminal', 'start').replace('y="142"', 'y="158"').replace('x="57"', 'x="30"')}
    ${node(172, 110, 'Pasar Baru')}${node(96, 46, 'Kampus')}${node(252, 60, 'Stasiun')}${node(298, 148, 'Griya Asri', 'end')}
    ${marks}</svg>`;
}
function placeMarks(t) {
  V.querySelectorAll('.mk').forEach(m => {
    const p = V.querySelector('#p' + m.dataset.r); if (!p || !p.getTotalLength) return;
    const i = +m.dataset.i, L = p.getTotalLength(); let u = t == null ? 0.06 + (i % 4) * 0.07 : (t * 2 + i * 0.23) % 2; if (u > 1) u = 2 - u;
    const pt = p.getPointAtLength(L * u); m.setAttribute('transform', `translate(${pt.x.toFixed(1)},${(pt.y - (t == null ? i * 2 : 0)).toFixed(1)})`);
  });
}
function ramaiHTML(sh) {
  const seen = {}; let h = '';
  for (const a of S.fleet) { if (!a.driver || a.off || seen[a.route]) continue; seen[a.route] = 1;
    const m = G.demand(S, a.route, sh) / (0.9 + S.rep / 500); const w = m < 0.8 ? 'sepi' : m < 1.08 ? 'biasa' : m < 1.3 ? 'ramai' : 'ramai sekali';
    h += `<span style="--c:${RC[a.route]}">Trayek ${a.route}: <b>${w}</b></span>`; }
  return h;
}
function siang() {
  const sh = U.shift, selfA = S.fleet.find(a => a.driver === 'self' && !a.off);
  const dots = [0, 1, 2].map(i => `<i class="${i < sh ? 'on' : i === sh ? 'now' : ''}"></i>`).join('');
  let body = '';
  if (U.stage === 'event') {
    body = `<div class="kejadian" style="display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Kejadian · ${esc(U.ev.angkot)}</span><h3>${esc(U.ev.title)}</h3><p>${esc(U.ev.text)}</p></div>
      <div class="pilihan">${U.ev.choices.map((c, i) => `<button data-act="ev" data-i="${i}" ${c.ok ? '' : 'disabled'}><b>${esc(c.label)}</b><small>${esc(c.hint || '')}${c.ok ? '' : ' · uang tidak cukup'}</small></button>`).join('')}</div>`;
  } else if (U.stage === 'evout') {
    body = `<div class="kejadian" style="display:flex;flex-direction:column;gap:8px"><span class="eyebrow">Kejadian · ${esc(U.ev.angkot)}</span><h3>${esc(U.ev.title)}</h3><p>${esc(U.evOut)}</p></div><button class="btn plat-b blok" data-act="ev-ok">Lanjut</button>`;
  } else if (U.stage === 'mode') {
    body = `<div class="ramai">${ramaiHTML(sh)}</div>` + (selfA
      ? `<button class="gas setir-btn" data-act="setir">Nyetir sendiri<small>Kamu yang pegang setir rit ini${S.stamina < 25 ? ' · ngantuk, setir goyang' : ''}</small></button>
         <p class="otomatis">Atau narik otomatis</p><div class="mode">${Object.entries(G.SELF_MODES).map(([k, m]) => `<button data-act="mode" data-m="${k}" ${k === 'ngebut' && S.stamina < 20 ? 'disabled' : ''}><b>${m.name}</b><small>${m.desc}</small></button>`).join('')}</div>`
      : `<button class="btn ijo blok" data-act="mode" data-m="normal">Lepas angkot rit ${G.SHIFT[sh].toLowerCase()}</button>`);
  } else if (U.stage === 'drive') {
    body = `<p>Kamu di jalan…</p>`;
  } else if (U.stage === 'run') {
    body = `<p>Angkot jalan…</p>`;
  } else if (U.stage === 'result') {
    body = `<ul class="hasil">${U.res.results.map(r => { const a = S.fleet.find(x => x.id === r.id); if (!a) return ''; const dr = G.drv(S, a);
      if (r.idle) return `<li><span class="n">${esc(a.name)}</span><span></span><small>Di garasi.</small></li>`;
      if (r.rest || (r.down && !r.drive)) return `<li><span class="n">${esc(a.name)}</span><span></span><small>${esc(r.note)}</small></li>`;
      return `<li><span class="n">${esc(a.name)}</span><span class="v num">+${fmt(r.gross).replace('Rp ', '')}</span><small>${dr ? `Dibawa ${esc(G.DRIVERS[dr.id].name)}. Setoran dihitung malam.` : `Bensin ${fmt(r.fuel)}.`} ${esc(r.note || '')}</small></li>`; }).join('')}</ul>
      <button class="btn plat-b blok" data-act="next-shift">${sh < 2 ? 'Lanjut rit ' + G.SHIFT[sh + 1].toLowerCase() : 'Pulang, hitung uang'}</button>`;
  }
  return hdr() + `<main><div class="peta">${mapSVG()}</div>
    <section class="kartu rit"><div class="rit-h"><h2>Rit ${G.SHIFT[sh].toLowerCase()}</h2><span>${G.JAM[sh]}</span></div><div class="dots">${dots}</div>${body}</section></main>`;
}
function drive() {
  const spec = G.driveSpec(S, U.shift); if (!spec) { runShift('normal'); return; }
  U.stage = 'drive'; render();
  window.NARIK_DRIVE.mount(NY, spec, { hex: HEX[spec.color], shiftName: G.SHIFT[U.shift].toLowerCase() }, res => {
    if (!res) { U.stage = 'mode'; render(); return; }
    U.res = G.runShift(S, U.shift, 'setir', res); U.stage = 'result'; render();
  });
}
function enterShift(sh) {
  U.shift = sh; U.res = null; const ev = G.rollEvent(S, sh);
  if (ev) { U.ev = ev; U.stage = 'event'; } else U.stage = 'mode';
  render();
}
function runShift(mode) {
  U.res = G.runShift(S, U.shift, mode);
  if (reduce) { U.stage = 'result'; render(); return; }
  U.stage = 'run'; render();
  const t0 = performance.now(), dur = 1500; cancelAnimationFrame(raf);
  const tick = now => { const t = Math.min(1, (now - t0) / dur); placeMarks(t); if (t < 1 && U.stage === 'run') raf = requestAnimationFrame(tick); else { U.stage = 'result'; render(); } };
  raf = requestAnimationFrame(tick);
}

/* ---------- malam ---------- */
function malam() {
  const T = S.today;
  if (U.night === 1) {
    const kabar = G.kabar(S, true).map(k => `<li>${esc(k)}</li>`).join('');
    return hdr() + `<main><section><div class="sec-h"><h2>Kabar besok</h2></div><div class="kartu papan"><ul>${kabar}</ul></div></section>
      <section><div class="sec-h"><h2>Target</h2></div>${goalsHTML()}</section></main>
      <footer class="cta"><button class="gas kuning" data-act="tidur">Tidur · hari ke-${S.day + 1}</button></footer>`;
  }
  const rows = (T.rows || []).map(r => r.off ? `<div class="sopir-row"><b>${esc(r.who)} · ${esc(r.name)}</b><span>libur</span></div>`
    : `<div class="sopir-row"><b>${esc(r.who)} · ${esc(r.name)}</b><b class="num" style="color:var(--ijo-tua)">+${fmt(r.paid).replace('Rp ', '')}</b>
       <small>Kotor ${fmt(r.gross)}, bensin ${fmt(r.fuel)}. Dia bawa pulang ${fmt(r.take)}.${r.short ? ` <b style="color:var(--rem)">Kurang setor ${fmt(r.short)}.</b>` : ''} ${r.dl > 0 ? 'Makin betah.' : r.dl < 0 ? 'Mulai kesal.' : ''}</small></div>`).join('');
  const L = T.ledger.slice().sort((a, b) => b.v - a.v); const tot = L.reduce((t, x) => t + x.v, 0);
  const led = L.map(x => `<div class="baris"><span>${esc(x.k)}</span><b class="${x.v >= 0 ? 'plus' : 'minus'}">${x.v >= 0 ? '+' : '−'}${fmt(Math.abs(x.v)).replace('Rp ', '')}</b></div>`).join('');
  const debt = S.bab === 1 && G.debtLeft(S) > 0 ? `<section><div class="sec-h"><h2>Utang ke Haji Sobari</h2><span>Sisa ${fmt(G.debtLeft(S))}</span></div>
      <div class="menu"><button class="btn" data-act="bayar" data-a="100" ${S.money >= 100 ? '' : 'disabled'}>Bayar Rp 100 rb</button><button class="btn" data-act="bayar" data-a="500" ${S.money >= 500 ? '' : 'disabled'}>Bayar Rp 500 rb</button></div></section>` : '';
  return hdr() + `<main>
    ${rows ? `<section><div class="sec-h"><h2>Setoran sopir</h2></div><div class="kartu" style="padding:4px 14px">${rows}</div></section>` : ''}
    <section><div class="kartu buku"><h2>Buku hari ke-${S.day}</h2>${led}<div class="baris total"><span>Selisih hari ini</span><b class="${tot >= 0 ? 'plus' : 'minus'}">${tot >= 0 ? '+' : '−'}${fmt(Math.abs(tot)).replace('Rp ', '')}</b></div></div></section>
    ${T.petisi != null && S.bab === 3 ? `<section><div class="karcis"><div class="stub">Petisi</div><div class="isi"><p>+${T.petisi} tanda tangan hari ini</p>${bar(S.b3.petisi, G.B3.target)}<small>${S.b3.petisi} dari ${G.B3.target}</small></div></div></section>` : ''}
    <section><div class="karcis ${T.hit ? 'done' : ''}"><div class="stub">${T.hit ? 'Tercapai' : 'Belum'}</div><div class="isi"><p>Target narik ${fmt(T.target)}, dapat ${fmt(T.narik)}</p>${T.hit && S.streak >= 2 ? `<small>${S.streak} hari berturut-turut.</small>` : ''}</div></div></section>
    ${debt}</main><footer class="cta"><button class="gas" data-act="tutup">Tutup buku</button></footer>`;
}

/* ---------- lembar (modal) ---------- */
function sheet(title, body) { return `<div class="lapis gelap" data-act="bg"><div class="lembar" role="dialog" aria-label="${esc(title)}"><div class="lembar-h"><h2>${esc(title)}</h2><button class="x" data-act="close" aria-label="Tutup">✕</button></div><div class="lembar-b">${body}</div></div></div>`; }
function modalHTML() {
  const m = U.modal; if (!m) return '';
  if (m.m === 'bengkel') {
    const a = S.fleet.find(x => x.id === m.id); if (!a) return '';
    const sv = Object.entries(G.SERVIS).map(([k, x]) => `<div class="item"><h3>${x.name}</h3><p>Kondisi +${x.add}. ${fmt(x.price)}.</p><button class="btn sm ijo" data-act="servis" data-k="${k}" ${S.money >= x.price && a.cond < 100 ? '' : 'disabled'}>Servis</button></div>`).join('');
    const up = Object.entries(G.UPGRADES).map(([k, x]) => `<div class="item"><h3>${x.name}</h3><p>${x.desc} ${a.ups[k] ? '' : fmt(x.price) + '.'}</p><button class="btn sm" data-act="up" data-k="${k}" ${!a.ups[k] && S.money >= x.price ? '' : 'disabled'}>${a.ups[k] ? 'Terpasang' : 'Pasang'}</button></div>`).join('');
    const cat = Object.keys(G.COLORS).map(c => `<button style="--c:${HEX[c]}" data-act="cat" data-c="${c}" aria-label="${G.COLORS[c]}" aria-pressed="${a.color === c}" ${a.color !== c && S.money < 150 ? 'disabled' : ''}></button>`).join('');
    return sheet('Bengkel Teh Rina', `<div class="a-top">${img(a)}<div><h3 style="font-family:var(--display)">${esc(a.name)}</h3><div class="a-kondisi">Kondisi ${bar(a.cond, 100, condCls(a.cond))}<b>${Math.round(a.cond)}</b></div><p class="stiker">UANGMU ${fmt(S.money).toUpperCase()}</p></div></div>
      ${sv}${up}<div class="item"><h3>Cat ulang</h3><p>Rp 150 rb sekali ganti warna.</p><div class="warna full">${cat}</div></div>
      <div class="item"><h3>Nama dan stiker kaca</h3><p>Gratis. Ini angkotmu.</p><div class="full a-row"><label class="fld">Nama<input id="nm-angkot" maxlength="18" value="${esc(a.name)}"></label><label class="fld">Stiker<input id="st-angkot" maxlength="22" value="${esc(a.stiker)}"></label></div><button class="btn sm full" style="grid-row:auto;grid-column:1/-1" data-act="nama">Simpan</button></div>`);
  }
  if (m.m === 'trayek') {
    return sheet('Trayek', G.RIDS.map(k => G.ROUTES[k]).map(r => { const lab = [0, 1, 2].map(sh => { const d = G.demand(S, r.id, sh) / (0.9 + S.rep / 500); return `${G.SHIFT[sh]} ${d < 0.8 ? 'sepi' : d < 1.08 ? 'biasa' : d < 1.3 ? 'ramai' : 'ramai sekali'}`; }).join(' · ');
      return `<div class="item" style="border-left:8px solid ${RC[r.id]}"><h3>${r.id} · ${esc(r.name)}</h3><p>${esc(r.tip)}</p><p class="full"><b>Hari ini:</b> ${lab}. Bensin ${fmt(Math.round(r.fuel * S.fuelK * 3))} sehari.</p>
        ${S.routes[r.id] ? `<span class="pill ok" style="grid-row:1;grid-column:2">Punya izin</span>` : `<button class="btn sm plat-b" data-act="izin" data-r="${r.id}" ${S.money >= r.izin ? '' : 'disabled'}>Izin ${fmt(r.izin).replace('Rp ', '')}</button>`}</div>`; }).join('')
      + `<p style="font-size:13px;color:var(--tinta-2)">Angkotmu sendiri di satu trayek berebut penumpang. Dua angkot di trayek yang sama masing-masing dapat ±89%, tiga ±81%, empat ±74%, lima ±68%. Setoran yang belum kamu ubah sendiri ikut turun supaya sopirnya tetap cukup.</p>`);
  }
  if (m.m === 'sopir') {
    const hired = Object.values(S.drivers).filter(d => d.hired).map(d => { const D = G.DRIVERS[d.id], a = S.fleet.find(x => x.driver === d.id);
      return `<div class="item"><h3>${esc(D.name)} <span class="pill ${d.loyalty < 35 ? 'bad' : d.loyalty < 55 ? 'warn' : 'ok'}">${esc(D.tag)}</span></h3><p>${esc(D.bio)}</p>
        <p class="full a-kondisi">Kesetiaan ${bar(d.loyalty, 100, d.loyalty < 35 ? 'bad' : d.loyalty < 55 ? 'warn' : '')}<b>${Math.round(d.loyalty)}</b></p>
        <p class="full">${a ? 'Membawa ' + esc(a.name) + ', trayek ' + a.route + '.' : 'Belum pegang angkot.'} Butuh bawa pulang ${fmt(D.need)} sehari. ${d.perk ? '<b>' + esc(D.perk) + '</b>' : 'Kalau betah (kesetiaan 70), dia akan bercerita.'}</p>
        ${d.id === 'ujang' ? '' : `<button class="btn sm" style="grid-row:1" data-act="pecat" data-d="${d.id}">Berhentikan</button>`}</div>`; }).join('');
    const cand = S.cand.map(id => { const D = G.DRIVERS[id]; return `<div class="item"><h3>${esc(D.name)}, ${D.age} <span class="pill warn">${esc(D.tag)}</span></h3><p>${esc(D.bio)} Butuh bawa pulang ${fmt(D.need)} sehari.</p><button class="btn sm ijo" data-act="rekrut" data-d="${id}">Rekrut</button></div>`; }).join('');
    return sheet('Sopir', `${hired}<div class="sec-h" style="margin:6px 0 0"><h2>Pelamar di warung kopi</h2></div>${cand || '<p style="color:var(--tinta-2)">Belum ada yang melamar. Coba lagi besok.</p>'}`);
  }
  if (m.m === 'dealer') {
    const full = S.fleet.length >= G.MAX_FLEET;
    const r10 = v => Math.max(0, Math.round(v / 10) * 10), pv = G.buyPreview(S), gain = r10(pv.gain);
    const rows = G.RIDS.filter(r => !(S.routes[r] && G.kuotaFull(S, r))).map(r => { const q = r === pv.route ? pv : G.buyPreview(S, r), g = r10(q.gain);
      return `<li>Trayek ${r}${S.routes[r] ? '' : ' (perlu izin ' + fmt(G.ROUTES[r].izin) + ')'}: jadi ${q.n} angkot, ${g > 0 ? `tambah ±<b>${fmt(g)}</b>` : '<b>hampir tidak menambah</b>'}${r === pv.route ? ' · <i>masuk sini</i>' : ''}</li>`; }).join('');
    const est = `<div class="item"><h3>Kalau beli satu lagi</h3><p class="full">Perkiraan tambahan untukmu sehari, setelah setoran sopir dan bensin, belum cicilan dan servis. Angkotmu sendiri di satu trayek saling berebut penumpang.${pv.freeDriver ? '' : ' Kamu juga perlu sopir untuknya.'}</p><ul class="full" style="font-size:13px;margin:2px 0 0;padding-left:18px">${rows}</ul></div>`;
    return sheet('Beli angkot', `<p>Uangmu <b>${fmt(S.money)}</b>. Armada ${S.fleet.length} angkot. Pengeluaran tetap ${fmt(G.fixedDay(S))} sehari.</p>` + (full ? '' : est) + Object.values(G.DEALER).filter(k => !(k.once && S.flags['beli_' + k.id])).map(k =>
      `<div class="item"><h3>${esc(k.label)}</h3><p>${esc(k.desc)} Kondisi ${k.cond}.</p>${k.daily && k.daily > gain ? `<p class="full"><span class="pill bad">Cicilan ${fmt(k.daily)} lebih besar dari tambahannya</span></p>` : ''}<button class="btn sm ijo" data-act="beli" data-k="${k.id}" ${!full && S.money >= k.price ? '' : 'disabled'}>${fmt(k.price).replace('Rp ', '')}</button></div>`).join(''));
  }
  if (m.m === 'sidang') {
    const sc = G.sidang(S), B = S.b3, P = G.B3;
    const row = (t, v, max, note) => `<div class="item"><h3>${t}</h3><span class="pill ${v >= max ? 'ok' : v > 0 ? 'warn' : 'bad'}" style="grid-row:1;grid-column:2">${v} / ${max}</span><p class="full">${note}</p></div>`;
    const on05 = S.fleet.filter(a => a.route === '05' && a.driver);
    const perDay = on05.reduce((t, a) => t + G.petisiOf(S, a), 0);
    const kir = S.fleet.map(a => { let btn;
      if (a.kir) btn = `<span class="pill ${a.cond >= P.lulus ? 'ok' : 'bad'}" style="grid-row:1;grid-column:2">${a.cond >= P.lulus ? 'Lulus' : 'Servis dulu'}</span>`;
      else if (a.cond < P.kirCond) btn = `<button class="btn sm" data-act="modal" data-m="bengkel" data-id="${a.id}" data-back="sidang">Bengkel</button>`;
      else btn = `<button class="btn sm ijo" data-act="uji" data-id="${a.id}" ${S.money >= P.kir ? '' : 'disabled'}>Uji ${fmt(P.kir).replace('Rp ', '')}</button>`;
      return `<div class="item"><h3>${esc(a.name)}</h3><p>Kondisi ${Math.round(a.cond)}. ${a.kir ? `Hari sidang harus ${P.lulus} ke atas.` : a.cond >= P.kirCond ? 'Siap diuji.' : `Perlu kondisi ${P.kirCond}. Servis di bengkel dulu.`}</p>${btn}</div>`; }).join('');
    return sheet('Berkas sidang', `<p>Sidang izin trayek 05 hari ke-${B.hearing}. Butuh skor <b>${P.win}</b>.</p>
      <div class="karcis ${sc.total >= P.win ? 'done' : ''}" style="flex-shrink:0"><div class="stub">Skor</div><div class="isi"><p>${sc.total} dari ${P.win} yang dibutuhkan</p>${bar(sc.total, P.win)}<small>${Math.max(0, B.hearing - S.day)} hari lagi</small></div></div>
        ${row('Petisi penumpang', sc.pet, P.w.pet, `${B.petisi} dari ${P.target} tanda tangan. Sekarang ±${perDay} sehari dari ${on05.length} angkot di trayek 05.`)}
        ${row('Paguyuban sopir', sc.pag, P.w.pag, `Nama baik ${Math.round(S.rep)}. Penuh di 70, separuh di 55.`)}
        ${row('Kelayakan armada', sc.arm, P.w.arm, `${sc.okA} dari ${sc.n} angkot lulus KIR dan layak jalan.`)}
        ${row('Halaman buku Bapak', sc.hal, P.w.hal, B.halaman ? 'Ada di tanganmu.' : 'Belum ada.')}
      <div class="sec-h" style="margin:6px 0 0"><h2>Uji KIR</h2></div>${kir}`);
  }
  if (m.m === 'bayar') {
    const sch = S.debt.sched.filter(x => x.amt > 0).map(x => `<div class="baris"><span>Hari ke-${x.day}</span><b>${fmt(x.amt)}</b></div>`).join('');
    return sheet('Utang ke Haji Sobari', `<div class="kartu buku">${sch || '<p>Lunas.</p>'}</div><p>Uangmu <b>${fmt(S.money)}</b>. Bayar lebih awal boleh. Cicilan yang jatuh tempo dipotong otomatis malam itu; kalau kurang, sisanya kena bunga 10%.</p>
      <div class="menu"><button class="btn" data-act="bayar" data-a="100" ${S.money >= 100 ? '' : 'disabled'}>Bayar Rp 100 rb</button><button class="btn" data-act="bayar" data-a="500" ${S.money >= 500 ? '' : 'disabled'}>Bayar Rp 500 rb</button></div>`);
  }
  if (m.m === 'bantuan') {
    return sheet('Cara main', `<div class="kartu papan"><ul>
      <li>Satu hari punya tiga rit: pagi, siang, sore. Tiap pagi kamu atur siapa membawa angkot mana dan di trayek mana.</li>
      <li>Kalau kamu sendiri yang narik, kamu bisa <b>nyetir sendiri</b>: geser jari untuk setir, tahan REM, menepi untuk menaikkan dan menurunkan penumpang. Nyetir rapi lebih untung daripada narik otomatis.</li>
      <li>Atau pilih gaya narik otomatis tiap rit. Ngebut menguras tenaga; tenaga habis berarti kamu harus istirahat.</li>
      <li>Kondisi angkot turun tiap rit. Di bawah 40, angkot bisa mogok. Servis di bengkel.</li>
      <li>Sopir membayar setoran tetap dan menanggung bensin. Sisanya dia bawa pulang. Kalau sisanya kurang dari kebutuhannya, dia ngebut, mobil cepat rusak, lalu dia pergi.</li>
      <li>Nama baik menambah penumpang. Naik lewat pilihan yang jujur, turun lewat tunggakan dan sopir ugal-ugalan.</li>
      ${S && S.bab >= 3 ? '<li>Bab 3: angkot di trayek 05 mengumpulkan tanda tangan petisi tiap hari. Uji KIR semua angkot dan jaga nama baik. Lihat skor di Berkas sidang.</li>' : ''}
      <li>Progres tersimpan di browser ini saja.</li></ul></div>`);
  }
  return '';
}

/* ---------- cerita ---------- */
function playScenes(when, then) {
  const q = G.scenes(S, when); if (!q.length) { then(); return; }
  U.sc = { q, qi: 0, li: 0, lines: q[0].lines, choosing: false, chosen: false, fin: false, when, then }; render();
}
const CARDS = {
  intro: () => ({ eb: 'Bab 1', t: 'Narik Sendiri', b: 'Lunasi utang Bapak, Rp 4,5 juta, dalam 30 hari. Kamu sendiri yang pegang setir.', cta: 'Ambil kunci' }),
  lunas: () => ({ eb: 'Bab 1 selesai', t: 'Si Ijo Selamat', b: `Lunas di hari ke-${S.day}. Sejauh ini kamu sudah narik ${fmt(S.stats.earned)}.`, cta: 'Lanjut' }),
  bab2: () => ({ eb: 'Bab 2', t: 'Sopir Pertama', b: 'Mang Ujang ikut kamu. Ambil angkot kedua, atur setoran, dan kumpulkan 5 angkot.', cta: 'Mulai' }),
  b_lima: () => ({ eb: 'Bab 2 selesai', t: 'Lima Angkot', b: `Lima angkot di hari ke-${S.day}. Haji Sobari mulai bergerak.`, cta: 'Lanjut' }),
  bab3: () => ({ eb: 'Bab 3', t: 'Rebutan Trayek', b: `Sidang izin trayek 05 di hari ke-${S.b3.hearing}. Kumpulkan petisi penumpang, lulus uji KIR, dan rebut dukungan paguyuban.`, cta: 'Mulai' }),
  b3_sidang: () => { const R = S.b3.result;
    if (R.deal) return { eb: 'Bersambung', t: 'Tiga Kursi', b: 'Kamu menjual dua angkot dan mundur dari sidang. Bab 4 belum dibuat. Kamu masih bisa lanjut mengelola armada.', cta: 'Lanjut main' };
    return R.win ? { eb: 'Bersambung', t: 'Trayek Bapak', b: `Menang sidang dengan skor ${R.total}. Trayek 05 tidak lagi dibanjiri angkot biru. Bab 4 belum dibuat. Kamu masih bisa lanjut mengelola armada.`, cta: 'Lanjut main' }
      : { eb: 'Bersambung', t: 'Kuota Dua', b: `Skor ${R.total}, butuh ${G.B3.win}. Kamu hanya boleh menaruh ${G.B3.kuota} angkot di trayek 05. Bab 4 belum dibuat. Kamu masih bisa lanjut mengelola armada.`, cta: 'Lanjut main' }; }
};
function scNext() {
  const sc = U.sc; if (!sc || sc.choosing) return;
  if (sc.li < sc.lines.length - 1) { sc.li++; render(); return; }
  const cur = sc.q[sc.qi];
  if (cur.choices && !sc.chosen) { sc.choosing = true; render(); return; }
  if (!sc.fin) { G.sceneDone(S, cur.id, null); sc.fin = true; }
  const go = () => {
    sc.qi++;
    if (sc.qi < sc.q.length) { sc.lines = sc.q[sc.qi].lines; sc.li = 0; sc.chosen = false; sc.fin = false; sc.choosing = false; render(); }
    else { const then = sc.then, when = sc.when; U.sc = null; playScenes(when, then); }
  };
  if (CARDS[cur.id]) { const c = CARDS[cur.id](); const keep = U.sc; U.sc = null; U.card = Object.assign(c, { cb: () => { U.sc = keep; go(); } }); render(); }
  else go();
}
function scPick(i) {
  const sc = U.sc, cur = sc.q[sc.qi]; const extra = G.sceneDone(S, cur.id, i);
  sc.choosing = false; sc.chosen = true; sc.fin = true;
  if (extra && extra.length) { sc.lines = extra; sc.li = 0; render(); } else { sc.li = sc.lines.length - 1; scNext(); }
}
/* potret tokoh dari render karakter detail tinggi (art/karakter/render/<id>_wajah.jpg, diperkecil) */
const POTRET = ['ujang', 'sobari', 'rina', 'dimas'];
for (const id of POTRET) { const im = new Image(); im.src = `assets/img/potret-${id}.webp`; }   // dimuat duluan supaya tidak berkedip
function sceneHTML() {
  const sc = U.sc; if (!sc) return '';
  const [who, text] = sc.lines[sc.li], C = G.CHAR[who] || G.CHAR.narator, nar = who === 'narator', name = who === 'kamu' ? S.name : C.name;
  const face = nar ? '' : POTRET.includes(who) ? `<div class="potret" style="--c:${C.c}" aria-hidden="true"><img src="assets/img/potret-${who}.webp" alt="" width="440" height="550"></div>`
    : `<div class="wajah" style="--c:${C.c}" aria-hidden="true">${esc(name.replace(/^(Mang|Teh|Haji|Bang|Kang|Bu) /, '')[0])}</div>`;
  const bub = `${face}
    <div class="bicara ${nar ? 'narator' : ''}">${nar ? '' : `<span class="tag" style="--c:${C.c}">${esc(name)}</span>`}<p>${esc(text)}</p>${sc.choosing ? '' : '<span class="ketuk">Ketuk untuk lanjut</span>'}</div>`;
  if (sc.choosing) { const ch = sc.q[sc.qi].choices;
    return `<div class="lapis gelap"><div class="adegan" style="cursor:default">${bub}<div class="pilihan" style="margin-top:12px">${ch.map((c, i) => `<button data-act="sc-pick" data-i="${i}" ${c.ok ? '' : 'disabled'}><b>${esc(c.label)}</b>${c.ok ? '' : `<small>${esc(c.why || 'Uang tidak cukup')}</small>`}</button>`).join('')}</div></div></div>`; }
  return `<div class="lapis gelap"><button class="adegan" data-act="sc-next" id="sc-btn">${bub}</button></div>`;
}
function cardHTML() { const c = U.card; if (!c) return ''; return `<div class="lapis gelap"><div class="kartu-bab"><span class="eyebrow" style="color:#111">${esc(c.eb)}</span><h2>${esc(c.t)}</h2><p>${esc(c.b)}</p><button class="btn" data-act="card-ok" id="card-btn">${esc(c.cta)}</button></div></div>`; }

/* ---------- judul ---------- */
function title() {
  const sv = load();
  return `<div class="judul"><span class="papan-trayek">05 · TERMINAL – PASAR BARU</span><h1 class="logo">NARIK</h1>
    <p class="sub">Satu angkot warisan, satu utang, tiga puluh hari. Mulai dari balik setir, sampai dipanggil juragan.</p>
    ${img(null)}
    ${sv ? `<button class="gas kuning" data-act="lanjut">Lanjutkan · hari ke-${sv.day}</button>
        ${U.ask ? `<p class="kecil" style="text-align:center">Progres lama akan dihapus.</p><button class="btn" data-act="baru-ya">Ya, mulai dari awal</button>` : `<button class="btn-teks" data-act="baru-tanya">Mulai dari awal</button>`}`
      : `<label class="fld">Namamu<input id="nama" maxlength="16" value="Bayu" autocomplete="off"></label><button class="gas" data-act="mulai">Mulai narik</button>`}
    <p class="kecil">Prototipe Bab 1 sampai 3. Progres tersimpan di browser ini saja.</p></div>`;
}

/* ---------- render ---------- */
function render() {
  const m = V.querySelector('main'), lb = V.querySelector('.lembar-b'); const key = view + (view === 'siang' ? '' : U.night);
  const st = m && V.dataset.key === key ? m.scrollTop : 0, sl = lb ? lb.scrollTop : 0;
  let h = view === 'title' ? title() : view === 'pagi' ? pagi() : view === 'siang' ? siang() : malam();
  h += U.sc ? sceneHTML() : U.card ? cardHTML() : modalHTML();
  V.innerHTML = h; V.dataset.key = key;
  const m2 = V.querySelector('main'); if (m2 && st) m2.scrollTop = st;
  const lb2 = V.querySelector('.lembar-b'); if (lb2 && sl) lb2.scrollTop = sl;
  if (view === 'siang') placeMarks(null);
  const f = V.querySelector('#sc-btn, #card-btn'); if (f) f.focus({ preventScroll: true });
}
function startPagi() {
  view = 'pagi'; U.night = 0; U.modal = null;
  playScenes('pagi', () => { save(); render(); });
}
function begin(s, fresh) {
  S = s; view = S.phase === 'malam' ? 'malam' : 'pagi'; U.night = 0;
  if (!fresh) { const off = G.offline(S, Date.now()); if (off) toast(`Selama kamu pergi ${off.hours} jam, sopir-sopirmu menyetor ${fmt(off.amt)}.`); }
  if (view === 'pagi') startPagi(); else render();
}

/* ---------- aksi ---------- */
const ACT = {
  mulai() { const n = (document.getElementById('nama').value || 'Bayu').trim() || 'Bayu'; begin(G.newGame(n), true); },
  lanjut() { const s = load(); if (s) begin(s, false); },
  'baru-tanya'() { U.ask = true; render(); },
  'baru-ya'() { wipe(); U.ask = false; render(); },
  modal(d) { U.modal = { m: d.m, id: d.id, back: d.back }; render(); },
  close() { U.modal = U.modal && U.modal.back ? { m: U.modal.back } : null; render(); },
  bg(d, e) { if (e.target.dataset.act === 'bg') { U.modal = null; render(); } },
  set(d) { const a = S.fleet.find(x => x.id === d.id); G.setSetoran(S, d.id, a.setoran + (+d.d)); render(); },
  wajar(d) { G.setoranWajar(S, d.id); render(); },
  servis(d) { if (G.service(S, U.modal.id, d.k)) toast('Servis selesai.'); render(); },
  up(d) { if (G.upgrade(S, U.modal.id, d.k)) toast(G.UPGRADES[d.k].name + ' terpasang.'); render(); },
  cat(d) { G.paint(S, U.modal.id, d.c); render(); },
  nama() { G.rename(S, U.modal.id, document.getElementById('nm-angkot').value.trim(), document.getElementById('st-angkot').value.trim()); toast('Tersimpan.'); render(); },
  uji(d) { const r = G.ujiKir(S, d.id); if (r === true) toast('Lulus uji KIR.'); else if (r === 'gagal') toast('Tidak lulus. Kondisinya kurang.'); render(); },
  izin(d) { if (G.openRoute(S, d.r)) toast('Izin trayek ' + d.r + ' keluar. Pilih trayeknya di kartu angkot.'); render(); },
  rekrut(d) { if (G.hire(S, d.d)) { const a = S.fleet.find(x => !x.driver); if (a) G.assign(S, a.id, d.d); toast(G.DRIVERS[d.d].name + ' bergabung' + (a ? ' dan membawa ' + a.name + '.' : '. Belum ada angkot kosong.')); } render(); },
  pecat(d) { G.fire(S, d.d); render(); },
  beli(d) { const a = G.buy(S, d.k); if (a) { const f = G.freeDrivers(S)[0]; if (f) G.assign(S, a.id, f.id); U.modal = null; toast(a.name + ' masuk garasi' + (f ? ', dibawa ' + G.DRIVERS[f.id].name + '.' : '. Cari sopir untuknya.')); } render(); },
  bayar(d) { const p = G.payDebt(S, +d.a); if (p) toast('Dibayar ' + fmt(p) + '. Sisa utang ' + fmt(G.debtLeft(S)) + '.'); render(); },
  depart() {
    if (!G.active(S).length) { toast('Belum ada angkot yang punya sopir.'); return; }
    G.depart(S); view = 'siang'; U.modal = null; enterShift(0);
  },
  ev(d) { U.evOut = G.resolveEvent(S, +d.i); U.stage = 'evout'; render(); },
  'ev-ok'() { U.stage = 'mode'; render(); },
  mode(d) { runShift(d.m); },
  setir() { drive(); },
  'next-shift'() { if (U.shift < 2) enterShift(U.shift + 1); else { G.endDay(S); view = 'malam'; U.night = 0; save(); render(); } },
  tutup() {
    playScenes('malam', () => {
      if (S.over) { U.card = { eb: 'Si Ijo disita', t: 'Merintis Lagi', b: 'Mang Ujang meminjami tabungannya untuk menebus Si Ijo. Utangnya kembali dari awal, tapi kamu sudah lebih tahu jalan.', cta: 'Mulai lagi', cb: () => { const n = S.name, r = (S.retry || 0) + 1; begin(G.newGame(n, null, r), true); } }; render(); return; }
      U.night = 1; save(); render();
    });
  },
  tidur() { G.nextDay(S); startPagi(); },
  'sc-next'() { scNext(); },
  'sc-pick'(d) { scPick(+d.i); },
  'card-ok'() { const cb = U.card.cb; U.card = null; cb(); }
};
V.addEventListener('click', e => {
  const t = e.target.closest('[data-act]'); if (!t || t.disabled) return;
  const f = ACT[t.dataset.act]; if (!f) return; f(t.dataset, e);
  if (!U.sc && !U.card) save();
});
V.addEventListener('change', e => {
  const t = e.target; if (!t.dataset || !t.dataset.chg) return;
  if (t.dataset.chg === 'driver') G.assign(S, t.dataset.id, t.value || null);
  if (t.dataset.chg === 'route') G.setRoute(S, t.dataset.id, t.value);
  save(); render();
});

/* ---------- mulai ---------- */
function start(data) {
  if (data && data.save) { try { begin(JSON.parse(data.save), false); return; } catch (e) { } }
  render();
}
const hot = window.claude && window.claude.hot;
if (hot && hot.snapshot) hot.snapshot(() => (S && lastSave ? { save: lastSave } : {}));
if (hot && hot.ready) hot.ready(start); else start((hot && hot.data) || {});
window.__narik = { get S() { return S; }, G };
})();
