'use strict';
/* GPT-20261112-1730 Chromium 확인(합성/시험 전용). 외부 요청은 모두 차단하고 GAS는 가짜 JSONP.
 * 실행: node tests/universe-screen-auto-browser.cjs  (NODE_PATH 설정 금지). 산출물은 OS 임시 폴더. */
const { chromium } = require('playwright'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
const S = require('./lib/synthetic-universe-400.test-only.cjs'), C = require('../has/universe-screen.js');
function summary(now) {
  const u = C.buildUniverse(S.input()), end = new Date(now - 86400000).toISOString().slice(0, 10);
  const rows = u.members.slice(0, 60).map((t, i) => C.summarize(t, S.record(t.ticker, t.market, end, i), null, new Date(now).toISOString()));
  return C.assemble(u, rows, { generation: 'synthetic-test-only-browser', generatedAt: new Date(now - 3600000).toISOString() });
}
(async () => {
  const root = path.resolve(__dirname, '..'), out = process.env.HAS_EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'has-screen-auto-'));
  const server = http.createServer((req, res) => { const file = path.join(root, req.url.split('?')[0]); if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; } res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'text/html'); res.end(fs.readFileSync(file)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch(), results = [];
  let blocked = 0;
  try {
    for (const width of [360, 390, 430]) for (const auto of [false, true]) {
      const ctx = await browser.newContext({ viewport: { width, height: 800 } }), page = await ctx.newPage(), errors = [];
      let gas = 0; page.on('pageerror', e => errors.push(e.message));
      await page.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1') return r.continue(); if (u.hostname === 'script.google.com' && u.searchParams.get('type') === 'screen') { gas++; const cb = u.searchParams.get('callback'); assert.match(cb, /^hasScreen_\d+$/); return r.fulfill({ contentType: 'application/javascript', body: cb + '(' + JSON.stringify(summary(Date.now())) + ')' }); } blocked++; return r.abort(); });
      await page.addInitScript(a => { localStorage.setItem('v5_gas', 'https://script.google.com/macros/s/SYNTHETIC/exec'); localStorage.setItem('v5_gen', 'SENTINEL'); if (a) window.HAS_SCREEN_TEST_AUTO = true; }, auto);
      await page.goto(base + '/has/universe-screen.html');
      if (auto) await page.waitForFunction(() => document.querySelectorAll('#rows article').length === 10);
      else await page.waitForTimeout(300);
      const status = await page.locator('#status').innerText(), count = await page.locator('#count').innerText();
      if (auto) { assert.equal(gas, 1); assert.match(status, /^합성 시험 자료\(실제 시세 아님\)/); assert.match(count, /감시 대상 400종목 \(국내 200 · 미국 200\)/); }
      else { assert.equal(gas, 0); assert.match(status, /GAS 요약 연결 전/); }
      await page.click('#refresh'); await page.waitForTimeout(200);
      if (auto) { assert.equal(gas, 1, 'same KST day click reuses memory cache'); assert.match(await page.locator('#status').innerText(), /재사용/); }
      else assert.equal(gas, 1, 'manual click queries once');
      const m = await page.evaluate(() => { const bad = [], small = []; document.querySelectorAll('button,summary,a').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.height < 44) bad.push(e.textContent.trim().slice(0, 20) + ':' + r.height); }); document.querySelectorAll('body *').forEach(e => { if (e.childNodes.length && [...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12) small.push(e.tagName); }); return { overflow: document.documentElement.scrollWidth > innerWidth, bad, small, ledger: localStorage.getItem('v5_gen') }; });
      assert.equal(m.overflow, false); assert.deepEqual(m.bad, []); assert.deepEqual(m.small, []); assert.equal(m.ledger, 'SENTINEL'); assert.deepEqual(errors, []);
      // 뒤로가기: 곡소리 링크 → 뒤로. 메모리 캐시는 bfcache 복원 시에만 유지(새로 로드되면 1회 재조회).
      let back = null;
      if (auto) { const before = gas; await page.click('a[href*="portfolio_v5.html"]'); await page.waitForTimeout(300); await page.goBack(); await page.waitForTimeout(500); back = { extraRequests: gas - before, url: page.url().replace(base, ''), navigation: await page.evaluate(() => performance.getEntriesByType('navigation')[0].type), note: 'headless Chromium+route: 뒤로가기는 새 로드(back_forward)·bfcache 미복원으로 메모리 캐시 유지 미검증 — 기록만' }; assert(back.url.startsWith('/has/universe-screen.html')); assert(back.extraRequests <= 1); }
      await page.screenshot({ path: path.join(out, `auto-${auto}-${width}.png`) });
      results.push({ width, auto, gasRequests: gas, back, pass: true, synthetic: true });
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, blockedExternal: blocked, liveCalls: 0 }, null, 2));
  console.log(JSON.stringify({ results, blockedExternal: blocked, liveCalls: 0, out }));
})().catch(e => { console.error(e); process.exitCode = 1; });
