/* KST (stage13): 시세 공급자 인터페이스(기본 OFF) + Twelve Data time_series 응답 매퍼(합성 fixture 전용).
   - 이 모듈은 네트워크·저장소·환경변수를 쓰지 않는다. transport는 호출자가 주입하며, 기본값은 없다(= OFF).
   - 실제 공급자 호출·키 발급·주문 기능 없음. 응답은 공식 문서 형식 기준이며 "실응답 미확인" 상태다.
   - 반환 봉은 isSynthetic=true 로 표시되어 pricefeed.validateBar 의 합성 전용 규칙을 통과하는 시험용이다. */
'use strict';
const PF = require('./pricefeed.js');
const { finite, day } = require('./common.js');
const TD_TYPES = Object.freeze({ 'Common Stock': 'stock', 'ETF': 'etf' });
const ADJUST = Object.freeze({ all: ['split', 'dividend'], splits: ['split'], dividends: null, none: null });
const num = v => (typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim())) ? Number(v) : (typeof v === 'number' ? v : NaN);

/* Twelve Data 오류 본문 → 상태. 429/401/403 등은 재시도 정책 없이 DATA_UNAVAILABLE 로 끝낸다. */
function classifyTdError(o) {
  const code = Number(o && o.code);
  const map = { 400: 'bad-request', 401: 'unauthorized', 403: 'forbidden', 404: 'not-found', 414: 'bad-request', 429: 'rate-limit' };
  return { state: 'DATA_UNAVAILABLE', category: map[code] || 'provider-error', code: Number.isFinite(code) ? code : null };
}

function mapTwelveDataTimeSeries(text, { symbol, market, requestedAdjust = 'none', provider = 'twelvedata', fetchedAt, delayMinutes = 0, expectedType = null } = {}) {
  let o; try { o = JSON.parse(text); } catch { return { ok: false, state: 'DATA_UNAVAILABLE', category: 'format-mismatch', bars: [] }; }
  if (!o || typeof o !== 'object') return { ok: false, state: 'DATA_UNAVAILABLE', category: 'format-mismatch', bars: [] };
  if (o.status === 'error' || (o.code && !o.values)) return { ok: false, ...classifyTdError(o), bars: [] };
  if (!o.meta || !Array.isArray(o.values)) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'format-mismatch', bars: [] };
  if (!o.values.length) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'empty', bars: [] };
  if (!(requestedAdjust in ADJUST)) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'bad-adjust', bars: [] };
  const m = PF.MARKETS[market]; if (!m) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'bad-market', bars: [] };
  if (o.meta.symbol !== symbol) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'symbol-mismatch', bars: [] };
  if (o.meta.currency !== m.currency) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'currency-mismatch', bars: [] };
  if (o.meta.exchange_timezone !== m.timezone) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'timezone-mismatch', bars: [] };
  const type = TD_TYPES[o.meta.type]; if (!type) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'unknown-instrument-type', bars: [] };
  if (expectedType && type !== expectedType) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'instrument-type-mismatch', bars: [] };
  // dividends 단독 수정은 계약상 허용하지 않는다(분할 미반영 수정주가 금지) → 수정 기준 불명확
  const adjustedFor = ADJUST[requestedAdjust];
  if (requestedAdjust === 'dividends') return { ok: false, state: 'DATA_UNAVAILABLE', category: 'unsupported-adjust-basis', bars: [] };
  const bars = [], bad = [];
  for (const v of o.values) {
    if (!v || !day(v.datetime)) { bad.push('datetime'); continue; }   // 시각이 붙은 값(분봉)은 일봉 계약 위반
    const bar = { symbol, market, instrumentType: type, tradingStatus: 'normal', date: v.datetime, session: 'regular', currency: m.currency, timezone: m.timezone,
      open: num(v.open), high: num(v.high), low: num(v.low), close: num(v.close), volume: v.volume === undefined || v.volume === null || v.volume === '' ? null : num(v.volume),
      adjustment: adjustedFor ? 'adjusted' : 'unadjusted', adjustedFor: adjustedFor ? adjustedFor.slice() : [], provider, fetchedAt, delayMinutes, isSynthetic: true };
    bars.push(bar);
  }
  if (bad.length) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'bad-datetime', bars: [] };
  const dup = new Set(); for (const b of bars) { if (dup.has(b.date)) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'duplicate-bar', bars: [] }; dup.add(b.date); }
  bars.sort((a, b) => a.date < b.date ? -1 : 1);   // Twelve Data 는 최신순으로 줌 → 오름차순 정렬
  return { ok: true, state: 'OK', category: null, bars, assumedStatus: 'official-doc-format-unconfirmed-live' };
}

/* 기본 OFF 공급자. enabled=true 이고 transport 가 주입된 경우만 호출한다. 호출 수는 항상 기록한다. */
function createProvider({ enabled = false, transport = null, maxCalls = 3 } = {}) {
  let calls = 0;
  return {
    get calls() { return calls; },
    get enabled() { return enabled === true && typeof transport === 'function'; },
    async fetchDailyBars(req) {
      if (enabled !== true) return { ok: false, state: 'OFF', bars: [], reason: '공급자 기본 OFF — 네트워크 호출 0' };
      if (typeof transport !== 'function') return { ok: false, state: 'OFF', bars: [], reason: 'transport 미주입' };
      if (calls >= maxCalls) return { ok: false, state: 'DATA_UNAVAILABLE', category: 'call-cap', bars: [] };
      calls += 1;
      let text; try { text = await transport(req); } catch { return { ok: false, state: 'DATA_UNAVAILABLE', category: 'transport-error', bars: [] }; }
      return mapTwelveDataTimeSeries(String(text), req);
    },
    placeOrder() { throw new Error('주문 기능 없음(자동매매 금지)'); }
  };
}
/* 신호 점수 표기: 항상 가설 라벨. 데이터가 불완전하면 점수를 만들지 않는다. */
const SIGNAL_LABEL = '백테스트 미검증 가설';
function labelSignal(decision) { return decision && decision.score !== undefined && decision.score !== null ? { ...decision, label: SIGNAL_LABEL } : { ...(decision || {}), score: null, label: SIGNAL_LABEL }; }
module.exports = { TD_TYPES, SIGNAL_LABEL, classifyTdError, mapTwelveDataTimeSeries, createProvider, labelSignal };
