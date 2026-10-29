'use strict';
const test = require('node:test'), a = require('node:assert/strict');
const PF = require('../kr-radar/pricefeed.js'), P = require('../kr-radar/provider.js');
const TODAY = '2026-10-29';
const td = (o = {}, vals) => JSON.stringify({ meta: { symbol: 'MSFT', interval: '1day', currency: 'USD', exchange_timezone: 'America/New_York', exchange: 'NASDAQ', type: 'Common Stock', ...(o.meta || {}) },
  values: vals || [{ datetime: '2026-10-28', open: '430.1', high: '435.0', low: '428.0', close: '432.5', volume: '1000' }, { datetime: '2026-10-27', open: '429', high: '433', low: '427', close: '430', volume: '900' }], status: 'ok' });
const map = (t, o = {}) => P.mapTwelveDataTimeSeries(t, { symbol: 'MSFT', market: 'US', fetchedAt: TODAY, ...o });
const bar = (o = {}) => ({ symbol: 'MSFT', market: 'US', instrumentType: 'stock', tradingStatus: 'normal', date: '2026-10-28', session: 'regular', currency: 'USD', timezone: 'America/New_York', open: 1, high: 2, low: 1, close: 1.5, volume: 5, adjustment: 'unadjusted', adjustedFor: [], provider: 'a', fetchedAt: TODAY, delayMinutes: 0, isSynthetic: true, ...o });

