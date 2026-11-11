/* 17단계: 실사용 앱(portfolio_v5.html)에 HAS 이름이 반영돼도 저장 데이터·설치 앱·오프라인 동작이 유지되는지 시험.
 * 합성 데이터만. 외부 요청 전부 차단. 자동시험이며 실제 갤럭시 기기 시험이 아님. */
'use strict';
const fs = require('fs'), path = require('path'), http = require('http'), assert = require('assert/strict');
const { chromium } = require('playwright'); const { legacyText } = require('./lib/has-rename.cjs');
const ROOT = path.resolve(__dirname, '..'), SIZES = [360, 390, 430];
let serveLegacy = false;
const mime = p => p.endsWith('.html') ? 'text/html; charset=utf-8' : p.endsWith('.css') ? 'text/css' : p.endsWith('.js') ? 'text/javascript' : p.endsWith('.json') ? 'application/json' : p.endsWith('.png') ? 'image/png' : 'application/octet-stream';
const server = http.createServer((req, res) => {
  try {
    const p = decodeURIComponent(req.url.split('?')[0]), rel = p === '/' ? '/portfolio_v5.html' : p, f = path.resolve(ROOT, '.' + rel);
    if (!f.startsWith(ROOT + path.sep)) throw Error();
    res.setHeader('Content-Type', mime(f)); res.setHeader('Cache-Control', 'no-store');
    if (serveLegacy && rel === '/portfolio_v5.html') return res.end(legacyText('portfolio_v5.html'));
    if (serveLegacy && rel === '/manifest.json') return res.end(legacyText('manifest.json'));
    res.end(fs.readFileSync(f));
  } catch { res.statusCode = 404; res.end('not found'); }
});
const SEED = { v5_gen: [{ id: 1, name: '합성 일반', ticker: 'AAA', quantity: 2, avgPrice: 40, currentPrice: 50 }], v5_dom: [{ id: 2, name: '합성 국내', ticker: 'BBB', quantity: 3, avgPrice: 10, currentPrice: 12 }], v5_ov: [{ id: 3, name: '합성 해외', ticker: 'CCC', quantity: 1, avgPrice: 90, currentPrice: 99 }], v5_pen: [{ id: 4, name: '합성 연금', ticker: 'DDD', quantity: 5, avgPrice: 20, currentPrice: 21 }] };
let browser, origin; const results = [];
async function check(name, fn) { try { await fn(); results.push([name, 'pass']); console.log('PASS', name); } catch (e) { results.push([name, 'fail']); console.error('FAIL', name, e.message); process.exitCode = 1; } }
async function ctxFor(width, { auth = true, sw = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: sw ? 'allow' : 'block' });
  await ctx.route('**/*', r => r.request().url().startsWith(origin + '/') ? r.continue() : r.abort());
  await ctx.addInitScript(({ seed, auth }) => {
    if (auth) sessionStorage.setItem('v5_auth', '1');
    if (!localStorage.getItem('__seeded')) { for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, JSON.stringify(v)); localStorage.setItem('unrelated-key', 'KEEP'); localStorage.setItem('__seeded', '1'); }
    document.addEventListener('DOMContentLoaded', () => { for (const f of ['fetchBenchmarkHistory', 'fetchFX', 'fetchKR', 'fetchUS', 'fetchRiskData']) window[f] = () => { }; });
  }, { seed: SEED, auth });
  return ctx;
}
const store = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage).sort().map(k => [k, localStorage.getItem(k)])));
async function load(width, legacy, opts) { serveLegacy = legacy; const ctx = await ctxFor(width, opts), page = await ctx.newPage(); await page.goto(origin + '/portfolio_v5.html'); await page.waitForTimeout(600); return { ctx, page }; }
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); origin = 'http://127.0.0.1:' + server.address().port;
  const o = { headless: true }; if (process.env.BROWSER_EXECUTABLE_PATH) { o.executablePath = process.env.BROWSER_EXECUTABLE_PATH; o.args = ['--no-sandbox', '--disable-dev-shm-usage']; }
  browser = await chromium.launch(o);
  for (const w of SIZES) {
    await check('잠금화면·머리글·탭 제목이 HAS이고 가로 넘침 없음 ' + w + 'px', async () => {
      let { ctx, page } = await load(w, false, { auth: false });
      assert.equal(await page.title(), 'HAS · Hidden Alpha System'); assert.match(await page.locator('.lock-title').innerText(), /HAS/);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), w); await ctx.close();
      ({ ctx, page } = await load(w, false)); assert.match(await page.locator('.header-title').innerText(), /^HAS · Hidden Alpha System/);
      const g = await page.evaluate(() => { const h = document.querySelector('.header-title').getBoundingClientRect(); return { sw: document.documentElement.scrollWidth, right: h.right, left: h.left, iw: innerWidth }; });
      assert.equal(g.sw, w); assert.ok(g.right <= g.iw + .5 && g.left >= -.5, '머리글이 화면 밖으로 나감'); await ctx.close();
    });
    await check('저장 데이터: 16단계 앱과 HAS 앱이 같은 시작 데이터에서 저장소 결과 동일(변경·삭제·추가 0) ' + w + 'px', async () => {
      const a1 = await load(w, true), s1 = await store(a1.page); await a1.ctx.close();
      const a2 = await load(w, false), s2 = await store(a2.page); await a2.ctx.close();
      assert.deepEqual(s2, s1); for (const k of Object.keys(SEED)) assert.equal(s2[k], JSON.stringify(SEED[k]), k); assert.equal(s2['unrelated-key'], 'KEEP');
    });
  }
  await check('새로고침·뒤로가기·탭 전환 후에도 데이터 유지', async () => {
    const { ctx, page } = await load(390, false); const before = await store(page);
    await page.locator('#gtab-risk').click(); await page.reload(); await page.waitForTimeout(500);
    await page.goBack().catch(() => { }); await page.waitForTimeout(300); if (!page.url().startsWith(origin)) { await page.goForward(); await page.waitForTimeout(500); } /* 첫 화면에서 뒤로가기는 빈 페이지로 나감 — 앱 밖이므로 다시 앞으로 */
    assert.deepEqual(await store(page), before); assert.equal(await page.title(), 'HAS · Hidden Alpha System'); await ctx.close();
  });
  await check('설치 앱 갱신: 옛 이름으로 설치·캐시된 뒤 새 버전을 받아도 데이터 유지, 캐시 이름 1개, 이름만 HAS로 갱신', async () => {
    serveLegacy = true; const ctx = await ctxFor(390, { sw: true }), page = await ctx.newPage(); await page.goto(origin + '/portfolio_v5.html'); await page.waitForTimeout(1200);
    assert.match(await page.title(), /5년 안에 10억/); await page.evaluate(() => navigator.serviceWorker.ready); const before = await store(page);
    serveLegacy = false; await page.reload(); await page.waitForTimeout(1200); await page.reload(); await page.waitForTimeout(800);
    assert.equal(await page.title(), 'HAS · Hidden Alpha System'); assert.deepEqual(await store(page), before);
    const caches = await page.evaluate(async () => await caches.keys()); assert.equal(caches.length, 1, JSON.stringify(caches));
    const m = await page.evaluate(async () => (await (await fetch('/manifest.json', { cache: 'no-store' })).json())); assert.equal(m.short_name, 'HAS'); assert.equal(m.start_url, './portfolio_v5.html');
    await ctx.close();
  });
  await check('오프라인: 한 번 열어 둔 뒤 오프라인에서 다시 열어도 HAS 화면과 데이터 유지', async () => {
    serveLegacy = false; const ctx = await ctxFor(390, { sw: true }), page = await ctx.newPage(); await page.goto(origin + '/portfolio_v5.html'); await page.waitForTimeout(1200); await page.evaluate(() => navigator.serviceWorker.ready);
    await page.reload(); await page.waitForTimeout(800); const before = await store(page);
    await ctx.setOffline(true); await page.reload(); await page.waitForTimeout(800);
    assert.equal(await page.title(), 'HAS · Hidden Alpha System'); assert.deepEqual(await store(page), before); await ctx.close();
  });
  await check('매니페스트 링크·아이콘 파일 존재, 이름 중복 설치 방지(id/scope 미추가)', async () => {
    const m = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8')); assert.ok(fs.existsSync(path.join(ROOT, m.icons[0].src))); assert.ok(!('id' in m));
    assert.match(fs.readFileSync(path.join(ROOT, 'portfolio_v5.html'), 'utf8'), /<link rel="manifest" href="manifest.json">/);
  });
  await browser.close(); server.close();
  const f = results.filter(r => r[1] === 'fail').length; console.log(f ? f + ' failed' : results.length + ' groups passed');
})();
