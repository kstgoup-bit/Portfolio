/* HAS 24단계 — 조언의 "근거 없는 수치" 차단(순수 함수). 외부 AI(예: Gemini) 출력이든 규칙 엔진 출력이든 표시 전에 통과해야 한다.
   ① 근거(facts·조건·보유 정보)에 없는 숫자가 이유·추정·위험 문장에 나오면 거절 ② 근거 없는 '목표가·기대수익률' 표현 거절
   ③ 확인된 사실(facts)과 추정(estimates)이 섞이면 거절. validateAdvice(23단계)를 먼저 적용한다. */
(function (root, factory) { if (typeof module === 'object' && module.exports) module.exports = factory(require('./advisor-core.js')); else root.HASAdviceGuard = factory(root.HASAdvisorCore); })(typeof globalThis !== 'undefined' ? globalThis : this, function (Core) {
  'use strict';
  var NUM = /-?\d[\d,]*\.?\d*/g;
  var TARGET = /목표\s*(주)?가|적정\s*(주)?가|기대\s*수익|예상\s*수익|\d+\s*%\s*(상승|수익)\s*(예상|전망|가능)|(곧|반드시|확실히)\s*(오를|상승)/;
  function nums(text) { var m = String(text || '').match(NUM) || []; return m.map(function (x) { return Number(x.replace(/,/g, '')); }).filter(function (x) { return isFinite(x); }); }
  function txt(x) { return typeof x === 'string' ? x : (x && typeof x.text === 'string' ? x.text : ''); }
  function allowed(a) {
    var set = {}, add = function (s) { nums(s).forEach(function (n) { set[Math.abs(n)] = 1; }); };
    (a.facts || []).forEach(function (f) { add(txt(f)); }); if (a.conditions) [].concat(a.conditions.buyReview || [], a.conditions.sellReview || []).forEach(add);
    if (a.holding) { add(a.holding.weightPct); add(a.holding.cashPct); } (a.checks || []).forEach(add); if (a.dataQuality) (a.dataQuality.why || []).forEach(add);
    return set;
  }
  function validateGrounding(a) {
    var e = [], ok = allowed(a);
    ['reasonsFor', 'reasonsAgainst', 'estimates', 'risks'].forEach(function (k) {
      (a[k] || []).forEach(function (item) {
        var s = txt(item);
        if (TARGET.test(s)) e.push(k + ': 근거 없는 목표가·기대수익 표현 — ' + s.slice(0, 40));
        nums(s).forEach(function (n) { if (!ok[Math.abs(n)] && !(n >= 1 && n <= 3 && Number.isInteger(n))) e.push(k + ': 근거에 없는 수치 ' + n + ' — ' + s.slice(0, 40)); });
      });
    });
    (a.facts || []).forEach(function (f) { if (/추정(치|됨|한다|된다)|예상|전망|것으로 보인다|가능성/.test(txt(f))) e.push('facts에 추정 표현이 섞임 — ' + txt(f).slice(0, 40)); });
    return e;
  }
  function guard(a, nowISO) { var v = Core.validateAdvice(a, nowISO), e = v.errors.slice(); if (a && typeof a === 'object') e = e.concat(validateGrounding(a)); return { ok: e.length === 0, errors: e }; }
  return Object.freeze({ validateGrounding: validateGrounding, guard: guard });
});
