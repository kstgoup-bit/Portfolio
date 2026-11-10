'use strict';
// Synthetic fixtures only. UrlFetchApp is a local stub; no live Yahoo/GAS calls.
const test = require('node:test');
const a = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'has-history-request.gs'), 'utf8');
const NOW = Date.parse('2026-11-10T12:00:00Z');
const sec = s => Date.parse(s) / 1000;
const TS = [sec('2026-11-05T14:30:00Z'), sec('2026-11-06T14:30:00Z'), sec('2026-11-09T14:30:00Z')];
class FixedDate extends Date { static now() { return NOW; } }
const fixture = (meta = {}) => ({ chart: { error: null, result: [{
  meta: { symbol: 'QQQ', currency: 'USD', exchangeName: 'NGM', fullExchangeName: 'NasdaqGM',
    exchangeTimezoneName: 'America/New_York', instrumentType: 'ETF', dataGranularity: '1d',
    regularMarketTime: sec('2026-11-09T21:00:00Z'), regularMarketPrice: 12, fiftyTwoWeekHigh: 15, ...meta },
  timestamp: [...TS], indicators: { quote: [{ close: [10.123456789, null, 12] }] }
}] } });
const row = f => f.chart.result[0];
const body = f => JSON.stringify(f);
const ok = text => ({ getResponseCode: () => 200, getContentText: () => text });
function load(fetchImpl = () => ok(body(fixture())), formatDate) {
  const calls = [];
  const ctx = {
    ContentService: { MimeType: { JSON: 'JSON', JAVASCRIPT: 'JS' }, createTextOutput: text => ({
      text, mime: null, setMimeType(mime) { this.mime = mime; return this; }
    }) },
    UrlFetchApp: { fetch(url, options) { calls.push({ url, options }); return fetchImpl(url, options); } },
    Utilities: { formatDate: formatDate || ((date, timeZone) => new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit'
    }).format(date)) },
    Date: FixedDate
  };
  vm.createContext(ctx); vm.runInContext(SRC, ctx); ctx.calls = calls;
  return ctx;
}
const parse = (f, symbol = 'QQQ', market = 'US', g = load()) => g.hasParseYahooChart_(body(f), symbol, market);
const request = (g, tickers = 'QQQ', market = 'US', callback = null) => g.hasHistoryResponse_({ parameter: { tickers, market } }, callback);
const json = r => JSON.parse(r.text);
const kr = (suffix = 'KS') => fixture({ symbol: '005930.' + suffix, currency: 'KRW', exchangeTimezoneName: 'Asia/Seoul',
  exchangeName: suffix === 'KS' ? 'KSC' : 'KOE', fullExchangeName: suffix === 'KS' ? 'KSE' : 'KOSDAQ', instrumentType: 'EQUITY' });

for (const field of ['symbol', 'currency', 'exchangeName', 'exchangeTimezoneName', 'instrumentType', 'dataGranularity']) {
  test('required metadata is not inferred: ' + field, () => {
    for (const value of [undefined, null, '', {}, [], 12]) {
      a.equal(parse(fixture({ [field]: value })), null, field + ':' + JSON.stringify(value));
    }
  });
}

test('matching requested symbol is required, never replace MSFT metadata with QQQ', () => {
  const g = load(() => ok(body(fixture({ symbol: 'MSFT' }))));
  a.deepEqual(json(request(g)), { QQQ: null });
  for (const symbol of ['qqq', 'QQQ.KS', 'QQQ\n', 'QQQ</script>', '']) a.equal(parse(fixture({ symbol })), null);
  a.equal(parse(fixture(), 'MSFT'), null);
  a.equal(parse(fixture(), 'QQQ', 'KR'), null);
  a.equal(load().hasParseYahooChart_(body(fixture()), 'QQQ'), null);
});

