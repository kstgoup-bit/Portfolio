'use strict';
/* GPT-20261112-1730: 곡소리 400종목 화면 — 첫 진입 1회 조회·한국 기준일 메모리 캐시·요청 병합.
 * 합성/시험 전용(SYNTHETIC / TEST-ONLY). 실제 GAS·시세 요청 없음: JSONP <script>를 가로채 가짜 응답을 준다. */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { JSDOM } = require('jsdom');
const S = require('./lib/synthetic-universe-400.test-only.cjs'), C = require('../has/universe-screen.js');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const GAS = 'https://script.google.com/macros/s/SYNTHETIC_TEST/exec';
const T0 = Date.parse('2026-11-12T03:00:00Z'); // 12:00 KST 목요일

function summary(now, opts = {}) {
  const inp = S.input(); if (opts.sourceAsOf) for (const g of ['kospi200', 'nasdaq100', 'sp100', 'sp500']) inp[g].source = { ...inp[g].source, asOf: opts.sourceAsOf };
  if (opts.kr201) inp.kospi200 = { ...inp.kospi200, members: inp.kospi200.members.concat([{ ticker: S.kr(200) }]), expectedConstituents: 201 };
  const u = C.buildUniverse(inp), end = new Date(now - 86400000).toISOString().slice(0, 10);
  const rows = u.members.slice(0, opts.priced ?? 50).map((t, i) => C.summarize(t, S.record(t.ticker, t.market, end, i), null, new Date(now).toISOString()));
  return C.assemble(u, rows, { generation: 'synthetic-test-only-ui', generatedAt: new Date(now - 3600000).toISOString() });
}

function page(o = {}) {
  let clock = o.clock ?? T0;
  const d = new JSDOM(read('has/universe-screen.html'), { url: 'https://example.invalid/has/universe-screen.html', runScripts: 'outside-only' }), w = d.window;
  const store = { v5_gas: o.gas === undefined ? GAS : o.gas, v5_gen: 'LEDGER-SENTINEL' };
  let writes = 0, fetches = 0; const requests = [];
  Object.defineProperty(w, 'localStorage', { value: { getItem: k => (k in store ? store[k] : null), setItem: () => { writes++; }, removeItem: () => { writes++; }, clear: () => { writes++; } } });
  w.Storage.prototype.setItem = () => { writes++; };
  w.fetch = () => { fetches++; throw Error('no network'); };
  w.XMLHttpRequest = function () { fetches++; throw Error('no network'); };
  w.Date.now = () => clock;
  // JSONP 가로채기: 실제 네트워크 대신 o.respond(url, w) 실행
  const append = w.document.head.append.bind(w.document.head);
  w.document.head.append = (...nodes) => {
    nodes.forEach(n => { if (n.tagName === 'SCRIPT' && n.src) { const u = new URL(n.src); requests.push(u); setTimeout(() => { if (u.hostname !== 'script.google.com') return n.onerror && n.onerror(); (o.respond || ((u, w) => w[u.searchParams.get('callback')](summary(clock))))(u, w, n); }, o.delay ?? 0); } });
    return append(...nodes);
  };
  if (o.testAuto) w.HAS_SCREEN_TEST_AUTO = true;
  for (const f of ['live-price-reference.js', 'universe-screen.js', 'universe-screen-ui.js']) w.eval(read('has/' + f));
  return { w, d, requests, get writes() { return writes; }, get fetches() { return fetches; }, store, tick: ms => { clock += ms; }, status: () => w.document.querySelector('#status').textContent, $: s => w.document.querySelector(s), close: () => w.close() };
}
const settle = (ms = 5) => new Promise(r => setTimeout(r, ms));

test('운영 기본값: 자동 조회 없음(요청 0), 저장소 쓰기 0', async t => {
  const p = page(); t.after(p.close);
  await settle();
  assert.equal(p.requests.length, 0); assert.equal(p.fetches, 0); assert.equal(p.writes, 0);
  assert.equal(p.w.HASUniverseScreenUI.stats().testAuto, false);
  assert.match(p.status(), /GAS 요약 연결 전/);
});

