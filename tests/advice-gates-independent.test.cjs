'use strict';
// Independent, synthetic-only regression matrix. No network, storage, or account data.
const test = require('node:test');
const assert = require('node:assert/strict');
const Q = require('../has/quote-model.js');
const W = require('../has/watch-engine.js');
const A = require('../has/advisor-core.js');
const NOW = '2026-11-08T12:00:00Z';
const quote = (patch = {}) => ({ ticker: 'SYN-ONLY', market: 'US', currency: 'USD', price: 60,
  kind: 'close', asOfDate: '2026-11-08', asOfTime: '2026-11-08T11:59:00Z',
  fetchedAt: NOW, source: 'SYNTHETIC-PRICE', verification: 'independent-verified', synthetic: true, ...patch });
const fundamentals = (patch = {}) => ({ asOfDate: '2026-09-30', source: 'SYNTHETIC-FIN', verification: 'independent-verified',
  revenueGrowthPct: 8, freeCashFlow: 100, freeCashFlowPrev: 90,
  debtToEquity: 0.6, debtToEquityPrev: 0.6, ...patch });
const stock = (patch = {}) => ({ ticker: 'SYN-ONLY', market: 'US', quote: quote(),
  high52w: { price: 100, asOfDate: '2026-11-08', source: 'SYNTHETIC-HIGH' },
  returns: { stockPct: -40, benchPct: -5, periodDays: 20, asOfDate: '2026-11-08', source: 'SYNTHETIC-RETURN' },
  fundamentals: fundamentals(), thesis: { intact: true }, held: null, ...patch });
const ctx = { weightPct: 5, weightBasis: 'verified', cashPct: 20, cashBasis: 'verified' };
const evaluate = s => { const w = W.evaluateStock(s, ctx, NOW); return { w, advice: A.analyze(s, w, ctx, NOW) }; };
const priceSignals = w => w.signals.filter(s => ['drawdown', 'relative-overdrop', 'loss-risk'].includes(s.type));

test('independent: complete synthetic control remains eligible without mutating inputs', () => {
  const s = stock(), before = JSON.stringify(s), { w, advice } = evaluate(s);
  assert.equal(w.dataGate.ok, true); assert.equal(w.fundamentalsStatus, 'ok');
  assert.equal(advice.opinion, '매수 검토'); assert.equal(priceSignals(w).length, 2);
  assert.equal(JSON.stringify(s), before);
});

for (const [label, patch] of [
  ['future date', { asOfDate: '2026-11-09', asOfTime: null }],
  ['future close timestamp', { asOfTime: '2026-11-08T13:00:00Z' }],
  ['future realtime timestamp', { kind: 'realtime', asOfTime: '2026-11-08T13:00:00Z' }],
  ['future delayed timestamp', { kind: 'delayed', asOfTime: '2026-11-08T13:00:00Z' }],
  ['invalid rolled date', { asOfDate: '2026-02-30' }],
  ['invalid rolled timestamp', { kind: 'realtime', asOfTime: '2026-11-31T11:59:00Z' }],
  ['timestamp without timezone', { kind: 'realtime', asOfTime: '2026-11-08T11:59:00' }],
  ['malformed timestamp', { kind: 'realtime', asOfTime: 'not-a-time' }],
  ['zero price', { price: 0 }], ['negative price', { price: -60 }],
  ['nonfinite price', { price: Infinity }], ['string price in direct contract', { price: '60' }],
  ['blank ticker', { ticker: '  ' }], ['invalid market', { market: 'XX' }],
  ['currency/market mismatch', { currency: 'KRW' }], ['blank source', { source: '  ' }],
  ['non-string source', { source: {} }], ['unknown kind', { kind: 'unrecognized' }],
]) test('independent quote gate rejects ' + label, () => {
  assert.equal(Q.usableForSignals(quote(patch), NOW).ok, false);
});

for (const now of ['not-a-time', '2026-11-08T12:00:00', '2026-11-31T12:00:00Z']) {
  test('independent quote gate rejects invalid evaluation clock: ' + now, () => {
    assert.equal(Q.usableForSignals(quote(), now).ok, false);
  });
}

test('independent normalize rejects impossible civil dates rather than Date.parse rollover', () => {
  const n = Q.normalize(quote({ asOfDate: '2026-02-30', asOfTime: '2026-02-30T12:00:00Z' }));
  assert.ok(!n.ok || (n.quote.asOfDate === null && n.quote.asOfTime === null));
});

