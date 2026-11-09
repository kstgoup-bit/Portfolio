'use strict';
/* 독립 검토(2026-11-09) 지적 반영 시험: 종가 최신성(평일 기준), closedDates, SEC stale 플래그 */
const test = require('node:test'), a = require('node:assert/strict'), M = require('../has/market-data.js'), F = require('../has/market-fixtures.js'), A = require('../has/sec-facts-adapter.js'), X = require('../has/sec-facts-fixture.js');
const c = x => JSON.parse(JSON.stringify(x));
const pack = (mut) => { const p = c(F.create()); delete p.valuationDocument; delete p.secFacts; if (mut) mut(p); return p; };
// 종가 기준일: 2026-11-06(금)
const at = (now, mut) => M.analyzePack(pack(mut), now);
test('금요일 종가: 토·일·월(개장 전후)에는 사용, 화요일 이후에는 보류', () => {
  for (const [now, ok, wd] of [['2026-11-06T22:00:00Z', true, 0], ['2026-11-07T10:00:00Z', true, 0], ['2026-11-08T10:00:00Z', true, 0], ['2026-11-09T10:00:00Z', true, 1], ['2026-11-10T10:00:00Z', false, 2], ['2026-11-11T10:00:00Z', false, 3]]) {
    const r = at(now); a.equal(r.quote.status !== 'invalid', ok, now); if (ok) a.equal(r.quote.selected.weekdaysOld, wd, now); else a.ok(r.quote.issues.some(i => /직전 거래일 이전/.test(i)), now);
  }
});
test('휴장일을 선언하면(closedDates) 연휴 뒤 정상 종가를 쓸 수 있다 — 단, 선언은 미검증', () => {
  const r = at('2026-11-10T10:00:00Z', p => { p.closedDates = ['2026-11-09']; }); a.equal(r.quote.selected.weekdaysOld, 1); a.notEqual(r.quote.status, 'invalid'); a.equal(r.quote.selected.verification, 'unverified');
});
test('closedDates 형식 오류는 무시하고 알림(휴장일로 인정하지 않음)', () => {
  for (const bad of ['2026-11-09', [123], ['2026-13-40'], Array(61).fill('2026-11-09'), { a: 1 }]) { const r = at('2026-11-10T10:00:00Z', p => { p.closedDates = bad; }); a.equal(r.quote.status, 'invalid', JSON.stringify(bad).slice(0, 30)); a.ok(r.issues.some(i => /closedDates 형식 오류/.test(i))); }
});
test('휴장일 선언이 오늘 이전 평일이 아닌 날(주말·무관한 날)이어도 평일 수를 줄이지 못한다', () => {
  const r = at('2026-11-10T10:00:00Z', p => { p.closedDates = ['2026-11-07', '2026-11-08', '2026-01-01']; }); a.equal(r.quote.status, 'invalid');
});
test('종가가 아닌 유형(지연)은 이 규칙의 대상이 아니고 기존 규칙(하루 이내)을 따른다', () => {
  const r = at('2026-11-06T22:30:00Z', p => { p.quotes.forEach(q => { q.priceKind = 'delayed'; q.delayMinutes = 15; }); }); a.notEqual(r.quote.status, 'invalid'); a.equal(r.quote.selected.weekdaysOld, null);
});
test('한국 시장도 거래소 날짜(KST) 기준으로 평일을 센다', () => {
  const kr = (now) => at(now, p => { p.instrument = { ticker: '005930', market: 'KR', currency: 'KRW' }; p.quotes = [{ ...p.quotes[0], ticker: '005930', market: 'KR', currency: 'KRW', price: 70000, asOfDate: '2026-11-06', asOfTime: '2026-11-06T06:30:00Z', receivedAt: '2026-11-06T06:31:00Z' }]; delete p.history; });
  a.notEqual(kr('2026-11-09T01:00:00Z').quote.status, 'invalid'); // 월 10:00 KST: 월요일 1개
  a.equal(kr('2026-11-09T16:00:00Z').quote.status, 'invalid'); // 화 01:00 KST: 평일 2개
});
test('SEC: 오래된 공시 값에는 stale 가 값·근거 양쪽에 true, 최신 값에는 false', () => {
  const o = A.select(X.create(), '2026-11-08T10:00:00Z'); a.ok(Object.values(o.observations).every(v => v.stale === true)); a.ok(o.selectionEvidence.every(v => v.stale === true)); a.equal(o.status, 'partial');
  const fresh = A.select(X.create(), '2026-03-01T00:00:00Z'); a.ok(Object.values(fresh.observations).every(v => v.stale === false)); a.equal(fresh.status, 'ready');
});
test('입력 원본은 변경되지 않는다', () => { const p = pack(p => { p.closedDates = ['2026-11-09']; }), s = JSON.stringify(p); M.analyzePack(p, '2026-11-10T10:00:00Z'); a.equal(JSON.stringify(p), s); });
