/* KST KR radar: synthetic sell-side ("환호성") review. Pure; no action is ever produced.
   Return percentage is shown for information only and is NOT an input to the status. */
'use strict';
const { finite, nonEmpty, day, daysBetween, httpsUrl, copy, SYNTH_ID, MAX_QUOTE_AGE_DAYS, MAX_ASSESSMENT_AGE_DAYS, MAX_CHECK_AGE_DAYS, baseResult } = require('./common.js');
const { classifyInstrument } = require('./eligibility.js');
// Reuses the US engine's generic, read-only helpers (concentration / replacement) without modifying them.
const US = require('../sell/core.js');
const SECTORS = Object.freeze({ semiconductor: { cyclical: true }, shipbuilding: { cyclical: true }, auto: { cyclical: true }, financial: {}, general: {} });
const STATES = Object.freeze({ ...US.STATES, urgent: '긴급 위험 확인' });
const FACTORS = ['moat', 'earnings', 'cashflow', 'debt', 'marketShare'];
function evidenceOK(e, today) {
  if (!e || !day(e.asOf) || !day(e.checkedAt) || !nonEmpty(e.summary) || !nonEmpty(e.counterEvidence) || !httpsUrl(e.source)) return false;
  const a = daysBetween(e.asOf, today), c = daysBetween(e.checkedAt, today);
  return a >= 0 && a <= MAX_ASSESSMENT_AGE_DAYS && c >= 0 && c <= MAX_CHECK_AGE_DAYS;
}
function evaluateSell(input, { today } = {}) {
  const out = baseResult('kr-sell'); out.flags = {}; out.alerts = []; out.returnPct = null;
  if (!input || input.mode !== 'synthetic' || !SYNTH_ID.test(input.id || '') || !day(today)) { out.missing.push('합성 전용 입력 계약(KR-DEMO-* id, 기준일)'); return out; }
  out.id = input.id; out.role = ['core', 'satellite', 'undetermined'].includes(input.role) ? input.role : 'undetermined';
  const cls = classifyInstrument(input.instrument); out.classification = cls;
  const q = input.quote;
  if (cls.decision === 'excluded' || (cls.flags || []).includes('trading-halt') || (q && q.tradingStatus === 'halt')) {
    out.status = STATES.urgent; out.reasons.push('상장·거래 상태 위험: ' + (cls.reasons.join(' / ') || '거래정지') + ' — 상태 확인이 필요하며 매도 지시가 아닙니다.');
    out.notes.push('거래정지·상장폐지 위험 종목은 체결 자체가 불가능할 수 있음'); return out;
  }
  if (cls.decision !== 'eligible') { out.reasons.push(...cls.reasons); out.missing.push('분류 확인'); return out; }
  if (!q || q.synthetic !== true || !day(q.asOf) || daysBetween(q.asOf, today) < 0 || daysBetween(q.asOf, today) > MAX_QUOTE_AGE_DAYS || q.currency !== 'KRW' || q.adjustment !== 'adjusted-consistent' || q.session !== 'regular' || !finite(q.close) || q.close <= 0 || !finite(q.cost) || q.cost <= 0 || q.costBasis !== 'same-adjustment-basis') { out.missing.push('최신성·정규장·수정주가 기준이 일치하는 합성 종가·취득가'); return out; }
  out.returnPct = (q.close / q.cost - 1) * 100;
  out.formulas.push('(동일 수정 기준 종가 ÷ 취득가 − 1) × 100 — 정보 표시용이며 판단 입력이 아님');
  out.notes.push('수익률은 자동 매도 신호가 아닙니다. 보유 비중·투자 논리·과열·대안과 함께 검토합니다.');
  const sector = SECTORS[input.sector];
  if (!sector) out.missing.push('업종 구분 확인 필요');
  const c = US.concentration(input.positions, input.approvedLimits); out.concentration = c;
  if (c.status === 'unknown') out.missing.push(...c.missing); else { out.formulas.push(c.formula); if (c.breaches.length) out.reasons.push('사전 승인 가정 한도 초과 ' + c.breaches.length + '건'); }
  out.replacement = US.replacement(input.replacement, today);
  if (cls.group === 'etf') {
    out.missing.push('ETF 전용 매도 검토(보수·추적오차·괴리율·분배)는 본 단계에서 미구현 — 개별주 규칙 적용 안 함');
    out.flags = { concentrated: c.status === 'review' }; if (c.status === 'review') { out.status = STATES.weight; out.missing = out.missing.filter(m => !/ETF 전용/.test(m)); out.notes.push('ETF는 집중도만 확인했으며 가치평가는 하지 않음'); } return out;
  }
  // valuation (expensive) — requires >=5 years of own history
  const v = input.valuation; let expensive = false;
  if (!v || !evidenceOK(v.evidence, today) || !['PER', 'PBR'].includes(v.kind) || !['multiple', 'historicalHigh', 'growthPct', 'fcfYieldPct', 'outlookGrowthPct'].every(k => finite(v[k])) || v.multiple <= 0 || v.historicalHigh <= 0 || !finite(v.historyYears) || v.historyYears < 5) out.missing.push('밸류에이션·5년 이상 과거 범위·성장·현금흐름·전망 근거');
  else { expensive = v.multiple > v.historicalHigh && v.growthPct <= v.outlookGrowthPct && v.fcfYieldPct < 2; out.reasons.push(expensive ? '합성 고평가 괴리 조건 충족' : '합성 고평가 괴리 조건 미충족'); out.counterEvidence.push(v.evidence.counterEvidence); out.formulas.push(v.kind + ' > 과거 상단 AND 성장률 ≤ 전망 성장률 AND FCF 수익률 < 2% (연구용 고정 가정)'); }
  // cyclical earnings peak
  let peak = false;
  if (sector && sector.cyclical) {
    const y = input.cycle;
    if (!y || !evidenceOK(y.evidence, today) || !['trough', 'mid', 'peak', 'unknown'].includes(y.phase) || !finite(y.earningsVsMid) || y.earningsVsMid <= 0 || y.phase === 'unknown') out.missing.push('경기민감 업종의 사이클 위치·평균 대비 이익 배수 근거');
    else { peak = y.phase === 'peak' && y.earningsVsMid >= 1.3; out.reasons.push(peak ? '이익 정점 의심(평균 대비 1.3배 이상, 연구용 가정)' : '이익 정점 조건 미충족'); out.counterEvidence.push(y.evidence.counterEvidence); }
  }
  // thesis
  const t = input.thesis; let impaired = false;
  if (!t || !evidenceOK(t.evidence, today) || !Array.isArray(t.factors) || t.factors.length !== 5 || t.factors.some(f => !f || !FACTORS.includes(f.name) || !['stable', 'structural-deterioration', 'uncertain'].includes(f.state)) || t.factors.some(f => f.state === 'uncertain') || new Set(t.factors.map(f => f.name)).size !== 5) out.missing.push('경쟁력·실적·현금흐름·부채·점유율 구조적 검토');
  else { impaired = t.factors.some(f => f.state === 'structural-deterioration'); out.reasons.push(impaired ? '구조적 악화 근거 재검토 필요' : '합성 투자 논리 유지 가정'); out.counterEvidence.push(t.evidence.counterEvidence); }
  // shareholder return and governance
  const sr = input.shareholderReturn, g = input.governance; let returnWeak = false, governanceBad = false;
  if (!sr || !evidenceOK(sr.evidence, today) || typeof sr.buybackWithoutCancellation !== 'boolean' || typeof sr.dividendCut !== 'boolean') out.missing.push('주주환원(자사주 소각 여부·배당) 근거');
  else { returnWeak = sr.buybackWithoutCancellation || sr.dividendCut; if (sr.buybackWithoutCancellation) out.reasons.push('자사주를 취득만 하고 소각하지 않음 — 주주환원으로 인정하지 않음'); if (sr.dividendCut) out.reasons.push('배당 삭감'); out.counterEvidence.push(sr.evidence.counterEvidence); }
  if (!g || !evidenceOK(g.evidence, today) || typeof g.conflict !== 'boolean' || typeof g.physicalSpinOff !== 'boolean') out.missing.push('지배구조(대주주 이해상충·물적분할) 근거');
  else { governanceBad = g.conflict || g.physicalSpinOff; if (governanceBad) out.reasons.push('지배구조 훼손 요인(대주주 이해상충 또는 물적분할)'); out.counterEvidence.push(g.evidence.counterEvidence); }
  out.flags = { expensive, peak, impaired, governanceBad, returnWeak, concentrated: c.status === 'review' };
  if (out.missing.length) return out;
  if (impaired || governanceBad) out.status = STATES.thesis;
  else if (c.status === 'review') out.status = STATES.weight;
  else if ((expensive || peak) && out.replacement.status === 'review') out.status = STATES.trim;
  else if (expensive || peak) { out.missing.push('고평가·이익 정점만으로 매도 판단 불가 · 교체/현금 필요 검토'); out.status = STATES.unknown; }
  else out.status = STATES.hold;
  if (out.role === 'core' && [STATES.trim, STATES.thesis].includes(out.status)) out.notes.push('연금 코어 계좌: 장기 보유 원칙에 비춘 재검토이며, 승인된 정책 없이 매매 행동으로 옮기지 않음');
  return out;
}
module.exports = { evaluateSell, STATES };
