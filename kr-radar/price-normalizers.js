/* KST (stage16): 공급자별 "샘플 응답 형태" → 공통 시세 봉(pricefeed 계약) 변환기 + 교체 가능한 공급자 등록부.
   순수 모듈: 네트워크·저장소·시간 접근 없음. 전송(transport)은 호출자가 주입하며 합성 전송만 허용(실호출은 별도 승인 전 금지).
   주의: 아래 응답 형태는 공식 문서 설명을 바탕으로 한 "추정 형태"이며 실제 응답으로 확인되지 않았다(실응답 대조 0건). 실호출 승인 후 첫 단계가 형태 대조다. */
'use strict';
const { finite, nonEmpty, day } = require('./common.js');
const PF = require('./pricefeed.js');
const REAL_CALLS_ALLOWED = false;
const MARKET_OF = Object.freeze({ US: { currency: 'USD', timezone: 'America/New_York' }, KR: { currency: 'KRW', timezone: 'Asia/Seoul' } });
const num = x => (typeof x === 'number' ? x : (typeof x === 'string' && /^-?\d+(\.\d+)?$/.test(x.trim()) ? Number(x) : NaN));
function checkCtx(ctx) {
  const e = []; if (!ctx || typeof ctx !== 'object') return ['ctx 없음'];
  if (!MARKET_OF[ctx.market]) e.push('ctx.market(US|KR)'); if (!['stock', 'etf'].includes(ctx.instrumentType)) e.push('ctx.instrumentType(stock|etf)');
  if (!day(ctx.fetchedAt)) e.push('ctx.fetchedAt(YYYY-MM-DD)'); if (!finite(ctx.delayMinutes) || ctx.delayMinutes < 0) e.push('ctx.delayMinutes(0 이상)');
  if (ctx.synthetic !== true) e.push('합성 전용(ctx.synthetic=true) — 실데이터는 별도 승인 전 금지');
  return e;
}
function bar(ctx, provider, symbol, date, o, h, l, c, v, adjustment, adjustedFor) {
  const m = MARKET_OF[ctx.market];
  return { symbol, market: ctx.market, instrumentType: ctx.instrumentType, tradingStatus: 'normal', date, session: 'regular', currency: m.currency, timezone: m.timezone, open: o, high: h, low: l, close: c, volume: v, adjustment, adjustedFor, provider, fetchedAt: ctx.fetchedAt, delayMinutes: ctx.delayMinutes, isSynthetic: true };
}
function finish(provider, bars, rejected, extra) { if (!bars.length && !rejected.length) return fail(provider, '결과 0건(휴장·기간·권한 확인)', 'DATA_UNAVAILABLE'); return Object.assign({ ok: rejected.length === 0 && bars.length > 0, provider, bars: bars.sort((a, b) => (a.date < b.date ? -1 : 1)), rejected, errors: rejected.map(r => r.reason) }, extra || {}); }
const fail = (provider, reason, state) => ({ ok: false, provider, bars: [], rejected: [], errors: [reason], state: state || 'PROVIDER_ERROR' });
function dedupe(provider, rows, rejected) { const seen = new Map(); const out = []; for (const b of rows) { if (seen.has(b.date)) { const p = seen.get(b.date); if (p.close !== b.close) rejected.push({ date: b.date, reason: '같은 날짜 중복 봉의 종가가 다름: ' + p.close + ' / ' + b.close }); continue; } seen.set(b.date, b); out.push(b); } return out; }

