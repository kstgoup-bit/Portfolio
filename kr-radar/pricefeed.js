/* KST (stage12): 미국·한국 공급자 공통 "시세 봉(bar)" 계약·검증·교차검증·신호 결정. Pure, 합성 시험 전용(isSynthetic=true만 허용).
   실제 공급자 데이터는 이 모듈에 들어오지 않는다(별도 승인 전). 누락/오래됨/불일치는 DATA_UNAVAILABLE 또는 HOLD. */
'use strict';
const { finite, nonEmpty, day, daysBetween, MAX_QUOTE_AGE_DAYS } = require('./common.js');
const PL = require('./pipeline.js');
const MARKETS = Object.freeze({ US: { currency: 'USD', timezone: 'America/New_York' }, KR: { currency: 'KRW', timezone: 'Asia/Seoul' } });
const MAX_SOURCE_DIFF_PCT = 0.5;
const BAR_FIELDS = Object.freeze(['symbol', 'market', 'date', 'session', 'currency', 'timezone', 'open', 'high', 'low', 'close', 'volume', 'adjustment', 'adjustedFor', 'provider', 'fetchedAt', 'delayMinutes', 'isSynthetic']);
function validateBar(b, { today } = {}) {
  const e = [];
  if (!b || typeof b !== 'object') return { ok: false, state: 'DATA_UNAVAILABLE', errors: ['봉 없음'] };
  if (b.isSynthetic !== true) e.push('합성 전용(실데이터 금지)');
  if (!nonEmpty(b.symbol)) e.push('symbol');
  const m = MARKETS[b.market]; if (!m) e.push('market'); else { if (b.currency !== m.currency) e.push('currency ' + m.currency + ' 필요'); if (b.timezone !== m.timezone) e.push('timezone ' + m.timezone + ' 필요'); }
  if (!day(b.date)) e.push('date'); if (b.session !== 'regular') e.push('session(regular)');
  for (const k of ['open', 'high', 'low', 'close']) if (!finite(b[k]) || b[k] <= 0) e.push(k);
  if (finite(b.volume) === false || b.volume < 0) e.push('volume');
  if (e.length === 0 && (b.high < Math.max(b.open, b.close, b.low) || b.low > Math.min(b.open, b.close, b.high))) e.push('OHLC 모순');
  if (!['adjusted', 'unadjusted'].includes(b.adjustment)) e.push('adjustment');
  else if (b.adjustment === 'adjusted' && !(Array.isArray(b.adjustedFor) && b.adjustedFor.length && b.adjustedFor.every(x => ['split', 'dividend'].includes(x)) && b.adjustedFor.includes('split'))) e.push('수정주가는 adjustedFor에 split 포함 필요');
  if (!nonEmpty(b.provider) || !day(b.fetchedAt) || !finite(b.delayMinutes) || b.delayMinutes < 0) e.push('provenance(provider/fetchedAt/delayMinutes)');
  if (e.length === 0 && day(today)) { if (b.date > today) e.push('미래 날짜'); else if (daysBetween(b.date, today) > MAX_QUOTE_AGE_DAYS) return { ok: false, state: 'DATA_UNAVAILABLE', errors: ['오래된 시세(' + daysBetween(b.date, today) + '일)'] }; }
  return { ok: e.length === 0, state: e.length ? 'DATA_UNAVAILABLE' : 'OK', errors: e };
}
/* 서로 다른 공급자 2곳의 같은 날짜 봉: 기준·통화·날짜가 같아야 비교하고, 종가 차이 > 0.5% 이면 충돌 → HOLD. */
function reconcile(a, b, { today } = {}) {
  const va = validateBar(a, { today }), vb = validateBar(b, { today });
  if (!va.ok || !vb.ok) return { ok: false, decision: 'HOLD', state: 'DATA_UNAVAILABLE', reasons: [...va.errors, ...vb.errors] };
  if (a.provider === b.provider) return { ok: false, decision: 'HOLD', state: 'NOT_INDEPENDENT', reasons: ['같은 공급자는 독립 출처가 아님'] };
  for (const k of ['symbol', 'market', 'date', 'currency', 'adjustment']) if (a[k] !== b[k]) return { ok: false, decision: 'HOLD', state: 'BASIS_MISMATCH', reasons: [k + ' 불일치: ' + a[k] + ' / ' + b[k]] };
  const diff = Math.abs(a.close - b.close) / ((a.close + b.close) / 2) * 100;
  return diff > MAX_SOURCE_DIFF_PCT ? { ok: false, decision: 'HOLD', state: 'SOURCE_CONFLICT', diffPct: diff, reasons: ['종가 차이 ' + diff.toFixed(2) + '% > ' + MAX_SOURCE_DIFF_PCT + '%'] } : { ok: true, decision: null, state: 'AGREE', diffPct: diff, reasons: [] };
}
/* 52주 최고가: 구간 전체가 같은 수정 기준이어야 하고, 분할이 구간에 있는데 미수정이면 거부. 구간이 모자라면 계산하지 않는다. */
function high52w({ bars, asOf, corporateActions = [] }) {
  if (!Array.isArray(bars) || !day(asOf)) return { ok: false, state: 'DATA_UNAVAILABLE', reason: '입력 오류' };
  const w = bars.filter(b => day(b.date) && b.date <= asOf && daysBetween(b.date, asOf) <= 364).sort((x, y) => x.date < y.date ? -1 : 1);
  if (!w.length) return { ok: false, state: 'DATA_UNAVAILABLE', reason: '구간 봉 없음' };
  if (daysBetween(w[0].date, asOf) < 350) return { ok: false, state: 'DATA_UNAVAILABLE', reason: '52주 이력 부족(첫 봉 ' + w[0].date + ')' };
  if (daysBetween(w[w.length - 1].date, asOf) > MAX_QUOTE_AGE_DAYS) return { ok: false, state: 'DATA_UNAVAILABLE', reason: '최신 봉이 기준일보다 ' + daysBetween(w[w.length - 1].date, asOf) + '일 오래됨' };
  for (let i = 1; i < w.length; i++) if (daysBetween(w[i - 1].date, w[i].date) > 10) return { ok: false, state: 'DATA_UNAVAILABLE', reason: '봉 공백 ' + w[i - 1].date + '~' + w[i].date };
  const basis = new Set(w.map(b => b.adjustment)); if (basis.size > 1) return { ok: false, state: 'BASIS_MISMATCH', reason: '구간 내 수정 기준 혼합' };
  if (new Set(w.map(b => b.provider)).size > 1) return { ok: false, state: 'BASIS_MISMATCH', reason: '구간 내 공급자 혼합' };
  const splits = corporateActions.filter(c => c.type === 'split' && day(c.date) && c.date <= asOf && daysBetween(c.date, asOf) <= 364);
  if (splits.length && w[0].adjustment === 'unadjusted') return { ok: false, state: 'BASIS_MISMATCH', reason: '분할 구간인데 미수정 가격(52주 고가 왜곡)' };
  const top = w.reduce((m, b) => b.high > m.high ? b : m, w[0]);
  return { ok: true, high: top.high, highDate: top.date, basis: w[0].adjustment, bars: w.length, dividendNote: w[0].adjustment === 'unadjusted' ? '배당 미반영(미수정)' : null };
}
/* 최종 결정: 어떤 경우에도 정책(realActivationAllowed=false) 아래에서는 HOLD. candidate 는 "모든 게이트를 통과한 가정 시" 방향을 보여줄 뿐이다. */
function decide({ identityState = null, requiresIdentity = false, priceState = 'DATA_UNAVAILABLE', buy = false, sell = false } = {}) {
  const r = [];
  if (requiresIdentity && identityState !== 'VERIFIED') r.push('IDENTITY_UNVERIFIED');
  if (priceState !== 'OK') r.push(priceState === 'DATA_UNAVAILABLE' ? 'DATA_UNAVAILABLE' : 'PRICE_' + priceState);
  if (buy && sell) r.push('SIGNAL_CONFLICT');
  const gatesPass = r.length === 0, candidate = gatesPass ? (buy ? 'BUY' : sell ? 'SELL' : null) : null;
  if (!PL.POLICY.realActivationAllowed) r.push('ACTIVATION_DISABLED_BY_POLICY');
  return { decision: 'HOLD', candidate, reasons: r, actualActive: false };
}
module.exports = { MARKETS, MAX_SOURCE_DIFF_PCT, BAR_FIELDS, validateBar, reconcile, high52w, decide };
