'use strict';
// Entirely synthetic pure data. No browser, real storage, transport, keys or writes.
const test = require('node:test'), a = require('node:assert/strict');
const P = require('../has/snapshot-policy.js'), R = require('../has/return-assessment.js');
const NOW = Date.parse('2026-11-10T03:00:00Z'), DAY = 86400000, START = NOW - DAY;
const clone = x => JSON.parse(JSON.stringify(x));
function snap({ ts = NOW, quantity = 10, price = 100, avgPrice = 80, id = 1, ticker = 'SYNTH', account = 'gen', extra = [], fx = 1400 } = {}) {
  const stocks = [{ id, ticker, quantity, currentPrice: price, avgPrice }, ...extra], prefix = account === 'ov' ? 'US:' : 'KR:';
  const freshPrice = {}, quoteMeta = { FX: ts - 1 }, quoteValues = { FX: fx };
  stocks.forEach(s => { freshPrice[prefix + s.ticker] = true; quoteMeta[prefix + s.ticker] = ts - 1; quoteValues[prefix + s.ticker] = s.currentPrice; });
  const result = P.evaluate({ key: account, now: ts, accounts: { [account]: stocks }, freshPrice, quoteMeta, quoteValues, fx });
  a.equal(result.ok, true); return result.snapshot;
}
function input(extra = {}) { return { key: 'gen', records: [snap({ ts: START })], targetTs: START, endTs: NOW, currentCandidate: snap({ price: 110 }), flows: [], ...extra }; }
function flow(extra = {}) { return { activityVersion: 1, id: 'flow-1', account: 'gen', kind: 'external-in', ts: START + DAY / 2, amount: 500, currency: 'KRW', recordedAt: new Date(NOW).toISOString(), timeCertainty: 'instant', ...extra }; }
function shape(c) { return c ? { ticker: c.ticker, quantity: c.quantity, currency: c.currency, unit: c.unit } : null; }
function evidence(before, after, extra = {}) {
  const id = c => `${c.account}:id:${c.stockId}`, old = new Map(before.components.map(c => [id(c), c])), next = new Map(after.components.map(c => [id(c), c]));
  const changes = [...new Set([...old.keys(), ...next.keys()])].map(componentId => ({ componentId, before: shape(old.get(componentId)), after: shape(next.get(componentId)) })).filter(c => JSON.stringify(c.before) !== JSON.stringify(c.after));
  return { version: 1, id: 'event-1', account: 'gen', kind: 'internal-trade', fromTs: before.ts, toTs: after.ts, effectiveTs: before.ts + (after.ts - before.ts) / 2, recordedAt: after.recordedAt, timeCertainty: 'instant', source: 'user-entered', changes, flowIds: [], externalAmount: 0, cashIncluded: true, ...extra };
}
function benchmark(extra = {}) { return { valuePct: 4, fromTs: START, toTs: NOW, currency: 'KRW', status: 'unverified', ...extra }; }
const approximate = (v, want) => a.ok(Math.abs(v - want) < 1e-10, `${v} != ${want}`);

