'use strict';
/* 12단계 B: 공통 시세 계약(합성 전용). 미국·한국 공급자 데이터가 들어오기 전 계약과 부정시험을 고정한다. */
const { test } = require('node:test'), a = require('node:assert/strict');
const P = require('../kr-radar/pricefeed.js'), SG = require('../kr-radar/signals.js');
const T = '2026-10-29';
const bar = (o = {}) => ({ symbol: 'MSFT', market: 'US', date: '2026-10-28', session: 'regular', currency: 'USD', timezone: 'America/New_York', open: 100, high: 105, low: 99, close: 103, volume: 1000, adjustment: 'adjusted', adjustedFor: ['split', 'dividend'], provider: 'syn-A', fetchedAt: '2026-10-29', delayMinutes: 0, isSynthetic: true, ...o });
const krBar = (o = {}) => bar({ symbol: 'Z00001', market: 'KR', currency: 'KRW', timezone: 'Asia/Seoul', open: 70000, high: 71000, low: 69500, close: 70500, ...o });
const series = (n, o = {}) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.parse('2025-10-29') + i * 3 * 86400000).toISOString().slice(0, 10); return bar({ date: d, high: 100 + (i % 17), close: 99 + (i % 17), low: 90, open: 95, ...o }); }).filter(b => b.date <= '2026-10-29');

