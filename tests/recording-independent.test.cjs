'use strict';
// Independent audit. Only synthetic MemoryStorage, offline jsdom and mocked GAS are used.
// No real browser profile, user data, credentials, network, deployment or repository writes.
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const test = require('node:test'), a = require('node:assert/strict');
const ROOT = process.env.HAS_AUDIT_ROOT || require('node:path').join(__dirname, '..');
require(path.join(ROOT, 'tests/lib/no-network.cjs'));
const B = require(path.join(ROOT, 'backup/core.js'));
const policy = () => require(path.join(ROOT, 'has/snapshot-policy.js'));
const now = Date.parse('2026-11-10T12:00:00Z');
function memory(seed = {}) {
  const map = new Map(Object.entries(seed));
  return { get length() { return map.size; }, key: i => [...map.keys()][i] ?? null,
    getItem: k => map.get(k) ?? null, setItem(k, v) { map.set(k, String(v)); }, removeItem(k) { map.delete(k); },
    all: () => Object.fromEntries(map) };
}
const stock = (extra = {}) => ({ id: 1, name: 'Synthetic holding', ticker: 'AAA', quantity: 2, avgPrice: 70, currentPrice: 100, ...extra });
const accountSeed = () => Object.fromEntries(B.ACCOUNTS.map(k => [k, JSON.stringify([stock()])]));
const valid = storage => B.create(storage || memory(accountSeed()));
const clone = o => JSON.parse(JSON.stringify(o));

// Explicitly exercise outer JSON and each nested JSON storage string independently.
test('backup: duplicate outer JSON keys cannot silently replace account content', () => {
  a.throws(() => B.parse('{"version":"v5","genStocks":[{"id":1,"name":"Synthetic","ticker":"AAA","quantity":2,"avgPrice":3,"currentPrice":4}],"genStocks":[]}'));
});
test('backup: duplicate keys hidden in serialized storage JSON are rejected', () => {
  const b = valid();
  b.storage.v5_gen = '[{"id":1,"name":"Synthetic","ticker":"AAA","quantity":2,"quantity":999,"avgPrice":3,"currentPrice":4}]';
  a.throws(() => B.parse(JSON.stringify(b)));
});
test('backup: unknown storage keys reject without changing fake storage', () => {
  const s = memory(accountSeed()), before = s.all(), b = valid(s); b.storage.v5_secret_future = 'SYNTHETIC';
  a.throws(() => B.parse(JSON.stringify(b))); a.deepEqual(s.all(), before);
});
test('backup: absent legacy account survives while explicit empty account clears', () => {
  const s = memory(accountSeed()), before = s.getItem('v5_gen');
  B.apply(s, B.parse(JSON.stringify({ version: 'v5', domStocks: [] })));
  a.equal(s.getItem('v5_gen'), before); a.equal(s.getItem('v5_dom'), '[]');
});
test('backup: malformed snapshot cost is rejected, not exported/restored as valid', () => {
  const b = valid(); b.storage.v5_snap = JSON.stringify({ gen: [{ ts: now, val: 200, cost: 'broken' }] });
  a.throws(() => B.parse(JSON.stringify(b)));
});
test('backup: malformed benchmark history is rejected before mutation', () => {
  for (const bad of [{ QQQ: {} }, { QQQ: [{ ts: now, close: 'broken' }] }, { QQQ: [{ ts: now, close: -1 }] }]) {
    const b = valid(); b.storage.v5_benchHist = JSON.stringify(bad); a.throws(() => B.parse(JSON.stringify(b)));
  }
});
test('backup: populated history, old missing cost and custom metadata survive exact roundtrip', () => {
  const s = memory(accountSeed());
  s.setItem('v5_snap', JSON.stringify({ gen: [{ ts: now - 86400000, val: 100 }, { ts: now, val: 200, cost: 140, auditTag: 'keep-verbatim' }] }));
  s.setItem('v5_benchHist', JSON.stringify({ QQQ: [{ ts: now, close: 300 }], KS200: [], SPY: [], fetchedAt: 'Tue Nov 10 2026', fetchedAtISO: new Date(now).toISOString() }));
  const target = memory(accountSeed()); B.apply(target, B.parse(JSON.stringify(valid(s))));
  a.equal(target.getItem('v5_snap'), s.getItem('v5_snap')); a.equal(target.getItem('v5_benchHist'), s.getItem('v5_benchHist'));
});
test('backup: damaged recovery journal refuses changes and remains byte-for-byte preserved', () => {
  const s = memory(accountSeed()); s.setItem(B.JOURNAL, '{not-json'); const before = s.all();
  a.throws(() => B.apply(s, B.parse('{"version":"v5","genStocks":[]}'))); a.deepEqual(s.all(), before);
});
test('backup: stale reviewed storage cannot silently overwrite intervening edits', () => {
  const s = memory(accountSeed()), p = B.parse('{"version":"v5","genStocks":[]}'); B.preview(s, p);
  s.setItem('v5_gen', JSON.stringify([stock({ quantity: 123 })])); const before = s.all();
  a.throws(() => B.apply(s, p)); a.deepEqual(s.all(), before);
});