test('actual saved start includes intervening capital: requested boundary 50%, actual interval 0%', () => {
  const before = snap({ ts: NOW - 10 * DAY }), after = snap({ quantity: 15 }), deposit = flow({ ts: NOW - 8 * DAY });
  const event = evidence(before, after, { kind: 'external-flow', effectiveTs: deposit.ts, flowIds: [deposit.id], externalAmount: 500 });
  const r = R.assess(input({ records: [before], currentCandidate: after, targetTs: NOW - 7 * DAY, flows: [deposit], evidence: [event] }));
  approximate(R.modifiedDietz({ key: 'gen', startTs: NOW - 7 * DAY, endTs: NOW, startVal: 1000, endVal: 1500, flows: [deposit] }).valuePct, 50);
  a.equal(r.interval.fromTs, before.ts); a.equal(r.interval.toTs, after.ts); a.equal(r.interval.actualDays, 10); a.equal(r.interval.startEarlierThanRequested, true);
  a.equal(r.raw.valuePct, 50); a.equal(r.dietz.valuePct, 0); a.equal(r.dietz.status, 'unverified'); a.equal(r.scope.transitions[0].explained, true);
});
test('one stored row plus complete current candidate counts as two endpoints', () => {
  const r = R.assess(input()); a.equal(r.raw.valuePct, 10); a.equal(r.dietz.valuePct, 10); a.equal(r.interval.endpoint, 'current-candidate'); a.notEqual(r.dietz.status, 'hold');
});
test('historical read selects both actual saved boundaries and reports the lag', () => {
  const r = R.assess({ key: 'gen', records: [snap({ ts: START }), snap({ ts: NOW - 1000, price: 110 })], targetTs: START + 100, endTs: NOW });
  a.equal(r.raw.valuePct, 10); a.equal(r.interval.fromTs, START); a.equal(r.interval.toTs, NOW - 1000); a.equal(r.interval.endEarlierThanRequested, true);
});
test('legacy missing cost/provenance is calculable with warnings, never backfilled', () => {
  const row = { ts: START, val: 1000, note: { original: true } }, before = JSON.stringify(row);
  const r = R.assess(input({ records: [row], flows: [{ ts: START + DAY / 2, amount: 100 }] }));
  a.equal(r.raw.valuePct, 10); a.equal(r.dietz.valuePct, 0); a.equal(r.dietz.status, 'unverified');
  a.ok(r.dietz.warnings.includes('legacy-provenance-unverified')); a.ok(r.dietz.warnings.includes('legacy-flow-classification-unverified')); a.ok(r.raw.warnings.includes('historical-cost-unavailable'));
  a.equal(JSON.stringify(row), before); a.equal(Object.hasOwn(row, 'cost'), false);
});
test('scope marker at starting snapshot does not contaminate a wholly post-event interval', () => {
  const pre = snap({ ts: START - DAY }), first = snap({ ts: START, quantity: 20 });
  const rows = P.appendDaily([pre], first).records, current = snap({ quantity: 20, price: 105 });
  a.equal(rows[1].comparisonHold, true);
  const r = R.assess(input({ records: rows, currentCandidate: current }));
  a.equal(r.raw.valuePct, 5); a.equal(r.dietz.valuePct, 5); a.notEqual(r.dietz.status, 'hold');
});
test('cost-only correction and its inherited marker do not block raw or Dietz', () => {
  const first = snap({ ts: START }), correction = snap({ ts: START + DAY / 2, avgPrice: 90 });
  const rows = P.appendDaily([first], correction).records;
  const r = R.assess(input({ records: rows, currentCandidate: snap({ avgPrice: 90 }) }));
  a.equal(r.raw.valuePct, 0); a.equal(r.dietz.valuePct, 0); a.notEqual(r.dietz.status, 'hold'); a.ok(r.dietz.warnings.includes('cost-basis-change-only'));
});
test('same-day revision evidence is used but source history remains byte-for-byte unchanged', () => {
  const first = snap({ ts: START, price: 670, quantity: 1 }), second = snap({ ts: START + 1000, price: 672.5, quantity: 1 });
  const rows = P.appendDaily([first], second).records, bytes = JSON.stringify(rows);
  const r = R.assess(input({ records: rows, targetTs: second.ts, currentCandidate: snap({ price: 680, quantity: 1 }) }));
  approximate(r.raw.valuePct, (680 / 672.5 - 1) * 100); a.equal(JSON.stringify(rows), bytes);
});
test('explicit complete rebalance evidence permits an unverified return, never certified account return', () => {
  const first = snap({ ts: START }), current = snap({ id: 2, ticker: 'REPLACEMENT' }), event = evidence(first, current);
  const r = R.assess(input({ records: [first], currentCandidate: current, evidence: [event] }));
  a.equal(r.dietz.valuePct, 0); a.equal(r.dietz.status, 'unverified'); a.equal(r.scope.transitions[0].explained, true);
  a.ok(r.dietz.warnings.includes('user-declared-transition-unverified')); a.ok(r.dietz.warnings.includes('tracked-assets-only-cash-coverage-unverified'));
});
test('unexplained tracked-asset removal has an unverified estimate, not certified performance', () => {
  const first = snap({ ts: START, extra: [{ id: 2, ticker: 'REMOVED', quantity: 10, avgPrice: 80, currentPrice: 100 }] });
  const r = R.assess(input({ records: [first], currentCandidate: snap() }));
  a.equal(r.raw.valuePct, -50); a.notEqual(r.raw.status, 'hold'); a.equal(r.dietz.status, 'unverified'); a.equal(r.dietz.computable, true); a.equal(r.dietz.valuePct, -50); a.ok(r.dietz.warnings.includes('unexplained-holdings-change')); a.equal(r.scope.transitions[0].explained, false);
});
test('nearby capital and internal-buy labels cannot explain unrelated removal or rebalance', () => {
  const first = snap({ ts: START }), current = snap({ id: 2, ticker: 'NEW' });
  for (const f of [flow(), flow({ kind: 'internal-buy' }), { ts: NOW - 1, amount: 500 }]) {
    const r = R.assess(input({ records: [first], currentCandidate: current, flows: [f] })); a.equal(r.dietz.status, 'unverified'); a.ok(r.dietz.warnings.includes('unexplained-holdings-change')); a.equal(r.scope.transitions[0].explained, false);
  }
});
for (const [name, change] of [
  ['cash not included', e => { e.cashIncluded = false; }], ['incomplete component link', e => { e.changes.pop(); }],
  ['tracking exclusion', e => { e.kind = 'tracking-change'; }],
  ['uncategorized transition', e => { e.kind = 'unclassified'; }], ['different quantity', e => { e.changes[1].after.quantity++; }]
]) test('matching evidence is not inferred: ' + name, () => {
  const first = snap({ ts: START }), current = snap({ id: 2, ticker: 'NEW' }), event = evidence(first, current); change(event);
  const r = R.assess(input({ records: [first], currentCandidate: current, evidence: [event] })); a.equal(r.dietz.status, 'hold'); a.notEqual(r.raw.status, 'hold');
});
test('other-account evidence does not explain this account transition', () => {
  const first = snap({ ts: START }), current = snap({ id: 2, ticker: 'NEW' }), event = evidence(first, current);
  event.account = 'dom'; event.changes.forEach(c => { c.componentId = c.componentId.replace('gen:', 'dom:'); });
  a.equal(R.validateEvidence([event]).ok, true); const r = R.assess(input({ records: [first], currentCandidate: current, evidence: [event] })); a.equal(r.dietz.status, 'unverified'); a.equal(r.scope.transitions[0].explained, false);
});
test('linked external-flow evidence requires stable ID, exact instant, account and amount', () => {
  const first = snap({ ts: START }), current = snap({ quantity: 15 }), deposit = flow();
  const event = evidence(first, current, { kind: 'external-flow', flowIds: [deposit.id], externalAmount: 500 });
  for (const bad of [{ ...event, flowIds: ['missing'] }, { ...event, externalAmount: 499 }, { ...event, effectiveTs: event.effectiveTs + 1 }]) {
    a.equal(R.assess(input({ records: [first], currentCandidate: current, flows: [deposit], evidence: [bad] })).dietz.status, 'hold');
  }
  a.equal(R.assess(input({ records: [first], currentCandidate: current, flows: [deposit], evidence: [event] })).dietz.valuePct, 0);
});
test('internal purchases and sales are never subtracted as external capital', () => {
  for (const kind of ['internal-buy', 'internal-sell']) {
    const r = R.assess(input({ flows: [flow({ kind, amount: 900 })] })); a.equal(r.dietz.valuePct, 10); a.equal(r.dietz.netFlow, 0);
  }
});
test('external withdrawals are signed and endpoint flows follow (start,end] convention', () => {
  const fn = flows => R.modifiedDietz({ key: 'gen', startTs: START, endTs: NOW, startVal: 1000, endVal: 500, flows });
  a.equal(fn([flow({ kind: 'external-out' })]).valuePct, 0);
  a.equal(fn([flow({ kind: 'external-out', ts: NOW })]).valuePct, 0);
  a.equal(fn([flow({ kind: 'external-out', ts: START })]).valuePct, -50);
});
test('legacy signed withdrawal remains as recorded and carries classification warning', () => {
  const flows = [{ ts: START + DAY / 2, amount: -500 }], before = JSON.stringify(flows);
  const r = R.modifiedDietz({ key: 'gen', startTs: START, endTs: NOW, startVal: 1000, endVal: 500, flows });
  a.equal(r.valuePct, 0); a.equal(r.status, 'unverified'); a.equal(JSON.stringify(flows), before);
});
test('date-only external flow is not silently weighted at an invented instant', () => {
  const f = flow({ ts: Date.parse('2026-11-09T12:00:00Z'), timeCertainty: 'date-only', effectiveDate: '2026-11-09', utcOffsetMinutes: 0 });
  const r = R.assess(input({ flows: [f] })); a.equal(r.dietz.status, 'hold'); a.equal(r.dietz.computable, false); a.ok(r.dietz.reasons.includes('flow-time-uncertain')); a.equal(r.raw.valuePct, 10);
});
test('date uncertainty that straddles a boundary holds even when nominal timestamp lies outside', () => {
  const f = flow({ ts: Date.parse('2026-11-09T00:00:00Z'), timeCertainty: 'date-only', effectiveDate: '2026-11-09', utcOffsetMinutes: 0 });
  a.equal(f.ts < START, true); a.ok(R.assess(input({ flows: [f] })).dietz.reasons.includes('flow-time-uncertain'));
});
test('date-only external day wholly before interval does not contaminate it, and internal date-only is not capital', () => {
  const old = flow({ ts: START - DAY, timeCertainty: 'date-only', effectiveDate: '2026-11-08', utcOffsetMinutes: 0, dateEndTs: Date.parse('2026-11-09T00:00:00Z'), endUtcOffsetMinutes: 0 });
  a.equal(R.assess(input({ flows: [old] })).dietz.valuePct, 10);
  const internal = flow({ kind: 'internal-buy', timeCertainty: 'date-only', effectiveDate: '2026-11-09', utcOffsetMinutes: 0 });
  a.equal(R.assess(input({ flows: [internal] })).dietz.valuePct, 10);
});
test('benchmark failure cannot hide raw or Dietz', () => {
  for (const b of [null, benchmark({ status: 'hold', valuePct: null, reasons: ['date-conflict'] }), { valuePct: 4 }, benchmark({ valuePct: Infinity })]) {
    const r = R.assess(input({ benchmark: b })); a.equal(r.raw.valuePct, 10); a.equal(r.dietz.valuePct, 10); a.notEqual(r.dietz.status, 'hold'); a.equal(r.benchmark.status, 'hold'); a.equal(r.alpha.status, 'hold');
  }
});
test('alpha uses exactly the actual selected interval and percentage-point subtraction', () => {
  const r = R.assess(input({ targetTs: START + 1000, benchmark: benchmark() })); a.equal(r.alpha.valuePct, 6); a.equal(r.alpha.status, 'unverified');
  const wrong = R.assess(input({ targetTs: START + 1000, benchmark: benchmark({ fromTs: START + 1000 }) })); a.equal(wrong.alpha.status, 'hold'); a.ok(wrong.alpha.reasons.includes('benchmark-interval-mismatch')); a.equal(wrong.dietz.valuePct, 10);
});
test('USD/mixed benchmark remains visible but is not comparable KRW alpha', () => {
  for (const currency of ['USD', 'mixed']) {
    const r = R.assess(input({ benchmark: benchmark({ currency }) })); a.equal(r.benchmark.valuePct, 4); a.notEqual(r.benchmark.status, 'hold'); a.equal(r.alpha.status, 'hold'); a.ok(r.alpha.reasons.includes('benchmark-currency-mismatch'));
  }
});
test('caller cannot certify benchmark finality or independent reconciliation by status flag', () => {
  const r = R.assess(input({ benchmark: benchmark({ status: 'available' }) })); a.equal(r.benchmark.status, 'unverified'); a.ok(r.benchmark.warnings.includes('benchmark-input-unverified'));
  a.equal(R.assess(input({ benchmark: { ...benchmark(), finality: 'confirmed' } })).benchmark.status, 'hold');
});
for (const [name, mutation] of [
  ['missing components', s => { delete s.components; }], ['cost corruption', s => { s.cost++; }], ['aggregate mismatch', s => { s.val++; }],
  ['missing FX', s => { s.components[0].account = 'ov'; }], ['future receipt', s => { s.components[0].receivedAt = new Date(NOW + 1).toISOString(); }],
  ['unbounded price', s => { s.components[0].price = Infinity; }], ['partial legacy metadata', s => { delete s.schemaVersion; }]
]) test('invalid complete current remains hold: ' + name, () => {
  const current = snap(); mutation(current); const r = R.assess(input({ currentCandidate: current })); a.equal(r.raw.status, 'hold'); a.ok(r.raw.reasons.includes('invalid-current'));
});
test('explicit missing current never falls back to stale stored total', () => {
  const r = R.assess(input({ records: [snap({ ts: START }), snap()], currentCandidate: null })); a.equal(r.raw.status, 'hold'); a.ok(r.raw.reasons.includes('current-incomplete'));
});
test('old candidate does not masquerade as current at a newer end timestamp', () => {
  const r = R.assess(input({ currentCandidate: snap({ ts: NOW - 1 }) })); a.ok(r.raw.reasons.includes('current-time-mismatch'));
});
test('known historical source time cannot disappear in a later current candidate', () => {
  const first = snap({ ts: START }); first.priceAsOf = new Date(START - 10).toISOString(); first.components[0].priceAsOf = first.priceAsOf;
  a.equal(P.validateRecord(first).ok, true); a.ok(R.assess(input({ records: [first] })).raw.reasons.includes('current-price-time-regression'));
});
test('no interval is fabricated from a single same-time observation', () => {
  const r = R.assess(input({ records: [snap()], targetTs: NOW, currentCandidate: snap() })); a.ok(r.raw.reasons.includes('insufficient-history'));
});
test('duplicate history and changed same-time endpoint hold instead of silently choosing one', () => {
  a.ok(R.assess(input({ records: [snap({ ts: START }), snap({ ts: START })] })).raw.reasons.includes('invalid-history'));
  a.ok(R.assess(input({ records: [snap({ ts: START }), snap()] })).raw.reasons.includes('ambiguous-current-endpoint'));
});
test('identical saved/current endpoint is counted only once and does not require extra saved points', () => {
  const r = R.assess(input({ records: [snap({ ts: START }), snap({ price: 110 })] })); a.equal(r.raw.valuePct, 10); a.notEqual(r.dietz.status, 'hold');
});
test('malformed outside-range history is still invalid without altering or deleting it', () => {
  const rows = [{ ts: START - DAY, val: 12, schemaVersion: 1 }, snap({ ts: START })], before = JSON.stringify(rows);
  a.ok(R.assess(input({ records: rows })).raw.reasons.includes('invalid-history')); a.equal(JSON.stringify(rows), before);
});
test('zero start cannot form a percent; zero historical end can show -100 percent', () => {
  a.equal(R.assess(input({ records: [{ ts: START, val: 0 }] })).raw.status, 'hold');
  const r = R.assess({ key: 'gen', records: [{ ts: START, val: 1000 }, { ts: NOW, val: 0 }], targetTs: START, endTs: NOW, flows: [] });
  a.equal(r.raw.valuePct, -100); a.equal(r.dietz.valuePct, -100);
});
for (const [name, rows] of [
  ['legacy NaN', [{ ts: START + 1, amount: NaN }]], ['string amount', [{ ts: START + 1, amount: '500' }]], ['zero capital', [{ ts: START + 1, amount: 0 }]],
  ['typed negative', [flow({ amount: -1 })]], ['wrong account', [flow({ account: 'ov' })]], ['missing kind', [{ ...flow(), kind: undefined }]],
  ['duplicate legacy', [{ ts: START + 1, amount: 500 }, { ts: START + 1, amount: 500 }]], ['duplicate ID', [flow(), flow({ ts: START + 1 })]],
  ['ambiguous double capital', [flow(), flow({ id: 'flow-2' })]], ['unknown typed field', [{ ...flow(), reconciled: true }]],
  ['date without zone', [flow({ timeCertainty: 'date-only', effectiveDate: '2026-11-09' })]], ['invalid date', [flow({ timeCertainty: 'date-only', effectiveDate: '2026-02-30', utcOffsetMinutes: 0 })]]
]) test('malformed flow holds only flow-derived metrics: ' + name, () => {
  const r = R.assess(input({ flows: rows })); a.equal(r.raw.valuePct, 10); a.notEqual(r.raw.status, 'hold'); a.equal(r.dietz.status, 'hold'); a.equal(r.alpha.status, 'hold');
});
test('different accounts can have identical legitimate deposits without being collapsed', () => {
  a.equal(R.validateFlows([flow(), flow({ id: 'flow-2', account: 'dom' })], 'all').ok, true);
});
test('bounded finite arithmetic refuses huge net sums, percent overflow and nonpositive capital', () => {
  const args = { key: 'gen', startTs: START, endTs: NOW, startVal: 1000, endVal: 1100 };
  a.ok(R.modifiedDietz({ ...args, flows: [{ ts: START + 1, amount: R.MAX_TOTAL }, { ts: START + 2, amount: R.MAX_TOTAL }] }).reasons.includes('calculation-overflow'));
  a.ok(R.modifiedDietz({ ...args, startVal: Number.MIN_VALUE, flows: [] }).reasons.includes('calculation-overflow'));
  a.ok(R.modifiedDietz({ ...args, flows: [{ ts: START + 1, amount: -2000 }] }).reasons.includes('nonpositive-dietz-capital'));
});
test('accessors, sparse arrays, cycles and resource overflow are refused without evaluating getters', () => {
  let called = 0; const f = flow(); Object.defineProperty(f, 'amount', { enumerable: true, get() { called++; return 1; } });
  a.equal(R.assess(input({ flows: [f] })).dietz.status, 'hold');
  const row = snap({ ts: START }); Object.defineProperty(row, 'val', { enumerable: true, get() { called++; return 1; } });
  a.equal(R.assess(input({ records: [row] })).raw.status, 'hold');
  const b = benchmark(); Object.defineProperty(b, 'valuePct', { enumerable: true, get() { called++; return 4; } });
  a.equal(R.assess(input({ benchmark: b })).benchmark.status, 'hold');
  const top = input(); Object.defineProperty(top, 'records', { get() { called++; return []; } }); a.equal(R.assess(top).raw.status, 'hold');
  a.equal(called, 0); a.equal(R.validateFlows(Array(2), 'gen').ok, false);
  const cycle = flow(); cycle.extra = cycle; a.equal(R.validateFlows([cycle], 'gen').ok, false);
  a.equal(R.validateFlows(Array(R.MAX_ROWS + 1).fill(flow()), 'gen').code, 'resource-limit');
});
test('valid assessment is deterministic and never mutates any caller evidence or rows', () => {
  const first = snap({ ts: START }), current = snap({ id: 2, ticker: 'NEW' });
  const arg = input({ records: [first], currentCandidate: current, evidence: [evidence(first, current)], flows: [flow({ kind: 'internal-buy' })], benchmark: benchmark() });
  const before = JSON.stringify(arg), one = R.assess(arg), two = R.assess(arg); a.deepEqual(one, two); a.equal(JSON.stringify(arg), before);
});
test('module has no persistence or transport dependencies', () => {
  const fs = require('node:fs'), source = fs.readFileSync(require.resolve('../has/return-assessment.js'), 'utf8');
  a.equal(/\b(?:localStorage|sessionStorage|fetch|XMLHttpRequest|WebSocket)\b/.test(source), false);
  a.deepEqual([...source.matchAll(/require\(([^)]+)\)/g)].map(m => m[1]), ["'./snapshot-policy.js'"]);
});

