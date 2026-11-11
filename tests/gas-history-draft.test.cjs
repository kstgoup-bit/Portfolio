'use strict';
/* GAS 일별 종가 요청 초안(gas/has-history-request.gs)을 가짜 UrlFetchApp·ContentService로 실행해 시험한다. 실제 네트워크·실제 GAS 호출 없음. */
const test = require('node:test'), a = require('node:assert/strict'), fs = require('fs'), path = require('path'), vm = require('vm');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'gas', 'has-history-request.gs'), 'utf8');
const day = (iso) => Math.floor(Date.parse(iso) / 1000);
class FixedDate extends Date { static now() { return Date.parse('2026-11-10T12:00:00Z'); } }
const chart = (o = {}) => JSON.stringify({ chart: { result: [{ meta: Object.assign({ symbol: 'QQQ', dataGranularity: '1d', currency: 'USD', fullExchangeName: 'NasdaqGS', exchangeName: 'NMS', exchangeTimezoneName: 'America/New_York', instrumentType: 'ETF', regularMarketTime: day('2026-11-09T21:00:00Z'), regularMarketPrice: 671.1, fiftyTwoWeekHigh: 700 }, o.meta || {}), timestamp: o.ts || [day('2026-11-05T14:30:00Z'), day('2026-11-06T14:30:00Z'), day('2026-11-09T14:30:00Z')], indicators: { quote: [{ close: o.close || [650.12345, null, 671.1] }] } }] } });
function load(fetchImpl) {
  const calls = [];
  const ctx = { ContentService: { MimeType: { JSON: 'JSON', JAVASCRIPT: 'JS' }, createTextOutput: (t) => { const o = { text: t, mime: null, setMimeType(m) { this.mime = m; return this; } }; return o; } },
    UrlFetchApp: { fetch: (url, opt) => { calls.push(url); return fetchImpl(url, opt); } },
    Utilities: { formatDate: (d, tz, f) => new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d) }, JSON, Math, Date: FixedDate, Array, String, Number, isFinite, encodeURIComponent };
  vm.createContext(ctx); vm.runInContext(SRC, ctx); ctx.calls = calls; return ctx;
}
const ok = (body) => ({ getResponseCode: () => 200, getContentText: () => body });
const bad = (code) => ({ getResponseCode: () => code, getContentText: () => 'x' });
const run = (g, params, cb) => { const r = g.hasHistoryResponse_({ parameter: params }, cb); return { r, body: JSON.parse(r.text.replace(/^[^({]*\(/, '').replace(/\)$/, '') || r.text) }; };
const parse = (r) => JSON.parse(cb(r)); const cb = (r) => r.text.startsWith('{') ? r.text : r.text.replace(/^[^(]*\(/, '').replace(/\)$/, '');

test('미국: 날짜별 종가와 메타(통화·거래소·시간대·시각·52주 고점)를 돌려준다', () => {
  const g = load(() => ok(chart())); const r = g.hasHistoryResponse_({ parameter: { tickers: 'QQQ', market: 'US' } }, 'cb1'); const q = JSON.parse(cb(r)).QQQ;
  a.equal(r.mime, 'JS'); a.ok(r.text.startsWith('cb1(')); a.equal(q.source, 'yahoo-chart-v8'); a.equal(q.currency, 'USD'); a.equal(q.timezone, 'America/New_York'); a.equal(q.fiftyTwoWeekHigh, 700); a.equal(q.adjustment, 'unverified');
  a.deepEqual(q.bars, [{ d: '2026-11-05', c: 650.12345 }, { d: '2026-11-09', c: 671.1 }]); a.equal(q.barCount, 2); a.equal(q.regularMarketTime, '2026-11-09T21:00:00.000Z');
});
test('한국: .KS 실패 시 .KQ로 한 번 더 시도한다', () => {
  const g = load((u) => u.includes('.KS?') ? bad(404) : ok(chart({ meta: { symbol: '123456.KQ', currency: 'KRW', exchangeName: 'KOE', fullExchangeName: 'KOSDAQ', exchangeTimezoneName: 'Asia/Seoul' } })));
  const q = JSON.parse(cb(g.hasHistoryResponse_({ parameter: { tickers: '123456', market: 'KR' } }, 'c'))); a.equal(q['123456'].symbol, '123456.KQ'); a.equal(q['123456'].currency, 'KRW'); a.deepEqual(g.calls.map(u => u.match(/chart\/([^?]+)/)[1]), ['123456.KS', '123456.KQ']);
});
test('실패는 null: 비정상 응답·깨진 JSON·시간대 없음·막대 2개 미만', () => {
  for (const f of [() => bad(500), () => ok('{broken'), () => ok(chart({ meta: { exchangeTimezoneName: null } })), () => ok(chart({ ts: [day('2026-11-09T14:30:00Z')], close: [1] })), () => ok('{"chart":{"result":null}}'), () => { throw new Error('boom'); }]) {
    const g = load(f); a.equal(JSON.parse(cb(g.hasHistoryResponse_({ parameter: { tickers: 'QQQ', market: 'US' } }, null))).QQQ, null);
  }
});
test('동일 시각·가격의 중복만 한 개로 줄이고 날짜는 오름차순이다', () => {
  const g = load(() => ok(chart({ ts: [day('2026-11-09T14:30:00Z'), day('2026-11-05T14:30:00Z'), day('2026-11-09T14:30:00Z')], close: [1, 2, 1] })));
  a.deepEqual(JSON.parse(cb(g.hasHistoryResponse_({ parameter: { tickers: 'QQQ', market: 'US' } }, null))).QQQ.bars, [{ d: '2026-11-05', c: 2 }, { d: '2026-11-09', c: 1 }]);
});
test('입력 검증: 잘못된 시장·티커, 열두 개 초과, 위험한 콜백 이름', () => {
  const g = load(() => ok(chart()));
  a.equal(JSON.parse(cb(g.hasHistoryResponse_({ parameter: { tickers: 'QQQ', market: 'ALL' } }, null))).error, 'bad-request');
  a.equal(JSON.parse(cb(g.hasHistoryResponse_({ parameter: { market: 'US' } }, null))).error, 'bad-request');
  const r1 = JSON.parse(cb(g.hasHistoryResponse_({ parameter: { tickers: '../x,QQQ?x=1,a b', market: 'US' } }, null))); a.equal(r1.error, 'bad-request'); a.equal(g.calls.length, 0);
  const many = Array.from({ length: 20 }, (_, i) => 'T' + i).join(','); g.calls.length = 0; const bounded = g.hasHistoryResponse_({ parameter: { tickers: many, market: 'US' } }, null); a.equal(JSON.parse(cb(bounded)).error, 'bad-request'); a.equal(g.calls.length, 0);
  const r2 = g.hasHistoryResponse_({ parameter: { tickers: 'QQQ', market: 'US' } }, 'alert(1);x'); a.ok(r2.text.startsWith('{')); a.equal(r2.mime, 'JSON');
});
test('누락 요청과 내부 오류는 고정 오류 응답이며 원문을 반사하지 않는다', () => {
  const g = load(() => ok(chart()));
  a.equal(JSON.parse(cb(g.hasHistoryResponse_({ parameter: null }, null))).error, 'bad-request');
  g.hasGetHistories_ = () => { throw new Error('private provider body'); };
  const r = g.hasHistoryResponse_({ parameter: {} }, null); a.deepEqual(JSON.parse(cb(r)), { error: 'history-failed' });
});
test('정적 보호: 키·비밀·기존 함수 재정의·불필요한 권한 없음, 새 이름은 모두 has 접두어', () => {
  const body = SRC.replace(/\/\/.*$/gm, '');
  ['apikey', 'api_key', 'secret', 'token', 'password', 'PropertiesService', 'SpreadsheetApp', 'DriveApp', 'MailApp', 'eval(', 'doGet', 'getStockPrices', 'getYahooPrice', 'getNaverPrice', 'getExchangeRate'].forEach(w => a.ok(!body.toLowerCase().includes(w.toLowerCase()), w));
  [...body.matchAll(/function\s+(\w+)/g)].forEach(m => a.ok(/^has[A-Z]/.test(m[1]), m[1]));
});
