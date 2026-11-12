'use strict';
/* GPT-20261112-1930: 곡소리 400/401 — 뒤로가기·새로고침 후 시험 전용 세션 캐시(kst.has.screen.public.v1).
 * 합성/시험 전용(SYNTHETIC / TEST-ONLY). 실제 GAS·시세·사용자 저장소 접근 없음: JSONP <script>를 가로채 가짜 응답,
 * sessionStorage는 탭 하나를 흉내 낸 메모리 Map(새로고침 = 같은 Map으로 새 문서). */
const { test } = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), { JSDOM } = require('jsdom');
const S = require('./lib/synthetic-universe-400.test-only.cjs'), C = require('../has/universe-screen.js');
const root = path.join(__dirname, '..'), read = f => fs.readFileSync(path.join(root, f), 'utf8');
const GAS = 'https://script.google.com/macros/s/SYNTHETIC_TEST/exec', KEY = 'kst.has.screen.public.v1';
const T0 = Date.parse('2026-11-12T03:00:00Z'); // 12:00 KST

function summary(now, opts = {}) {
  const inp = S.input(); if (opts.sourceAsOf) for (const g of ['kospi200', 'nasdaq100', 'sp100', 'sp500']) inp[g].source = { ...inp[g].source, asOf: opts.sourceAsOf };
  if (opts.kr201) inp.kospi200 = { ...inp.kospi200, members: inp.kospi200.members.concat([{ ticker: S.kr(200) }]), expectedConstituents: 201 };
  const u = C.buildUniverse(inp, opts.extras), end = new Date(now - 86400000).toISOString().slice(0, 10);
  const rows = u.members.slice(0, opts.priced ?? 50).map((t, i) => C.summarize(t, S.record(t.ticker, t.market, end, i), null, new Date(now).toISOString()));
  const s = C.assemble(u, rows, { generation: 'synthetic-test-only-session', generatedAt: new Date(now - 3600000).toISOString() });
  if (opts.junk) s.items[0].privateNote = 'LEDGER-SENTINEL';
  return s;
}
function tab() { // 탭 하나의 sessionStorage
  const m = new Map(), log = { get: 0, set: 0, remove: 0 }; let failGet = false, failSet = false;
  return {
    m, log, fail(g, s) { failGet = g; failSet = s; },
    api: { getItem: k => { log.get++; if (failGet) throw Error('SecurityError'); return m.has(k) ? m.get(k) : null; }, setItem: (k, v) => { log.set++; if (failSet) { const e = Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } m.set(k, String(v)); }, removeItem: k => { log.remove++; m.delete(k); } }
  };
}
function page(o = {}) {
  let clock = o.clock ?? T0;
  const d = new JSDOM(read('has/universe-screen.html'), { url: 'https://example.invalid/has/universe-screen.html', runScripts: 'outside-only' }), w = d.window;
  const local = { v5_gas: o.gas ?? GAS, v5_gen: 'LEDGER-SENTINEL' }; let localWrites = 0; const requests = [];
  Object.defineProperty(w, 'localStorage', { value: { getItem: k => (k in local ? local[k] : null), setItem: () => { localWrites++; }, removeItem: () => { localWrites++; }, clear: () => { localWrites++; } } });
  Object.defineProperty(w, 'sessionStorage', { value: (o.tab || tab()).api });
  w.indexedDB = undefined; w.fetch = () => { throw Error('no network'); };
  w.Date.now = () => clock;
  const append = w.document.head.append.bind(w.document.head);
  w.document.head.append = (...nodes) => {
    nodes.forEach(n => { if (n.tagName === 'SCRIPT' && n.src) { const u = new URL(n.src); requests.push(u); setTimeout(() => { if (u.hostname !== 'script.google.com') return n.onerror && n.onerror(); (o.respond || ((u, w) => w[u.searchParams.get('callback')](summary(clock, o.sum))))(u, w, n); }, o.delay ?? 0); } });
    return append(...nodes);
  };
  w.HAS_SCREEN_TEST_AUTO = true;
  if (o.session !== false) w.HAS_SCREEN_TEST_SESSION_CACHE = true;
  for (const f of ['live-price-reference.js', 'universe-screen.js', 'universe-screen-ui.js']) w.eval(read('has/' + f));
  return { w, requests, get localWrites() { return localWrites; }, local, status: () => w.document.querySelector('#status').textContent, count: () => w.document.querySelector('#count').textContent, $: s => w.document.querySelector(s), stats: () => w.HASUniverseScreenUI.stats(), close: () => w.close() };
}
const settle = (ms = 20) => new Promise(r => setTimeout(r, ms));
async function open(t, o) { const p = page(o); t.after(p.close); await settle(); return p; }
function stored(tb) { return JSON.parse(tb.m.get(KEY)); }