test('dedicated flow schema marker preserves old inert metadata rather than silently reclassifying it', () => {
  const old = { ts: START + DAY / 2, amount: 100, version: 9, id: 'old-note', kind: 'internal-buy', currency: 'USD', account: 'old-inert-text', recordedAt: 'old-note' }, before = JSON.stringify(old);
  const checked = R.validateFlows([old], 'gen'); a.equal(checked.ok, true); a.equal(checked.flows[0].legacy, true); a.equal(checked.flows[0].signedAmount, 100);
  const result = R.assess(input({ flows: [old] })); a.equal(result.dietz.valuePct, 0); a.equal(result.dietz.status, 'unverified'); a.equal(JSON.stringify(old), before);
  for (const activityVersion of [undefined, null, 0, 2]) a.equal(R.validateFlows([{ ...old, activityVersion }], 'gen').ok, false);
});
test('preserved daily observations can be selected before the active daily revision', () => {
  const first = snap({ ts: START }), later = snap({ ts: START + 1000, price: 105 });
  const rows = P.appendDaily([first], later).records, before = JSON.stringify(rows);
  a.equal(rows[0].ts, later.ts);
  const r = R.assess(input({ records: rows, targetTs: START })); a.equal(r.interval.fromTs, START); a.equal(r.raw.valuePct, 10); a.equal(JSON.stringify(rows), before);
  const historical = R.assess({ key: 'gen', records: [snap({ ts: START - DAY }), ...rows], targetTs: START - DAY, endTs: START });
  a.equal(historical.interval.toTs, START); a.equal(historical.raw.valuePct, 0);
});
test('latest preserved revision at identical recording time is selected without fabricated elapsed time', () => {
  const first = snap({ ts: START }), changed = snap({ ts: START, price: 105 });
  const rows = P.appendDaily([first], changed).records;
  const r = R.assess(input({ records: rows, targetTs: START })); approximate(r.raw.valuePct, (1100 / 1050 - 1) * 100); a.equal(r.interval.startValue, 1050);
  const zero = R.assess({ key: 'gen', records: rows, targetTs: START, endTs: START }); a.equal(zero.raw.status, 'hold');
});
test('a zero-length requested interval does not silently select an earlier start', () => {
  const r = R.assess(input({ records: [snap({ ts: START }), snap({ price: 110 })], targetTs: NOW })); a.equal(r.raw.status, 'hold');
});
test('applyBenchmark reuses assessment and cannot mutate or certify it', () => {
  const base = R.assess(input()), original = JSON.stringify(base), r = R.applyBenchmark(base, benchmark({ status: 'available' }));
  a.equal(r.alpha.valuePct, 6); a.equal(r.alpha.status, 'unverified'); a.equal(JSON.stringify(base), original); a.equal(r.signalHold, true); a.equal(r.quality, 'unconfirmed');
  a.equal(R.assess(input({ currentCandidate: null })).signalHold, true); a.equal(R.assess(input({ currentCandidate: null })).quality, 'unconfirmed');
});

