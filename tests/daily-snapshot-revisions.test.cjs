'use strict';
// Pure synthetic snapshots and in-memory backup storage only. No browser or network.
const test = require('node:test'), a = require('node:assert/strict');
const P = require('../has/snapshot-policy.js'), B = require('../backup/core.js');
const NOW = Date.parse('2026-11-10T03:00:00Z'), DAY = 86400000;
const clone = x => JSON.parse(JSON.stringify(x));
function snapshot({ ts = NOW, price = 100, quantity = 2, avgPrice = 80, id = 1, ticker = 'SYNTH', account = 'gen', fx = 1400, extra = [] } = {}) {
  const prefix = account === 'ov' ? 'US:' : 'KR:', stocks = [{ id, ticker, quantity, avgPrice, currentPrice: price }, ...extra];
  const freshPrice = {}, quoteMeta = { FX: ts - 10 }, quoteValues = { FX: fx };
  stocks.forEach(s => { freshPrice[prefix + s.ticker] = true; quoteMeta[prefix + s.ticker] = ts - 10; quoteValues[prefix + s.ticker] = s.currentPrice; });
  const r = P.evaluate({ key: account, now: ts, accounts: { [account]: stocks }, fx, freshPrice, quoteMeta, quoteValues });
  a.equal(r.ok, true); return r.snapshot;
}
function withAsOf(s, time) {
  const out = clone(s); out.components.forEach(c => { c.priceAsOf = time; });
  if (out.fx) out.fx.priceAsOf = time;
  out.priceAsOf = time; return out;
}
function revise(rows, candidate) { const r = P.appendDaily(rows, candidate); a.equal(r.ok, true, JSON.stringify(r)); return r.records; }
function memory(seed = {}) { const m = new Map(Object.entries(seed)); return { get length() { return m.size; }, key: i => [...m.keys()][i] ?? null, getItem: k => m.get(k) ?? null, setItem: (k,v) => m.set(k,String(v)), removeItem: k => m.delete(k), all: () => Object.fromEntries(m) }; }
const seeded = () => memory(Object.fromEntries(B.ACCOUNTS.map(k => [k, '[]'])));
function assertRefuses(rows, candidate, code) { const before = JSON.stringify(rows), next = JSON.stringify(candidate); const r = P.appendDaily(rows, candidate); a.equal(r.ok, false); if (code) a.equal(r.code, code); a.equal(JSON.stringify(rows), before); a.equal(JSON.stringify(candidate), next); }

