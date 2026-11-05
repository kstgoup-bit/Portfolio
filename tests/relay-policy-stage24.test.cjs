'use strict';
const { test } = require('node:test'), assert = require('node:assert/strict'), P = require('../has/relay-policy.js');
const CFG = { expectedProof: 'p'.repeat(40) }, req = (path, o = {}) => Object.assign({ method: 'GET', path, headers: { 'x-has-auth': 'p'.repeat(40) } }, o), T0 = Date.parse('2026-11-05T05:00:00Z');
test('시세 조회 경로만 허용(국내·해외·환율)', () => { for (const p of ['/v1/quote/kr/005930', '/v1/quote/us/AAPL', '/v1/quote/us/BRK.B', '/v1/fx/usdkrw']) assert.equal(P.checkRoute('GET', p).ok, true, p); });
test('주문·잔고·토큰·계좌·취소·웹소켓 등 모든 비허용 경로 거부', () => { for (const p of ['/v1/order', '/v1/trading/order-cash', '/v1/quote/kr/005930/order', '/v1/balance', '/v1/oauth2/tokenP', '/v1/account', '/v1/quote/kr/00593', '/v1/quote/kr/005930?x=1', '/v1/quote/../order', '/v1/quote/kr/%30', '/', '', '/v1/quote/us/aapl', '/v1/transfer/withdraw']) assert.equal(P.checkRoute('GET', p).ok, false, p);
  for (const m of ['POST', 'PUT', 'DELETE', 'PATCH']) assert.equal(P.checkRoute(m, '/v1/quote/kr/005930').ok, false, m); });
test('인증: 없거나 틀리거나 길이 다르면 401, 맞아야 통과', () => { const s = (h) => P.judge({ method: 'GET', path: '/v1/quote/kr/005930', headers: h }, CFG, null, T0);
  assert.equal(s({}).status, 401); assert.equal(s({ 'x-has-auth': 'x'.repeat(40) }).status, 401); assert.equal(s({ 'x-has-auth': 'p' }).status, 401); assert.equal(s({ 'x-has-auth': 'p'.repeat(40) }).ok, true); assert.equal(P.judge(req('/v1/quote/kr/005930'), {}, null, T0).ok, false); });
test('호출 횟수 제한: 초당 5·분당 60·일 600을 넘으면 429, 시간이 지나면 회복', () => { let st = null, ok = 0; for (let i = 0; i < 8; i++) { const r = P.judge(req('/v1/quote/kr/005930'), CFG, st, T0 + i); st = r.state; if (r.ok) ok++; } assert.equal(ok, 5);
  const later = P.judge(req('/v1/quote/kr/005930'), CFG, st, T0 + 2000); assert.equal(later.ok, true);
  let s2 = null, okc = 0; for (let i = 0; i < 67; i++) { const r = P.judge(req('/v1/quote/kr/005930'), CFG, s2, T0 + i * 900); s2 = r.state; if (r.ok) okc++; } assert.equal(okc, 60);
  assert.equal(P.rateLimit({ hits: [], day: '2026-11-05', dayCount: 600 }, T0).reason, 'per-day'); assert.equal(P.rateLimit({ hits: [], day: '2026-11-04', dayCount: 600 }, T0).ok, true); });
test('이상 접근 5회 누적 시 자동 차단, 이후 올바른 인증도 423, 키 폐기 안내', () => { let st = null, last; for (let i = 0; i < 5; i++) { last = P.judge({ method: 'POST', path: '/v1/order', headers: { 'x-has-auth': 'p'.repeat(40) } }, CFG, st, T0 + i * 1000); st = last.state; assert.equal(last.ok, false); }
  assert.equal(st.blocked, true); assert.match(last.action, /키 폐기/); const after = P.judge(req('/v1/quote/kr/005930'), CFG, st, T0 + 9000); assert.equal(after.status, 423); assert.equal(after.ok, false); });
test('로그·응답에 비밀값이 남지 않음(헤더·토큰·계좌번호·긴 비밀 문자열 가림)', () => {
  const r = P.redact({ headers: { Authorization: 'Bearer abc.def.ghi', appkey: 'PSxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx', 'x-has-auth': 'zzz' }, msg: 'token=Bearer abc123.def-456 계좌 50123456-01 키 ' + 'A'.repeat(36), nested: { app_secret: 'S', CANO: '5012' } }); const t = JSON.stringify(r);
  for (const s of ['abc.def.ghi', 'abc123', 'PSxxxx', '50123456-01', 'A'.repeat(36), '"S"', '5012"']) assert.ok(!t.includes(s), s);
  const j = P.judge(req('/v1/order', { headers: { 'x-has-auth': 'wrong', Authorization: 'Bearer SECRET.TOKEN.VALUE' } }), CFG, null, T0); assert.ok(!JSON.stringify(j.log).includes('SECRET')); });
test('거부 응답은 상태 코드만 다르고 내부 정보를 노출하지 않는다', () => { const r = P.judge(req('/v1/order'), CFG, null, T0); assert.equal(r.status, 403); assert.deepEqual(Object.keys(r.log).sort(), ['at', 'blocked', 'method', 'ok', 'path', 'reason', 'strikes']); });
