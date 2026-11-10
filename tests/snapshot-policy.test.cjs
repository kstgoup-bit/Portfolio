'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const P = require('../has/snapshot-policy.js');
const NOW = Date.parse('2026-11-10T12:00:00Z'), DAY = 86400000;
const stock = (extra = {}) => ({ id: 1, name: '합성', ticker: 'SYNTH', quantity: 2, avgPrice: 80, currentPrice: 100, ...extra });
const manual = (extra = {}) => stock({ pricingMode: 'manual', manualPrice: { value: 125, priceAsOf: '2026-11-10T10:00:00Z', currency: 'KRW', unit: 'per-held-unit', maxAgeDays: 1, ...extra } });
const input = (extra = {}) => ({ key: 'gen', now: NOW, accounts: { dom: [], ov: [], pen: [], gen: [stock()] }, freshPrice: { 'KR:SYNTH': true }, quoteMeta: { 'KR:SYNTH': NOW - 1000, FX: NOW - 1000 }, quoteValues: { 'KR:SYNTH': 100, FX: 1400 }, fx: 1400, ...extra });
const evaluateStock = s => P.evaluate(input({ accounts: { gen: [s] } }));
const hasCode = (r, code) => !r.ok && r.missing.some(m => m.code === code);

test('session quote is recorded as unconfirmed; receive time never becomes priceAsOf', () => {
  const r = P.evaluate(input()); assert.equal(r.ok, true); assert.equal(r.snapshot.val, 200); assert.equal(r.snapshot.cost, 160);
  assert.equal(r.snapshot.priceAsOf, null); assert.equal(r.snapshot.components[0].priceAsOf, null);
  assert.equal(r.snapshot.components[0].receivedAt, new Date(NOW - 1000).toISOString());
  assert.equal(r.snapshot.quality, 'unconfirmed'); assert.equal(r.snapshot.signalHold, true);
});
test('explicit instrument manual mode permits a missing quote without fabricating timestamps', () => {
  const r = evaluateStock(manual()); assert.equal(r.ok, true); assert.equal(r.snapshot.val, 250);
  assert.equal(r.snapshot.origin, 'manual-included'); assert.equal(r.snapshot.priceAsOf, '2026-11-10T10:00:00Z');
  assert.equal(r.snapshot.manualComponents[0].priceAsOf, '2026-11-10T10:00:00Z');
  assert.equal(r.snapshot.components[0].receivedAt, null); assert.equal(r.snapshot.quality, 'unconfirmed');
});
test('no ticker special case: other missing instruments still block full/general snapshots', () => {
  const r = P.evaluate(input({ key: 'all', accounts: { dom: [], ov: [], pen: [], gen: [manual(), stock({ id: 2, ticker: 'M04020000' })] } }));
  assert.equal(r.ok, false); assert.deepEqual(r.missing.map(m => [m.account, m.ticker, m.code]), [['gen', 'M04020000', 'quote-missing']]);
});
test('manual metadata alone is not opt-in and cannot bypass missing quotes', () => {
  const s = manual(); delete s.pricingMode;
  assert.ok(hasCode(P.evaluate(input({ accounts: { gen: [s] }, freshPrice: {} })), 'quote-missing'));
});
test('average price is never substituted for a missing current quote', () => {
  assert.ok(hasCode(P.evaluate(input({ accounts: { gen: [stock({ currentPrice: 0 })] }, quoteValues: { 'KR:SYNTH': 0 } })), 'price'));
  assert.ok(hasCode(P.evaluate(input({ freshPrice: {} })), 'quote-missing'));
});
test('invalid/unknown/future/manual timestamps fail closed', () => {
  for (const priceAsOf of ['', null, '2026-11-10', '2026-02-30T00:00:00Z', '2026-11-10T25:00:00Z', '2026-11-10T10:00:00+15:00', '2026-11-11T00:00:00Z']) assert.equal(evaluateStock(manual({ priceAsOf })).ok, false, String(priceAsOf));
});
test('expiry is an explicit bounded KST calendar-date window, not a market freshness claim', () => {
  assert.equal(evaluateStock(manual({ priceAsOf: '2026-11-08T15:00:00Z', maxAgeDays: 1 })).ok, true); // KST Nov 9 -> Nov 10
  assert.ok(hasCode(evaluateStock(manual({ priceAsOf: '2026-11-08T14:59:59Z', maxAgeDays: 1 })), 'manual-stale'));
  for (const maxAgeDays of [undefined, 0, 5, -1, 1.5, '1']) assert.ok(hasCode(evaluateStock(manual({ maxAgeDays })), 'manual-window'));
});
test('manual price requires bounded finite positive number and matching account currency/unit', () => {
  for (const value of [0, -1, Infinity, NaN, 1e13, '125', null]) assert.ok(hasCode(evaluateStock(manual({ value })), 'manual-value'));
  for (const extra of [{ currency: 'USD' }, { currency: 'EUR' }, { unit: 'ounce' }]) assert.ok(hasCode(evaluateStock(manual(extra)), 'manual-unit'));
});
test('quote receipt must bind exact received value and be within 24 hours', () => {
  assert.ok(hasCode(P.evaluate(input({ quoteValues: {} })), 'quote-changed'));
  assert.ok(hasCode(evaluateStock(stock({ currentPrice: 101 })), 'quote-changed'));
  for (const received of [undefined, 0, NOW + 1, NOW - DAY - 1]) assert.ok(hasCode(P.evaluate(input({ quoteMeta: { 'KR:SYNTH': received } })), 'quote-receipt'));
});
test('foreign positive exposure needs actual bound FX; no missing/default fallback', () => {
  const base = input({ key: 'ov', accounts: { ov: [stock()] }, freshPrice: { 'US:SYNTH': true }, quoteMeta: { 'US:SYNTH': NOW - 100, FX: NOW - 100 }, quoteValues: { 'US:SYNTH': 100, FX: 1400 } });
  assert.equal(P.evaluate(base).snapshot.val, 280000);
  for (const fx of [undefined, null, 0, NaN, Infinity, 1370, '1400']) assert.ok(hasCode(P.evaluate({ ...base, fx }), 'fx'));
  assert.ok(hasCode(P.evaluate({ ...base, quoteMeta: { 'US:SYNTH': NOW - 100 } }), 'fx'));
});
test('empty overseas accounts do not require FX; cash retains unknown asOf', () => {
  const r = P.evaluate(input({ key: 'all', fx: null, accounts: { dom: [], pen: [], ov: [], gen: [stock({ ticker: 'DEP_GEN', quantity: 1 })] } }));
  assert.equal(r.ok, true); assert.equal(r.snapshot.val, 100); assert.equal(r.snapshot.origin, 'entered-balance'); assert.equal(r.snapshot.priceAsOf, null); assert.equal(r.snapshot.fx, null);
  assert.ok(hasCode(P.evaluate(input({ accounts: { gen: [] } })), 'empty'));
});
test('bad quantity/cost/mode and overflow do not produce partial snapshots', () => {
  for (const quantity of [-1, Infinity, '2']) assert.ok(hasCode(evaluateStock(stock({ quantity })), 'quantity'));
  assert.ok(hasCode(evaluateStock(stock({ avgPrice: NaN })), 'cost'));
  assert.ok(hasCode(evaluateStock(stock({ pricingMode: 'auto-anyway' })), 'pricing-mode'));
  assert.ok(hasCode(evaluateStock({ ...manual({ value: 1e12 }), quantity: 1e12 }), 'total-range'));
});
test('daily revision preserves original legacy payload and old rows without backfilling provenance', () => {
  const s = P.evaluate(input()).snapshot, today = { ts: NOW - 1000, val: 999 }, old = { ts: NOW - 7 * DAY, val: 500 };
  const original = JSON.stringify([old, today]), updated = P.appendDaily([old, today], s); assert.equal(updated.action, 'revised'); assert.deepEqual(updated.records[1].dailyHistory.entries[0].point, today); assert.equal(updated.records[1].comparisonHold, true); assert.equal(JSON.stringify([old, today]), original);
  const r = P.appendDaily([old], s); assert.equal(r.ok, true); assert.equal(r.records.length, 2); assert.equal(r.records[0], old); assert.equal(old.cost, undefined);
});
test('malformed existing rows are preserved by refusing the write', () => {
  const old = [{ ts: 'unknown', val: 4 }]; const original = JSON.stringify(old);
  assert.equal(P.appendDaily(old, P.evaluate(input()).snapshot).code, 'existing-invalid'); assert.equal(JSON.stringify(old), original);
});
test('pure policy does not mutate holdings or call IO', () => {
  const i = input({ accounts: { gen: [manual()] } }), original = JSON.stringify(i); P.evaluate(i); assert.equal(JSON.stringify(i), original);
  const source = fs.readFileSync(path.join(__dirname, '../has/snapshot-policy.js'), 'utf8'); assert.doesNotMatch(source, /\b(?:localStorage|sessionStorage|fetch|XMLHttpRequest|document|setTimeout)\b/);
});

