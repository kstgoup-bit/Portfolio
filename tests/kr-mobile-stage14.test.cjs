'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), crypto = require('node:crypto');
const F = require('../kr-radar/mobile-flow.js'), MS = require('../kr-radar/mobile-status.js'), RH = require('../kr-radar/rehearsal.js'), RUN = require('../kr-radar/krx-run.js');
const U = require('../kr-radar/data/universe.json'); const BAS = '20261028', TODAY = '2026-10-29';
const sha = t => crypto.createHash('sha256').update(t, 'utf8').digest('hex');
function mk({ fault = 'none', transport, nowMs = 1_000_000, today = TODAY } = {}) {
  const clock = { t: nowMs, d: today, nowMs() { return this.t; }, today() { return this.d; } };
  let t = transport || RH.createRehearsalTransport(U, { basDt: BAS, format: 'xml', fault }); const calls = []; const inner = t;
  const wrapped = async r => { calls.push(r); return inner(r); }; wrapped.isSynthetic = true;
  const flow = F.createFlow({ universe: () => U, transport: wrapped, clock, sha256: sha, wait: async () => {} });
  return { flow, clock, calls, wrapped };
}
const admin = c => ({ role: 'admin', verified: true, issuedAt: c.t, expiresAtMs: c.t + 10 * 60_000 });
const appr = (o = {}) => ({ approvedBy: 'user', approvedAt: TODAY, basDt: BAS, maxCalls: 3, scope: 'krx-identity-only', expiresAt: '2026-10-30', ...o });
async function ready(o) { const m = mk(o); a.equal(m.flow.unlock(admin(m.clock)).ok, true); a.equal(m.flow.prepare({ basDt: BAS, maxCalls: 3 }).ok, true); a.equal(m.flow.confirm({ ack: true, approval: appr() }).ok, true); return m; }

