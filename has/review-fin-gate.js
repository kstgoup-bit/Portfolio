/* 매수 후보 카드 '판단 보류(재무·시세 검증 전)' 해제 규칙 — 순수 함수(네트워크·저장소·주문 없음). 제안안, 순태씨 승인 전 앱에 연결하지 않는다.
 * 해제(released)는 아래를 모두 만족할 때만: ① 재무 판정이 이 종목의 'strong'(최신 결산 3년 이상·신선·충돌 없음) ② 시세가 독립 출처로 대조됨(ok·최근)
 * ③ 지피 합의 agreed(구조화 기록: 같은 종목·시장·판단, 카드 이후 7일 이내, 클로·지피 모두). 하나라도 빠지거나 형식이 이상하면 held(보류), 재무가 weak이면 blocked.
 * 해제돼도 밸류에이션은 아직 연결 전이라 라벨은 '재무 확인됨(밸류에이션 미확인)'까지만이고 금액·주문 안내는 만들지 않는다(차트 관문 규칙은 별도).
 * 입력의 합성(synthetic) 표시는 해제를 막고, 합성 여부가 false로 명시되지 않은 재무 출처도 해제하지 않는다. 투자 자문 아님. */
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
    var CCY = { KR: 'KRW', US: 'USD' }, FIN_OK = ['independent-verified'], REVIEWERS = ['claude', 'gpt'];
  function str(x, n) { return typeof x === 'string' && x.trim().length > 0 && x.length <= (n || 200); }
  function within(d, today, max) { return day(d) && age(d, today) >= 0 && age(d, today) <= max; }
  /* 구조화 계약 초안(2026-11-28, CR-FIN-P1 — 채택은 순태씨 승인 별도, 승인 전 앱·발행 경로에 연결 금지)
   * input = {card:{ticker,market,verdict,asOf},
   *          assessment:<fundamental-filter assess() 결과> + provenance:{ticker,market,synthetic:false,verification:'independent-verified',source},
   *          price:{ticker,market,currency,priceType:'close',adjustment,verification:'independent-verified',status:'ok',marketDate,
   *                 evidence:[{source,marketDate,close}, …서로 다른 출처 2개 이상], verifier, synthetic?},
   *          consensus:{status:'agreed',ticker,market,verdict,decidedOn,reviewers:['claude','gpt'],evidence}, synthetic?:bool}
   * 하나라도 빠지거나 형식·종목·시장·통화·날짜가 어긋나면 보류(실패 폐쇄). 문자열 합의('agreed')는 더 이상 해제하지 않는다. */
  function priceCheck(p, card, today) {
    if (!plain(p)) return false;
    if (p.ticker !== card.ticker || p.market !== card.market || p.currency !== CCY[card.market]) return false;
    if (p.priceType !== 'close' || !str(p.adjustment, 40) || !str(p.verifier, 40)) return false;
    if (p.verification !== 'independent-verified' || p.status !== 'ok' || !within(p.marketDate, today, PRICE_MAX_AGE_DAYS) || p.marketDate > card.asOf) return false;
    if (!Array.isArray(p.evidence) || p.evidence.length < 2) return false;
    var srcs = Object.create(null), n = 0;
    for (var i = 0; i < p.evidence.length; i++) {
      var e = p.evidence[i];
      if (!plain(e) || !str(e.source, 60) || e.marketDate !== p.marketDate || typeof e.close !== 'number' || !Number.isFinite(e.close) || e.close <= 0) return false;
      if (!srcs[e.source]) { srcs[e.source] = 1; n++; }
    }
    return n >= 2;
  }
  function consensusCode(c, card, today) {
    if (typeof c === 'string') return 'consensus-unstructured';
    if (!plain(c)) return 'consensus-unknown';
    if (c.status !== 'agreed') return 'consensus-' + (typeof c.status === 'string' && /^[a-z-]{1,20}$/.test(c.status) ? c.status : 'unknown');
    if (c.ticker !== card.ticker || c.market !== card.market || c.verdict !== card.verdict) return 'consensus-mismatch';
    if (!within(c.decidedOn, today, PRICE_MAX_AGE_DAYS) || c.decidedOn < card.asOf) return 'consensus-expired';
    if (!Array.isArray(c.reviewers) || REVIEWERS.some(function (r) { return c.reviewers.indexOf(r) < 0; }) || !str(c.evidence, 500)) return 'consensus-unverified';
    return null;
  }
  function evaluate(input, nowISO) {
    if (typeof nowISO !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(nowISO) || !day(nowISO.slice(0, 10))) return done('held', ['invalid-now']);
    var today = nowISO.slice(0, 10);
    if (!plain(input) || !plain(input.card) || !str(input.card.ticker, 12) || (input.card.market !== 'KR' && input.card.market !== 'US')) return done('held', ['invalid-input']);
    if (BUY.indexOf(input.card.verdict) < 0) return done('held', ['not-buy-side']);      // 해제 규칙은 매수 쪽 카드에만 해당
    var card = input.card, missing = [], a = input.assessment, p = input.price;
    if (!within(card.asOf, today, PRICE_MAX_AGE_DAYS)) return done('held', ['card-date-invalid']);
    var pv = plain(a) ? a.provenance : null;
    if (input.synthetic !== false && input.synthetic !== undefined) return done('held', ['synthetic-input']);
    if ((plain(a) && a.synthetic !== undefined && a.synthetic !== false) || (plain(p) && p.synthetic !== undefined && p.synthetic !== false) || (plain(pv) && pv.synthetic !== false)) return done('held', ['synthetic-input']);
    // ① 재무
    var finOk = plain(a) && a.version === VERSION && a.signalHold === true && typeof a.label === 'string' && a.ticker === card.ticker && Array.isArray(a.checks) && Array.isArray(a.conflicts) && Number.isInteger(a.years) && a.years >= 0 && day(a.asOf);
    if (!finOk) missing.push('financials-missing');
    else if (a.label === 'weak') return done('blocked', ['financials-weak'], { asOf: a.asOf });
    else if (a.label !== 'strong' || a.reviewEligible !== true) missing.push('financials-not-strong');
    else if (a.years < 3 || a.conflicts.length || age(a.asOf, today) < 0 || age(a.asOf, today) > FIN_MAX_AGE_DAYS) missing.push('financials-stale-or-conflict');
    else if (!a.checks.length || a.checks.some(function (c) { return !plain(c) || !str(c.id, 40) || !str(c.status, 20); })) missing.push('financials-no-evidence');
    if (finOk && (!plain(pv) || pv.ticker !== card.ticker || pv.market !== card.market || pv.synthetic !== false || FIN_OK.indexOf(pv.verification) < 0 || !str(pv.source, 60))) missing.push('financials-unverified');
    // ② 시세
    if (!priceCheck(p, card, today)) missing.push('price-not-verified');
    // ③ 합의
    var cc = consensusCode(input.consensus, card, today);
    if (cc) missing.push(cc);
    if (missing.length) return done('held', missing, finOk ? { asOf: a.asOf } : null);
    return done('released', [], { asOf: a.asOf, priceDate: p.marketDate, label: '매수 검토 · 재무 확인됨(밸류에이션 미확인) · 재무 기준일 ' + a.asOf + ' · 시세 ' + p.marketDate });
  }
  return Object.freeze({ evaluate: evaluate, PRICE_MAX_AGE_DAYS: PRICE_MAX_AGE_DAYS });
});