test('wrong currency, timezone, instrument, interval or exchange fails closed', () => {
  for (const meta of [
    { currency: 'KRW' }, { currency: 'USd' }, { currency: 'USD ' },
    { exchangeTimezoneName: 'UTC' }, { exchangeTimezoneName: 'Asia/Seoul' }, { exchangeTimezoneName: 'US/Eastern' },
    { exchangeName: 'KSC', fullExchangeName: 'KSE' }, { exchangeName: 'TYO', fullExchangeName: 'Tokyo' },
    { exchangeName: 'UNKNOWN' }, { fullExchangeName: 'KOSDAQ' }, { fullExchangeName: '</script><script>bad()</script>' },
    { fullExchangeName: 1 }, { fullExchangeName: '' }, { instrumentType: 'CURRENCY' }, { instrumentType: 'INDEX' },
    { instrumentType: 'CRYPTOCURRENCY' }, { dataGranularity: '1m' }, { dataGranularity: '1wk' }
  ]) a.equal(parse(fixture(meta)), null, JSON.stringify(meta));
});

test('known US exchange identities and missing display name do not invent official venue proof', () => {
  for (const [exchangeName, fullExchangeName] of [['NMS', 'NasdaqGS'], ['NGM', 'NasdaqGM'], ['NCM', 'NasdaqCM'],
    ['NYQ', 'NYSE'], ['ASE', 'NYSE American'], ['PCX', 'NYSEArca'], ['BATS', 'BATS']]) {
    const result = parse(fixture({ exchangeName, fullExchangeName }));
    a.equal(result.exchange, fullExchangeName); a.equal(result.source, 'yahoo-chart-v8'); a.equal(result.adjustment, 'unverified');
  }
  a.equal(parse(fixture({ fullExchangeName: undefined })).exchange, 'NGM');
});

test('Korean suffix, exchange, symbol, currency and timezone must agree', () => {
  for (const suffix of ['KS', 'KQ']) {
    const f = kr(suffix); a.equal(parse(f, '005930.' + suffix, 'KR').symbol, '005930.' + suffix);
    for (const meta of [{ symbol: '000660.' + suffix }, { currency: 'USD' }, { exchangeTimezoneName: 'America/New_York' },
      { exchangeName: suffix === 'KS' ? 'KOE' : 'KSC', fullExchangeName: suffix === 'KS' ? 'KOSDAQ' : 'KSE' },
      { exchangeName: 'NMS', fullExchangeName: 'NasdaqGS' }]) {
      const f2 = kr(suffix); Object.assign(row(f2).meta, meta); a.equal(parse(f2, '005930.' + suffix, 'KR'), null);
    }
  }
});

test('wrong-market KS result is discarded; only separately matched KQ response can be returned', () => {
  const g = load(() => ok(body(kr('KQ'))));
  a.equal(json(request(g, '005930', 'KR'))['005930'].symbol, '005930.KQ');
  a.equal(g.calls.length, 2); a.match(g.calls[0].url, /005930\.KS\?/); a.match(g.calls[1].url, /005930\.KQ\?/);
  const wrong = load(() => ok(body(kr('KS'))));
  a.equal(json(request(wrong, '000660', 'KR'))['000660'], null); a.equal(wrong.calls.length, 2);
});

test('repository alphanumeric KRX preferred-stock code 00680K is supported without relabeling', () => {
  const f = kr(); row(f).meta.symbol = '00680K.KS';
  a.equal(parse(f, '00680K.KS', 'KR').symbol, '00680K.KS');
  a.equal(parse(f, '005930.KS', 'KR'), null);
  const g = load(url => {
    const f2 = kr(); row(f2).meta.symbol = url.match(/chart\/([^?]+)/)[1]; return ok(body(f2));
  });
  const q = json(request(g, '005930,00680k', 'KR'));
  a.equal(q['005930'].symbol, '005930.KS'); a.equal(q['00680K'].symbol, '00680K.KS'); a.equal(g.calls.length, 2);
});

test('valid finite prices retain precision including formerly rounded-to-zero tiny prices', () => {
  const f = fixture(); row(f).indicators.quote[0].close = [0.00001, 1e-8, 1000000000000];
  const q = parse(f); a.deepEqual(JSON.parse(JSON.stringify(q.bars)).map(x => x.c), [0.00001, 1e-8, 1e12]);
  a.equal(parse(fixture()).bars[0].c, 10.123456789);
  a.ok(q.bars.every(b => Number.isFinite(b.c) && b.c > 0));
  a.equal(JSON.stringify(q).includes('"c":null'), false);
});