// Evaluate only selected functions in a synthetic VM. No full app startup, migration, real storage, API, or browser launch.
const html = fs.readFileSync(path.join(__dirname, '../portfolio_v5.html'), 'utf8');
function fn(name) { const start = html.indexOf('function ' + name + '('); assert.ok(start >= 0, name); const end = html.indexOf('\n}', start); return html.slice(start, end + 2); }
function harness() {
  const nodes = {}, data = new Map(), messages = [], writes = [], context = { HASSnapshotPolicy: P, Date: class extends Date { static now() { return NOW; } }, Intl, console, snapshots: { all: [], dom: [], ov: [], pen: [], gen: [] }, domStocks: [], penStocks: [], ovStocks: [], genStocks: [stock()], freshPrice: { 'KR:SYNTH': true }, quoteMeta: { 'KR:SYNTH': NOW - 1 }, snapshotQuoteValues: { 'KR:SYNTH': 100 }, snapshotInputEpoch: 0, renderAll() {}, updateHeaderH() {}, showToast(m) { messages.push(m); }, quietSet(k, v) { data.set(k, v); }, safeSet(k, v) { if (context.failSave) return false; writes.push(k); data.set(k, v); return true; }, document: { getElementById(id) { return nodes[id] || null; } }, localStorage: { getItem(k) { return data.has(k) ? data.get(k) : null; }, setItem(k, v) { writes.push(k); data.set(k, v); } } };
  context.window = context; nodes.usdKrw = { value: '1370' }; for (const k of ['all', 'gen', 'dom', 'ov', 'pen']) nodes['snapshotStatus-' + k] = { textContent: '' };
  vm.createContext(context);
  for (const name of ['snapshotWriteBlocked', 'snapshotEvaluation', 'snapshotMissingText', 'renderSnapshotStatuses', 'recordSnap', 'invalidateSnapshotEvidence', 'snapshotQuoteTargets', 'acceptSnapshotQuotes', 'autoSnapshot', 'snapshotEscape', 'manualLocalInput', 'readManualPriceForm', 'renderManualPriceForm', 'toggleManualPriceFields']) vm.runInContext(fn(name), context);
  return { context, nodes, data, messages, writes };
}
test('button and automatic writes share revision policy, preserve prior payload, and show manual warning', () => {
  const h = harness(); h.context.genStocks = [manual()]; h.context.recordSnap('gen');
  assert.equal(h.context.snapshots.gen.length, 1); assert.match(h.nodes['snapshotStatus-gen'].textContent || h.messages.join(' '), /수동 가격/);
  const before = JSON.stringify(h.context.snapshots.gen); h.context.genStocks[0].manualPrice.value = 200; h.context.recordSnap('gen'); h.context.autoSnapshot();
  assert.equal(JSON.stringify(h.context.snapshots.gen[0].dailyHistory.entries[0].point), JSON.stringify(JSON.parse(before)[0])); assert.equal(h.context.snapshots.gen[0].val, 400); assert.equal(h.context.snapshots.gen[0].dailyHistory.entries.length, 2);
});
test('missing policy and pending journal block both record methods without fallback or writes', () => {
  for (const block of ['module', 'journal', 'ui']) {
    const h = harness(); if (block === 'module') delete h.context.HASSnapshotPolicy;
    if (block === 'journal') h.data.set('kst.portfolio.restoreJournal', '{bad');
    if (block === 'ui') h.context.HASBackupUI = { isWriteBlocked: () => true };
    h.context.recordSnap('gen'); h.context.autoSnapshot(); assert.equal(h.writes.length, 0, block); assert.equal(h.context.snapshots.gen.length, 0);
  }
});
test('storage failure does not change in-memory snapshots or claim success', () => {
  const h = harness(); h.context.failSave = true; h.context.recordSnap('gen'); h.context.autoSnapshot();
  assert.equal(h.context.snapshots.gen.length, 0); assert.equal(h.messages.length, 0);
});
test('status includes the actual blocked account, ticker and reason', () => {
  const h = harness(); h.context.freshPrice = {}; h.context.renderSnapshotStatuses();
  assert.match(h.nodes['snapshotStatus-all'].textContent, /일반 \/ SYNTH: 이번 접속에서 시세를 받지 못했습니다/);
});
test('manual editor has explicit opt-in, no guessed asOf and calendar/timezone warnings', () => {
  const h = harness(), ui = h.context.renderManualPriceForm(stock(), 'gen');
  assert.match(ui, /value="quote" selected/); assert.match(ui, /id="emas_gen_1"[^>]*value=""/);
  assert.match(ui, /KST 달력 날짜/); assert.match(ui, /기기 시간대/); assert.match(ui, /보유수량 1단위당/);
  h.nodes.epm_gen_1 = { value: 'manual' }; h.nodes.emp_gen_1 = { value: '125' }; h.nodes.emas_gen_1 = { value: '' }; h.nodes.emage_gen_1 = { value: '1' };
  assert.equal(h.context.readManualPriceForm('gen', 1).ok, false);
  // Fixed past local fixture for UTC/Seoul/New York; 10:00 New York was future at NOW.
  h.nodes.emas_gen_1.value = '2026-11-10T06:00:00'; assert.equal(h.context.readManualPriceForm('gen', 1).ok, true);
});
test('late callbacks cannot target replacement stocks or edit new quantity/manual mode', () => {
  for (const change of ['replace', 'quantity', 'mode', 'epoch', 'journal']) {
    const h = harness(), original = h.context.genStocks[0], targets = h.context.snapshotQuoteTargets(h.context.genStocks);
    if (change === 'replace') h.context.genStocks = [stock({ currentPrice: 10 })];
    if (change === 'quantity') original.quantity = 3;
    if (change === 'mode') original.pricingMode = 'manual';
    if (change === 'epoch') h.context.invalidateSnapshotEvidence();
    if (change === 'journal') h.data.set('kst.portfolio.restoreJournal', '{bad');
    const before = h.context.genStocks[0].currentPrice; h.context.acceptSnapshotQuotes(h.context.genStocks, targets, { SYNTH: 999 }, 'KR:', 0);
    assert.equal(h.context.genStocks[0].currentPrice, before, change);
  }
});
test('valid callback captures exact quote, but rejects nonfinite or nonnumeric responses', () => {
  const h = harness(), targets = h.context.snapshotQuoteTargets(h.context.genStocks);
  for (const price of [0, -1, Infinity, '500', NaN]) h.context.acceptSnapshotQuotes(h.context.genStocks, targets, { SYNTH: price }, 'KR:', 0);
  assert.equal(h.context.genStocks[0].currentPrice, 100);
  h.context.acceptSnapshotQuotes(h.context.genStocks, targets, { SYNTH: 150 }, 'KR:', 0);
  assert.equal(h.context.snapshotQuoteValues['KR:SYNTH'], 150); assert.equal(h.context.quoteMeta['KR:SYNTH'], NOW);
});
test('HTML contains startup/save/load and benchmark cancellation guards, with snapshot module wired once', () => {
  assert.equal((html.match(/src="has\/snapshot-policy.js"/g) || []).length, 1);
  assert.match(fn('load'), /if\(snapshotWriteBlocked\(\)\) return false/);
  assert.match(fn('save'), /if\(snapshotWriteBlocked\(\)\) return false/);
  assert.match(fn('fetchBenchmarkHistory'), /function active\(\)\{return _benchRunId===myRun&&!snapshotWriteBlocked\(\);\}/);
  assert.match(fn('invalidateBackupRuntime'), /_benchRunId\+\+/);
  assert.match(html, /Pending or malformed restore state must not trigger migrations/);
});