test('out-of-band account context distinguishes equal legacy flows without trusting old metadata', () => {
  const rows = [{ ts: START + DAY / 2, amount: 50, account: 'inert-old-note' }, { ts: START + DAY / 2, amount: 50, account: 'inert-old-note' }], before = JSON.stringify(rows);
  const result = R.validateFlows(rows, 'all', ['dom', 'gen']); a.equal(result.ok, true); a.deepEqual(result.flows.map(f => f.account), ['dom', 'gen']);
  const assessed = R.assess(input({ key: 'all', flows: rows, flowAccounts: ['dom', 'gen'] })); a.equal(assessed.dietz.valuePct, 0); a.notEqual(assessed.dietz.status, 'hold'); a.equal(JSON.stringify(rows), before);
  const sameAccount = R.assess(input({ key: 'all', flows: rows, flowAccounts: ['gen', 'gen'] })); a.equal(sameAccount.dietz.status, 'hold'); a.ok(sameAccount.dietz.reasons.includes('duplicate-flow')); a.equal(sameAccount.raw.valuePct, 10);
});
test('flow context cannot be partial, wrong-account, sparse or disagree with a typed declaration', () => {
  for (const contexts of [[], ['all'], ['unknown'], ['gen', 'dom'], null, Array(1)]) a.equal(R.validateFlows([flow()], 'all', contexts).ok, false);
  a.equal(R.validateFlows([flow()], 'all', ['dom']).code, 'flow-account-mismatch');
  a.equal(R.validateFlows([{ ts: START + 1, amount: 10 }], 'gen', ['dom']).code, 'invalid-flow-context');
  a.equal(R.validateFlows([flow()], 'gen', ['gen']).ok, true);
  let invoked = 0; const contexts = []; Object.defineProperty(contexts, '0', { enumerable: true, get() { invoked++; return 'gen'; } });
  a.equal(R.validateFlows([flow()], 'all', contexts).ok, false); a.equal(invoked, 0);
});
test('applyBenchmark accepts only immutable module-issued assessment identity, not copies or mutated claims', () => {
  const base = R.assess(input()); a.equal(Object.isFrozen(base), true); a.equal(Object.isFrozen(base.interval), true); a.equal(Object.isFrozen(base.dietz), true); a.equal(Object.isFrozen(base.dietz.reasons), true);
  a.throws(() => { base.dietz.valuePct = 999; }, TypeError); a.throws(() => { base.interval.fromTs++; }, TypeError);
  a.throws(() => { base.dietz = { valuePct: 999, computable: true, reasons: [], warnings: [], status: 'available' }; }, TypeError);
  for (const forged of [clone(base), { ...base }, Object.assign(Object.create(base), {}), { signalHold: true, interval: null, quality: 'verified' }]) {
    const r = R.applyBenchmark(forged, benchmark()); a.equal(r.alpha.status, 'hold'); a.ok(r.alpha.reasons.includes('invalid-assessment')); a.equal(r.quality, 'unconfirmed');
  }
  const next = R.applyBenchmark(base, benchmark()); a.equal(next.alpha.valuePct, 6); a.equal(R.applyBenchmark(next, benchmark({ valuePct: 5 })).alpha.valuePct, 5);
});