test('price domain rejects negative, zero, strings, booleans and finite overflow/underflow extremes', () => {
  for (const value of [0, -0, -1, '12', true, [], {}, 1e308, Number.MAX_VALUE, Number.MIN_VALUE, 0.999e-8, 1e12 + 1]) {
    const f = fixture(); row(f).indicators.quote[0].close[1] = value;
    a.equal(parse(f), null, String(value));
  }
  const overflow = body(fixture()).replace('10.123456789', '1e999');
  a.equal(load().hasParseYahooChart_(overflow, 'QQQ', 'US'), null);
});

test('optional price metadata is null when absent but malformed supplied values reject the payload', () => {
  for (const field of ['regularMarketPrice', 'fiftyTwoWeekHigh']) {
    for (const value of [undefined, null]) a.equal(parse(fixture({ [field]: value }))[field], null);
    for (const value of [-1, 0, '15', true, {}, [], 1e308, 1e-12]) a.equal(parse(fixture({ [field]: value })), null);
    a.equal(load().hasParseYahooChart_(body(fixture()).replace('"' + field + '":' + (field === 'regularMarketPrice' ? 12 : 15), '"' + field + '":1e999'), 'QQQ', 'US'), null);
  }
});

test('null close placeholders create no values and an all-null/single-price history is rejected', () => {
  for (const close of [[null, null, null], [null, 10, null]]) {
    const f = fixture(); row(f).indicators.quote[0].close = close; a.equal(parse(f), null);
  }
  const q = parse(fixture()); a.equal(q.barCount, 2); a.deepEqual(Array.from(q.bars, b => b.d), ['2026-11-05', '2026-11-09']);
});

test('exact duplicate rows are collapsed and sorted; same-date conflicts never use last-wins', () => {
  const f = fixture(); row(f).timestamp = [TS[2], TS[0], TS[2]]; row(f).indicators.quote[0].close = [12, 10, 12];
  const q = parse(f); a.equal(q.barCount, 2); a.deepEqual(Array.from(q.bars, b => b.d), ['2026-11-05', '2026-11-09']);
  for (const [seconds, close] of [[TS[2], 13], [TS[2] + 60, 12], [TS[2], null]]) {
    const bad = fixture(); row(bad).timestamp = [TS[0], TS[2], seconds]; row(bad).indicators.quote[0].close = [10, 12, close];
    a.equal(parse(bad), null);
    row(bad).timestamp.reverse(); row(bad).indicators.quote[0].close.reverse(); a.equal(parse(bad), null);
  }
});

test('malformed envelopes, arrays and mismatched lengths are rejected', () => {
  const mutations = [
    f => { f.chart.error = { description: 'error' }; }, f => { f.chart.error = false; }, f => { f.chart.result = {}; },
    f => { f.chart.result.push(row(f)); }, f => { f.chart.result = []; }, f => { f.chart.result[0] = null; },
    f => { row(f).meta = []; }, f => { row(f).indicators = []; }, f => { row(f).indicators.quote = {}; },
    f => { row(f).indicators.quote.push({ close: [1, 2, 3] }); }, f => { row(f).indicators.quote[0] = null; },
    f => { row(f).timestamp = { 0: TS[0], 1: TS[2], length: 2 }; }, f => { row(f).timestamp.pop(); },
    f => { row(f).timestamp = []; row(f).indicators.quote[0].close = []; },
    f => { row(f).indicators.quote[0].close = '1,2,3'; }, f => { delete row(f).indicators.quote[0].close; }
  ];
  for (const mutate of mutations) { const f = fixture(); mutate(f); a.equal(parse(f), null, String(mutate)); }
  for (const text of ['null', '[]', '{}', '{', '{"chart":null}', '{"chart":{"result":null}}']) a.equal(load().hasParseYahooChart_(text, 'QQQ', 'US'), null);
});

test('primitive response type and response-size limit are enforced before parsing', () => {
  let coerced = false;
  for (const text of [null, {}, [], new String(body(fixture())), { toString() { coerced = true; return body(fixture()); } }]) {
    a.equal(load().hasParseYahooChart_(text, 'QQQ', 'US'), null);
  }
  a.equal(coerced, false);
  const g = load(); a.equal(g.hasParseYahooChart_(' '.repeat(g.HAS_HISTORY_MAX_RESPONSE_CHARS + 1), 'QQQ', 'US'), null);
  const f = fixture(); row(f).meta.unused = 'x'.repeat(g.HAS_HISTORY_MAX_RESPONSE_CHARS); a.equal(parse(f), null);
});

