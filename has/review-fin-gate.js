/* 매수 후보 카드 '판단 보류(재무·시세 검증 전)' 해제 규칙 — 순수 함수(네트워크·저장소·주문 없음). 제안안, 순태씨 승인 전 앱에 연결하지 않는다.
 * 해제(released)는 아래를 모두 만족할 때만: ① 재무 판정이 이 종목의 'strong'(최신 결산 3년 이상·신선·충돌 없음) ② 시세가 독립 출처로 대조됨(ok·최근)
 * ③ 지피 합의 agreed(7일 이내 — 카드의 합의 계산 결과를 그대로 받음). 하나라도 빠지거나 형식이 이상하면 held(보류), 재무가 weak이면 blocked.
 * 해제돼도 밸류에이션은 아직 연결 전이라 라벨은 '재무 확인됨(밸류에이션 미확인)'까지만이고 금액·주문 안내는 만들지 않는다(차트 관문 규칙은 별도).
 * 입력의 합성(synthetic) 표시는 해제를 막는다. 투자 자문 아님. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASReviewFinGate = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var BUY = ['buy-review', 'add-review'], PRICE_MAX_AGE_DAYS = 7, FIN_MAX_AGE_DAYS = 550, VERSION = 'has-fundamental-v1';
  var NOTICE = '검토 의견이며 투자 자문이 아닙니다. 해제는 재무·시세·합의 확인 표시일 뿐 매수 지시가 아닙니다. 밸류에이션·금액은 별도입니다.';
  function plain(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
  function day(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function age(from, today) { return (Date.parse(today + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000; }
  function done(state, missing, extra) {
    var o = { state: state, missing: missing, label: null, valuationLinked: false, notice: NOTICE };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  /* input = {card:{ticker,market,verdict}, assessment:<fundamental-filter assess() 결과>, price:{verification,status,marketDate,synthetic?},
   *          consensus:'agreed'|'solo'|'disagree'|'no-response'|'expired'|'mismatch', synthetic?:bool} */
  function evaluate(input, nowISO) {
    if (typeof nowISO !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(nowISO) || !day(nowISO.slice(0, 10))) return done('held', ['invalid-now']);
    var today = nowISO.slice(0, 10);
    if (!plain(input) || !plain(input.card) || typeof input.card.ticker !== 'string' || (input.card.market !== 'KR' && input.card.market !== 'US')) return done('held', ['invalid-input']);
    if (BUY.indexOf(input.card.verdict) < 0) return done('held', ['not-buy-side']);      // 해제 규칙은 매수 쪽 카드에만 해당
    var missing = [], a = input.assessment, p = input.price;
    if (input.synthetic === true || (plain(a) && a.synthetic === true) || (plain(p) && p.synthetic === true)) return done('held', ['synthetic-input']);
    // ① 재무
    var finOk = plain(a) && a.version === VERSION && a.signalHold === true && typeof a.label === 'string' && a.ticker === input.card.ticker && Array.isArray(a.checks) && typeof a.years === 'number' && day(a.asOf);
    if (!finOk) missing.push('financials-missing');
    else if (a.label === 'weak') return done('blocked', ['financials-weak'], { asOf: a.asOf });
    else if (a.label !== 'strong' || a.reviewEligible !== true) missing.push('financials-not-strong');
    else if (a.years < 3 || (Array.isArray(a.conflicts) && a.conflicts.length) || age(a.asOf, today) < 0 || age(a.asOf, today) > FIN_MAX_AGE_DAYS) missing.push('financials-stale-or-conflict');
    // ② 시세
    var priceOk = plain(p) && p.verification === 'independent-verified' && p.status === 'ok' && day(p.marketDate) && age(p.marketDate, today) >= 0 && age(p.marketDate, today) <= PRICE_MAX_AGE_DAYS;
    if (!priceOk) missing.push('price-not-verified');
    // ③ 합의
    if (input.consensus !== 'agreed') missing.push('consensus-' + (typeof input.consensus === 'string' && /^[a-z-]{1,20}$/.test(input.consensus) ? input.consensus : 'unknown'));
    if (missing.length) return done('held', missing, finOk ? { asOf: a.asOf } : null);
    return done('released', [], { asOf: a.asOf, priceDate: p.marketDate, label: '매수 검토 · 재무 확인됨(밸류에이션 미확인) · 재무 기준일 ' + a.asOf + ' · 시세 ' + p.marketDate });
  }
  return Object.freeze({ evaluate: evaluate, PRICE_MAX_AGE_DAYS: PRICE_MAX_AGE_DAYS });
});
