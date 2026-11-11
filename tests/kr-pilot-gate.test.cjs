'use strict';
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const G = require('../kr-radar/pilot-gate.js'), U = require('../kr-radar/universe.js'), LD = require('../kr-radar/load.js');
const T = '2026-10-29', ok = { value: '시험', status: 'confirmed', source: 'https://example.com/doc', checkedAt: T };
const KEYS = ['coverage', 'dailyRegularClose', 'updateTimingDelay', 'adjustmentBasis52w', 'holidayCalendarTimezone', 'sessionSplit', 'corrections', 'benchmarks', 'personalDisplay', 'internalProcessing', 'localCacheRights', 'derivedRetention', 'redistribution', 'cost', 'rateLimit', 'keyHandling'];
const provider = (over = {}) => ({ id: 'synthetic-ok', role: 'price', markets: ['US', 'KR'], fields: { ...Object.fromEntries(KEYS.map(k => [k, ok])), ...over } });
const calendar = (over = {}) => ({ market: 'X', tz: 'UTC', holidays: ['2026-10-27'], coverage: { from: '2026-01-01', to: '2026-12-31' }, source: 'https://example.com/cal', checkedAt: T, ...over });
const series = (over = {}) => ({ source: { id: 'A' }, asOf: '2026-10-28', timezone: 'UTC', session: 'regular', close: 100, high52w: 130, high52wStart: '2025-10-28', high52wEnd: '2026-10-28', observations: 250, closeBasis: 'adjusted-consistent', highBasis: 'adjusted-consistent', adjustedThroughAsOf: true, splits: [], ...over });
const cross = (over = {}) => ({ source: { id: 'B' }, independent: true, asOf: '2026-10-28', close: 100.2, high52w: 130.5, adjustmentBasis: 'adjusted-consistent', ...over });
const kr = (over = {}) => ({ code: 'ZZ0001', name: '가상기업', market: 'KOSPI', securityType: '보통주', group: 'stock', listingCheck: 'matched', reviewStatus: 'verified', delisted: false, delistingReview: false, administrativeIssue: false, tradingHalt: false, investmentCaution: 'none', ...over });
const good = (o = {}) => ({ synthetic: true, market: 'US', symbol: 'MSFT', provider: provider(), calendar: calendar(), series: series(), crossCheck: cross(), plannedUse: { display: true, storeLocally: true, derivedMetrics: true, shareWithOthers: false }, ...o });
const run = i => G.evaluateSymbol(i, { today: T });
const failStage = (i, stage, status) => { const r = run(i); const s = r.stages.find(x => x.stage === stage); a.equal(s.status, status, stage + ' ' + s.reason); a.notEqual(r.overall, '통과(합성)'); a.equal(r.scoreLinked, false); a.equal(r.activeWatch, false); return r; };
test('a fully satisfied SYNTHETIC symbol passes all 7 stages yet is never linked to scoring or active watch', () => {
  const r = run(good()); a.equal(r.overall, '통과(합성)'); a.equal(r.stages.length, 7); a.ok(r.stages.every(s => s.status === '통과' && s.realPrice === false && s.checkedAt === T && s.scope));
  a.equal(r.scoreLinked, false); a.equal(r.activeWatch, false); a.equal(r.actualActiveCount, 0); a.equal(r.realPriceValidated, 0); a.equal(r.realApiRequests, 0);
});
test('real (non-synthetic) input is refused in stage9', () => { const r = run({ ...good(), synthetic: false }); a.equal(r.overall, '실패'); a.equal(r.stages.length, 0); a.match(r.reason, /합성 입력만/); });
test('rights: unconfirmed → 보류, conflict → 실패, wrong market → 실패; later stages are held', () => {
  const r1 = failStage(good({ provider: provider({ rightsX: ok, cost: { ...ok, status: 'unconfirmed', source: null } }) }), 'rights', '보류'); a.ok(r1.stages.slice(1).every(s => s.status === '보류' && /선행/.test(s.reason)));
  failStage(good({ provider: provider({ personalDisplay: { ...ok, status: 'conflict' } }) }), 'rights', '실패');
  failStage(good({ provider: { ...provider(), markets: ['KR'] } }), 'rights', '실패');
});
test('eligibility: US must be one of the fixed five; KR needs official match and status flags', () => {
  failStage(good({ symbol: 'TSLA' }), 'eligibility', '실패');
  const base = { market: 'KR', symbol: 'ZZ0001' };
  a.equal(run(good({ ...base, instrument: kr() })).overall, '통과(합성)');
  failStage(good({ ...base, instrument: kr({ listingCheck: 'unverified' }) }), 'eligibility', '보류');
  failStage(good({ ...base, instrument: kr({ delisted: true }) }), 'eligibility', '실패');
  failStage(good({ ...base, instrument: kr({ tradingHalt: undefined }) }), 'eligibility', '보류');
  failStage(good({ ...base, instrument: kr({ group: 'etf' }) }), 'eligibility', '실패');
  failStage(good({ ...base, instrument: kr({ securityType: '우선주' }) }), 'eligibility', '보류');
});
test('session: holiday, weekend, future, stale, extended-hours, tz mismatch, out-of-calendar', () => {
  failStage(good({ series: series({ asOf: '2026-10-27', high52wEnd: '2026-10-27' }) }), 'session', '실패');
  failStage(good({ series: series({ asOf: '2026-10-25', high52wEnd: '2026-10-25' }) }), 'session', '실패');
  failStage(good({ series: series({ asOf: '2026-10-30', high52wEnd: '2026-10-30' }) }), 'session', '실패');
  failStage(good({ series: series({ asOf: '2026-10-20', high52wEnd: '2026-10-20' }) }), 'session', '보류');
  failStage(good({ series: series({ session: 'mixed' }) }), 'session', '실패');
  failStage(good({ series: series({ timezone: 'Asia/Seoul' }) }), 'session', '실패');
  failStage(good({ calendar: calendar({ coverage: { from: '2025-01-01', to: '2025-12-31' } }) }), 'session', '보류');
  failStage(good({ calendar: null }), 'session', '보류');
});
test('adjustment: mixed bases, unadjusted across a split, unknown split history, unconfirmed adjustment through asOf', () => {
  failStage(good({ series: series({ highBasis: 'unadjusted' }) }), 'adjustment', '실패');
  failStage(good({ series: series({ closeBasis: 'unadjusted', highBasis: 'unadjusted', splits: [{ date: '2026-03-01', ratio: 2 }] }), crossCheck: cross({ adjustmentBasis: 'unadjusted' }) }), 'adjustment', '실패');
  failStage(good({ series: series({ splits: undefined }) }), 'adjustment', '보류');
  failStage(good({ series: series({ adjustedThroughAsOf: false }) }), 'adjustment', '보류');
  a.equal(run(good({ series: series({ closeBasis: 'unadjusted', highBasis: 'unadjusted' }), crossCheck: cross({ adjustmentBasis: 'unadjusted' }) })).overall, '통과(합성)');
});
test('52-week high: short history, wrong window, high below close', () => {
  failStage(good({ series: series({ observations: 120 }) }), 'high52w', '보류');
  failStage(good({ series: series({ high52wStart: '2026-04-28' }) }), 'high52w', '보류');
  failStage(good({ series: series({ high52w: 90 }) }), 'high52w', '실패');
  failStage(good({ series: series({ high52w: NaN }) }), 'high52w', '보류');
});
test('cross-check: missing, same provider, different basis/date, price disagreement', () => {
  failStage(good({ crossCheck: null }), 'crossCheck', '보류');
  failStage(good({ crossCheck: cross({ source: { id: 'A' } }) }), 'crossCheck', '보류');
  failStage(good({ crossCheck: cross({ independent: false }) }), 'crossCheck', '보류');
  failStage(good({ crossCheck: cross({ asOf: '2026-10-27' }) }), 'crossCheck', '실패');
  failStage(good({ crossCheck: cross({ close: 103 }) }), 'crossCheck', '실패');
  failStage(good({ crossCheck: cross({ high52w: 140 }) }), 'crossCheck', '실패');
});
test('use rights: sharing/public repo → 실패; unconfirmed storage/derived rights → 보류', () => {
  failStage(good({ plannedUse: { display: true, shareWithOthers: true } }), 'useRights', '실패');
  failStage(good({ plannedUse: null }), 'useRights', '보류');
  const unconf = { ...ok, status: 'unconfirmed', source: null };
  const r = run(good({ provider: provider({ localCacheRights: unconf }) })); a.equal(r.stages[0].status, '보류');
});
test('inputs are not mutated and results are deterministic', () => {
  const i = good({ market: 'KR', symbol: 'ZZ0001', instrument: kr() }), snap = JSON.stringify(i); const r1 = run(i), r2 = run(i); a.equal(JSON.stringify(i), snap); a.deepEqual(r1, r2);
});
test('KR pilot selection: explicit picks only, officially verified individual stocks only; today that is 0', () => {
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '../kr-radar/data/universe.json'), 'utf8'));
  const none = G.selectKrPilot(data, [data.securities[0].code, 'ZZ9999']); a.equal(none.krPilotCount, 0); a.equal(none.rejected.length, 2); a.equal(none.usPilotCount, 5); a.match(none.note, /미충족/);
  const d = JSON.parse(JSON.stringify(data)); d.securities.slice(0, 7).forEach(s => { s.listingCheck = 'matched'; s.reviewStatus = 'verified'; });
  const picks = d.securities.slice(0, 7).map(s => s.code); const r = G.selectKrPilot(d, [...picks, picks[0]]); a.equal(r.krPilotCount, 5); a.ok(r.rejected.some(x => x.reason === '5종목 초과'));
  const etf = d.securities.find(s => s.group === 'etf'); etf.listingCheck = 'matched'; etf.reviewStatus = 'verified'; a.equal(G.selectKrPilot(d, [etf.code]).krPilotCount, 0);
  a.equal(U.audit(data).verifiedAgainstOfficialListing, 0);
});
test('synthetic 100-symbol load is not real monitoring; US fixed list is exactly five', () => {
  a.deepEqual(G.US_PILOT_SYMBOLS, ['MSFT', 'GOOGL', 'AVGO', 'VRT', 'JPM']); const r = LD.syntheticLoad(100); a.equal(r.evaluated, 100); a.equal(r.actualActiveCount, 0); a.match(r.note, /실제 100종목 감시가 아닙니다/);
});
test('new modules have no network, storage, env, timer, order or filesystem access', () => {
  for (const f of ['rights.js', 'pilot-gate.js', 'pack.js']) { const s = fs.readFileSync(path.join(__dirname, '../kr-radar', f), 'utf8'); a.doesNotMatch(s, /fetch\(|XMLHttpRequest|WebSocket|require\(['"](node:)?(http|https|net|child_process|fs|crypto)['"]\)|localStorage|sessionStorage|indexedDB|process\.env|setTimeout|setInterval|\/orders?\b/i, f); }
});
