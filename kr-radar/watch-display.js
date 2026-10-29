/* KST (stage16): 감시 화면용 "정직한 표시" 모델. Pure(저장소·네트워크·시간 접근 없음, today는 호출자가 전달).
   mobile-status.classify 의 판정을 그대로 쓰고, 화면에 필요한 공급자·기준 시각·가격 유형·통화·유효기간·갱신 오류·검증 상태를 덧붙인다.
   활성 감시 수 = 실제 조회 + 가격 검증 + 현재 유효한 감시 조건을 모두 만족한 종목만. 합성·캐시·미검증은 따로 센다. */
'use strict';
const { day, daysBetween, nonEmpty, MAX_QUOTE_AGE_DAYS } = require('./common.js');
const MS = require('./mobile-status.js');
const PRICE_TYPE_LABEL = Object.freeze({ close: '종가(확정 후)', delayed: '지연 시세', realtime: '실시간', unknown: '가격 유형 미확인' });
const SIGNAL_CAVEATS = Object.freeze([
  '신호는 가격 하락률만 본 것이며 투자 판단이 아닙니다(백테스트 미검증 가설).',
  '거래정지·상장폐지 예정 종목은 가격 하락이 곧 기회를 뜻하지 않습니다.',
  '실적 악화·감자·유상증자·분할 등 기업행위로 가격이 바뀐 경우 오탐일 수 있습니다.',
  '수정주가 기준이 섞이면 52주 고점 대비 하락률이 왜곡됩니다.'
]);
const CACHE_AGE_NOTE = '캐시 값은 마지막 실제 조회 결과이며 현재 값이 아닐 수 있습니다.';
function priceTypeOf(price) {
  if (!price) return 'unknown';
  const t = price.priceType; if (t === 'close') return 'close'; if (t === 'delayed') return 'delayed';
  // 실시간 표기는 공급자가 실시간이라 밝히고 지연이 0분일 때만. 그 외는 한 단계 낮춰 표기한다.
  if (t === 'realtime') return price.delayMinutes === 0 ? 'realtime' : 'delayed'; return 'unknown';
}
function describe(item, today) {
  const cls = MS.classify(item, today), p = item.price || null, cache = !!(p && p.origin === 'cache');
  const baseDate = p && day(p.baseDate) ? p.baseDate : null;
  const validUntil = baseDate ? new Date(Date.parse(baseDate) + MAX_QUOTE_AGE_DAYS * 86400000).toISOString().slice(0, 10) : null;
  const expired = validUntil ? today > validUntil : null;
  const row = { id: item.id, market: item.market, kind: item.kind, level: cls.level, label: cls.label, reasons: cls.reasons.slice(),
    provider: p && nonEmpty(p.source) ? p.source : '출처 없음', asOf: baseDate, queriedAt: p && day(p.queriedAt) ? p.queriedAt : null, priceType: priceTypeOf(p), priceTypeLabel: PRICE_TYPE_LABEL[priceTypeOf(p)],
    currency: p && nonEmpty(p.currency) ? p.currency : (item.market === 'KR' ? 'KRW(추정)' : item.market === 'US' ? 'USD(추정)' : '미확인'), validUntil, expired,
    lastError: p && p.failureReason ? String(p.failureReason) : null, verification: cache ? 'cache' : cls.level === 'SYNTHETIC' ? 'synthetic' : (cls.level === 'PRICE' || cls.level === 'MONITORING') ? 'real-verified' : 'unverified' };
  if (cache) row.reasons.push(CACHE_AGE_NOTE, '캐시는 실제 감시로 세지 않습니다');
  if (row.expired) row.reasons.push('유효기간(' + validUntil + ') 지남 — 갱신 필요');
  if (row.lastError) row.reasons.push('갱신 오류: ' + row.lastError);
  row.activeMonitoring = cls.level === 'MONITORING' && !cache && !row.expired && !row.lastError;
  row.signalNote = cls.signal && cls.signal.shown ? cls.signal.label : '신호 표시 없음(자료 부족 또는 감시 미활성)';
  return row;
}
function summarize(items, today) {
  const rows = items.map(i => describe(i, today)), c = f => rows.filter(f).length;
  return { rows, counts: { activeMonitoring: c(r => r.activeMonitoring), activeMonitoringKR: c(r => r.activeMonitoring && r.market === 'KR'), activeMonitoringUS: c(r => r.activeMonitoring && r.market === 'US'),
    realVerifiedPrice: c(r => r.verification === 'real-verified' && !r.expired && !r.lastError), synthetic: c(r => r.verification === 'synthetic'), cache: c(r => r.verification === 'cache'), unverified: c(r => r.verification === 'unverified'), total: rows.length },
    caveats: SIGNAL_CAVEATS.slice(), rule: '활성 감시 = 실제 조회 + 가격 검증 + 현재 유효한 감시 조건. 합성·캐시·미검증은 포함하지 않음.' };
}
module.exports = { PRICE_TYPE_LABEL, SIGNAL_CAVEATS, CACHE_AGE_NOTE, describe, summarize };
