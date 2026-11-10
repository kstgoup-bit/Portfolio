'use strict';
// Independent synthetic audit: actual application scripts, fake storage, inert
// scheduling and explicit response fixtures. No browser process or network.
const fs = require('node:fs'), path = require('node:path');
const test = require('node:test'), a = require('node:assert/strict');
const ROOT = path.join(__dirname, '..');
require('./lib/no-network.cjs');
const P = require('../has/snapshot-policy.js');
const B = require('../backup/core.js');
const H = require('../has/benchmark-history-policy.js');
const NOW = Date.parse('2026-11-10T12:00:00Z'), DAY = 86400000;
const clone = x => JSON.parse(JSON.stringify(x));
const stock = (extra = {}) => ({ id: 1, name: 'Synthetic holding', ticker: 'SYNTH', quantity: 2, avgPrice: 80, currentPrice: 100, ...extra });
function memory(seed = {}) {
  const map = new Map(Object.entries(seed));
  const storage = { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null,
    getItem: key => map.get(key) ?? null,
    setItem(key, value) { if (storage.reject === key) throw new Error('Synthetic quota rejection'); map.set(key, String(value)); },
    removeItem: key => map.delete(key), all: () => Object.fromEntries(map) };
  return storage;
}
const seed = () => Object.fromEntries(B.ACCOUNTS.map(key => [key, '[]']));
function evaluated({ now = NOW, received = now - 1000, stocks = [stock()], key = 'gen' } = {}) {
  const freshPrice = {}, quoteMeta = {}, quoteValues = {};
  for (const s of stocks) {
    const k = (key === 'ov' ? 'US:' : 'KR:') + s.ticker;
    freshPrice[k] = true; quoteMeta[k] = received; quoteValues[k] = s.currentPrice;
  }
  if (key === 'ov') { quoteMeta.FX = received; quoteValues.FX = 1400; }
  return P.evaluate({ now, key, accounts: { gen: [], dom: [], ov: [], pen: [], [key]: stocks }, freshPrice, quoteMeta, quoteValues, fx: 1400 });
}
function appHarness() {
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(path.join(ROOT, 'portfolio_v5.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://offline.invalid/' }), w = dom.window;
  const storage = memory(seed()), timers = [], messages = [], network = [];
  Object.defineProperty(w, 'localStorage', { value: storage });
  Object.defineProperty(w, 'sessionStorage', { value: memory() });
  class FixedDate extends Date { constructor(...args) { super(...(args.length ? args : [NOW])); } static now() { return NOW; } }
  w.Date = FixedDate;
  for (const name of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'open']) w[name] = (...args) => { network.push(name); throw new Error('Unexpected external action: ' + name); };
  w.setTimeout = (fn, delay) => { timers.push({ fn, delay, cancelled: false }); return timers.length; };
  w.clearTimeout = id => { if (timers[id - 1]) timers[id - 1].cancelled = true; };
  w.setInterval = w.requestAnimationFrame = () => 1; w.clearInterval = () => {};
  w.confirm = () => true; w.alert = () => {}; w.TextEncoder = TextEncoder;
  const noop = () => {}, context = new Proxy({}, { get: () => noop, set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => context; w.HTMLElement.prototype.scrollIntoView = noop;
  w.addEventListener = noop;
  const listen = w.document.addEventListener.bind(w.document);
  w.document.addEventListener = (name, fn, opts) => { if (name !== 'DOMContentLoaded') listen(name, fn, opts); };
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/\bsrc\s*=/.test(m[1]) && m[2].trim()) w.eval(m[2]);
  const dependencyFiles = ['has/quote-model.js', 'has/benchmark-history-policy.js', 'has/snapshot-policy.js', 'backup/core.js'];
  const dependencyOrder = [...html.matchAll(/<script\b[^>]*\bsrc="([^"]+)"[^>]*>/gi)].map(m => m[1]).filter(file => dependencyFiles.includes(file));
  a.equal(dependencyOrder.length, dependencyFiles.length, 'all boundary dependencies must be present once');
  for (const file of dependencyOrder) w.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  w.renderAll = w.updateHeaderH = w.loadRiskData = w.fetchMarketIndices = noop;
  w.renderAllReturnsTables = w.refreshAllLineCharts = noop;
  w.showToast = message => messages.push(message);
  w.domStocks = []; w.ovStocks = []; w.penStocks = []; w.genStocks = [];
  w.snapshots = { all: [], dom: [], ov: [], pen: [], gen: [] };
  w.deposits = { dom: [], ov: [], pen: [], gen: [] }; w.divList = [];
  function quote(stocks = [stock()], key = 'gen') {
    w[key === 'gen' ? 'genStocks' : key === 'dom' ? 'domStocks' : key === 'pen' ? 'penStocks' : 'ovStocks'] = clone(stocks);
    for (const s of stocks) { const k = (key === 'ov' ? 'US:' : 'KR:') + s.ticker; w.freshPrice[k] = true; w.quoteMeta[k] = NOW - 1000; w.snapshotQuoteValues[k] = s.currentPrice; }
  }
  async function drain() {
    for (let round = 0; round < 80; round++) {
      for (const timer of timers) if (!timer.cancelled && !timer.executed && timer.delay <= 1500) { timer.executed = true; timer.fn(); }
      await Promise.resolve();
    }
  }
  return { dom, w, storage, timers, messages, network, quote, drain, close: () => dom.window.close() };
}

