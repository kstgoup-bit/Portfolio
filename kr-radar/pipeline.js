/* KST (stage10): per-instrument data pipeline state machine. Pure, immutable records, synthetic evidence only.
   미연결 → 권리 확인 → 원본 무결성 → 날짜/시장/시간대 → 수정주가 일관성 → 벤치마크 대조 → 2차 출처 검증 → 수동 승인 → 읽기 전용 활성화
   No step can be skipped. The last step is DISABLED by policy in stage 10, so nothing can ever become active here. */
'use strict';
const { finite, nonEmpty, day, daysBetween, MAX_QUOTE_AGE_DAYS } = require('./common.js');
const R = require('./rights.js'), S = require('./signals.js');
const STATES = Object.freeze(['미연결', '권리 확인', '원본 무결성', '날짜/시장/시간대', '수정주가 일관성', '벤치마크 대조', '2차 출처 검증', '수동 승인', '읽기 전용 활성화']);
const POLICY = Object.freeze({ realActivationAllowed: false, reason: '10단계: 실제 호출·활성화는 사용자의 별도 명시 승인 전까지 금지' });
const newRecord = (symbol, market) => Object.freeze({ symbol, market, state: '미연결', history: Object.freeze([]), hold: null, synthetic: true, actualActiveCount: 0, realApiRequests: 0 });
const CHECK = {
  '권리 확인': (e, t) => { if (!e || !e.provider) return '공급자 없음'; const v = R.verdict(e.provider, { today: t }); return v.verdict === '후보 적격' ? null : '공급자 ' + v.verdict + ': ' + v.reasons.join('; '); },
  '원본 무결성': e => !e ? '증거 없음' : e.sha256Matches !== true ? '원본 해시 불일치/미확인' : !Number.isInteger(e.rowCount) || e.rowCount !== e.expectedRowCount ? '행 수 불일치' : e.official !== true ? '공식 출처로 인정되지 않음' : null,
  '날짜/시장/시간대': (e, t) => !e || !day(e.asOf) ? '기준일 없음' : e.asOf > t ? '미래 날짜' : daysBetween(e.asOf, t) > MAX_QUOTE_AGE_DAYS ? '오래된 시세' : e.isTradingDay !== true ? '휴장일/주말 또는 캘린더 미확인' : e.session !== 'regular' ? '정규장 아님' : e.timezoneMatches !== true ? '시간대 불일치' : null,
  '수정주가 일관성': e => !e ? '증거 없음' : e.closeBasis !== e.highBasis || !['adjusted-consistent', 'unadjusted'].includes(e.closeBasis) ? '종가·52주 고가 조정 기준 불일치/미상' : e.splitInWindow === true && e.closeBasis === 'unadjusted' ? '분할 구간의 비조정 가격' : null,
  '벤치마크 대조': e => { if (!e) return '증거 없음'; const r = S.relativeReturn(e.stockWindow, e.benchWindow); return r.ok ? null : r.reason; },
  '2차 출처 검증': e => !e || e.independent !== true ? '독립 2차 출처 없음' : !finite(e.closeDiffPct) || Math.abs(e.closeDiffPct) > 0.5 ? '출처 간 종가 차이 > 0.5%' : null,
  '수동 승인': (e, t) => !e || e.approvedBy !== 'user' || !day(e.approvedAt) || e.approvedAt > t || !nonEmpty(e.scope) ? '사용자의 명시 승인 기록 없음' : null,
  '읽기 전용 활성화': () => POLICY.realActivationAllowed ? null : POLICY.reason
};
function advance(rec, evidence, { today } = {}) {
  if (!day(today) || !rec || !STATES.includes(rec.state)) return { ok: false, record: rec, reason: '입력 오류' };
  const i = STATES.indexOf(rec.state); if (i === STATES.length - 1) return { ok: false, record: rec, reason: '이미 마지막 상태' };
  const target = STATES[i + 1], problem = CHECK[target](evidence, today);
  const entry = Object.freeze({ to: target, at: today, result: problem ? '보류' : '통과', reason: problem || '조건 충족', realPrice: false });
  if (problem) return { ok: false, record: Object.freeze({ ...rec, hold: problem, history: Object.freeze([...rec.history, entry]) }), reason: problem };
  return { ok: true, record: Object.freeze({ ...rec, state: target, hold: null, history: Object.freeze([...rec.history, entry]) }), reason: null };
}
// A later conflict (stale quote, source disagreement, correction filing, terms change) drops the instrument back to 미연결; nothing stays scored.
function invalidate(rec, reason, today) { return Object.freeze({ ...rec, state: '미연결', hold: reason, history: Object.freeze([...rec.history, Object.freeze({ to: '미연결', at: today, result: '무효화', reason, realPrice: false })]) }); }
const isEvaluable = rec => !!rec && rec.state === STATES[STATES.length - 1];
module.exports = { STATES, POLICY, newRecord, advance, invalidate, isEvaluable };
