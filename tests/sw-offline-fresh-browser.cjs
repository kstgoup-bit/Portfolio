'use strict';
/* 개선 서비스워커: ① 파일이 바뀌면 다음 실행에 바로 새 파일(304 재확인으로 최신 유지) ② 오프라인이면 캐시로 앱 열림
 * ③ 오프라인 스크립트 요청에 HTML을 주지 않음 ④ 활성화 뒤 만든 다른 앱 캐시 유지(활성화 정리 규칙 자체는 tests/sw-speed.test.cjs). 합성·로컬 전용, 외부 호출 0. NODE_PATH 설정 금지. */
const { chromium } = require('playwright'), fs = require('fs'), http = require('http'), path = require('path'), crypto = require('crypto'), assert = require('node:assert/strict');
const ROOT = path.resolve(__dirname, '..');
let marker = 'v1';
const server = http.createServer((req, res) => {
  const p = decodeURIComponent(req.url.split('?')[0]), f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.statusCode = 404; return res.end(); }
  let body = fs.readFileSync(f); if (p === '/portfolio_v5.html') body = Buffer.from(body.toString().replace('<title>', '<meta name="sw-marker" content="' + marker + '"><title>'));
  const etag = '"' + crypto.createHash('sha1').update(body).digest('hex') + '"';
  res.setHeader('ETag', etag); res.setHeader('Cache-Control', 'max-age=600'); res.setHeader('Content-Type', p.endsWith('.js') ? 'application/javascript' : p.endsWith('.css') ? 'text/css' : p.endsWith('.json') ? 'application/json' : p.endsWith('.png') ? 'image/png' : 'text/html');
  if (req.headers['if-none-match'] === etag) { res.statusCode = 304; return res.end(); } res.end(body);
});
(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r)); const base = 'http://127.0.0.1:' + server.address().port;
  const browser = await chromium.launch({ args: ['--no-proxy-server', '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1'] }), out = {};
  try {
    const ctx = await browser.newContext({ serviceWorkers: 'allow' }); let page = await ctx.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/portfolio_v5.html'); await page.evaluate(async () => { await navigator.serviceWorker.ready; await caches.open('other-app-cache').then(c => c.put('/x', new Response('keep'))); });
    await page.reload(); await page.waitForFunction(() => !!navigator.serviceWorker.controller);
    // ① 새 버전
    marker = 'v2'; await page.reload(); out.freshMarker = await page.getAttribute('meta[name=sw-marker]', 'content'); assert.equal(out.freshMarker, 'v2');
    // ② 오프라인
    await ctx.setOffline(true); await page.reload(); await page.waitForFunction(() => window.hasStartApp && hasStartApp.done === true);
    out.offlineMarker = await page.getAttribute('meta[name=sw-marker]', 'content'); out.offlineLockVisible = await page.isVisible('#lockBtn'); assert.equal(out.offlineLockVisible, true);
    // ③ 오프라인 미캐시 스크립트 → HTML 대체 없음
    out.offlineMissingJs = await page.evaluate(() => fetch('./not-cached-' + Date.now() + '.js').then(r => 'status ' + r.status + ' ' + r.headers.get('content-type'), e => 'network-error'));
    assert.equal(out.offlineMissingJs, 'network-error');
    await ctx.setOffline(false);
    // ④ 다른 앱 캐시 보존(활성화 정리는 portfolio-v5- 접두어만)
    out.cacheKeys = await page.evaluate(() => caches.keys()); assert(out.cacheKeys.includes('other-app-cache'));
    out.pageErrors = errors; // 오프라인 다른 주소 요청의 HTML 대체로 생기는 "Unexpected token '<'"는 기존 워커와 동일(기존 동작 유지 범위) — 기록만
    await ctx.close();
  } finally { await browser.close(); server.close(); }
  console.log(JSON.stringify({ pass: true, ...out, liveCalls: 0 }));
})().catch(e => { console.error(e); process.exitCode = 1; });
