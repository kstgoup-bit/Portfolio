'use strict';
/* 20단계 C: 360/390/430px 실제 렌더링 측정(합성 데이터)을 기준값과 대조하고, 원장 시범의 이전 미리보기 카드를 확인한다. */
const { spawnSync } = require('child_process'), fs = require('fs'), path = require('path'), os = require('os'), assert = require('assert/strict');
const ROOT = path.resolve(__dirname, '..'); let groups = 0;
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'has20-')), 'm.json');
const r = spawnSync(process.execPath, ['--require', path.join(__dirname, 'lib', 'no-network.cjs'), path.join(__dirname, 'lib', 'measure-readability.cjs'), out], { cwd: ROOT, env: process.env, encoding: 'utf8', timeout: 300000 });
assert.equal(r.status, 0, r.stderr); const M = JSON.parse(fs.readFileSync(out, 'utf8'));
const ok = (n, f) => { f(); groups++; console.log('PASS', n); };
const each = f => { for (const [k, v] of Object.entries(M)) f(k, v); };
ok('가로 넘침 0 (8화면 × 3폭)', () => each((k, v) => assert.equal(v.overflowX, false, k)));
ok('측정된 조작 요소는 전부 44px 이상 (잠금·대시보드·일반·해외·배당·위험·설정·원장 시범)', () => each((k, v) => assert.equal(v.touchSmall, 0, k + ' ' + JSON.stringify(v.touchList))));
ok('HTML 글씨는 전부 12px 이상, 차트(SVG) 라벨은 화면 표시 크기 기준 화면당 2개 이하 예외', () => each((k, v) => { const svg = (v.svgList || []).length; assert.ok(v.small - svg <= 0 || v.small === svg, k + ' ' + JSON.stringify(v.smallList)); assert.ok(svg <= 2, k + ' ' + JSON.stringify(v.svgList)); }));
ok('대비 4.5:1 미만은 화면당 2개 이하(색 의미가 있는 ✓ 아이콘·빈 점수 "—")', () => each((k, v) => assert.ok(v.low <= 2, k + ' ' + JSON.stringify(v.lowList))));
ok('그라데이션 배경 글씨는 별도 집계(측정 불가)로 분리되어 있음', () => assert.ok(Object.values(M).some(v => typeof v.unknownBg === 'number')));
(async () => {
  const http = require('http'), { chromium } = require('playwright');
  const mime = f => f.endsWith('.html') ? 'text/html; charset=utf-8' : f.endsWith('.css') ? 'text/css' : f.endsWith('.js') ? 'text/javascript' : f.endsWith('.json') ? 'application/json' : 'application/octet-stream';
  const srv = http.createServer((q, res) => { try { const p = decodeURIComponent(q.url.split('?')[0]), f = path.resolve(ROOT, '.' + (p === '/' ? '/portfolio_v5.html' : p)); if (!f.startsWith(ROOT + path.sep)) throw Error(); res.setHeader('Content-Type', mime(f)); res.end(fs.readFileSync(f)); } catch { res.statusCode = 404; res.end('nf'); } });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); const origin = 'http://127.0.0.1:' + srv.address().port, o = { headless: true };
  if (process.env.BROWSER_EXECUTABLE_PATH) { o.executablePath = process.env.BROWSER_EXECUTABLE_PATH; o.args = ['--no-sandbox', '--disable-dev-shm-usage']; }
  const b = await chromium.launch(o);
  try {
    for (const w of [360, 390, 430]) {
      const ctx = await b.newContext({ viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' }); await ctx.route('**/*', r => r.request().url().startsWith(origin + '/') ? r.continue() : r.abort());
      await ctx.addInitScript(() => { sessionStorage.setItem('v5_auth', '1'); if (!localStorage.getItem('__s')) { localStorage.setItem('v5_gen', JSON.stringify([{ id: 1, name: '합성', ticker: 'AAA', quantity: 2, avgPrice: 40000, currentPrice: 50000 }])); localStorage.setItem('__s', '1'); } });
      const page = await ctx.newPage(); await page.goto(origin + '/portfolio_v5.html'); await page.waitForTimeout(500);
      const snap = () => page.evaluate(() => JSON.stringify(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
      const before = await snap(); await page.evaluate("switchTab('ledgerdemo')"); await page.waitForTimeout(300);
      const card = page.locator('[data-testid=hld-migration]'); assert.equal(await card.count(), 1, w + ' 카드');
      const t = await card.innerText(); for (const x of ['합성', '저장 안 함', '이력 미확인', '쓰기 0건', '제외']) assert.ok(t.includes(x), w + ' ' + x);
      assert.ok(!/has_ledger_v1/.test(t)); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.reload(); await page.waitForTimeout(400); assert.equal(await snap(), before, w + ' 저장소 불변');
      await ctx.close();
    }
    groups++; console.log('PASS 원장 시범: 이전 미리보기 카드 표시(합성·저장 안 함·이력 미확인·제외 항목), 가로 넘침 0, 열고 새로고침해도 저장소 불변 (360/390/430)');
  } finally { await b.close(); srv.close(); }
  console.log(groups + ' groups passed');
})().catch(e => { console.error(e); process.exit(1); });