test('시험 모드 첫 진입 1회 조회 → 같은 한국 기준일 재진입·재조회는 캐시(추가 요청 0)', async t => {
  const p = page({ testAuto: true }); t.after(p.close);
  await settle(20);
  assert.equal(p.requests.length, 1);
  const u = p.requests[0]; assert.equal(u.searchParams.get('type'), 'screen'); assert.match(u.searchParams.get('callback'), /^hasScreen_\d+$/);
  assert.match(p.status(), /^합성 시험 자료\(실제 시세 아님\)/); assert.match(p.status(), /매수 검토 후보 없음\(판단 보류\)/);
  assert.match(p.$('#count').textContent, /감시 대상 400종목 \(국내 200 · 미국 200\) — 요약 응답 기준/);
  assert.equal(p.w.HASUniverseScreenUI.stats().cacheDay, '2026-11-12');
  // 재진입(bfcache pageshow) + 버튼
  p.w.dispatchEvent(Object.assign(new p.w.Event('pageshow'), { persisted: true }));
  p.$('#refresh').click(); await settle(20);
  assert.equal(p.requests.length, 1); assert.match(p.status(), /오늘\(한국 기준일\) 받은 요약 재사용/);
  // 한국 기준일 경계: 23:59 KST까지 캐시, 00:00 KST(15:00Z) 이후 새 조회
  p.tick(Date.parse('2026-11-12T14:59:00Z') - T0); p.$('#refresh').click(); await settle(20);
  assert.equal(p.requests.length, 1);
  p.tick(2 * 60000); p.$('#refresh').click(); await settle(20);
  assert.equal(p.requests.length, 2); assert.equal(p.w.HASUniverseScreenUI.stats().cacheDay, '2026-11-13');
  // 행 표시: 매수 의견 없음, 가격 종류·기준일·통화·조정 미검증
  const txt = p.$('#rows').textContent;
  assert.match(txt, /AI 의견: 판단 보류/); assert.match(txt, /자료 기준일 \d{4}-\d{2}-\d{2}/); assert.match(txt, /가격 참고값 [\d,.]+ (KRW|USD) · 종가 확정·조정기준 미검증/);
  assert.match(txt, /12개월 자료 부족.*12개월은 이력·조정기준 확인 전 비움/);
  assert.doesNotMatch(txt + p.status(), /매수 검토 (?!후보 없음)|매수 추천|사세요/);
  assert.equal(p.writes, 0); assert.equal(p.fetches, 0);
});

test('동시 클릭·자동 조회 중복은 요청 1건으로 병합', async t => {
  const p = page({ testAuto: true, delay: 30 }); t.after(p.close);
  for (let i = 0; i < 5; i++) p.$('#refresh').click();
  const r = await Promise.all([p.w.HASUniverseScreenUI.refresh(), p.w.HASUniverseScreenUI.refresh()]);
  assert.equal(p.requests.length, 1); assert.deepEqual(r, ['network', 'network']);
  assert.equal(p.$('#refresh').disabled, false);
});

test('GAS 주소 없음/잘못됨: 시험 모드여도 자동 요청 0, 미연결·판단 보류', async t => {
  for (const gas of [null, 'https://evil.example/macros/s/X/exec', 'javascript:alert(1)']) {
    const p = page({ testAuto: true, gas }); t.after(p.close);
    await settle();
    assert.equal(p.requests.length, 0); assert.match(p.status(), /GAS 미연결 · 판단 보류/);
  }
});

test('오래된(만료)·누락·형식 오류·악성 응답은 표시하지 않고 판단 보류', async t => {
  const bad = {
    expired: (u, w) => w[u.searchParams.get('callback')](summary(T0 - 3 * 86400000)),
    buy: (u, w) => { const s = summary(T0); s.buyCandidates = [{ ticker: '9ZZ000' }]; w[u.searchParams.get('callback')](s); },
    opinion: (u, w) => { const s = summary(T0); s.items[0].opinion = '매수 검토'; w[u.searchParams.get('callback')](s); },
    future: (u, w) => { const s = summary(T0); s.generatedAt = new Date(T0 + 86400000).toISOString(); w[u.searchParams.get('callback')](s); },
    notObject: (u, w) => w[u.searchParams.get('callback')]('<img src=x onerror=alert(1)>'),
    wrongCallback: (u, w) => { w.hasScreen_999 && w.hasScreen_999(summary(T0)); }, // 우리 콜백 미호출 → 시간초과 대신 즉시 onerror 시뮬
    loadError: (u, w, n) => n.onerror()
  };
  for (const [name, respond] of Object.entries(bad)) {
    const p = page({ testAuto: true, respond: name === 'wrongCallback' ? (u, w, n) => { bad.wrongCallback(u, w); n.onerror(); } : respond }); t.after(p.close);
    await settle(20);
    assert.match(p.status(), /조회 보류: .* · 판단 보류$/, name);
    assert.equal(p.$('#rows').children.length, 0, name);
    assert.equal(p.w.HASUniverseScreenUI.stats().cacheDay, null, name);
    assert.equal(p.w.document.querySelectorAll('img').length, 0, name);
  }
});

