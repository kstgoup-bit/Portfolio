/* 매수 후보 카드 '판단 보류(재무·시세 검증 전)' 해제 규칙 — 순수 함수(네트워크·저장소·주문 없음). 제안안, 순태씨 승인 전 앱에 연결하지 않는다.
 * 해제(released)는 아래를 모두 만족할 때만: ① 재무 판정이 이 종목의 'strong'(실제 판정 규칙과 일치·공시일 결속·신뢰 출처) ② 시세가 승인된 검증기·독립 출처 2곳 이상·같은 값
 * ③ 합의가 두 검토자 원문(경로·커밋·내용 해시)과 카드 해시에 결속되고 승인된 합의 검증기가 확인. 하나라도 빠지거나 형식이 이상하면 held(보류).
 * 재무 weak는 신뢰된 같은 회사 자료로 확인됐을 때만 blocked, 아니면 held.
 * 신뢰 경계(CR-FIN-P1-R1/R2, 2026-11-28): 이 함수는 원문을 열어 보지 못한다. 그래서 세 번째 인자 trust(승인된 검증기·출처 목록)가 없으면 무엇도 해제하지 않는다.
 * trust 기본값은 비어 있고(DEFAULT_TRUST), 실제 trust를 만드는 검증 모듈은 아직 없다 — 지금 'released'는 합성 계약 시험 안에서만 나오는 내부 상태다.
 * 해제돼도 밸류에이션은 연결 전이라 라벨은 '재무 확인됨(밸류에이션 미확인)'까지만, 금액·주문 안내는 만들지 않는다. 투자 자문 아님. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASReviewFinGate = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var BUY = ['buy-review', 'add-review'], PRICE_MAX_AGE_DAYS = 7, FIN_MAX_AGE_DAYS = 550, VERSION = 'has-fundamental-v1';
  var NOTICE = '검토 의견이며 투자 자문이 아닙니다. 해제는 재무·시세·합의 확인 표시일 뿐 매수 지시가 아닙니다. 밸류에이션·금액은 별도입니다.';
  var CCY = { KR: 'KRW', US: 'USD' }, REVIEWERS = ['claude', 'gpt'];
  // fundamental-filter.js assess()의 항목·상태·strong 규칙(판정 가능 ≥5, 취약 0, 주의 ≤1, 최근 충돌 없음)을 그대로 대조한다. 임계값 변경 금지 — 바꾸려면 두 파일을 함께.
  var CHECK_IDS = ['roe', 'margin', 'leverage', 'interest', 'fcf', 'quality', 'stability', 'valuation'], CHECK_STATUS = ['pass', 'warn', 'fail', 'na'];
  var STRONG_MIN_USED = 5, STRONG_MAX_WARN = 1;
  var DEFAULT_TRUST = Object.freeze({ priceVerifiers: Object.freeze({}), priceProviders: Object.freeze({}), finSources: Object.freeze({}), consensusVerifiers: Object.freeze({}) });
  function plain(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
  function own(o, k) { return plain(o) && Object.prototype.hasOwnProperty.call(o, k); }
  function day(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function iso(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(s) && day(s.slice(0, 10)); }
  function age(from, today) { return (Date.parse(today + 'T00:00:00Z') - Date.parse(from + 'T00:00:00Z')) / 86400000; }
  function within(d, today, max) { return day(d) && age(d, today) >= 0 && age(d, today) <= max; }
  function id(x) { return typeof x === 'string' && /^[a-z0-9][a-z0-9-]{1,39}$/.test(x); }        // 정규화된 식별자만(공백·대문자 변형은 형식 불량)
  function hex(x, n) { return typeof x === 'string' && new RegExp('^[0-9a-f]{' + n + '}$').test(x); }
  function str(x, n) { return typeof x === 'string' && x.trim().length > 0 && x.length <= (n || 200); }
  // 승인 목록 조회: trust[kind][id]가 있고 version이 정확히 같아야 한다.
  function trusted(trust, kind, ref) { return plain(ref) && id(ref.id) && str(ref.version, 40) && own(trust[kind], ref.id) && plain(trust[kind][ref.id]) && trust[kind][ref.id].version === ref.version; }
  function done(state, missing, extra) {
    var o = { state: state, missing: missing, label: null, valuationLinked: false, notice: NOTICE };
    if (extra) Object.keys(extra).forEach(function (k) { o[k] = extra[k]; });
    return o;
  }
  function normTrust(t) {
    if (t === undefined) return DEFAULT_TRUST;
    if (!plain(t)) return null;
    for (var k in DEFAULT_TRUST) if (t[k] !== undefined && !plain(t[k])) return null;
    return { priceVerifiers: t.priceVerifiers || {}, priceProviders: t.priceProviders || {}, finSources: t.finSources || {}, consensusVerifiers: t.consensusVerifiers || {} };
  }
  /* 계약 초안 v2(CR-FIN-P1-R1~R2 — 채택은 순태씨 승인 별도, 승인 전 앱·발행 경로 연결 금지)
   * card = {ticker, market, verdict, asOf, sha256(카드 원문 내용 해시)}
   * assessment = F.assess() 결과 그대로 + provenance:{ticker, market, currency, companyId(KR corp_code 8자리 / US CIK 10자리), synthetic:false,
   *              source:{id,version}(trust.finSources), normalizedSha256, filed(=assessment.filed), collectedAt}
   * price = {ticker, market, currency, priceType:'close', adjustment, marketDate, session:'final', verifier:{id,version}(trust.priceVerifiers), verifiedAt, synthetic:false,
   *          evidence:[{provider(trust.priceProviders, group 서로 달라야), ticker, market, currency, priceType, adjustment, marketDate, session, close, collectedAt, synthetic:false}, …2개 이상]}
   * consensus = {status:'agreed', ticker, market, verdict, cardSha256, decidedOn, verifier:{id,version}(trust.consensusVerifiers), verifiedAt,
   *              reviews:[{reviewer:'claude'|'gpt', path:'docs/team/…md', commit(40자리), sha256(64자리), reviewedOn}, …두 검토자 각 1건]} */
  function priceCode(p, card, today, nowISO, trust) {
    if (!plain(p)) return 'price-missing';
    if (p.synthetic !== false) return 'price-synthetic-or-unmarked';
    if (p.ticker !== card.ticker || p.market !== card.market || p.currency !== CCY[card.market] || p.priceType !== 'close' || !id(p.adjustment) || p.session !== 'final') return 'price-identity-mismatch';
    if (!within(p.marketDate, today, PRICE_MAX_AGE_DAYS) || p.marketDate > card.asOf) return 'price-date-invalid';
    if (!trusted(trust, 'priceVerifiers', p.verifier) || !iso(p.verifiedAt) || p.verifiedAt > nowISO || p.verifiedAt.slice(0, 10) < p.marketDate) return 'price-verifier-untrusted';
    if (!Array.isArray(p.evidence) || p.evidence.length < 2) return 'price-single-source';
    var seen = Object.create(null), groups = Object.create(null), n = 0, first = null;
    for (var i = 0; i < p.evidence.length; i++) {
      var e = p.evidence[i];
      if (!plain(e) || e.synthetic !== false) return 'price-evidence-invalid';
      if (!id(e.provider) || !own(trust.priceProviders, e.provider) || !plain(trust.priceProviders[e.provider]) || !id(trust.priceProviders[e.provider].group)) return 'price-provider-untrusted';
      if (seen[e.provider]) return 'price-evidence-duplicate';                // 같은 공급자 복제는 세지 않고 보류
      seen[e.provider] = 1;
      if (e.ticker !== p.ticker || e.market !== p.market || e.currency !== p.currency || e.priceType !== p.priceType || e.adjustment !== p.adjustment || e.marketDate !== p.marketDate || e.session !== 'final') return 'price-evidence-mismatch';
      if (!iso(e.collectedAt) || e.collectedAt > p.verifiedAt || e.collectedAt.slice(0, 10) < p.marketDate) return 'price-evidence-invalid';
      if (typeof e.close !== 'number' || !Number.isFinite(e.close) || e.close <= 0) return 'price-evidence-invalid';
      if (first === null) first = e.close;
      else if (e.close !== first) return 'price-conflict-tolerance-undefined';   // 허용오차·산식 미승인 → 값이 다르면 보류(임의 임계값 없음)
      var g = trust.priceProviders[e.provider].group;
      if (!groups[g]) { groups[g] = 1; n++; }
    }
    return n >= 2 ? null : 'price-not-independent';
  }
  function consensusCode(c, card, today, nowISO, trust) {
    if (typeof c === 'string') return 'consensus-unstructured';
    if (!plain(c)) return 'consensus-unknown';
    if (c.status !== 'agreed') return 'consensus-' + (typeof c.status === 'string' && /^[a-z-]{1,20}$/.test(c.status) ? c.status : 'unknown');
    if (c.ticker !== card.ticker || c.market !== card.market || c.verdict !== card.verdict || c.cardSha256 !== card.sha256) return 'consensus-mismatch';
    if (!within(c.decidedOn, today, PRICE_MAX_AGE_DAYS) || c.decidedOn < card.asOf) return 'consensus-expired';
    if (!Array.isArray(c.reviews) || c.reviews.length !== REVIEWERS.length) return 'consensus-unverified';
    var got = Object.create(null), paths = Object.create(null);
    for (var i = 0; i < c.reviews.length; i++) {
      var r = c.reviews[i];
      if (!plain(r) || REVIEWERS.indexOf(r.reviewer) < 0 || got[r.reviewer]) return 'consensus-unverified';
      if (typeof r.path !== 'string' || !/^docs\/team\/[A-Za-z0-9._-]{1,120}\.md$/.test(r.path) || paths[r.path] || !hex(r.commit, 40) || !hex(r.sha256, 64)) return 'consensus-unverified';
      if (!day(r.reviewedOn) || r.reviewedOn < card.asOf || r.reviewedOn > c.decidedOn) return 'consensus-unverified';
      got[r.reviewer] = paths[r.path] = 1;
    }
    if (!trusted(trust, 'consensusVerifiers', c.verifier) || !iso(c.verifiedAt) || c.verifiedAt > nowISO || c.verifiedAt.slice(0, 10) < c.decidedOn) return 'consensus-verifier-untrusted';
    return null;
  }
  // 실제 판정 규칙 재계산: 항목 id·상태가 계약 밖이거나 label과 맞지 않으면 null(모순)
  function recompute(checks, conflicts) {
    var ids = Object.create(null), used = 0, fails = 0, warns = 0;
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i];
      if (!plain(c) || CHECK_IDS.indexOf(c.id) < 0 || CHECK_STATUS.indexOf(c.status) < 0 || ids[c.id] || !str(c.evidence, 400)) return null;
      ids[c.id] = 1;
      if (c.status !== 'na') { used++; if (c.status === 'fail') fails++; if (c.status === 'warn') warns++; }
    }
    if (used < 4) return 'insufficient';
    if (fails >= 2) return 'weak';
    if (fails === 0 && warns <= STRONG_MAX_WARN && used >= STRONG_MIN_USED && !conflicts.length) return 'strong';
    return 'mixed';
  }
  function provOk(a, pv, card, today, nowISO, trust) {
    if (!plain(pv) || pv.ticker !== card.ticker || pv.market !== card.market || pv.currency !== CCY[card.market]) return false;
    if (!(card.market === 'KR' ? /^\d{8}$/.test(pv.companyId || '') : /^\d{10}$/.test(pv.companyId || ''))) return false;
    if (!trusted(trust, 'finSources', pv.source) || !hex(pv.normalizedSha256, 64) || pv.filed !== a.filed) return false;
    return iso(pv.collectedAt) && pv.collectedAt <= nowISO && pv.collectedAt.slice(0, 10) >= a.filed;
  }
  function evaluate(input, nowISO, trustIn) {
    if (!iso(nowISO)) return done('held', ['invalid-now']);
    var today = nowISO.slice(0, 10), trust = normTrust(trustIn);
    if (!trust) return done('held', ['invalid-trust']);
    if (!plain(input) || !plain(input.card) || !str(input.card.ticker, 12) || (input.card.market !== 'KR' && input.card.market !== 'US')) return done('held', ['invalid-input']);
    if (BUY.indexOf(input.card.verdict) < 0) return done('held', ['not-buy-side']);      // 해제 규칙은 매수 쪽 카드에만 해당
    var card = input.card, missing = [], a = input.assessment, p = input.price;
    if (!within(card.asOf, today, PRICE_MAX_AGE_DAYS) || !hex(card.sha256, 64)) return done('held', ['card-date-invalid']);
    var pv = plain(a) ? a.provenance : null;
    if (input.synthetic !== false && input.synthetic !== undefined) return done('held', ['synthetic-input']);
    if ((plain(a) && a.synthetic !== undefined && a.synthetic !== false) || (plain(pv) && pv.synthetic !== false)) return done('held', ['synthetic-input']);
    // ① 재무
    var finOk = plain(a) && a.version === VERSION && a.signalHold === true && typeof a.label === 'string' && a.ticker === card.ticker && Array.isArray(a.checks) && Array.isArray(a.conflicts) && Number.isInteger(a.years) && a.years >= 0 && day(a.asOf);
    var verified = finOk && provOk(a, pv, card, today, nowISO, trust);
    if (!finOk) missing.push('financials-missing');
    else if (!day(a.filed) || a.filed < a.asOf || a.filed > card.asOf || a.filed > today || a.asOf > card.asOf) missing.push('financials-lookahead-or-unfiled');  // 미래·카드 이후·결산 전 공시
    else if (a.label !== recompute(a.checks, a.conflicts) || (a.reviewEligible === true) !== (a.label === 'strong')) missing.push('financials-inconsistent');
    else if (a.label === 'weak') { if (verified) return done('blocked', ['financials-weak'], { asOf: a.asOf }); missing.push('financials-weak-unverified'); }
    else if (a.label !== 'strong') missing.push('financials-not-strong');
    else if (a.years < 3 || age(a.asOf, today) > FIN_MAX_AGE_DAYS) missing.push('financials-stale-or-conflict');
    if (finOk && !verified) missing.push('financials-unverified');
    // ② 시세
    var pc = priceCode(p, card, today, nowISO, trust);
    if (pc) missing.push(pc);
    // ③ 합의
    var cc = consensusCode(input.consensus, card, today, nowISO, trust);
    if (cc) missing.push(cc);
    if (missing.length) return done('held', missing, finOk ? { asOf: a.asOf } : null);
    return done('released', [], { asOf: a.asOf, priceDate: p.marketDate, scope: 'contract-test-only', label: '매수 검토 · 재무 확인됨(밸류에이션 미확인) · 재무 기준일 ' + a.asOf + ' · 시세 ' + p.marketDate });
  }
  return Object.freeze({ evaluate: evaluate, PRICE_MAX_AGE_DAYS: PRICE_MAX_AGE_DAYS, DEFAULT_TRUST: DEFAULT_TRUST, CHECK_IDS: CHECK_IDS.slice() });
});
