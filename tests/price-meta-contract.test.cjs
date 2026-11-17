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
test('B 판정: 서로 다른 두 공급자·같은 시장일·정규장 종가·같은 조정 기준·허용 오차 안에서만', () => {
  const p1 = K.parseResponse(resp({ AAA: metaUS() }), CTX).quotes.AAA;
  const p2 = K.parseResponse({ AAA: 100.2, __quoteMeta: { schema: K.SCHEMA, quotes: { AAA: metaUS({ source: 'synthetic-provider-y' }) } } }, CTX).quotes.AAA;
  a.equal(K.crossCheck(p1, p2).state, 'B');
  const same = K.parseResponse({ AAA: 100, __quoteMeta: { schema: K.SCHEMA, quotes: { AAA: metaUS({ source: 'SYNTHETIC-PROVIDER-X' }) } } }, CTX).quotes.AAA;
  a.equal(K.crossCheck(p1, same).state, 'C', '대소문자만 다른 같은 공급자는 독립 아님');
  const far = K.parseResponse({ AAA: 103, __quoteMeta: { schema: K.SCHEMA, quotes: { AAA: metaUS({ source: 'synthetic-provider-y' }) } } }, CTX).quotes.AAA;
  const cf = K.crossCheck(p1, far); a.equal(cf.state, 'C'); a.match(cf.reasons[0], /충돌/);
  const adj = K.parseResponse({ AAA: 100, __quoteMeta: { schema: K.SCHEMA, quotes: { AAA: metaUS({ source: 'synthetic-provider-y', adjusted: 'split+dividend' }) } } }, CTX).quotes.AAA;
  a.equal(K.crossCheck(p1, adj).state, 'C');
  const live = K.parseResponse({ AAA: 100, __quoteMeta: { schema: K.SCHEMA, quotes: { AAA: metaUS({ source: 'synthetic-provider-y', kind: 'delayed', asOf: '2026-11-16T15:00:00-05:00' }) } } }, CTX).quotes.AAA;
  a.equal(live.state, 'A'); a.equal(K.crossCheck(p1, live).state, 'C', '지연·장중 가격은 대조 대상 아님');
  a.equal(K.crossCheck(p1, { state: 'U', price: 100, meta: null }).state, 'C');
});
test('B여도 재무·본질가치·공시·반론 관문이 모두 정확히 true가 아니면 보류', () => {
  const all = { fundamentals: true, valuation: true, disclosure: true, counterArgument: true };
  a.equal(K.signalPolicy('B', all).hold, false); a.match(K.signalPolicy('B', all).reason, /최종 결정은 순태씨/);
  for (const k of K.GATES) { a.equal(K.signalPolicy('B', { ...all, [k]: false }).hold, true, k); a.equal(K.signalPolicy('B', { ...all, [k]: 'true' }).hold, true, k + ' 문자열'); }
  a.equal(K.signalPolicy('B').hold, true); a.equal(K.signalPolicy('verified', all).hold, true, '알 수 없는 상태 문자열');
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