test('independent: quote receipt never becomes market price time or verified quality', () => {
  for (const received of [NOW - 1000, NOW - 6 * 3600000]) {
    const r = evaluated({ received }); a.equal(r.ok, true);
    a.equal(r.snapshot.priceAsOf, null); a.equal(r.snapshot.components[0].priceAsOf, null);
    a.equal(r.snapshot.components[0].receivedAt, new Date(received).toISOString());
    a.equal(r.snapshot.quality, 'unconfirmed'); a.equal(r.snapshot.signalHold, true);
  }
});

test('independent: stale, future, string and invalid numeric quote inputs reject atomically', () => {
  for (const received of [NOW + 1, NOW - DAY - 1, String(NOW), 0, NaN]) a.equal(evaluated({ received }).ok, false, String(received));
  for (const currentPrice of [0, -1, NaN, Infinity, '100', 1e12 + 1]) a.equal(evaluated({ stocks: [stock({ currentPrice })] }).ok, false, String(currentPrice));
});

test('independent: app snapshot persistence failure preserves runtime and stored history', () => {
  const h = appHarness(); try {
    h.quote(); h.storage.reject = 'v5_snap';
    const beforeRows = JSON.stringify(h.w.snapshots), before = h.storage.all();
    h.w.recordSnap('gen'); h.w.autoSnapshot();
    a.equal(JSON.stringify(h.w.snapshots), beforeRows); a.deepEqual(h.storage.all(), before);
    a.equal(h.network.length, 0); a.ok(h.messages.some(m => /저장/.test(m)));
  } finally { h.close(); }
});

test('independent: loaded prepared restore blocks recording without mutating any key', () => {
  const h = appHarness(); try {
    h.quote();
    h.storage.setItem(B.JOURNAL, JSON.stringify({ version: 2, status: 'prepared', savedAt: new Date(NOW).toISOString(), before: { v5_gen: '[]' }, after: { v5_gen: '[]' } }));
    const before = h.storage.all(), rows = JSON.stringify(h.w.snapshots);
    h.w.recordSnap('gen'); h.w.autoSnapshot(); h.w.fetchBenchmarkHistory(true);
    a.deepEqual(h.storage.all(), before); a.equal(JSON.stringify(h.w.snapshots), rows); a.equal(h.network.length, 0);
  } finally { h.close(); }
});

test('independent: pre-restore quote callback cannot write restored holdings or prices', () => {
  const h = appHarness(); try {
    h.w.ovStocks = [stock()]; h.w.gasUrl = 'https://synthetic.invalid/exec'; h.w.fetchUS();
    const script = h.w.document.querySelector('script[src*="callback=gas_us_"]'); a.ok(script);
    const callback = h.w[new URL(script.src).searchParams.get('callback')];
    h.w.invalidateBackupRuntime(); h.w.ovStocks = [stock({ currentPrice: 777, quantity: 9 })];
    const before = h.storage.all(); callback({ SYNTH: 999 });
    a.equal(h.w.ovStocks[0].currentPrice, 777); a.equal(h.w.snapshotQuoteValues['US:SYNTH'], undefined);
    a.deepEqual(h.storage.all(), before); a.equal(h.network.length, 0);
  } finally { h.close(); }
});

