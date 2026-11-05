'use strict';
/* 27단계: 중계 코어·워커·클라이언트 시험 — 전부 모의(mock) fetch. 실제 KIS 호출·실제 키 없음. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('fs'), path = require('path');
const Core = require('../relay/relay-core.js'), Client = require('../has/relay-client.js'), QM = require('../has/quote-model.js');
const PROOF = 'p'.repeat(32), ENV = { KIS_APP_KEY: 'FAKE_APPKEY_' + 'x'.repeat(30), KIS_APP_SECRET: 'FAKE_SECRET_' + 'y'.repeat(60), HAS_RELAY_PROOF: PROOF, HAS_ALLOWED_ORIGIN: 'https://app.example' };
const T0 = Date.parse('2026-11-06T01:00:00Z');
function mock(over) { const calls = []; const f = async (url, init) => { calls.push({ url, init });
  if (over && over.fn) { const r = over.fn(url, init, calls); if (r) return r; }
  if (url.includes('/oauth2/tokenP')) return { ok: true, status: 200, json: async () => ({ access_token: 'FAKE_TOKEN_' + 'z'.repeat(40), expires_in: 86400 }) };
  if (url.includes('inquire-price')) return { ok: true, status: 200, json: async () => ({ rt_cd: '0', output: { stck_prpr: '71,500', stck_bsop_date: '20261105' } }) };
  if (url.includes('overseas-price')) return { ok: true, status: 200, json: async () => ({ rt_cd: '0', output: url.includes('EXCD=NYS') ? { last: '123.45', xymd: '20261105' } : { last: '' } }) };
  throw new Error('unexpected ' + url); }; f.calls = calls; return f; }
const req = (p, h, m) => ({ method: m || 'GET', path: p, headers: Object.assign({ 'x-has-auth': PROOF }, h || {}) });
test.beforeEach(() => Core.resetForTest());

test('국내 시세: 정규화·미검증·가격 종류 불명', async () => {
  const f = mock(), r = await Core.handle(req('/v1/quote/kr/005930'), ENV, f, T0);
  assert.equal(r.status, 200); const n = QM.normalize(r.body.quote); assert.ok(n.ok);
  assert.equal(n.quote.price, 71500); assert.equal(n.quote.verification, 'unverified'); assert.equal(n.quote.kind, 'unknown'); assert.equal(n.quote.source, 'kis'); assert.equal(n.quote.asOfDate, '2026-11-05');
  assert.equal(f.calls.length, 2); // 토큰 1 + 시세 1
});
test('미국 시세: 거래소 순차 조회', async () => {
  const f = mock(), r = await Core.handle(req('/v1/quote/us/AAPL'), ENV, f, T0);
  assert.equal(r.status, 200); assert.equal(r.body.quote.price, 123.45); assert.equal(r.body.quote.currency, 'USD'); assert.equal(f.calls.length, 3); // 토큰+NAS+NYS
});
test('환율은 검증된 출처가 없어 501', async () => { const f = mock(), r = await Core.handle(req('/v1/fx/usdkrw'), ENV, f, T0); assert.equal(r.status, 501); assert.equal(f.calls.length, 0); });
test('인증 없음/틀림 → 401, 업스트림 호출 0', async () => {
  const f = mock(); for (const h of [{ 'x-has-auth': '' }, { 'x-has-auth': 'q'.repeat(32) }]) { const r = await Core.handle(req('/v1/quote/kr/005930', h), ENV, f, T0); assert.equal(r.status, 401); }
  assert.equal(f.calls.length, 0);
});
test('주문·잔고·계좌·토큰·웹소켓·쿼리 경로는 전부 거부, 업스트림 호출 0', async () => {
  const f = mock(); const bad = ['/v1/trading/order', '/v1/order/cash', '/v1/quote/kr/005930/order', '/uapi/domestic-stock/v1/trading/order-cash', '/v1/balance', '/v1/account', '/oauth2/tokenP', '/oauth2/revokeP', '/v1/ws', '/v1/quote/kr/005930?x=1', '/v1/quote/kr/../x', '/v1/quote/kr/005930%2Forder', '/', '/v1/quote/kr/12345', '/v1/quote/us/aapl'];
  for (const p of bad) { const r = await Core.handle(req(p), ENV, f, T0 + 10000 * Math.random()); assert.ok([400, 403, 404, 423, 429].includes(r.status), p + ' → ' + r.status); }
  assert.equal(f.calls.length, 0);
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) { const r = await Core.handle(req('/v1/quote/kr/005930', {}, m), ENV, f, T0); assert.notEqual(r.status, 200); }
  assert.equal(f.calls.length, 0);
});
test('코어 소스에 주문·잔고·계좌 KIS 경로가 존재하지 않음', () => {
  const src = fs.readFileSync(path.join(__dirname, '../relay/relay-core.js'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!/order-cash|trading\/order|inquire-balance|inquire-psbl|CANO|ACNT_PRDT/i.test(src)); assert.ok(!/method:\s*'(PUT|DELETE|PATCH)'/.test(src));
  assert.equal((src.match(/method:\s*'POST'/g) || []).length, 1); // 토큰 발급 1곳뿐
});
test('이상 접근 5회 누적 → 자동 차단(423), 이후 올바른 인증도 거부', async () => {
  const f = mock(); for (let i = 0; i < 5; i++) await Core.handle(req('/v1/quote/kr/005930', { 'x-has-auth': 'bad' }), ENV, f, T0 + i * 1500);
  const r = await Core.handle(req('/v1/quote/kr/005930'), ENV, f, T0 + 20000); assert.equal(r.status, 423); assert.equal(f.calls.length, 0);
});
test('호출 한도: 초당 5건 초과 시 429', async () => {
  const f = mock(); let last; for (let i = 0; i < 7; i++) last = await Core.handle(req('/v1/quote/kr/005930'), ENV, f, T0 + i); assert.equal(last.status, 429);
});
test('비밀 미설정이면 닫힘(503), 출처 불일치 403, 프리플라이트 204', async () => {
  const f = mock(); assert.equal((await Core.handle(req('/v1/quote/kr/005930'), {}, f, T0)).status, 503);
  assert.equal((await Core.handle(req('/v1/quote/kr/005930'), Object.assign({}, ENV, { HAS_RELAY_PROOF: 'short' }), f, T0)).status, 503);
  assert.equal((await Core.handle(req('/v1/quote/kr/005930', { origin: 'https://evil.example' }), ENV, f, T0)).status, 403);
  const o = await Core.handle(req('/v1/quote/kr/005930', { origin: ENV.HAS_ALLOWED_ORIGIN }, 'OPTIONS'), ENV, f, T0); assert.equal(o.status, 204); assert.equal(o.headers['access-control-allow-origin'], ENV.HAS_ALLOWED_ORIGIN); assert.equal(f.calls.length, 0);
});
test('토큰 캐시 재사용, 발급 실패 후 1분 내 재발급 안 함', async () => {
  const f = mock(); await Core.handle(req('/v1/quote/kr/005930'), ENV, f, T0); await Core.handle(req('/v1/quote/kr/000660'), ENV, f, T0 + 2000);
  assert.equal(f.calls.filter(c => c.url.includes('tokenP')).length, 1);
  Core.resetForTest(); const g = mock({ fn: (u) => u.includes('tokenP') ? { ok: false, status: 403, json: async () => ({ error_code: 'EGW00133' }) } : null });
  const a = await Core.handle(req('/v1/quote/kr/005930'), ENV, g, T0), b = await Core.handle(req('/v1/quote/kr/005930'), ENV, g, T0 + 5000), c = await Core.handle(req('/v1/quote/kr/005930'), ENV, g, T0 + 61000);
  assert.equal(a.status, 502); assert.equal(b.status, 503); assert.equal(g.calls.filter(x => x.url.includes('tokenP')).length, 2); assert.equal(c.status, 502);
});
test('업스트림 오류 매핑: 거절·네트워크·무가격·형식 오류, 원문 메시지 미노출', async () => {
  const cases = [[{ rt_cd: '1', msg1: '계좌 12345678-01 오류 ' + ENV.KIS_APP_KEY }, 502], [{ rt_cd: '0', output: { stck_prpr: '0' } }, 404], [{ rt_cd: '0', output: {} }, 404]];
  for (const [body, st] of cases) { Core.resetForTest(); const f = mock({ fn: (u) => u.includes('inquire-price') ? { ok: true, status: 200, json: async () => body } : null });
    const r = await Core.handle(req('/v1/quote/kr/005930'), ENV, f, T0); assert.equal(r.status, st); assert.ok(!JSON.stringify(r).includes('12345678') && !JSON.stringify(r).includes('FAKE_APPKEY')); }
  Core.resetForTest(); const n = mock({ fn: (u) => { if (u.includes('inquire-price')) throw new Error('boom ' + ENV.KIS_APP_SECRET); } });
  const r = await Core.handle(req('/v1/quote/kr/005930'), ENV, n, T0); assert.equal(r.status, 502); assert.ok(!JSON.stringify(r).includes('FAKE_SECRET'));
});
test('업스트림 요청 형태: 허용된 두 경로만, 키·토큰은 헤더로만, URL 에 비밀 없음', async () => {
  const f = mock(); await Core.handle(req('/v1/quote/kr/005930'), ENV, f, T0); await Core.handle(req('/v1/quote/us/MSFT'), ENV, f, T0 + 1000);
  for (const c of f.calls) { assert.ok(/\/oauth2\/tokenP$|inquire-price\?|overseas-price\/v1\/quotations\/price\?/.test(c.url), c.url); assert.ok(!c.url.includes('FAKE_')); assert.ok(c.url.startsWith('https://openapi.koreainvestment.com:9443/')); }
});
test('로그에 비밀·토큰·계좌번호 없음', async () => {
  const f = mock(), logs = []; for (const p of ['/v1/quote/kr/005930', '/v1/order/cash']) logs.push(JSON.stringify((await Core.handle(req(p, { authorization: 'Bearer ' + 'k'.repeat(40) }), ENV, f, T0 + logs.length * 1500)).log));
  const all = logs.join('\n'); for (const s of [PROOF, 'FAKE_APPKEY', 'FAKE_SECRET', 'FAKE_TOKEN']) assert.ok(!all.includes(s));
});
test('워커(ES 모듈) 진입점: Request→Response, 쿼리스트링 거부, 로그 출력', async () => {
  const W = (await import('../relay/worker.mjs')).default, logs = [], orig = console.log, of = globalThis.fetch; console.log = (s) => logs.push(s); const f = mock(); globalThis.fetch = f;
  try { const ok = await W.fetch(new Request('https://relay.example/v1/quote/kr/005930', { headers: { 'x-has-auth': PROOF } }), ENV); assert.equal(ok.status, 200); assert.equal((await ok.json()).quote.price, 71500); assert.equal(ok.headers.get('cache-control'), 'no-store');
    const q = await W.fetch(new Request('https://relay.example/v1/quote/kr/005930?a=1', { headers: { 'x-has-auth': PROOF } }), ENV); assert.equal(q.status, 400);
    const bad = await W.fetch(new Request('https://relay.example/v1/quote/kr/005930', { method: 'POST', headers: { 'x-has-auth': PROOF } }), ENV); assert.notEqual(bad.status, 200);
  } finally { console.log = orig; globalThis.fetch = of; }
  assert.ok(logs.length >= 3 && !logs.join('').includes(PROOF));
});
test('클라이언트: 설정 검증·저장·종목 1개 요청·미검증 정규화·비밀은 헤더만', async () => {
  const mem = {}, st = { getItem: k => (k in mem ? mem[k] : null), setItem: (k, v) => { mem[k] = v; }, removeItem: k => { delete mem[k]; } };
  assert.equal(Client.saveCfg(st, 'http://x.example', PROOF).reason, 'bad-url'); assert.equal(Client.saveCfg(st, 'https://x.example/?k=1', PROOF).reason, 'bad-url'); assert.equal(Client.saveCfg(st, 'https://x.example', 'short').reason, 'secret-too-short');
  assert.ok(Client.saveCfg(st, 'https://x.example/', PROOF).ok); const cfg = Client.loadCfg(st); assert.equal(cfg.url, 'https://x.example');
  let seen; const f = async (u, i) => { seen = { u, i }; return { ok: true, status: 200, json: async () => ({ ok: true, quote: { ticker: '005930', market: 'KR', currency: 'KRW', price: 71500, source: 'kis', kind: 'unknown', asOfDate: '2026-11-05', verification: 'unverified' } }) }; };
  const r = await Client.fetchQuote(cfg, 'KR', '005930', f); assert.ok(r.ok); assert.equal(r.quote.verification, 'unverified'); assert.equal(seen.u, 'https://x.example/v1/quote/kr/005930'); assert.equal(seen.i.headers['x-has-auth'], PROOF); assert.ok(!seen.u.includes(PROOF)); assert.equal(seen.i.credentials, 'omit');
  assert.equal((await Client.fetchQuote(cfg, 'KR', '005930; DROP', f)).reason, 'bad-ticker'); assert.equal((await Client.fetchQuote(null, 'KR', '005930', f)).reason, 'not-configured');
  const swap = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, quote: { ticker: '000660', market: 'KR', currency: 'KRW', price: 1 } }) }); assert.equal((await Client.fetchQuote(cfg, 'KR', '005930', swap)).reason, 'invalid-quote');
  const claim = async () => ({ ok: true, status: 200, json: async () => ({ ok: true, quote: { ticker: '005930', market: 'KR', currency: 'KRW', price: 5, verification: 'independent-verified' } }) }); assert.equal((await Client.fetchQuote(cfg, 'KR', '005930', claim)).quote.verification, 'unverified'); // 중계 응답은 대조 완료로 취급 안 함
  assert.equal((await Client.fetchQuote(cfg, 'KR', '005930', async () => { throw new Error('x'); })).reason, 'network');
});
test('클라이언트 설정 키는 앱 백업 대상 키 목록에 없음', () => {
  const app = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8'); assert.ok(!app.includes('has_relay_cfg'));
});