test('row cap applies before deduplication and excessive history span is rejected', () => {
  const f = fixture(); row(f).timestamp = Array(401).fill(TS[0]); row(f).indicators.quote[0].close = Array(401).fill(10);
  a.equal(parse(f), null);
  row(f).timestamp = Array(400).fill(TS[0]); row(f).timestamp[399] = TS[2]; row(f).indicators.quote[0].close = Array(400).fill(10);
  a.equal(parse(f).barCount, 2);
  const long = fixture(); row(long).timestamp[0] = TS[2] - 371 * 86400; a.equal(parse(long), null);
  row(long).timestamp[0] = TS[2] - 370 * 86400; a.equal(parse(long).barCount, 2);
});

test('timestamp rejects null, strings, fractions, non-finite, milliseconds and future time', () => {
  for (const value of [null, '1793975400', true, {}, [], -1, 0, 946684799, TS[0] + 0.5, NOW, NOW / 1000 + 1, 1e308]) {
    const f = fixture(); row(f).timestamp[1] = value; a.equal(parse(f), null, String(value));
  }
  const text = body(fixture()).replace(String(TS[0]), '1e999'); a.equal(load().hasParseYahooChart_(text, 'QQQ', 'US'), null);
});

test('source regularMarketTime is optional, bounded, not earlier than supplied bars, and never a bar closing time', () => {
  for (const value of [undefined, null]) a.equal(parse(fixture({ regularMarketTime: value })).regularMarketTime, null);
  for (const value of [-1, 0, String(TS[2]), TS[2] - 1, TS[2] + 0.5, NOW / 1000 + 1, 1e308]) {
    a.equal(parse(fixture({ regularMarketTime: value })), null);
  }
  const q = parse(fixture()); a.equal(q.regularMarketTime, '2026-11-09T21:00:00.000Z');
  for (const b of q.bars) a.deepEqual(Object.keys(b).sort(), ['c', 'd']);
  for (const k of ['verified', 'official', 'session', 'calendar', 'finality', 'publishedAt', 'scheduledCloseAt', 'closed']) a.equal(k in q, false, k);
});

test('dates use expected market timezone at DST/local-midnight boundaries without fabricated sessions', () => {
  const f = fixture({ regularMarketTime: null }); row(f).timestamp = [sec('2026-03-09T00:30:00Z'), sec('2026-03-10T00:30:00Z')]; row(f).indicators.quote[0].close = [1, 2];
  a.deepEqual(Array.from(parse(f).bars, b => b.d), ['2026-03-08', '2026-03-09']);
  // A Sunday label is not promoted to a valid session: no calendar evidence is generated.
  const k = kr(); row(k).meta.regularMarketTime = null; row(k).timestamp = [sec('2026-11-05T15:30:00Z'), sec('2026-11-06T15:30:00Z')]; row(k).indicators.quote[0].close = [1, 2];
  a.deepEqual(Array.from(parse(k, '005930.KS', 'KR').bars, b => b.d), ['2026-11-06', '2026-11-07']);
});

test('unexpected formatter errors or impossible date strings fail closed', () => {
  for (const formatter of [() => '2026-02-30', () => '2026-13-01', () => 'not-a-date', () => { throw new Error('formatter'); }]) {
    a.equal(parse(fixture(), 'QQQ', 'US', load(undefined, formatter)), null);
  }
});

test('ticker batches are bounded and validated atomically without reflecting malicious keys', () => {
  for (const tickers of ['', ' ', ',QQQ', 'QQQ,', 'QQQ,,MSFT', 'QQQ,../x', '__proto__', 'QQQ,<script>', 'QQQ,\u2028bad()',
    'x'.repeat(513), Array.from({ length: 13 }, (_, i) => 'T' + i).join(','), '^GSPC', 'USDKRW=X', '005930.KS']) {
    const g = load(); const r = request(g, tickers); a.deepEqual(json(r), { error: 'bad-request' }, tickers.slice(0, 30)); a.equal(g.calls.length, 0);
  }
  const g = load(); a.deepEqual(json(request(g, ['QQQ'])), { error: 'bad-request' }); a.equal(g.calls.length, 0);
  for (const tickers of ['005930.KS', 'M04020000', 'QQQ', '12345', '1234567']) {
    const g2 = load(); a.deepEqual(json(request(g2, tickers, 'KR')), { error: 'bad-request' }); a.equal(g2.calls.length, 0);
  }
});

