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
  var TRUST_KINDS = ['priceVerifiers', 'priceProviders', 'finSources', 'consensusVerifiers'];
  // CR-FIN-P1-R4: trust는 이 모듈이 만든(등록한) 동결 객체만 받는다 — 사용자·외부 JSON(JSON.parse 결과 등 평범한 객체)은 'invalid-trust'.
  // 만드는 함수는 합성 계약 시험 전용 이름(__createTrustForContractTest)이다. 실제 trust 생성자(원문 검증 모듈)는 없고, 앱·발행 경로에 연결하지 않는다.
  var BRANDED = typeof WeakSet === 'function' ? new WeakSet() : null;
  function freezeCopy(x) { if (!plain(x)) return x; var o = {}; Object.keys(x).forEach(function (k) { o[k] = freezeCopy(x[k]); }); return Object.freeze(o); }
  function createTrust(spec) {
    if (spec !== undefined && !plain(spec)) throw new TypeError('trust spec must be an object');
    var t = {};
    TRUST_KINDS.forEach(function (k) { var v = spec && spec[k]; if (v !== undefined && !plain(v)) throw new TypeError('trust.' + k); t[k] = freezeCopy(v || {}); });
    t = Object.freeze(t);
    if (BRANDED) BRANDED.add(t);
    return t;
  }
  var DEFAULT_TRUST = createTrust({});
  function plain(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
  function own(o, k) { return plain(o) && Object.prototype.hasOwnProperty.call(o, k); }
  function day(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function iso(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(s) && day(s.slice(0, 10)); }
  function ms(s) { return Date.parse(s); }   // R4: ISO 문자열 비교 금지 — 실제 순간(밀리초)으로 비교, 같은 순간의 다른 표기(.000Z)는 같게 본다
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
    if (!plain(t) || !BRANDED || !BRANDED.has(t)) return null;
    return t;
  }
  /* 계약 초안 v2(CR-FIN-P1-R1~R2 — 채택은 순태씨 승인 별도, 승인 전 앱·발행 경로 연결 금지)
   * card = {ticker, market, verdict, asOf, sha256(카드 원문 내용 해시)}
   * assessment = F.assess() 결과 그대로 + provenance:{ticker, market, currency, companyId(KR corp_code 8자리 / US CIK 10자리), synthetic:false,
   *              source:{id,version}(trust.finSources), normalizedSha256, filed(=assessment.filed), collectedAt}
   * price = {ticker, market, currency, priceType:'close', adjustment, marketDate, session:'final', verifier:{id,version}(trust.priceVerifiers), verifiedAt, synthetic:false,
   *          evidence:[{provider(trust.priceProviders, group 서로 달라야), ticker, market, currency, priceType, adjustment, marketDate, session, close, collectedAt, synthetic:false}, …2개 이상]}
   * consensus = {status:'agreed', ticker, market, verdict, cardSha256, decidedOn, verifier:{id,version}(trust.consensusVerifiers), verifiedAt,
   *              reviews:[{reviewer:'claude'|'gpt', path:'docs/team/…md', commit(40자리), sha256(64자리), reviewedOn}, …두 검토자 각 1건]}
   * 승인 전 계약 설계 v3 추가 경계(CR-FIN-P1-R4·R5 — 설계 명시만, 실제 검증 모듈·원문 읽기·서명·공급자 연동 없음. 아래가 승인·구현되기 전에는 실제 해제/발행 불가):
   *  · 증권 동일성: market('KR'/'US')은 국가 구분일 뿐이다. 실제 해제 전 card·price·evidence에 거래소(exchange)와 검증된 상품 ID(예: ISIN 또는 공급자 상품 코드↔공식 매핑)를
   *    넣고 생성자가 모두 같은 증권인지 확인해야 한다. 지금 계약엔 그 칸이 없으므로 released는 합성 계약 시험 전용(scope)이다.
   *  · 조정 기준: adjustment는 지금 형식(소문자 식별자)만 본다. 허용 목록(예: 'raw-close' 하나)과 산식은 승인 전이며, 승인 안 된 기준은 실제 해제 불가.
   *  · 공급자별 원본: evidence마다 원본 응답 해시(rawSha256)·검증 결과와 검증기 정책 버전(policyVersion)을 trust 항목과 결속해야 한다(생성자 책임).
   *  · 합의 원문: 두 경로의 내용 해시가 같으면 복제로 보고 거부(이 함수도 거부). 경로·커밋에서 실제 파일을 읽어 해시를 다시 계산하는 일은 생성자 책임.
   *  · 회사 ID: 문자열 형식(KR 8자리·US 10자리)만 이 함수가 본다. 종목↔corp_code/CIK 공식 매핑 대조는 생성자 책임.
   *  · 재무 공시 시각: 최신 결산 filed뿐 아니라 판정에 쓰인 과거·대체(fallback) 결산과 원문별 공시 시각이 카드 기준일 이전인지 생성자가 대조해야 한다(실제 생성자 없음).
   *  · trust: 사용자·외부 JSON으로 받지 않는다 — 이 모듈이 등록한 동결 객체만 인정(위 BRANDED). */
  function priceCode(p, card, today, nowISO, trust) {
    if (!plain(p)) return 'price-missing';
    if (p.synthetic !== false) return 'price-synthetic-or-unmarked';
    if (p.ticker !== card.ticker || p.market !== card.market || p.currency !== CCY[card.market] || p.priceType !== 'close' || !id(p.adjustment) || p.session !== 'final') return 'price-identity-mismatch';
    if (!within(p.marketDate, today, PRICE_MAX_AGE_DAYS) || p.marketDate > card.asOf) return 'price-date-invalid';
    if (!trusted(trust, 'priceVerifiers', p.verifier) || !iso(p.verifiedAt) || ms(p.verifiedAt) > ms(nowISO) || p.verifiedAt.slice(0, 10) < p.marketDate) return 'price-verifier-untrusted';
    if (!Array.isArray(p.evidence) || p.evidence.length < 2) return 'price-single-source';
    var seen = Object.create(null), groups = Object.create(null), n = 0, first = null;
    for (var i = 0; i < p.evidence.length; i++) {
      var e = p.evidence[i];
      if (!plain(e) || e.synthetic !== false) return 'price-evidence-invalid';
      if (!id(e.provider) || !own(trust.priceProviders, e.provider) || !plain(trust.priceProviders[e.provider]) || !id(trust.priceProviders[e.provider].group)) return 'price-provider-untrusted';
      if (seen[e.provider]) return 'price-evidence-duplicate';                // 같은 공급자 복제는 세지 않고 보류
      seen[e.provider] = 1;
      if (e.ticker !== p.ticker || e.market !== p.market || e.currency !== p.currency || e.priceType !== p.priceType || e.adjustment !== p.adjustment || e.marketDate !== p.marketDate || e.session !== 'final') return 'price-evidence-mismatch';
      if (!iso(e.collectedAt) || ms(e.collectedAt) > ms(p.verifiedAt) || e.collectedAt.slice(0, 10) < p.marketDate) return 'price-evidence-invalid';
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
    var got = Object.create(null), paths = Object.create(null), hashes = Object.create(null);
    for (var i = 0; i < c.reviews.length; i++) {
      var r = c.reviews[i];
      if (!plain(r) || REVIEWERS.indexOf(r.reviewer) < 0 || got[r.reviewer]) return 'consensus-unverified';
      if (typeof r.path !== 'string' || !/^docs\/team\/[A-Za-z0-9._-]{1,120}\.md$/.test(r.path) || paths[r.path] || !hex(r.commit, 40) || !hex(r.sha256, 64) || hashes[r.sha256]) return 'consensus-unverified';
      if (!day(r.reviewedOn) || r.reviewedOn < card.asOf || r.reviewedOn > c.decidedOn) return 'consensus-unverified';
      got[r.reviewer] = paths[r.path] = hashes[r.sha256] = 1;   // 두 원문 내용 해시가 같으면 복제(R4)
    }
    if (!trusted(trust, 'consensusVerifiers', c.verifier) || !iso(c.verifiedAt) || ms(c.verifiedAt) > ms(nowISO) || c.verifiedAt.slice(0, 10) < c.decidedOn) return 'consensus-verifier-untrusted';
    return null;
  }
  // 실제 판정 규칙 재계산: 항목 id·상태가 계약 밖이거나 label과 맞지 않으면 null(모순)
  // R5: 현재 버전(has-fundamental-v1)은 8항목을 모두 산출하고 valuation은 반드시 na(가격 연결 전) — 일부만 있거나 valuation이 na가 아니면 모순.
  function recompute(checks, conflicts, years) {
    var ids = Object.create(null), used = 0, fails = 0, warns = 0;
    if (checks.length !== CHECK_IDS.length) return null;
    for (var i = 0; i < checks.length; i++) {
      var c = checks[i];
      if (!plain(c) || CHECK_IDS.indexOf(c.id) < 0 || CHECK_STATUS.indexOf(c.status) < 0 || ids[c.id] || !str(c.evidence, 400)) return null;
      if (c.id === 'valuation' && c.status !== 'na') return null;
      ids[c.id] = 1;
      if (c.status !== 'na') { used++; if (c.status === 'fail') fails++; if (c.status === 'warn') warns++; }
    }
    if (years < 3 || used < 4) return 'insufficient';
    if (fails >= 2) return 'weak';
    if (fails === 0 && warns <= STRONG_MAX_WARN && used >= STRONG_MIN_USED && !conflicts.length) return 'strong';
    return 'mixed';
  }
  function provOk(a, pv, card, today, nowISO, trust) {
    if (!plain(pv) || pv.ticker !== card.ticker || pv.market !== card.market || pv.currency !== CCY[card.market]) return false;
    if (typeof pv.companyId !== 'string' || !(card.market === 'KR' ? /^\d{8}$/ : /^\d{10}$/).test(pv.companyId)) return false;   // R5: 숫자 타입 등 강제 변환 금지
    if (!trusted(trust, 'finSources', pv.source) || !hex(pv.normalizedSha256, 64) || pv.filed !== a.filed) return false;
    return iso(pv.collectedAt) && ms(pv.collectedAt) <= ms(nowISO) && pv.collectedAt.slice(0, 10) >= a.filed;
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
    else if (a.label !== recompute(a.checks, a.conflicts, a.years) || (a.reviewEligible === true) !== (a.label === 'strong')) missing.push('financials-inconsistent');
    else if (a.years < 3 || age(a.asOf, today) > FIN_MAX_AGE_DAYS) missing.push('financials-stale-or-insufficient');   // R5: weak·strong 공통으로 먼저(오래된 weak도 확정 표시 금지)
    else if (a.label === 'weak') { if (verified) return done('blocked', ['financials-weak'], { asOf: a.asOf }); missing.push('financials-weak-unverified'); }
    else if (a.label !== 'strong') missing.push('financials-not-strong');
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
  return Object.freeze({ evaluate: evaluate, PRICE_MAX_AGE_DAYS: PRICE_MAX_AGE_DAYS, DEFAULT_TRUST: DEFAULT_TRUST, CHECK_IDS: CHECK_IDS.slice(), __createTrustForContractTest: createTrust });
});