test('same ticker in distinct lots preserves stock identity; duplicate IDs and oversized input refuse', () => {
  const r = P.evaluate(input({ accounts: { gen: [manual(), { ...manual({ value: 140 }), id: 2 }] } }));
  assert.equal(r.ok, true); assert.deepEqual(r.snapshot.components.map(c => c.stockId), [1, 2]);
  assert.deepEqual(r.snapshot.manualComponents.map(c => c.stockId), [1, 2]);
  assert.ok(hasCode(P.evaluate(input({ accounts: { gen: [stock(), stock()] } })), 'stock-id'));
  assert.ok(hasCode(P.evaluate(input({ accounts: { gen: new Array(P.MAX_ROWS + 1).fill(stock()) } })), 'holdings-limit'));
  assert.ok(hasCode(P.evaluate(input({ now: NOW + 0.5 })), 'clock'));
});
test('retry scheduling and execution both reject invalidated epochs', () => {
  const h = harness(), tasks = []; let called = 0;
  h.context.setTimeout = fn => { tasks.push(fn); }; vm.runInContext(fn('retryFetch'), h.context);
  h.context.retryFetch(() => called++, 0, 0); assert.equal(tasks.length, 1);
  h.context.invalidateSnapshotEvidence(); tasks[0](); assert.equal(called, 0);
  h.context.retryFetch(() => called++, 0, 0); assert.equal(tasks.length, 1);
});