test('independent: legacy v5 missing cost and arbitrary inert metadata survive restore/export', () => {
  const rows = [{ ts: NOW - 7 * DAY, val: 123, note: { label: 'Synthetic history' } }];
  const storage = memory(seed());
  B.apply(storage, B.parse(JSON.stringify({ version: 'v5', snapshots: { gen: rows } })));
  const target = memory(seed()); B.apply(target, B.parse(JSON.stringify(B.create(storage))));
  a.deepEqual(JSON.parse(target.getItem('v5_snap')).gen, rows);
  a.equal(Object.hasOwn(JSON.parse(target.getItem('v5_snap')).gen[0], 'cost'), false);
});

test('independent: omitted legacy benchmark groups preserve current cached groups', () => {
  const storage = memory(seed()), ks = [{ ts: NOW - DAY, close: 300 }], spy = [{ ts: NOW - DAY, close: 600 }];
  storage.setItem('v5_benchHist', JSON.stringify({ KS200: ks, SPY: spy, QQQ: [] }));
  B.apply(storage, B.parse(JSON.stringify({ version: 'v5', benchHist: { QQQ: [{ ts: NOW, close: 500 }] } })));
  const restored = JSON.parse(storage.getItem('v5_benchHist')); a.deepEqual(restored.KS200, ks); a.deepEqual(restored.SPY, spy);
});

test('independent: chart points are recorded points, never unchecked current valuations', () => {
  const h = appHarness(); try {
    const rows = [evaluated({ now: NOW - 2 * DAY }).snapshot, evaluated({ now: NOW - DAY, stocks: [stock({ currentPrice: 110 })] }).snapshot];
    h.w.snapshots.gen = clone(rows); h.quote([stock({ currentPrice: 999999 })]);
    h.w.getBenchmarkSeriesForChart = () => null;
    h.w.getCurrentTotalByKey = () => 1999998;
    h.w.renderLineChart('1W', 'genPeriodBtns', 'genLineChart', 'gen', '#00897b');
    const svg = h.w.document.getElementById('genLineChart');
    a.equal(svg.querySelector('path[stroke="#00897b"]').getAttribute('d'), 'M40.0,58.3 L330.0,20.0');
    a.deepEqual(clone(h.w.snapshots.gen), rows); a.doesNotMatch(svg.textContent, /11\/10|1,999,798/);
  } finally { h.close(); }
});

test('independent: receipt-only same-day repeat does not create a revision or fresh price time', () => {
  const first = evaluated({ now: NOW - 10000 }).snapshot, rows = [first], before = JSON.stringify(rows);
  const r = P.appendDaily(rows, evaluated().snapshot);
  a.equal(r.ok, true); a.equal(r.changed, false); a.equal(r.action, 'unchanged');
  a.equal(JSON.stringify(r.records), before); a.equal(JSON.stringify(rows), before);
});

test('independent: same-day changed price preserves complete previous point and older days', () => {
  const old = { ts: NOW - 5 * DAY, val: 90, historicalTag: { label: 'Synthetic preserved metadata' } };
  const first = evaluated({ now: NOW - 10000 }).snapshot; first.auditLabel = 'Synthetic first point';
  const rows = [old, first], before = JSON.stringify(rows);
  const r = P.appendDaily(rows, evaluated({ stocks: [stock({ currentPrice: 110 })] }).snapshot);
  a.equal(r.ok, true); a.equal(r.action, 'revised'); a.equal(r.changed, true); a.equal(r.records.length, 2);
  a.deepEqual(r.records[0], old); a.equal(r.records[1].val, 220); a.equal(JSON.stringify(rows), before);
  const entries = r.records[1].dailyHistory.entries;
  a.equal(entries.length, 2); a.deepEqual(entries[0].point, first);
  a.equal(entries[1].point.val, 220); a.equal(entries[1].point.priceAsOf, null);
  for (const entry of entries) a.equal(Object.hasOwn(entry.point, 'dailyHistory'), false);
});

test('independent: legacy same-day point is never silently replaced or promoted', () => {
  const rows = [{ ts: NOW - 1000, val: 999, customTag: 'Synthetic legacy marker' }], before = JSON.stringify(rows);
  const r = P.appendDaily(rows, evaluated().snapshot);
  a.equal(r.ok, true); a.equal(JSON.stringify(rows), before);
  a.deepEqual(r.records[0].dailyHistory.entries[0].point, rows[0]);
  a.equal(Object.hasOwn(r.records[0].dailyHistory.entries[0].point, 'schemaVersion'), false);
  a.equal(r.records[0].comparisonHold, true); a.ok(r.records[0].scopeChange.types.includes('legacy-unknown'));
  a.equal(r.reason, 'legacy-provenance-unverified');
});

