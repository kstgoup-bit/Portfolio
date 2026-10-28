/* KST KR radar: synthetic buy-side ("곡소리") analysis. Pure, deterministic, no side effects.
   The 100-point model is a DRAFT: weights are unvalidated design assumptions, not a performance claim. */
'use strict';
const { finite, nonEmpty, day, daysBetween, httpsUrl, copy, SYNTH_ID, MAX_QUOTE_AGE_DAYS, MAX_ASSESSMENT_AGE_DAYS, MAX_CHECK_AGE_DAYS, baseResult } = require('./common.js');
const { classifyInstrument } = require('./eligibility.js');
const WEIGHTS = Object.freeze({ business: 20, financial: 20, overreaction: 15, valuation: 15, shareholder: 15, event: 10, catalyst: 5 });
const LABELS = Object.freeze({ business: '사업 경쟁력·업황', financial: '재무건전성·현금흐름', overreaction: '낙폭·과잉반응', valuation: '업종 보정 밸류에이션', shareholder: '주주환원·지배구조', event: '악재 일시성·희석 위험', catalyst: '회복 촉매' });
const QUALITATIVE = ['business', 'financial', 'event', 'catalyst'];
const DRAWDOWN_BANDS = Object.freeze([20, 30, 35, 45]);
const DRAWDOWN_POINTS = Object.freeze({ 20: 5, 30: 8, 35: 11, 45: 13 });
const MARKET_UNDERPERFORM = 15, SECTOR_UNDERPERFORM = 10;
const SECTORS = Object.freeze({ semiconductor: { cyclical: true }, shipbuilding: { cyclical: true }, auto: { cyclical: true }, financial: { financial: true }, general: {} });
const RISK_TOKENS = Object.freeze({
  'rights-offering': '유상증자(주주가치 희석)', 'convertible-bond': '전환사채(CB) 발행', 'bond-with-warrant': '신주인수권부사채(BW) 발행',
  'physical-spin-off': '물적분할', 'audit-opinion-qualified': '감사의견 비적정', 'embezzlement-breach': '횡령·배임 공시',
  'controlling-shareholder-conflict': '대주주 이해상충 거래', 'going-concern-doubt': '계속기업 불확실성', 'capital-impairment': '자본잠식'
});
function evidenceOK(e, today) {
  if (!e || !day(e.asOf) || !day(e.checkedAt) || !nonEmpty(e.summary) || !nonEmpty(e.counterEvidence) || !httpsUrl(e.source) || !nonEmpty(e.periodBasis) || !['consolidated', 'separate'].includes(e.periodBasis)) return false;
  const age = daysBetween(e.asOf, today), checked = daysBetween(e.checkedAt, today);
  return age >= 0 && age <= MAX_ASSESSMENT_AGE_DAYS && checked >= 0 && checked <= MAX_CHECK_AGE_DAYS;
}
function claimOK(c, component, today) {
  if (!c || c.component !== component || !nonEmpty(c.claim) || !httpsUrl(c.source) || !day(c.asOf) || c.verification !== 'demo' || !nonEmpty(c.counterScenario)) return 'invalid';
  if (!c.period || !['consolidated', 'separate'].includes(c.period.basis) || !nonEmpty(c.period.fiscalLabel) || !day(c.period.end)) return 'invalid';
  if (!c.filing || !/^\d{14}$/.test(c.filing.id || '') || !['original', 'correction'].includes(c.filing.kind)) return 'invalid';
  if (c.filing.supersededBy != null) return 'superseded';
  const age = daysBetween(c.asOf, today);
  return age >= 0 && age <= MAX_ASSESSMENT_AGE_DAYS ? 'ok' : 'stale';
}
function signals(q, perf, market, out) {
  const r = { drawdown: null, band: null, marketExcess: null, sectorExcess: null, list: [] };
  const metaOK = q && q.synthetic === true && day(q.asOf) && q.currency === 'KRW' && q.timezone === 'Asia/Seoul' && q.adjustment === 'adjusted-consistent' && q.session === 'regular' && finite(q.close) && q.close > 0 && nonEmpty(q.source && q.source.name) && httpsUrl(q.source && q.source.url);
  if (!metaOK) { out.missing.push('합성 종가·KRW·KST·정규장·동일 수정기준·출처 확인 필요'); return null; }
  const age = daysBetween(q.asOf, out.today);
  if (age < 0 || age > MAX_QUOTE_AGE_DAYS) { out.missing.push('시세 기준일이 오래되었거나 미래입니다(허용 ' + MAX_QUOTE_AGE_DAYS + '일)'); return null; }
  const w = day(q.high52wStart) ? daysBetween(q.high52wStart, q.asOf) : NaN;
  if (finite(q.high52w) && q.high52w >= q.close && q.high52wEnd === q.asOf && w >= 360 && w <= 370) {
    r.drawdown = (q.close / q.high52w - 1) * 100;
    r.band = DRAWDOWN_BANDS.filter(v => r.drawdown <= -v + 1e-9).at(-1) ?? null;
    if (r.band !== null) r.list.push({ type: 'drawdown', value: r.drawdown, threshold: -r.band });
  } else out.missing.push('52주 고가가 종가와 같은 수정 기준·기간(360~370일)이 아님');
  const p = perf, span = p && day(p.start) && day(p.end) ? daysBetween(p.start, p.end) : NaN;
  if (p && p.end === q.asOf && span >= 80 && span <= 100 && p.adjustment === q.adjustment && p.currency === 'KRW' && p.benchmark === market && nonEmpty(p.sectorIndex) && finite(p.stockPct) && p.stockPct >= -100) {
    for (const [field, prop, limit, type] of [['marketExcess', 'marketPct', MARKET_UNDERPERFORM, 'market'], ['sectorExcess', 'sectorPct', SECTOR_UNDERPERFORM, 'sector']]) {
      if (finite(p[prop]) && p[prop] >= -100) { r[field] = p.stockPct - p[prop]; if (r[field] <= -limit + 1e-9) r.list.push({ type, value: r[field], threshold: -limit }); }
      else out.missing.push(type === 'market' ? market + ' 비교 데이터 부족' : '업종지수 비교 데이터 부족');
    }
  } else out.missing.push('동일 3개월·KRW·수정기준·해당 시장(' + market + ') 벤치마크 상대수익률 부족');
  return r;
}
function overreactionScore(s) {
  let n = s.band === null ? 0 : DRAWDOWN_POINTS[s.band];
  if (s.marketExcess !== null && s.marketExcess <= -MARKET_UNDERPERFORM + 1e-9) n += 1;
  if (s.sectorExcess !== null && s.sectorExcess <= -SECTOR_UNDERPERFORM + 1e-9) n += 1;
  return Math.min(n, WEIGHTS.overreaction);
}
function valuation(v, sector, today) {
  const prof = SECTORS[sector], r = { score: null, state: 'unknown', flags: [], missing: [], formula: null };
  if (!prof) { r.missing.push('업종 구분 확인 필요'); return r; }
  const h = v && v.pbrHistory;
  if (!v || !evidenceOK(v.evidence, today) || !finite(v.pbr) || v.pbr <= 0 || !finite(v.roe) || !finite(v.roeMedian) || v.roeMedian <= 0 || !h || !['low', 'median', 'high'].every(k => finite(h[k]) && h[k] > 0) || !(h.low <= h.median && h.median <= h.high) || !finite(h.years) || h.years < 5 || !['rising', 'flat', 'falling'].includes(v.epsTrend) || !['trough', 'mid', 'peak', 'unknown'].includes(v.cyclePhase)) { r.missing.push('PBR·ROE·5년 이상 PBR 범위·이익 추세·사이클 위치·근거'); return r; }
  if (prof.cyclical && v.cyclePhase === 'unknown') { r.missing.push('경기민감 업종의 사이클 위치 판단 불가'); return r; }
  let base;
  if (prof.financial) {
    if (v.capitalAdequacy !== true || !finite(v.costOfEquityPct) || v.costOfEquityPct <= 0) { r.missing.push('금융업 자본적정성 확인·자기자본비용 가정 필요'); return r; }
    const justified = v.roe / v.costOfEquityPct, ratio = v.pbr / justified;
    base = justified <= 0 ? 0 : ratio <= 0.6 ? 12 : ratio <= 0.9 ? 8 : ratio <= 1.1 ? 4 : 0;
    r.formula = '금융업: 적정 PBR = ROE ÷ 자기자본비용, 비율 = PBR ÷ 적정 PBR (≤0.6→12, ≤0.9→8, ≤1.1→4, 초과→0, 연구용 초안 구간)';
  } else {
    base = v.pbr <= h.low * 1.1 ? 12 : v.pbr <= h.median ? 8 : v.pbr <= h.high ? 4 : 0;
    r.formula = '자체 PBR 범위 위치: 저점×1.1 이하→12, 중앙값 이하→8, 고점 이하→4, 초과→0 (연구용 초안 구간, 업종 평균 비교 아님)';
  }
  if (v.roe < 0) r.flags.push('적자: 낮은 PBR의 신뢰 불가');
  else if (v.roe < 0.7 * v.roeMedian) r.flags.push('ROE가 과거 중앙값의 70% 미만: 가치함정 의심');
  if (v.epsTrend === 'falling' && base >= 8) r.flags.push('이익 감소 추세: 저평가 착시 가능');
  if (prof.cyclical && v.cyclePhase === 'peak') r.flags.push('이익 정점: 낮은 PER·PBR 신뢰 불가');
  r.base = base;
  if (r.flags.length) { r.score = Math.min(base, 3); r.state = 'trap-risk'; }
  else { r.score = base; r.state = base >= 8 ? 'cheap-confirmed' : base >= 4 ? 'fair' : 'expensive'; }
  return r;
}
function shareholder(s, today) {
  const r = { score: null, notes: [], flags: [], missing: [] };
  if (!s || !evidenceOK(s.evidence, today) || !s.dividend || !finite(s.dividend.yieldPct) || s.dividend.yieldPct < 0 || typeof s.dividend.cut !== 'boolean' || !s.buyback || typeof s.buyback.executed !== 'boolean' || !s.cancellation || !finite(s.cancellation.executedPct) || s.cancellation.executedPct < 0 || !s.governance || typeof s.governance.concern !== 'boolean') { r.missing.push('배당·자사주 취득·소각·지배구조·근거'); return r; }
  const d = s.dividend.cut ? 0 : s.dividend.yieldPct >= 2 ? 5 : s.dividend.yieldPct >= 1 ? 3 : s.dividend.yieldPct > 0 ? 1 : 0;
  let c = 0;
  const cancelEvidence = /^\d{14}$/.test(s.cancellation.filingId || '') && httpsUrl(s.cancellation.source);
  if (s.cancellation.executedPct > 0 && !cancelEvidence) r.notes.push('소각 공시번호·출처가 없어 소각 점수를 인정하지 않음');
  else c = s.cancellation.executedPct >= 1 ? 6 : s.cancellation.executedPct >= 0.3 ? 3 : s.cancellation.executedPct > 0 ? 1 : 0;
  if (s.buyback.executed && s.cancellation.executedPct === 0) r.notes.push('자사주 취득만 있고 실제 소각이 없어 주주환원 점수 0 — 취득은 소각으로 이어질 때만 인정');
  if (s.dividend.cut) r.notes.push('최근 배당 삭감 이력');
  const g = s.governance.concern ? 0 : 4;
  if (s.governance.concern) r.flags.push('지배구조 우려');
  r.score = Math.min(d + c + g, WEIGHTS.shareholder);
  r.formula = '배당(≤5) + 실제 소각(≤6, 공시번호 필요) + 지배구조 이상 없음(4), 최대 15 — 연구용 초안';
  return r;
}
function evaluateBuy(input, { today } = {}) {
  const out = baseResult('kr-buy'); out.today = today;
  const done = () => { delete out.today; return out; };
  if (!input || input.mode !== 'synthetic' || !SYNTH_ID.test(input.id || '') || !day(today)) { out.missing.push('합성 전용 입력 계약(KR-DEMO-* id, 기준일)'); return done(); }
  out.id = input.id; out.weights = copy(WEIGHTS); out.score = null; out.components = null; out.signals = []; out.provenance = {};
  out.notes.push('가중치·구간은 백테스트·검증 전 설계 초안입니다. 추천 정확도를 주장하지 않습니다.');
  out.uncertainty = ['가중치·점수 구간은 임의 설계값(과최적화 위험은 검증 데이터가 생기기 전 평가 불가)', '계량화되지 않는 요소(경영진 신뢰, 정책 변화)는 점수에 반영되지 않음'];
  const cls = classifyInstrument(input.instrument); out.classification = cls;
  if (!cls || cls.decision === 'excluded') { out.status = '제외'; out.reasons.push(...(cls ? cls.reasons : ['분류 불가'])); return done(); }
  if (cls.decision !== 'eligible') { out.status = '판단 보류'; out.reasons.push(...cls.reasons); return done(); }
  if (input.quote && input.quote.tradingStatus !== 'normal') { out.status = '판단 보류'; out.reasons.push('거래정지 또는 상태 미확인 시세 — 판단 보류'); return done(); }
  const market = input.instrument.market;
  const sig = signals(input.quote, input.performance, cls.group === 'etf' && nonEmpty(input.benchmarkOverride) ? input.benchmarkOverride : market, out);
  if (!sig) return done();
  out.provenance.quote = { asOf: input.quote.asOf, close: input.quote.close, currency: 'KRW', timezone: 'Asia/Seoul', session: 'regular', adjustment: input.quote.adjustment, source: copy(input.quote.source) };
  out.signals = sig.list; out.drawdown = sig.drawdown; out.marketExcess = sig.marketExcess; out.sectorExcess = sig.sectorExcess; out.band = sig.band;
  out.formulas.push('낙폭 = (종가 ÷ 52주 고가 − 1) × 100, 동일 수정주가 기준');
  if (cls.group === 'etf') {
    out.status = sig.list.length ? 'ETF 신호만 · 점수 미구현' : '신호 없음';
    out.missing.push('ETF 전용 평가(구성종목·보수·추적오차·괴리율·분배 정책) 규칙은 본 단계에서 미구현');
    out.reasons.push('ETF는 개별주 PER/PBR·실적 규칙으로 평가하지 않음');
    return done();
  }
  if (!sig.list.length) { out.status = '신호 없음'; out.reasons.push('낙폭·상대 부진 신호 없음 — 하락폭만으로 매수하지 않으며, 신호가 없으면 점수도 산출하지 않음'); return done(); }
  const a = input.assessment;
  if (!a || a.synthetic !== true || a.verification !== 'demo' || !day(a.asOf) || !Array.isArray(a.claims) || !a.components || typeof a.components !== 'object') { out.missing.push('합성 재무·정성 평가 입력'); out.status = '평가 불가'; return done(); }
  // Risk flags take precedence over any score (fail closed on unknown tokens).
  const flags = Array.isArray(a.riskFlags) ? a.riskFlags : null;
  if (flags === null) { out.missing.push('위험 공시 표식 목록(riskFlags) 필요'); return done(); }
  if (flags.length) {
    out.status = '위험 우선 · 보류';
    out.riskFlags = flags.map(f => ({ token: f, meaning: RISK_TOKENS[f] || '알 수 없는 위험 표식 — 안전 측으로 보류' }));
    out.reasons.push('위험 공시가 총점보다 우선합니다.'); return done();
  }
  const comp = {}; const invalid = [];
  for (const k of QUALITATIVE) {
    const c = a.claims.filter(x => x && x.component === k);
    const v = a.components[k];
    if (c.length !== 1 || !finite(v) || v < 0 || v > WEIGHTS[k]) { invalid.push(LABELS[k] + ': 점수 또는 근거 1건 필요'); continue; }
    const st = claimOK(c[0], k, today);
    if (st === 'superseded') { invalid.push(LABELS[k] + ': 정정공시로 대체된 근거 — 최신 정정본 근거 필요'); continue; }
    if (st !== 'ok') { invalid.push(LABELS[k] + ': 근거 ' + (st === 'stale' ? '기준일 경과' : '형식 오류')); continue; }
    comp[k] = v; out.counterEvidence.push(c[0].counterScenario);
    (out.provenance.claims = out.provenance.claims || []).push({ component: k, source: c[0].source, asOf: c[0].asOf, period: copy(c[0].period), filing: { id: c[0].filing.id, kind: c[0].filing.kind }, claim: c[0].claim });
  }
  const val = valuation(a.valuation, input.sector, today);
  const sh = shareholder(a.shareholder, today);
  if (val.missing.length) invalid.push(...val.missing.map(m => LABELS.valuation + ': ' + m));
  if (sh.missing.length) invalid.push(...sh.missing.map(m => LABELS.shareholder + ': ' + m));
  if (invalid.length) { out.missing.push(...invalid); out.status = '평가 불가'; out.reasons.push('검증된 재무·정성 근거가 모두 있어야 점수를 계산합니다.'); return done(); }
  comp.overreaction = overreactionScore(sig); comp.valuation = val.score; comp.shareholder = sh.score;
  out.components = comp; out.valuation = { state: val.state, flags: val.flags, base: val.base }; out.shareholderNotes = sh.notes;
  out.formulas.push(val.formula, sh.formula, '낙폭 구간점수(20%→5, 30%→8, 35%→11, 45%→13) + 시장 대비 −15%p 이하 +1 + 업종 대비 −10%p 이하 +1, 최대 15');
  out.counterEvidence.push(a.valuation.evidence.counterEvidence, a.shareholder.evidence.counterEvidence);
  out.provenance.valuation = { source: a.valuation.evidence.source, asOf: a.valuation.evidence.asOf, periodBasis: a.valuation.evidence.periodBasis };
  out.provenance.shareholder = { source: a.shareholder.evidence.source, asOf: a.shareholder.evidence.asOf, periodBasis: a.shareholder.evidence.periodBasis };
  const score = Object.keys(WEIGHTS).reduce((n, k) => n + comp[k], 0);
  out.score = score;
  if (val.state === 'trap-risk') { out.status = '판단 보류'; out.reasons.push('가치함정 의심 — 낮은 밸류에이션 단독으로 매수 후보로 보지 않음: ' + val.flags.join(' / ')); }
  else if (sh.flags.length) { out.status = '판단 보류'; out.reasons.push('지배구조 우려 — ' + sh.flags.join(' / ')); }
  else out.status = score >= 85 ? '최우선 분석 후보' : score >= 70 ? '심층 분석 후보' : score >= 55 ? '관찰' : '판단 보류';
  if (out.missing.length) out.uncertainty.push('일부 비교 데이터가 결측이라 낙폭·상대 부진 점수가 보수적으로 계산됨: ' + out.missing.join(' / '));
  out.reasons.push('분석 우선순위일 뿐 매수 지시·추천이 아닙니다.');
  return done();
}
module.exports = { evaluateBuy, valuation, shareholder, overreactionScore, WEIGHTS, LABELS, RISK_TOKENS, SECTORS, DRAWDOWN_BANDS };