test('manual local timestamp accepts normalized milliseconds without rolling over bad dates', () => {
  const h = harness(); h.nodes.epm_gen_1 = { value: 'manual' }; h.nodes.emp_gen_1 = { value: '125' }; h.nodes.emage_gen_1 = { value: '1' }; h.nodes.emas_gen_1 = { value: '' };
  for (const value of ['2026-11-10T06:00', '2026-11-10T06:00:01.000', '2026-11-10T06:00:01.12', '2026-11-10T06:00:01.123']) { h.nodes.emas_gen_1.value = value; assert.equal(h.context.readManualPriceForm('gen', 1).ok, true, value); }
  for (const value of ['2026-02-30T10:00:01.000', '2026-11-10T25:00:01.000', '2026-11-10T10:00:01.1234']) { h.nodes.emas_gen_1.value = value; assert.equal(h.context.readManualPriceForm('gen', 1).ok, false, value); }
});

test('actual load preserves legacy pension deposit labels and theme bytes without storage writes', () => {
  const h = harness();
  const legacy = [{ id: 31, name: '예수금(계좌1)', ticker: 'DEP_PEN_계좌1', quantity: 1, avgPrice: 700, currentPrice: 700 }, { id: 32, name: '예수금(계좌2)', ticker: 'DEP_PEN_계좌2', quantity: 1, avgPrice: 900, currentPrice: 900 }];
  const penBytes = JSON.stringify(legacy, null, 2), themeBytes = '{ "DEP_PEN_계좌1": "방어·금", "DEP_PEN_계좌2": "기타" }';
  h.data.set('v5_pen', penBytes); h.data.set('v5_userThemeMap', themeBytes);
  Object.assign(h.context, { DOM_INIT: [], OV_INIT: [], PEN_INIT: [], GEN_INIT: [], GAS_DEFAULT: '', backupStateLoaded: false, getAlphaVantageKey() { return ''; }, updateAlphaVantageQuotaStatus() {} });
  vm.runInContext(fn('load'), h.context);
  for (let reopen = 0; reopen < 2; reopen++) {
    assert.equal(h.context.load(), true); assert.equal(h.context.backupStateLoaded, true);
    assert.equal(JSON.stringify(h.context.penStocks), JSON.stringify(legacy));
    assert.equal(h.data.get('v5_pen'), penBytes); assert.equal(h.data.get('v5_userThemeMap'), themeBytes);
    assert.deepEqual(h.writes, []);
  }
  assert.doesNotMatch(fn('load'), /migrateDepositLabels|renameMap|nameMap/);
});
