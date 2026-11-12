'use strict';
/* 잠금 확인 버튼이 글꼴 다운로드(load)를 기다리지 않는지 확인. 외부 요청 차단, 글꼴 파일은 8초 지연(느린 모바일 가정).
 * 실행: node tests/login-speed-browser.cjs  (NODE_PATH 설정 금지). 실제 갤럭시 기기 미검증. */
const { chromium } = require('playwright'), http = require('http'), fs = require('fs'), path = require('path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
(async () => {
  const server = http.createServer((req, res) => { const f = path.join(root, decodeURIComponent(req.url.split('?')[0])); if (!f.startsWith(root) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); } res.setHeader('Content-Type', f.endsWith('.js') ? 'application/javascript' : f.endsWith('.css') ? 'text/css' : f.endsWith('.html') ? 'text/html' : 'application/octet-stream'); res.end(fs.readFileSync(f)); });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const css = ['Pretendard', 'Noto Sans KR'].map((f, i) => `@font-face{font-family:'${f}';font-display:swap;src:url(https://fonts.gstatic.com/s/synthetic${i}.woff2) format('woff2')}`).join('');
  const b = await chromium.launch(), out = [];
  try {
    for (const width of [360, 390, 430]) {
      const ctx = await b.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block' }), p = await ctx.newPage(), errors = [];
      p.on('pageerror', e => errors.push(e.message));
      await ctx.route('**/*', async r => { const u = new URL(r.request().url()); if (u.hostname === '127.0.0.1') return r.continue(); if (u.hostname === 'fonts.googleapis.com') return r.fulfill({ contentType: 'text/css', body: css }); if (u.hostname === 'fonts.gstatic.com') { await new Promise(s => setTimeout(s, 8000)); return r.abort(); } return r.abort(); });
      const t0 = Date.now();
      await p.goto('http://127.0.0.1:' + server.address().port + '/portfolio_v5.html', { waitUntil: 'commit' });
      await p.waitForSelector('#lockInput', { state: 'visible' });
      await p.waitForFunction(() => typeof hasStartApp === 'function' && hasStartApp.done === true);
      const ready = await p.evaluate(() => document.readyState);
      const pw = await p.evaluate(() => localStorage.getItem('v5_pw') || PW_DEFAULT);
      await p.fill('#lockInput', pw); await p.press('#lockInput', 'Enter');
      await p.waitForFunction(() => document.getElementById('lockScreen').style.display === 'none', null, { timeout: 3000 });
      const unlockMs = Date.now() - t0;
      assert.notEqual(ready, 'complete', 'unlock must work before window load (fonts still pending)');
      assert(unlockMs < 5000, 'unlock ' + unlockMs + 'ms');
      const m = await p.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth, auth: sessionStorage.getItem('v5_auth'), tabs: document.querySelectorAll('.tab').length }));
      assert.equal(m.overflow, false); assert.equal(m.auth, '1'); assert(m.tabs > 3);
      await p.waitForFunction(() => document.readyState === 'complete', null, { timeout: 15000 });
      assert.equal(await p.evaluate(() => document.getElementById('lockScreen').style.display), 'none', 'load must not re-run startup or re-lock');
      assert.deepEqual(errors, []);
      out.push({ width, readyStateAtUnlock: ready, unlockMs, pass: true });
      await ctx.close();
    }
  } finally { await b.close(); server.close(); }
  console.log(JSON.stringify(out));
})().catch(e => { console.error(e); process.exitCode = 1; });
