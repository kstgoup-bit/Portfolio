'use strict';
/* 16단계 B: 공급자 응답 "추정 형태" 변환·교체·대조 시험. 모든 응답은 합성이며 실제 호출 0회. */
const { test } = require('node:test'), a = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path');
const N = require('../kr-radar/price-normalizers.js'), PF = require('../kr-radar/pricefeed.js');
const US = { market: 'US', instrumentType: 'stock', fetchedAt: '2026-10-29', delayMinutes: 0, synthetic: true }, KR = { market: 'KR', instrumentType: 'stock', fetchedAt: '2026-10-29', delayMinutes: 1440, synthetic: true };
const td = (o = {}) => ({ status: 'ok', meta: { symbol: 'MSFT', currency: 'USD' }, values: [{ datetime: '2026-10-28', open: '100.0', high: '105.5', low: '99.5', close: '104.0', volume: '1000' }, { datetime: '2026-10-27', open: '99', high: '101', low: '98', close: '100', volume: '900' }], ...o });
const mx = (o = {}) => ({ ticker: 'MSFT', adjusted: true, status: 'OK', resultsCount: 2, results: [{ t: Date.parse('2026-10-28T04:00:00Z'), o: 100, h: 105.5, l: 99.5, c: 104, v: 1000 }, { t: Date.parse('2026-10-27T04:00:00Z'), o: 99, h: 101, l: 98, c: 100, v: 900 }], ...o });
const dg = (items, code = '00') => ({ response: { header: { resultCode: code, resultMsg: code === '00' ? 'NORMAL SERVICE.' : 'ERR' }, body: { items: { item: items } } } });
const row = (o = {}) => ({ basDt: '20261028', srtnCd: '005930', itmsNm: '합성전자', mkp: '70000', hipr: '71000', lopr: '69500', clpr: '70500', trqu: '12345', ...o });