test('explicit next-local-midnight preserves 25-hour DST day including uncertain final hour', () => {
  const row = flow({ ts: Date.parse('2026-11-01T04:00:00Z'), timeCertainty: 'date-only', effectiveDate: '2026-11-01', utcOffsetMinutes: 240, dateEndTs: Date.parse('2026-11-02T05:00:00Z'), endUtcOffsetMinutes: 300 });
  const checked = R.validateFlows([row], 'gen'); a.equal(checked.ok, true); a.equal(checked.flows[0].dateBounds.end - checked.flows[0].dateBounds.start, 25 * 3600000);
  const r = R.modifiedDietz({ key: 'gen', startTs: Date.parse('2026-11-02T04:30:00Z'), endTs: Date.parse('2026-11-02T06:00:00Z'), startVal: 100, endVal: 150, flows: [row] });
  a.equal(r.status, 'hold'); a.ok(r.reasons.includes('flow-time-uncertain')); a.equal(r.valuePct, null);
});
test('explicit next-local-midnight supports 23-hour DST day and exact end exclusion', () => {
  const row = flow({ ts: Date.parse('2026-03-08T05:00:00Z'), timeCertainty: 'date-only', effectiveDate: '2026-03-08', utcOffsetMinutes: 300, dateEndTs: Date.parse('2026-03-09T04:00:00Z'), endUtcOffsetMinutes: 240 });
  const checked = R.validateFlows([row], 'gen'); a.equal(checked.ok, true); a.equal(checked.flows[0].dateBounds.end - checked.flows[0].dateBounds.start, 23 * 3600000);
  const args = { key: 'gen', endTs: Date.parse('2026-03-09T06:00:00Z'), startVal: 100, endVal: 150, flows: [row] };
  a.equal(R.modifiedDietz({ ...args, startTs: Date.parse('2026-03-09T03:30:00Z') }).status, 'hold');
  a.equal(R.modifiedDietz({ ...args, startTs: row.dateEndTs }).valuePct, 50);
});
test('older typed date-only without retained end boundary conservatively covers DST rather than assuming 24 hours', () => {
  const row = flow({ ts: Date.parse('2026-11-01T04:00:00Z'), timeCertainty: 'date-only', effectiveDate: '2026-11-01', utcOffsetMinutes: 240 }), before = JSON.stringify(row);
  const checked = R.validateFlows([row], 'gen'); a.equal(checked.ok, true); a.equal(checked.flows[0].dateBounds.precision, 'conservative-offset-range');
  const r = R.modifiedDietz({ key: 'gen', startTs: Date.parse('2026-11-02T04:30:00Z'), endTs: Date.parse('2026-11-02T06:00:00Z'), startVal: 100, endVal: 150, flows: [row] });
  a.equal(r.status, 'hold'); a.ok(r.reasons.includes('flow-time-uncertain')); a.equal(JSON.stringify(row), before);
});
test('contradictory or partial date boundaries and date fields on precise instants reject', () => {
  const row = flow({ ts: Date.parse('2026-11-01T04:00:00Z'), timeCertainty: 'date-only', effectiveDate: '2026-11-01', utcOffsetMinutes: 240, dateEndTs: Date.parse('2026-11-02T05:00:00Z'), endUtcOffsetMinutes: 300 });
  const noEnd = { ...row }; delete noEnd.dateEndTs;
  const noOffset = { ...row }; delete noOffset.endUtcOffsetMinutes;
  for (const bad of [noEnd, noOffset, { ...row, dateEndTs: row.dateEndTs - 1 }, { ...row, dateEndTs: Date.parse('2026-11-03T05:00:00Z') }, { ...row, endUtcOffsetMinutes: 301 }, { ...row, endUtcOffsetMinutes: 841 }, { ...row, utcOffsetMinutes: 841 }, { ...row, ts: row.dateEndTs }, { ...row, timeCertainty: 'instant' }, flow({ dateEndTs: row.dateEndTs, endUtcOffsetMinutes: 300 })]) {
    a.equal(R.validateFlows([bad], 'gen').ok, false);
  }
  const nonpositive = { ...row, utcOffsetMinutes: 840, endUtcOffsetMinutes: -840, dateEndTs: Date.parse('2026-11-01T10:00:00Z') }; a.equal(R.validateFlows([nonpositive], 'gen').ok, false);
});