test('canonical ticker deduplication bounds fetches; no cross-request result is reused', () => {
  const g = load(); const r = json(request(g, ' qqq,QQQ,qqq ')); a.deepEqual(Object.keys(r), ['QQQ']); a.equal(g.calls.length, 1);
  a.equal(json(request(g, 'MSFT')).MSFT, null); a.equal(g.calls.length, 2);
  const many = load(() => ({ getResponseCode: () => 404 }));
  request(many, Array.from({ length: 12 }, (_, i) => 'T' + i).join(',')); a.equal(many.calls.length, 12);
  const korean = load(() => ({ getResponseCode: () => 404 }));
  request(korean, Array.from({ length: 12 }, (_, i) => String(100000 + i)).join(','), 'KR'); a.equal(korean.calls.length, 24);
});

test('fetch is fixed-host GET with redirects disabled; bad status never parses provider text', () => {
  const g = load(); request(g);
  a.equal(g.calls[0].url, 'https://query1.finance.yahoo.com/v8/finance/chart/QQQ?interval=1d&range=1y');
  a.equal(g.calls[0].options.method, 'get'); a.equal(g.calls[0].options.followRedirects, false);
  for (const status of [301, 302, 403, 404, 429, 500]) {
    const x = load(() => ({ getResponseCode: () => status, getContentText: () => { throw new Error('must not read'); } }));
    a.deepEqual(json(request(x)), { QQQ: null });
  }
  const x = load(); a.equal(x.hasFetchYahooHistory_('../x', 'US'), null); a.equal(x.calls.length, 0);
});

test('JSONP permits a bounded plain identifier and rejects reflected code/reserved names', () => {
  for (const cb of ['cb1', '_history_12', 'a'.repeat(61)]) {
    const g = load(); const r = request(g, 'QQQ', 'US', cb); a.equal(r.mime, 'JS');
    let seen; vm.runInNewContext(r.text, { [cb]: value => { seen = value; } }); a.equal(seen.QQQ.symbol, 'QQQ');
  }
  for (const cb of ['cb.x', 'x[0]', 'x()', 'x;alert(1)', 'x\nalert', 'cb\n', 'cb\r', 'cb\u2028', '</script>', 'x\u2028y', 'for', 'null', 'class', '__proto__', 'constructor', 'a'.repeat(62), 5, {}, ['cb']]) {
    const r = request(load(), 'QQQ', 'US', cb); a.equal(r.mime, 'JSON'); a.equal(json(r).QQQ.symbol, 'QQQ');
    a.ok(r.text.startsWith('{')); a.equal(r.text.includes('<script>'), false);
  }
});

test('upstream messages and extra fields cannot add verification or leak in a response', () => {
  const f = fixture(); row(f).meta.untrusted = '</script>DO_NOT_ECHO'; row(f).meta.verified = true;
  row(f).meta.adjustment = 'official'; row(f).sessionDates = ['2026-11-05']; row(f).closed = true;
  const r = request(load(() => ok(body(f)))); const q = json(r).QQQ;
  a.equal(r.text.includes('DO_NOT_ECHO'), false); a.equal(q.adjustment, 'unverified');
  a.equal(q.verified, undefined); a.equal(q.closed, undefined); a.equal(q.sessionDates, undefined);
  f.chart.error = { description: '</script>DO_NOT_ECHO' };
  const r2 = request(load(() => ok(body(f)))); a.deepEqual(json(r2), { QQQ: null }); a.equal(r2.text.includes('DO_NOT_ECHO'), false);
});

test('transport/parse failures produce null and no mutable shared result', () => {
  const g = load(() => { throw new Error('private transport body'); }); a.deepEqual(json(request(g)), { QQQ: null });
  const x = load(); const q = parse(fixture(), 'QQQ', 'US', x); q.bars[0].c = -1;
  a.equal(parse(fixture(), 'QQQ', 'US', x).bars[0].c, 10.123456789);
  for (const event of [undefined, null, {}, { parameter: null }]) a.deepEqual(json(x.hasHistoryResponse_(event, null)), { error: 'bad-request' });
});