test('세 공급자 형태가 모두 같은 봉 계약으로 변환되고 pricefeed 검증을 통과', () => {
  for (const [r, bars] of [[N.fromTwelveDataLike(td(), US), 2], [N.fromMassiveLike(mx(), US), 2], [N.fromDataGoKrLike(dg([row(), row({ basDt: '20261027' })]), KR), 2]]) {
    a.equal(r.ok, true, r.errors.join()); a.equal(r.bars.length, bars); a.ok(r.bars[0].date < r.bars[1].date);
    for (const b of r.bars) { const v = PF.validateBar(b, { today: '2026-10-29' }); a.equal(v.ok, true, v.errors.join()); a.equal(b.isSynthetic, true); }
  }
  const k = N.fromDataGoKrLike(dg([row()]), KR).bars[0]; a.equal(k.symbol, '005930'); a.equal(k.close, 70500); a.equal(k.currency, 'KRW'); a.equal(k.adjustment, 'unadjusted'); a.equal(k.date, '2026-10-28');
});
test('Massive 형태: 시장 현지(뉴욕) 날짜로 환산, 분할만 조정(배당 미조정 표시), 미조정은 unadjusted', () => {
  const late = N.fromMassiveLike(mx({ results: [{ t: Date.parse('2026-10-29T01:00:00Z'), o: 1, h: 2, l: 1, c: 2, v: 1 }] }), US); a.equal(late.bars[0].date, '2026-10-28');   // UTC로 보면 29일이지만 뉴욕은 28일 21시
  const dst = N.fromMassiveLike(mx({ results: [{ t: Date.parse('2026-11-02T05:00:00Z'), o: 1, h: 2, l: 1, c: 2, v: 1 }] }), US); a.equal(dst.bars[0].date, '2026-11-02');   // 서머타임 종료 후
  const ok = N.fromMassiveLike(mx(), US); a.deepEqual(ok.bars[0].adjustedFor, ['split']); a.equal(ok.dividendAdjusted, false); a.equal(ok.bars[0].adjustment, 'adjusted');
  const raw = N.fromMassiveLike(mx({ adjusted: false }), US); a.equal(raw.bars[0].adjustment, 'unadjusted'); a.deepEqual(raw.bars[0].adjustedFor, []);
});
test('Twelve Data 형태: 문자열 숫자 변환, 수정 기준은 호출 맥락(ctx)이 정함, 통화 불일치 거부', () => {
  const r = N.fromTwelveDataLike(td(), { ...US, adjustment: 'adjusted', adjustedFor: ['split', 'dividend'] }); a.equal(r.bars[0].adjustment, 'adjusted'); a.deepEqual(r.bars[0].adjustedFor, ['split', 'dividend']); a.equal(r.bars[0].volume, 900);
  a.equal(N.fromTwelveDataLike(td({ meta: { symbol: 'MSFT', currency: 'KRW' } }), US).state, 'BASIS_MISMATCH');
});
test('공급자 오류·형태 불일치·빈 결과는 각각 구분된 상태로 거부(빈 배열로 위장하지 않음)', () => {
  a.equal(N.fromTwelveDataLike({ status: 'error', code: 429, message: 'limit' }, US).state, 'RATE_LIMITED'); a.equal(N.fromTwelveDataLike({ status: 'error', code: 400, message: 'x' }, US).state, 'PROVIDER_ERROR');
  a.equal(N.fromTwelveDataLike({ foo: 1 }, US).state, 'SHAPE_MISMATCH'); a.equal(N.fromTwelveDataLike(null, US).state, 'DATA_UNAVAILABLE'); a.equal(N.fromTwelveDataLike({ ...td(), values: [] }, US).ok, false);
  a.equal(N.fromMassiveLike({ status: 'ERROR', error: 'x' }, US).state, 'PROVIDER_ERROR'); a.equal(N.fromMassiveLike({ status: 'NOT_AUTHORIZED', message: 'plan' }, US).state, 'PROVIDER_ERROR'); a.equal(N.fromMassiveLike({ ticker: 'A', resultsCount: 0, results: [] }, US).state, 'DATA_UNAVAILABLE'); a.equal(N.fromMassiveLike({ results: [] }, US).state, 'SHAPE_MISMATCH');
  a.equal(N.fromDataGoKrLike(dg([row()], '30'), KR).state, 'PROVIDER_ERROR'); a.equal(N.fromDataGoKrLike(dg(''), KR).state, 'DATA_UNAVAILABLE'); a.equal(N.fromDataGoKrLike({ x: 1 }, KR).state, 'SHAPE_MISMATCH'); a.equal(N.fromDataGoKrLike(dg([row()]), US).state, 'BAD_CONTEXT');
});
test('한 건만 오면 객체로 오는 응답, 0 시가(거래정지 등)·형식 오류 행은 개별 거부하고 나머지는 보존하되 전체 ok=false', () => {
  const one = N.fromDataGoKrLike(dg(row()), KR); a.equal(one.ok, true); a.equal(one.bars.length, 1);
  const mixed = N.fromDataGoKrLike(dg([row(), row({ basDt: '20261027', mkp: '0', hipr: '0', lopr: '0' }), row({ basDt: '2026-10-26' }), row({ basDt: '20261023', clpr: 'abc' }), row({ srtnCd: '' })]), KR);
  a.equal(mixed.ok, false); a.equal(mixed.bars.length, 1); a.equal(mixed.rejected.length, 4);
});
test('중복 날짜: 같은 값이면 하나로, 종가가 다르면 거부 기록', () => {
  const same = N.fromTwelveDataLike(td({ values: [...td().values, td().values[0]] }), US); a.equal(same.bars.length, 2); a.equal(same.ok, true);
  const diff = N.fromTwelveDataLike(td({ values: [...td().values, { ...td().values[0], close: '110' }] }), US); a.equal(diff.ok, false); a.match(diff.errors[0], /종가가 다름/);
});
test('OHLC 모순·비정상 값은 변환은 되지만 pricefeed 검증에서 걸림(최종 방어선)', () => {
  const r = N.fromTwelveDataLike(td({ values: [{ datetime: '2026-10-28', open: '100', high: '90', low: '99', close: '104', volume: '1' }] }), US); a.equal(r.bars.length, 1); a.equal(PF.validateBar(r.bars[0], { today: '2026-10-29' }).ok, false);
  const wk = N.fromTwelveDataLike(td({ values: [{ datetime: '2026-10-31', open: '1', high: '2', low: '1', close: '2', volume: '1' }] }), US); a.equal(PF.validateBar(wk.bars[0], { today: '2026-11-02' }).ok, false);   // 토요일
});
test('맥락(ctx) 검증: 합성 표시 없음·시장·지연·날짜 오류는 변환 자체를 거부(실데이터 유입 차단)', () => {
  for (const bad of [{ ...US, synthetic: false }, { ...US, synthetic: undefined }, { ...US, market: 'JP' }, { ...US, delayMinutes: -1 }, { ...US, fetchedAt: 'x' }, { ...US, instrumentType: 'bond' }, null]) for (const f of [N.fromTwelveDataLike, N.fromMassiveLike, N.fromDataGoKrLike]) { const r = f(td(), bad); a.equal(r.ok, false); a.equal(r.state, 'BAD_CONTEXT'); a.equal(r.bars.length, 0); }
});
test('공급자 등록부: 기본 비활성, 활성화 후에만 사용, 합성 전송만 허용, 교체 가능, 다른 종목 응답 거부', async () => {
  const reg = N.createRegistry(); a.equal(reg.realCallsAllowed, false);
  reg.register('twelve', { market: 'US', normalize: N.fromTwelveDataLike }).register('massive', { market: 'US', normalize: N.fromMassiveLike });
  a.throws(() => reg.register('twelve', { market: 'US', normalize: N.fromTwelveDataLike }), /중복/); a.throws(() => reg.register('x', { market: 'JP', normalize: N.fromMassiveLike }), /정의 오류/); a.throws(() => reg.register('', {}), /정의 오류/);
  const syn = raw => ({ synthetic: true, get: async () => raw });
  a.equal((await reg.fetchBars('twelve', { symbol: 'MSFT' }, { transport: syn(td()), ctx: US })).state, 'PROVIDER_DISABLED'); a.equal(reg.use('twelve').ok, false);
  reg.enable('twelve'); reg.enable('massive'); a.equal(reg.use('twelve').ok, true); a.equal(reg.active(), 'twelve');
  a.equal((await reg.fetchBars('twelve', { symbol: 'MSFT' }, { transport: syn(td()), ctx: US })).ok, true);
  const real = { get: async () => td() }; a.equal((await reg.fetchBars('twelve', { symbol: 'MSFT' }, { transport: real, ctx: US })).state, 'REAL_CALLS_NOT_APPROVED'); a.equal((await reg.fetchBars('twelve', { symbol: 'MSFT' }, { ctx: US })).state, 'REAL_CALLS_NOT_APPROVED');
  a.equal((await reg.fetchBars('twelve', { symbol: 'GOOGL' }, { transport: syn(td()), ctx: US })).state, 'SYMBOL_MISMATCH'); a.equal((await reg.fetchBars('twelve', {}, { transport: syn(td()), ctx: US })).state, 'BAD_REQUEST'); a.equal((await reg.fetchBars('nope', { symbol: 'M' }, { transport: syn(td()), ctx: US })).state, 'NO_PROVIDER');
  a.equal((await reg.fetchBars('twelve', { symbol: 'MSFT' }, { transport: { synthetic: true, get: async () => { throw new Error('boom'); } }, ctx: US })).state, 'NETWORK_ERROR');
  a.equal(reg.use('massive').ok, true); a.equal(reg.list().filter(p => p.active).length, 1); a.equal(reg.use('zzz').ok, false); a.equal(reg.enable('zzz').ok, false);
  a.equal((await reg.fetchBars('massive', { symbol: 'MSFT' }, { transport: syn(mx()), ctx: US })).ok, true);   // 공급자를 바꿔도 같은 호출 방식
});
test('두 공급자 대조: 일치·충돌(0.5% 초과)·겹침 없음 구분, 같은 공급자는 독립 아님', () => {
  const A = N.fromTwelveDataLike(td(), { ...US, adjustment: 'adjusted' }).bars, Bm = N.fromMassiveLike(mx(), US).bars, ok = N.compareProviders(A, Bm, { today: '2026-10-29' }); a.equal(ok.compared, 2); a.equal(ok.agree, 2); a.equal(ok.conflict, 0);
  const off = N.fromMassiveLike(mx({ results: mx().results.map((r, i) => (i ? r : { ...r, c: 110, h: 111 })) }), US).bars, bad = N.compareProviders(A, off, { today: '2026-10-29' }); a.equal(bad.conflict, 1); a.equal(bad.agree, 1);
  a.equal(N.compareProviders(A, A, { today: '2026-10-29' }).other, 2);   // NOT_INDEPENDENT
  const none = N.compareProviders(A, N.fromMassiveLike(mx({ results: [{ t: Date.parse('2026-10-20T04:00:00Z'), o: 1, h: 2, l: 1, c: 2, v: 1 }] }), US).bars, { today: '2026-10-29' }); a.equal(none.compared, 0); a.match(none.note, /일치로 간주하지 않음/);
});
test('분할 구간 미수정 시리즈는 52주 고가 계산 거부(어댑터 출력도 같은 방어선 통과)', () => {
  const bars = []; let t = Date.parse('2025-10-29T00:00:00Z'); for (let i = 0; i < 365; i++, t += 86400000) { const d = new Date(t).toISOString().slice(0, 10); if (new Date(t).getUTCDay() % 6 === 0) continue; bars.push({ t: Date.parse(d + 'T04:00:00Z'), o: 100, h: 101, l: 99, c: 100, v: 1 }); }
  const r = N.fromMassiveLike({ ticker: 'MSFT', adjusted: false, results: bars }, US); a.equal(r.ok, true);
  const h = PF.high52w({ bars: r.bars, asOf: '2026-10-28', corporateActions: [{ type: 'split', date: '2026-03-02' }] }); a.equal(h.ok, false); a.match(h.reason, /분할/);
});
test('정적 검사: 네트워크·저장소·시간·난수·동적 코드 접근 없음, 키 문자열 없음', () => {
  const s = fs.readFileSync(path.join(__dirname, '../kr-radar/price-normalizers.js'), 'utf8'); for (const w of ['fetch(', 'XMLHttpRequest', 'localStorage', 'setTimeout', 'Date.now', 'Math.random', 'eval(', 'process.', 'http://', 'api_key', 'apikey']) a.ok(!s.includes(w), w);
});