test('older date-only uncertainty is explicitly a 52-hour offset envelope, not a claimed local day', () => {
  const row = flow({ ts: Date.parse('2026-11-01T04:00:00Z'), timeCertainty: 'date-only', effectiveDate: '2026-11-01', utcOffsetMinutes: 240 });
  const bounds = R.validateFlows([row], 'gen').flows[0].dateBounds;
  a.equal(bounds.start, Date.parse('2026-10-31T10:00:00Z')); a.equal(bounds.end, Date.parse('2026-11-02T14:00:00Z')); a.equal(bounds.end - bounds.start, 52 * 3600000);
});
test('today date-only can retain future next-midnight bound but never a future declared event', () => {
  const row = flow({ ts: Date.parse('2026-11-10T00:00:00Z'), timeCertainty: 'date-only', effectiveDate: '2026-11-10', utcOffsetMinutes: 0, dateEndTs: Date.parse('2026-11-11T00:00:00Z'), endUtcOffsetMinutes: 0 });
  a.ok(row.dateEndTs > Date.parse(row.recordedAt)); a.equal(R.validateFlows([row], 'gen').ok, true);
  a.equal(R.validateFlows([{ ...row, ts: NOW + 1 }], 'gen').ok, false); a.equal(R.validateFlows([flow({ ts: NOW + 1 })], 'gen').ok, false);
});