function manual(extra = {}) { return stock({ pricingMode: 'manual', manualPrice: { value: 101, currency: 'KRW', unit: 'per-held-unit', priceAsOf: '2026-11-10T09:00:00Z', maxAgeDays: 1, ...extra } }); }
function evaluate(stocks, extra = {}) { return policy().evaluate({ key: 'gen', now, accounts: { gen: stocks, dom: [], ov: [], pen: [] }, freshPrice: {}, quoteMeta: {}, quoteValues: {}, ...extra }); }
test('snapshot: manual price is distinct from current price and average cost', () => {
  const r = evaluate([manual()]); a.equal(r.ok, true); a.equal(r.snapshot.val, 202); a.equal(r.snapshot.cost, 140);
  a.equal(r.snapshot.quality, 'unconfirmed'); a.equal(r.snapshot.signalHold, true); a.equal(r.snapshot.priceAsOf, '2026-11-10T09:00:00Z');
});
test('snapshot: malformed type, stale/future/calendar-invalid asOf and currency mismatch reject', () => {
  for (const bad of [{ value: '101' }, { value: Infinity }, { value: -1 }, { value: 0 }, { priceAsOf: '2026-02-30T09:00:00Z' }, { priceAsOf: '2026-11-11T09:00:00Z' }, { priceAsOf: '2026-11-01T09:00:00Z' }, { priceAsOf: '' }, { currency: 'USD' }, { unit: 'per-gram' }, { maxAgeDays: '1' }, { maxAgeDays: 5 }]) a.equal(evaluate([manual(bad)]).ok, false, JSON.stringify(bad));
});
test('snapshot: currentPrice or avgPrice alone never fabricates a refreshed quote', () => {
  a.equal(evaluate([stock()]).ok, false); a.equal(evaluate([stock({ currentPrice: 0 })]).ok, false);
});
test('snapshot: later manual edits invalidate prior quote evidence', () => {
  const extra = { freshPrice: { 'KR:AAA': true }, quoteMeta: { 'KR:AAA': now - 1000 }, quoteValues: { 'KR:AAA': 100 } };
  a.equal(evaluate([stock()], extra).ok, true); a.equal(evaluate([stock({ currentPrice: 101 })], extra).ok, false);
});
test('snapshot: overseas holdings need explicit captured FX, never fallback FX', () => {
  const s = manual({ currency: 'USD' }), base = { key: 'ov', accounts: { ov: [s], gen: [], dom: [], pen: [] } };
  a.equal(evaluate([], { ...base, fx: 1370 }).ok, false);
  const evidence = { ...base, fx: 1400, quoteMeta: { FX: now - 1000 }, quoteValues: { FX: 1400 } };
  const r = evaluate([], evidence); a.equal(r.ok, true); a.equal(r.snapshot.val, 282800); a.equal(r.snapshot.priceAsOf, null);
  a.equal(evaluate([], { ...evidence, fx: 1401 }).ok, false);
});
test('snapshot: same-day append refuses replacement and preserves metadata byte-for-byte', () => {
  const next = evaluate([manual()]).snapshot, rows = [{ ts: now - 1000, val: 123, cost: 100, unknown: { preserve: true } }], original = JSON.stringify(rows);
  const r = policy().appendDaily(rows, next); a.equal(r.ok, false); a.equal(JSON.stringify(rows), original);
});
test('snapshot: legacy absent cost remains intact while a later day appends', () => {
  const next = evaluate([manual()]).snapshot, rows = [{ ts: now - 86400000, val: 123 }], original = JSON.stringify(rows);
  const r = policy().appendDaily(rows, next); a.equal(r.ok, true); a.equal(r.records.length, 2); a.equal(JSON.stringify(rows), original); a.deepEqual(r.records[0], rows[0]);
});
test('snapshot: impossible totals fail rather than becoming Infinity or fabricated zero', () => {
  a.equal(evaluate([manual({ value: 1e12 })].map(s => ({ ...s, quantity: 1e12 }))).ok, false);
  a.equal(evaluate([manual()].map(s => ({ ...s, quantity: NaN }))).ok, false);
});

