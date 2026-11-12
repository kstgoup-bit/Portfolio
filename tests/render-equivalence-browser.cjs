'use strict';
/* 속도 변경 전(origin/main)·후 앱이 잠금 해제 후 같은 화면을 그리는지 비교 — 합성 자료 41종목·170일, 시각 고정, 외부 차단, 360/390/430.
 * 실행: node tests/render-equivalence-browser.cjs [기준 git 참조=origin/main]. NODE_PATH 설정 금지. */
const { chromium } = require('playwright'), fs = require('fs'), http = require('http'), path = require('path'), cp = require('child_process'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..'), REF = process.argv[2] || 'origin/main', FIXED = Date.parse('2026-11-12T03:00:00Z');
const policy = require('../has/snapshot-policy.js'), keys = ['all', 'gen', 'dom', 'ov', 'pen'];
const accounts = {}; for (const [k, n] of [['gen', 11], ['dom', 10], ['ov', 10], ['pen', 10]]) accounts[k] = Array.from({ length: n }, (_, i) => ({ id: i, name: '합성 ' + k + i, ticker: 'SYN_' + k + i, quantity: 10 + i, avgPrice: 80 + i, currentPrice: 100 + i }));
function input(key, ts, day) { const c = JSON.parse(JSON.stringify(accounts)), fp = {}, qm = { FX: ts }, qv = { FX: 1370 }; for (const [k, rows] of Object.entries(c)) for (const r of rows) { r.currentPrice += day / 100; const q = (k === 'ov' ? 'US:' : 'KR:') + r.ticker; fp[q] = true; qm[q] = ts; qv[q] = r.currentPrice; } return { key, now: ts, accounts: c, fx: 1370, freshPrice: fp, quoteMeta: qm, quoteValues: qv }; }
const snaps = {}; for (const key of keys) snaps[key] = Array.from({ length: 170 }, (_, d) => policy.evaluate(input(key, FIXED - (170 - d) * 86400000, d)).snapshot);
const SEED = { v5_pw: 'synthetic-pw-1234', v5_gen: JSON.stringify(accounts.gen), v5_dom: JSON.stringify(accounts.dom), v5_ov: JSON.stringify(accounts.ov), v5_pen: JSON.stringify(accounts.pen), v5_snap: JSON.stringify(snaps) };
const git = f => cp.execSync('git show ' + REF + ':' + f, { cwd: ROOT, maxBuffer: 1 << 28 });
function server(old) { return http.createServer((q, r) => { const p = decodeURIComponent(q.url.split('?')[0]).slice(1); let body; try { body = old ? git(p) : fs.readFileSync(path.join(ROOT, p)); } catch (e) { r.statusCode = 404; return r.end(); } r.setHeader('Content-Type', p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.html') ? 'text/html' : 'application/octet-stream'); r.end(body); }); }
(async () => {
  const b = await chromium.launch({ args: ['--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] }), res = [];
  try {
    for (const width of [360, 390, 430]) {
      const out = {};
      for (const old of [true, false]) {
        const s = server(old); await new Promise(r => s.listen(0, '127.0.0.1', r));
        const ctx = await b.newContext({ viewport: { width, height: 800 }, serviceWorkers: 'block' }); const p = await ctx.newPage(); const errors = []; p.on('pageerror', e => errors.push(e.message));
        await ctx.route(u => !/^http:\/\/127\.0\.0\.1:/.test(u.href), r => r.abort()); // 외부 요청 전부 차단
        await p.clock.install({ time: FIXED }); await ctx.addInitScript(seed => { for (const k in seed) localStorage.setItem(k, seed[k]); }, SEED);
        await p.goto('http://127.0.0.1:' + s.address().port + '/portfolio_v5.html'); await p.waitForFunction(() => window.hasStartApp && hasStartApp.done);
        await p.fill('#lockInput', 'synthetic-pw-1234'); await p.click('#lockBtn'); await p.clock.runFor(4000); await p.waitForTimeout(300);
        out[old ? 'before' : 'after'] = { text: await p.evaluate(() => { /* 2026-11-12 의도된 변경(관측일·수신·출처 접힌 안내로 이동, 상태 문구 위치) 요소는 양쪽 모두 제거 후 비교 */ document.querySelectorAll('.benchStatusMsg,details').forEach(e => { if (e.classList.contains('benchStatusMsg') || /수익률 계산 안내/.test(e.textContent.slice(0, 40))) e.remove(); }); document.querySelectorAll('div').forEach(e => { if (!e.querySelector('div') && /^관측일: /.test(e.textContent)) e.remove(); }); return document.body.innerText + '\n@@HTML@@\n' + [...document.querySelectorAll('[id$="ReturnsTable"],[id$="LineChart"],[id^="panel-"]')].map(e => e.id + '=' + e.textContent).join('\n'); }), lock: await p.evaluate(() => document.getElementById('lockScreen').style.display), overflow: await p.evaluate(() => document.documentElement.scrollWidth > innerWidth), errors };
        await ctx.close(); s.close();
      }
      const norm = t => t;
      const same = out.before.text === out.after.text;
      if (!same) { const A = out.before.text.split('\n'), B = out.after.text.split('\n'); const d = []; for (let i = 0; i < Math.max(A.length, B.length) && d.length < 10; i++) if (A[i] !== B[i]) d.push([i, A[i], B[i]]); console.log('DIFF', width, JSON.stringify(d)); }
      assert.equal(out.after.lock, 'none'); assert.equal(out.after.overflow, false); assert.deepEqual(out.after.errors, out.before.errors);
      res.push({ width, sameRenderedText: same, textLength: out.after.text.length, errors: out.after.errors.length });
    }
  } finally { await b.close(); }
  console.log(JSON.stringify({ res, synthetic: true, liveCalls: 0 })); if (res.some(r => !r.sameRenderedText)) process.exitCode = 1;
})().catch(e => { console.error(e); process.exitCode = 1; });
