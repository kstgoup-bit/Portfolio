'use strict';
/* GPT-20261112-1930 Chromium 확인(합성/시험 전용): 실제 브라우저 sessionStorage로 새로고침·뒤로가기·탭 격리.
 * 외부 요청 모두 차단, GAS는 가짜 JSONP. 실행: node tests/universe-screen-session-browser.cjs (NODE_PATH 설정 금지). 산출물은 OS 임시 폴더. */
const { chromium } = require('playwright'), fs = require('fs'), http = require('http'), os = require('os'), path = require('path'), assert = require('node:assert/strict');
const S = require('./lib/synthetic-universe-400.test-only.cjs'), C = require('../has/universe-screen.js');
const KEY = 'kst.has.screen.public.v1';
function summary(now, kr201) {
  const inp = S.input(); if (kr201) inp.kospi200 = { ...inp.kospi200, members: inp.kospi200.members.concat([{ ticker: S.kr(200) }]), expectedConstituents: 201 };
  const u = C.buildUniverse(inp), end = new Date(now - 86400000).toISOString().slice(0, 10);
  const rows = u.members.slice(0, 60).map((t, i) => C.summarize(t, S.record(t.ticker, t.market, end, i), null, new Date(now).toISOString()));
  return C.assemble(u, rows, { generation: 'synthetic-test-only-session-browser', generatedAt: new Date(now - 3600000).toISOString() });
}
(async () => {
  const root = path.resolve(__dirname, '..'), out = process.env.HAS_EVIDENCE_DIR || fs.mkdtempSync(path.join(os.tmpdir(), 'has-screen-session-'));
  const server = http.createServer((req, res) => { const file = path.join(root, req.url.split('?')[0]); if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; res.end(); return; } res.setHeader('Content-Type', file.endsWith('.js') ? 'application/javascript' : 'text/html'); res.end(fs.readFileSync(file)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = 'http://127.0.0.1:' + server.address().port, browser = await chromium.launch(), results = [];
  let blocked = 0;
  const rows = page => page.waitForFunction(() => document.querySelectorAll('#rows article').length === 10);
  try {
    for (const width of [360, 390, 430]) for (const gate of [true, false]) {
      const kr201 = width === 390, ctx = await browser.newContext({ viewport: { width, height: 800 } }), errors = [];
      let gas = 0;
      await ctx.route('**/*', r => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1') return r.continue(); if (u.hostname === 'script.google.com' && u.searchParams.get('type') === 'screen') { gas++; const cb = u.searchParams.get('callback'); assert.match(cb, /^hasScreen_\d+$/); return r.fulfill({ contentType: 'application/javascript', body: cb + '(' + JSON.stringify(summary(Date.now(), kr201)) + ')' }); } blocked++; return r.abort(); });
      await ctx.addInitScript(g => { localStorage.setItem('v5_gas', 'https://script.google.com/macros/s/SYNTHETIC/exec'); localStorage.setItem('v5_gen', 'SENTINEL'); window.HAS_SCREEN_TEST_AUTO = true; if (g) window.HAS_SCREEN_TEST_SESSION_CACHE = true; }, gate);
      const page = await ctx.newPage(); page.on('pageerror', e => errors.push(e.message));
      await page.goto(base + '/has/universe-screen.html'); await rows(page);
      assert.equal(gas, 1);
      const raw = await page.evaluate(k => ({ keys: Object.keys(sessionStorage), v: sessionStorage.getItem(k) }), KEY);
      if (gate) { assert.deepEqual(raw.keys, [KEY]); assert.doesNotMatch(raw.v, /script\.google\.com|SYNTHETIC\/exec|SENTINEL|v5_/); }
      else assert.deepEqual(raw.keys, []);
      await page.reload(); await rows(page);
      const afterReload = gas, reloadStatus = await page.locator('#status').innerText();
      await page.click('a[href*="portfolio_v5.html"]'); await page.waitForTimeout(300); await page.goBack(); await rows(page);
      const afterBack = gas, nav = await page.evaluate(() => performance.getEntriesByType('navigation')[0].type);
      const count = await page.locator('#count').innerText();
      assert.match(count, kr201 ? /감시 대상 401종목 \(국내 201 · 미국 200\)/ : /감시 대상 400종목 \(국내 200 · 미국 200\)/);
      if (gate) { assert.equal(afterReload, 1, 'reload uses session cache'); assert.match(reloadStatus, /재사용/); assert.equal(afterBack, 1, 'back uses session cache'); }
      else { assert.equal(afterReload, 2); assert(afterBack >= 2 && afterBack <= 3); }
      const m = await page.evaluate(() => { const bad = [], small = []; document.querySelectorAll('button,summary,a').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.height < 44) bad.push(e.textContent.trim().slice(0, 20)); }); document.querySelectorAll('body *').forEach(e => { if ([...e.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && parseFloat(getComputedStyle(e).fontSize) < 12) small.push(e.tagName); }); return { overflow: document.documentElement.scrollWidth > innerWidth, bad, small, ledger: localStorage.getItem('v5_gen') }; });
      assert.equal(m.overflow, false); assert.deepEqual(m.bad, []); assert.deepEqual(m.small, []); assert.equal(m.ledger, 'SENTINEL');
      // 새 탭(같은 컨텍스트, 별도 sessionStorage) → 공유 안 함
      const before = gas, tab2 = await ctx.newPage(); tab2.on('pageerror', e => errors.push(e.message));
      await tab2.goto(base + '/has/universe-screen.html'); await rows(tab2);
      assert.equal(gas - before, 1, 'new tab does not share session cache');
      assert.deepEqual(errors, []);
      await page.screenshot({ path: path.join(out, `session-${gate}-${width}.png`) });
      results.push({ width, gate, total: kr201 ? 401 : 400, requests: { first: 1, afterReload, afterBack, newTab: gas - before }, backNavigation: nav, pass: true, synthetic: true });
      await ctx.close();
    }
  } finally { await browser.close(); server.close(); }
  fs.writeFileSync(path.join(out, 'results.json'), JSON.stringify({ results, blockedExternal: blocked, liveCalls: 0 }, null, 2));
  console.log(JSON.stringify({ results, blockedExternal: blocked, liveCalls: 0, out }));
})().catch(e => { console.error(e); process.exitCode = 1; });
