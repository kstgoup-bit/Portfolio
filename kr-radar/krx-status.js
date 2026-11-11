/* KST (stage12): 73개 후보 검증 결과를 VERIFIED / MISMATCH / PENDING / EXCLUDED 4상태로 정리한다. Pure.
   VERIFIED 는 (사용자가 제공/로컬 실행기가 받은 공식 응답) + 기준일 + 응답 해시가 모두 있을 때만. 실제 주가 확인·활성 감시 수와 절대 합산하지 않는다. */
'use strict';
const { VERIFIER_VERSION } = require('./krx-run.js');
const PL = require('./pipeline.js');
const STATES = Object.freeze(['VERIFIED', 'MISMATCH', 'PENDING', 'EXCLUDED']);
// 비교 우선순위(문서화): ① 제외 확정 ② 우선주(API 미제공) ③ 응답 차단(기준일/해시/권리) ④ 코드(정규화 후) 존재 ⑤ 시장 ⑥ 종목명(NFC 정확 일치) ⑦ ISIN ⑧ 유형 의심
const MISMATCH_RULES = /^(name-mismatch|market-mismatch|isin-mismatch|security-type-suspected)/;
const NOTES = Object.freeze({ 'name-mismatch': '종목명 불일치 — 이름 변경 가능성은 있으나 이 API로는 개명/기업행위를 확인할 수 없음(사람 검토)', 'market-mismatch': '시장 불일치 — 시장 이전 가능성(이 API로 사유 확인 불가)', 'isin-mismatch': 'ISIN 불일치', 'not-found-in-response': '응답에 없음 — 상장폐지/코드 오류/응답 범위 밖 모두 가능(원인 미확정)', 'preferred-not-provided-by-api': '우선주는 API 미제공 대상' });
function stateOf(e) {
  if (e.status === 'excluded') return ['EXCLUDED', e.rule];
  if (e.status === 'verified') return e.baseDate && e.responseSha256Present ? ['VERIFIED', e.rule] : ['PENDING', 'verified-evidence-incomplete'];
  if (MISMATCH_RULES.test(e.rule || '')) return ['MISMATCH', e.rule];
  if (e.status === 'fixture-matched') return ['PENDING', 'fixture-only(공식 조회 아님)'];
  return ['PENDING', e.rule || 'pending'];
}
function toStates(comparison) {
  const zero = () => ({ VERIFIED: 0, MISMATCH: 0, PENDING: 0, EXCLUDED: 0, total: 0 });
  const t = { stock: zero(), etf: zero(), preferred: zero() };
  const hash = comparison && comparison.log && comparison.log[0] ? comparison.log[0].responseSha256 : null;
  const entries = (comparison && comparison.entries || []).map((e, i) => {
    const log = comparison.log[i], [state, rule] = stateOf({ ...e, responseSha256Present: !!(log && /^[0-9a-f]{64}(,[0-9a-f]{64})*$/.test(log.responseSha256 || '')) });
    const isPref = rule === 'preferred-not-provided-by-api', bucket = e.group === 'etf' ? 'etf' : isPref ? 'preferred' : 'stock';
    t[bucket][state]++; t[bucket].total++;
    return { code: e.code, name: e.name, group: bucket, state, rule, note: NOTES[rule] || null, baseDate: e.baseDate, evidenceHash: state === 'VERIFIED' ? log.responseSha256 : null, verifierVersion: VERIFIER_VERSION, signalsEnabled: false, priceVerified: false, decision: 'HOLD', priceStatus: 'DATA_UNAVAILABLE' };
  });
  return { entries, totals: t, hashPresent: !!hash, realPriceVerifiedCount: 0, actualActiveMonitoredCount: 0, note: 'VERIFIED = 종목 신원 일치만 의미. 실제 주가 확인 종목 수·활성 감시 종목 수와 별개(둘 다 0).' };
}
/* 어떤 경우에도 미검증 종목의 매수·매도 신호는 열리지 않는다. 검증돼도 정책(realActivationAllowed=false)이 막는다. */
function signalGate(entry) {
  const why = [];
  if (!entry || entry.state !== 'VERIFIED') why.push('KRX 신원 ' + (entry ? entry.state : '없음'));
  if (!entry || entry.priceVerified !== true) why.push('실제 시세 미검증');
  if (!PL.POLICY.realActivationAllowed) why.push(PL.POLICY.reason);
  return { allowed: why.length === 0, reasons: why, decision: 'HOLD' };
}
module.exports = { STATES, MISMATCH_RULES, NOTES, stateOf, toStates, signalGate };