test('independent: bounded revisions refuse overflow rather than trim or recurse', () => {
  let rows = [evaluated({ now: NOW - 100000 }).snapshot];
  a.equal(P.MAX_REVISIONS, 64);
  for (let i = 1; i <= P.MAX_REVISIONS; i++) {
    const r = P.appendDaily(rows, evaluated({ now: NOW - 100000 + i * 1000, stocks: [stock({ currentPrice: 100 + i })] }).snapshot);
    a.equal(r.ok, true, 'revision ' + i); rows = r.records;
  }
  const before = JSON.stringify(rows), entries = rows[0].dailyHistory.entries;
  a.equal(entries.length, P.MAX_REVISIONS + 1);
  a.ok(entries.every(entry => !Object.hasOwn(entry.point, 'dailyHistory')));
  const rejected = P.appendDaily(rows, evaluated({ stocks: [stock({ currentPrice: 999 })] }).snapshot);
  a.equal(rejected.ok, false); a.equal(JSON.stringify(rows), before);
});

test('independent: removed holding marks scope change and does not relabel it as price return', () => {
  const first = evaluated({ now: NOW - DAY, stocks: [stock(), stock({ id: 2, ticker: 'OTHER', currentPrice: 300 })] }).snapshot;
  const rows = [first], before = JSON.stringify(rows), r = P.appendDaily(rows, evaluated().snapshot);
  a.equal(r.ok, true); a.equal(r.records.at(-1).comparisonHold, true);
  a.equal(r.records.at(-1).scopeChange.returnComparable, false);
  a.ok(r.records.at(-1).scopeChange.types.includes('holdings')); a.equal(JSON.stringify(rows), before);
});

test('independent: revision-bearing daily snapshot survives v6 export/restore exactly', () => {
  const first = evaluated({ now: NOW - 10000 }).snapshot;
  const r = P.appendDaily([first], evaluated({ stocks: [stock({ currentPrice: 105 })] }).snapshot); a.equal(r.ok, true);
  const storage = memory(seed()); storage.setItem('v5_snap', JSON.stringify({ gen: r.records }));
  const target = memory(seed()); B.apply(target, B.parse(JSON.stringify(B.create(storage))));
  a.equal(target.getItem('v5_snap'), storage.getItem('v5_snap'));
});

test('independent: nested revision histories are rejected before backup mutation', () => {
  const first = evaluated({ now: NOW - 10000 }).snapshot;
  const r = P.appendDaily([first], evaluated({ stocks: [stock({ currentPrice: 105 })] }).snapshot); a.equal(r.ok, true);
  const records = clone(r.records); records[0].dailyHistory.entries[0].point.dailyHistory = clone(records[0].dailyHistory);
  const target = memory(seed()), before = target.all();
  a.throws(() => B.parse(JSON.stringify({ version: 'v5', snapshots: { gen: records } })));
  a.deepEqual(target.all(), before);
  a.equal(P.appendDaily(records, evaluated({ stocks: [stock({ currentPrice: 110 })] }).snapshot).ok, false);
});

const BENCH_DATES = ['2026-11-05T14:30:00Z', '2026-11-06T14:30:00Z', '2026-11-09T14:30:00Z'];
function yahoo(id = 'QQQ', dates = BENCH_DATES, closes = [100, 101, 102]) {
  const s = H.specs[id];
  return { chart: { error: null, result: [{
    meta: { symbol: s.symbol, currency: s.currency, exchangeTimezoneName: s.timezone, instrumentType: 'ETF', dataGranularity: '1d', exchangeName: id === 'KS200' ? 'KSC' : 'NMS', fullExchangeName: id === 'KS200' ? 'KSE' : 'NasdaqGS', regularMarketTime: Date.parse(dates.at(-1)) / 1000 },
    timestamp: dates.map(d => Date.parse(d) / 1000), indicators: { quote: [{ close: closes }] }
  }] } };
}
const parsedYahoo = (id = 'QQQ', dates = BENCH_DATES, closes = [100, 101, 102], received = NOW) => H.parseYahoo(yahoo(id, dates, closes), id, new Date(received).toISOString());