/* Twelve Data 형태(time_series): meta + values[{datetime, open, high, low, close, volume}] (숫자는 문자열). 일봉 가정. */
function fromTwelveDataLike(payload, ctx) {
  const P = 'twelvedata-like', ce = checkCtx(ctx); if (ce.length) return fail(P, ce.join(', '), 'BAD_CONTEXT');
  if (!payload || typeof payload !== 'object') return fail(P, '응답 없음', 'DATA_UNAVAILABLE');
  if (payload.status === 'error' || finite(payload.code)) return fail(P, '공급자 오류 ' + (payload.code || '') + ': ' + String(payload.message || '').slice(0, 120), payload.code === 429 ? 'RATE_LIMITED' : 'PROVIDER_ERROR');
  if (!payload.meta || !nonEmpty(payload.meta.symbol) || !Array.isArray(payload.values)) return fail(P, 'meta/values 형태 불일치', 'SHAPE_MISMATCH');
  if (payload.meta.currency && payload.meta.currency !== MARKET_OF[ctx.market].currency) return fail(P, '통화 불일치: ' + payload.meta.currency, 'BASIS_MISMATCH');
  const rejected = [], rows = [];
  for (const v of payload.values) {
    const d = v && typeof v.datetime === 'string' ? v.datetime.slice(0, 10) : null, o = num(v && v.open), h = num(v && v.high), l = num(v && v.low), c = num(v && v.close), vol = v && v.volume != null ? num(v.volume) : null;
    if (!day(d) || [o, h, l, c].some(x => !finite(x) || x <= 0)) { rejected.push({ date: d, reason: '봉 필드 오류' }); continue; }
    if (vol !== null && !finite(vol)) { rejected.push({ date: d, reason: 'volume 오류' }); continue; }
    rows.push(bar(ctx, P, payload.meta.symbol, d, o, h, l, c, vol, ctx.adjustment === 'adjusted' ? 'adjusted' : 'unadjusted', ctx.adjustment === 'adjusted' ? (ctx.adjustedFor || ['split']) : []));
  }
  return finish(P, dedupe(P, rows, rejected), rejected);
}
/* Massive(구 Polygon) 형태(aggregates): results[{t(ms, 시장 현지 자정 기준), o, h, l, c, v}], adjusted 플래그. 날짜는 시장 현지 시간대로 환산한다. */
function fromMassiveLike(payload, ctx) {
  const P = 'massive-like', ce = checkCtx(ctx); if (ce.length) return fail(P, ce.join(', '), 'BAD_CONTEXT');
  if (!payload || typeof payload !== 'object') return fail(P, '응답 없음', 'DATA_UNAVAILABLE');
  if (payload.status === 'ERROR' || payload.status === 'NOT_AUTHORIZED') return fail(P, '공급자 오류: ' + String(payload.error || payload.message || payload.status).slice(0, 120), 'PROVIDER_ERROR');
  if (!nonEmpty(payload.ticker) || !Array.isArray(payload.results)) return fail(P, payload.resultsCount === 0 ? '결과 0건(휴장·기간·권한 확인)' : 'ticker/results 형태 불일치', payload.resultsCount === 0 ? 'DATA_UNAVAILABLE' : 'SHAPE_MISMATCH');
  const tz = MARKET_OF[ctx.market].timezone, rejected = [], rows = [], adj = payload.adjusted === true;
  for (const r of payload.results) {
    const o = num(r && r.o), h = num(r && r.h), l = num(r && r.l), c = num(r && r.c), v = r && r.v != null ? num(r.v) : null;
    if (!r || !finite(r.t) || [o, h, l, c].some(x => !finite(x) || x <= 0)) { rejected.push({ date: null, reason: '봉 필드 오류' }); continue; }
    const d = PF.localDate(new Date(r.t).toISOString(), tz);
    rows.push(bar(ctx, P, payload.ticker, d, o, h, l, c, v, adj ? 'adjusted' : 'unadjusted', adj ? ['split'] : []));   // REST bars: 분할만 조정, 배당 미조정(공식 안내 기준)
  }
  return finish(P, dedupe(P, rows, rejected), rejected, { dividendAdjusted: false });
}
/* 공공데이터포털 금융위원회 시세 형태(주식시세정보·증권상품시세정보): response.header/body.items.item (한 건이면 객체일 수 있음). 수정주가 아님·기준일 다음 영업일 갱신. */
function fromDataGoKrLike(payload, ctx) {
  const P = 'datago-fsc-like', ce = checkCtx(ctx); if (ce.length) return fail(P, ce.join(', '), 'BAD_CONTEXT');
  if (ctx.market !== 'KR') return fail(P, '한국 시장 전용', 'BAD_CONTEXT');
  const r = payload && payload.response; if (!r || !r.header || !r.body) return fail(P, 'response.header/body 형태 불일치', 'SHAPE_MISMATCH');
  if (r.header.resultCode !== '00') return fail(P, '공급자 오류 ' + r.header.resultCode + ': ' + String(r.header.resultMsg || '').slice(0, 80), 'PROVIDER_ERROR');
  let items = r.body.items && r.body.items.item; if (items == null || items === '') return fail(P, '결과 0건(휴장·기준일 확인)', 'DATA_UNAVAILABLE'); if (!Array.isArray(items)) items = [items];
  const rejected = [], rows = [];
  for (const it of items) {
    const raw = it && it.basDt, d = typeof raw === 'string' && /^\d{8}$/.test(raw) ? raw.slice(0, 4) + '-' + raw.slice(4, 6) + '-' + raw.slice(6) : null, sym = it && it.srtnCd, o = num(it && it.mkp), h = num(it && it.hipr), l = num(it && it.lopr), c = num(it && it.clpr), v = it && it.trqu != null ? num(it.trqu) : null;
    if (!day(d) || !nonEmpty(sym) || [o, h, l, c].some(x => !finite(x) || x <= 0)) { rejected.push({ date: d, reason: '봉 필드 오류(0 시가 등 포함)' }); continue; }
    rows.push(bar(ctx, P, String(sym).replace(/^A/, ''), d, o, h, l, c, v, 'unadjusted', []));
  }
  return finish(P, dedupe(P, rows, rejected), rejected, { note: '수정주가 아님. 분할·배당 처리 미확인 — 52주 계산 전 확인 필요' });
}
const NORMALIZERS = Object.freeze({ 'twelvedata-like': fromTwelveDataLike, 'massive-like': fromMassiveLike, 'datago-fsc-like': fromDataGoKrLike });

