'use strict';
/* 독립 검토(2026-11-09) 지적 반영 시험: 종가 최신성(평일 기준), closedDates, SEC stale 플래그 */
const test = require('node:test'), a = require('node:assert/strict'), M = require('../has/market-data.js'), F = require('../has/market-fixtures.js'), A = require('../has/sec-facts-adapter.js'), X = require('../has/sec-facts-fixture.js');
const c = x => JSON.parse(JSON.stringify(x));
const pack = (mut) => { const p = c(F.create()); delete p.valuationDocument; delete p.secFacts; if (mut) mut(p); return p; };
// 종가 기준일: 2026-11-06(금)
const at = (now, mut) => M.analyzePack(pack(mut), now);
test('Friday close expires at Monday close, not Tuesday midnight', () => {
  for (const now of ['2026-11-06T22:00:00Z','2026-11-07T10:00:00Z','2026-11-08T10:00:00Z','2026-11-09T20:59:59Z']) a.notEqual(at(now).quote.status,'invalid',now);
  for (const now of ['2026-11-09T21:00:00Z','2026-11-09T21:04:59Z','2026-11-09T21:05:00Z','2026-11-10T10:00:00Z']) a.equal(at(now).quote.status,'invalid',now);
});
test('closedDates cannot grant freshness, regardless of shape', () => {
  for (const closedDates of [[],['2026-11-09'],'2026-11-09',[123],['2026-13-40'],Array(61).fill('2026-11-09'),{a:1}]) {
    const r=at('2026-11-10T10:00:00Z',p=>p.closedDates=closedDates);a.equal(r.quote.status,'invalid');a.ok(r.quote.issues.some(x=>x.includes('closedDates')));
  }
});
test('delayed quotes retain existing rules', () => {
  const r=at('2026-11-06T22:30:00Z',p=>p.quotes.forEach(q=>{q.priceKind='delayed';q.delayMinutes=15;}));a.notEqual(r.quote.status,'invalid');a.equal(r.quote.selected.freshness,null);
});
test('SEC: 오래된 공시 값에는 stale 가 값·근거 양쪽에 true, 최신 값에는 false', () => {
  const o = A.select(X.create(), '2026-11-08T10:00:00Z'); a.ok(Object.values(o.observations).every(v => v.stale === true)); a.ok(o.selectionEvidence.every(v => v.stale === true)); a.equal(o.status, 'partial');
  const fresh = A.select(X.create(), '2026-03-01T00:00:00Z'); a.ok(Object.values(fresh.observations).every(v => v.stale === false)); a.equal(fresh.status, 'ready');
});
test('입력 원본은 변경되지 않는다', () => { const p = pack(p => { p.closedDates = ['2026-11-09']; }), s = JSON.stringify(p); M.analyzePack(p, '2026-11-10T10:00:00Z'); a.equal(JSON.stringify(p), s); });