test('성공 후 오류: 지난 자료는 오래된 값으로 낮추고, 오류 뒤 재시도는 새 요청', async t => {
  let fail = false;
  const p = page({ testAuto: true, respond: (u, w, n) => fail ? n.onerror() : w[u.searchParams.get('callback')](summary(T0)) }); t.after(p.close);
  await settle(20); assert.equal(p.requests.length, 1);
  p.tick(86400000); fail = true; p.$('#refresh').click(); await settle(20);
  assert.equal(p.requests.length, 2); assert.match(p.status(), /조회 보류: 요약 조회 실패 · 아래는 지난 성공 자료입니다/);
  assert.match(p.$('#rows').textContent, /지난 요약|오래된 관측/);
  fail = false; p.$('#refresh').click(); await settle(20);
  assert.equal(p.requests.length, 3); assert.match(p.status(), /^합성 시험 자료/);
});

test('캐시된 요약이 같은 날 만료되면 재사용하지 않고 새로 조회', async t => {
  let n = 0;
  const p = page({ testAuto: true, clock: Date.parse('2026-11-12T00:30:00Z'), respond: (u, w) => { n++; w[u.searchParams.get('callback')]((n === 1 ? summary(Date.parse('2026-11-10T02:00:00Z'), { sourceAsOf: '2026-11-09' }) : summary(Date.parse('2026-11-12T03:30:00Z')))); } }); t.after(p.close);
  await settle(20); // 첫 응답: 생성 46시간 전 → 아직 유효(2일 이내). 목록 기준일은 생성 전(11-09)이어야 함(GPT-20261112-1830 날짜 검사)
  assert.equal(p.requests.length, 1); assert.match(p.status(), /^합성 시험 자료/);
  p.tick(3 * 3600000); p.$('#refresh').click(); await settle(20); // 같은 KST 날짜, 2일 경과 → 만료
  assert.equal(p.requests.length, 2);
});

test('표시 건수는 응답 total 그대로(401 등 400 고정 주장 없음)', () => {
  const ui = read('has/universe-screen-ui.js'), html = read('has/universe-screen.html');
  assert.match(ui, /'감시 대상 '\+v\.total\+'종목/);
  assert.doesNotMatch(html.replace(/<title>.*?<\/title>|<h1>.*?<\/h1>/g, ''), /정확히 400|400개 감시/);
  assert.doesNotMatch(ui, /localStorage\.setItem|indexedDB/);
  // GPT-20261112-1930: sessionStorage는 시험 게이트(HAS_SCREEN_TEST_SESSION_CACHE===true) 뒤 store() 한 곳에서만 접근
  assert.equal((ui.match(/sessionStorage/g) || []).length, 2); assert.match(ui, /SC_ON=W\.HAS_SCREEN_TEST_SESSION_CACHE===true/); assert.match(ui, /function store\(\)\{try\{return W\.sessionStorage\|\|null;/);
  assert.doesNotMatch(ui, /new Date\(\)\.toISOString\(\)\.slice\(0,10\)/, 'UTC 날짜 대신 KST 기준일 사용'); assert.match(ui, /function kstDay\(t\)\{return new Date\(t\+32400000\)/);
});

test('GPT-20261112-1830: 국내 201 합성 응답이면 화면 건수 401(국내 201 · 미국 200)을 응답 그대로 표시', async t => {
  const p = page({ testAuto: true, respond: (u, w) => w[u.searchParams.get('callback')](summary(T0, { kr201: true })) }); t.after(p.close);
  await settle(20);
  assert.equal(p.requests.length, 1);
  assert.match(p.$('#count').textContent, /감시 대상 401종목 \(국내 201 · 미국 200\) — 요약 응답 기준/);
  assert.match(p.status(), /^합성 시험 자료.*대상 401.*매수 검토 후보 없음\(판단 보류\)$/);
  assert.equal(p.writes, 0);
});