/* 교체 가능한 공급자 등록부. 기본은 모두 비활성이며, 전송은 합성 전송(transport.synthetic===true)만 받는다. */
function createRegistry() {
  const providers = new Map(); let active = null;
  const api = {
    realCallsAllowed: REAL_CALLS_ALLOWED,
    register(id, def) { if (!nonEmpty(id) || !def || typeof def.normalize !== 'function' || !MARKET_OF[def.market] ) throw new Error('공급자 정의 오류'); if (providers.has(id)) throw new Error('중복 공급자: ' + id); providers.set(id, { id, market: def.market, normalize: def.normalize, enabled: false, note: def.note || '' }); return api; },
    list() { return [...providers.values()].map(p => ({ id: p.id, market: p.market, enabled: p.enabled, active: p.id === active })); },
    enable(id) { const p = providers.get(id); if (!p) return { ok: false, reason: '없는 공급자' }; p.enabled = true; return { ok: true }; },
    use(id) { const p = providers.get(id); if (!p) return { ok: false, reason: '없는 공급자' }; if (!p.enabled) return { ok: false, reason: '비활성 공급자(승인 전 켤 수 없음)' }; active = id; return { ok: true }; },
    active() { return active; },
    async fetchBars(id, request, { transport, ctx }) {
      const p = providers.get(id); if (!p) return fail(id, '없는 공급자', 'NO_PROVIDER'); if (!p.enabled) return fail(id, '공급자 비활성', 'PROVIDER_DISABLED');
      if (!transport || transport.synthetic !== true || typeof transport.get !== 'function') return fail(id, '합성 전송만 허용(실호출은 별도 승인 전 금지)', 'REAL_CALLS_NOT_APPROVED');
      if (!request || !nonEmpty(request.symbol)) return fail(id, 'request.symbol 필요', 'BAD_REQUEST');
      let raw; try { raw = await transport.get(request); } catch (e) { return fail(id, '전송 실패: ' + String(e && e.message || e).slice(0, 120), 'NETWORK_ERROR'); }
      const r = p.normalize(raw, ctx); if (r.ok) { const wrong = r.bars.filter(b => b.symbol !== request.symbol); if (wrong.length) return fail(id, '요청한 종목과 다른 응답(' + wrong[0].symbol + ')', 'SYMBOL_MISMATCH'); } return r;
    }
  };
  return api;
}
/* 두 공급자의 같은 날짜 봉을 독립 출처로 대조(종가 차이 > 0.5% → HOLD). 날짜가 겹치지 않으면 일치로 세지 않는다. */
function compareProviders(a, b, { today } = {}) {
  const mb = new Map(b.map(x => [x.date, x])), rows = []; let agree = 0, conflict = 0, other = 0;
  for (const x of a) { const y = mb.get(x.date); if (!y) continue; const r = PF.reconcile(x, y, { today }); rows.push({ date: x.date, state: r.state, diffPct: r.diffPct === undefined ? null : r.diffPct }); if (r.state === 'AGREE') agree++; else if (r.state === 'SOURCE_CONFLICT') conflict++; else other++; }
  return { compared: rows.length, agree, conflict, other, rows, onlyInA: a.filter(x => !mb.has(x.date)).length, onlyInB: b.filter(y => !a.some(x => x.date === y.date)).length, note: rows.length ? null : '겹치는 날짜 없음 — 일치로 간주하지 않음' };
}
module.exports = { REAL_CALLS_ALLOWED, NORMALIZERS, fromTwelveDataLike, fromMassiveLike, fromDataGoKrLike, createRegistry, compareProviders };