test('게이트 꺼짐(운영 기본): 세션 저장소 읽기·쓰기 0, 새로고침은 다시 1회 조회', async t => {
  const tb = tab();
  const a = await open(t, { tab: tb, session: false });
  assert.equal(a.requests.length, 1); assert.deepEqual(tb.log, { get: 0, set: 0, remove: 0 }); assert.equal(a.stats().sessionCache, false);
  const b = await open(t, { tab: tb, session: false });
  assert.equal(b.requests.length, 1); assert.equal(tb.m.size, 0); assert.equal(a.localWrites + b.localWrites, 0);
});

for (const kr201 of [false, true]) test(`게이트 켜짐 ${kr201 ? 401 : 400}: 같은 KST 날짜 새로고침·뒤로가기(새 로드)는 세션 캐시 재사용(요청 0)`, async t => {
  const tb = tab(), total = kr201 ? 401 : 400, re = new RegExp(`감시 대상 ${total}종목 \\(국내 ${kr201 ? 201 : 200} · 미국 200\\)`);
  const a = await open(t, { tab: tb, sum: { kr201 } });
  assert.equal(a.requests.length, 1); assert.match(a.count(), re); assert.equal(a.stats().session.writes, 1);
  const raw = tb.m.get(KEY), o = JSON.parse(raw);
  assert.equal(o.schema, 'kst.has.screen.public'); assert.equal(o.version, 1); assert.equal(o.day, '2026-11-12'); assert.match(o.ep, /^[0-9a-f]{8}$/);
  assert.equal(o.value.total, total); assert.equal(o.value.coreCount, total); assert(o.value.items.every(r => r.scope === 'core'));
  assert.doesNotMatch(raw, /script\.google\.com|SYNTHETIC_TEST|macros|LEDGER-SENTINEL|v5_gas|v5_gen|password|apiKey|token/i, '개인정보·GAS 주소·키 저장 0');
  assert.deepEqual([...tb.m.keys()], [KEY], '독립 키 하나만');
  for (let i = 0; i < 2; i++) { // 새로고침 2회(메모리 소실)
    const b = await open(t, { tab: tb, sum: { kr201 } });
    assert.equal(b.requests.length, 0); assert.match(b.status(), /오늘\(한국 기준일\) 받은 요약 재사용/); assert.match(b.status(), /매수 검토 후보 없음\(판단 보류\)$/);
    assert.match(b.count(), re); assert.equal(b.stats().session.hits, 1); assert.equal(b.$('#rows').children.length, 10);
    assert.doesNotMatch(b.$('#rows').textContent, /매수 검토(?! 후보 없음)|매수 추천/);
  }
});

test('다음 KST 날짜(00:00 KST 경계)는 세션 캐시 거부·삭제 후 1회 새 조회', async t => {
  const tb = tab();
  await open(t, { tab: tb, clock: Date.parse('2026-11-12T14:58:00Z') }); // 23:58 KST
  const same = await open(t, { tab: tb, clock: Date.parse('2026-11-12T14:59:30Z') }); assert.equal(same.requests.length, 0);
  const next = await open(t, { tab: tb, clock: Date.parse('2026-11-12T15:00:30Z') }); // 00:00 KST 다음날
  assert.equal(next.requests.length, 1); assert.equal(next.stats().session.rejects, 1); assert.equal(stored(tb).day, '2026-11-13');
});

test('같은 날이어도 요약이 만료(생성 2일 초과)되면 거부하고 새 조회', async t => {
  const tb = tab(), c0 = Date.parse('2026-11-12T00:30:00Z');
  await open(t, { tab: tb, clock: c0, respond: (u, w) => w[u.searchParams.get('callback')](summary(Date.parse('2026-11-10T02:00:00Z'), { sourceAsOf: '2026-11-09' })) });
  assert.equal(tb.m.has(KEY), true);
  const b = await open(t, { tab: tb, clock: c0 + 3 * 3600000 });
  assert.equal(b.requests.length, 1); assert.equal(b.stats().session.rejects, 1); assert.match(b.status(), /^합성 시험 자료/);
});

