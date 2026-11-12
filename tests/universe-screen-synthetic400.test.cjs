'use strict';
/* GPT-20261112-1630: 합성 400종목으로 GAS 야간 계산 초안을 오프라인 검증한다.
 * 실제 GAS·시세·편입종목 없음. 통과는 실제 Apps Script 작동을 뜻하지 않는다. */
const { test } = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs'), zlib = require('node:zlib'), crypto = require('node:crypto');
const S = require('./lib/synthetic-universe-400.test-only.cjs'), C = require('../has/universe-screen.js');
const START = Date.parse('2026-11-12T06:00:00Z'), END_DAY = '2026-11-11';

function gas(opts = {}) {
  const data = {}; let id = 0, clock = START, failSet = 0, calls = [];
  const FD = class extends Date { constructor(...a) { a.length ? super(...a) : super(clock); } static now() { return clock; } };
  const blob = b => ({ getBytes: () => Buffer.from(b), getDataAsString: () => Buffer.from(b).toString() });
  const props = { getProperty: k => Object.prototype.hasOwnProperty.call(data, k) ? data[k] : null, getProperties: () => ({ ...data }), setProperties: x => { if (failSet > 0) { failSet--; const k = Object.keys(x)[0]; data[k] = x[k]; throw Error('quota'); } Object.assign(data, x); }, setProperty: (k, v) => { data[k] = v; }, deleteProperty: k => { delete data[k]; } };
  const out = (t) => ({ text: t, mime: null, setMimeType(m) { this.mime = m; return this; } });
  const c = {
    PropertiesService: { getScriptProperties: () => props },
    Utilities: { getUuid: () => crypto.createHash('md5').update(String(++id)).digest('hex'), newBlob: b => blob(b), gzip: b => blob(zlib.gzipSync(b.getBytes())), ungzip: b => blob(zlib.gunzipSync(b.getBytes())), base64Encode: b => Buffer.from(b).toString('base64'), base64Decode: b => Buffer.from(b, 'base64'), DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { US_ASCII: 'ascii' }, computeDigest: (a, t) => Array.from(crypto.createHash(a).update(t, 'ascii').digest(), x => x > 127 ? x - 256 : x) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    ContentService: { createTextOutput: out, MimeType: { JAVASCRIPT: 'js', JSON: 'json' } },
    UrlFetchApp: { fetch() { throw Error('network-forbidden'); } },
    Date: FD, JSON, Number, Math, Object, Array, String, Error, Set, Map, URL, Intl
  };
  c.globalThis = c;
  vm.createContext(c);
  vm.runInContext(fs.readFileSync('has/live-price-reference.js', 'utf8'), c);
  vm.runInContext(fs.readFileSync('has/universe-screen.js', 'utf8'), c);
  vm.runInContext(fs.readFileSync('gas/has-history-request.gs', 'utf8'), c);
  vm.runInContext(fs.readFileSync('gas/has-universe-screen.gs', 'utf8'), c);
  // 실제 Yahoo 호출 대신 합성 기록. 묶음당 opts.cost ms 만큼 시계를 진행.
  c.hasGetHistories_ = (tickers, market) => {
    calls.push(tickers); clock += opts.cost || 20000;
    if (opts.failTickers && tickers.split(',').some(t => opts.failTickers.includes(t))) throw Error('fetch-failed');
    const o = {}; tickers.split(',').forEach((t, i) => { o[t] = (opts.mutate || (r => r))(S.record(t, market, END_DAY, i + t.length), t); }); return o;
  };
  return { c, data, calls, tick: ms => { clock += ms; }, failNextSet: n => { failSet = n; }, get clock() { return clock; } };
}
function manifest() { return C.buildUniverse(S.input()); }
function runAll(e) { let r; for (let i = 0; i < 80; i++) { r = e.c.hasScreenStep_(); if (r.status !== 'partial') break; } return r; }
function respond(e, cb) { return e.c.hasScreenResponse_(cb); }
function body(o) { const m = /^[A-Za-z_][A-Za-z0-9_]*\((.*)\)$/s.exec(o.text); return JSON.parse(m ? m[1] : o.text); }

test('synthetic fixture: labelled test-only, KR 200 / US 200, unique, valid format, no overlap with real KOSPI200 snapshot', () => {
  assert.equal(S.META.synthetic, true); assert.equal(S.META.testOnly, true); assert.match(S.SOURCE.url, /example\.invalid\/synthetic-test-only/);
  const u = manifest();
  const core = u.members.filter(x => x.scope === 'core');
  assert.equal(core.filter(x => x.market === 'KR').length, 200); assert.equal(core.filter(x => x.market === 'US').length, 200);
  assert.equal(new Set(u.members.map(x => x.market + ':' + x.ticker)).size, 400);
  assert(u.members.every(x => x.market === 'KR' ? /^9ZZ\d{3}$/.test(x.ticker) : /^ZSYN\d{3}$/.test(x.ticker)));
  assert(u.sources.every(s => s.source.version.includes('synthetic')));
  assert.equal(u.provenance, 'declared-snapshot-not-independently-verified');
  const real = fs.readFileSync('radar/data/kospi200-20261112.json', 'utf8');
  assert(!/9ZZ\d{3}|ZSYN\d{3}/.test(real));
  assert(!fs.existsSync('radar/data/universe-400.json'), '공식 원본 확보 전에는 universe-400.json을 만들지 않는다');
  // S&P100 겹침 20 → 합집합 180, 나머지 20은 S&P500 시총순 보충(ZSYN180..199).
  assert(u.members.some(x => x.ticker === 'ZSYN199')); assert(!u.members.some(x => x.ticker === 'ZSYN200'));
});

test('batches: 34 batches, each <=12 and single market; GAS step never fetches more than 12 tickers', () => {
  const bs = C.batches(manifest()); assert.equal(bs.length, 34); assert(bs.every(b => b.length <= 12 && new Set(b.map(x => x.market)).size === 1));
  const e = gas(); e.c.hasScreenStart_(manifest()); const r = runAll(e);
  assert.equal(r.status, 'published');
  const stockCalls = e.calls.filter(t => t !== '069500' && t !== 'SPY');
  assert.equal(stockCalls.length, 34); assert(stockCalls.every(t => t.split(',').length <= 12));
});

test('full synthetic run publishes one complete generation; storage stays within assumed limits', t => {
  const e = gas(); e.data.USER_SETTING = 'keep'; e.c.hasScreenStart_(manifest()); runAll(e);
  const s = body(respond(e, 'cb'));
  assert.equal(s.total, 400); assert.equal(s.referenceCount, 400); assert.equal(s.complete, true);
  assert.deepEqual(s.buyCandidates, []); assert(s.items.every(r => r.opinion === '판단 보류' && r.signalHold === true && r.returns['12'].value === null));
  assert.equal(e.data.USER_SETTING, 'keep');
  assert(Object.entries(e.data).every(([k, v]) => k === 'USER_SETTING' || v.length <= 8000));
  const pub = JSON.parse(e.data.HAS_SCREEN_PUBLIC_HEAD), work = JSON.parse(e.data.HAS_SCREEN_WORK_HEAD);
  assert(pub.count <= 15 && work.count <= 15, JSON.stringify({ pub, work }));
  assert(JSON.stringify(e.data).length < 430000);
  assert(respond(e, 'cb').text.length < 600000);
  t.diagnostic('sizes ' + JSON.stringify({ publicChunks: pub.count, publicChars: pub.len, workChunks: work.count, workChars: work.len, allPropsChars: JSON.stringify(e.data).length, responseChars: respond(e, 'cb').text.length }));
  // 남은 조각은 현재 HEAD 것뿐(이전 세대 조각 삭제됨)
  for (const slot of ['WORK', 'PUBLIC']) { const h = JSON.parse(e.data['HAS_SCREEN_' + slot + '_HEAD']); const keys = Object.keys(e.data).filter(k => k.startsWith('HAS_SCREEN_' + slot + '_') && !k.endsWith('HEAD')); assert.equal(keys.length, h.count); assert(keys.every(k => k.includes(h.id))); }
});

test('partial generation never replaces previous PUBLIC; response keeps old complete generation until new one finishes', () => {
  const e = gas(); e.c.hasScreenStart_(manifest()); runAll(e);
  const first = body(respond(e)).generation;
  e.tick(26 * 3600000); e.c.hasScreenStart_(manifest());
  for (let i = 0; i < 10; i++) assert.equal(e.c.hasScreenStep_().status, 'partial');
  assert.equal(body(respond(e)).generation, first);
  runAll(e); assert.notEqual(body(respond(e)).generation, first);
});

test('fetch failure in a batch → rows missing, summary explicitly incomplete, nothing dropped', () => {
  const e = gas({ failTickers: ['ZSYN005'] }); e.c.hasScreenStart_(manifest()); runAll(e);
  const s = body(respond(e));
  assert.equal(s.complete, false); assert.equal(s.missingCount, 12); assert.equal(s.referenceCount, 388); assert.equal(s.total, 400);
  assert(s.items.filter(r => r.status === 'missing').every(r => r.opinion === '판단 보류' && r.price === undefined));
});

test('storage failure mid-run → resume next step without duplicate rows', () => {
  const e = gas(); e.c.hasScreenStart_(manifest());
  for (let i = 0; i < 5; i++) e.c.hasScreenStep_();
  e.failNextSet(1); assert.throws(() => e.c.hasScreenStep_(), /quota/);
  const r = runAll(e); assert.equal(r.status, 'published'); assert.equal(r.done, 400);
  const s = body(respond(e)); assert.equal(s.total, 400); assert.equal(new Set(s.items.map(x => x.ticker)).size, 400);
});

test('run budget: stops before 6-minute GAS limit and resumes on next trigger', () => {
  const e = gas({ cost: 40000 }); e.c.hasScreenStart_(manifest());
  const t0 = e.clock, r = e.c.hasScreenRun_();
  assert.equal(r.stoppedForTime, true); assert(e.clock - t0 <= 300000, 'elapsed ' + (e.clock - t0)); assert(r.steps >= 2 && r.steps < 34);
  let last; for (let i = 0; i < 40; i++) { last = e.c.hasScreenRun_(); if (last.status === 'published') break; }
  assert.equal(last.status, 'published');
  const done = e.c.hasScreenRun_(9e9); assert.equal(done.status, 'finished'); assert.equal(done.steps, 1);
});

test('integrity: tampered chunk with same length is rejected; response shows unavailable, never data', () => {
  const e = gas(); e.c.hasScreenStart_(manifest()); runAll(e);
  const h = JSON.parse(e.data.HAS_SCREEN_PUBLIC_HEAD), k = 'HAS_SCREEN_PUBLIC_' + h.id + '_0', v = e.data[k];
  e.data[k] = v.slice(0, 100) + (v[100] === 'A' ? 'B' : 'A') + v.slice(101);
  assert.throws(() => e.c.hasScreenRead_('PUBLIC'), /screen-integrity/);
  assert.deepEqual(body(respond(e, 'cb')), { error: 'screen-unavailable' });
  const e2 = gas(); e2.c.hasScreenStart_(manifest()); runAll(e2);
  const h2 = JSON.parse(e2.data.HAS_SCREEN_PUBLIC_HEAD); h2.sha256 = 'f'.repeat(64); e2.data.HAS_SCREEN_PUBLIC_HEAD = JSON.stringify(h2);
  assert.deepEqual(body(respond(e2)), { error: 'screen-unavailable' });
  delete h2.sha256; e2.data.HAS_SCREEN_PUBLIC_HEAD = JSON.stringify(h2);
  assert.throws(() => e2.c.hasScreenRead_('PUBLIC'), /screen-invalid-pointer/);
});

test('callback: only safe identifiers become JSONP; malicious callbacks get plain JSON, never echoed', () => {
  const e = gas(); e.c.hasScreenStart_(manifest()); runAll(e);
  const ok = respond(e, 'hasScreenCb_1'); assert.equal(ok.mime, 'js'); assert(ok.text.startsWith('hasScreenCb_1({'));
  for (const bad of ['alert(1);x', 'a.b', '__proto__', 'constructor', 'x'.repeat(80), '</script><script>', 'cb ', '', null, undefined, 123]) {
    const o = respond(e, bad); assert.equal(o.mime, 'json'); assert(o.text.startsWith('{'), String(bad)); if (typeof bad === 'string' && bad) assert(!o.text.includes(bad));
  }
  assert(!/[<>]/.test(ok.text));
});

test('expired / oversize / private rows / buy candidates are not served', () => {
  const e = gas(); e.c.hasScreenStart_(manifest()); runAll(e);
  e.tick(3 * 86400000); assert.deepEqual(body(respond(e)), { error: 'screen-expired' });
  const e2 = gas(); e2.c.hasScreenStart_(manifest()); runAll(e2);
  const s = e2.c.hasScreenRead_('PUBLIC'); s.items[0].scope = 'extra'; e2.c.hasScreenStore_('PUBLIC', s);
  assert.deepEqual(body(respond(e2)), { error: 'screen-unavailable' });
  s.items[0].scope = 'core'; s.buyCandidates = ['9ZZ000']; e2.c.hasScreenStore_('PUBLIC', s);
  assert.deepEqual(body(respond(e2)), { error: 'screen-unavailable' });
  s.buyCandidates = []; s.items[0].reason = 'x'.repeat(700000); e2.c.hasScreenStore_('PUBLIC', s);
  assert.deepEqual(body(respond(e2)), { error: 'screen-too-large' });
  const e3 = gas(); assert.deepEqual(body(respond(e3)), { error: 'screen-not-published' });
  const m = manifest(); m.members.push({ market: 'US', ticker: 'MYHOLD', scope: 'extra' });
  assert.throws(() => e3.c.hasScreenStart_(m), /private-extras/);
});

test('basis mismatch (currency, exchange, symbol, timezone) → 판단 보류 with no price; benchmark currency mismatch → no excess return', () => {
  const t = { market: 'KR', ticker: '9ZZ001', scope: 'core' }, now = START;
  for (const bad of [{ currency: 'USD' }, { exchange: 'NMS' }, { symbol: '9ZZ001.KQ' }, { timezone: 'America/New_York' }, { adjustment: 'adjusted' }]) {
    const r = C.summarize(t, { ...S.record('9ZZ001', 'KR', END_DAY, 1), ...bad }, null, now);
    assert.equal(r.status, 'missing', JSON.stringify(bad)); assert.equal(r.opinion, '판단 보류'); assert.equal(r.price, undefined);
  }
  const b = { record: { ...S.record('SPY', 'US', END_DAY, 3) }, ticker: 'SPY', market: 'US' };
  const r = C.summarize(t, S.record('9ZZ001', 'KR', END_DAY, 1), b, now);
  assert.equal(r.status, 'reference'); assert([1, 3, 6].every(n => r.returns[n].excessPct === null && r.returns[n].benchmarkReturn === null));
  assert.equal(r.returns['12'].value, null);
  const stale = C.summarize(t, S.record('9ZZ001', 'KR', '2026-10-20', 1), null, now); assert.equal(stale.status, 'stale');
});

test('type=screen draft does not collide with existing GAS history code (no doGet, no shared global names)', () => {
  const names = f => new Set([...fs.readFileSync(f, 'utf8').matchAll(/^(?:function\s+([A-Za-z_$][\w$]*)|var\s+([A-Za-z_$][\w$]*))/gm)].map(m => m[1] || m[2]));
  const a = names('gas/has-universe-screen.gs'), b = names('gas/has-history-request.gs');
  assert([...a].every(n => !b.has(n)), [...a].filter(n => b.has(n)).join(','));
  assert(!a.has('doGet') && !a.has('doPost'));
  assert(!/UrlFetchApp|ScriptApp\.newTrigger|setProperty\(\s*['"](?!HAS_SCREEN)/.test(fs.readFileSync('gas/has-universe-screen.gs', 'utf8')));
  assert(!/type\s*===?\s*['"]screen/.test(fs.readFileSync('gas/has-history-request.gs', 'utf8')));
});
