/* KST (stage12): 공급자 선정 자료 검증 + 월 호출량 추정 + 최소 파일럿 승인 체크리스트. Pure. 공급자 페이지 열람 결과의 구조 검증일 뿐 실데이터 판정이 아니다. */
'use strict';
const { nonEmpty, day, httpsUrl, daysBetween } = require('./common.js');
const TIERS = ['primary', 'alternate', 'hold', 'excluded'];
const MAX_AGE_DAYS = 30;
function validateSelection(cat, { today } = {}) {
  const errors = [];
  if (!cat || cat.schemaVersion !== 1 || !Array.isArray(cat.providers) || !cat.pilot) return { errors: ['스키마 오류'] };
  const ids = new Set();
  for (const p of cat.providers) {
    if (!nonEmpty(p.id) || ids.has(p.id)) errors.push('id 오류/중복: ' + p.id); ids.add(p.id);
    if (!['US', 'KR'].includes(p.market)) errors.push(p.id + ': market');
    if (!TIERS.includes(p.tier)) errors.push(p.id + ': tier');
    if (!nonEmpty(p.reason)) errors.push(p.id + ': 사유 필수(1순위/대안/보류/제외 모두)');
    if (!Array.isArray(p.evidence) || !p.evidence.length) errors.push(p.id + ': 근거 필요');
    else for (const e of p.evidence) { if (!nonEmpty(e.fact) || !httpsUrl(e.source) || !day(e.checkedAt)) errors.push(p.id + ': 근거 형식(fact/https source/checkedAt)'); else if (day(today) && daysBetween(e.checkedAt, today) > MAX_AGE_DAYS) errors.push(p.id + ': 근거 ' + MAX_AGE_DAYS + '일 경과'); }
    if (p.tier !== 'excluded' && (!Array.isArray(p.unknowns) || !p.unknowns.length)) errors.push(p.id + ': 미확정 항목 목록 필요(데이터 접근 없이 "모두 확인" 주장 금지)');
    if (p.costUsdMonthly !== null && !(Array.isArray(p.costUsdMonthly) && p.costUsdMonthly.length === 2 && p.costUsdMonthly[0] <= p.costUsdMonthly[1])) errors.push(p.id + ': 비용 범위');
  }
  for (const m of ['US', 'KR']) {
    const ps = cat.providers.filter(p => p.market === m);
    if (ps.filter(p => p.tier !== 'excluded').length < 2) errors.push(m + ': 비교 대상 2곳 이상 필요');
    if (ps.filter(p => p.tier === 'primary').length !== 1) errors.push(m + ': 1순위는 정확히 1곳');
  }
  const text = JSON.stringify(cat);
  if (/(api[_-]?key|secret|token|password|serviceKey)\s*[:=]\s*["']?[A-Za-z0-9_\-%]{12,}/i.test(text)) errors.push('비밀값 의심');
  return { errors };
}
/* 일봉 1일 1회 갱신 기준. 호출 = (종목 + 벤치마크) × 거래일, 두 번째 출처 교차검증이면 ×2(두 공급자에 각각). */
function estimateMonthlyCalls({ symbols, benchmarks, tradingDays = 22, crossCheck = true }) {
  const perDay = symbols + benchmarks, perProvider = perDay * tradingDays;
  return { perDay, perProviderPerMonth: perProvider, totalPerMonth: crossCheck ? perProvider * 2 : perProvider, note: crossCheck ? '두 공급자 각각 같은 수를 호출' : '단일 출처(교차검증 없음)' };
}
function pilotChecklist(flags = {}, items) {
  const missing = items.filter(k => flags[k] !== true);
  return { ready: missing.length === 0, missing, note: '사람의 확인 값만 사용 — 이 모듈은 승인을 만들지 않음' };
}
module.exports = { TIERS, MAX_AGE_DAYS, validateSelection, estimateMonthlyCalls, pilotChecklist };
