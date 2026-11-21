/* HAS 곡소리 매수 검토 게이트 1단계 (지시서 GPT-20261121-0911) — 순수 판정, 읽기 전용, 비실거래.
   계약 buyReviewInput.v2(지피 1031 CR-1~4 반영): 호출자가 준 가격 증거·5게이트 증거·본질가치 시나리오·4단계 조사·실행 맥락만 판정한다.
   - 네트워크·저장소·투자기록·백업을 읽거나 쓰지 않는다. 입력 객체를 바꾸지 않는다.
   - 가격 하락률은 안전마진이 아니다. 안전마진은 '검증된 보수적 본질가치' 대비로만 계산한다.
   - 하나라도 UNKNOWN/FAIL·불일치·지연·누락이면 '매수 검토'를 만들지 않는다(fail-closed).
   - 안전마진 구간(10/20/30/40%)은 검증되지 않은 초기 정책 가정이며 확정 투자규칙이 아니다.
   - 투자 판단과 실행 가능성을 분리한다. 매수 수량·주문·자동매매를 만들지 않는다. 최종 결정은 순태씨.
   v2.2(지피 1228 CR-8~10): 경계 판정은 미반올림 원시값, 후보·알림은 엔진 발급 결과만(실제 자료 0건), 확신종목 25%는 합성 예제 한정. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASBuyReviewGate = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var CONTRACT = 'buyReviewInput.v2', DAY = 86400000;
  var STATES = Object.freeze({ OBSERVE: '관찰', HOLD: '판단 보류', RISK: '위험 경고', CONDITIONAL: '조건부 분할매수 검토', HIGH: '높은 확신의 분할매수 검토' });
  var RANK = { '관찰': 1, '판단 보류': 0, '위험 경고': 0, '조건부 분할매수 검토': 2, '높은 확신의 분할매수 검토': 3 };
  var GATES = Object.freeze([
    ['A', '경쟁력 유지'], ['B', '유동성·차입 위험 수용 가능'], ['C', '정상화 잉여현금흐름 지속성'],
    ['D', '보수적 본질가치 대비 안전마진'], ['E', '회계·구조적 악화·악재의 일시성 및 반론 검증']
  ]);
  // 초기 정책 가정(미검증). 업종·불확실성별 조정과 백테스트 전에는 확정 규칙이 아니다.
  var MOS_BANDS = Object.freeze({ OBSERVE: 10, CONDITIONAL: 20, PRIORITY: 30, TRAP: 40, status: 'unverified-initial-policy' });
  var PRICE_BANDS = Object.freeze([35, 30, 20]);
  var LIMIT_CONVICTION = 25, LIMIT_OTHER = 10, SHORTLIST = 5;
  var MAX_AGE = { price: 4, evidence: 120, valuation: 90, research: 30, cash: 1, fx: 2 };
  // CR-1~4(지피 1031) 보강: 자기선언 문자열로 통과하지 않도록 구조화된 증빙 계약을 검사한다(외부 호출 없음).
  var CROSS_TOL_PCT = 1, VALUE_TOL_PCT = 5;
  // 가치 가정 경제적 범위(공학적 안전 범위, 미검증 정책): 할인율 4~20%, 장기성장률 -10~6%·할인율보다 1%p 이상 낮음, 희석 0~20%.
  var VAL_RANGE = Object.freeze({ discountMin: 4, discountMax: 20, growthMin: -10, growthMax: 6, spreadMin: 1, dilutionMin: 0, dilutionMax: 20, status: 'unverified-sanity-range' });
  var VAL_METHODS = Object.freeze(['fcf-perpetuity']);
  var LINEAGE = Object.freeze(['normalizedFcf', 'stockCompensation', 'netDebt', 'shares']);
  // 공시 원문 출처(도메인 이름만 비교, 접속하지 않음). 합성 자료는 synthetic:true 일 때만 example.invalid 허용.
  var FILING_HOSTS = Object.freeze({ US: ['sec.gov', 'www.sec.gov'], KR: ['dart.fss.or.kr', 'kind.krx.co.kr'] });
  var DOC_ID = Object.freeze({ US: /^\d{10}-\d{2}-\d{6}$/, KR: /^\d{14}$/ });
  var EVIDENCE_KINDS = Object.freeze(['filing', 'news', 'consensus', 'community', 'analysis']);
  var SELF_VERIFIERS = Object.freeze(['', 'self', 'ai-self', 'claude', 'claude-self', 'gpt', 'gpt-self', 'caller']);
  var SYN_HOST = 'example.invalid';
  var CCY = { KR: 'KRW', US: 'USD' };
  /* CR-6(지피 1128) 신뢰 계약: 생성자·검증자·시세 공급자는 등록된 식별자만 인정하고, 같은 원천(root)의 별칭은 독립으로 보지 않는다.
     실제 자료(real) 등록부는 비어 있다 — 신뢰된 G0/SEC/DART 수집·검증 단계와 순태씨 별도 승인 전에는 실제 자료로 매수 검토 상태를 만들 수 없다(잠금). */
  var TRUST = Object.freeze({
    synthetic: Object.freeze({ producers: Object.freeze({ 'synthetic-collector': 'syn-collect' }), verifiers: Object.freeze({ 'synthetic-verifier': 'syn-verify' }), providers: Object.freeze({ 'synthetic-1': 'syn-feed-1', 'synthetic-2': 'syn-feed-2' }) }),
    real: Object.freeze({ producers: Object.freeze({}), verifiers: Object.freeze({}), providers: Object.freeze({}) }),
    status: 'real-data-locked'
  });
  var REAL_DATA_LOCK = true;
  function trust(ctx) { return ctx && ctx.synthetic === true ? TRUST.synthetic : TRUST.real; }
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k) ? o[k] : null; }
  var CONVICTION_MAX_AGE = 30;
  var CONVICTION_TRUST = 'no-trusted-path'; // 순태씨 확신종목 목록의 신뢰 발급·보관·검증 경로 없음(CR-10): 실제 자료는 25% 불가
  var RESEARCH = Object.freeze([['filings', '최신 공시'], ['news', '뉴스'], ['consensus', '컨센서스'], ['community', '커뮤니티']]);

  function finite(x) { return typeof x === 'number' && Number.isFinite(x); }
  function text(x) { return typeof x === 'string' && x.trim().length > 0; }
  function isoDay(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}/.test(x) && Number.isFinite(Date.parse(x)); }
  function round(x, n) { if (!finite(x)) return null; var p = Math.pow(10, n == null ? 1 : n); return Math.round(x * p) / p; }
  function clone(x) { try { return JSON.parse(JSON.stringify(x)); } catch (e) { return null; } }
  function age(asOf, now) { return (now - Date.parse(asOf)) / DAY; }
  function fresh(asOf, now, maxDays) { return isoDay(asOf) && Date.parse(asOf) <= now + 60000 && age(asOf, now) <= maxDays; }
  function isoTime(x) { return typeof x === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(x) && /(Z|[+-]\d{2}:\d{2})$/.test(x) && Number.isFinite(Date.parse(x)); }
  function norm(x) { return text(x) ? x.trim().toLowerCase() : ''; }
  function host(u) { var m = typeof u === 'string' && /^https:\/\/([a-z0-9.-]+)(?::\d+)?(\/|$)/i.exec(u.trim()); return m ? m[1].toLowerCase() : ''; }
  function relDiff(a, b) { return Math.abs(a - b) / Math.max(Math.abs(a), Math.abs(b)) * 100; }

  /* 증빙 계약 evidence.v2: 대상 종목·시장, 공표일·확인일, https 원문 주소, 원문 해시, 생성자와 다른 독립 검증자.
     엔진은 원문을 직접 가져오지 않는다 — 해시·검증자 기록은 G0/SEC/DART 수집 단계가 만든 것이어야 하며, 그 단계가 없으면 실제 자료는 통과하지 못한다. */
  function evidenceCheck(e, ctx, opt) {
    var why = [];
    opt = opt || {};
    if (!e || typeof e !== 'object') return ['증빙 없음'];
    if (!text(e.text)) why.push('내용 없음');
    if (!EVIDENCE_KINDS.includes(e.kind)) why.push('증빙 종류 미지정');
    if (opt.kind && e.kind !== opt.kind) why.push(opt.kind + ' 종류가 아님');
    if (e.market !== ctx.market || norm(e.ticker) !== norm(ctx.ticker)) why.push('대상 종목 불일치(' + (e.market || '?') + ':' + (e.ticker || '?') + ')');
    if (!isoDay(e.publishedAt) || !isoTime(e.retrievedAt) || Date.parse(e.publishedAt) > Date.parse(e.retrievedAt) || Date.parse(e.retrievedAt) > ctx.now + 60000) why.push('공표일·확인시각 없음 또는 순서 오류');
    else if (!fresh(e.publishedAt, ctx.now, opt.maxDays || MAX_AGE.evidence)) why.push('오래된 증빙(허용 ' + (opt.maxDays || MAX_AGE.evidence) + '일)');
    if (e.asOf != null && e.asOf !== e.publishedAt) why.push('기준일(asOf)과 공표일 불일치');
    var h = host(e.url);
    if (!h) why.push('https 원문 주소 없음');
    else if (h === SYN_HOST || /\.invalid$/.test(h)) { if (ctx.synthetic !== true) why.push('합성 출처는 실제 판단에 사용 불가'); }
    else if (e.kind === 'filing' && !(FILING_HOSTS[ctx.market] || []).includes(h)) why.push('공시 공식 출처 아님(' + h + ')');
    if (e.kind === 'filing' && !(DOC_ID[ctx.market] && DOC_ID[ctx.market].test(String(e.docId || '')))) why.push('공시 문서번호 형식 오류');
    var v = e.verification, T = trust(ctx), pRoot = own(T.producers, norm(e.producedBy));
    if (!text(e.producedBy)) why.push('생성자(producedBy) 미기재: 증빙 미검증');
    else if (!pRoot) why.push('생성자 신뢰 등록 없음(' + norm(e.producedBy) + (ctx.synthetic === true ? '' : ', 실제 자료 잠금') + ')');
    if (!v || typeof v !== 'object' || v.status !== 'verified') why.push('독립 검증 기록 없음(자기선언 문자열 불인정)');
    else {
      var vRoot = own(T.verifiers, norm(v.verifier));
      if (SELF_VERIFIERS.includes(norm(v.verifier)) || norm(v.verifier) === norm(e.producedBy)) why.push('검증자가 생성자 자신');
      else if (!vRoot) why.push('검증자 신뢰 등록 없음(' + (norm(v.verifier) || '?') + (ctx.synthetic === true ? '' : ', 실제 자료 잠금') + ')');
      else if (pRoot && vRoot === pRoot) why.push('검증자와 생성자가 같은 원천의 별칭(독립 아님)');
      if (!/^[0-9a-f]{64}$/.test(String(v.contentSha256 || ''))) why.push('원문 해시 없음');
      if (!isoTime(v.checkedAt) || !isoTime(e.retrievedAt) || Date.parse(v.checkedAt) < Date.parse(e.retrievedAt) || Date.parse(v.checkedAt) > ctx.now + 60000) why.push('검증 시각 오류');
    }
    return why;
  }
  function evidenceListCheck(list, ctx, opt) {
    if (!Array.isArray(list) || !list.length) return ['증빙 목록 없음'];
    var why = [];
    list.forEach(function (e, i) { evidenceCheck(e, ctx, opt).forEach(function (w) { why.push('#' + (i + 1) + ' ' + w); }); });
    if (opt && opt.needFiling && !list.some(function (e) { return e && e.kind === 'filing'; })) why.push('공시 원문 증빙 최소 1건 필요');
    return why;
  }

  /* 1. 가격 선별: 검증된 정규장 종가·52주 고점·동일 기간 벤치마크. 하나라도 어긋나면 fail-closed. */
  function screenPrice(p, market, now, synthetic) {
    var reasons = [], out = { status: 'fail-closed', band: null, drawdownPct: null, relativePp: null, reasons: reasons, provenance: null };
    if (!p || typeof p !== 'object') { reasons.push('가격 증거 없음'); return out; }
    out.provenance = { source: p.source || null, exchange: p.exchange || null, currency: p.currency || null, priceType: p.priceType || null, asOf: p.asOf || null, adjustment: p.adjustment || null };
    if (!text(p.source)) reasons.push('출처 없음');
    if (!text(p.exchange)) reasons.push('거래소 없음');
    if (p.currency !== CCY[market]) reasons.push('통화 불일치 또는 없음(' + (p.currency || '없음') + ')');
    if (p.priceType !== 'regular-close') reasons.push('정규장 확정 종가가 아님(' + (p.priceType || '종류 없음') + ')');
    if (!['split-adjusted', 'split-dividend-adjusted'].includes(p.adjustment)) reasons.push('조정 여부 미확인');
    if (!fresh(p.asOf, now, MAX_AGE.price)) reasons.push('기준시각 없음·미래·지연(허용 ' + MAX_AGE.price + '일)');
    if (!finite(p.close) || p.close <= 0) reasons.push('종가 값 오류');
    if (!finite(p.high52w) || p.high52w <= 0 || finite(p.close) && p.high52w < p.close) reasons.push('52주 고점 값 오류');
    if (p.high52wAsOf !== p.asOf) reasons.push('종가와 52주 고점 기준일 불일치');
    if (p.sessionStatus !== 'closed' || !isoTime(p.closeConfirmedAt) || String(p.closeConfirmedAt).slice(0, 10) < String(p.asOf).slice(0, 10) || Date.parse(p.closeConfirmedAt) > now + 60000) reasons.push('종가 확정 증거 없음(장 마감·확정 시각)');
    if (!text(p.adjustmentAsOf) || p.high52wAdjustment !== p.adjustment || p.high52wAdjustmentAsOf !== p.adjustmentAsOf) reasons.push('종가·52주 고점 조정 기준 불일치 또는 미기재(분할 전후 혼용 위험)');
    if (p.pendingCorporateAction === true) reasons.push('미반영 기업행사(분할 등) 표시');
    crossReasons(p, now, synthetic === true).forEach(function (r) { reasons.push(r); });
    var b = p.benchmark;
    if (!b || !text(b.id) || !finite(b.returnPct) || !finite(b.stockReturnPct) || !b.period || !isoDay(b.period.start) || !isoDay(b.period.end) || b.period.end !== String(p.asOf).slice(0, 10)) reasons.push('동일 기간 벤치마크 상대수익률 없음');
    if (reasons.length) return out;
    out.drawdownPct = round((1 - p.close / p.high52w) * 100, 2);
    out.relativePp = round(b.stockReturnPct - b.returnPct, 2);
    out.band = PRICE_BANDS.find(function (x) { return out.drawdownPct >= x; }) || null;
    out.status = out.band ? 'fear' : 'not-fear';
    if (!out.band) reasons.push('52주 고점 대비 -20% 미만: 곡소리 가격 구간 아님');
    return out;
  }

  /* 1-1. 교차검증: 호출자의 status/diffPct는 무시하고, 독립 공급자 2곳 이상의 원시 시세를 엔진이 직접 대조한다. */
  function crossReasons(p, now, synthetic) {
    var cc = p.crossCheck, why = [], T = synthetic ? TRUST.synthetic : TRUST.real;
    var qs = cc && Array.isArray(cc.quotes) ? cc.quotes : null;
    if (!qs || qs.length < 2) return ['교차검증 원시 시세 2건 이상 없음(G0 미완료)'];
    var ids = qs.map(function (q) { return norm(q && q.provider); });
    if (ids.some(function (x) { return !x; })) why.push('교차검증 공급자 식별 누락');
    if (new Set(ids).size !== ids.length) why.push('교차검증 공급자 중복(독립 출처 아님)');
    if (!ids.includes(norm(p.source))) why.push('대표 종가 출처가 교차검증 공급자에 없음');
    var roots = ids.map(function (x) { return own(T.providers, x); });
    if (roots.some(function (x) { return !x; })) why.push('교차검증 공급자 신뢰 등록 없음' + (synthetic ? '' : '(실제 자료 잠금)'));
    else if (new Set(roots).size !== roots.length) why.push('교차검증 공급자가 같은 원천의 별칭(독립 아님)');
    qs.forEach(function (q, i) {
      var n = '공급자#' + (i + 1);
      if (!q || typeof q !== 'object') { why.push(n + ' 자료 없음'); return; }
      if (q.exchange !== p.exchange) why.push(n + ' 거래소 다름');
      if (q.currency !== p.currency) why.push(n + ' 통화 다름');
      if (q.priceType !== 'regular-close' || q.sessionStatus !== 'closed') why.push(n + ' 확정 종가 아님');
      if (q.asOf !== p.asOf) why.push(n + ' 기준일 다름');
      if (q.adjustment !== p.adjustment || q.adjustmentAsOf !== p.adjustmentAsOf) why.push(n + ' 조정 기준 다름');
      if (!isoTime(q.retrievedAt) || Date.parse(q.retrievedAt) > now + 60000) why.push(n + ' 수집 시각 없음');
      if (!finite(q.close) || q.close <= 0 || !finite(q.high52w) || q.high52w <= 0) why.push(n + ' 값 오류');
      else if (finite(p.close) && finite(p.high52w)) {
        if (relDiff(q.close, p.close) > CROSS_TOL_PCT) why.push(n + ' 종가 차이 ' + round(relDiff(q.close, p.close), 2) + '% > ' + CROSS_TOL_PCT + '%');
        if (relDiff(q.high52w, p.high52w) > CROSS_TOL_PCT) why.push(n + ' 52주 고점 차이 ' + round(relDiff(q.high52w, p.high52w), 2) + '% > ' + CROSS_TOL_PCT + '%(분할 전후 혼용 의심)');
      }
    });
    return why;
  }

  /* 2. 증거 검사: PASS는 검증된 증거가 있을 때만 PASS로 인정. */
  function evidenceOK(list, ctx) { return evidenceListCheck(list, ctx, { needFiling: true }).length === 0; }
  function gate(id, label, g, ctx) {
    var r = { id: id, label: label, status: 'UNKNOWN', claimed: g && g.status || null, reason: '', evidence: g && Array.isArray(g.evidence) ? clone(g.evidence) : [] };
    if (!g || !['PASS', 'FAIL', 'UNKNOWN'].includes(g.status)) { r.reason = '판정·증거 없음'; return r; }
    if (g.status === 'UNKNOWN') { r.reason = g.reason || '근거 미확인'; return r; }
    var why = evidenceListCheck(g.evidence, ctx, { needFiling: true });
    if (why.length) { r.reason = '증빙 계약 미충족: ' + why.slice(0, 4).join(' / ') + (why.length > 4 ? ' 외 ' + (why.length - 4) + '건' : ''); return r; }
    r.status = g.status; r.reason = g.reason || '';
    return r;
  }

  /* 3. 본질가치: 보수/기준/낙관 시나리오와 가정 공개가 모두 있어야 계산. */
  var SC_FIELDS = ['valuePerShare', 'discountRatePct', 'growthPct', 'normalizedFcf', 'stockCompensation', 'dilutionPct', 'netDebt', 'shares'];
  /* 엔진 재계산(fcf-perpetuity): ((정상화FCF − 주식보상) × (1+g) / (r − g) − 순부채) × 금액단위 ÷ (주식수 × 주식단위 × (1+희석)). */
  function impliedValuePerShare(x, units) {
    var r = x.discountRatePct / 100, g = x.growthPct / 100;
    var equity = (x.normalizedFcf - x.stockCompensation) * (1 + g) / (r - g) - x.netDebt;
    return equity * units.moneyScale / (x.shares * units.shareScale * (1 + x.dilutionPct / 100));
  }
  function scenarioReasons(n, x, units) {
    var why = [];
    if (!x || SC_FIELDS.some(function (f) { return !finite(x[f]); }) || !text(x.method)) return [n + ' 가정 누락'];
    if (!VAL_METHODS.includes(x.method)) why.push(n + ' 엔진 재계산 불가 방법(' + x.method + ')');
    if (x.discountRatePct < VAL_RANGE.discountMin || x.discountRatePct > VAL_RANGE.discountMax) why.push(n + ' 할인율 범위 밖(' + x.discountRatePct + '%)');
    if (x.growthPct < VAL_RANGE.growthMin || x.growthPct > VAL_RANGE.growthMax) why.push(n + ' 장기성장률 범위 밖(' + x.growthPct + '%)');
    if (x.discountRatePct - x.growthPct < VAL_RANGE.spreadMin) why.push(n + ' 할인율−성장률 간격 부족');
    if (x.dilutionPct < VAL_RANGE.dilutionMin || x.dilutionPct > VAL_RANGE.dilutionMax) why.push(n + ' 희석률 범위 밖(' + x.dilutionPct + '%)');
    if (x.stockCompensation < 0) why.push(n + ' 주식보상 음수');
    if (x.shares <= 0) why.push(n + ' 주식수 0 이하');
    if (x.normalizedFcf - x.stockCompensation <= 0) why.push(n + ' 주식보상 차감 FCF 0 이하(이 방법으로 가치 산정 불가)');
    if (x.valuePerShare <= 0) why.push(n + ' 주당가치 0 이하');
    if (!why.length && units) {
      var iv = impliedValuePerShare(x, units);
      if (!finite(iv) || iv <= 0 || relDiff(iv, x.valuePerShare) > VALUE_TOL_PCT) why.push(n + ' 주당가치가 공개 가정 재계산과 다름(재계산 ' + round(iv, 2) + ', 입력 ' + x.valuePerShare + ')');
    }
    return why;
  }
  // CR-8: 원시값 비교. FLOAT_EPS(1e-9 %p)는 부동소수 오차(예: 1-64/80 = 0.19999999999999996)만 흡수하며 표시 반올림(0.05%p)보다 수천만 배 작다.
  var FLOAT_EPS = 1e-9;
  function atLeast(m, b) { return finite(m) && m >= b - FLOAT_EPS; }
  function bandOf(m) { return atLeast(m, MOS_BANDS.TRAP) ? 'value-trap-check' : atLeast(m, MOS_BANDS.PRIORITY) ? 'priority' : atLeast(m, MOS_BANDS.CONDITIONAL) ? 'conditional' : atLeast(m, MOS_BANDS.OBSERVE) ? 'observe' : 'none'; }
  function valuation(v, price, currency, now, flags, ctx) {
    var out = { status: 'not-computed', conservative: null, base: null, optimistic: null, marginPct: null, band: null, currency: currency, reasons: [], assumptions: null, policy: MOS_BANDS.status, range: VAL_RANGE.status };
    if (!v || typeof v !== 'object') { out.reasons.push('검증된 본질가치 추정 없음: 안전마진 미산정'); return out; }
    var s = v.scenarios || {}, names = ['conservative', 'base', 'optimistic'];
    var u = v.units || {}, unitsOK = u.currency === currency && finite(u.moneyScale) && u.moneyScale > 0 && finite(u.shareScale) && u.shareScale > 0;
    if (!unitsOK) out.reasons.push('금액·주식수 단위 미기재 또는 통화 불일치');
    var bad = [];
    names.forEach(function (n) { scenarioReasons(n, s[n], unitsOK ? u : null).forEach(function (w) { bad.push(w); }); });
    if (bad.length) out.reasons.push('시나리오 가정 오류: ' + bad.join(', '));
    if (!bad.length && !(s.conservative.shares === s.base.shares && s.base.shares === s.optimistic.shares)) out.reasons.push('시나리오별 기준 주식수 다름');
    if (v.currency !== currency) out.reasons.push('본질가치 통화가 가격 통화와 다름');
    if (!fresh(v.asOf, now, MAX_AGE.valuation)) out.reasons.push('본질가치 기준일 누락 또는 오래됨(허용 ' + MAX_AGE.valuation + '일)');
    // 산출 계보: FCF·주식보상·순부채·주식수 각각 공시 원문 증빙이 있어야 한다.
    var lin = v.lineage || {}, linBad = LINEAGE.filter(function (k) { return evidenceListCheck(lin[k], ctx, { kind: 'filing', maxDays: MAX_AGE.evidence }).length > 0; });
    if (linBad.length) out.reasons.push('산출 계보(공시 증빙) 미충족: ' + linBad.join(', '));
    if (!bad.length && !(s.conservative.valuePerShare <= s.base.valuePerShare && s.base.valuePerShare <= s.optimistic.valuePerShare)) out.reasons.push('보수 ≤ 기준 ≤ 낙관 순서가 아님');
    if (Array.isArray(flags) && flags.length && !text(v.normalizationReason)) out.reasons.push('일회성 손익 존재: 정상화 근거 없음');
    if (v.fromDrawdown === true) out.reasons.push('가격 하락률을 본질가치로 대체할 수 없음');
    if (out.reasons.length) return out;
    out.assumptions = names.map(function (n) { var x = s[n]; return { scenario: n, method: x.method, discountRatePct: x.discountRatePct, growthPct: x.growthPct, normalizedFcf: x.normalizedFcf, stockCompensation: x.stockCompensation, dilutionPct: x.dilutionPct, netDebt: x.netDebt, shares: x.shares, recomputed: round(impliedValuePerShare(x, u), 2) }; });
    out.units = { currency: u.currency, moneyScale: u.moneyScale, shareScale: u.shareScale };
    // CR-5(지피 1128): 안전마진·구간·정렬은 엔진이 같은 가정으로 재계산한 주당가치만 쓴다. 입력 valuePerShare는 불일치 검사(5%)에만 쓴다.
    var rc = {}; names.forEach(function (n) { rc[n] = impliedValuePerShare(s[n], u); });
    if (!(rc.conservative <= rc.base && rc.base <= rc.optimistic)) { out.reasons.push('재계산 보수 ≤ 기준 ≤ 낙관 순서가 아님'); return out; }
    out.conservative = round(rc.conservative, 2); out.base = round(rc.base, 2); out.optimistic = round(rc.optimistic, 2);
    out.declared = { conservative: s.conservative.valuePerShare, base: s.base.valuePerShare, optimistic: s.optimistic.valuePerShare, use: 'mismatch-check-only' };
    out.valueBasis = 'engine-recomputed';
    if (!finite(price)) { out.reasons.push('검증된 가격 없음: 안전마진 미산정'); return out; }
    out.status = 'computed';
    // CR-8(지피 1228): 구간·D 판정·정렬은 반올림 전 원시값(marginRaw)으로 한다. marginPct(소수 1자리)는 표시 전용.
    var m = (1 - price / rc.conservative) * 100;
    out.marginRaw = m; out.marginPct = round(m, 1); out.marginUse = 'marginRaw=판정 · marginPct=표시';
    out.band = bandOf(m);
    // 입력값 기준 구간이 재계산 기준과 다르면 경계 충돌로 보고 보류한다(더 보수적). 이것도 원시값으로 비교.
    var dm = (1 - price / s.conservative.valuePerShare) * 100;
    out.declaredMarginRaw = dm; out.declaredMarginPct = round(dm, 1);
    if (bandOf(dm) !== out.band) { out.status = 'boundary-conflict'; out.reasons.push('입력 주당가치 기준 구간(' + bandOf(dm) + ' ' + round(dm, 2) + '%)이 재계산 기준 구간(' + out.band + ' ' + round(m, 2) + '%)과 다름: 경계 충돌로 판단 보류'); }
    return out;
  }

  /* 4단계 조사: 'done' 완료 주장과 검증된 근거를 구분한다. 완료 주장만으로는 ok가 되지 않는다. */
  function research(r, ctx) {
    return RESEARCH.map(function (x) {
      var o = r && r[x[0]], claimed = !!o && o.done === true;
      var why = !o ? ['조사 기록 없음'] : [];
      if (o && !claimed) why.push('완료 표시 없음');
      if (o && !text(o.summary)) why.push('요약 없음');
      if (o) evidenceListCheck(o.evidence, ctx, { kind: x[0] === 'filings' ? 'filing' : x[0], maxDays: MAX_AGE.research }).forEach(function (w) { why.push(w); });
      var ev = o && Array.isArray(o.evidence) ? o.evidence : [];
      return { id: x[0], label: x[1], claimed: claimed, ok: claimed && why.length === 0, verified: why.length === 0, reasons: why,
        asOf: ev.map(function (e) { return e && e.publishedAt; }).filter(isoDay).sort().pop() || null,
        source: ev.map(function (e) { return host(e && e.url); }).filter(Boolean).join(', ') || null };
    });
  }

  /* 6. 실행 가능성(투자 판단과 별도). 수량·주문은 만들지 않는다. */
  function accountsOK(sc) { return !!sc && sc.status === 'confirmed' && Array.isArray(sc.accounts) && sc.accounts.length > 0 && sc.accounts.every(text) && new Set(sc.accounts).size === sc.accounts.length; }
  function sameAccounts(a, b) { if (!accountsOK(a) || !accountsOK(b) || a.accounts.length !== b.accounts.length) return false; var x = a.accounts.slice().sort(), y = b.accounts.slice().sort(); return x.every(function (v, i) { return v === y[i]; }); }
  /* CR-7(지피 1128): 확신종목 25%는 순태씨가 지정한 확신종목 목록(확인됨·기준일·계좌 범위)에 이 종목이 있을 때만. 그 외는 일반 10%. */
  /* CR-10(지피 1228): 목록의 designatedBy:'user'는 호출자의 자기기재일 뿐 순태씨 승인을 증명하지 않는다.
     신뢰된 발급·보관·검증 경로(CONVICTION_TRUST)가 없으므로 실제 자료(synthetic !== true)는 목록이 있어도 항상 일반 10%.
     25%는 합성 예제에서만 동작한다(syntheticOnly 표시). */
  function convictionCheck(ctx, scope, market, ticker, now, synthetic) {
    var L = ctx.convictionList;
    if (synthetic !== true) return { ok: false, source: 'untrusted', note: (L || ctx.conviction === true ? '확신종목 지정 출처 미검증(호출자 기재는 순태씨 승인 아님, 신뢰 경로 없음)' : '확신종목 신뢰 경로 없음') + ': 일반 ' + LIMIT_OTHER + '% 적용' };
    if (!L || typeof L !== 'object') return { ok: false, note: ctx.conviction === true ? '확신종목 표시만 있고 지정 목록 없음: 일반 ' + LIMIT_OTHER + '% 적용' : '' };
    if (L.status !== 'confirmed' || L.designatedBy !== 'user') return { ok: false, note: '확신종목 목록 미확인(순태씨 지정 아님): 일반 ' + LIMIT_OTHER + '% 적용' };
    if (!isoDay(L.asOf) || Date.parse(L.asOf) > now + 60000 || age(L.asOf, now) > CONVICTION_MAX_AGE) return { ok: false, note: '확신종목 목록 기준일 없음·오래됨(허용 ' + CONVICTION_MAX_AGE + '일): 일반 ' + LIMIT_OTHER + '% 적용' };
    if (!sameAccounts(L.accountScope, scope)) return { ok: false, note: '확신종목 목록 계좌 범위가 현금·비중 범위와 다름: 일반 ' + LIMIT_OTHER + '% 적용' };
    var hit = Array.isArray(L.items) && L.items.some(function (x) { return x && x.market === market && norm(x.ticker) === norm(ticker); });
    return hit ? { ok: true, source: 'synthetic-only', note: '확신종목 목록(' + L.asOf + ') 대조 — 합성 예제 한정 25%(실제 계좌 신뢰 경로 없음)' } : { ok: false, note: '확신종목 목록에 없음: 일반 ' + LIMIT_OTHER + '% 적용' };
  }
  function executability(ctx, sector, market, now, ticker, synthetic) {
    ctx = ctx || {};
    var items = [], tradeCcy = CCY[market] || null;
    var cash = ctx.cash || {}, scope = cash.accountScope || {};
    var scopeOK = accountsOK(scope);
    var conv = convictionCheck(ctx, scope, market, ticker, now, synthetic), cap = conv.ok ? LIMIT_CONVICTION : LIMIT_OTHER;
    var cashWhy = [];
    if (cash.status !== 'verified') cashWhy.push('현금 미확인');
    if (!isoTime(cash.asOf) || Date.parse(cash.asOf) > now + 60000 || age(cash.asOf, now) > MAX_AGE.cash) cashWhy.push('현금 기준시각 없음·오래됨(허용 ' + MAX_AGE.cash + '일)');
    if (!text(cash.currency)) cashWhy.push('현금 통화 없음');
    if (!scopeOK) cashWhy.push('계좌 범위 미확인');
    var cashKnown = !cashWhy.length && finite(cash.amount);
    var cashOK = cashKnown && cash.amount > 0;
    items.push({ id: 'cash', label: '현금', status: cashOK ? 'ok' : 'blocked', note: cashOK ? '현금 확인 ' + cash.asOf + ' · ' + cash.currency + ' · 계좌 ' + scope.accounts.length + '곳' : cashKnown ? '현금 부족' : cashWhy.join(' / ') + ': 수량·주문 제안 없음' });
    // 통화: 현금과 매수 통화가 다르면 기준시각이 있는 환율 증빙 없이는 혼합 비교하지 않는다.
    var fx = ctx.fx || {}, fxOK = cashOK && cash.currency === tradeCcy;
    if (cashOK && !fxOK) fxOK = fx.base === cash.currency && fx.quote === tradeCcy && finite(fx.rate) && fx.rate > 0 && text(fx.source) && isoTime(fx.asOf) && Date.parse(fx.asOf) <= now + 60000 && age(fx.asOf, now) <= MAX_AGE.fx;
    items.push({ id: 'currency', label: '통화 일치', status: !cashOK ? 'unknown' : fxOK ? 'ok' : 'unknown', note: !cashOK ? '현금 미확인' : cash.currency === tradeCcy ? '현금·매수 통화 ' + tradeCcy : fxOK ? cash.currency + '→' + tradeCcy + ' 환율 ' + fx.asOf + ' 기준(수량 계산 아님)' : cash.currency + ' 현금·' + tradeCcy + ' 가격: 환율 증빙 없어 비교 안 함' });
    var floor = ctx.emergencyFloor || {};
    var floorSet = floor.status === 'set' && finite(floor.amount) && floor.amount >= 0 && text(floor.currency);
    var floorComparable = floorSet && cashOK && floor.currency === cash.currency;
    items.push({ id: 'emergency', label: '비상현금 하한', status: !floorSet ? 'unknown' : !cashKnown ? 'unknown' : !floorComparable && cashOK ? 'unknown' : cashOK && cash.amount > floor.amount ? 'ok' : 'blocked',
      note: !floorSet ? '하한 미확정(순태씨 결정 필요)' : !cashKnown ? '현금 미확인: 하한 비교 불가' : !floorComparable && cashOK ? '하한 통화(' + floor.currency + ')와 현금 통화(' + cash.currency + ') 다름: 비교 안 함' : cashOK && cash.amount > floor.amount ? '하한 위 여유 있음' : '현금이 하한 이하' });
    // 비중은 0~100% 값이고, 그 계산 계좌 범위가 현금 계좌 범위와 같아야 한다(다른 계좌 비중 혼용 금지).
    var w = ctx.weightPct, wScopeOK = sameAccounts(ctx.weightScope, scope), wBad = finite(w) && (w < 0 || w > 100);
    var capStatus = wBad ? 'blocked' : !finite(w) || !wScopeOK ? 'unknown' : w >= cap ? 'blocked' : 'ok';
    var capNote = wBad ? '비중 값 오류(' + w + '%): 0~100% 밖' : !finite(w) ? '현재 비중 미확인' : !wScopeOK ? '비중 계좌 범위 미확인 또는 현금 계좌 범위와 다름' : w >= cap ? '상한 도달·초과(' + round(w) + '%)' : '여유 ' + round(cap - w) + '%p(수량 아님)';
    if (conv.note) capNote += ' · ' + conv.note;
    items.push({ id: 'cap', label: '보유비중 상한 ' + cap + '%', status: capStatus, note: capNote, conviction: conv.ok, convictionSource: conv.source || null });
    var sw = ctx.sectorWeightPct, overlap = Array.isArray(ctx.sameSectorHoldings) ? ctx.sameSectorHoldings.filter(text) : [];
    items.push({ id: 'sector', label: '업종 중복', status: !text(sector) || !finite(sw) ? 'unknown' : overlap.length ? 'warn' : 'ok', note: !text(sector) || !finite(sw) ? '업종·업종 비중 미확인' : overlap.length ? sector + ' 기존 보유 ' + overlap.join(', ') + ' · 업종 ' + round(sw) + '%' : '같은 업종 보유 없음' });
    var blocked = items.some(function (x) { return x.status === 'blocked'; }), unknown = items.some(function (x) { return x.status === 'unknown'; });
    return { status: blocked ? 'blocked' : unknown ? 'unconfirmed' : 'checks-ok', cap: cap, items: items, quantity: null, order: null };
  }

  function evaluate(input, nowISO) {
    var d = clone(input) || {}, now = Date.parse(nowISO), reasons = [];
    var validNow = typeof nowISO === 'string' && /T/.test(nowISO) && finite(now);
    var schemaOK = validNow && d.contract === CONTRACT && ['KR', 'US'].includes(d.market) && text(d.ticker);
    if (!schemaOK) reasons.push('입력 계약·시장·종목·판정 시각 확인 필요');
    var nowV = validNow ? now : 0;
    var ectx = { market: d.market, ticker: d.ticker, synthetic: d.synthetic === true, now: nowV };
    var price = screenPrice(d.price, d.market, nowV, ectx.synthetic);
    var currency = CCY[d.market] || null;
    var flags = Array.isArray(d.earningsFlags) ? d.earningsFlags.filter(text) : [];
    var val = valuation(d.valuation, price.status === 'fail-closed' ? null : d.price.close, currency, nowV, flags, ectx);
    var g = d.gates || {};
    var gates = GATES.map(function (x) { return gate(x[0], x[1], g[x[0]], ectx); });
    // D는 엔진이 계산한 안전마진과 일치해야 한다. 호출자의 PASS만으로 통과하지 않는다.
    var D = gates[3];
    if (val.status === 'boundary-conflict') { D.status = 'UNKNOWN'; D.reason = '안전마진 경계 충돌: ' + val.reasons.join(' / '); }
    else if (val.status !== 'computed') { D.status = 'UNKNOWN'; D.reason = '안전마진 미산정: ' + val.reasons.join(' / '); }
    else if (!atLeast(val.marginRaw, MOS_BANDS.CONDITIONAL)) { D.status = 'FAIL'; D.reason = '보수적 가치 대비 안전마진 ' + round(val.marginRaw, 2) + '% (< ' + MOS_BANDS.CONDITIONAL + '%)'; }
    else if (val.band === 'value-trap-check' && !(d.valueTrapReview && evidenceOK(d.valueTrapReview.evidence, ectx) && d.valueTrapReview.status === 'PASS')) { D.status = 'UNKNOWN'; D.reason = '안전마진 ' + val.marginPct + '%: 40% 이상은 가치함정 재검증 필요'; }
    else if (D.status !== 'PASS') { D.reason = D.reason || '안전마진 가정 근거 미확인'; }
    // C: 일회성 손익이 있으면 정상화 근거가 필요.
    if (flags.length && gates[2].status === 'PASS' && !(d.valuation && text(d.valuation.normalizationReason))) { gates[2].status = 'UNKNOWN'; gates[2].reason = '일회성 손익(' + flags.join(', ') + ') 정상화 근거 없음'; }
    // E: 반론이 없으면 PASS 불가.
    var counter = Array.isArray(d.counterArguments) ? d.counterArguments.filter(text) : [];
    var invalidation = Array.isArray(d.invalidation) ? d.invalidation.filter(text) : [];
    if (gates[4].status === 'PASS' && !counter.length) { gates[4].status = 'UNKNOWN'; gates[4].reason = '반론 검증 기록 없음'; }
    var rf = d.riskFlags || {}, riskList = ['accounting', 'liquidity', 'structural'].filter(function (k) { return rf[k] === true; });
    var riskLabels = { accounting: '회계 악화', liquidity: '유동성·차입 위험', structural: '구조적 악화' };
    var res = research(d.research, ectx), researchOK = res.every(function (x) { return x.ok; });

    var state = STATES.HOLD;
    if (!schemaOK) reasons.push('기본 정보 오류: 판단 보류');
    else if (riskList.length || gates[1].status === 'FAIL') { state = STATES.RISK; reasons.push('위험: ' + (riskList.map(function (k) { return riskLabels[k]; }).join(', ') || '유동성·차입 게이트 FAIL')); }
    else if (price.status === 'fail-closed') reasons.push('가격 증거 fail-closed: ' + price.reasons.join(' / '));
    else if (price.status === 'not-fear') { state = STATES.OBSERVE; reasons.push(price.reasons[price.reasons.length - 1]); }
    else if (gates.some(function (x) { return x.status === 'UNKNOWN'; })) reasons.push('미확인 게이트: ' + gates.filter(function (x) { return x.status === 'UNKNOWN'; }).map(function (x) { return x.id; }).join(', '));
    else if (gates.some(function (x) { return x.status === 'FAIL'; })) { state = STATES.OBSERVE; reasons.push('FAIL 게이트: ' + gates.filter(function (x) { return x.status === 'FAIL'; }).map(function (x) { return x.id + ' ' + x.label; }).join(', ')); }
    else if (!researchOK) reasons.push('4단계 조사 미완료·근거 미검증: ' + res.filter(function (x) { return !x.ok; }).map(function (x) { return x.label + (x.claimed ? '(완료 주장, 근거 미검증)' : ''); }).join(', '));
    else if (!counter.length || !invalidation.length) reasons.push('반론·무효화 조건 없음');
    else { state = val.band === 'conditional' ? STATES.CONDITIONAL : STATES.HIGH; reasons.push('5게이트 PASS · 가격 증거 · 4단계 조사 완료 · 안전마진 ' + val.marginPct + '%'); }

    // CR-6(지피 1128) 실제 자료 잠금: synthetic !== true 이면 매수 검토 두 상태를 무조건 만들지 않는다.
    if (REAL_DATA_LOCK && d.synthetic !== true && (state === STATES.CONDITIONAL || state === STATES.HIGH)) { state = STATES.HOLD; reasons.push('실제 자료 잠금: 신뢰된 G0/SEC/DART 검증 단계와 순태씨 별도 승인 전에는 매수 검토 상태를 만들지 않음'); }
    else if (REAL_DATA_LOCK && d.synthetic !== true && state === STATES.HOLD) reasons.push('실제 자료 잠금(매수 검토 상태 금지)');
    var buyState = state === STATES.CONDITIONAL || state === STATES.HIGH;
    var exec = executability(d.context, d.sector, d.market, nowV, d.ticker, d.synthetic === true);
    var freshness = [d.price && d.price.asOf].concat(gates.map(function (x) { return x.evidence.map(function (e) { return e && e.publishedAt; }); }).reduce(function (a, b) { return a.concat(b); }, []), res.map(function (x) { return x.asOf; }), [d.valuation && d.valuation.asOf]).filter(isoDay).sort();
    var result = {
      contract: CONTRACT, market: d.market || null, ticker: d.ticker || null, name: text(d.name) ? d.name : null, sector: text(d.sector) ? d.sector : null,
      synthetic: d.synthetic === true, evaluatedAt: validNow ? nowISO : null,
      state: state, buyReview: buyState, reasons: reasons,
      price: price, gates: gates, valuation: val, research: res,
      counterArguments: counter, invalidation: invalidation, riskFlags: riskList,
      executability: exec, evidenceOldest: freshness[0] || null, evidenceNewest: freshness[freshness.length - 1] || null,
      disclaimer: (state === STATES.HIGH ? "'높은 확신'은 수익 보장이 아닙니다. " : '') + '자동주문이 아닌 정보 제공이며 최종 결정은 순태씨가 합니다.'
    };
    // CR-9(지피 1228): 엔진이 발급한 결과만 후보·알림 대상. 발급 당시 판정 사본을 모듈 내부에 보관해 사후 위조를 걸러낸다.
    ISSUED.set(result, { state: state, buyReview: buyState, synthetic: d.synthetic === true, market: result.market, ticker: result.ticker, marginRaw: val.marginRaw, evaluatedAt: result.evaluatedAt });
    return result;
  }

  /* CR-9: 후보·알림 경로의 독립 fail-closed 검사. 임의 객체·변조된 결과·실제 자료(synthetic !== true)는 결과의 buyReview/state 자기선언과 무관하게 제외. */
  var ISSUED = new WeakMap();
  function issued(r) {
    var t = r && typeof r === 'object' ? ISSUED.get(r) : null;
    if (!t) return null;
    if (r.state !== t.state || r.buyReview !== t.buyReview || r.synthetic !== t.synthetic || r.market !== t.market || r.ticker !== t.ticker) return null;
    return t;
  }
  function eligible(r) {
    var t = issued(r);
    if (!t || t.buyReview !== true || !(t.state === STATES.CONDITIONAL || t.state === STATES.HIGH) || !finite(t.marginRaw)) return false;
    if (REAL_DATA_LOCK && t.synthetic !== true) return false;
    return true;
  }

  /* 7. 오늘의 매수 검토 후보(최대 5개): 매수 검토 상태만, 상태 순위 → 안전마진 순. */
  function shortlist(results) {
    var seen = {};
    return (Array.isArray(results) ? results : []).filter(eligible)
      .slice().sort(function (a, b) { var x = ISSUED.get(a), y = ISSUED.get(b); return RANK[y.state] - RANK[x.state] || y.marginRaw - x.marginRaw || String(a.ticker).localeCompare(String(b.ticker)); })
      .filter(function (r) { var k = key(r); if (seen[k]) return false; seen[k] = true; return true; })
      .slice(0, SHORTLIST);
  }

  /* 8. 알림: 처음 매수 검토가 되었거나 상태가 올라간 종목만. 같은 종목·같은 상태를 매일 새로 포장하지 않는다. */
  function key(r) { return String(r.market) + ':' + String(r.ticker).trim().toUpperCase(); }
  function notifyPlan(current, previous) {
    var prev = previous && typeof previous === 'object' ? previous : {}, fresh = [], top = shortlist(current);
    top.forEach(function (r) {
      var p = prev[key(r)];
      if (!p || !(RANK[p.state] >= RANK[r.state])) fresh.push({ key: key(r), state: r.state, previousState: p ? p.state : null, marginPct: r.valuation.marginPct });
    });
    var next = {};
    Object.keys(prev).forEach(function (k) { next[k] = prev[k]; });
    // 매수 검토에서 내려간 종목은 낮아진 상태로 기록해, 나중에 다시 조건을 충족하면 그때 한 번 알린다.
    (Array.isArray(current) ? current : []).forEach(function (r) { var t = issued(r); if (t && !t.buyReview && next[key(r)]) next[key(r)] = { state: r.state, evaluatedAt: r.evaluatedAt }; });
    top.forEach(function (r) { next[key(r)] = { state: r.state, evaluatedAt: r.evaluatedAt }; });
    return { notify: fresh.length > 0, items: fresh, ledger: next };
  }

  return Object.freeze({ CONTRACT: CONTRACT, STATES: STATES, GATES: GATES, MOS_BANDS: MOS_BANDS, PRICE_BANDS: PRICE_BANDS, LIMIT_CONVICTION: LIMIT_CONVICTION, LIMIT_OTHER: LIMIT_OTHER, SHORTLIST: SHORTLIST, MAX_AGE: MAX_AGE, TRUST: TRUST, REAL_DATA_LOCK: REAL_DATA_LOCK, CONVICTION_MAX_AGE: CONVICTION_MAX_AGE, CONVICTION_TRUST: CONVICTION_TRUST, VAL_RANGE: VAL_RANGE, CROSS_TOL_PCT: CROSS_TOL_PCT, VALUE_TOL_PCT: VALUE_TOL_PCT,
    impliedValuePerShare: impliedValuePerShare, evidenceCheck: evidenceCheck,
    screenPrice: screenPrice, evaluate: evaluate, shortlist: shortlist, notifyPlan: notifyPlan });
});
