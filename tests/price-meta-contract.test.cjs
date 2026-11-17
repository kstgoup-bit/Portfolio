'use strict';
/* GPT-20261117-0731 1단계: 가격 메타 계약 v1 합성 시험 + 현행 자가 선언 우회 반례 확인.
   모든 가격·시각·공급자 이름은 가상(합성)이다. 실제 GAS·네트워크·저장소에 접근하지 않는다. */
const { test } = require('node:test'), a = require('node:assert/strict');
const K = require('../has/quote-meta-contract.js'), T = require('../has/price-trust.js'), Q = require('../has/quote-model.js');
const NOW = '2026-11-17T01:00:00Z'; /* 뉴욕 11-16 20:00, 서울 11-17 10:00 */
const CTX = { market: 'US', tickers: ['AAA', 'BBB'], now: NOW, appReceivedAt: NOW };
const metaUS = (o) => Object.assign({ market: 'US', currency: 'USD', source: 'synthetic-provider-x', asOf: '2026-11-16T16:00:00-05:00', marketDate: '2026-11-16', kind: 'regular-close', adjusted: 'none', receivedAt: '2026-11-17T00:59:00Z' }, o || {});
const resp = (quotes, extra) => Object.assign({ AAA: 100, BBB: 200, __quoteMeta: { schema: K.SCHEMA, quotes } }, extra || {});

