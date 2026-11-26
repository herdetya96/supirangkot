/* Uji alur di browser: judul → pagi → berangkat → Nyetir sendiri (3D) → satu rit penuh dengan keyboard → ringkasan → hasil.
   Butuh server jalan (npm run serve) dan Playwright + Chromium. Jalankan: node tools/uji/alur.js
   Tangkapan layar kartu pembuka disimpan di folder sementara sistem (os.tmpdir()). Rit nyata ±60-120 dtk di Chromium tanpa GPU. */
const { chromium } = require('playwright');
const os = require('os'), path = require('path');
const URL = process.env.NARIK_URL || 'http://localhost:5173/';
(async () => {
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errs = [];
  p.on('pageerror', e => errs.push('pageerror: ' + e.message));
  await p.goto(URL);
  await p.evaluate(() => { try { localStorage.removeItem('narik-save-v1'); } catch (e) { /* abaikan */ } });
  await p.reload();
  await p.click('[data-act="mulai"]');
  for (let i = 0; i < 40; i++) { if (await p.$('#sc-btn')) await p.click('#sc-btn'); else if (await p.$('#card-btn')) await p.click('#card-btn'); else break; }
  await p.click('[data-act="depart"]');
  if (await p.$('[data-act="ev"]')) { await p.click('[data-act="ev"]:not([disabled])'); await p.click('[data-act="ev-ok"]'); }
  await p.evaluate(() => { const D = window.NARIK_DRIVE, m0 = D.mount; D.mount = (...a) => (window.__m = m0(...a)); });
  await p.click('[data-act="setir"]');
  await p.waitForFunction(() => { const g = document.querySelector('[data-ny="go"]'); return g && !g.disabled; }, null, { timeout: 60000 });
  const shot = path.join(os.tmpdir(), 'narik_intro.png'); await p.screenshot({ path: shot }); console.log('kartu pembuka:', shot);
  await p.click('[data-ny="go"]');
  const t0 = Date.now();
  while (!(await p.$('[data-ny="done"]')) && Date.now() - t0 < 150000) {
    await p.keyboard.down('ArrowUp'); await p.waitForTimeout(1800); await p.keyboard.up('ArrowUp');
    await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(250); await p.keyboard.up('ArrowLeft');
    await p.keyboard.down('Space'); await p.waitForTimeout(900); await p.keyboard.up('Space');
    console.log('nyata', Math.round((Date.now() - t0) / 1000), 'dtk | sim', await p.evaluate(() => { const S = window.__m.sim; return JSON.stringify({ t: +S.t.toFixed(1), v: Math.round(S.v), d: Math.round(S.d), over: S.over }); }));
  }
  await p.waitForSelector('[data-ny="done"]', { timeout: 30000 });
  console.log('RINGKASAN', (await p.textContent('.ny-kartu')).replace(/\s+/g, ' ').trim());
  await p.click('[data-ny="done"]');
  await p.waitForTimeout(200);
  console.log('HASIL', (await p.textContent('.hasil')).replace(/\s+/g, ' ').trim());
  console.log('ERRORS', errs.length ? errs.join('\n') : 'tidak ada');
  await b.close();
})();