test('valid US and KR bars pass; currency/timezone are market-bound', () => {
  a.equal(P.validateBar(bar(), { today: T }).ok, true); a.equal(P.validateBar(krBar(), { today: T }).ok, true);
  a.equal(P.validateBar(bar({ currency: 'KRW' }), { today: T }).ok, false); a.equal(P.validateBar(krBar({ timezone: 'America/New_York' }), { today: T }).ok, false);
});
test('real (non-synthetic) data, missing provenance, bad OHLC, wrong session and future dates are rejected', () => {
  for (const o of [{ isSynthetic: false }, { provider: '' }, { fetchedAt: 'x' }, { delayMinutes: -1 }, { high: 90 }, { low: 120 }, { close: 0 }, { open: NaN }, { session: 'pre' }, { session: 'after' }, { date: '2026-12-01' }, { market: 'JP' }, { symbol: '' }, { volume: -1 }, { adjustment: 'maybe' }, { adjustedFor: [] }, { adjustedFor: ['dividend'] }]) a.equal(P.validateBar(bar(o), { today: T }).ok, false, JSON.stringify(o));
  a.equal(P.validateBar(null).state, 'DATA_UNAVAILABLE'); a.equal(P.validateBar(bar({ adjustment: 'unadjusted', adjustedFor: [] }), { today: T }).ok, true);
});
test('stale or missing price -> DATA_UNAVAILABLE (not a signal input)', () => {
  const s = P.validateBar(bar({ date: '2026-10-20' }), { today: T }); a.equal(s.ok, false); a.equal(s.state, 'DATA_UNAVAILABLE'); a.match(s.errors[0], /오래된/);
  a.equal(P.validateBar(undefined, { today: T }).state, 'DATA_UNAVAILABLE');
});
test('two providers: agreement, 0.5% conflict -> HOLD, basis/currency/date mismatch -> HOLD, same provider is not independent', () => {
  a.equal(P.reconcile(bar(), bar({ provider: 'syn-B', close: 103.2 }), { today: T }).ok, true);
  const c = P.reconcile(bar(), bar({ provider: 'syn-B', close: 104 }), { today: T }); a.equal(c.ok, false); a.equal(c.state, 'SOURCE_CONFLICT'); a.equal(c.decision, 'HOLD');
  a.equal(P.reconcile(bar(), bar({ provider: 'syn-B', adjustment: 'unadjusted', adjustedFor: [] }), { today: T }).state, 'BASIS_MISMATCH');
  a.equal(P.reconcile(bar(), bar({ provider: 'syn-B', date: '2026-10-27' }), { today: T }).state, 'BASIS_MISMATCH');
  a.equal(P.reconcile(bar(), bar(), { today: T }).state, 'NOT_INDEPENDENT'); a.equal(P.reconcile(bar(), bar({ provider: 'syn-B', date: '2026-10-10' }), { today: T }).state, 'DATA_UNAVAILABLE');
});
test('52-week high: same basis required, enough history, no gaps, split+unadjusted refused', () => {
  const ok = P.high52w({ bars: series(125), asOf: '2026-10-28' }); a.equal(ok.ok, true); a.equal(ok.basis, 'adjusted'); a.ok(ok.high >= 100);
  a.equal(P.high52w({ bars: series(40), asOf: '2026-10-28' }).state, 'DATA_UNAVAILABLE', '이력 부족');
  const mixed = series(125); mixed[60] = { ...mixed[60], adjustment: 'unadjusted', adjustedFor: [] }; a.equal(P.high52w({ bars: mixed, asOf: '2026-10-28' }).state, 'BASIS_MISMATCH');
  const mixedProv = series(125); mixedProv[10] = { ...mixedProv[10], provider: 'syn-B' }; a.equal(P.high52w({ bars: mixedProv, asOf: '2026-10-28' }).reason, '구간 내 공급자 혼합');
  const gap = series(125).filter((_, i) => i < 50 || i > 70); a.match(P.high52w({ bars: gap, asOf: '2026-10-28' }).reason, /공백/);
  const un = series(125, { adjustment: 'unadjusted', adjustedFor: [] }); a.equal(P.high52w({ bars: un, asOf: '2026-10-28', corporateActions: [{ type: 'split', date: '2026-03-01', ratio: 4 }] }).state, 'BASIS_MISMATCH');
  const u2 = P.high52w({ bars: un, asOf: '2026-10-28', corporateActions: [{ type: 'dividend', date: '2026-03-01' }] }); a.equal(u2.ok, true); a.match(u2.dividendNote, /배당 미반영/);
  a.equal(P.high52w({ bars: [], asOf: '2026-10-28' }).ok, false); a.equal(P.high52w({ bars: series(125), asOf: 'x' }).ok, false);
});
test('52-week high feeds the existing drawdown calculation without mixing it with relative return', () => {
  const h = P.high52w({ bars: series(125), asOf: '2026-10-28' }), d = SG.drawdown52w({ close: 80, high52w: h.high, highDate: h.highDate, asOf: '2026-10-28' });
  a.equal(d.ok, true); a.ok(d.pct < 0); const rep = SG.report({ stock: { close: 80, high52w: h.high, highDate: h.highDate, asOf: '2026-10-28' }, bench: { close: 95, high52w: 100, highDate: '2026-06-01', asOf: '2026-10-28' }, stockWindow: { start: '2026-07-29', end: '2026-10-28', returnPct: -20, adjustment: 'adjusted', currency: 'USD' }, benchWindow: { start: '2026-07-29', end: '2026-10-28', returnPct: -5, adjustment: 'adjusted', currency: 'USD' } });
  a.equal(rep.combinedScore, null);
});
test('decision: always HOLD under the stage policy; blockers are named; candidate only appears when every gate passes', () => {
  const d1 = P.decide({ requiresIdentity: true, identityState: 'PENDING', priceState: 'OK', buy: true }); a.equal(d1.decision, 'HOLD'); a.equal(d1.candidate, null); a.ok(d1.reasons.includes('IDENTITY_UNVERIFIED'));
  const d2 = P.decide({ requiresIdentity: true, identityState: 'VERIFIED', priceState: 'DATA_UNAVAILABLE', buy: true }); a.equal(d2.candidate, null); a.ok(d2.reasons.includes('DATA_UNAVAILABLE'));
  const d3 = P.decide({ requiresIdentity: true, identityState: 'VERIFIED', priceState: 'OK', buy: true, sell: true }); a.ok(d3.reasons.includes('SIGNAL_CONFLICT')); a.equal(d3.candidate, null);
  const d4 = P.decide({ requiresIdentity: true, identityState: 'VERIFIED', priceState: 'OK', buy: true }); a.equal(d4.candidate, 'BUY'); a.equal(d4.decision, 'HOLD'); a.ok(d4.reasons.includes('ACTIVATION_DISABLED_BY_POLICY')); a.equal(d4.actualActive, false);
  const d5 = P.decide({ requiresIdentity: false, priceState: 'SOURCE_CONFLICT', sell: true }); a.ok(d5.reasons.includes('PRICE_SOURCE_CONFLICT')); a.equal(P.decide().decision, 'HOLD');
});
test('contract constants: 0.5% source tolerance, field list includes provenance fields', () => {
  a.equal(P.MAX_SOURCE_DIFF_PCT, 0.5); for (const f of ['provider', 'fetchedAt', 'session', 'currency', 'adjustment', 'adjustedFor', 'delayMinutes']) a.ok(P.BAR_FIELDS.includes(f), f);
});