test('깨진·위변조·형식 다른 캐시는 거부·삭제하고 새 조회 1회(화면에 위변조 값 표시 0)', async t => {
  const cases = {
    corruptJson: raw => raw.slice(0, 100),
    notString: () => 12,
    buyOpinion: raw => { const o = JSON.parse(raw); o.value.items[0].opinion = '매수 검토'; return JSON.stringify(o); },
    buyCandidates: raw => { const o = JSON.parse(raw); o.value.buyCandidates = [{ ticker: '9ZZ000' }]; return JSON.stringify(o); },
    counts: raw => { const o = JSON.parse(raw); o.value.referenceCount += 1; return JSON.stringify(o); },
    version: raw => { const o = JSON.parse(raw); o.version = 2; return JSON.stringify(o); },
    schema: raw => { const o = JSON.parse(raw); o.schema = 'other'; return JSON.stringify(o); },
    endpoint: raw => { const o = JSON.parse(raw); o.ep = '00000000'; return JSON.stringify(o); },
    futureSaved: raw => { const o = JSON.parse(raw); o.savedAt = T0 + 3600000; return JSON.stringify(o); },
    dayMismatch: raw => { const o = JSON.parse(raw); o.day = '2026-11-11'; return JSON.stringify(o); },
    oversized: raw => raw + ' '.repeat(1000001),
    extraHolding: raw => { const o = JSON.parse(raw), x = { ...o.value.items[0], ticker: S.kr(300), scope: 'extra' }; o.value.items.push(x); o.value.total++; o.value.missingCount += x.status === 'missing' ? 1 : 0; o.value.referenceCount += x.status === 'reference' ? 1 : 0; o.value.staleCount += x.status === 'stale' ? 1 : 0; return JSON.stringify(o); },
    xss: raw => { const o = JSON.parse(raw); o.value.items[0].ticker = '<img src=x onerror=alert(1)>'; return JSON.stringify(o); }
  };
  for (const [name, mutate] of Object.entries(cases)) {
    const tb = tab(); await open(t, { tab: tb });
    tb.m.set(KEY, mutate(tb.m.get(KEY)));
    const b = await open(t, { tab: tb });
    assert.equal(b.requests.length, 1, name); assert.equal(b.stats().session.rejects, 1, name); assert.equal(b.stats().session.hits, 0, name);
    assert.equal(stored(tb).version, 1, name + ' 새 정상 요약으로 교체'); assert.equal(stored(tb).value.items[0].opinion, '판단 보류', name);
    assert.equal(b.w.document.querySelectorAll('img').length, 0, name); assert.doesNotMatch(b.status(), /재사용/, name);
  }
});

test('개인 추가 감시(보유·확신 extras)가 섞인 요약은 세션에 저장하지 않음(화면은 정상)', async t => {
  const tb = tab();
  const a = await open(t, { tab: tb, sum: { extras: [{ market: 'KR', ticker: S.kr(300) }] } });
  assert.equal(a.requests.length, 1); assert.match(a.count(), /추가 감시 1/); assert.equal(tb.m.has(KEY), false); assert.equal(a.stats().session.writes, 0);
  const b = await open(t, { tab: tb, sum: { extras: [{ market: 'KR', ticker: S.kr(300) }] } });
  assert.equal(b.requests.length, 1, '저장 안 했으므로 새로고침은 새 조회');
});

test('알 수 없는 필드는 허용목록 투영으로 저장되지 않음', async t => {
  const tb = tab(); await open(t, { tab: tb, sum: { junk: true } });
  const raw = tb.m.get(KEY); assert.doesNotMatch(raw, /privateNote|LEDGER-SENTINEL/);
  const b = await open(t, { tab: tb }); assert.equal(b.requests.length, 0);
});

test('세션 저장소 읽기/쓰기 예외·용량 초과 → 메모리 캐시로 안전 후퇴', async t => {
  const tb = tab(); tb.fail(false, true);
  const a = await open(t, { tab: tb });
  assert.equal(a.requests.length, 1); assert.equal(a.stats().session.errors, 1); assert.equal(tb.m.size, 0); assert.match(a.status(), /^합성 시험 자료/);
  a.$('#refresh').click(); await settle(); assert.equal(a.requests.length, 1, '같은 문서에서는 메모리 캐시'); assert.match(a.status(), /재사용/);
  tb.fail(true, false);
  const b = await open(t, { tab: tb }); assert.equal(b.requests.length, 1); assert.equal(b.stats().session.errors, 1);
  // sessionStorage 접근 자체가 예외(차단된 브라우저)
  const c = await open(t, { tab: { api: null, m: new Map() } }); assert.equal(c.requests.length, 1);
});

test('신규 조회 합류: 새로고침 직후 동시 클릭 5회 → 요청 1건, 세션 쓰기 1회', async t => {
  const tb = tab(); const p = page({ tab: tb, delay: 30 }); t.after(p.close);
  for (let i = 0; i < 5; i++) p.$('#refresh').click();
  const r = await Promise.all([p.w.HASUniverseScreenUI.refresh(), p.w.HASUniverseScreenUI.refresh()]);
  assert.equal(p.requests.length, 1); assert.deepEqual(r, ['network', 'network']); assert.equal(p.stats().session.writes, 1);
  const q = page({ tab: tb }); t.after(q.close);
  const r2 = await Promise.all([q.w.HASUniverseScreenUI.refresh(), q.w.HASUniverseScreenUI.refresh()]);
  assert.equal(q.requests.length, 0); assert.deepEqual(r2, ['session', 'session']);
});

test('탭별 격리: 다른 탭(다른 sessionStorage)은 캐시를 공유하지 않음', async t => {
  const t1 = tab(), t2 = tab();
  await open(t, { tab: t1 });
  const b = await open(t, { tab: t2 }); assert.equal(b.requests.length, 1);
  const c = await open(t, { tab: t1 }); assert.equal(c.requests.length, 0);
});

test('GAS 주소가 바뀌면(지문 불일치) 이전 세션 캐시 거부', async t => {
  const tb = tab(); await open(t, { tab: tb });
  const b = await open(t, { tab: tb, gas: 'https://script.google.com/macros/s/OTHER_SYNTHETIC/exec' });
  assert.equal(b.requests.length, 1); assert.equal(b.stats().session.rejects, 1);
});
