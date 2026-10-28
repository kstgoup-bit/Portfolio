/* KST (stage9): read-only 5+5 pilot gate, SYNTHETIC inputs only. Sequential stages; any non-pass stops the chain and nothing links to
   scoring or active monitoring. No network, storage, env, timers. Real (non-synthetic) input is refused in this stage. */
'use strict';
const { finite, nonEmpty, day, daysBetween, httpsUrl, MAX_QUOTE_AGE_DAYS } = require('./common.js');
const R = require('./rights.js'), E = require('./eligibility.js');
const US_PILOT_SYMBOLS = Object.freeze(['MSFT', 'GOOGL', 'AVGO', 'VRT', 'JPM']);
const STAGES = Object.freeze(['rights', 'eligibility', 'session', 'adjustment', 'high52w', 'crossCheck', 'useRights']);
const MIN_OBS = 240, WINDOW = [360, 370], CLOSE_TOL = 0.005, HIGH_TOL = 0.01;
const rec = (stage, status, reason, source, today, scope) => ({ stage, status, reason, source: source || null, checkedAt: today, scope, realPrice: false });
const weekday = d => { const w = new Date(d + 'T00:00:00Z').getUTCDay(); return w !== 0 && w !== 6; };
function stageRights(i, today) {
  const p = i.provider; if (!p || !p.fields) return rec('rights', '보류', '공급자 정보 없음', null, today, '공급자 판정');
  const v = R.verdict(p, { today });
  const markets = p.markets || []; const ok = i.market === 'US' ? markets.includes('US') || markets.includes('GLOBAL') : markets.includes('KR');
  if (!ok) return rec('rights', '실패', '공급자가 해당 시장을 지원한다고 확인되지 않음', null, today, p.id);
  if (v.verdict === '부적격') return rec('rights', '실패', '공급자 부적격: ' + v.reasons.join('; '), null, today, p.id);
  if (v.verdict === '미확정') return rec('rights', '보류', '공급자 미확정: ' + v.reasons.join('; '), null, today, p.id);
  return rec('rights', '통과', '후보 적격(연결 승인 아님)', null, today, p.id);
}
function stageEligibility(i, today) {
  if (i.market === 'US') return US_PILOT_SYMBOLS.includes(i.symbol) ? rec('eligibility', '통과', '미국 고정 파일럿 5종목', null, today, i.symbol) : rec('eligibility', '실패', '미국 고정 5종목(MSFT, GOOGL, AVGO, VRT, JPM)이 아님', null, today, i.symbol);
  const s = i.instrument; if (!s) return rec('eligibility', '보류', '국장 종목 정보 없음', null, today, i.symbol);
  if (s.group !== 'stock') return rec('eligibility', '실패', '국장 파일럿은 개별주만(ETF 분리)', null, today, s.code);
  if (s.listingCheck !== 'matched' || s.reviewStatus !== 'verified') return rec('eligibility', '보류', '공식 상장목록 미검증', null, today, s.code);
  const c = E.classifyInstrument(s);
  if (c.decision === 'excluded') return rec('eligibility', '실패', '제외: ' + c.reasons.join('; '), null, today, s.code);
  if (c.decision !== 'eligible') return rec('eligibility', '보류', '적격 미확정: ' + c.reasons.join('; '), null, today, s.code);
  return rec('eligibility', '통과', '공식 대조 + 상태 플래그 확인', null, today, s.code);
}
function stageSession(i, today) {
  const q = i.series, c = i.calendar;
  if (!q || !c) return rec('session', '보류', '시세 또는 거래소 캘린더 없음', null, today, '거래일');
  if (!day(q.asOf) || !day(c.coverage && c.coverage.from) || !day(c.coverage && c.coverage.to) || !Array.isArray(c.holidays) || !nonEmpty(c.tz) || !httpsUrl(c.source)) return rec('session', '보류', '캘린더 형식/출처 불완전', null, today, '거래일');
  if (q.timezone !== c.tz) return rec('session', '실패', '시간대 불일치', c.source, today, '거래일');
  if (q.asOf > today) return rec('session', '실패', '미래 날짜 시세', c.source, today, q.asOf);
  if (q.asOf < c.coverage.from || q.asOf > c.coverage.to) return rec('session', '보류', '캘린더 범위 밖 — 휴장일 판정 불가', c.source, today, q.asOf);
  if (!weekday(q.asOf) || c.holidays.includes(q.asOf)) return rec('session', '실패', '휴장일/주말 가격', c.source, today, q.asOf);
  if (q.session !== 'regular') return rec('session', '실패', '정규장 외(시간외·혼합) 가격', c.source, today, q.asOf);
  if (daysBetween(q.asOf, today) > MAX_QUOTE_AGE_DAYS) return rec('session', '보류', '오래된 시세(최신성 초과)', c.source, today, q.asOf);
  return rec('session', '통과', '정규장 거래일·최신', c.source, today, q.asOf);
}
function stageAdjustment(i, today) {
  const q = i.series; if (!q) return rec('adjustment', '보류', '시세 없음', null, today, '조정 기준');
  const ok = ['adjusted-consistent', 'unadjusted'];
  if (!ok.includes(q.closeBasis) || !ok.includes(q.highBasis)) return rec('adjustment', '실패', '조정 기준 미상/혼합', null, today, '종가·52주 고가');
  if (q.closeBasis !== q.highBasis) return rec('adjustment', '실패', '종가와 52주 고가의 조정 기준 불일치(혼합 금지)', null, today, '종가·52주 고가');
  const splits = Array.isArray(q.splits) ? q.splits : null; if (!splits) return rec('adjustment', '보류', '분할 이력 미제공', null, today, '분할');
  const inWin = splits.some(s => day(s.date) && s.date >= q.high52wStart && s.date <= q.high52wEnd);
  if (q.closeBasis === 'unadjusted' && inWin) return rec('adjustment', '실패', '52주 창에 분할이 있는데 비조정 가격', null, today, '분할');
  if (q.closeBasis === 'adjusted-consistent' && q.adjustedThroughAsOf !== true) return rec('adjustment', '보류', '조정이 기준일까지 반영됐는지 미확인', null, today, '조정');
  return rec('adjustment', '통과', '동일 조정 기준', null, today, '종가·52주 고가');
}
function stageHigh(i, today) {
  const q = i.series; if (!q || !finite(q.close) || !finite(q.high52w) || q.close <= 0) return rec('high52w', '보류', '종가/52주 고가 없음', null, today, '52주');
  if (!day(q.high52wStart) || q.high52wEnd !== q.asOf) return rec('high52w', '보류', '52주 창 기간 불명확', null, today, '52주');
  const w = daysBetween(q.high52wStart, q.high52wEnd);
  if (w < WINDOW[0] || w > WINDOW[1]) return rec('high52w', '보류', '52주 창 길이 부족/초과', null, today, '52주');
  if (!Number.isInteger(q.observations) || q.observations < MIN_OBS) return rec('high52w', '보류', '관측 수 부족(' + q.observations + ' < ' + MIN_OBS + ')', null, today, '52주');
  if (q.high52w < q.close) return rec('high52w', '실패', '52주 고가가 종가보다 낮음', null, today, '52주');
  return rec('high52w', '통과', '52주 창·관측 수 충족', null, today, '52주');
}
function stageCross(i, today) {
  const a = i.series, b = i.crossCheck; if (!b) return rec('crossCheck', '보류', '독립 교차검증 출처 없음', null, today, '교차검증');
  if (b.independent !== true || !b.source || !a.source || b.source.id === a.source.id) return rec('crossCheck', '보류', '독립 출처가 아님(동일 공급자)', null, today, '교차검증');
  if (b.asOf !== a.asOf || b.adjustmentBasis !== a.closeBasis) return rec('crossCheck', '실패', '기준일/조정 기준이 달라 비교 불가', null, today, '교차검증');
  if (!finite(b.close) || !finite(b.high52w)) return rec('crossCheck', '보류', '교차검증 값 누락', null, today, '교차검증');
  const dc = Math.abs(b.close / a.close - 1), dh = Math.abs(b.high52w / a.high52w - 1);
  if (dc > CLOSE_TOL || dh > HIGH_TOL) return rec('crossCheck', '실패', '두 출처 불일치: 종가 ' + (dc * 100).toFixed(2) + '%, 고가 ' + (dh * 100).toFixed(2) + '%', null, today, '교차검증');
  return rec('crossCheck', '통과', '독립 두 출처 일치', null, today, '교차검증');
}
function stageUse(i, today) {
  const u = i.plannedUse, p = i.provider; if (!u || !p || !p.fields) return rec('useRights', '보류', '사용 계획/공급자 없음', null, today, '표시·저장');
  if (u.shareWithOthers === true) return rec('useRights', '실패', '타인 공유/공개 저장소/배포본 포함 계획 — 개인 범위 밖', null, today, '공유');
  const need = [];
  if (u.display) need.push('personalDisplay'); if (u.storeLocally) need.push('localCacheRights'); if (u.derivedMetrics) need.push('internalProcessing', 'derivedRetention');
  const miss = need.filter(k => !(p.fields[k] && p.fields[k].status === 'confirmed'));
  if (miss.length) return rec('useRights', '보류', '권리 미확인: ' + miss.join(', '), null, today, '표시·저장');
  return rec('useRights', '통과', '계획한 사용 권리 확인됨', null, today, '표시·저장');
}
const FN = { rights: stageRights, eligibility: stageEligibility, session: stageSession, adjustment: stageAdjustment, high52w: stageHigh, crossCheck: stageCross, useRights: stageUse };
function evaluateSymbol(input, { today } = {}) {
  const base = { kind: 'pilot-gate', symbol: input && input.symbol, market: input && input.market, stages: [], overall: '실패', synthetic: true, scoreLinked: false, activeWatch: false, actualActiveCount: 0, realPriceValidated: 0, realApiRequests: 0 };
  if (!day(today) || !input || !['US', 'KR'].includes(input.market) || !nonEmpty(input.symbol)) { base.reason = '입력 형식 오류'; return base; }
  if (input.synthetic !== true) { base.reason = '9단계는 합성 입력만 허용 — 실제 가격 입력은 별도 승인 전 거부'; return base; }
  let blocked = null;
  for (const s of STAGES) {
    if (blocked) { base.stages.push(rec(s, '보류', '선행 단계 미통과: ' + blocked, null, today, '-')); continue; }
    const r = FN[s](input, today); base.stages.push(r);
    if (r.status !== '통과') blocked = r.stage;
  }
  const first = base.stages.find(x => x.status !== '통과');
  base.overall = first ? first.status : '통과(합성)';
  return base;
}
// KR pilot picks must be explicit human choices that are officially verified individual stocks. Never auto-selected.
function selectKrPilot(universe, picks) {
  const byCode = new Map(((universe && universe.securities) || []).map(s => [s.code, s])); const accepted = [], rejected = [];
  for (const code of Array.isArray(picks) ? picks : []) {
    const s = byCode.get(code);
    if (!s) rejected.push({ code, reason: '후보 목록에 없음' });
    else if (s.group !== 'stock') rejected.push({ code, reason: 'ETF는 분리' });
    else if (s.listingCheck !== 'matched' || s.reviewStatus !== 'verified') rejected.push({ code, reason: '공식 상장목록 미검증' });
    else if (accepted.includes(code)) rejected.push({ code, reason: '중복' });
    else if (accepted.length >= 5) rejected.push({ code, reason: '5종목 초과' });
    else accepted.push(code);
  }
  return { accepted, rejected, krPilotCount: accepted.length, usPilotCount: US_PILOT_SYMBOLS.length, note: accepted.length < 5 ? '국장 파일럿 5종목 미충족(공식 검증 후에만 선정)' : '선정 완료(사람의 선택) — 실제 호출은 별도 승인' };
}
module.exports = { US_PILOT_SYMBOLS, STAGES, MIN_OBS, WINDOW, evaluateSymbol, selectKrPilot };