for (const [label, patch] of [
  ['unverified quote', { verification: 'unverified' }], ['missing source', { source: null }],
  ['stale quote', { asOfDate: '2026-10-20', asOfTime: '2026-10-20T12:00:00Z' }],
]) test('independent failed price gate blocks every price signal: ' + label, () => {
  const { w, advice } = evaluate(stock({ quote: quote(patch) }));
  assert.equal(w.dataGate.ok, false); assert.deepEqual(priceSignals(w), []);
  assert.equal(advice.opinion, '판단 보류');
});

for (const patch of [{ ticker: 'SYN-OTHER' }, { market: 'KR', currency: 'KRW' }]) {
  test('independent stock and quote identity must agree: ' + JSON.stringify(patch), () => {
    const s = stock({ quote: quote(patch) });
    const { w, advice } = evaluate(s);
    assert.equal(w.dataGate.ok, false); assert.deepEqual(priceSignals(w), []);
    assert.equal(advice.opinion, '판단 보류');
    assert.equal(W.activeWatchCount([s], NOW).activeSynthetic, 0);
  });
}

for (const field of ['revenueGrowthPct', 'freeCashFlow', 'freeCashFlowPrev', 'debtToEquity', 'debtToEquityPrev']) {
  test('independent incomplete healthy financials cannot become ok: missing ' + field, () => {
    const f = fundamentals(); delete f[field];
    const { w, advice } = evaluate(stock({ fundamentals: f }));
    assert.notEqual(w.fundamentalsStatus, 'ok'); assert.ok(w.missing.length);
    assert.notEqual(advice.opinion, '매수 검토');
    assert.notEqual(advice.aggressive.stance, '매수 검토');
    assert.notEqual(advice.defensive.stance, '매수 검토');
  });
}

for (const [label, f] of [
  ['metadata only', { asOfDate: '2026-09-30', source: 'SYNTHETIC-FIN', verification: 'independent-verified' }],
  ['one healthy field', { asOfDate: '2026-09-30', source: 'SYNTHETIC-FIN', verification: 'independent-verified', revenueGrowthPct: 8 }],
  ['missing provenance', fundamentals({ source: null })],
  ['blank provenance', fundamentals({ source: '  ' })],
  ['future date', fundamentals({ asOfDate: '2026-11-09' })],
  ['impossible date', fundamentals({ asOfDate: '2026-09-31' })],
]) test('independent unreliable financials block buy review: ' + label, () => {
  const { w, advice } = evaluate(stock({ fundamentals: f }));
  assert.notEqual(w.fundamentalsStatus, 'ok'); assert.ok(w.missing.length);
  assert.notEqual(advice.opinion, '매수 검토');
});

test('independent incomplete data preserves a supported adverse financial warning', () => {
  const f = { asOfDate: '2026-09-30', source: 'SYNTHETIC-FIN', verification: 'independent-verified', revenueGrowthPct: -8 };
  const { w, advice } = evaluate(stock({ fundamentals: f }));
  assert.notEqual(w.fundamentalsStatus, 'ok');
  assert.ok(w.signals.some(s => s.type === 'fundamental-deterioration'));
  assert.ok(w.missing.length); assert.notEqual(advice.opinion, '매수 검토');
});

for (const [label, patch] of [
  ['close timestamp predates declared quote day by years', { asOfTime: '2020-01-01T12:00:00Z' }],
  ['close timestamp belongs to a different market day', { asOfTime: '2026-11-07T12:00:00Z' }],
  ['delayed quote lacks its required timestamp', { kind: 'delayed', asOfTime: null }],
  ['fetch predates the quote it claims to contain', { fetchedAt: '2020-01-01T12:00:00Z' }],
]) test('independent temporal consistency gate rejects: ' + label, () => {
  const q = quote(patch), s = stock({ quote: q });
  assert.equal(Q.usableForSignals(q, NOW).ok, false);
  const { w, advice } = evaluate(s);
  assert.deepEqual(priceSignals(w), []);
  assert.equal(advice.opinion, '판단 보류');
});

test('independent timestamp/date comparison uses the exchange timezone, not UTC text', () => {
  const now = '2026-11-09T02:00:00Z'; // Still Nov 8 in New York.
  const q = quote({ asOfDate: '2026-11-08', asOfTime: '2026-11-09T01:59:00Z', fetchedAt: now });
  assert.equal(Q.usableForSignals(q, now).ok, true);
});
