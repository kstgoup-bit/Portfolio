/* DART(OpenDART) 연간 재무 → fundamental-filter normalize() 모양 변환. 순수 계산 모듈(네트워크·저장소·키 없음).
 * 입력은 호출자가 가져다 준 '단일회사 전체 재무제표(fnlttSinglAcntAll)' 응답 모양 JSON뿐이다. 이 모듈은 아무것도 호출하지 않는다.
 * 규격 근거(검증 수준): 공식 안내 페이지(opendart.fss.or.kr/guide)는 2026-11-26 이 환경에서 열지 못했다(robots 읽기 실패).
 *   확인한 것은 제3자 문서 2건(k-skill k-dart.md, AlgoLab 블로그 2026-09-24)이 서로 일치하는 항목뿐이다 → 아래 규격은 '미검증 추정'이며
 *   순태씨 또는 지피가 공식 문서로 대조하기 전까지 운영 연결 금지. 대조할 항목: reprt_code 11011(사업보고서), fs_div CFS/OFS,
 *   list[] 필드(rcept_no·reprt_code·bsns_year·corp_code·sj_div·account_id·account_nm·account_detail·thstrm_amount·currency),
 *   status '000'(정상)·'013'(자료 없음), 금액이 문자열(쉼표 포함)·"-"·""로 올 수 있음, account_id가 표준 XBRL ID 또는 "-".
 * 원칙(SEC 어댑터와 동일): 실패하면 값을 추측하지 않고 그 해를 빼거나 전체를 거부한다(fail closed). 계정은 account_id로만 고르고
 *   이름(account_nm) 일치로 고르지 않는다. 같은 항목에 서로 다른 금액이 둘 이상이면 충돌로 보고 값을 비운다.
 * 한계(1단계): 부채(debt)·이자비용은 DART 표준 ID가 불명확해 비운다(null) → 해당 판정은 '제외'로 남는다. 분기·TTM 없음.
 * 투자 자문 아님. 합성(synthetic) 입력은 가상 자료이며 DART 근거가 아니다. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASDartFacts = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var VERSION = 'has-fundamental-v1'; // fundamental-filter VERSION과 같아야 validNormalized 통과(시험이 대조)
  var MAX_YEARS = 5, MAX_ROWS = 4000;
  // field → [허용 sj_div, 허용 account_id 목록]. account_detail이 '-'(또는 빈 값)인 행만 쓴다(세부 항목·부문 행 제외).
  var SPECS = {
    revenue: [['IS', 'CIS'], ['ifrs-full_Revenue']],
    operatingIncome: [['IS', 'CIS'], ['dart_OperatingIncomeLoss']],
    netIncome: [['IS', 'CIS'], ['ifrs-full_ProfitLoss']],
    ocf: [['CF'], ['ifrs-full_CashFlowsFromUsedInOperatingActivities']],
    capex: [['CF'], ['ifrs-full_PurchaseOfPropertyPlantAndEquipmentClassifiedAsInvestingActivities']],
    equity: [['BS'], ['ifrs-full_Equity']],
    cash: [['BS'], ['ifrs-full_CashAndCashEquivalents']]
  };
  var NOTICE = '미검증 변환 초안: 공식 규격 대조 전. DART 응답을 호출자가 제공했다는 사실만 있고 원문 일치는 확인되지 않았다. 부채·이자비용은 비어 있다.';
  function own(o, k) { return Object.prototype.hasOwnProperty.call(o, k); }
  function plain(o) { return o !== null && typeof o === 'object' && !Array.isArray(o); }
  function day(s) { return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && Number.isFinite(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s; }
  function amount(x) {
    if (typeof x !== 'string') return undefined;                        // 숫자 자료형·undefined는 DART 모양이 아님 → 거부
    var t = x.trim();
    if (t === '' || t === '-') return null;                              // 값 없음
    if (!/^-?(\d{1,3}(,\d{3})+|\d+)$/.test(t)) return undefined;        // 괄호·소수·단위 글자 등은 해석하지 않음
    var n = Number(t.replace(/,/g, ''));
    return Number.isSafeInteger(n) ? n : undefined;
  }
  function synthMark(x) { return typeof x === 'string' && /synthetic|invented|not a real issuer|가상|합성|발명/i.test(x); }
  function markedSynthetic(x, depth) {
    if (depth > 8 || x === null || typeof x !== 'object') return false;
    return Object.keys(x).some(function (k) {
      var v = x[k];
      return (k === 'synthetic' && v === true) || (typeof v === 'string' && synthMark(v)) || (v !== null && typeof v === 'object' && markedSynthetic(v, depth + 1));
    });
  }
  function fail(reason, issues) { return { ok: false, reason: reason, issues: issues || [], notice: NOTICE }; }
  function filedOf(rcept) { // rcept_no는 14자리, 앞 8자리가 접수일(제3자 문서 설명 — 공식 대조 필요). 날짜가 아니면 거부.
    if (typeof rcept !== 'string' || !/^\d{14}$/.test(rcept)) return null;
    var d = rcept.slice(0, 4) + '-' + rcept.slice(4, 6) + '-' + rcept.slice(6, 8);
    return day(d) ? d : null;
  }
  function pickField(rows, field) { // → {val, conflict, ids}
    var spec = SPECS[field], seen = [], ids = {};
    rows.forEach(function (r) {
      if (spec[0].indexOf(r.sj_div) < 0 || spec[1].indexOf(r.account_id) < 0) return;
      if (!(r.account_detail === undefined || r.account_detail === '-' || r.account_detail === '')) return;
      var a = amount(r.thstrm_amount);
      if (a === undefined) { seen.push({ bad: true }); return; }
      seen.push({ val: a, id: r.account_id });
    });
    if (!seen.length) return { val: null, conflict: false };
    if (seen.some(function (s) { return s.bad; })) return { val: null, conflict: true, candidates: [] };
    var vals = seen.map(function (s) { return s.val; });
    var nn = vals.filter(function (v) { return v !== null; });
    if (!nn.length) return { val: null, conflict: false };
    if (nn.some(function (v) { return v !== nn[0]; })) return { val: null, conflict: true, candidates: nn.slice(0, 4) };
    seen.forEach(function (s) { if (s.id) ids[s.id] = 1; });
    return { val: nn[0], conflict: false, ids: Object.keys(ids) };
  }
  /* input = {version:1, mode:'synthetic'|'imported',
   *   instrument:{ticker:'005930', market:'KR', currency:'KRW'},
   *   corp:{corpCode:'8자리', name:'...', fiscalYearEnd:'12-31'},
   *   identityReview:{reviewed:true, ticker, corpCode, reviewedOn:'YYYY-MM-DD'},   // 종목코드↔corp_code 사람 확인(추정 금지)
   *   reports:[{bsnsYear:'2025', fsDiv:'CFS', response:{status:'000', list:[...]}}, ...]}  */
  function toNormalized(input, nowISO) {
    var issues = [];
    function issue(code, year) { issues.push({ code: code, year: year || null }); }
    if (!plain(input) || input.version !== 1 || ['synthetic', 'imported'].indexOf(input.mode) < 0) return fail('invalid-envelope');
    if (typeof nowISO !== 'string' || !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?Z$/.test(nowISO) || !day(nowISO.slice(0, 10))) return fail('invalid-now');
    var today = nowISO.slice(0, 10);
    if (input.mode === 'imported' && markedSynthetic(input, 0)) return fail('synthetic-origin-mismatch');
    var inst = input.instrument, corp = input.corp, rev = input.identityReview;
    if (!plain(inst) || typeof inst.ticker !== 'string' || !/^[0-9A-Z]{6}$/.test(inst.ticker) || inst.market !== 'KR' || inst.currency !== 'KRW') return fail('invalid-instrument');
    if (!plain(corp) || typeof corp.corpCode !== 'string' || !/^\d{8}$/.test(corp.corpCode) || typeof corp.name !== 'string' || !corp.name.trim() || corp.name.length > 120) return fail('invalid-corp');
    // 12월 결산이 아닌 회사는 1단계에서 지원하지 않는다(결산일을 응답에서 읽을 수 없음).
    if (corp.fiscalYearEnd !== '12-31') return fail('fiscal-year-end-unsupported');
    if (!plain(rev) || rev.reviewed !== true || rev.ticker !== inst.ticker || rev.corpCode !== corp.corpCode || !day(rev.reviewedOn) || rev.reviewedOn > today) return fail('identity-review-required');
    if (!Array.isArray(input.reports) || input.reports.length < 1 || input.reports.length > MAX_YEARS) return fail('report-count');
    var byYear = {}, dupYears = {};
    input.reports.forEach(function (rp) { if (plain(rp) && typeof rp.bsnsYear === 'string') { if (own(byYear, rp.bsnsYear)) dupYears[rp.bsnsYear] = 1; byYear[rp.bsnsYear] = rp; } });
    var years = [];
    input.reports.forEach(function (rp) {
      var y = plain(rp) && typeof rp.bsnsYear === 'string' ? rp.bsnsYear : null;
      if (!y || !/^20\d{2}$/.test(y)) { issue('invalid-year', y); return; }
      if (own(dupYears, y)) { issue('duplicate-year', y); return; }
      if (rp.fsDiv !== 'CFS') { issue('consolidated-required', y); return; }   // 개별(OFS)은 연결과 섞이지 않게 1단계에서 받지 않음
      var resp = rp.response;
      if (!plain(resp) || resp.status !== '000' || !Array.isArray(resp.list)) { issue(plain(resp) && resp.status === '013' ? 'no-data' : 'bad-status', y); return; }
      if (resp.list.length < 1 || resp.list.length > MAX_ROWS || !resp.list.every(plain)) { issue('row-limit-or-shape', y); return; }
      var end = y + '-12-31';
      if (end >= today) { issue('year-not-ended', y); return; }
      var rows = resp.list, filed = null, ok = true;
      rows.forEach(function (r) {
        if (r.corp_code !== corp.corpCode || r.bsns_year !== y || r.reprt_code !== '11011' || (r.currency !== undefined && r.currency !== 'KRW')) ok = false;
        var f = filedOf(r.rcept_no);
        if (f === null) ok = false; else if (filed === null) filed = f; else if (f !== filed) ok = false; // 한 보고서 안 접수번호가 다르면 거부
      });
      if (!ok || filed === null) { issue('identity-or-report-mismatch', y); return; }
      if (filed < end || filed > today) { issue('filed-date-invalid', y); return; }
      var rec = { end: end, filed: filed, revenue: null, operatingIncome: null, netIncome: null, ocf: null, capex: null, interest: null, equity: null, cash: null, debt: null, sources: {}, conflicts: [] };
      Object.keys(SPECS).forEach(function (k) {
        var p = pickField(rows, k);
        if (p.conflict) { rec.conflicts.push({ field: k, candidates: (p.candidates || []).map(function (v) { return { tag: SPECS[k][1][0], val: v, filed: filed, accn: null }; }) }); return; }
        if (p.val === null) return;
        var v = p.val;
        if (k === 'capex') v = Math.abs(v); // 부호 표기가 보고서마다 다를 수 있어 '지출 크기'로 통일(공식 확인 필요). 원 단위 정수.
        rec[k] = v;
        rec.sources[k] = { tag: p.ids[0], filed: filed, accn: rows[0].rcept_no, agree: p.ids.slice(1) };
      });
      if (rec.revenue === null && rec.netIncome === null) { issue('no-core-metrics', y); return; }
      years.push(rec);
    });
    years.sort(function (a, b) { return a.end < b.end ? 1 : -1; });
    if (!years.length) return fail('no-usable-year', issues);
    return {
      ok: true, version: VERSION, financial: false, cik: null, name: (input.mode === 'synthetic' ? 'SYNTHETIC ' : '') + corp.name.trim(), ticker: inst.ticker,
      years: years.slice(0, MAX_YEARS), source: 'DART', corpCode: corp.corpCode, synthetic: input.mode === 'synthetic', verification: 'unverified',
      issues: issues, notice: NOTICE
    };
  }
  return Object.freeze({ VERSION: VERSION, toNormalized: toNormalized });
});
