/* KST (stage14): 휴대폰 화면용 데이터 상태 구분. Pure. 네 단계를 엄격히 분리하고, 합성·모의는 실제 집계에 절대 섞지 않는다.
   SYNTHETIC(합성 시험) < IDENTITY(공식 종목 신원 검증) < PRICE(실제 시세 확인) < MONITORING(실제 감시 활성)
   오래되었거나 출처·기준일·조회 시각이 없으면 DATA_UNAVAILABLE, 신호는 HOLD. 신호 점수는 "백테스트 미검증 가설". */
'use strict';
const { day, daysBetween, nonEmpty, MAX_QUOTE_AGE_DAYS } = require('./common.js');
const LABELS = Object.freeze({ SYNTHETIC: '합성 시험', IDENTITY: '공식 종목 신원 검증', PRICE: '실제 시세 확인', MONITORING: '실제 감시 활성', UNAVAILABLE: '데이터 없음(DATA_UNAVAILABLE)' });
const REAL_IDENTITY = 'user-supplied-official', REAL_PRICE = 'real-provider';
const evOk = (e, today) => !!e && nonEmpty(e.source) && day(e.baseDate) && day(e.queriedAt) && e.queriedAt <= today && daysBetween(e.baseDate, today) >= 0 && daysBetween(e.baseDate, today) <= MAX_QUOTE_AGE_DAYS && !e.failureReason;
const why = (e, today, name) => !e ? name + ' 근거 없음' : e.failureReason ? name + ' 실패: ' + e.failureReason : !nonEmpty(e.source) ? name + ' 출처 없음' : !day(e.baseDate) || !day(e.queriedAt) ? name + ' 기준일/조회 시각 없음' : e.queriedAt > today ? name + ' 조회 시각이 미래' : daysBetween(e.baseDate, today) < 0 ? name + ' 기준일이 미래' : daysBetween(e.baseDate, today) > MAX_QUOTE_AGE_DAYS ? name + ' 오래됨(기준일 ' + e.baseDate + ')' : null;
const isSynth = e => !e || e.isSynthetic === true || e.origin === 'fixture';

/* item: { id, market:'KR'|'US', kind:'stock'|'etf', identity?, price?, monitoring?, signal? } — 각 증거는 { origin, source, baseDate, queriedAt, failureReason?, isSynthetic? } */
function classify(item, today) {
  const r = { id: item.id, market: item.market, kind: item.kind, level: 'UNAVAILABLE', label: LABELS.UNAVAILABLE, reasons: [], signal: { decision: 'HOLD', score: null, shown: false } };
  if (!['KR', 'US'].includes(item.market) || !['stock', 'etf'].includes(item.kind)) { r.reasons.push('시장/종류 오류'); return r; }
  const anySynth = [item.identity, item.price, item.monitoring].some(e => e && isSynth(e));
  if (anySynth) { r.level = 'SYNTHETIC'; r.label = LABELS.SYNTHETIC; r.reasons.push('합성·모의 자료 포함 — 실제 집계 제외'); return r; }
  const idOk = item.market === 'US' ? true : (item.identity && item.identity.origin === REAL_IDENTITY && item.identity.state === 'VERIFIED' && evOk(item.identity, today));
  if (item.market === 'KR' && !idOk) { const w = why(item.identity, today, '신원'); r.reasons.push(w || '공식 검증(VERIFIED) 아님'); return r; }
  if (item.market === 'KR') { r.level = 'IDENTITY'; r.label = LABELS.IDENTITY; }
  const pOk = item.price && item.price.origin === REAL_PRICE && evOk(item.price, today);
  if (!pOk) { if (item.market === 'US') { r.reasons.push(why(item.price, today, '시세') || '실제 시세 아님'); return r; } r.reasons.push(why(item.price, today, '시세') || '실제 시세 아님'); return r; }
  r.level = 'PRICE'; r.label = LABELS.PRICE;
  const mOk = item.monitoring && item.monitoring.active === true && item.monitoring.approvedBy === 'user' && evOk(item.monitoring, today);
  if (!mOk) { r.reasons.push(why(item.monitoring, today, '감시') || '감시 미활성'); return r; }
  r.level = 'MONITORING'; r.label = LABELS.MONITORING;
  if (item.signal && Number.isFinite(item.signal.score)) r.signal = { decision: item.signal.decision || 'HOLD', score: item.signal.score, shown: true, label: '백테스트 미검증 가설' };
  return r;
}
function summarize(items, today) {
  const rows = items.map(i => classify(i, today));
  const c = (f) => rows.filter(f).length, real = r => r.level !== 'SYNTHETIC' && r.level !== 'UNAVAILABLE';
  return { rows, counts: {
    syntheticTest: c(r => r.level === 'SYNTHETIC'),
    officialIdentityVerified: c(r => r.market === 'KR' && ['IDENTITY', 'PRICE', 'MONITORING'].includes(r.level)),
    realPriceConfirmed: c(r => ['PRICE', 'MONITORING'].includes(r.level)),
    activeMonitoringKR: c(r => r.market === 'KR' && r.level === 'MONITORING'),
    activeMonitoringUS: c(r => r.market === 'US' && r.level === 'MONITORING'),
    unavailable: c(r => r.level === 'UNAVAILABLE'), real: c(real) } };
}
/* 화면 문구: 항상 기준일·출처·조회 시각·실패 이유를 보여준다. 오래된 신호는 최신인 것처럼 보이지 않게 숨긴다. */
function describe(row, item) {
  const e = item.monitoring || item.price || item.identity || {};
  return { id: row.id, label: row.label, baseDate: e.baseDate || '없음', source: e.source || '없음', queriedAt: e.queriedAt || '없음', note: row.reasons.join(' / ') || '정상', signalText: row.signal.shown ? row.signal.decision + ' (' + row.signal.label + ')' : 'HOLD — 신호 없음' };
}
module.exports = { LABELS, classify, summarize, describe };