// Evaluate the actual HTML script, not copied application functions. All entrypoint and
// network scheduling stays inert until a test explicitly invokes a selected function.
function appHarness() {
  const { JSDOM } = require('jsdom');
  const html = fs.readFileSync(path.join(ROOT, 'portfolio_v5.html'), 'utf8');
  const dom = new JSDOM(html, { runScripts: 'outside-only', url: 'https://offline.invalid/' }), w = dom.window;
  const storage = memory(accountSeed());
  Object.defineProperty(w, 'localStorage', { value: storage }); Object.defineProperty(w, 'sessionStorage', { value: memory() });
  for (const n of ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'open']) w[n] = () => { throw new Error('Unexpected external action: ' + n); };
  w.setTimeout = w.setInterval = w.requestAnimationFrame = () => 1; w.clearTimeout = w.clearInterval = () => {};
  w.confirm = () => true; w.alert = () => {}; w.TextEncoder = TextEncoder;
  const no = () => {}, context = new Proxy({}, { get: () => no, set: () => true });
  w.HTMLCanvasElement.prototype.getContext = () => context; w.HTMLElement.prototype.scrollIntoView = no;
  const events = []; w.addEventListener = (name, fn) => events.push({ name, fn });
  const docListen = w.document.addEventListener.bind(w.document); w.document.addEventListener = (name, fn, opts) => { if (name !== 'DOMContentLoaded') docListen(name, fn, opts); };
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) if (!/\bsrc\s*=/.test(m[1]) && m[2].trim()) w.eval(m[2]);
  for (const file of ['has/snapshot-policy.js', 'backup/core.js']) w.eval(fs.readFileSync(path.join(ROOT, file), 'utf8'));
  w.renderAll = no; w.updateHeaderH = no; w.loadRiskData = no; w.fetchMarketIndices = no;
  w.domStocks = []; w.ovStocks = []; w.penStocks = []; w.genStocks = [];
  w.snapshots = { all: [], dom: [], ov: [], pen: [], gen: [] }; w.deposits = { dom: [], ov: [], pen: [], gen: [] }; w.divList = [];
  return { dom, w, storage, html, events, close: () => dom.window.close() };
}
test('runtime HTML: recordSnap refuses missing quote without modifying stored snapshot', () => {
  const h = appHarness(); try {
    h.w.genStocks = [stock()]; const before = h.storage.all(); h.w.recordSnap('gen');
    a.equal(h.w.snapshots.gen.length, 0); a.deepEqual(h.storage.all(), before);
  } finally { h.close(); }
});
test('runtime HTML: manual snapshot records explicit value and preserves same-day point', () => {
  const h = appHarness(); try {
    const ts = Date.now(), s = manual({ priceAsOf: new Date(ts - 1000).toISOString() }); h.w.genStocks = [s];
    h.w.recordSnap('gen'); a.equal(h.w.snapshots.gen.length, 1); a.equal(h.w.snapshots.gen[0].val, 202);
    const text = JSON.stringify(h.w.snapshots.gen); h.w.genStocks[0].manualPrice.value = 150; h.w.recordSnap('gen'); a.equal(JSON.stringify(h.w.snapshots.gen), text);
  } finally { h.close(); }
});