test('same-day complete update retains old payload verbatim and new active payload with flat provenance', () => {
  const first = snapshot(); first.annotation = { preserve: ['unknown', null], omittedCost: false };
  const second = snapshot({ ts: NOW + 1000, price: 110 }), before = JSON.stringify(first);
  const r = P.appendDaily([first], second); a.equal(r.action, 'revised'); a.equal(r.changed, true); a.equal(r.records.length, 1);
  const row = r.records[0]; a.equal(row.val, 220); a.equal(row.quality, 'unconfirmed'); a.equal(row.signalHold, true);
  a.equal(row.dailyHistory.entries[1].priceTime, 'unknown'); a.equal(row.dailyHistory.entries[1].reason, 'price-change');
  a.equal(JSON.stringify(row.dailyHistory.entries[0].point), before); a.deepEqual(row.dailyHistory.entries[1].point, second);
  a.equal(JSON.stringify(first), before); a.equal(P.validateRecord(row).ok, true);
});
test('multiple revisions never recursively store a wrapper and preserve every prior canonical point', () => {
  const inputs = [snapshot(), snapshot({ ts: NOW + 1000, price: 110 }), snapshot({ ts: NOW + 2000, price: 120 })];
  const rows = inputs.reduce((rs, s) => revise(rs, s), []), entries = rows[0].dailyHistory.entries;
  a.equal(entries.length, 3); entries.forEach((e, i) => { a.deepEqual(e.point, inputs[i]); a.equal(Object.hasOwn(e.point, 'dailyHistory'), false); });
});
test('receipt and recording clocks alone do not duplicate unchanged price evidence, even at the revision cap', () => {
  let rows = [snapshot()];
  for (let i = 1; i <= P.MAX_REVISIONS; i++) rows = revise(rows, snapshot({ ts: NOW + i * 1000, price: 100 + i }));
  const before = JSON.stringify(rows), repeat = P.appendDaily(rows, snapshot({ ts: NOW + 100000, price: 100 + P.MAX_REVISIONS }));
  a.equal(repeat.changed, false); a.equal(repeat.action, 'unchanged'); a.equal(repeat.records, rows); a.equal(JSON.stringify(rows), before);
  assertRefuses(rows, snapshot({ ts: NOW + 101000, price: 1000 }), 'revision-limit');
  a.equal(rows[0].dailyHistory.entries.length, 65);
});
test('same-day legacy upgrade keeps absent cost/unknown fields absent and labels unknown provenance', () => {
  const old = { ts: NOW - 1000, val: 12, note: { keep: true } }, rows = revise([old], snapshot());
  a.deepEqual(rows[0].dailyHistory.entries[0].point, old); a.equal(Object.hasOwn(rows[0].dailyHistory.entries[0].point, 'cost'), false);
  a.equal(rows[0].dailyHistory.entries[1].reason, 'legacy-provenance-unverified'); a.deepEqual(rows[0].scopeChange.types, ['legacy-unknown']);
  a.equal(rows[0].comparisonHold, true); a.equal(Object.hasOwn(old, 'priceAsOf'), false);
});
test('unknown source times remain null and newer receipts never overcome a known source-time regression', () => {
  const old = withAsOf(snapshot(), '2026-11-10T02:00:00Z');
  assertRefuses([old], withAsOf(snapshot({ ts: NOW + 1000, price: 110 }), '2026-11-10T01:00:00Z'), 'price-time-regression');
  assertRefuses([old], snapshot({ ts: NOW + 2000, price: 110 }), 'price-time-regression');
  const row = revise([snapshot()], snapshot({ ts: NOW + 1000, price: 110 }))[0];
  a.equal(row.priceAsOf, null); a.equal(row.components[0].priceAsOf, null); a.equal(row.dailyHistory.entries[1].priceTime, 'unknown');
});
test('a known actual later source time is distinct evidence even when value is unchanged', () => {
  const first = withAsOf(snapshot(), '2026-11-10T01:00:00Z');
  const next = withAsOf(snapshot({ ts: NOW + 1000 }), '2026-11-10T02:00:00Z');
  const row = revise([first], next)[0]; a.equal(row.dailyHistory.entries[1].reason, 'price-time-change'); a.equal(row.dailyHistory.entries[1].priceTime, 'known');
});
test('known FX source time is monotone independently of security source time', () => {
  const first = withAsOf(snapshot({ account: 'ov' }), '2026-11-10T01:00:00Z');
  const next = withAsOf(snapshot({ account: 'ov', ts: NOW + 1000, fx: 1401 }), '2026-11-10T02:00:00Z'); next.fx.priceAsOf = '2026-11-10T00:00:00Z'; next.priceAsOf = next.fx.priceAsOf;
  assertRefuses([first], next, 'price-time-regression');
});
test('holdings removals and quantity changes mark comparison hold on the same or next day', () => {
  const old = snapshot({ extra: [{ id: 2, ticker: 'SECOND', quantity: 1, avgPrice: 10, currentPrice: 20 }] });
  for (const ts of [NOW + 1000, NOW + DAY]) {
    const rows = revise([old], snapshot({ ts })), current = rows[rows.length - 1];
    a.deepEqual(current.scopeChange.types, ['holdings']); a.equal(current.scopeChange.returnComparable, false); a.equal(current.comparisonHold, true);
  }
  const row = revise([snapshot()], snapshot({ ts: NOW + 1000, quantity: 3 }))[0]; a.deepEqual(row.scopeChange.types, ['holdings']);
});
test('scope holds survive later same-day price updates and old local day records remain untouched', () => {
  const first = snapshot({ ts: NOW - DAY }), oldBytes = JSON.stringify(first);
  let rows = revise([first], snapshot({ quantity: 3 })); const marker = clone(rows[1].scopeChange);
  rows = revise(rows, snapshot({ ts: NOW + 1000, quantity: 3, price: 120 }));
  a.deepEqual(rows[1].scopeChange, marker); a.equal(rows[1].comparisonHold, true); a.equal(JSON.stringify(rows[0]), oldBytes);
});
test('component cost evidence distinguishes basis edits from FX-only valuation changes', () => {
  const first = snapshot({ account: 'ov' });
  let row = revise([first], snapshot({ account: 'ov', ts: NOW + 1000, fx: 1500 }))[0]; a.equal(Object.hasOwn(row, 'scopeChange'), false);
  row = revise([first], snapshot({ account: 'ov', ts: NOW + 1000, avgPrice: 81 }))[0]; a.deepEqual(row.scopeChange.types, ['cost-basis']);
  const old = clone(first); delete old.components[0].avgPrice;
  row = revise([old], snapshot({ account: 'ov', ts: NOW + 1000, fx: 1500 }))[0]; a.deepEqual(row.scopeChange.types, ['cost-basis-unknown']);
});
test('new days after legacy history explicitly hold unknown scope instead of inventing past components', () => {
  const old = { ts: NOW - DAY, val: 10 }, rows = revise([old], snapshot());
  a.deepEqual(rows[0], old); a.deepEqual(rows[1].scopeChange.types, ['legacy-unknown']); a.equal(Object.hasOwn(rows[0], 'components'), false);
});
test('comparison helper holds unknown provenance and scope changes, not ordinary valuation movement', () => {
  const first = snapshot({ ts: NOW - DAY }), second = snapshot({ price: 120 });
  a.deepEqual(P.comparisonStatus([first, second], first.ts, second.ts), { hold: false, reasons: [] });
  a.equal(P.comparisonStatus([{ ts: first.ts, val: 1 }, second], first.ts, second.ts).hold, true);
  a.equal(P.comparisonStatus([first, snapshot({ quantity: 3 })], first.ts, second.ts).hold, true);
  a.equal(P.comparisonStatus([first, second], first.ts, second.ts, snapshot({ ts: NOW + 1000, quantity: 3 })).hold, true);
  a.equal(P.comparisonStatus([second], second.ts, second.ts).hold, true);
});
for (const [name, change] of [
  ['missing component evidence', s => { delete s.components; }], ['partial metadata', s => { delete s.recordedAt; }],
  ['empty components', s => { s.components = []; }], ['inconsistent total', s => { s.val++; }],
  ['inconsistent component basis total', s => { s.cost++; }], ['duplicate component', s => { s.components.push(clone(s.components[0])); }],
  ['missing source time null', s => { delete s.components[0].priceAsOf; }], ['future receipt', s => { s.components[0].receivedAt = new Date(s.ts + 1).toISOString(); }],
  ['fabricated aggregate source time', s => { s.priceAsOf = s.recordedAt; }], ['injected revision history', s => { s.dailyHistory = { version: 1, entries: [] }; }],
  ['injected comparison marker', s => { s.comparisonHold = false; }]
]) test('candidate corruption refuses without mutation: ' + name, () => { const s = snapshot({ ts: NOW + 1000 }); change(s); assertRefuses([snapshot()], s, 'candidate-invalid'); });
test('invalid existing provenance is not treated as a legacy record', () => {
  for (const extra of [{ schemaVersion: 1 }, { priceAsOf: null }, { components: [] }, { comparisonHold: true }]) assertRefuses([{ ts: NOW - 1000, val: 100, ...extra }], snapshot(), 'existing-invalid');
});
test('duplicate same-day legacy records and recording clock regression hold every original row', () => {
  assertRefuses([{ ts: NOW - 1000, val: 1 }, { ts: NOW - 500, val: 2 }], snapshot(), 'day-ambiguous');
  assertRefuses([snapshot()], snapshot({ ts: NOW - 1, price: 110 }), 'record-time-regression');
});
test('non-JSON accessors, cycles and resource overflow reject without evaluating getters', () => {
  let invoked = 0; const s = snapshot(); Object.defineProperty(s, 'annotation', { enumerable: true, get() { invoked++; return {}; } });
  a.equal(P.appendDaily([], s).code, 'candidate-invalid'); a.equal(invoked, 0);
  const cycle = snapshot(); cycle.annotation = cycle; a.equal(P.appendDaily([], cycle).ok, false);
  const big = snapshot(); big.annotation = 'x'.repeat(P.MAX_BYTES + 1); a.equal(P.appendDaily([], big).code, 'resource-limit');
  const deep = snapshot(); deep.annotation = {}; let leaf = deep.annotation; for (let i = 0; i < 35; i++) leaf = leaf.next = {};
  a.equal(P.appendDaily([], deep).code, 'resource-limit');
  a.equal(P.appendDaily(Array(P.MAX_RECORDS + 1).fill({ ts: 1, val: 1 }), snapshot()).code, 'resource-limit');
});
test('v6 preserves complete revision metadata, missing fields and omitted groups through synthetic roundtrip', () => {
  const old = { ts: NOW - 1000, val: 12, note: { preserve: true } }; let rows = revise([old], snapshot()); rows = revise(rows, snapshot({ ts: NOW + 1000, price: 120 }));
  const src = seeded(); src.setItem('v5_snap', JSON.stringify({ gen: rows }));
  const backup = B.create(src), dst = seeded(); dst.setItem('v5_snap', JSON.stringify({ dom: [{ ts: 1, val: 2 }] }));
  const plan = B.parse(JSON.stringify(backup)), before = dst.all(); B.preview(dst, plan); a.deepEqual(dst.all(), before); B.apply(dst, plan);
  a.deepEqual(JSON.parse(dst.getItem('v5_snap')), { dom: [{ ts: 1, val: 2 }], gen: rows });
  a.equal(Object.hasOwn(JSON.parse(dst.getItem('v5_snap')).gen[0].dailyHistory.entries[0].point, 'cost'), false);
  a.equal(B.parse(JSON.stringify(B.create(dst))).sourceVersion, 6);
});
for (const [name, mutate] of [
  ['nested history', p => { p.dailyHistory.entries[0].point.dailyHistory = {}; }],
  ['missing original payload', p => { p.dailyHistory.entries.shift(); }],
  ['projection mismatch', p => { p.val++; }],
  ['missing scope marker', p => { delete p.scopeChange; delete p.comparisonHold; delete p.dailyHistory.entries[1].point.scopeChange; delete p.dailyHistory.entries[1].point.comparisonHold; }],
  ['fabricated source-time class', p => { p.dailyHistory.entries[1].priceTime = 'known'; }],
  ['malformed revision reason', p => { p.dailyHistory.entries[1].reason = 'verified-close'; }],
  ['bad local-day offset', p => { p.dailyHistory.entries[1].utcOffsetMinutes = 9999; }]
]) test('backup rejects invalid history before any synthetic mutation: ' + name, () => {
  const p = revise([{ ts: NOW - 1000, val: 1 }], snapshot())[0]; mutate(p); const dst = seeded(), before = dst.all();
  a.throws(() => B.apply(dst, B.parse(JSON.stringify({ version: 'v5', snapshots: { gen: [p] } })))); a.deepEqual(dst.all(), before);
});
test('removing then re-adding a holding cannot bypass its preserved known price time', () => {
  const known = withAsOf(snapshot(), '2026-11-10T02:00:00Z');
  const rows = revise([known], snapshot({ ts: NOW + 1000, id: 2, ticker: 'SECOND' }));
  assertRefuses(rows, snapshot({ ts: NOW + 2000 }), 'price-time-regression');
  assertRefuses(rows, withAsOf(snapshot({ ts: NOW + 2000 }), '2026-11-10T01:00:00Z'), 'price-time-regression');
  const later = revise(rows, withAsOf(snapshot({ ts: NOW + 2000 }), '2026-11-10T02:30:00Z'));
  a.equal(P.validateRecord(later[0]).ok, true);
});