test('independent: benchmark parser separates provider bar timestamp, exchange date and receipt', () => {
  const r = parsedYahoo(); a.equal(r.ok, true); a.equal(r.finality, 'unverified'); a.equal(r.latestness, 'unconfirmed');
  a.equal(r.barTimestampKind, 'provider-bar-time-not-confirmed-close');
  a.equal(r.points.at(-1).ts, Date.parse(BENCH_DATES.at(-1)));
  a.equal(r.bars.at(-1).d, '2026-11-09'); a.equal(r.receivedAt, new Date(NOW).toISOString());
});

test('independent: later benchmark receipt cannot replace older data or imply a new observation', () => {
  const old = parsedYahoo().points, before = JSON.stringify(old);
  const repeated = H.mergeSeries(old, parsedYahoo('QQQ', BENCH_DATES, [100, 101, 102], NOW + 1000), 'QQQ', NOW + 1000);
  a.equal(repeated.ok, true); a.equal(repeated.changed, false); a.equal(JSON.stringify(repeated.points), before);
  const earlier = H.mergeSeries(old, parsedYahoo('QQQ', BENCH_DATES.slice(0, 2), [100, 101], NOW + 1000), 'QQQ', NOW + 1000);
  a.equal(earlier.ok, false); a.equal(JSON.stringify(old), before);
});

test('independent: compact benchmark append preserves old points and rejects historical correction', () => {
  const old = parsedYahoo('QQQ', BENCH_DATES.slice(0, 2), [100, 101]).points; old[0].annotation = 'Synthetic old point';
  const before = JSON.stringify(old), incoming = parsedYahoo('QQQ', BENCH_DATES.slice(1), [101, 102]);
  const merged = H.mergeSeries(old, incoming, 'QQQ', NOW);
  a.equal(merged.ok, true); a.equal(merged.changed, true); a.equal(merged.points.length, 3); a.deepEqual(merged.points.slice(0, 2), old);
  const correction = parsedYahoo('QQQ', BENCH_DATES.slice(1), [999, 102]);
  a.equal(H.mergeSeries(old, correction, 'QQQ', NOW).ok, false); a.equal(JSON.stringify(old), before);
});

test('independent: benchmark rejects malformed currency, identity, dates, prices and receipt', () => {
  const changes = [
    r => { r.meta.currency = 'KRW'; }, r => { r.meta.symbol = 'SPY'; }, r => { r.meta.instrumentType = 'INDEX'; },
    r => { r.meta.exchangeTimezoneName = 'Asia/Seoul'; }, r => { r.timestamp[1] = r.timestamp[0]; },
    r => { r.timestamp[1] = '123'; }, r => { r.timestamp[2] = NOW / 1000 + 1; },
    r => { r.indicators.quote[0].close[1] = '101'; }, r => { r.indicators.quote[0].close[1] = 0; },
    r => { r.indicators.quote[0].close[1] = Infinity; }, r => { r.indicators.quote[0].close[1] = -1; }
  ];
  for (const change of changes) { const data = yahoo(); change(data.chart.result[0]); a.equal(H.parseYahoo(data, 'QQQ', new Date(NOW).toISOString()).ok, false, String(change)); }
  for (const receipt of ['2026-02-30T12:00:00Z', '2026-11-10', '2026-11-10T12:00:00+25:00', null]) a.equal(H.parseYahoo(yahoo(), 'QQQ', receipt).ok, false, String(receipt));
});

test('independent: GAS date-only data stays synthetic, cannot be promoted into timestamped cache', () => {
  const payload = { QQQ: { source: 'yahoo-chart-v8', symbol: 'QQQ', currency: 'USD', timezone: 'America/New_York', instrumentType: 'ETF', adjustment: 'unverified', exchange: 'NMS', bars: [{ d: '2026-11-06', c: 101 }, { d: '2026-11-09', c: 102 }], barCount: 2 } };
  const r = H.parseGasHistory(payload, 'QQQ', new Date(NOW).toISOString(), { mode: 'synthetic' });
  a.equal(r.ok, true); a.equal(r.synthetic, true); a.equal(r.points, null);
  a.equal(H.mergeSeries([], r, 'QQQ', NOW).ok, false);
  a.equal(H.parseGasHistory(payload, 'QQQ', new Date(NOW).toISOString(), { mode: 'live' }).ok, false);
  payload.QQQ.bars[0].d = '2026-02-30'; a.equal(H.parseGasHistory(payload, 'QQQ', new Date(NOW).toISOString(), { mode: 'synthetic' }).ok, false);
});