test('정상 흐름: 잠금→확인 화면→승인→실행→요약. 합성 결과는 VERIFIED 0, 실제 수치 0', async () => {
  const m = mk(); a.equal(m.flow.getView().state, 'LOCKED');
  a.equal(m.flow.unlock(admin(m.clock)).ok, true);
  const p = m.flow.prepare({ basDt: BAS, maxCalls: 3 }); a.equal(p.confirmScreen.targets.stocks, 73); a.equal(p.confirmScreen.targets.etfs, 5); a.match(p.confirmScreen.notice, /주가 확인이나 매수·매도 신호/);
  a.equal(m.flow.confirm({ ack: true, approval: appr() }).ok, true);
  const r = await m.flow.run(); a.equal(r.ok, true);
  const v = m.flow.getView(); a.equal(v.state, 'DONE'); a.equal(v.dataLabel, '합성 시험'); a.equal(v.result.totals.stock.VERIFIED, 0);
  a.equal(v.officialVerified, 0); a.equal(v.realApiRequests, 0); a.equal(v.activeMonitoring, 0); a.equal(m.calls.length, 2);
  a.equal(v.shareSummary.kind, 'krx-share-summary');
});
test('결과 화면·요약에 종목 코드/이름/ISIN/원본/키/URL이 없다', async () => {
  const m = await ready(); await m.flow.run(); const text = JSON.stringify(m.flow.getView());
  for (const s of U.securities.slice(0, 20)) { a.ok(!text.includes(s.name), s.name); a.ok(!text.includes('"' + s.code + '"'), s.code); }
  a.doesNotMatch(text, /serviceKey|https?:\/\/|<response>|KR[0-9A-Z]{10}/);
});
test('비관리자/세션 오류/만료: 모든 동작 거부, 외부 요청 0', async () => {
  const m = mk(); for (const bad of [null, {}, { role: 'user', verified: true, issuedAt: 1, expiresAtMs: 9e9 }, { role: 'admin', verified: false, issuedAt: 1, expiresAtMs: 9e9 }, { role: 'admin', verified: true, issuedAt: 1, expiresAtMs: 5 }, { role: 'admin', verified: true, issuedAt: 1_000_000, expiresAtMs: 1_000_000 + 31 * 60_000 }, { role: 'admin', verified: true, issuedAt: 1_000_000, expiresAtMs: NaN }])
    a.equal(m.flow.unlock(bad).code, 'NOT_ADMIN');
  for (const r of [m.flow.prepare({ basDt: BAS, maxCalls: 3 }), m.flow.confirm({ ack: true, approval: appr() }), await m.flow.run(), await m.flow.resume()]) a.equal(r.ok, false);
  a.equal(m.calls.length, 0);
});
test('세션이 승인 후 만료되면 실행 거부', async () => {
  const m = await ready(); m.clock.t += 11 * 60_000; const r = await m.flow.run(); a.equal(r.code, 'NOT_ADMIN'); a.equal(m.calls.length, 0); a.equal(m.flow.getView().state, 'LOCKED');
});
test('승인 누락·확인 미체크·기준일/한도 불일치·만료일 없음·만료·미래 승인·승인자 오류', async () => {
  const m = mk(); m.flow.unlock(admin(m.clock)); m.flow.prepare({ basDt: BAS, maxCalls: 3 });
  a.equal(m.flow.confirm({ ack: false, approval: appr() }).code, 'NO_ACK');
  for (const bad of [null, {}, appr({ approvedBy: 'claude' }), appr({ basDt: '20261027' }), appr({ maxCalls: 2 }), appr({ maxCalls: 21 }), appr({ expiresAt: undefined }), appr({ expiresAt: '2026-10-28' }), appr({ approvedAt: '2026-11-30' }), appr({ scope: '' })])
    a.equal(m.flow.confirm({ ack: true, approval: bad }).ok, false, JSON.stringify(bad));
  a.equal(await m.flow.run().then(r => r.code), 'BAD_STATE'); a.equal(m.calls.length, 0);
});
test('승인 만료일이 실행 전에 지나면 BLOCKED', async () => {
  const m = await ready(); m.clock.d = '2026-10-31'; const r = await m.flow.run(); a.equal(r.code, 'APPROVAL_EXPIRED'); a.equal(m.calls.length, 0);
});
test('호출 상한: 모바일은 1~3회만, 0·4·소수 거부', () => {
  const m = mk(); m.flow.unlock(admin(m.clock)); for (const n of [0, 4, 1.5, -1, NaN, '3x']) a.equal(m.flow.prepare({ basDt: BAS, maxCalls: n }).code, 'BAD_LIMIT', String(n));
  a.equal(m.flow.prepare({ basDt: '20261299', maxCalls: 3 }).code, 'BAD_PLAN'); a.equal(m.flow.prepare({ basDt: '20271028', maxCalls: 3 }).code, 'BAD_PLAN');
});
test('중복 클릭: 동시에 두 번 눌러도 호출은 한 번분만, 완료 후 재실행은 재승인 필요', async () => {
  const m = await ready(); const [r1, r2] = await Promise.all([m.flow.run(), m.flow.run()]);
  a.equal([r1, r2].filter(r => r.ok).length, 1); a.ok([r1, r2].some(r => r.code === 'ALREADY_RUNNING' || r.code === 'BAD_STATE')); a.equal(m.calls.length, 2);
  const again = await m.flow.run(); a.equal(again.ok, false); a.equal(m.calls.length, 2);
});
test('실제(비합성) transport는 코드 수준에서 거부', async () => {
  const clock = { nowMs: () => 1_000_000, today: () => TODAY }; let n = 0; const real = async () => { n++; return { status: 200, text: '' }; };
  const flow = F.createFlow({ universe: () => U, transport: real, clock, sha256: sha, wait: async () => {} });
  flow.unlock({ role: 'admin', verified: true, issuedAt: 1_000_000, expiresAtMs: 1_600_000 }); flow.prepare({ basDt: BAS, maxCalls: 3 }); flow.confirm({ ack: true, approval: appr() });
  const r = await flow.run(); a.equal(r.code, 'REAL_TRANSPORT_BLOCKED'); a.equal(n, 0); a.equal(F.REAL_CALLS_ALLOWED, false);
  const f2 = F.createFlow({ universe: () => U, transport: Object.assign(async () => { n++; }, { isSynthetic: 'true' }), clock, sha256: sha, wait: async () => {} });
  f2.unlock({ role: 'admin', verified: true, issuedAt: 1_000_000, expiresAtMs: 1_600_000 }); f2.prepare({ basDt: BAS, maxCalls: 3 }); f2.confirm({ ack: true, approval: appr() }); a.equal((await f2.run()).code, 'REAL_TRANSPORT_BLOCKED'); a.equal(n, 0);
});
const resp = (status, text) => async () => ({ status, text });
for (const [name, fault, cat] of [['429 요청 제한', '429', 'rate-limit'], ['401 인증 실패', '401', 'unauthorized'], ['잘못된 응답 본문', 'garbage', null], ['게이트웨이 코드 30', 'gateway30', 'unauthorized']]) {
  test('오류 처리: ' + name + ' → 자동 재시도 없이 중단, 합성 결과를 만들지 않음', async () => {
    const m = await ready({ fault }); const r = await m.flow.run(); a.equal(r.ok, false); a.ok(['FAILED', 'BLOCKED', 'PARTIAL'].includes(m.flow.getView().state)); a.ok(m.calls.length <= 2, '자동 재시도 없음(탐색 1 + 쪽 1)'); if (['429', 'garbage'].includes(fault)) a.equal(m.flow.getView().state, 'PARTIAL'); else a.equal(m.calls.length, 1); a.equal(m.flow.getView().result, null);
  });
}
test('오류 처리: 타임아웃·네트워크 끊김 → 재시도 없이 실패, 안내 문구 존재', async () => {
  for (const msg of ['timeout ETIMEDOUT', 'ECONNRESET']) { const m = await ready({ transport: async () => { throw new Error(msg); } }); const r = await m.flow.run(); a.equal(r.ok, false); a.equal(m.flow.getView().state, 'FAILED'); a.ok(m.flow.getView().reason); a.equal(m.flow.getView().callsUsed, 1); }
});
test('빈 응답(데이터 없음)과 HTML 오류 페이지 → 실패, 종목 상태 미생성', async () => {
  for (const t of [resp(200, ''), resp(200, '<html>503</html>'), resp(500, 'x'), resp(200, '{"response":{}}')]) { const m = await ready({ transport: t }); a.equal((await m.flow.run()).ok, false); a.equal(m.flow.getView().result, null); }
});
test('중단 후 재개: 일부 쪽 실패 → PARTIAL → 남은 호출 한도 안에서만 재개, 한도 초과 불가', async () => {
  // 승인 3회: 탐색 1 + 쪽 1 = 2회로 끝나는 합성 응답이라 부분 실패를 직접 만든다
  let n = 0; const base = RH.createRehearsalTransport(U, { basDt: BAS, format: 'xml', fault: 'none' });
  const flaky = async r => { n++; if (n === 2) throw new Error('ECONNRESET'); return base(r); };
  const m = await ready({ transport: flaky }); const r1 = await m.flow.run(); a.equal(r1.code, 'PARTIAL'); a.equal(m.flow.getView().state, 'PARTIAL'); a.deepEqual(m.flow.getView().missingPages, [1]);
  const r2 = await m.flow.resume(); a.equal(r2.ok, true); a.equal(m.flow.getView().state, 'DONE'); a.ok(m.flow.getView().callsUsed <= 3);
  const r3 = await m.flow.resume(); a.equal(r3.ok, false);
});
test('재개 중 한도 소진이면 BLOCKED (승인 호출 수를 넘지 않음)', async () => {
  const clock = { t: 1_000_000, nowMs() { return this.t; }, today: () => TODAY }; let n = 0; const base = RH.createRehearsalTransport(U, { basDt: BAS, format: 'xml', fault: 'none' });
  const tr = Object.assign(async r => { n++; if (n >= 2) throw new Error('ECONNRESET'); return base(r); }, { isSynthetic: true });
  const flow = F.createFlow({ universe: () => U, transport: tr, clock, sha256: sha, wait: async () => {} }); flow.unlock({ role: 'admin', verified: true, issuedAt: 1_000_000, expiresAtMs: 1_600_000 });
  flow.prepare({ basDt: BAS, maxCalls: 3 }); flow.confirm({ ack: true, approval: appr() }); await flow.run(); await flow.resume(); await flow.resume();
  a.ok(n <= 3, 'calls ' + n); a.ok(['FAILED', 'BLOCKED', 'PARTIAL'].includes(flow.getView().state));
});
test('취소: 실행 전 취소 → 승인 폐기, 실행 불가', async () => {
  const m = await ready(); a.equal(m.flow.cancel().ok, true); a.equal((await m.flow.run()).ok, false); a.equal(m.calls.length, 0);
});
test('잠금(lock) 후에는 승인과 계획이 지워진다', async () => {
  const m = await ready(); m.flow.lock(); a.equal(m.flow.getView().state, 'LOCKED'); a.equal(m.flow.getView().plan, null); a.equal((await m.flow.run()).ok, false);
});
test('판정 일치: 모바일 흐름 결과 합계 == CLI 규칙(runPlan+compareCandidates+toStates) 합계', async () => {
  const K = require('../kr-radar/krx-api.js'), ST = require('../kr-radar/krx-status.js');
  const res = await RUN.runPlan({ basDt: BAS, maxCalls: 3, transport: RH.createRehearsalTransport(U, { basDt: BAS, format: 'xml' }), wait: async () => {}, sha256: sha, queriedAt: TODAY, origin: 'fixture', resultType: 'xml' });
  const cli = ST.toStates(K.compareCandidates(U, res.listing, { today: TODAY, expectedBaseDate: '2026-10-28' })).totals;
  const m = await ready(); await m.flow.run(); a.deepEqual(m.flow.getView().result.totals, cli);
});
test('runPlan maxRetries=0 은 429에서 재시도하지 않는다 (기본값은 기존 동작 유지)', async () => {
  let n = 0; const t = async () => { n++; return { status: 429, text: 'Too many requests' }; };
  await RUN.runPlan({ basDt: BAS, maxCalls: 20, key: undefined, transport: t, wait: async () => {}, sha256: sha, queriedAt: TODAY, origin: 'fixture', maxRetries: 0 }); a.equal(n, 1);
  n = 0; await RUN.runPlan({ basDt: BAS, maxCalls: 20, key: undefined, transport: t, wait: async () => {}, sha256: sha, queriedAt: TODAY, origin: 'fixture' }); a.ok(n > 1);
});

