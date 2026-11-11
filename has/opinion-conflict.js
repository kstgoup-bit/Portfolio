/* HAS 25단계 — 규칙 엔진 의견 vs 사용자가 직접 붙여 넣은 외부(Gemini 등) 의견의 충돌 표시(순수 함수). 외부 AI를 호출하지 않는다.
   외부 문장의 의견은 단어로 해석하고(해석 못 하면 '해석 불가'), 규칙 엔진 자료에 없는 숫자는 '확인되지 않은 수치'로 분리해 사실처럼 보이지 않게 한다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(); else root.HASOpinionConflict = factory(); })(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  var NUM = /-?\d[\d,]*\.?\d*/g;
  function nums(t) { return (String(t || '').match(NUM) || []).map(function (x) { return Number(x.replace(/,/g, '')); }).filter(function (x) { return isFinite(x); }); }
  function parseOpinion(text) {
    var t = String(text || ''), hit = [];
    if (/비중\s*(을\s*)?(축소|줄)|매도|팔|정리/.test(t)) hit.push('비중 축소 검토');
    if (/매수|사도|추가\s*매입|담/.test(t) && !/매수\s*(하지|금지|보류)/.test(t)) hit.push('매수 검토');
    if (/보유\s*(유지|하)|유지|들고/.test(t)) hit.push('보유');
    if (/보류|관망|판단\s*어렵|불확실/.test(t)) hit.push('판단 보류');
    var u = hit.filter(function (x, i) { return hit.indexOf(x) === i; });
    return u.length === 1 ? { ok: true, opinion: u[0] } : { ok: false, opinion: null, candidates: u };
  }
  /* advice: advisor 결과 한 건(없으면 null). ruleFacts: 규칙 엔진이 가진 숫자 출처 문자열들. */
  function compare(advice, externalText) {
    var out = { status: 'none', rule: advice ? advice.opinion : null, external: null, ungroundedNumbers: [], message: '' };
    if (!externalText || !String(externalText).trim()) { out.message = '붙여 넣은 외부 의견이 없습니다.'; return out; }
    var ext = parseOpinion(externalText); out.external = ext.opinion;
    var ok = {}; if (advice) { (advice.facts || []).forEach(function (f) { nums(f.text).forEach(function (n) { ok[Math.abs(n)] = 1; }); }); [].concat(advice.conditions && advice.conditions.buyReview || [], advice.conditions && advice.conditions.sellReview || []).forEach(function (s) { nums(s).forEach(function (n) { ok[Math.abs(n)] = 1; }); }); if (advice.holding) { [advice.holding.weightPct, advice.holding.cashPct].forEach(function (n) { if (typeof n === 'number') ok[Math.abs(n)] = 1; }); } }
    out.ungroundedNumbers = nums(externalText).filter(function (n) { return !ok[Math.abs(n)]; }).filter(function (n, i, a) { return a.indexOf(n) === i; });
    if (!advice) { out.status = 'no-rule'; out.message = '규칙 엔진 결과가 없어 비교할 수 없습니다.'; return out; }
    if (!ext.ok) { out.status = 'unparsed'; out.message = '외부 의견의 결론을 단어로 해석하지 못했습니다(' + (ext.candidates.length ? '여러 결론이 섞임: ' + ext.candidates.join(', ') : '결론 단어 없음') + '). 비교하지 않습니다.'; return out; }
    if (ext.opinion === advice.opinion) { out.status = 'agree'; out.message = '규칙 엔진과 외부 의견이 같은 결론(' + ext.opinion + ')입니다. 다만 외부 의견의 수치는 아래처럼 별도 확인이 필요합니다.'; }
    else { out.status = 'conflict'; out.message = '충돌: 규칙 엔진은 \'' + advice.opinion + '\', 외부 의견은 \'' + ext.opinion + '\'입니다. 규칙 엔진 근거는 ' + (advice.reasonsFor.concat(advice.reasonsAgainst)[0] || '없음') + ' 입니다. 최종 판단은 직접 하십시오.'; }
    return out;
  }
  return Object.freeze({ parseOpinion: parseOpinion, compare: compare });
});