test('하위 호환: 메타 없는 기존 평면 응답은 가격만 U(미확인)로 받음', () => {
  const r = K.parseResponse({ AAA: 100, BBB: 200 }, CTX);
  a.equal(r.schema, 'none'); a.equal(r.quotes.AAA.price, 100); a.equal(r.quotes.AAA.state, 'U'); a.equal(r.quotes.BBB.meta, null);
});
test('정상 v1 메타: A(단일 출처) — 독립 검증 아님, transport는 user-gas, 앱 수신시각은 asOf로 승격 안 됨', () => {
  const r = K.parseResponse(resp({ AAA: metaUS() }), CTX), q = r.quotes.AAA;
  a.equal(q.state, 'A'); a.equal(q.meta.source, 'synthetic-provider-x'); a.equal(q.meta.transport, 'user-gas');
  a.equal(q.meta.asOf, '2026-11-16T16:00:00-05:00'); a.notEqual(q.meta.asOf, NOW); a.equal(q.meta.appReceivedAt, NOW);
  a.equal(r.quotes.BBB.state, 'U', '부분 메타: 메타 없는 종목은 미확인 유지');
  a.equal(K.signalPolicy('A', { fundamentals: true, valuation: true, disclosure: true, counterArgument: true }).hold, true, 'A만으로 보류 해제 금지');
});
test('예약 키·스키마·상한·1:1 결합', () => {
  a.equal(K.parseResponse(resp({ AAA: metaUS() }), { ...CTX, tickers: ['AAA', '__quoteMeta'] }).quotes.__quoteMeta, undefined, '예약 키는 종목이 될 수 없음');
  const bad = K.parseResponse({ AAA: 100, __quoteMeta: { schema: 'v0', quotes: { AAA: metaUS() } } }, CTX);
  a.equal(bad.schema, 'invalid'); a.equal(bad.quotes.AAA.state, 'U'); a.equal(bad.quotes.AAA.price, 100, '메타 오류여도 가격 처리는 현행 동일');
  const many = {}; for (let i = 0; i <= K.MAX_QUOTES; i++) many['T' + i] = metaUS();
  a.equal(K.parseResponse({ AAA: 100, __quoteMeta: { schema: K.SCHEMA, quotes: many } }, CTX).schema, 'invalid');
  const orphan = K.parseResponse({ AAA: 100, __quoteMeta: { schema: K.SCHEMA, quotes: { ZZZ: metaUS() } } }, CTX);
  a.equal(orphan.quotes.ZZZ, undefined); a.ok(orphan.issues.some(s => /가격 없는 메타/.test(s)));
  a.ok(K.parseResponse({ AAA: 100, __evil: 1 }, CTX).issues.some(s => /예약 키/.test(s)));
  const nan = K.parseResponse({ AAA: 'NaN', BBB: -1, __quoteMeta: { schema: K.SCHEMA, quotes: { AAA: metaUS() } } }, CTX);
  a.equal(nan.quotes.AAA, undefined, '숫자 아닌 가격에 메타가 있어도 가격을 만들지 않음'); a.equal(nan.quotes.BBB, undefined);
});
const C_CASES = {
  '시장 불일치': { market: 'KR' }, '통화 불일치': { currency: 'KRW' }, '공급자 없음': { source: '' }, 'GAS를 출처로 표기': { source: 'gas-jsonp' },
  '오프셋 없는 시각': { asOf: '2026-11-16T16:00:00' }, '미래 시각': { asOf: '2026-11-18T16:00:00-05:00', marketDate: '2026-11-18' },
  '시장일 불일치': { marketDate: '2026-11-17' }, '가격 종류 미확인': { kind: 'unknown' }, '조정 여부 미확인': { adjusted: 'unknown' },
  '오래된 종가': { asOf: '2026-11-06T16:00:00-05:00', marketDate: '2026-11-06' }, '휴장(주말)': { asOf: '2026-11-15T16:00:00-05:00', marketDate: '2026-11-15' },
  '기업행위 의심': { corporateActionSuspected: true }, 'GAS 수신이 기준시각보다 이전': { receivedAt: '2026-11-16T10:00:00Z' },
  '오래된 장중 가격': { kind: 'intraday', asOf: '2026-11-15T11:00:00-05:00', marketDate: '2026-11-15' }
};
for (const [name, patch] of Object.entries(C_CASES)) test('보수적 보류(C): ' + name, () => {
  const q = K.parseResponse(resp({ AAA: metaUS(patch) }), CTX).quotes.AAA;
  a.equal(q.state, 'C', name); a.ok(q.reasons.length > 0); a.equal(K.signalPolicy(q.state, { fundamentals: true, valuation: true, disclosure: true, counterArgument: true }).hold, true);
});
test('KR 시장: 서울 시간대 시장일·KRW', () => {
  const m = { market: 'KR', currency: 'KRW', source: 'synthetic-kr', asOf: '2026-11-16T15:30:00+09:00', marketDate: '2026-11-16', kind: 'regular-close', adjusted: 'none' };
  a.equal(K.parseResponse({ '005930': 50000, __quoteMeta: { schema: K.SCHEMA, quotes: { '005930': m } } }, { market: 'KR', tickers: ['005930'], now: NOW }).quotes['005930'].state, 'A');
  const wrongDay = Object.assign({}, m, { asOf: '2026-11-16T23:30:00Z' }); /* 서울 11-17 08:30 → 시장일 불일치 */
  a.equal(K.parseResponse({ '005930': 50000, __quoteMeta: { schema: K.SCHEMA, quotes: { '005930': wrongDay } } }, { market: 'KR', tickers: ['005930'], now: NOW }).quotes['005930'].state, 'C');
});
test('자가 선언 무시: GAS 메타의 verification=independent-verified는 B를 만들지 못함', () => {
  const q = K.parseResponse(resp({ AAA: metaUS({ verification: 'independent-verified' }) }), CTX).quotes.AAA;
  a.equal(q.state, 'A'); a.ok(q.flags.includes('self-declared-verification-ignored')); a.equal(K.signalPolicy(q.state).hold, true);
});
test('공급자 혼용 응답 표시', () => {
  const r = K.parseResponse(resp({ AAA: metaUS(), BBB: metaUS({ source: 'synthetic-provider-y' }) }), CTX);
  a.equal(r.mixedSource, true); a.ok(r.quotes.AAA.flags.includes('mixed-source'));
});
/* ── 0731 지피 1030 CR 반영: B 는 앱 코드가 정한 승인 경로·원천 계보·검증 달력이 있는 인스턴스에서만 ── */
const ALL = { fundamentals: true, valuation: true, disclosure: true, counterArgument: true };
const CAL_OK = (mk, d) => ({ trading: true, close: mk === 'US' ? '16:00' : '15:30' });
const ROUTES = { 'route-x': { approved: true, upstream: 'synthetic-up-1' }, 'route-y': { approved: true, upstream: 'synthetic-up-2' }, 'route-z': { approved: true, upstream: 'SYNTHETIC-UP-1' } };
const mk = (cfg) => K.createContract(cfg === undefined ? { routes: ROUTES, closeCalendar: CAL_OK } : cfg);
const qv = (inst, route, price, patch, ctx) => inst.parseResponse({ AAA: price, __quoteMeta: { schema: K.SCHEMA, quotes: { AAA: metaUS(patch) } } }, Object.assign({}, CTX, { route }, ctx || {})).quotes.AAA;