test('independent: benchmark cache reload does not manufacture source provenance from fetchedAt', () => {
  const cache = { QQQ: parsedYahoo().points, SPY: parsedYahoo('SPY').points, KS200: [], fetchedAtISO: new Date(NOW).toISOString() };
  const description = H.describe(cache, 'ov', {}, NOW);
  a.equal(description.finality, 'unverified'); a.equal(description.latestness, 'unconfirmed');
  for (const row of description.rows) { a.equal(row.receivedAt, null); a.match(row.source, /미확인/); }
});

test('independent: in-flight benchmark response cannot mutate state after restore invalidation', async () => {
  const h = appHarness(); try {
    let deliver, calls = 0;
    h.w.getAlphaVantageKey = () => { throw new Error('Keys must not be read'); };
    h.w.fetch = () => { calls++; return new Promise(resolve => { deliver = resolve; }); };
    h.w.fetchBenchmarkHistory(true); await h.drain(); a.equal(calls, 1); a.equal(typeof deliver, 'function');
    h.w.invalidateBackupRuntime(); h.w.benchmarkHistory = { KS200: [], NDX: [{ ts: NOW - DAY, close: 888 }], SPY: [] };
    const beforeStorage = h.storage.all(), beforeMemory = JSON.stringify(h.w.benchmarkHistory);
    deliver({ ok: true, json: async () => yahoo() }); await h.drain();
    a.deepEqual(h.storage.all(), beforeStorage); a.equal(JSON.stringify(h.w.benchmarkHistory), beforeMemory); a.equal(calls, 1);
  } finally { h.close(); }
});

test('independent: rejected benchmark persistence keeps previous runtime memory and storage', async () => {
  const h = appHarness(); try {
    const old = parsedYahoo('QQQ', BENCH_DATES.slice(0, 2), [100, 101]).points;
    const cache = { QQQ: clone(old), KS200: clone(old), SPY: clone(old) };
    h.storage.setItem('v5_benchHist', JSON.stringify(cache)); h.w.loadBenchmarkCacheSync();
    const beforeStorage = h.storage.all(), beforeMemory = JSON.stringify(h.w.benchmarkHistory);
    h.storage.reject = 'v5_benchHist';
    h.w.getAlphaVantageKey = () => { throw new Error('Keys must not be read'); };
    h.w.fetch = async url => {
      const decoded = decodeURIComponent(String(url)), id = decoded.includes('069500.KS') ? 'KS200' : decoded.includes('SPY') ? 'SPY' : 'QQQ';
      return { ok: true, json: async () => yahoo(id) };
    };
    h.w.fetchBenchmarkHistory(true); await h.drain();
    a.deepEqual(h.storage.all(), beforeStorage); a.equal(JSON.stringify(h.w.benchmarkHistory), beforeMemory);
    a.match(h.w._benchStatusMsg, /저장|보존|실패/);
  } finally { h.close(); }
});

test('independent: actual HTML dependency order supports new revision export and restore', () => {
  const h = appHarness(); try {
    h.quote(); h.w.recordSnap('gen'); h.quote([stock({ currentPrice: 110 })]); h.w.recordSnap('gen');
    a.equal(h.w.snapshots.gen[0].dailyHistory.entries.length, 2);
    const runtimeBackup = h.w.KSTPortfolioBackup, exported = runtimeBackup.create(h.storage), target = memory(seed());
    runtimeBackup.apply(target, runtimeBackup.parse(JSON.stringify(exported)));
    a.equal(target.getItem('v5_snap'), h.storage.getItem('v5_snap'));
  } finally { h.close(); }
});

test('independent: malformed saved revision display does not throw or create HTML elements', () => {
  const h = appHarness(); try {
    h.quote();
    for (const entries of [[null], [{ point: { ts: 1e30, val: 1 } }], [{ point: { recordedAt: '<img src=x onerror=alert(1)>', priceAsOf: '<script>throw 1</script>', val: '<svg onload=alert(1)>' } }]]) {
      h.w.snapshots.gen = [{ ts: NOW, val: 1, dailyHistory: { entries } }];
      a.doesNotThrow(() => h.w.renderSnapshotStatuses());
      const el = h.w.document.getElementById('snapshotHistory-gen');
      a.equal(el.querySelectorAll('script,img,svg').length, 0);
    }
  } finally { h.close(); }
});