test('매퍼: 정상 응답 → 오름차순 일봉, 합성·수정기준·유형 표기', () => {
  const r = map(td()); a.equal(r.ok, true); a.deepEqual(r.bars.map(b => b.date), ['2026-10-27', '2026-10-28']);
  a.equal(r.bars[0].adjustment, 'unadjusted'); a.equal(r.bars[0].isSynthetic, true); a.equal(r.bars[0].instrumentType, 'stock');
  a.ok(r.bars.every(b => PF.validateBar(b, { today: TODAY }).ok));
  a.equal(r.assumedStatus, 'official-doc-format-unconfirmed-live');
});
test('매퍼: 수정 요청(all/splits)은 split 포함 adjustedFor, dividends 단독은 거부', () => {
  a.deepEqual(map(td(), { requestedAdjust: 'all' }).bars[0].adjustedFor, ['split', 'dividend']);
  a.deepEqual(map(td(), { requestedAdjust: 'splits' }).bars[0].adjustedFor, ['split']);
  a.equal(map(td(), { requestedAdjust: 'dividends' }).category, 'unsupported-adjust-basis');
  a.equal(map(td(), { requestedAdjust: 'bogus' }).category, 'bad-adjust');
});
test('매퍼 부정: 형식불일치/오류본문/빈/종목·통화·시간대·유형 불일치/중복/분봉', () => {
  a.equal(map('<html>').category, 'format-mismatch'); a.equal(map('null').category, 'format-mismatch'); a.equal(map('{"x":1}').category, 'format-mismatch');
  a.equal(map(JSON.stringify({ code: 429, message: 'x', status: 'error' })).category, 'rate-limit');
  a.equal(map(JSON.stringify({ code: 401, message: 'x', status: 'error' })).category, 'unauthorized');
  a.equal(map(JSON.stringify({ code: 999, message: 'x', status: 'error' })).category, 'provider-error');
  a.equal(map(td({}, [])).category, 'empty');
  a.equal(map(td({ meta: { symbol: 'AAPL' } })).category, 'symbol-mismatch');
  a.equal(map(td({ meta: { currency: 'KRW' } })).category, 'currency-mismatch');
  a.equal(map(td({ meta: { exchange_timezone: 'Asia/Seoul' } })).category, 'timezone-mismatch');
  a.equal(map(td({ meta: { type: 'Warrant' } })).category, 'unknown-instrument-type');
  a.equal(map(td({ meta: { type: 'ETF' } }), { expectedType: 'stock' }).category, 'instrument-type-mismatch');
  a.equal(map(td({}, [{ datetime: '2026-10-28', open: '1', high: '2', low: '1', close: '1', volume: '1' }, { datetime: '2026-10-28', open: '1', high: '2', low: '1', close: '1', volume: '1' }])).category, 'duplicate-bar');
  a.equal(map(td({}, [{ datetime: '2026-10-28 15:59:00', open: '1', high: '2', low: '1', close: '1' }])).category, 'bad-datetime');
  a.equal(map(td(), { market: 'XX' }).category, 'bad-market');
});
test('매퍼: 숫자 문자열 오염(NaN/음수/0)은 validateBar 에서 걸림', () => {
  const r = map(td({}, [{ datetime: '2026-10-28', open: 'abc', high: '2', low: '1', close: '0', volume: '-1' }])); a.equal(r.ok, true);
  const v = PF.validateBar(r.bars[0], { today: TODAY }); a.equal(v.ok, false); a.ok(v.errors.includes('open') && v.errors.includes('close') && v.errors.includes('volume'));
});
test('부정: 거래정지·상장폐지는 DATA_UNAVAILABLE, 유형 불일치·주말·휴장일·시간대 경계', () => {
  a.equal(PF.validateBar(bar({ tradingStatus: 'halt' }), { today: TODAY }).state, 'DATA_UNAVAILABLE');
  a.equal(PF.validateBar(bar({ tradingStatus: 'delisted' }), { today: TODAY }).ok, false);
  a.equal(PF.validateBar(bar({ tradingStatus: 'x' }), { today: TODAY }).ok, false);
  a.equal(PF.validateBar(bar({ instrumentType: 'etf' }), { today: TODAY, expectedType: 'stock' }).ok, false);
  a.equal(PF.validateBar(bar({ instrumentType: 'fund' }), { today: TODAY }).ok, false);
  a.equal(PF.validateBar(bar({ date: '2026-10-24' }), { today: TODAY }).ok, false);   // 토요일
  a.equal(PF.validateBar(bar({ date: '2026-10-26' }), { today: TODAY, holidays: ['2026-10-26'] }).ok, false);
  a.equal(PF.validateBar(bar({ date: '2026-10-26' }), { today: TODAY, holidays: [] }).ok, true);
  // 뉴욕 종가 16:00 EDT = 20:00Z 같은 날. 다음날 UTC 로 기록된 경계 오류는 봉 날짜와 달라 거부
  a.equal(PF.validateBar(bar({ sessionCloseUtc: '2026-10-28T20:00:00Z' }), { today: TODAY }).ok, true);
  a.equal(PF.validateBar(bar({ date: '2026-10-28', sessionCloseUtc: '2026-10-29T01:00:00Z' }), { today: TODAY }).ok, true);   // 20:00 EDT(28일) 로 환산되면 일치
  a.equal(PF.validateBar(bar({ date: '2026-10-29', sessionCloseUtc: '2026-10-29T01:00:00Z' }), { today: TODAY }).ok, false);   // UTC 날짜를 그대로 쓴 오류
  const kr = bar({ symbol: '005930', market: 'KR', currency: 'KRW', timezone: 'Asia/Seoul', date: '2026-10-28', sessionCloseUtc: '2026-10-28T06:30:00Z' });
  a.equal(PF.validateBar(kr, { today: TODAY }).ok, true);
  a.equal(PF.validateBar({ ...kr, date: '2026-10-27' }, { today: TODAY }).ok, false);
  a.equal(PF.validateBar(bar({ sessionCloseUtc: 'not-a-date' }), { today: TODAY }).ok, false);
});
test('누락봉·점프·분할·수정 혼합', () => {
  const mk = (d, c, o = {}) => bar({ date: d, open: c, high: c + 1, low: c - 1, close: c, ...o });
  const m = PF.findMissingBars([mk('2026-10-26', 10), mk('2026-10-28', 10)], '2026-10-26', '2026-10-28');
  a.deepEqual(m.missing, ['2026-10-27']); a.equal(m.calendarKnown, false); a.ok(m.note);
  a.deepEqual(PF.findMissingBars([mk('2026-10-26', 10), mk('2026-10-28', 10)], '2026-10-26', '2026-10-28', { holidays: ['2026-10-27'] }).missing, []);
  a.equal(PF.findMissingBars([], '2026-10-28', '2026-10-26').ok, false);
  const j = PF.detectJumps([mk('2026-10-27', 100), mk('2026-10-28', 40)]); a.equal(j.decision, 'HOLD'); a.equal(j.flagged[0].date, '2026-10-28');
  a.equal(PF.detectJumps([mk('2026-10-27', 100), mk('2026-10-28', 40)], { corporateActions: [{ type: 'split', date: '2026-10-28' }] }).ok, true);
  a.equal(PF.detectJumps([mk('2026-10-27', 100, { adjustment: 'adjusted', adjustedFor: ['split'] }), mk('2026-10-28', 40, { adjustment: 'adjusted', adjustedFor: ['split'] })], { corporateActions: [{ type: 'split', date: '2026-10-28' }] }).ok, false);   // 수정주가인데 점프 → 설명 불가
  a.equal(PF.detectJumps([mk('2026-10-27', 100), mk('2026-10-28', 101)]).ok, true);
});
test('환율: 쌍·출처·합성·신선도, 통화 직접비교 거부', () => {
  const fx = { pair: 'USD/KRW', rate: 1400, date: '2026-10-28', provider: 'x', isSynthetic: true };
  a.equal(PF.convertToKrw({ amount: 10, currency: 'USD' }, fx, { today: TODAY }).krw, 14000);
  a.equal(PF.convertToKrw({ amount: 10, currency: 'KRW' }, null).krw, 10);
  for (const bad of [null, { ...fx, pair: 'KRW/USD' }, { ...fx, rate: 0 }, { ...fx, rate: NaN }, { ...fx, provider: '' }, { ...fx, isSynthetic: false }, { ...fx, date: '2026-10-01' }, { ...fx, date: '2026-11-01' }])
    a.equal(PF.convertToKrw({ amount: 10, currency: 'USD' }, bad, { today: TODAY }).ok, false);
  a.equal(PF.convertToKrw({ amount: NaN, currency: 'USD' }, fx).ok, false);
  a.equal(PF.sameCurrency({ currency: 'USD' }, { currency: 'KRW' }).decision, 'HOLD');
});
test('이중 공급자: ETF/개별주·수정 기준 불일치와 차이 > 0.5% → HOLD', () => {
  const x = bar({ provider: 'a' }), y = bar({ provider: 'b' });
  a.equal(PF.reconcile(x, y, { today: TODAY }).ok, true);
  a.equal(PF.reconcile(x, bar({ provider: 'b', instrumentType: 'etf' }), { today: TODAY }).state, 'BASIS_MISMATCH');
  a.equal(PF.reconcile(x, bar({ provider: 'b', close: 1.6 }), { today: TODAY }).state, 'SOURCE_CONFLICT');
  a.equal(PF.reconcile(x, bar({ provider: 'b', adjustment: 'adjusted', adjustedFor: ['split'] }), { today: TODAY }).state, 'BASIS_MISMATCH');
});
test('52주 고가: 이력 부족·수정 혼합·분할 미수정은 값 없음(꾸미지 않음)', () => {
  const mk = d => bar({ date: d, high: 10, close: 9, open: 9, low: 8 });
  a.equal(PF.high52w({ bars: [mk('2026-10-28')], asOf: TODAY }).ok, false);
  const dates = []; for (let t = Date.parse('2025-11-03'); t <= Date.parse('2026-10-28'); t += 7 * 86400000) dates.push(new Date(t).toISOString().slice(0, 10));
  const bars = dates.map(mk); a.equal(PF.high52w({ bars, asOf: TODAY }).ok, true);
  a.equal(PF.high52w({ bars, asOf: TODAY, corporateActions: [{ type: 'split', date: '2026-03-01' }] }).state, 'BASIS_MISMATCH');
  a.equal(PF.high52w({ bars: bars.map((b, i) => i === 3 ? { ...b, adjustment: 'adjusted', adjustedFor: ['split'] } : b), asOf: TODAY }).state, 'BASIS_MISMATCH');
});
test('공급자 인터페이스: 기본 OFF → 호출 0, transport 있어도 enabled 아니면 호출 0', async () => {
  let n = 0; const t = async () => { n++; return td(); };
  const off = P.createProvider({ transport: t }); const r = await off.fetchDailyBars({ symbol: 'MSFT', market: 'US' });
  a.equal(r.state, 'OFF'); a.equal(n, 0); a.equal(off.calls, 0); a.equal(off.enabled, false);
  a.equal((await P.createProvider({ enabled: true }).fetchDailyBars({})).state, 'OFF');
});
test('공급자 인터페이스: 켜진 fixture 모드 — 호출 상한·전송 오류 복구·주문 불가', async () => {
  let n = 0; const p = P.createProvider({ enabled: true, maxCalls: 2, transport: async () => { n++; if (n === 1) throw new Error('boom serviceKey=SECRET'); return td(); } });
  const req = { symbol: 'MSFT', market: 'US', fetchedAt: TODAY };
  const r1 = await p.fetchDailyBars(req); a.equal(r1.category, 'transport-error'); a.ok(!JSON.stringify(r1).includes('SECRET'));
  a.equal((await p.fetchDailyBars(req)).ok, true); a.equal((await p.fetchDailyBars(req)).category, 'call-cap'); a.equal(n, 2);
  a.throws(() => p.placeOrder({}), /주문 기능 없음/);
});
test('신호 점수는 항상 "백테스트 미검증 가설" 라벨, 점수 없으면 null', () => {
  a.equal(P.labelSignal({ score: 3 }).label, '백테스트 미검증 가설'); a.equal(P.labelSignal({ decision: 'HOLD' }).score, null); a.equal(P.labelSignal(null).label, P.SIGNAL_LABEL);
});
test('정적: provider.js 는 네트워크·저장소·환경 접근 없음', () => {
  const s = require('node:fs').readFileSync(require.resolve('../kr-radar/provider.js'), 'utf8');
  for (const w of ['fetch(', 'XMLHttpRequest', 'node:https', "require('https')", "require('http')", 'localStorage', 'process.env', 'setTimeout', 'eval(']) a.ok(!s.includes(w), w);
});