test('runtime HTML: explicit manual controls reject blank asOf and preserve entered units', () => {
  const h = appHarness(); try {
    const section = h.w.document.createElement('div'); section.innerHTML = h.w.renderManualPriceForm(stock(), 'gen'); h.w.document.body.append(section);
    const e = id => h.w.document.getElementById(id);
    e('epm_gen_1').value = 'manual'; h.w.toggleManualPriceFields('gen', 1); a.equal(e('epf_gen_1').hidden, false);
    e('emp_gen_1').value = '123.45'; a.equal(h.w.readManualPriceForm('gen', 1).ok, false);
    e('emas_gen_1').value = h.w.manualLocalInput(new Date(Date.now() - 10000).toISOString());
    const result = h.w.readManualPriceForm('gen', 1); a.equal(result.ok, true, JSON.stringify({result,entered:e('emas_gen_1').value})); a.equal(result.manualPrice.value, 123.45); a.equal(result.manualPrice.currency, 'KRW'); a.equal(result.manualPrice.unit, 'per-held-unit');
  } finally { h.close(); }
});
test('runtime HTML: prepared restore blocks loads, saves, recording and scheduled fetch entrypoints', () => {
  const h = appHarness(); try {
    const beforeAccount = h.storage.getItem('v5_gen');
    h.storage.setItem(B.JOURNAL, JSON.stringify({ version: 2, status: 'prepared', before: { v5_gen: beforeAccount }, after: { v5_gen: '[]' } }));
    const before = h.storage.all(); h.w.genStocks = [manual({ priceAsOf: new Date(Date.now() - 1000).toISOString() })];
    for (const fn of [() => h.w.load(), () => h.w.save(), () => h.w.safeSet('v5_gen', '[]'), () => h.w.quietSet('v5_fg', '50'), () => h.w.recordSnap('gen'), () => h.w.autoSnapshot(), () => h.w.fetchKR(), () => h.w.fetchUS(), () => h.w.fetchFX(), () => h.w.fetchBenchmarkHistory(true)]) fn();
    a.deepEqual(h.storage.all(), before); a.equal(h.w.document.querySelectorAll('script[src*="callback="]').length, 0);
  } finally { h.close(); }
});
test('runtime HTML: restored benchmark values refresh runtime memory with rendering stubbed', async () => {
  const h = appHarness(); try {
    h.w.load(); h.w.eval(fs.readFileSync(path.join(ROOT, 'backup/ui.js'), 'utf8'));
    h.w.benchmarkHistory = { KS200: [{ ts: now, close: 1 }], NDX: [{ ts: now, close: 2 }], SPY: [] };
    const source = memory(accountSeed()); source.setItem('v5_benchHist', JSON.stringify({ KS200: [{ ts: now, close: 300 }], QQQ: [{ ts: now, close: 400 }], SPY: [] }));
    const text = JSON.stringify(valid(source)); await h.w.importData({ target: { value: 'synthetic', files: [{ size: Buffer.byteLength(text), text: async () => text }] } });
    const apply = [...h.w.document.querySelectorAll('#portfolioRestorePreview button')].find(b => b.textContent === '복원 적용'); a.ok(apply); apply.click();
    a.equal(h.w.benchmarkHistory.NDX[0].close, 400); a.equal(h.w.benchmarkHistory.KS200[0].close, 300);
    a.equal(h.w.document.querySelectorAll('script[src*="callback="]').length, 0);
  } finally { h.close(); }
});
test('runtime HTML: restore, undo and reload preserve legacy pension labels and theme maps exactly', async () => {
  const h = appHarness(); try {
    const original = JSON.stringify([stock({ ticker: 'DEP_PEN_계좌2', name: 'Synthetic prior pension cash' })]);
    const themes = JSON.stringify({ 'DEP_PEN_계좌2': 'Synthetic old theme', 'DEP_PEN_계좌1': 'Synthetic incoming theme' });
    h.storage.setItem('v5_pen', original); h.storage.setItem('v5_userThemeMap', themes);
    h.w.load(); a.equal(h.storage.getItem('v5_pen'), original); a.equal(h.storage.getItem('v5_userThemeMap'), themes); h.w.eval(fs.readFileSync(path.join(ROOT, 'backup/ui.js'), 'utf8'));
    const pen = [stock({ ticker: 'DEP_PEN_계좌1', name: 'Synthetic legacy pension cash' })];
    const text = JSON.stringify({ version: 'v5', penStocks: pen });
    await h.w.importData({ target: { value: 'synthetic', files: [{ size: Buffer.byteLength(text), text: async () => text }] } });
    const apply = [...h.w.document.querySelectorAll('#portfolioRestorePreview button')].find(b => b.textContent === '복원 적용'); a.ok(apply); apply.click();
    a.equal(h.storage.getItem('v5_pen'), JSON.stringify(pen), 'restore refresh must not run a second unreviewed migration');
    h.w.load(); a.equal(h.storage.getItem('v5_pen'), JSON.stringify(pen)); a.equal(h.storage.getItem('v5_userThemeMap'), themes);
    a.doesNotThrow(() => h.w.KSTPortfolioBackup.undo(h.storage)); h.w.load();
    a.equal(h.storage.getItem('v5_pen'), original); a.equal(h.storage.getItem('v5_userThemeMap'), themes);
  } finally { h.close(); }
});
test('runtime HTML: quote callback captured before runtime invalidation cannot mutate restored holdings', () => {
  const h = appHarness(); try {
    h.w.ovStocks = [stock()]; h.w.gasUrl = 'https://synthetic.invalid/exec'; h.w.fetchUS();
    const script = h.w.document.querySelector('script[src*="callback=gas_us_"]'); a.ok(script);
    const cb = new URL(script.src).searchParams.get('callback'), callback = h.w[cb];
    h.w.invalidateBackupRuntime(); h.w.ovStocks = [stock({ quantity: 7, currentPrice: 555 })]; const before = h.storage.all(); callback({ AAA: 999 });
    a.equal(h.w.ovStocks[0].currentPrice, 555); a.deepEqual(h.storage.all(), before); a.equal(h.w.snapshotQuoteValues['US:AAA'], undefined);
  } finally { h.close(); }
});
test('runtime HTML: stale errors and already-scheduled retries remain cancelled after restore', () => {
  const h = appHarness(); try {
    const timers = []; h.w.setTimeout = (fn, delay) => { timers.push({ fn, delay }); return timers.length; };
    h.w.ovStocks = [stock()]; h.w.gasUrl = 'https://synthetic.invalid/exec'; h.w.fetchUS();
    let script = h.w.document.querySelector('script[src*="callback=gas_us_"]'); a.ok(script);
    script.onerror(); const retry = timers.find(t => t.delay === 3000); a.ok(retry);
    h.w.invalidateBackupRuntime(); retry.fn(); a.equal(h.w.document.querySelectorAll('script[src*="callback=gas_us_"]').length, 0);
    h.w.fetchUS(); script = h.w.document.querySelector('script[src*="callback=gas_us_"]'); a.ok(script);
    h.w.invalidateBackupRuntime(); const count = timers.length; script.onerror(); a.equal(timers.length, count);
  } finally { h.close(); }
});
test('integration: same ticker under distinct holding IDs remains backupable after recording', () => {
  const holdings = [manual(), { ...manual(), id: 2 }], result = evaluate(holdings); a.equal(result.ok, true);
  const source = memory(accountSeed()); source.setItem('v5_gen', JSON.stringify(holdings)); source.setItem('v5_snap', JSON.stringify({ gen: [result.snapshot] }));
  const target = memory(accountSeed()); B.apply(target, B.parse(JSON.stringify(valid(source)))); a.equal(target.getItem('v5_snap'), source.getItem('v5_snap'));
});