test('independent: scope hold cannot be stripped from a later same-day price revision', () => {
  const first = evaluated({ now: NOW - 2000 }).snapshot;
  let rows = P.appendDaily([first], evaluated({ now: NOW - 1000, stocks: [stock({ quantity: 1 })] }).snapshot).records;
  rows = P.appendDaily(rows, evaluated({ stocks: [stock({ quantity: 1, currentPrice: 110 })] }).snapshot).records;
  a.equal(P.validateRecord(rows[0]).ok, true);
  const tampered = clone(rows[0]);
  for (const point of [tampered, tampered.dailyHistory.entries.at(-1).point]) { delete point.comparisonHold; delete point.scopeChange; }
  a.equal(P.validateRecord(tampered).ok, false);
  a.throws(() => B.parse(JSON.stringify({ version: 'v5', snapshots: { gen: [tampered] } })));
});

test('independent: malformed revision sequence and active-point mismatch cannot be restored', () => {
  const first = evaluated({ now: NOW - 2000 }).snapshot;
  const row = P.appendDaily([first], evaluated({ stocks: [stock({ currentPrice: 110 })] }).snapshot).records[0];
  const changes = [
    r => { r.val++; }, r => { r.dailyHistory.entries[1].point.priceAsOf = '2026-02-30T12:00:00Z'; },
    r => { r.dailyHistory.entries[1].utcOffsetMinutes = 841; }, r => { r.dailyHistory.localDay = '2026-11-09'; },
    r => { r.dailyHistory.entries[1].reason = 'scope-change'; }, r => { r.dailyHistory.entries[1].priceTime = 'known'; },
    r => { r.dailyHistory.entries[0].point.components[0].currency = 'USD'; }
  ];
  for (const change of changes) {
    const malformed = clone(row); change(malformed);
    a.equal(P.validateRecord(malformed).ok, false, String(change));
    a.throws(() => B.parse(JSON.stringify({ version: 'v5', snapshots: { gen: [malformed] } })), String(change));
  }
});

test('independent: known market price time cannot move backwards or disappear after later receipt', () => {
  function stamp(point, iso) { const p = clone(point); p.priceAsOf = iso; p.components[0].priceAsOf = iso; return p; }
  const first = stamp(evaluated({ now: NOW - 2000 }).snapshot, '2026-11-10T10:00:00Z');
  for (const iso of ['2026-11-10T09:59:59Z', null]) {
    const next = stamp(evaluated({ stocks: [stock({ currentPrice: 110 })] }).snapshot, iso);
    const r = P.appendDaily([first], next); a.equal(r.ok, false); a.equal(r.code, 'price-time-regression');
  }
});

test('independent: old provenance snapshot without component cost keeps exact payload on update', () => {
  const first = evaluated({ now: NOW - 1000 }).snapshot; delete first.components[0].avgPrice;
  const r = P.appendDaily([first], evaluated({ stocks: [stock({ currentPrice: 105 })] }).snapshot);
  a.equal(r.ok, true); a.deepEqual(r.records[0].dailyHistory.entries[0].point, first);
  a.doesNotThrow(() => B.parse(JSON.stringify({ version: 'v5', snapshots: { gen: r.records } })));
});

test('independent: removed holding suppresses raw return, Dietz and alpha in actual DOM', () => {
  const h = appHarness(); try {
    const first = evaluated({ now: NOW - 8 * DAY, stocks: [stock({ quantity: 4 })] }).snapshot;
    h.w.snapshots.gen = clone(P.appendDaily([first], evaluated().snapshot).records); h.quote();
    for (const mode of ['raw', 'dietz', 'alpha']) {
      const html = h.w.returnRowHtml({ label: '1주', days: 7 }, 'gen', 200, NOW, mode);
      a.match(html, /비교 보류/); a.doesNotMatch(html, /-50\.00%/);
    }
    h.w.renderLineChart('1W', 'genPeriodBtns', 'genLineChart', 'gen', '#00897b');
    const svg = h.w.document.getElementById('genLineChart');
    a.doesNotMatch(svg.textContent, /-50\.0%/); a.equal(svg.querySelector('path[stroke="#ef6c00"]'), null);
  } finally { h.close(); }
});

test('independent: missing current quote suppresses return table rather than using average cost', () => {
  const h = appHarness(); try {
    h.w.snapshots.gen = [evaluated({ now: NOW - 8 * DAY }).snapshot, evaluated({ now: NOW - DAY }).snapshot];
    h.w.genStocks = [stock({ currentPrice: 0, avgPrice: 999999 })];
    h.w.renderReturnsTable('gen', 'genReturnsTable');
    a.doesNotMatch(h.w.document.getElementById('genReturnsTable').textContent, /[+-]\d+\.\d+%/);
  } finally { h.close(); }
});

