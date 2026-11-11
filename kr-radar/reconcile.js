/* KST KR radar: merges a buy result and a sell result for the SAME synthetic company without hiding conflicts. */
'use strict';
const { baseResult, day, daysBetween } = require('./common.js');
const BUY_POSITIVE = new Set(['관찰', '심층 분석 후보', '최우선 분석 후보']);
const SELL_ACTIVE = new Set(['일부 매도 검토', '투자 논리 훼손 재검토', '비중 점검', '긴급 위험 확인']);
function reconcile(buy, sell, { today } = {}) {
  const out = baseResult('kr-review'); out.buyStatus = buy && buy.status; out.sellStatus = sell && sell.status;
  if (!day(today) || !buy || !sell || buy.kind !== 'kr-buy' || sell.kind !== 'kr-sell' || buy.id !== sell.id) { out.missing.push('같은 합성 종목의 매수·매도 결과와 기준일 필요'); return out; }
  out.id = buy.id; out.role = sell.role;
  if (BUY_POSITIVE.has(buy.status) && SELL_ACTIVE.has(sell.status)) { out.status = '상충 근거 재검토'; out.reasons.push('매수 분석(' + buy.status + ')과 매도 검토(' + sell.status + ')가 동시에 존재 — 두 근거를 분리해 다시 확인'); }
  else if (sell.status === '긴급 위험 확인' || buy.status === '위험 우선 · 보류') { out.status = '위험 확인 우선'; out.reasons.push('위험 신호가 다른 모든 점수보다 우선'); }
  else if (sell.status === '평가 불가' || buy.status === '평가 불가') { out.status = '평가 불가'; out.reasons.push('한쪽 근거가 불완전'); }
  else { out.status = '정보 제공'; out.reasons.push('상충 없음 — 정보 제공용'); }
  if (sell.role === 'core') out.notes.push('코어(연금) 정책과 새틀라이트(일반) 정책은 섞어 적용하지 않음');
  out.counterEvidence.push(...(buy.counterEvidence || []), ...(sell.counterEvidence || []));
  return out;
}
module.exports = { reconcile };