test('B 판정(정상 경로): 승인된 서로 다른 경로·다른 원천 계보·같은 시장일·정규장 종가·같은 조정·허용오차 안·검증 달력 마감 이후', () => {
  const I = mk(), p1 = qv(I, 'route-x', 100), p2 = qv(I, 'route-y', 100.2, { source: 'synthetic-provider-y' });
  const ev = I.crossCheck(p1, p2);
  a.equal(ev.state, 'B'); a.deepEqual([...ev.routes], ['route-x', 'route-y']); a.deepEqual([...ev.upstreams], ['synthetic-up-1', 'synthetic-up-2']);
  a.ok(Object.isFrozen(ev)); a.equal(ev.tolerance, K.CROSS_TOLERANCE);
  const far = I.crossCheck(p1, qv(I, 'route-y', 103)); a.equal(far.state, 'C'); a.match(far.reasons[0], /충돌/);
  a.equal(I.crossCheck(p1, qv(I, 'route-y', 100, { adjusted: 'split+dividend' })).state, 'C');
  const live = qv(I, 'route-y', 100, { kind: 'delayed', asOf: '2026-11-16T15:00:00-05:00' });
  a.equal(live.state, 'A'); a.equal(I.crossCheck(p1, live).state, 'C', '지연·장중 가격은 대조 대상 아님');
  a.equal(I.crossCheck(p1, { state: 'U', price: 100, meta: null }).state, 'C');
});
test('CR-1: 문자열 B·위조 증거·다른 인스턴스 증거로는 보류 해제 불가 — 이 인스턴스 crossCheck 발급 증거만', () => {
  a.equal(K.signalPolicy('B', ALL).hold, true, "문자열 'B' + 관문 4개 true여도 보류");
  a.match(K.signalPolicy('B', ALL).reason, /증거 없는 B/);
  const fake = Object.freeze({ state: 'B', reasons: [], diff: 0, sources: ['x', 'y'], routes: ['route-x', 'route-y'] });
  const I = mk(); a.equal(I.signalPolicy(fake, ALL).hold, true, '모양만 같은 위조 증거');
  const ev = I.crossCheck(qv(I, 'route-x', 100), qv(I, 'route-y', 100));
  a.equal(ev.state, 'B'); a.equal(I.signalPolicy(ev, ALL).hold, false); a.match(I.signalPolicy(ev, ALL).reason, /최종 결정은 순태씨/);
  a.equal(K.signalPolicy(ev, ALL).hold, true, '다른 인스턴스(기본)가 발급한 증거 아님');
  a.equal(mk().signalPolicy(ev, ALL).hold, true, '다른 인스턴스 증거');
  a.throws(() => { ev.state = 'B'; ev.prices[0] = 1; }, TypeError, '증거 동결');
  /* 호출자가 만든 가짜 A 시세로 대조 불가, 발급된 A 시세는 동결 */
  const p1 = qv(I, 'route-x', 100), forgedA = { state: 'A', price: 100, meta: Object.assign({}, p1.meta, { route: 'route-y' }) };
  a.equal(I.crossCheck(p1, forgedA).state, 'C'); a.throws(() => { p1.price = 1; }, TypeError);
  a.equal(I.signalPolicy('C', ALL).hold, true); a.equal(I.signalPolicy(undefined, ALL).hold, true); a.equal(I.signalPolicy({}, ALL).hold, true);
});
test('B여도 재무·본질가치·공시·반론 관문이 모두 정확히 true가 아니면 보류', () => {
  const I = mk(), ev = I.crossCheck(qv(I, 'route-x', 100), qv(I, 'route-y', 100));
  a.equal(I.signalPolicy(ev, ALL).hold, false);
  for (const k of K.GATES) { a.equal(I.signalPolicy(ev, { ...ALL, [k]: false }).hold, true, k); a.equal(I.signalPolicy(ev, { ...ALL, [k]: 'true' }).hold, true, k + ' 문자열'); }
  a.equal(I.signalPolicy(ev).hold, true); a.equal(K.signalPolicy('verified', ALL).hold, true, '알 수 없는 상태 문자열');
});
test('CR-2: 공급자 이름 두 개 ≠ 독립 — 경로·원천 계보로만 판정, 재포장·미승인·응답 자가 선언 경로는 C', () => {
  const I = mk(), x = qv(I, 'route-x', 100);
  const sameRoute = I.crossCheck(x, qv(I, 'route-x', 100, { source: 'totally-different-name' }));
  a.equal(sameRoute.state, 'C'); a.ok(sameRoute.reasons.some(r => /같은 수집 경로/.test(r)), '이름만 다른 같은 GAS 경로');
  const repack = I.crossCheck(x, qv(I, 'route-z', 100, { source: 'brand-new-vendor' }));
  a.equal(repack.state, 'C'); a.ok(repack.reasons.some(r => /재포장/.test(r)), '다른 경로·다른 이름이지만 같은 원천(대소문자 무시)');
  const unknown = qv(I, 'route-unapproved', 100, { source: 'synthetic-provider-y' });
  a.equal(unknown.meta.route, null); a.ok(I.crossCheck(x, unknown).reasons.some(r => /승인된 수집 경로 없음/.test(r)));
  const declared = qv(I, undefined, 100, { source: 'synthetic-provider-y', route: 'route-y', upstream: 'synthetic-up-2' });
  a.equal(declared.meta.route, null, '응답이 밝힌 경로는 무시'); a.ok(declared.flags.includes('self-declared-route-ignored')); a.equal(I.crossCheck(x, declared).state, 'C');
  /* 기본 인스턴스(운영 기본값): 승인 경로 0개 → 이름이 달라도 항상 C */
  a.deepEqual(K.approvedRoutes(), []);
  const d1 = qv(K, 'route-x', 100), d2 = qv(K, 'route-y', 100, { source: 'synthetic-provider-y' });
  a.equal(K.crossCheck(d1, d2).state, 'C');
  /* 신뢰 설정 형식 오류는 버림 */
  const bad = K.createContract({ routes: { 'route-x': { approved: 'true', upstream: 'u1' }, 'route-y': { approved: true }, 'Route Bad': { approved: true, upstream: 'u3' } }, closeCalendar: CAL_OK });
  a.deepEqual(bad.approvedRoutes(), []);
});
const US_CTX = (now) => ({ now, appReceivedAt: now });
test('CR-3: 정규장 마감 전 시각을 종가로 표기하면 C — DST 전후 뉴욕 시간·서울 시간', () => {
  a.equal(qv(K, null, 100, { asOf: '2026-11-16T11:00:00-05:00' }).state, 'C', '11:00 ET를 종가로 위장');
  a.ok(qv(K, null, 100, { asOf: '2026-11-16T11:00:00-05:00' }).reasons.includes('정규장 마감 전 시각을 종가로 표기'));
  a.equal(qv(K, null, 100, { asOf: '2026-11-16T20:00:00Z' }).state, 'C', '20:00Z = 15:00 EST(11월, 표준시)');
  a.equal(qv(K, null, 100, { asOf: '2026-11-16T21:00:00Z' }).state, 'A', '21:00Z = 16:00 EST');
  /* 2026 미국 서머타임 시작 3-8(일): 3-6(금) EST, 3-9(월) EDT */
  const pre = US_CTX('2026-03-07T03:00:00Z'), post = US_CTX('2026-03-10T03:00:00Z');
  a.equal(qv(K, null, 100, { asOf: '2026-03-06T20:30:00Z', marketDate: '2026-03-06', receivedAt: undefined }, pre).state, 'C', '20:30Z = 15:30 EST');
  a.equal(qv(K, null, 100, { asOf: '2026-03-06T21:05:00Z', marketDate: '2026-03-06', receivedAt: undefined }, pre).state, 'A', '21:05Z = 16:05 EST');
  a.equal(qv(K, null, 100, { asOf: '2026-03-09T20:05:00Z', marketDate: '2026-03-09', receivedAt: undefined }, post).state, 'A', '20:05Z = 16:05 EDT');
  a.equal(qv(K, null, 100, { asOf: '2026-03-09T19:30:00Z', marketDate: '2026-03-09', receivedAt: undefined }, post).state, 'C', '19:30Z = 15:30 EDT');
  const kr = (asOf) => K.parseResponse({ '005930': 50000, __quoteMeta: { schema: K.SCHEMA, quotes: { '005930': { market: 'KR', currency: 'KRW', source: 'synthetic-kr', asOf, marketDate: '2026-11-16', kind: 'regular-close', adjusted: 'none' } } } }, { market: 'KR', tickers: ['005930'], now: NOW }).quotes['005930'].state;
  a.equal(kr('2026-11-16T11:00:00+09:00'), 'C'); a.equal(kr('2026-11-16T15:30:00+09:00'), 'A');
  a.ok(qv(K, null, 100).flags.includes('close-calendar-unverified'));
});
test('CR-3: 검증된 휴장·조기폐장 달력이 없거나 거래일 아님·마감 전이면 B 금지', () => {
  const noCal = mk({ routes: ROUTES });
  const r = noCal.crossCheck(qv(noCal, 'route-x', 100), qv(noCal, 'route-y', 100));
  a.equal(r.state, 'C'); a.ok(r.reasons.some(s => /달력 미검증/.test(s)));
  const holiday = mk({ routes: ROUTES, closeCalendar: () => ({ trading: false }) });
  a.equal(holiday.crossCheck(qv(holiday, 'route-x', 100), qv(holiday, 'route-y', 100)).state, 'C');
  const throws = mk({ routes: ROUTES, closeCalendar: () => { throw new Error('x'); } });
  a.equal(throws.crossCheck(qv(throws, 'route-x', 100), qv(throws, 'route-y', 100)).state, 'C');
  const late = mk({ routes: ROUTES, closeCalendar: () => ({ trading: true, close: '17:00' }) });
  a.ok(late.crossCheck(qv(late, 'route-x', 100), qv(late, 'route-y', 100)).reasons.some(s => /마감 전/.test(s)), '달력 마감이 asOf보다 늦음');
  const badFmt = mk({ routes: ROUTES, closeCalendar: () => ({ trading: true, close: '4pm' }) });
  a.equal(badFmt.crossCheck(qv(badFmt, 'route-x', 100), qv(badFmt, 'route-y', 100)).state, 'C');
});
test('CR-4: 허용오차는 정책 상한(0.5%) 이하 유한 비음수만 — Infinity·NaN·음수·1·문자열은 보류, 경계 0.5%', () => {
  const I = mk(), p1 = qv(I, 'route-x', 100), far = qv(I, 'route-y', 150);
  for (const t of [Infinity, NaN, -0.001, 1, 0.0051, '0.001', null]) {
    const r = I.crossCheck(p1, far, { tolerance: t }); a.equal(r.state, 'C', String(t)); a.match(r.reasons[0], /허용오차 비정상/);
  }
  a.equal(I.crossCheck(p1, far, 'x').state, 'C', '옵션 형식 오류');
  a.equal(K.CROSS_TOLERANCE, 0.005);
  a.equal(I.crossCheck(p1, qv(I, 'route-y', 100.5)).state, 'B', '정확히 0.5%는 허용');
  a.equal(I.crossCheck(p1, qv(I, 'route-y', 100.51)).state, 'C', '0.51%는 충돌');
  a.equal(I.crossCheck(p1, qv(I, 'route-y', 100.2), { tolerance: 0.001 }).state, 'C', '더 엄격한 값은 허용');
  a.equal(I.crossCheck(p1, qv(I, 'route-y', 100.05), { tolerance: 0.001 }).state, 'B');
});
test('결정성·입력 불변·순서 안정', () => {
  const d = resp({ AAA: metaUS(), BBB: metaUS({ kind: 'unknown' }) }), s = JSON.stringify(d);
  const r1 = K.parseResponse(d, CTX), r2 = K.parseResponse(JSON.parse(s), { ...CTX, tickers: ['BBB', 'AAA'] });
  a.equal(JSON.stringify(d), s); a.deepEqual(r1.quotes.AAA, r2.quotes.AAA); a.deepEqual(r1.quotes.BBB, r2.quotes.BBB);
});
test('띠: 미확인·단일 출처는 중립 한 줄, 실제 이상은 우선순위대로 강조', () => {
  const n = K.band([{ state: 'U' }, { state: 'U' }, { state: 'A' }]);
  a.equal(n.level, 'neutral'); a.match(n.label, /미확인 2/); a.doesNotMatch(n.label, /검증 완료|실시간|공식/);
  a.equal(K.band([{ state: 'C', reasons: ['오래된 종가(9일 전)'] }]).key, 'stale');
  a.equal(K.band([{ state: 'C', reasons: ['통화 불일치'] }, { state: 'C', reasons: ['오래된 종가(9일 전)'] }]).key, 'mismatch');
  a.equal(K.band([{ state: 'C', reasons: ['통화 불일치'] }], { fetchFailed: 2 }).key, 'fetch-failed');
  a.equal(K.band([], { adjustedChanged: 1 }).key, 'adjusted-change');
  a.equal(K.band([{ state: 'C', reasons: ['기준시각과 거래소 시장일 불일치'] }]).level, 'neutral', '시장일 불일치는 근거 부족(중립)으로 집계');
  a.equal(K.band([]).label, '가격 출처: 자료 없음');
});
test('계약 모듈은 운영 앱이 불러오지 않음(설계 단계)', () => {
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'portfolio_v5.html'), 'utf8');
  a.equal(html.includes('quote-meta-contract'), false);
});