test('independent: revised-row save failure preserves prior versions in memory and storage', () => {
  const h = appHarness(); try {
    h.quote(); h.w.recordSnap('gen'); const before = h.storage.all(), memoryBefore = JSON.stringify(h.w.snapshots);
    h.quote([stock({ currentPrice: 110 })]); h.storage.reject = 'v5_snap'; h.w.recordSnap('gen'); h.w.autoSnapshot();
    a.deepEqual(h.storage.all(), before); a.equal(JSON.stringify(h.w.snapshots), memoryBefore);
  } finally { h.close(); }
});

test('independent: local-midnight boundary appends another day without rewriting yesterday', () => {
  const midnight = new Date(NOW); midnight.setHours(0, 0, 0, 0);
  const first = evaluated({ now: midnight.getTime() - 1 }).snapshot;
  const next = evaluated({ now: midnight.getTime() + 1, stocks: [stock({ currentPrice: 105 })] }).snapshot;
  const r = P.appendDaily([first], next);
  a.equal(r.ok, true); a.equal(r.action, 'appended'); a.equal(r.records.length, 2);
  a.deepEqual(r.records[0], first); a.equal(Object.hasOwn(r.records[1], 'dailyHistory'), false);
});

test('independent: removing and re-adding a holding cannot erase its known source-time floor', () => {
  const other = stock({ id: 2, ticker: 'OTHER', currentPrice: 300 });
  function stamped(now, stocks, times) {
    const point = evaluated({ now, stocks }).snapshot;
    point.components.forEach(c => { c.priceAsOf = times[c.ticker]; });
    point.priceAsOf = point.components.map(c => c.priceAsOf).sort()[0];
    return point;
  }
  for (const interval of [1000, DAY]) {
    const originalTime = new Date(NOW - 3 * DAY).toISOString(), regressedTime = new Date(NOW - 4 * DAY).toISOString();
    const first = stamped(NOW - 2 * interval, [stock(), other], { SYNTH: originalTime, OTHER: originalTime });
    const removed = stamped(NOW - interval, [other], { OTHER: originalTime });
    const records = P.appendDaily([first], removed).records; a.ok(records);
    const regressed = stamped(NOW, [stock(), other], { SYNTH: regressedTime, OTHER: originalTime });
    const before = JSON.stringify(records), result = P.appendDaily(records, regressed);
    a.equal(result.ok, false); a.equal(result.code, 'price-time-regression'); a.equal(JSON.stringify(records), before);
  }
});

test('independent: revision-cap status explains refusal without claiming recording is available', () => {
  const h = appHarness(); try {
    let rows = [evaluated({ now: NOW - 100000 }).snapshot];
    for (let i = 1; i <= P.MAX_REVISIONS; i++) rows = P.appendDaily(rows, evaluated({ now: NOW - 100000 + i * 1000, stocks: [stock({ currentPrice: 100 + i })] }).snapshot).records;
    h.w.snapshots.gen = clone(rows); h.quote([stock({ currentPrice: 999 })]);
    const before = h.storage.all(), memoryBefore = JSON.stringify(h.w.snapshots);
    h.w.renderSnapshotStatuses();
    const text = h.w.document.getElementById('snapshotStatus-gen').textContent;
    a.match(text, /한도/); a.doesNotMatch(text, /저장 가능|기록 가능/);
    a.deepEqual(h.storage.all(), before); a.equal(JSON.stringify(h.w.snapshots), memoryBefore);
  } finally { h.close(); }
});

test('independent: malformed non-array saved history is not advertised as recordable', () => {
  const h = appHarness(); try {
    h.quote(); h.w.snapshots.gen = { damaged: 'Synthetic invalid history container' };
    const before = h.storage.all(), memoryBefore = JSON.stringify(h.w.snapshots);
    h.w.renderSnapshotStatuses();
    const text = h.w.document.getElementById('snapshotStatus-gen').textContent;
    a.match(text, /보류|형식/); a.doesNotMatch(text, /저장 가능|기록 가능/);
    a.deepEqual(h.storage.all(), before); a.equal(JSON.stringify(h.w.snapshots), memoryBefore);
  } finally { h.close(); }
});
