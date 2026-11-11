'use strict';
const { test } = require('node:test'), a = require('node:assert/strict');
const F = require('../kr-radar/fixtures.js'), S = require('../kr-radar/sell.js');
const run = over => S.evaluateSell(F.sellInput(over), { today: F.TODAY });
const facs = (name, state) => F.sellInput().thesis.factors.map(f => f.name === name ? { name, state } : f);
const guards = r => { a.equal(r.automaticAction, false); a.equal(r.order, null); a.equal(r.notification, null); a.equal(r.actualActiveCount, 0); a.equal(r.realApiRequests, 0); };
test('baseline holds for long-term review and never emits an action', () => { const r = run({}); a.equal(r.status, '장기 보유 검토'); guards(r); a.deepEqual(r.alerts, []); });
test('a large gain alone is NOT a sell signal (+20/+30/+50% style triggers are not used)', () => {
  for (const close of [120, 130, 150, 200, 300, 500]) { const r = run({ quote: { close } }); a.equal(r.status, '장기 보유 검토'); a.equal(Math.round(r.returnPct), Math.round((close / 100 - 1) * 100)); }
  a.match(run({}).notes.join(' '), /자동 매도 신호가 아닙니다/);
});
test('structural deterioration or governance damage reopens the thesis', () => {
  a.equal(run({ thesis: { factors: facs('moat', 'structural-deterioration') } }).status, '투자 논리 훼손 재검토');
  a.equal(run({ governance: { physicalSpinOff: true } }).status, '투자 논리 훼손 재검토');
  a.equal(run({ governance: { conflict: true } }).status, '투자 논리 훼손 재검토');
  a.equal(run({ thesis: { factors: facs('debt', 'uncertain') } }).status, '평가 불가');
});
test('concentration breach is a weight check', () => { const r = run({ positions: [{ account: 'A0', stock: 'KR-DEMO-G', sector: 'G', value: 90, currency: 'BASE' }, { account: 'A0', stock: 'KR-DEMO-H', sector: 'H', value: 10, currency: 'BASE' }] }); a.equal(r.status, '비중 점검'); });
test('expensive valuation needs a replacement case to reach a partial-sale review', () => {
  const exp = { valuation: { multiple: 2, historicalHigh: 1.4, growthPct: 3, outlookGrowthPct: 8, fcfYieldPct: 1 } };
  a.equal(run(exp).status, '평가 불가'); a.match(run(exp).missing.join(' '), /고평가·이익 정점만으로 매도 판단 불가/);
  a.equal(run({ ...exp, valuation: { ...exp.valuation } }).flags.expensive, true);
  const rep = { replacement: { ...F.sellInput().replacement, alternativeYield: 9 } };
  a.equal(run({ ...exp, ...rep }).status, '일부 매도 검토');
  a.equal(run({ ...exp, replacement: { ...rep.replacement, alternativeQuality: 10 } }).status, '평가 불가');
});
test('cyclical earnings peak is treated like an expensive flag, never as an automatic sell', () => {
  const peak = { sector: 'semiconductor', cycle: { phase: 'peak', earningsVsMid: 1.6 } };
  const r = run(peak); a.equal(r.flags.peak, true); a.equal(r.status, '평가 불가');
  a.equal(run({ ...peak, replacement: { ...F.sellInput().replacement, alternativeYield: 9 } }).status, '일부 매도 검토');
  a.equal(run({ sector: 'semiconductor', cycle: { phase: 'unknown', earningsVsMid: 1 } }).status, '평가 불가');
  a.equal(run({ sector: 'semiconductor', cycle: { phase: 'peak', earningsVsMid: 1.1 } }).flags.peak, false);
});
test('buyback without cancellation and dividend cuts are reported but do not trigger a sale', () => {
  const r = run({ shareholderReturn: { buybackWithoutCancellation: true, dividendCut: true } });
  a.equal(r.flags.returnWeak, true); a.match(r.reasons.join(' '), /소각하지 않음/); a.match(r.reasons.join(' '), /배당 삭감/); a.equal(r.status, '장기 보유 검토');
});
test('trading halt or delisting risk is an urgent status check, not an order', () => {
  for (const over of [{ instrument: { tradingHalt: true } }, { instrument: { delistingReview: true } }, { instrument: { administrativeIssue: true } }, { quote: { tradingStatus: 'halt' } }]) { const r = run(over); a.equal(r.status, '긴급 위험 확인'); guards(r); a.match(r.reasons.join(' '), /매도 지시가 아닙니다/); }
});
test('stale or inconsistent quote/cost data is not evaluable', () => {
  a.equal(run({ quote: { asOf: '2026-10-10' } }).status, '평가 불가'); a.equal(run({ quote: { costBasis: 'unadjusted' } }).status, '평가 불가');
  a.equal(run({ quote: { currency: 'USD' } }).status, '평가 불가'); a.equal(run({ quote: { cost: 0 } }).status, '평가 불가'); a.equal(run({ quote: { session: 'after-hours' } }).status, '평가 불가');
  a.equal(S.evaluateSell(F.sellInput(), {}).status, '평가 불가'); a.equal(S.evaluateSell({ ...F.sellInput(), id: 'X1' }, { today: F.TODAY }).status, '평가 불가');
});
test('ETFs get no stock valuation: only concentration is checked', () => {
  const etf = { instrument: { name: 'KODEX 가상지수', securityType: 'ETF', etfKind: 'domestic-equity' } };
  const r = run(etf); a.equal(r.status, '평가 불가'); a.ok(r.missing.some(m => /ETF 전용 매도 검토/.test(m))); a.equal(r.flags.expensive, undefined);
  a.equal(run({ ...etf, positions: [{ account: 'A0', stock: 'KR-DEMO-G', sector: 'G', value: 90, currency: 'BASE' }, { account: 'A0', stock: 'KR-DEMO-H', sector: 'H', value: 10, currency: 'BASE' }] }).status, '비중 점검');
});
test('core (pension) role keeps account policies separate', () => {
  const r = run({ role: 'core', thesis: { factors: facs('earnings', 'structural-deterioration') } }); a.equal(r.status, '투자 논리 훼손 재검토'); a.match(r.notes.join(' '), /연금 코어 계좌/);
  a.equal(run({ role: 'bogus' }).role, 'undetermined');
});