/* ── 현행 코드 반례 확인(운영 코드 무변경). 아래 시험은 '현재 이렇게 동작한다'는 사실을 고정한다.
   제안된 fail-closed 수정(보고서 5절)을 적용하면 이 기대값을 함께 바꿔야 한다. ── */
test('반례 확인(현행): price-trust describe — manual 은 signalHold=false', () => {
  a.equal(T.describe({ verification: 'manual' }, NOW).signalHold, false);
});
test('반례 확인(현행): price-trust describe — 문자열 자가 선언만으로 보류 해제(공급자가 GAS여도)', () => {
  const d = T.describe({ verification: 'independent-verified', provider: '사용자 지정 GAS 웹앱', marketDate: '2026-11-16', priceKind: 'regular-close', currency: 'USD' }, NOW);
  a.equal(d.signalHold, false); a.equal(d.severity, 'ok');
});
test('반례 확인(현행): quote-model normalize 가 공급자 응답의 verification 자가 선언을 그대로 통과 → usableForSignals ok', () => {
  const n = Q.normalize({ ticker: 'AAA', market: 'US', currency: 'USD', price: 100, kind: 'close', asOfDate: '2026-11-16', asOfTime: '2026-11-16T16:00:00-05:00', fetchedAt: '2026-11-17T00:59:00Z', source: 'gas', verification: 'independent-verified' });
  a.equal(n.ok, true); a.equal(n.quote.verification, 'independent-verified'); a.equal(Q.usableForSignals(n.quote, NOW).ok, true);
});
test('반례 확인(현행): 앱 GAS 경로는 verification 을 만들지 않음 — 운영 화면은 sourceNotice(gas-jsonp)로 항상 미확인·보류', () => {
  const n = T.sourceNotice('gas-jsonp', null, NOW); a.match(n.signalNote, /판단 보류/);
  const html = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'portfolio_v5.html'), 'utf8');
  a.match(html, /quoteMeta\[prefix\+t\.ticker\]=Date\.now\(\)/, '앱 수신시각만 기록(공급자 asOf 아님)');
  a.equal(/independent-verified/.test(html), false, '운영 html 은 독립 검증 문자열을 만들지 않음');
});