function gasHarness() {
  class FixedDate extends Date { static now() { return now + 1000; } }
  const ctx = { JSON, Date: FixedDate, Math, Number, String, Array, Object, isFinite, encodeURIComponent,
    Utilities: { formatDate: (d, tz) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) },
    UrlFetchApp: { fetch() { throw new Error('No live GAS fetch allowed'); } } };
  vm.createContext(ctx); vm.runInContext(fs.readFileSync(path.join(ROOT, 'gas/has-history-request.gs'), 'utf8'), ctx); return ctx;
}
function yahoo(extra = {}) {
  const meta = { symbol: 'QQQ', currency: 'USD', fullExchangeName: 'NasdaqGM', exchangeName: 'NGM', exchangeTimezoneName: 'America/New_York', instrumentType: 'ETF', dataGranularity: '1d', regularMarketTime: now / 1000, regularMarketPrice: 100, fiftyTwoWeekHigh: 110, ...(extra.meta || {}) };
  return JSON.stringify({ chart: { result: [{ meta, timestamp: extra.ts || [(now - 86400000) / 1000, now / 1000], indicators: { quote: [{ close: extra.close || [99, 100] }] } }] } });
}
test('GAS: repository preferred-share ticker 00680K is supported without widening foreign venues', () => {
  const g = gasHarness(); a.equal(g.hasHistoryTicker_('00680K', 'KR'), true); a.ok(g.hasHistoryIdentity_('00680K.KS', 'KR')); a.equal(g.hasHistoryTicker_('QQQ', 'KR'), false);
});
test('GAS: positive control accepts coherent metadata and preserves raw close', () => {
  const g = gasHarness(), r = g.hasParseYahooChart_(yahoo(), 'QQQ', 'US'); a.ok(r); a.equal(r.symbol, 'QQQ'); a.equal(r.bars[1].c, 100); a.equal(r.adjustment, 'unverified');
});
test('GAS: wrong returned symbol or currency cannot masquerade as requested QQQ', () => {
  const g = gasHarness(); for (const meta of [{ symbol: 'SPY' }, { symbol: '' }, { currency: 'KRW' }]) a.equal(g.hasParseYahooChart_(yahoo({ meta }), 'QQQ', 'US'), null);
});
test('GAS: non-finite/overflow/zero-after-rounding close never escapes numeric boundary', () => {
  const g = gasHarness();
  for (const close of [[1e308, 100], [0.00001, 100]]) {
    const r = g.hasParseYahooChart_(yahoo({ close }), 'QQQ', 'US'); a.ok(r === null || r.bars.every(b => Number.isFinite(b.c) && b.c > 0));
  }
});
test('GAS: invalid timestamp is rejected without parser throwing', () => {
  const g = gasHarness();
  for (const ts of [[1e308, now / 1000], [-1e308, now / 1000]]) a.doesNotThrow(() => { const r = g.hasParseYahooChart_(yahoo({ ts }), 'QQQ', 'US'); a.equal(r, null); });
});
test('all verification paths made zero external network attempts', () => { a.equal(globalThis.__hasNoNetworkInstalled.attempts.length, 0); });