// ---------- 상태 구분 ----------
const ev = (o = {}) => ({ origin: 'real-provider', source: 'provider-x', baseDate: '2026-10-28', queriedAt: '2026-10-29', ...o });
const idv = (o = {}) => ({ origin: 'user-supplied-official', state: 'VERIFIED', source: 'krx-getItemInfo', baseDate: '2026-10-28', queriedAt: '2026-10-29', ...o });
test('상태 구분: 합성은 실제 집계에 들어가지 않는다', () => {
  const s = MS.summarize([{ id: 'a', market: 'KR', kind: 'stock', identity: { ...idv(), origin: 'fixture' } }, { id: 'b', market: 'US', kind: 'stock', price: ev({ isSynthetic: true }) }], TODAY);
  a.equal(s.counts.syntheticTest, 2); a.equal(s.counts.real, 0); a.equal(s.counts.officialIdentityVerified, 0); a.equal(s.counts.realPriceConfirmed, 0);
});
test('상태 구분: 현재 실제 상황(검증 0, 시세 0) → 전부 DATA_UNAVAILABLE', () => {
  const items = U.securities.map(x => ({ id: x.code, market: 'KR', kind: x.group === 'etf' ? 'etf' : 'stock' })); const s = MS.summarize(items, TODAY);
  a.equal(s.counts.unavailable, 78); a.equal(s.counts.officialIdentityVerified, 0); a.equal(s.counts.activeMonitoringKR, 0); a.equal(s.counts.activeMonitoringUS, 0);
  a.ok(s.rows.every(r => r.signal.decision === 'HOLD' && r.signal.shown === false));
});
test('상태 구분: 단계 사다리 — 신원→시세→감시 순서를 건너뛸 수 없다', () => {
  const lv = i => MS.classify(i, TODAY).level;
  a.equal(lv({ id: 1, market: 'KR', kind: 'stock', identity: idv() }), 'IDENTITY');
  a.equal(lv({ id: 1, market: 'KR', kind: 'stock', price: ev() }), 'UNAVAILABLE');   // 신원 없이 시세만
  a.equal(lv({ id: 1, market: 'KR', kind: 'stock', identity: idv(), price: ev() }), 'PRICE');
  a.equal(lv({ id: 1, market: 'KR', kind: 'stock', identity: idv(), price: ev(), monitoring: { active: true, approvedBy: 'user', source: 'app', baseDate: '2026-10-28', queriedAt: '2026-10-29' } }), 'MONITORING');
  a.equal(lv({ id: 1, market: 'KR', kind: 'stock', identity: idv(), price: ev(), monitoring: { active: true, approvedBy: 'claude', source: 'app', baseDate: '2026-10-28', queriedAt: '2026-10-29' } }), 'PRICE');
  a.equal(lv({ id: 1, market: 'US', kind: 'stock', price: ev(), monitoring: { active: true, approvedBy: 'user', source: 'app', baseDate: '2026-10-28', queriedAt: '2026-10-29' } }), 'MONITORING');
  a.equal(lv({ id: 1, market: 'KR', kind: 'stock', identity: { ...idv(), state: 'MISMATCH' } }), 'UNAVAILABLE');
});
test('상태 구분: 오래됨·출처/기준일 없음·실패 사유·미래 조회 → DATA_UNAVAILABLE, 신호 숨김', () => {
  const full = { id: 1, market: 'US', kind: 'stock', signal: { decision: 'BUY', score: 7 }, monitoring: { active: true, approvedBy: 'user', source: 'app', baseDate: '2026-10-28', queriedAt: '2026-10-29' } };
  a.equal(MS.classify({ ...full, price: ev() }, TODAY).signal.shown, true); a.equal(MS.classify({ ...full, price: ev() }, TODAY).signal.label, '백테스트 미검증 가설');
  for (const price of [ev({ baseDate: '2026-10-01' }), ev({ source: '' }), ev({ baseDate: undefined }), ev({ failureReason: '429' }), ev({ queriedAt: '2026-11-30' }), ev({ baseDate: '2026-11-30' }), null, ev({ origin: 'user-typed' })]) {
    const r = MS.classify({ ...full, price }, TODAY); a.equal(r.level, 'UNAVAILABLE'); a.equal(r.signal.shown, false); a.equal(r.signal.decision, 'HOLD'); a.ok(r.reasons.length);
  }
  a.equal(MS.classify({ ...full, price: ev(), monitoring: { ...full.monitoring, baseDate: '2026-10-01' } }, TODAY).signal.shown, false);
});
test('상태 문구: 기준일·출처·조회 시각·사유를 항상 포함', () => {
  const item = { id: 'x', market: 'US', kind: 'stock', price: ev({ baseDate: '2026-10-01' }) }; const d = MS.describe(MS.classify(item, TODAY), item);
  a.equal(d.baseDate, '2026-10-01'); a.equal(d.source, 'provider-x'); a.equal(d.queriedAt, '2026-10-29'); a.match(d.note, /오래됨/); a.match(d.signalText, /신호 없음/);
});
test('잘못된 입력(시장/종류)은 DATA_UNAVAILABLE', () => { a.equal(MS.classify({ id: 1, market: 'JP', kind: 'stock' }, TODAY).level, 'UNAVAILABLE'); a.equal(MS.classify({ id: 1, market: 'KR', kind: 'bond' }, TODAY).level, 'UNAVAILABLE'); });
