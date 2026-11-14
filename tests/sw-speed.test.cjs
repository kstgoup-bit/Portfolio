'use strict';
/* 2026-11-12 로그인 속도: 서비스워커 요청 처리 규칙(vm, 네트워크 없음). */
const { test } = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), path = require('node:path');
const src = fs.readFileSync(path.join(__dirname, '../service-worker.js'), 'utf8'), ORIGIN = 'https://kstgoup-bit.github.io';
function load(o = {}) {
  const events = {}, calls = [], puts = [], deleted = [];
  vm.runInNewContext(src, { self: { addEventListener: (n, f) => events[n] = f, location: { origin: ORIGIN }, skipWaiting() {}, clients: { claim() {} } }, Date, URL, Response, console,
    fetch: async (r, init) => { calls.push({ url: r.url, init }); if (o.offline) throw TypeError('offline'); return o.response ? o.response() : new Response('ok', { status: 200 }); },
    caches: { open: async () => ({ put: async (r) => puts.push(r.url), addAll: async () => {} }), match: async r => (o.cached || {})[typeof r === 'string' ? r : r.url] || undefined, keys: async () => o.keys || [], delete: async k => deleted.push(k) } });
  return { events, calls, puts, deleted, fire(req) { let p = null; events.fetch({ request: req, respondWith: x => p = x }); return p; } };
}
const req = (url, mode = 'no-cors', method = 'GET') => ({ url, mode, method });
const tick = () => new Promise(r => setTimeout(r, 5));

test('글꼴 주소는 서비스워커가 관여하지 않음 → 브라우저 기본 캐시(매번 재다운로드 제거)', () => {
  const w = load();
  for (const u of ['https://fonts.googleapis.com/css2?family=Pretendard', 'https://fonts.gstatic.com/s/x.woff2']) assert.equal(w.fire(req(u)), null, u);
  assert.equal(w.calls.length, 0);
});
test('그 밖의 다른 주소(GAS·시세·뉴스)는 이전과 같이 항상 no-store — 시세 신선도 불변', async () => {
  const w = load();
  for (const u of ['https://script.google.com/macros/s/X/exec?type=screen', 'https://api.allorigins.win/raw?url=x', 'https://query1.finance.yahoo.com/v8/finance/chart/X']) await w.fire(req(u, 'cors'));
  assert.deepEqual(w.calls.map(c => c.init.cache), ['no-store', 'no-store', 'no-store']);
});
test('같은 주소(화면·부품)는 no-cache 재확인(304 가능) — 매번 전체 다운로드(no-store) 아님', async () => {
  const w = load();
  for (const [u, m] of [[ORIGIN + '/Portfolio/portfolio_v5.html', 'navigate'], [ORIGIN + '/Portfolio/radar/ui.js', 'no-cors'], [ORIGIN + '/Portfolio/has/readability.css', 'no-cors']]) {
    const r = await w.fire(req(u, m)); assert.equal(await r.text(), 'ok');
  }
  assert.deepEqual(w.calls.map(c => c.init.cache), ['no-cache', 'no-cache', 'no-cache']);
});
test('POST 등은 관여하지 않음', () => { const w = load(); assert.equal(w.fire(req(ORIGIN + '/x', 'cors', 'POST')), null); });
test('오프라인: 화면은 캐시된 앱, 스크립트는 캐시 없으면 HTML 대신 오류', async () => {
  const html = new Response('<html>app</html>', { headers: { 'Content-Type': 'text/html' } });
  const w = load({ offline: true, cached: { './portfolio_v5.html': html } });
  assert.equal(await (await w.fire(req(ORIGIN + '/Portfolio/?x=1', 'navigate'))).text(), '<html>app</html>');
  const js = await load({ offline: true, cached: { './portfolio_v5.html': new Response('<html>app</html>') } }).fire(req(ORIGIN + '/Portfolio/radar/data/demo.json', 'cors'));
  assert.equal(js.type, 'error');
});
test('오프라인: 캐시된 부품은 그대로 제공', async () => {
  const u = ORIGIN + '/Portfolio/radar/ui.js', w = load({ offline: true, cached: { [u]: new Response('js') } });
  assert.equal(await (await w.fire(req(u))).text(), 'js');
});
test('정상(200) 응답만 저장 — 오류 응답 저장 안 함(기존 규칙 유지)', async () => {
  const ok = load(); await ok.fire(req(ORIGIN + '/a.js')); await tick(); assert.deepEqual(ok.puts, [ORIGIN + '/a.js']);
  const bad = load({ response: () => new Response('x', { status: 404 }) }); await bad.fire(req(ORIGIN + '/b.js')); await tick(); assert.deepEqual(bad.puts, []);
});
test('활성화 정리는 이 앱 접두어(portfolio-v5-)의 이전 캐시만', async () => {
  const w = load({ keys: ['portfolio-v5-2026-11-11', 'portfolio-v5-' + new Date().toISOString().slice(0, 10), 'other-app', 'kst-radar-experimental-v0'] });
  let p; w.events.activate({ waitUntil: x => p = x }); await p;
  assert.deepEqual(w.deleted, ['portfolio-v5-2026-11-11']);
});
test('설치 목록·캐시 이름 규칙은 그대로', () => {
  assert.match(src, /const CACHE_NAME = 'portfolio-v5-' \+ new Date\(\)\.toISOString\(\)\.slice\(0,10\);/);
  assert.deepEqual([...new Set([...src.matchAll(/'\.\/([^']+)'/g)].map(m => m[1]))].sort(), ['icon-192.png', 'icon-512.png', 'manifest.json', 'portfolio_v5.html']);
});
