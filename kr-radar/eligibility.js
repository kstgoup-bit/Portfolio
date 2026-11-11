/* KST KR radar: instrument classification and exclusion policy. Pure function; ambiguity means "hold". */
'use strict';
const { CODE_RE, nonEmpty, day, finite, httpsUrl, copy } = require('./common.js');
const MARKETS = ['KOSPI', 'KOSDAQ'];
const TYPES = ['보통주', '우선주', 'ETF', 'ETN', 'SPAC', '리츠'];
const ETF_KINDS_EVALUABLE = ['domestic-equity', 'overseas-equity', 'covered-call'];
const ETF_KINDS_ALL = [...ETF_KINDS_EVALUABLE, 'bond', 'commodity', 'leveraged-inverse', 'other'];
const ACCOUNTS = ['일반', 'ISA', '연금저축', 'IRP'];
const NAME_LOOKS_ETF = /(ETF|KODEX|TIGER|ACE|RISE|SOL|ARIRANG|HANARO|KOSEF|PLUS|KIWOOM)/i;
const NAME_LOOKS_SPAC = /(스팩|SPAC)/i;
const NAME_LOOKS_PREFERRED = /우[A-Z]?(\(전환\))?$/;
// Policy defaults (revisable only by explicit user approval):
//  excluded: delisted, administrative issue, delisting review, SPAC, leveraged/inverse ETF
//  hold: trading halt, unknown flags, ETN, REIT, preferred share, caution/warning, unclear type, name/type mismatch
function classifyInstrument(i) {
  const out = { code: i && i.code, class: 'unknown', group: 'none', ruleSet: null, decision: 'hold', buyRadar: false, sellReviewAllowed: true, reasons: [], flags: [] };
  if (!i || typeof i !== 'object') { out.reasons.push('입력 없음'); return out; }
  if (!CODE_RE.test(i.code || '')) { out.reasons.push('종목코드 형식 확인 필요(6자리 영숫자)'); return out; }
  if (!nonEmpty(i.name)) { out.reasons.push('종목명 확인 필요'); return out; }
  if (!MARKETS.includes(i.market)) { out.reasons.push('시장구분(KOSPI/KOSDAQ) 확인 필요'); return out; }
  if (!TYPES.includes(i.securityType)) { out.reasons.push('증권 유형 확인 필요'); return out; }
  out.class = i.securityType;
  // Hard exclusions first; a trading halt or an unknown status never becomes eligible by default.
  if (i.delisted === true) { out.decision = 'excluded'; out.sellReviewAllowed = true; out.reasons.push('상장폐지'); return out; }
  if (i.delistingReview === true) { out.decision = 'excluded'; out.reasons.push('상장폐지 사유 발생·실질심사 대상'); return out; }
  if (i.administrativeIssue === true) { out.decision = 'excluded'; out.reasons.push('관리종목'); return out; }
  for (const k of ['delisted', 'delistingReview', 'administrativeIssue', 'tradingHalt']) {
    if (typeof i[k] !== 'boolean') { out.reasons.push('상태 항목 미확인: ' + k); }
  }
  if (out.reasons.length) return out;
  if (i.tradingHalt === true) { out.reasons.push('거래정지 — 매수 판단 보류'); out.flags.push('trading-halt'); return out; }
  if (!['none', '주의', '경고', '위험'].includes(i.investmentCaution)) { out.reasons.push('투자주의 구분 미확인'); return out; }
  if (i.investmentCaution === '경고' || i.investmentCaution === '위험') { out.reasons.push('시장경보 ' + i.investmentCaution + ' — 보류'); return out; }
  if (i.investmentCaution === '주의') out.flags.push('investment-caution');
  // Name/type consistency guards (mis-labeled records stay on hold instead of guessing).
  if (i.securityType !== 'ETF' && NAME_LOOKS_ETF.test(i.name) && i.etfKind == null) { out.reasons.push('종목명이 ETF 표기와 유사한데 유형이 ETF가 아님 — 오분류 의심'); return out; }
  if (i.securityType !== 'SPAC' && NAME_LOOKS_SPAC.test(i.name)) { out.reasons.push('종목명이 SPAC 표기와 유사 — 유형 재확인'); return out; }
  if (i.securityType === '보통주' && NAME_LOOKS_PREFERRED.test(i.name)) { out.reasons.push('종목명이 우선주 표기와 유사한데 보통주로 기재 — 유형 재확인'); return out; }
  if (i.securityType === 'ETF' && !NAME_LOOKS_ETF.test(i.name) && !i.nameVerified) { out.flags.push('etf-name-unrecognized'); }
  switch (i.securityType) {
    case 'SPAC': out.decision = 'excluded'; out.reasons.push('SPAC — 영업실체 없음, 본 레이더 대상 아님'); return out;
    case 'ETN': out.reasons.push('ETN — 발행사 신용위험, 별도 정책 승인 전 보류'); return out;
    case '리츠': out.reasons.push('리츠 — 별도 평가 규칙 미정, 보류'); return out;
    case '우선주': out.reasons.push('우선주 — 보통주와 점수 혼용 금지, 별도 규칙 미정, 보류'); return out;
    case 'ETF': {
      if (!ETF_KINDS_ALL.includes(i.etfKind)) { out.reasons.push('ETF 유형(국내주식형/해외주식형/커버드콜 등) 확인 필요'); return out; }
      if (i.etfKind === 'leveraged-inverse') { out.decision = 'excluded'; out.reasons.push('레버리지·인버스 ETF — 장기 코어 원칙과 충돌, 별도 승인 전 제외'); return out; }
      if (!ETF_KINDS_EVALUABLE.includes(i.etfKind)) { out.reasons.push('ETF 유형 ' + i.etfKind + ' — 평가 규칙 미정, 보류'); return out; }
      out.group = 'etf'; out.ruleSet = 'etf'; out.decision = 'eligible'; out.buyRadar = true; out.etfKind = i.etfKind;
      out.reasons.push('ETF 전용 규칙으로만 평가 — 개별주 PER/PBR·실적 규칙 적용 금지');
      if (i.etfKind === 'covered-call') out.flags.push('covered-call-upside-cap');
      return out;
    }
    case '보통주': out.group = 'stock'; out.ruleSet = 'stock'; out.decision = 'eligible'; out.buyRadar = true; out.reasons.push('보통주 — 개별주 규칙'); return out;
  }
  return out;
}
const roleOf = account => account === '연금저축' || account === 'IRP' ? 'core' : account === '일반' ? 'satellite' : 'undetermined';
// Account suitability is never assumed. Only a user-supplied, dated, sourced rule can answer it.
function accountReview(classification, account, confirmedRules) {
  const out = { account, role: ACCOUNTS.includes(account) ? roleOf(account) : 'undetermined', status: '확인 필요', reasons: [] };
  if (!ACCOUNTS.includes(account)) { out.reasons.push('계좌 유형 확인 필요'); return out; }
  if (account === 'ISA') out.reasons.push('ISA는 코어/새틀라이트 역할이 정책으로 정해지지 않음');
  const key = classification && (classification.group === 'etf' ? 'etf:' + classification.etfKind : classification.group === 'stock' ? 'stock' : null);
  if (!key) { out.reasons.push('편입 가능 분류 아님'); return out; }
  const rule = Array.isArray(confirmedRules) ? confirmedRules.find(r => r && r.account === account && r.assetKey === key) : null;
  if (!rule || typeof rule.allowed !== 'boolean' || !day(rule.confirmedAt) || !httpsUrl(rule.source)) { out.reasons.push('계좌별 편입 가능성은 추정하지 않음 — 사용자가 날짜·출처와 함께 확인한 규칙 필요'); return out; }
  out.status = rule.allowed ? '편입 가능(사용자 확인 규칙)' : '편입 불가(사용자 확인 규칙)';
  out.rule = copy(rule);
  return out;
}
module.exports = { classifyInstrument, accountReview, roleOf, ACCOUNTS, MARKETS, TYPES, ETF_KINDS_EVALUABLE, ETF_KINDS_ALL };
