'use strict';
const { test } = require('node:test'), a = require('node:assert/strict');
const P = require('../kr-radar/provider.js'); const TODAY = '2026-10-29';
const vals = (n = 5, close = 430) => Array.from({ length: n }, (_, i) => { const d = new Date(Date.parse('2026-10-28') - i * 86400000); return d; }).filter(d => d.getUTCDay() % 6 !== 0).map(d => ({ datetime: d.toISOString().slice(0, 10), open: String(close), high: String(close + 3), low: String(close - 3), close: String(close), volume: '100' }));
const td = (o = {}, v) => JSON.stringify({ meta: { symbol: 'MSFT', interval: '1day', currency: 'USD', exchange_timezone: 'America/New_York', exchange: 'NASDAQ', type: 'Common Stock', ...o }, values: v || vals(), status: 'ok' });
const map = (t, o = {}) => P.mapTwelveDataTimeSeries(t, { symbol: 'MSFT', market: 'US', fetchedAt: TODAY, delayMinutes: 0, ...o });
const ev = (p, o = {}) => P.evaluateFeed({ primary: p, symbol: 'MSFT', market: 'US', expectedType: 'stock', today: TODAY, ...o });

test('정상 합성 피드는 SYNTHETIC_OK 이지만 신호는 허용되지 않는다(실제 감시 아님)', () => {
  const r = ev(map(td())); a.equal(r.state, 'SYNTHETIC_OK'); a.equal(r.signalAllowed, false); a.equal(r.decision, 'HOLD'); a.equal(r.label, '백테스트 미검증 가설');
});
test('공급자 장애(429/401/오류 본문/형식)·값 누락 → 신호 중단', () => {
  for (const t of [JSON.stringify({ code: 429, status: 'error' }), JSON.stringify({ code: 401, status: 'error' }), '<html>', '{}', td({}, [])]) { const r = ev(map(t)); a.equal(r.signalAllowed, false); a.equal(r.decision, 'DATA_UNAVAILABLE'); a.ok(r.reasons.length); }
  a.equal(ev(null).state, 'DATA_UNAVAILABLE'); a.equal(ev(undefined).signalAllowed, false);
  const missing = vals(); missing[0].close = ''; a.equal(ev(map(td({}, missing))).state, 'DATA_UNAVAILABLE');
  const nul = vals(); nul[0].high = null; a.equal(ev(map(td({}, nul))).state, 'DATA_UNAVAILABLE');
});
test('지연: 허용 지연 초과 → HOLD, 오래된 봉 → DATA_UNAVAILABLE', () => {
  a.equal(ev(map(td(), { delayMinutes: 5000 })).decision, 'HOLD');
  a.equal(ev(map(td({}, vals(3).map(v => ({ ...v, datetime: '2026-10-10' }))))).state, 'DATA_UNAVAILABLE');
});
test('잘못된 통화·거래소 시간대·종목·유형 → 신호 중단', () => {
  for (const m of [{ currency: 'KRW' }, { exchange_timezone: 'Asia/Seoul' }, { symbol: 'AAPL' }, { type: 'ETF' }]) { const r = ev(map(td(m), { expectedType: 'stock' }), { expectedType: 'stock' }); a.equal(r.signalAllowed, false, JSON.stringify(m)); a.notEqual(r.state, 'SYNTHETIC_OK'); }
});
test('시차 오류: 종가 시각의 현지 날짜가 봉 날짜와 다르면 중단', () => {
  const p = map(td()); p.bars[p.bars.length - 1].sessionCloseUtc = '2026-10-29T14:00:00Z'; a.equal(ev(p).state, 'DATA_UNAVAILABLE');
});
test('거래정지·상장폐지·주말·휴장일 봉 → 중단', () => {
  for (const s of ['halt', 'delisted']) { const p = map(td()); p.bars[p.bars.length - 1].tradingStatus = s; a.equal(ev(p).state, 'DATA_UNAVAILABLE'); }
  a.equal(ev(map(td({}, [{ datetime: '2026-10-24', open: '1', high: '2', low: '1', close: '1', volume: '1' }]))).state, 'DATA_UNAVAILABLE');
  a.equal(ev(map(td()), { holidays: ['2026-10-28'] }).state, 'DATA_UNAVAILABLE');
});
test('급변(분할 의심) → HOLD', () => { const v = vals(); v[0].close = '100'; v[0].open = '100'; v[0].high = '103'; v[0].low = '97'; a.equal(ev(map(td({}, v))).decision, 'HOLD'); });
test('이중 공급자: 불일치/보조 실패/같은 공급자 → HOLD, 일치 → SYNTHETIC_OK', () => {
  const p = map(td(), { provider: 'a' });
  a.equal(ev(p, { secondary: map(td({}, vals(5, 435)), { provider: 'b' }) }).decision, 'HOLD');
  a.equal(ev(p, { secondary: map(JSON.stringify({ code: 429, status: 'error' }), { provider: 'b' }) }).decision, 'HOLD');
  a.equal(ev(p, { secondary: map(td(), { provider: 'a' }) }).decision, 'HOLD');
  a.equal(ev(p, { secondary: map(td(), { provider: 'b' }) }).state, 'SYNTHETIC_OK');
  a.equal(ev(p, { secondary: map(td(), { provider: 'b', requestedAdjust: 'all' }) }).decision, 'HOLD');   // 수정/비수정 혼합
});
test('ETF/개별주 구분: ETF 응답을 개별주로 쓰면 중단', () => { a.notEqual(ev(map(td({ type: 'ETF' })), { expectedType: 'stock' }).state, 'SYNTHETIC_OK'); a.equal(ev(map(td({ type: 'ETF' })), { expectedType: 'etf' }).state, 'SYNTHETIC_OK'); });
